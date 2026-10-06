import {describe,it,expect} from 'vitest';
import {parseCsv,planImport,reconcile,headers,type Kind} from '../src/domain.js';
import {demoFixtures,demoExpected,benchmarkFixtures} from '../src/fixtures.js';
const row='P1,10000,INR,2026-10-01T10:00:00Z';
const payment=(body:string)=>headers.PAYMENT.join(',')+'\n'+body+'\n';
describe('CSV contract',()=>{
  it('supports BOM, CRLF, reordered columns, quoted values and empty lines',()=>{
    const parsed=parseCsv('PAYMENT','\uFEFFcurrency,amount_paise,paid_at,transaction_ref\r\nINR,"10000",2026-10-01T10:00:00Z,P1\r\n\r\n');
    expect(parsed[0]?.record?.amountPaise).toBe(10000n);
  });
  it.each(['transaction_ref,amount_paise,currency','transaction_ref,amount_paise,currency,currency','transaction_ref,amount_paise,currency,paid_at,extra'])('rejects invalid header %s',header=>{
    expect(()=>parseCsv('PAYMENT',header+'\n'+row)).toThrow('Required columns');
  });
  it('rejects malformed quoting for the entire file',()=>expect(()=>parseCsv('PAYMENT',payment('"P1,10000,INR,date'))).toThrow('Malformed CSV'));
  it.each(['-1','1.23','1e3','0','9223372036854775808'])('rejects invalid money %s per row',amount=>{
    expect(parseCsv('PAYMENT',payment(`P1,${amount},INR,2026-10-01T10:00:00Z`))[0]?.error).toBeTruthy();
  });
  it('retains exact integer values above Number.MAX_SAFE_INTEGER',()=>{
    expect(parseCsv('PAYMENT',payment('P1,9007199254740993,INR,2026-10-01T10:00:00Z'))[0]?.record?.amountPaise).toBe(9007199254740993n);
  });
  it('rejects invalid dates, currency and column counts individually',()=>{
    const rows=parseCsv('PAYMENT',payment('P1,10,USD,2026-10-01T10:00:00Z\nP2,10,INR,not-a-date\nP3,10,INR'));
    expect(rows.every(r=>r.error)).toBe(true);
  });
  it('accepts valid rows alongside rejected rows',()=>{
    const p=planImport(parseCsv('PAYMENT',payment(row+'\nP2,10.2,INR,bad')),[]);
    expect(p.dispositions.map(r=>r.outcome)).toEqual(['ACCEPTED','REJECTED']);
  });
  it('normalizes timestamp offsets and leading zeros for duplicate detection',()=>{
    const p=planImport(parseCsv('PAYMENT',payment(row+'\nP1,010000,INR,2026-10-01T11:00:00+01:00')),[]);
    expect(p.dispositions.map(r=>r.outcome)).toEqual(['ACCEPTED','DUPLICATE']);
  });
  it('quarantines changes to an accepted identifier without overwriting it',()=>{
    const p=planImport(parseCsv('PAYMENT',payment(row+'\nP1,10001,INR,2026-10-01T10:00:00Z')),[]);
    expect(p.dispositions.map(r=>r.outcome)).toEqual(['ACCEPTED','QUARANTINED']);
    expect(p.accepted[0]?.amountPaise).toBe(10000n);
  });
  it('detects duplicates against earlier files',()=>{
    const parsed=parseCsv('PAYMENT',payment(row));
    const p=planImport(parsed,[parsed[0]!.record!]);
    expect(p.accepted).toHaveLength(0);expect(p.dispositions[0]?.outcome).toBe('DUPLICATE');
  });
});
describe('reconciliation scenarios with independently specified expectations',()=>{
  const fixtures=demoFixtures();
  const plans=(['PAYMENT','SETTLEMENT','REFUND'] as Kind[]).map(kind=>planImport(parseCsv(kind,fixtures[kind]),[]));
  const records=plans.flatMap(p=>p.accepted);
  it('matches every expected case including partial refunds and orphan records',()=>{
    const output=reconcile(records,['DEMO-P008']);
    expect(Object.fromEntries(output.map(x=>[x.transactionRef,x.codes]))).toEqual(demoExpected.initial);
    expect(output.filter(x=>x.status==='MATCHED')).toHaveLength(2);
  });
  it('has the expected accepted, duplicate, rejected and quarantined payment rows',()=>{
    const rows=plans[0]!.dispositions;
    expect(rows.filter(r=>r.outcome==='ACCEPTED')).toHaveLength(9);
    expect(rows.filter(r=>r.outcome==='DUPLICATE')).toHaveLength(1);
    expect(rows.filter(r=>r.outcome==='REJECTED')).toHaveLength(2);
    expect(rows.filter(r=>r.outcome==='QUARANTINED')).toHaveLength(1);
  });
  it('removes the missing-settlement classification when a late counterpart arrives',()=>{
    const late=planImport(parseCsv('SETTLEMENT',fixtures.late),records.filter(r=>r.kind==='SETTLEMENT')).accepted;
    const output=reconcile([...records,...late],['DEMO-P008']);
    expect(output.find(x=>x.transactionRef==='DEMO-P009')?.codes).toEqual([]);
    expect(output.filter(x=>x.status==='MATCHED')).toHaveLength(3);
  });
  it('never combines multiple settlements into an exact match',()=>{
    expect(reconcile(records).find(x=>x.transactionRef==='DEMO-P004')?.codes).toContain('MULTIPLE_SETTLEMENTS');
  });
  it('gives the same results regardless of record ordering',()=>{
    expect(reconcile([...records].reverse(),['DEMO-P008'])).toEqual(reconcile(records,['DEMO-P008']));
  });
  it('produces deterministic benchmark fixtures with known all-matched outcomes',()=>{
    const fixture=benchmarkFixtures(100,42);expect(fixture).toEqual(benchmarkFixtures(100,42));
    const output=reconcile([...planImport(parseCsv('PAYMENT',fixture.PAYMENT),[]).accepted,...planImport(parseCsv('SETTLEMENT',fixture.SETTLEMENT),[]).accepted]);
    expect(output).toHaveLength(100);expect(output.every(x=>x.status==='MATCHED')).toBe(true);
  });
});
