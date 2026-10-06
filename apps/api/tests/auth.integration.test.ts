import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import {Router} from 'express';
import {pino} from 'pino';
import {createDatabase} from '../src/connections.js';
import {createStore} from '../src/store.js';
import {createAuth,hashPassword,cookieName} from '../src/auth.js';
import {createInvestigations} from '../src/investigations.js';
import {createApp} from '../src/app.js';
import {domainRoutes} from '../src/routes.js';
import {demoFixtures} from '../src/fixtures.js';
import {digest} from '../src/domain.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!new URL(url).pathname.endsWith('_test'))throw new Error('Use an isolated database ending in _test.');
const password='Test-only-password-not-used-by-demo';
describe.skipIf(!url)('authentication, workflow and audit integration',()=>{
  let db:ReturnType<typeof createDatabase>;let store:ReturnType<typeof createStore>;let app:ReturnType<typeof createApp>;let hashed:string;
  let operatorId:string;let operatorTwoId:string;let viewerId:string;let caseId:string;
  beforeAll(async()=>{db=createDatabase(url!,Number(process.env.TEST_DATABASE_POOL_SIZE??5));hashed=await hashPassword(password);});
  beforeEach(async()=>{
    await db.$executeRawUnsafe('TRUNCATE "AuditEvent", "InvestigationNote", "Investigation", "Session", "LoginThrottle", "User", "ReconciliationItem", "ReconciliationRun", "LedgerRecord", "ImportRow", "ImportBatch" CASCADE');
    const op=await db.user.create({data:{email:'op@test.local',displayName:'Operator',role:'OPERATOR',passwordHash:hashed}});operatorId=op.id;
    operatorTwoId=(await db.user.create({data:{email:'op2@test.local',displayName:'Operator Two',role:'OPERATOR',passwordHash:hashed}})).id;
    viewerId=(await db.user.create({data:{email:'viewer@test.local',displayName:'Viewer',role:'VIEWER',passwordHash:hashed}})).id;
    store=createStore(db);const fixtures=demoFixtures();
    for(const kind of ['PAYMENT','SETTLEMENT','REFUND'] as const){const batch=await store.submit(kind,`${kind}.csv`,fixtures[kind]);await store.process(batch.id);}
    await store.run();caseId=(await db.investigation.findUniqueOrThrow({where:{transactionRef:'DEMO-P002'}})).id;
    const auth=createAuth(db,{origins:['http://localhost:8080'],secureCookie:false});const routes=Router();routes.use(auth.routes);routes.use(domainRoutes(store,auth.guards,createInvestigations(db)));
    const ok=async()=>true;app=createApp({database:ok,redis:ok,worker:ok,aiService:ok},pino({level:'silent'}),100,routes);
  });
  afterAll(async()=>{await db?.$disconnect();});
  async function login(email='op@test.local'){
    const agent=request.agent(app);const response=await agent.post('/api/auth/login').set('x-reconciledesk-client','web').send({email,password});expect(response.status).toBe(200);
    return {agent,csrf:response.body.csrfToken as string,cookie:(response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!,response};
  }
  it('denies unauthenticated business reads and writes',async()=>{
    for(const path of ['/api/workspace','/api/investigations','/api/audit','/api/operators'])expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).post('/api/reconciliation')).status).toBe(401);
  });
  it('returns a generic credential error for unknown users and wrong passwords',async()=>{
    const a=await request(app).post('/api/auth/login').set('x-reconciledesk-client','web').send({email:'unknown@test.local',password});
    const b=await request(app).post('/api/auth/login').set('x-reconciledesk-client','web').send({email:'op@test.local',password:'wrong'});
    expect(a.status).toBe(401);expect(b.body).toEqual(a.body);
  });
  it('sets an HttpOnly cookie and stores only the token hash',async()=>{
    const {agent,cookie,response}=await login();expect(String(response.headers['set-cookie'])).toContain('HttpOnly');expect(String(response.headers['set-cookie'])).toContain('SameSite=Lax');
    const raw=cookie.slice(cookieName.length+1);const saved=await db.session.findFirstOrThrow();expect(saved.tokenHash).toBe(digest(raw));expect(saved.tokenHash).not.toBe(raw);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');expect(response.body.token).toBeUndefined();expect((await agent.get('/api/auth/session')).status).toBe(200);
  });
  it('allows viewer reads and blocks every mutation category',async()=>{
    const {agent,csrf}=await login('viewer@test.local');for(const path of ['/api/workspace','/api/investigations','/api/audit','/api/operators'])expect((await agent.get(path)).status).toBe(200);
    for(const path of ['/api/imports/PAYMENT','/api/imports/anything/retry','/api/reconciliation',`/api/investigations/${caseId}/actions`])expect((await agent.post(path).set('x-csrf-token',csrf).send({})).status).toBe(403);
  });
  it('rejects missing, invalid, non-ASCII CSRF tokens and hostile origins',async()=>{
    const {agent,csrf}=await login();expect((await agent.post('/api/reconciliation')).status).toBe(403);
    expect((await agent.post('/api/reconciliation').set('x-csrf-token','a'.repeat(64))).status).toBe(403);
    expect((await agent.post('/api/reconciliation').set('x-csrf-token','é'.repeat(64))).status).toBe(403);
    expect((await agent.post('/api/reconciliation').set('x-csrf-token',csrf).set('Origin','https://untrusted.example')).status).toBe(403);
  });
  it('blocks cross-origin login and simple form submissions',async()=>{
    expect((await request(app).post('/api/auth/login').set('Origin','https://untrusted.example').set('x-reconciledesk-client','web').send({email:'op@test.local',password})).status).toBe(403);
    expect((await request(app).post('/api/auth/login').type('form').send({email:'op@test.local',password})).status).toBe(415);
  });
  it('revokes a session on logout',async()=>{
    const {agent,csrf,cookie}=await login();expect((await agent.post('/api/auth/logout').set('x-csrf-token',csrf)).status).toBe(204);
    expect((await request(app).get('/api/workspace').set('Cookie',cookie)).status).toBe(401);
  });
  it('rejects expired sessions and disabled users',async()=>{
    const first=await login();await db.session.updateMany({data:{expiresAt:new Date(0)}});expect((await first.agent.get('/api/workspace')).status).toBe(401);
    const second=await login();await db.user.update({where:{id:operatorId},data:{active:false}});expect((await second.agent.get('/api/workspace')).status).toBe(401);
  });
  it('restricts assignments to operators and permits cross-operator investigation',async()=>{
    const {agent,csrf}=await login('op2@test.local');const path=`/api/investigations/${caseId}/actions`;
    expect((await agent.post(path).set('x-csrf-token',csrf).send({action:'ASSIGN',version:1,assigneeId:viewerId})).status).toBe(400);
    expect((await agent.post(path).set('x-csrf-token',csrf).send({action:'ASSIGN',version:1,assigneeId:operatorId})).status).toBe(200);
    expect((await agent.post(path).set('x-csrf-token',csrf).send({action:'NOTE',version:2,body:'Investigated by the other operator.'})).status).toBe(200);
    expect((await db.investigationNote.findFirstOrThrow()).authorId).toBe(operatorTwoId);
  });
  it('requires a resolution note, supports reopening, and never rewrites financial findings',async()=>{
    const {agent,csrf}=await login();const path=`/api/investigations/${caseId}/actions`;
    const before=await db.reconciliationItem.findMany();
    expect((await agent.post(path).set('x-csrf-token',csrf).send({action:'STATUS',version:1,status:'IN_PROGRESS'})).status).toBe(200);
    expect((await agent.post(path).set('x-csrf-token',csrf).send({action:'STATUS',version:2,status:'RESOLVED'})).status).toBe(400);
    expect((await agent.post(path).set('x-csrf-token',csrf).send({action:'STATUS',version:2,status:'RESOLVED',note:'Reviewed the missing settlement; documented next action.'})).status).toBe(200);
    expect((await db.investigationNote.findFirstOrThrow()).kind).toBe('RESOLUTION');
    expect((await agent.post(path).set('x-csrf-token',csrf).send({action:'STATUS',version:3,status:'OPEN'})).status).toBe(200);
    expect(await db.reconciliationItem.findMany()).toEqual(before);
    expect(await db.auditEvent.count({where:{entityId:caseId,action:'INVESTIGATION_STATUS_CHANGED'}})).toBe(3);
  });
  it('rejects stale edits without adding a note or audit event',async()=>{
    const {agent,csrf}=await login();const path=`/api/investigations/${caseId}/actions`;
    await agent.post(path).set('x-csrf-token',csrf).send({action:'NOTE',version:1,body:'First edit'});
    const count=await db.auditEvent.count();
    expect((await agent.post(path).set('x-csrf-token',csrf).send({action:'NOTE',version:1,body:'Stale edit'})).status).toBe(409);
    expect(await db.investigationNote.count()).toBe(1);expect(await db.auditEvent.count()).toBe(count);
  });
  it('preserves manual workflow state and notes across a new reconciliation snapshot',async()=>{
    const service=createInvestigations(db);await service.act(caseId,{action:'STATUS',version:1,status:'IN_PROGRESS'},{id:operatorId,label:'Operator'});
    await service.act(caseId,{action:'STATUS',version:2,status:'RESOLVED',note:'Reviewed separately from source records.'},{id:operatorId,label:'Operator'});
    const late=await store.submit('SETTLEMENT','late.csv',demoFixtures().late);await store.process(late.id);await store.run();
    const saved=await db.investigation.findUniqueOrThrow({where:{id:caseId}});expect(saved.status).toBe('RESOLVED');expect(saved.version).toBe(3);expect(await db.investigationNote.count()).toBe(1);
  });
  it('enforces append-only audit rows in the database and exposes no edit route',async()=>{
    const {agent,csrf}=await login();const event=await db.auditEvent.findFirstOrThrow();
    await expect(db.$transaction(tx=>tx.auditEvent.update({where:{id:event.id},data:{action:'tampered'}}))).rejects.toThrow('append-only');
    await expect(db.$transaction(tx=>tx.auditEvent.delete({where:{id:event.id}}))).rejects.toThrow('append-only');
    expect((await agent.delete(`/api/audit/${event.id}`).set('x-csrf-token',csrf)).status).toBe(404);
  });
  it('records authenticated import and reconciliation actors',async()=>{
    const {agent,csrf}=await login();const csv='transaction_ref,amount_paise,currency,paid_at\nAUTH-P1,100,INR,2026-10-01T10:00:00Z\n';
    const added=await agent.post('/api/imports/PAYMENT').set('x-csrf-token',csrf).type('text/csv').send(csv);expect(added.status).toBe(202);
    await store.process(added.body.id);expect((await agent.post('/api/reconciliation').set('x-csrf-token',csrf)).status).toBe(200);
    expect((await db.auditEvent.findFirstOrThrow({where:{action:'IMPORT_SUBMITTED',entityId:added.body.id}})).actorId).toBe(operatorId);
    expect(await db.auditEvent.count({where:{action:'RECONCILIATION_CREATED',actorId:operatorId}})).toBe(1);
  });
  it('limits repeated login attempts',async()=>{
    for(let n=0;n<10;n++)expect((await request(app).post('/api/auth/login').set('x-reconciledesk-client','web').send({email:'op@test.local',password:'wrong'})).status).toBe(401);
    expect((await request(app).post('/api/auth/login').set('x-reconciledesk-client','web').send({email:'op@test.local',password})).status).toBe(429);
  },20000);
});
