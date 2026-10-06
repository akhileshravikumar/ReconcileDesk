import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents } from 'bullmq';
import { loadConfig } from './config.js';
import { queueConnection, queueName } from './connections.js';
const config = loadConfig();
const endpoint = process.env.SMOKE_API_URL ?? 'http://api:4000';
const response = await fetch(`${endpoint}/api/ready`, { signal: AbortSignal.timeout(5000) });
const body = await response.json();
assert.equal(response.status, 200, JSON.stringify(body));
for (const dependency of ['database','redis','worker','aiService']) {
  assert.equal(body.dependencies[dependency], 'ok');
  console.log(`PASS ${dependency}`);
}
const queue = new Queue(queueName, { connection: { ...queueConnection(config.REDIS_URL), maxRetriesPerRequest: 1 } });
const events = new QueueEvents(queueName, { connection: { ...queueConnection(config.REDIS_URL), maxRetriesPerRequest: null } });
const failTimer = setTimeout(() => { console.error('FAIL queue smoke test timed out'); process.exit(1); }, 20000);
try {
  await events.waitUntilReady();
  const token = randomUUID();
  const job = await queue.add('ping', { token }, { removeOnComplete: 20, removeOnFail: 20 });
  const result = await job.waitUntilFinished(events, 10000);
  assert.deepEqual(result, { status: 'ok', token });
  console.log('PASS queue round trip');
  console.log('Infrastructure smoke checks passed.');
} finally {
  await Promise.all([events.close(), queue.close()]);
  clearTimeout(failTimer);
}
