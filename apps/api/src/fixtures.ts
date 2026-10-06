import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { headers, type Kind } from './domain.js';

export const demoExpected={
  counts:{PAYMENT:9,SETTLEMENT:9,REFUND:5},
  imports:{PAYMENT:{total:13,accepted:9,duplicate:1,rejected:2,quarantined:1},SETTLEMENT:{total:9,accepted:9,duplicate:0,rejected:0,quarantined:0},REFUND:{total:5,accepted:5,duplicate:0,rejected:0,quarantined:0}},
  initial:{
    'DEMO-P001':[], 'DEMO-P002':['MISSING_SETTLEMENT'], 'DEMO-P003':['AMOUNT_MISMATCH'],
    'DEMO-P004':['MULTIPLE_SETTLEMENTS'], 'DEMO-P005':['SETTLEMENT_ARITHMETIC'],
    'DEMO-P006':['REFUND_EXCEEDS_PAYMENT'], 'DEMO-P007':[], 'DEMO-P008':['SOURCE_CONFLICT'],
    'DEMO-P009':['MISSING_SETTLEMENT'], 'DEMO-ORPHAN-PAY':['MISSING_PAYMENT'], 'DEMO-ORPHAN-REF':['ORPHAN_REFUND']
  }
};
const time='2026-10-01T10:00:00Z';
function csv(kind:Kind,rows:(string|number)[][]) {return headers[kind].join(',')+'\n'+rows.map(r=>r.join(',')).join('\n')+'\n';}
export function demoFixtures() {
  const payments:(string|number)[][]=Array.from({length:9},(_,i)=>[`DEMO-P00${i+1}`,(i+1)*10000,'INR',time]);
  payments.push([...payments[0]!],['DEMO-P008',80001,'INR',time],['DEMO-BAD-AMOUNT','12.34','INR',time],['DEMO-BAD-CURRENCY',1000,'USD',time]);
  const s=(id:string,ref:string,gross:number,fee:number,net:number)=>[id,ref,gross,fee,net,'INR',time];
  const settlements=[s('DEMO-S001','DEMO-P001',10000,200,9800),s('DEMO-S003','DEMO-P003',29000,580,28420),
    s('DEMO-S004A','DEMO-P004',20000,400,19600),s('DEMO-S004B','DEMO-P004',20000,400,19600),
    s('DEMO-S005','DEMO-P005',50000,1000,48000),s('DEMO-S006','DEMO-P006',60000,1200,58800),
    s('DEMO-S007','DEMO-P007',70000,1400,68600),s('DEMO-S008','DEMO-P008',80000,1600,78400),s('DEMO-S010','DEMO-ORPHAN-PAY',10000,200,9800)];
  const refunds=[['DEMO-R006A','DEMO-P006',35000,'INR',time],['DEMO-R006B','DEMO-P006',30000,'INR',time],
    ['DEMO-R007A','DEMO-P007',10000,'INR',time],['DEMO-R007B','DEMO-P007',5000,'INR',time],['DEMO-R010','DEMO-ORPHAN-REF',1000,'INR',time]];
  return {PAYMENT:csv('PAYMENT',payments),SETTLEMENT:csv('SETTLEMENT',settlements),REFUND:csv('REFUND',refunds),
    late:csv('SETTLEMENT',[s('DEMO-S009','DEMO-P009',90000,1800,88200)])};
}
export function benchmarkFixtures(count:number,seed:number) {
  let state=seed>>>0;
  const payments:(string|number)[][]=[];const settlements:(string|number)[][]=[];
  for(let i=1;i<=count;i++) {
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    const amount=10000+state%990000;const fee=200;const ref=`BENCH-${seed}-P${String(i).padStart(6,'0')}`;
    payments.push([ref,amount,'INR',time]);settlements.push([`BENCH-${seed}-S${String(i).padStart(6,'0')}`,ref,amount,fee,amount-fee,'INR',time]);
  }
  return {PAYMENT:csv('PAYMENT',payments),SETTLEMENT:csv('SETTLEMENT',settlements)};
}
export const projectRoot=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
async function safeWrite(path:string,data:string) {
  let existing:string|undefined;
  try {existing=await readFile(path,'utf8');} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(existing!==undefined&&existing!==data) throw new Error(`Refusing to replace changed fixture: ${path}`);
  await writeFile(path,data);
}
async function main() {
  const countArg=process.argv.indexOf('--count');const seedArg=process.argv.indexOf('--seed');
  const seed=seedArg===-1?42:Number(process.argv[seedArg+1]);
  const count=countArg===-1?0:Number(process.argv[countArg+1]);
  if(!Number.isInteger(count)||count<0||count>25000||!Number.isInteger(seed)||seed<0||seed>4294967295) throw new Error('count: 1-25000; seed: unsigned 32-bit integer. Omit count for the demo.');
  const directory=join(projectRoot,'data',count?'generated': 'demo',...(count?[`seed-${seed}-${count}`]:[]));
  await mkdir(directory,{recursive:true});
  if(count) {
    const fixtures=benchmarkFixtures(count,seed);
    await safeWrite(join(directory,'payments.csv'),fixtures.PAYMENT);await safeWrite(join(directory,'settlements.csv'),fixtures.SETTLEMENT);
    await safeWrite(join(directory,'expected.json'),JSON.stringify({seed,paymentCount:count,settlementCount:count,matchedGroups:count,exceptionGroups:0},null,2)+'\n');
  } else {
    const fixtures=demoFixtures();
    for(const [name,key] of [['payments.csv','PAYMENT'],['settlements.csv','SETTLEMENT'],['refunds.csv','REFUND'],['late-settlement.csv','late']] as const) await safeWrite(join(directory,name),fixtures[key]);
    await safeWrite(join(directory,'expected.json'),JSON.stringify(demoExpected,null,2)+'\n');
  }
  console.log(`Fixtures ready: ${directory}`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
