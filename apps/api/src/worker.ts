import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { loadConfig } from './config.js';
import { createDatabase, heartbeatKey, queueConnection, queueName } from './connections.js';
import { createStore } from './store.js';
const config=loadConfig();
const logger=pino({level:config.LOG_LEVEL});
const db=createDatabase(config.DATABASE_URL);
const store=createStore(db);
const redis=new Redis(config.REDIS_URL,{maxRetriesPerRequest:1});
redis.on('error',()=>logger.warn('Heartbeat Redis unavailable'));
const queue=new Queue(queueName,{connection:{...queueConnection(config.REDIS_URL),maxRetriesPerRequest:1}});
queue.on('error',()=>logger.warn('Queue unavailable'));
const worker=new Worker(queueName,async job=> {
  if(job.name==='ping') return {status:'ok',token:job.data.token};
  if(job.name!=='import'||typeof job.data.importId!=='string') throw new Error('Unsupported job');
  try { await store.process(job.data.importId); return {status:'ok',importId:job.data.importId}; }
  catch(error) { await store.failed(job.data.importId,job.attemptsMade+1>=3); throw error; }
},{connection:{...queueConnection(config.REDIS_URL),maxRetriesPerRequest:null},concurrency:1,maxStalledCount:2});
worker.on('error',()=>logger.error('Worker connection error'));
worker.on('failed',(job,error)=>logger.warn({jobId:job?.id,errorType:error.name},'Job failed'));
let dispatching=false;
async function dispatch() {
  if(dispatching) return;
  dispatching=true;
  try {
    const batches=await db.importBatch.findMany({where:{status:{in:['QUEUED','PROCESSING']}},select:{id:true,status:true},orderBy:{createdAt:'asc'},take:100});
    for(const batch of batches) {
      const id=`import-${batch.id}`;
      const existing=await queue.getJob(id);
      if(existing) {
        const state=await existing.getState();
        if(state==='failed'&&batch.status==='QUEUED') { await existing.retry(); }
        else if(state==='failed'&&batch.status==='PROCESSING') { await store.failed(batch.id,true); }
        else if(state==='completed') { await existing.remove(); }
        else continue;
      }
      await queue.add('import',{importId:batch.id},{jobId:id,attempts:3,backoff:{type:'exponential',delay:1000},removeOnComplete:100,removeOnFail:100});
    }
  } catch {logger.warn('Import dispatcher unavailable; queued batches remain durable in PostgreSQL');}
  finally {dispatching=false;}
}
async function beat() {
  try {if(worker.isRunning()) await redis.set(heartbeatKey,new Date().toISOString(),'EX',15);}
  catch {logger.warn('Cannot update heartbeat');}
}
await worker.waitUntilReady();
await beat();
await dispatch();
const heartbeatTimer=setInterval(()=>{void beat();},5000);
const dispatchTimer=setInterval(()=>{void dispatch();},3000);
logger.info('Import worker and durable dispatcher ready');
let stopping=false;
async function stop() {
  if(stopping) return;
  stopping=true;
  clearInterval(heartbeatTimer); clearInterval(dispatchTimer);
  const deadline=setTimeout(()=>process.exit(1),25000).unref();
  await worker.close(); await queue.close();
  try {await redis.del(heartbeatKey);} finally {redis.disconnect();}
  await db.$disconnect(); clearTimeout(deadline);
}
process.on('SIGTERM',()=>{void stop();});
process.on('SIGINT',()=>{void stop();});
