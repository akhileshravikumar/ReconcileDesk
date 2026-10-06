import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {demoFixtures,demoExpected} from './fixtures.js';
const base=process.env.SMOKE_API_URL??'http://api:4000';
async function api(path:string,init?:RequestInit) {
  const r=await fetch(base+path,{...init,signal:AbortSignal.timeout(150000)});
  const body=await r.json();if(!r.ok)throw new Error(`${r.status}: ${JSON.stringify(body)}`);return body;
}
async function upload(kind:string,source:string,name:string) {
  const batch=await api(`/api/imports/${kind}`,{method:'POST',headers:{'Content-Type':'text/csv','x-file-name':name},body:source});
  for(let n=0;n<180;n++) {
    const state=await api(`/api/imports/${batch.id}`);
    if(state.batch.status==='COMPLETED')return state.batch;
    if(state.batch.status==='FAILED')throw new Error(state.batch.error);
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error('Import did not finish within 90 seconds. Inspect the worker logs.');
}
const fixtures=demoFixtures();
const started=performance.now();
for(const kind of ['PAYMENT','SETTLEMENT','REFUND'] as const) {
  const batch=await upload(kind,fixtures[kind],`demo-${kind}.csv`);
  for(const [key,value] of Object.entries(demoExpected.imports[kind]))assert.equal(batch[key],value,`${kind}.${key}`);
  console.log(`PASS ${kind} import accounting`);
}
const before=await api('/api/workspace');
// A previous verification may already have added the late counterpart.
assert.equal(before.counts.PAYMENT,9,'Run the demo verification on this project fixture set only. No data is deleted by this command.');
assert.equal(before.counts.REFUND,5);assert.ok([9,10].includes(before.counts.SETTLEMENT));
const batchIds=await Promise.all(Array.from({length:5},()=>api('/api/imports/PAYMENT',{method:'POST',headers:{'Content-Type':'text/csv'},body:fixtures.PAYMENT})));
assert.equal(new Set(batchIds.map(x=>x.id)).size,1);
assert.deepEqual((await api('/api/workspace')).counts,before.counts);console.log('PASS five concurrent repeat uploads create no extra records');
const initial=await api('/api/reconciliation',{method:'POST'});
const repeated=await api('/api/reconciliation',{method:'POST'});
assert.equal(initial.run.id,repeated.run.id);assert.equal(repeated.reused,true);console.log('PASS unchanged snapshot reuses reconciliation run');
const expected:Record<string,string[]>={...demoExpected.initial};
if(before.counts.SETTLEMENT===10) expected['DEMO-P009']=[];
const result=await api('/api/reconciliation/latest');
assert.deepEqual(Object.fromEntries(result.items.map((x:{transactionRef:string;codes:string[]})=>[x.transactionRef,x.codes])),expected);
console.log('PASS all 11 expected classifications');
await upload('SETTLEMENT',fixtures.late,'late-settlement.csv');
await api('/api/reconciliation',{method:'POST'});
const after=await api('/api/reconciliation/latest');
assert.equal(after.run.matchedCount,3);assert.equal(after.run.exceptionCount,8);
assert.deepEqual(after.items.find((x:{transactionRef:string})=>x.transactionRef==='DEMO-P009').codes,[]);
console.log('PASS late settlement resolves the missing-counterpart classification');
console.log(JSON.stringify({scope:'Live demo verification; may reuse existing fixtures on reruns',wallTimeMs:Math.round(performance.now()-started),counts:(await api('/api/workspace')).counts}));
console.log('Milestone 3 data verification passed.');
