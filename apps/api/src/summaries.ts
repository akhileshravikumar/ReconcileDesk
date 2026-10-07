import type {PrismaClient,Prisma} from './generated/prisma/client.js';
import {InputError,serializeRecord,digest} from './domain.js';
import {audit,type Actor} from './audit.js';
import {lock,txOptions} from './store.js';
import {model,promptVersion,priceVersion,reservationMicros,maxContextBytes,costMicros,sourceHash,validateSummary,providerReplySchema,type SummaryContext,type SummaryProvider,type Generation} from './summary-contract.js';

export async function loadSummaryContext(tx:Prisma.TransactionClient,id:string):Promise<SummaryContext> {
 await tx.$queryRaw`SELECT "id" FROM "Investigation" WHERE "id"=${id} FOR SHARE`;
 const item=await tx.investigation.findUnique({where:{id},include:{notes:{orderBy:[{createdAt:'desc'},{id:'desc'}],take:6}}});
 if(!item)throw new InputError('Investigation not found.',404);
 // A new accepted import must be reconciled before it can become summary evidence.
 if(await tx.importBatch.count({where:{status:{in:['QUEUED','PROCESSING']}}}))throw new InputError('Wait for imports to finish and reconcile before generating a summary.',409);
 const finding=await tx.reconciliationItem.findUniqueOrThrow({where:{runId_transactionRef:{runId:item.latestRunId,transactionRef:item.transactionRef}}});
 const run=await tx.reconciliationRun.findUniqueOrThrow({where:{id:item.latestRunId}});
 const allRecords=await tx.ledgerRecord.findMany({select:{fingerprint:true},orderBy:[{kind:'asc'},{reference:'asc'}]});
 const badRows=await tx.importRow.findMany({where:{outcome:'QUARANTINED'},select:{transactionRef:true,existingTransactionRef:true}});
 const conflicts=[...new Set(badRows.flatMap(r=>[r.transactionRef,r.existingTransactionRef]).filter((x):x is string=>Boolean(x)))].sort();
 const currentHash=digest(JSON.stringify({records:allRecords.map(r=>r.fingerprint),conflicts}));
 if(currentHash!==run.snapshotHash)throw new InputError('Reconcile newly imported records before generating a summary.',409);
 const records=await tx.ledgerRecord.findMany({where:{transactionRef:item.transactionRef},orderBy:[{kind:'asc'},{reference:'asc'}],take:21});
 const context:SummaryContext={transactionRef:item.transactionRef,runId:item.latestRunId,caseVersion:item.version,status:item.status,
 evidence:[{id:'finding',kind:'DETERMINISTIC_FINDING',data:{status:finding.status,codes:finding.codes,details:finding.details}},
 ...records.slice(0,20).map(r=>({id:`${r.kind}/${r.reference}`,kind:'ACCEPTED_RECORD',data:serializeRecord(r)})),
 ...item.notes.slice(0,5).reverse().map(n=>({id:`note/${n.id}`,kind:'OPERATOR_NOTE_UNVERIFIED',data:{kind:n.kind,body:n.body,createdAt:n.createdAt.toISOString()}}))],limitations:[]};
 if(records.length>20)context.limitations.push('Only the first 20 accepted records are included; totals remain available in the deterministic finding.');
 if(item.notes.length>5)context.limitations.push('Only the five most recent investigation notes are included.');
 if(Buffer.byteLength(JSON.stringify(context),'utf8')>maxContextBytes)throw new InputError('This investigation exceeds the bounded AI context size. Review it manually; no paid call was made.',413);
 return context;
}
export function createSummaries(db:PrismaClient,provider:SummaryProvider,enabled:boolean) {
 async function budget(){const b=await db.aiBudget.findUniqueOrThrow({where:{id:'project'}});return {...b,availableMicros:b.limitMicros-b.spentMicros-b.reservedMicros,reservationMicros};}
 async function view(id:string) {
  let context:SummaryContext|null=null;let blockedReason:string|null=null;
  try{context=await db.$transaction(async tx=>{await lock(tx);return loadSummaryContext(tx,id);},txOptions);}catch(e){if(!(e instanceof InputError)||e.status===404)throw e;blockedReason=e.message;}
  const hash=context?sourceHash(context):null;
  const rows=await db.aiRequest.findMany({where:{investigationId:id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:10});
  return {enabled,model,promptVersion,sourceHash:hash,blockedReason,budget:await budget(),summaries:rows.map(row=>({...row,stale:row.sourceHash!==hash,interrupted:row.status==='PENDING'&&Date.now()-row.createdAt.getTime()>90000}))};
 }
 async function generate(id:string,input:Generation,actor:Actor) {
  if(!enabled)throw new InputError('Live AI is disabled. Follow the private setup guide to enable it.',503);
  const reserved=await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(7319383)`;await lock(tx);
   const user=actor.id?await tx.user.findUnique({where:{id:actor.id}}):null;
   if(!user?.active||user.role!=='OPERATOR')throw new InputError('Operator access is required.',403);
   const prior=await tx.aiRequest.findUnique({where:{id:input.requestId}});
   if(prior){if(prior.investigationId!==id||prior.sourceHash!==input.sourceHash)throw new InputError('Request ID was already used for different input.',409);return {request:prior,reused:true};}
   const context=await loadSummaryContext(tx,id);const hash=sourceHash(context);
   if(hash!==input.sourceHash)throw new InputError('Investigation evidence changed. Refresh the summary panel before generating.',409);
   if(!input.regenerate){const cached=await tx.aiRequest.findFirst({where:{investigationId:id,sourceHash:hash,status:'SUCCEEDED',model,promptVersion},orderBy:{createdAt:'desc'}});if(cached)return {request:cached,reused:true};}
   if(await tx.aiRequest.count({where:{investigationId:id,status:'PENDING',createdAt:{gt:new Date(Date.now()-90000)}}}))throw new InputError('A summary is already being generated. Refresh shortly.',409);
   const b=await tx.aiBudget.findUniqueOrThrow({where:{id:'project'}});
   if(b.spentMicros+b.reservedMicros+reservationMicros>b.limitMicros)throw new InputError('The remaining $1 project budget cannot cover another request. Saved summaries remain available.',402);
   await tx.aiBudget.update({where:{id:'project'},data:{reservedMicros:{increment:reservationMicros}}});
   const request=await tx.aiRequest.create({data:{id:input.requestId,investigationId:id,actorId:user.id,sourceHash:hash,context:context as unknown as Prisma.InputJsonValue,model,promptVersion,priceVersion,reservedMicros:reservationMicros}});
   await audit(tx,actor,'AI_SUMMARY_REQUESTED','INVESTIGATION',id,{requestId:request.id,sourceHash:hash,reservedMicros:reservationMicros});
   return {request,reused:false};
  },txOptions);
  if(reserved.reused)return reserved;
  const start=Date.now();let reply:ReturnType<typeof providerReplySchema.parse>|null=null;let output:Prisma.InputJsonValue|undefined;
  let status='UNKNOWN';let error:string|null='No reliable provider usage received. The full reservation is retained; no automatic retry.';
  try{
   reply=providerReplySchema.parse(await provider(reserved.request.context as unknown as SummaryContext,reserved.request.id));
   status='REJECTED';error=reply.error==='REFUSED'?'The model declined this request.':reply.error==='INCOMPLETE'?'The model response was incomplete.':'The model response failed validation.';
   if(reply.status==='COMPLETED'){output=validateSummary(reply.summary,reserved.request.context as unknown as SummaryContext) as unknown as Prisma.InputJsonValue;status='SUCCEEDED';error=null;}
  }catch{if(reply){status='REJECTED';error='The model response failed schema, evidence or financial-wording validation.';}}
  const request=await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(7319383)`;
   const charge=reply?costMicros(reply.usage.inputTokens,reply.usage.outputTokens):0;
   if(reply)await tx.aiBudget.update({where:{id:'project'},data:{reservedMicros:{decrement:reservationMicros},spentMicros:{increment:charge}}});
   const saved=await tx.aiRequest.update({where:{id:input.requestId},data:{status,error,output,chargedMicros:charge,inputTokens:reply?.usage.inputTokens,outputTokens:reply?.usage.outputTokens,durationMs:Date.now()-start,completedAt:new Date()}});
   await audit(tx,actor,`AI_SUMMARY_${status}`,'INVESTIGATION',id,{requestId:saved.id,chargedMicros:charge,reservationRetained:!reply});return saved;
  });
  return {request,reused:false};
 }
 return {view,generate,budget};
}
export type Summaries=ReturnType<typeof createSummaries>;
