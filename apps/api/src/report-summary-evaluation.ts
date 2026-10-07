import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {z} from 'zod';
import {projectRoot} from './fixtures.js';
const index=process.argv.indexOf('--input');if(index<0||!process.argv[index+1])throw new Error('Supply --input with the folder containing exported summary-evaluation-*.json files. No API calls are made.');
const folder=resolve(process.argv[index+1]!);
const nullableScore=z.boolean().nullable();
const schema=z.object({request:z.object({id:z.string(),status:z.string(),model:z.string(),promptVersion:z.string(),durationMs:z.number().nonnegative().nullable(),chargedMicros:z.number().int().nonnegative(),inputTokens:z.number().int().nonnegative().nullable(),outputTokens:z.number().int().nonnegative().nullable()}),review:z.object({factualAccuracy:nullableScore,referencesValid:nullableScore,suggestionsClearlySeparated:nullableScore,missingEvidenceAcknowledged:nullableScore,injectionResistance:nullableScore,unsupportedClaimCount:z.number().int().nonnegative().nullable(),totalFactualClaims:z.number().int().nonnegative().nullable(),reviewerNotes:z.string()})});
const records=new Map<string,z.infer<typeof schema>>();
for(const name of (await readdir(folder)).filter(x=>/^summary-evaluation-.*\.json$/.test(x)).sort()){
 const record=schema.parse(JSON.parse(await readFile(join(folder,name),'utf8')));
 if(records.has(record.request.id))throw new Error('Duplicate request exports found. Keep one reviewed file per request.');
 if(record.review.unsupportedClaimCount!==null&&record.review.totalFactualClaims!==null&&record.review.unsupportedClaimCount>record.review.totalFactualClaims)throw new Error('Unsupported claim count exceeds the total.');
 records.set(record.request.id,record);
}
if(!records.size)throw new Error('No exported evaluation files found in this folder.');
const items=[...records.values()];const successful=items.filter(x=>x.request.status==='SUCCEEDED');
const keys=['factualAccuracy','referencesValid','suggestionsClearlySeparated','missingEvidenceAcknowledged','injectionResistance'] as const;
const reviewed=successful.filter(x=>keys.every(k=>x.review[k]!==null)&&x.review.totalFactualClaims!==null&&x.review.unsupportedClaimCount!==null);
const claims=reviewed.reduce((sum,x)=>sum+x.review.totalFactualClaims!,0);const unsupported=reviewed.reduce((sum,x)=>sum+x.review.unsupportedClaimCount!,0);
const durations=successful.map(x=>x.request.durationMs).filter((x):x is number=>x!==null).sort((a,b)=>a-b);
const knownCost=items.filter(x=>x.request.inputTokens!==null);
const report={measuredAt:new Date().toISOString(),scope:'User-selected exported requests; not a population-wide production benchmark. No model calls or automatic quality judges.',exportedRequests:items.length,successfulRequests:successful.length,fullyReviewedRequests:reviewed.length,models:[...new Set(items.map(x=>x.request.model))],promptVersions:[...new Set(items.map(x=>x.request.promptVersion))],rubricPassRate:reviewed.length?reviewed.filter(x=>keys.every(k=>x.review[k])).length/reviewed.length:null,unsupportedClaimRate:claims?unsupported/claims:null,p95SuccessfulLatencyMs:durations.length?durations[Math.ceil(durations.length*.95)-1]:null,knownEstimatedCostUsd:knownCost.reduce((s,x)=>s+x.request.chargedMicros,0)/1000000,unknownUsageRequests:items.length-knownCost.length,requestIds:items.map(x=>x.request.id)};
const directory=join(projectRoot,'evaluations/runs');await mkdir(directory,{recursive:true});const path=join(directory,`summary-review-${Date.now()}.json`);await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));console.log(`Saved ${path}`);
