import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {createDatabase} from '../src/connections.js';
import {createStore} from '../src/store.js';
import {demoFixtures,demoExpected} from '../src/fixtures.js';
import {headers} from '../src/domain.js';

const url=process.env.TEST_DATABASE_URL;
// This suite clears its tables. It must never run against the application database.
if(url&&!new URL(url).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must name a dedicated database ending in _test.');
describe.skipIf(!url)('database transaction integration',()=>{
  let db:ReturnType<typeof createDatabase>;
  let store:ReturnType<typeof createStore>;
  beforeAll(()=>{db=createDatabase(url!,Number(process.env.TEST_DATABASE_POOL_SIZE??5));store=createStore(db);});
  beforeEach(async()=>{
    await db.$executeRawUnsafe('TRUNCATE "AuditEvent", "InvestigationNote", "Investigation", "Session", "LoginThrottle", "User", "ReconciliationItem", "ReconciliationRun", "LedgerRecord", "ImportRow", "ImportBatch" CASCADE');
  });
  afterAll(async()=>{await db?.$disconnect();});
  it('rolls back record writes after an injected failure, then retries without duplication',async()=>{
    const batch=await store.submit('PAYMENT','payments.csv',demoFixtures().PAYMENT);
    await expect(store.process(batch.id,true)).rejects.toThrow('Injected failure');
    expect(await db.ledgerRecord.count()).toBe(0);expect(await db.importRow.count()).toBe(0);
    await store.process(batch.id);await store.process(batch.id);
    expect(await db.ledgerRecord.count()).toBe(9);expect(await db.importRow.count()).toBe(13);
    const report=await store.batch(batch.id,1);expect(report.batch.status).toBe('COMPLETED');
  });
  it('reuses a file batch and detects duplicate records in a different file',async()=>{
    const csv=demoFixtures().PAYMENT;
    const first=await store.submit('PAYMENT','one.csv',csv);await store.process(first.id);
    const again=await store.submit('PAYMENT','renamed.csv',csv);expect(again.id).toBe(first.id);
    const subset=headers.PAYMENT.join(',')+'\nDEMO-P001,10000,INR,2026-10-01T10:00:00Z\n';
    const second=await store.submit('PAYMENT','subset.csv',subset);await store.process(second.id);
    const report=await store.batch(second.id,1);expect(report.batch.accepted).toBe(0);expect(report.batch.duplicate).toBe(1);
    expect(await db.ledgerRecord.count()).toBe(9);
  });
  it('keeps original values when a later record conflicts',async()=>{
    const header=headers.PAYMENT.join(',')+'\n';
    const first=await store.submit('PAYMENT','first.csv',header+'P1,100,INR,2026-10-01T10:00:00Z\n');await store.process(first.id);
    const second=await store.submit('PAYMENT','second.csv',header+'P1,101,INR,2026-10-01T10:00:00Z\n');await store.process(second.id);
    const saved=await db.ledgerRecord.findUniqueOrThrow({where:{kind_reference:{kind:'PAYMENT',reference:'P1'}}});
    expect(saved.amountPaise).toBe(100n);expect((await store.batch(second.id,1)).batch.quarantined).toBe(1);
  });
  it('persists correct snapshots, reuses unchanged input and handles late counterparts',async()=>{
    const fixture=demoFixtures();
    for(const kind of ['PAYMENT','SETTLEMENT','REFUND'] as const){const b=await store.submit(kind,`${kind}.csv`,fixture[kind]);await store.process(b.id);}
    const first=await store.run();const same=await store.run();expect(same.run.id).toBe(first.run.id);expect(same.reused).toBe(true);
    const initial=await store.results(1,false);
    expect(Object.fromEntries(initial.items.map(i=>[i.transactionRef,i.codes]))).toEqual(demoExpected.initial);
    const late=await store.submit('SETTLEMENT','late.csv',fixture.late);await store.process(late.id);
    const next=await store.run();expect(next.run.id).not.toBe(first.run.id);expect(next.run.matchedCount).toBe(3);
    expect(await db.reconciliationRun.count()).toBe(2);
    expect(await db.reconciliationItem.count({where:{runId:first.run.id,status:'MATCHED'}})).toBe(2);
  });
  it('rejects reconciliation while an import is pending',async()=>{
    await store.submit('PAYMENT','pending.csv',demoFixtures().PAYMENT);
    await expect(store.run()).rejects.toThrow('Wait for queued imports');
  });
  it('rejects invalid headers before writing a batch',async()=>{
    await expect(store.submit('PAYMENT','bad.csv','bad\n1\n')).rejects.toThrow('Required columns');
    expect(await db.importBatch.count()).toBe(0);
  });
});
