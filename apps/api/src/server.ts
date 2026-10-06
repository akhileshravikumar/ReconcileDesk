import { Router } from 'express';
import { createAuth } from './auth.js';
import { createInvestigations } from './investigations.js';
import { pino } from 'pino';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase, createRedis, heartbeatKey } from './connections.js';
import { createStore } from './store.js';
import { domainRoutes } from './routes.js';
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL,redact:{paths:['req.headers.cookie','req.headers.authorization','req.headers["x-csrf-token"]','res.headers["set-cookie"]'],remove:true} });
const db = createDatabase(config.DATABASE_URL);
const redis = createRedis(config.REDIS_URL);
redis.on('error', () => logger.warn('Redis unavailable'));
const auth=createAuth(db,{origins:config.AUTH_ORIGINS.split(',').map(s=>s.trim()),secureCookie:config.NODE_ENV==='production'});
const routes=Router();routes.use(auth.routes);routes.use(domainRoutes(createStore(db),auth.guards,createInvestigations(db)));
const app = createApp({
  database: async () => {
    const marker = await db.systemMetadata.findUnique({ where: { key: 'milestone' } });
    if (marker?.value !== '4') throw new Error('Migration missing');
  },
  redis: () => redis.ping(),
  worker: async () => { if (!await redis.get(heartbeatKey)) throw new Error('Worker heartbeat missing'); },
  aiService: async () => {
    const response = await fetch(`${config.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) throw new Error('AI service unavailable');
  }
}, logger, 1500, routes);
const server = app.listen(config.PORT, '0.0.0.0', () => logger.info({ port: config.PORT }, 'API listening'));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 8000).unref();
  await new Promise<void>(resolve => server.close(() => resolve()));
  redis.disconnect();
  await db.$disconnect();
  clearTimeout(deadline);
}
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
