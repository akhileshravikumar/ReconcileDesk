import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release, totalmem } from 'node:os';
import { mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsv,planImport,reconcile,type Kind } from './domain.js';
import { demoFixtures,demoExpected,benchmarkFixtures,projectRoot } from './fixtures.js';
const demo=demoFixtures();
const plans=(['PAYMENT','SETTLEMENT','REFUND'] as Kind[]).map(k=>planImport(parseCsv(k,demo[k]),[]));
const results=reconcile(plans.flatMap(p=>p.accepted),['DEMO-P008']);
assert.deepEqual(Object.fromEntries(results.map(x=>[x.transactionRef,x.codes])),demoExpected.initial);
const fixture=benchmarkFixtures(10000,42);
const timings=[];
for(let i=0;i<5;i++) {
  const started=performance.now();
  const payments=planImport(parseCsv('PAYMENT',fixture.PAYMENT),[]).accepted;
  const settlements=planImport(parseCsv('SETTLEMENT',fixture.SETTLEMENT),[]).accepted;
  const output=reconcile([...payments,...settlements]);
  assert.equal(output.length,10000);assert.equal(output.filter(x=>x.status==='MATCHED').length,10000);
  timings.push(Math.round((performance.now()-started)*100)/100);
}
const report={measuredAt:new Date().toISOString(),scope:'In-process CSV parsing, classification and reconciliation only; excludes upload, queue, database, HTTP and Docker.',
  environment:{node:process.version,platform:platform(),osRelease:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem()},
  demo:{groups:11,correctClassifications:11},benchmark:{seed:42,payments:10000,settlements:10000,runsMs:timings,meanMs:timings.reduce((a,b)=>a+b,0)/timings.length}};
const folder=join(projectRoot,'metrics','runs');await mkdir(folder,{recursive:true});
const destination=join(folder,`engine-${Date.now()}.json`);await writeFile(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));console.log(`Saved ${destination}`);
