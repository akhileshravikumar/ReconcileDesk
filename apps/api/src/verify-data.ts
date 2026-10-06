import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {demoFixtures,demoExpected} from './fixtures.js';
// Credentials arrive over stdin, never command-line arguments or committed files.
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>16384)throw new Error('Credential input is too large.');}
const supplied=JSON.parse(input) as {email?:string;password?:string;accounts?:{email:string;password:string|null;role:string}[]};
const credentials=supplied.accounts?.find(a=>a.role==='OPERATOR'&&a.password)??supplied;
if(!credentials.email||!credentials.password)throw new Error('Supply operator email/password JSON on stdin. See scripts/Verify-Data.ps1.');
let cookie='';let csrfToken='';
const base=process.env.SMOKE_API_URL??'http://api:4000';
async function api(path:string,init?:RequestInit) {
  const r=await fetch(base+path,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),cookie,'x-csrf-token':csrfToken,'x-reconciledesk-client':'web'},signal:AbortSignal.timeout(150000)});
  const text=await r.text();
  if(!r.ok)throw new Error(`${r.status}: ${text}`);
  return text?JSON.parse(text):null;
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
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-reconciledesk-client':'web'},body:JSON.stringify({email:credentials.email,password:credentials.password}),signal:AbortSignal.timeout(15000)});
if(!login.ok)throw new Error(`Login failed (${login.status}). Check your operator credentials.`);
cookie=login.headers.get('set-cookie')?.split(';')[0]??'';
csrfToken=(await login.json()).csrfToken;
try {
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
console.log('Authenticated data verification passed.');
} finally {await api('/api/auth/logout',{method:'POST'});}
