import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {projectRoot} from './fixtures.js';
import {validateSummary,type SummaryContext} from './summary-contract.js';
const dataset=JSON.parse(await readFile(join(projectRoot,'evaluations/summary-contract-cases.json'),'utf8')) as {datasetVersion:string;scope:string;cases:{id:string;context:SummaryContext;candidate:unknown;expectedValid:boolean}[]};
const results=dataset.cases.map(c=>{let accepted=false;try{validateSummary(c.candidate,c.context);accepted=true;}catch{/* Deliberately invalid candidates must be rejected. */}return {id:c.id,expectedValid:c.expectedValid,accepted,passed:accepted===c.expectedValid};});
const report={measuredAt:new Date().toISOString(),datasetVersion:dataset.datasetVersion,scope:dataset.scope,paidRequests:0,passed:results.filter(x=>x.passed).length,total:results.length,results,modelQuality:{status:'not_measured',factualAccuracy:null,unsupportedClaimRate:null,injectionResistance:null}};
const directory=join(projectRoot,'evaluations/runs');await mkdir(directory,{recursive:true});const path=join(directory,`summary-contract-${Date.now()}.json`);await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));console.log(`Saved ${path}`);if(report.passed!==report.total)process.exitCode=1;
