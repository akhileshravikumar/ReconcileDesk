import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { loadConfig } from './config.js';
import { heartbeatKey, queueConnection, queueName } from './connections.js';
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
redis.on('error', () => logger.warn('Heartbeat Redis unavailable'));
const worker = new Worker(queueName, async job => {
  if (job.name !== 'ping') throw new Error('Unsupported diagnostic job');
  return { status: 'ok', token: job.data.token };
}, { connection: { ...queueConnection(config.REDIS_URL), maxRetriesPerRequest: null }, concurrency: 1 });
worker.on('error', () => logger.error('Worker connection error'));
worker.on('failed', job => logger.warn({ jobId: job?.id }, 'Diagnostic job failed'));
const beat = async () => {
  try {
    if (worker.isRunning()) await redis.set(heartbeatKey, new Date().toISOString(), 'EX', 15);
  } catch { logger.warn('Cannot update worker heartbeat'); }
};
await worker.waitUntilReady();
await beat();
const timer = setInterval(() => { void beat(); }, 5000);
logger.info('Diagnostic worker ready; financial imports are not implemented yet');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  const deadline = setTimeout(() => process.exit(1), 8000).unref();
  await worker.close();
  try { await redis.del(heartbeatKey); } finally { redis.disconnect(); }
  clearTimeout(deadline);
}
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
