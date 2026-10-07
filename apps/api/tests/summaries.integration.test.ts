import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import request from 'supertest';
import {Router} from 'express';
import {pino} from 'pino';
import {createDatabase} from '../src/connections.js';
import {createStore} from '../src/store.js';
import {createInvestigations} from '../src/investigations.js';
import {createSummaries} from '../src/summaries.js';
import {createAuth,hashPassword} from '../src/auth.js';
import {createApp} from '../src/app.js';
import {domainRoutes} from '../src/routes.js';
import {demoFixtures} from '../src/fixtures.js';
import {reservationMicros,costMicros,type ProviderReply} from '../src/summary-contract.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!new URL(url).pathname.endsWith('_test'))throw new Error('Use an isolated database ending in _test.');
const good:ProviderReply={status:'COMPLETED',summary:{findings:[{text:'The deterministic finding reports a missing settlement.',evidenceIds:['finding']}],suggestedChecks:[{text:'Check the settlement source for the referenced payment.',evidenceIds:['finding']}],uncertainties:['The reason for the missing settlement is unknown.']},usage:{inputTokens:1000,outputTokens:200},error:null};
describe.skipIf(!url)('AI budgets and summaries with simulated provider only',()=>{
 let db:ReturnType<typeof createDatabase>;let store:ReturnType<typeof createStore>;let service:ReturnType<typeof createSummaries>;let caseId:string;let actor:{id:string;label:string};let hash:string;let hashed:string;
 const provider=vi.fn<()=>Promise<ProviderReply>>();
 beforeAll(async()=>{db=createDatabase(url!,Number(process.env.TEST_DATABASE_POOL_SIZE??5));hashed=await hashPassword('test-password');});
 beforeEach(async()=>{
  await db.$executeRawUnsafe('TRUNCATE "AiRequest", "AuditEvent", "InvestigationNote", "Investigation", "Session", "LoginThrottle", "User", "ReconciliationItem", "ReconciliationRun", "LedgerRecord", "ImportRow", "ImportBatch" CASCADE');
  await db.aiBudget.update({where:{id:'project'},data:{spentMicros:0,reservedMicros:0,limitMicros:1000000}});
  const user=await db.user.create({data:{email:'op@test.local',displayName:'Operator',role:'OPERATOR',passwordHash:hashed}});actor={id:user.id,label:user.displayName};
  store=createStore(db);const fixtures=demoFixtures();for(const kind of ['PAYMENT','SETTLEMENT','REFUND'] as const){const batch=await store.submit(kind,`${kind}.csv`,fixtures[kind]);await store.process(batch.id);}await store.run();
  caseId=(await db.investigation.findUniqueOrThrow({where:{transactionRef:'DEMO-P002'}})).id;
  provider.mockReset();provider.mockResolvedValue(structuredClone(good));service=createSummaries(db,provider,true);hash=(await service.view(caseId)).sourceHash!;
 });
 afterAll(async()=>{await db?.$disconnect();});
 const input=(source=hash,regenerate=false)=>({requestId:randomUUID(),sourceHash:source,regenerate});
 it('is disabled without a live configuration and reserves nothing',async()=>{
  await expect(createSummaries(db,provider,false).generate(caseId,input(),actor)).rejects.toThrow('disabled');expect(provider).not.toHaveBeenCalled();expect((await service.budget()).reservedMicros).toBe(0);
 });
 it('saves a cited summary, exact token cost, and audit events without financial or workflow writes',async()=>{
  const financial=await db.reconciliationItem.findMany({orderBy:{id:'asc'}});const workflow=await db.investigation.findUnique({where:{id:caseId}});
  const result=await service.generate(caseId,input(),actor);expect(result.request.status).toBe('SUCCEEDED');expect(result.request.inputTokens).toBe(1000);
  expect((await service.budget()).spentMicros).toBe(costMicros(1000,200));expect((await service.budget()).reservedMicros).toBe(0);
  expect(await db.reconciliationItem.findMany({orderBy:{id:'asc'}})).toEqual(financial);expect(await db.investigation.findUnique({where:{id:caseId}})).toEqual(workflow);
  expect(await db.auditEvent.count({where:{entityId:caseId,action:{startsWith:'AI_SUMMARY_'}}})).toBe(2);
 });
 it('reuses both request identity and a saved summary without another paid call',async()=>{
  const original=input();const first=await service.generate(caseId,original,actor);
  expect((await service.generate(caseId,original,actor)).request.id).toBe(first.request.id);
  expect((await service.generate(caseId,input(),actor)).request.id).toBe(first.request.id);expect(provider).toHaveBeenCalledTimes(1);
 });
 it('regenerates only on an explicit request and accounts for both calls',async()=>{
  await service.generate(caseId,input(),actor);await service.generate(caseId,input(hash,true),actor);expect(provider).toHaveBeenCalledTimes(2);expect((await service.budget()).spentMicros).toBe(2*costMicros(1000,200));
 });
 it('rejects unknown evidence references but accounts for consumed tokens',async()=>{
  const bad=structuredClone(good);bad.summary={findings:[{text:'Invented record',evidenceIds:['OTHER-CASE']}],suggestedChecks:[{text:'Check',evidenceIds:['finding']}],uncertainties:[]};provider.mockResolvedValue(bad);
  const result=await service.generate(caseId,input(),actor);expect(result.request.status).toBe('REJECTED');expect(result.request.output).toBeNull();expect((await service.budget()).spentMicros).toBe(costMicros(1000,200));
 });
 it('retains the full reservation on timeout, does not retry, and survives service reconstruction',async()=>{
  provider.mockRejectedValue(new Error('Sensitive upstream text'));const original=input();const result=await service.generate(caseId,original,actor);
  expect(result.request.status).toBe('UNKNOWN');expect(result.request.error).not.toContain('Sensitive');expect((await service.budget()).reservedMicros).toBe(reservationMicros);
  const restarted=createSummaries(db,provider,true);await restarted.generate(caseId,original,actor);expect(provider).toHaveBeenCalledTimes(1);expect((await restarted.budget()).reservedMicros).toBe(reservationMicros);
 });
 it('blocks spending before dispatch when the maximum request cost is unavailable',async()=>{
  await db.aiBudget.update({where:{id:'project'},data:{spentMicros:1000000-reservationMicros+1}});
  await expect(service.generate(caseId,input(),actor)).rejects.toThrow('budget');expect(provider).not.toHaveBeenCalled();expect(await db.aiRequest.count()).toBe(0);
 });
 it('serializes concurrent reservations across cases at the budget boundary',async()=>{
  await db.aiBudget.update({where:{id:'project'},data:{spentMicros:1000000-reservationMicros}});
  let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});let complete!:(value:ProviderReply)=>void;
  provider.mockImplementation(()=>{entered();return new Promise(r=>{complete=r;});});
  const first=service.generate(caseId,input(),actor);await started;
  const other=(await db.investigation.findUniqueOrThrow({where:{transactionRef:'DEMO-P003'}})).id;const otherHash=(await service.view(other)).sourceHash!;
  await expect(service.generate(other,input(otherHash),actor)).rejects.toThrow('budget');complete(good);await first;expect(provider).toHaveBeenCalledTimes(1);
 });
 it('blocks duplicate in-flight generation for the same case',async()=>{
  let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});let complete!:(value:ProviderReply)=>void;
  provider.mockImplementation(()=>{entered();return new Promise(r=>{complete=r;});});const first=service.generate(caseId,input(),actor);await started;
  await expect(service.generate(caseId,input(),actor)).rejects.toThrow('already being generated');complete(good);await first;
 });
 it('marks saved output stale after notes change and rejects an old source hash',async()=>{
  await service.generate(caseId,input(),actor);await createInvestigations(db).act(caseId,{action:'NOTE',version:1,body:'New operator evidence.'},actor);
  expect((await service.view(caseId)).summaries[0]?.stale).toBe(true);await expect(service.generate(caseId,input(),actor)).rejects.toThrow('evidence changed');expect(provider).toHaveBeenCalledTimes(1);
 });
 it('requires reconciliation of new records, then marks prior summaries stale',async()=>{
  await service.generate(caseId,input(),actor);const batch=await store.submit('SETTLEMENT','late.csv',demoFixtures().late);await store.process(batch.id);
  expect((await service.view(caseId)).blockedReason).toContain('Reconcile');await store.run();expect((await service.view(caseId)).summaries[0]?.stale).toBe(true);
 });
 it('permits duplicate-only imports without forcing a new financial snapshot',async()=>{
  const batch=await store.submit('PAYMENT','duplicate.csv','transaction_ref,amount_paise,currency,paid_at\nDEMO-P001,10000,INR,2026-10-01T10:00:00Z\n');await store.process(batch.id);
  expect((await service.view(caseId)).blockedReason).toBeNull();expect((await store.run()).reused).toBe(true);
 });
 it('records refused responses as rejected and charges their reported usage',async()=>{
  provider.mockResolvedValue({...good,status:'REJECTED',summary:null,error:'REFUSED'});expect((await service.generate(caseId,input(),actor)).request.status).toBe('REJECTED');expect((await service.budget()).spentMicros).toBe(costMicros(1000,200));
 });
 it('retains unknown reservations for interrupted requests and can display saved history while disabled',async()=>{
  provider.mockRejectedValue(new Error('timeout'));await service.generate(caseId,input(),actor);const result=await createSummaries(db,provider,false).view(caseId);expect(result.enabled).toBe(false);expect(result.summaries[0]?.status).toBe('UNKNOWN');expect(result.budget.reservedMicros).toBe(reservationMicros);
 });
 it('enforces actual HTTP authentication, viewer restrictions and operator CSRF on summary routes',async()=>{
  await db.user.create({data:{email:'viewer@test.local',displayName:'Viewer',role:'VIEWER',passwordHash:hashed}});
  const auth=createAuth(db,{origins:['http://localhost:8080'],secureCookie:false});const router=Router();router.use(auth.routes);router.use(domainRoutes(store,auth.guards,createInvestigations(db),service));const ok=async()=>true;const app=createApp({database:ok,redis:ok,worker:ok,aiService:ok},pino({level:'silent'}),100,router);const path=`/api/investigations/${caseId}/summaries`;
  expect((await request(app).get(path)).status).toBe(401);const viewer=request.agent(app);const login=await viewer.post('/api/auth/login').set('x-reconciledesk-client','web').send({email:'viewer@test.local',password:'test-password'});
  expect((await viewer.get(path)).status).toBe(200);expect((await viewer.post(path).set('x-csrf-token',login.body.csrfToken).send(input())).status).toBe(403);
  const op=request.agent(app);await op.post('/api/auth/login').set('x-reconciledesk-client','web').send({email:'op@test.local',password:'test-password'});expect((await op.post(path).send(input())).status).toBe(403);expect(provider).not.toHaveBeenCalled();
 });
});
