import express, { type Router } from 'express';
import { domainError } from './routes.js';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';

export type ProbeName = 'database' | 'redis' | 'worker' | 'aiService';
export type Probes = Record<ProbeName, () => Promise<unknown>>;

async function withTimeout(task: () => Promise<unknown>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Probe timeout')), timeoutMs); })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export function createApp(probes: Probes, logger: Logger, timeoutMs = 1500, routes?: Router) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'api', milestone: 3 });
  });
  app.get('/api/ready', async (_req, res) => {
    const entries = await Promise.all(Object.entries(probes).map(async ([name, check]) => {
      try { await withTimeout(check, timeoutMs); return [name, 'ok']; }
      catch { return [name, 'unavailable']; }
    }));
    const dependencies = Object.fromEntries(entries);
    const ready = Object.values(dependencies).every(value => value === 'ok');
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'degraded', service: 'api', milestone: 3, dependencies
    });
  });
  if (routes) app.use('/api', routes);
  app.use(domainError);
  app.use((_req, res) => { res.status(404).json({ error: 'Route not found' }); });
  return app;
}
