import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
export function createDatabase(url: string, poolSize = 5) {
  const adapter = new PrismaPg({ connectionString: url, max: poolSize, connectionTimeoutMillis: 1000, statement_timeout: 5000 });
  return new PrismaClient({ adapter });
}
export function createRedis(url: string) {
  return new Redis(url, {
    maxRetriesPerRequest: 1, connectTimeout: 1000, commandTimeout: 1000,
    enableOfflineQueue: false
  });
}
// BullMQ workers need retries without a per-request limit. Queue producers do not.
export function queueConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname, port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number(parsed.pathname.slice(1) || 0),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {})
  };
}
export const queueName = 'reconciledesk-diagnostics';
export const heartbeatKey = 'reconciledesk:worker:heartbeat';
