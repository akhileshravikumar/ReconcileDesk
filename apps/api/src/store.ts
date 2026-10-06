import type { PrismaClient, Prisma } from './generated/prisma/client.js';
import { InputError, digest, parseCsv, planImport, reconcile, ruleVersion, type Kind } from './domain.js';
import { performance } from 'node:perf_hooks';

const batchFields={id:true,kind:true,fileName:true,status:true,total:true,accepted:true,duplicate:true,rejected:true,quarantined:true,attempts:true,error:true,createdAt:true,completedAt:true} as const;
export type Transaction = Prisma.TransactionClient;
export async function lock(tx:Transaction) {
  await tx.$executeRaw`SELECT set_config('statement_timeout','120000',true)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7319381)`;
}
export const txOptions={maxWait:120000,timeout:120000};
function chunks<T>(items:T[], size=500) { return Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size)); }
export function createStore(db:PrismaClient) {
  return {
    async submit(kind:Kind,fileName:string,csv:string) {
      const rows=parseCsv(kind,csv);
      const contentHash=digest(`csv-v1\n${csv.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')}`);
      // The durable batch is the outbox. A worker dispatcher publishes queued batches to Redis.
      return db.importBatch.upsert({where:{kind_contentHash:{kind,contentHash}},update:{},create:{kind,fileName,rawCsv:csv,contentHash,total:rows.length},select:batchFields});
    },
    async process(id:string, injectAfterWrites=false) {
      const batch=await db.importBatch.findUniqueOrThrow({where:{id}});
      if(batch.status==='COMPLETED') return;
      const parsed=parseCsv(batch.kind,batch.rawCsv);
      await db.importBatch.updateMany({where:{id,status:{not:'COMPLETED'}},data:{status:'PROCESSING',attempts:{increment:1},error:null}});
      await db.$transaction(async tx=> {
        await lock(tx);
        const current=await tx.importBatch.findUniqueOrThrow({where:{id}});
        if(current.status==='COMPLETED') return;
        const refs=[...new Set(parsed.flatMap(r=>r.record?[r.record.reference]:[]))];
        const existing=await tx.ledgerRecord.findMany({where:{kind:batch.kind,reference:{in:refs}}});
        const plan=planImport(parsed,existing);
        for(const part of chunks(plan.accepted)) await tx.ledgerRecord.createMany({data:part.map(r=>({...r,importBatchId:id}))});
        if(injectAfterWrites) throw new Error('Injected failure after ledger inserts; transaction must roll back.');
        for(const part of chunks(plan.dispositions)) await tx.importRow.createMany({data:part.map(r=>({...r,batchId:id}))});
        const count=(outcome:string)=>plan.dispositions.filter(r=>r.outcome===outcome).length;
        await tx.importBatch.update({where:{id},data:{status:'COMPLETED',completedAt:new Date(),error:null,
          accepted:count('ACCEPTED'),duplicate:count('DUPLICATE'),rejected:count('REJECTED'),quarantined:count('QUARANTINED')}});
      },txOptions);
    },
    async failed(id:string,terminal:boolean) {
      await db.importBatch.updateMany({where:{id,status:{not:'COMPLETED'}},data:{status:terminal?'FAILED':'QUEUED',error:terminal?'Processing failed after bounded retries. Inspect worker logs, then retry.':'Processing interrupted; retry pending.'}});
    },
    async retry(id:string) {
      const batch=await db.importBatch.findUnique({where:{id}});
      if(!batch) throw new InputError('Import not found.',404);
      if(batch.status!=='FAILED') throw new InputError('Only a failed import can be retried.',409);
      return db.importBatch.update({where:{id},data:{status:'QUEUED',error:null},select:batchFields});
    },
    async workspace() {
      const [batches,counts,pending,rejected,quarantined,latest]=await Promise.all([
        db.importBatch.findMany({select:batchFields,orderBy:{createdAt:'desc'},take:20}),
        db.ledgerRecord.groupBy({by:['kind'],_count:true}),
        db.importBatch.count({where:{status:{in:['QUEUED','PROCESSING']}}}),
        db.importRow.count({where:{outcome:'REJECTED'}}),db.importRow.count({where:{outcome:'QUARANTINED'}}),
        db.reconciliationRun.findFirst({orderBy:{createdAt:'desc'}})
      ]);
      return {batches,counts:Object.fromEntries(counts.map(x=>[x.kind,x._count])),pending,rejected,quarantined,latest};
    },
    async batch(id:string,page:number) {
      const batch=await db.importBatch.findUnique({where:{id},select:batchFields});
      if(!batch) throw new InputError('Import not found.',404);
      const where={batchId:id};
      const [rows,total]=await Promise.all([db.importRow.findMany({where,orderBy:{rowNumber:'asc'},skip:(page-1)*50,take:50}),db.importRow.count({where})]);
      return {batch,rows,total,page,pageSize:50};
    },
    async run() {
      return db.$transaction(async tx=> {
        await lock(tx);
        if(await tx.importBatch.count({where:{status:{in:['QUEUED','PROCESSING']}}})) throw new InputError('Wait for queued imports to finish before reconciling.',409);
        const records=await tx.ledgerRecord.findMany({orderBy:[{kind:'asc'},{reference:'asc'}]});
        if(!records.length) throw new InputError('Import valid records before reconciling.',409);
        const badRows=await tx.importRow.findMany({where:{outcome:'QUARANTINED'},select:{transactionRef:true,existingTransactionRef:true}});
        const conflicts=[...new Set(badRows.flatMap(r=>[r.transactionRef,r.existingTransactionRef]).filter((x):x is string=>Boolean(x)))].sort();
        const snapshotHash=digest(JSON.stringify({records:records.map(r=>r.fingerprint),conflicts}));
        const prior=await tx.reconciliationRun.findUnique({where:{ruleVersion_snapshotHash:{ruleVersion,snapshotHash}}});
        if(prior) return {run:prior,reused:true};
        const start=performance.now();
        const items=reconcile(records,conflicts);
        const sourceCounts=Object.fromEntries(['PAYMENT','SETTLEMENT','REFUND'].map(k=>[k,records.filter(r=>r.kind===k).length]));
        const run=await tx.reconciliationRun.create({data:{ruleVersion,snapshotHash,paymentCount:sourceCounts.PAYMENT??0,
          matchedCount:items.filter(i=>i.status==='MATCHED').length,exceptionCount:items.filter(i=>i.status==='EXCEPTION').length,
          groupCount:items.length,durationMs:0,sourceCounts}});
        for(const part of chunks(items)) await tx.reconciliationItem.createMany({data:part.map(item=>({...item,runId:run.id}))});
        const saved=await tx.reconciliationRun.update({where:{id:run.id},data:{durationMs:Math.round(performance.now()-start)}});
        return {run:saved,reused:false};
      },txOptions);
    },
    async results(page:number,exceptionsOnly:boolean) {
      const run=await db.reconciliationRun.findFirst({orderBy:{createdAt:'desc'}});
      if(!run) return {run:null,items:[],total:0,page,pageSize:50};
      const where={runId:run.id,...(exceptionsOnly?{status:'EXCEPTION'}:{})};
      const [items,total]=await Promise.all([db.reconciliationItem.findMany({where,orderBy:{transactionRef:'asc'},skip:(page-1)*50,take:50}),db.reconciliationItem.count({where})]);
      return {run,items,total,page,pageSize:50};
    }
  };
}
export type Store = ReturnType<typeof createStore>;
