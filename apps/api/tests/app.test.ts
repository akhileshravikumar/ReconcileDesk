import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { pino } from 'pino';
import { createApp, type Probes } from '../src/app.js';
const healthy = (): Probes => ({ database: async () => true, redis: async () => true, worker: async () => true, aiService: async () => true });
const logger = pino({ level: 'silent' });
describe('health contract', () => {
  it('keeps liveness independent of dependency failures', async () => {
    const probes = healthy();
    probes.database = async () => { throw new Error('offline'); };
    const response = await request(createApp(probes, logger)).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
  it('reports readiness only when all dependencies succeed', async () => {
    const response = await request(createApp(healthy(), logger)).get('/api/ready');
    expect(response.status).toBe(200);
    expect(response.body.dependencies).toEqual({ database:'ok',redis:'ok',worker:'ok',aiService:'ok' });
  });
  it.each(['database','redis','worker','aiService'] as const)('reports %s failures without leaking error details', async dependency => {
    const probes = healthy();
    probes[dependency] = async () => { throw new Error('secret-connection-string'); };
    const response = await request(createApp(probes, logger)).get('/api/ready');
    expect(response.status).toBe(503);
    expect(response.body.dependencies[dependency]).toBe('unavailable');
    expect(JSON.stringify(response.body)).not.toContain('secret-connection-string');
  });
  it('bounds a stalled probe', async () => {
    const probes = healthy();
    probes.database = () => new Promise(() => {});
    const response = await request(createApp(probes, logger, 20)).get('/api/ready');
    expect(response.status).toBe(503);
  });
  it('returns JSON for unknown routes', async () => {
    const response = await request(createApp(healthy(), logger)).get('/api/imports');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Route not found');
  });
});
