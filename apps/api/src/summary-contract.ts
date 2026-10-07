import {z} from 'zod';
import {digest,InputError} from './domain.js';
export const model='gpt-4.1-mini';
export const promptVersion='case-summary-v2';
export const priceVersion='gpt41mini-standard-usd-2026-10-06';
export const maxInputTokens=32000;
export const maxOutputTokens=1000;
export const maxContextBytes=12000;
export function costMicros(input:number,output:number) {return Math.ceil((input*2+output*8)/5);}
export const reservationMicros=costMicros(maxInputTokens,maxOutputTokens);
export interface Evidence {id:string;kind:string;data:Record<string,unknown>}
export interface SummaryContext {transactionRef:string;runId:string;caseVersion:number;status:string;evidence:Evidence[];limitations:string[]}
export function sourceHash(context:SummaryContext){return digest(JSON.stringify({model,promptVersion,context}));}
const claim=z.object({text:z.string().trim().min(1).max(700),evidenceIds:z.array(z.string().min(1).max(100)).min(1).max(8)}).strict();
export const summarySchema=z.object({findings:z.array(claim).min(1).max(5),suggestedChecks:z.array(claim).min(1).max(4),uncertainties:z.array(z.string().trim().min(1).max(300)).max(4)}).strict();
export type Summary=z.infer<typeof summarySchema>;
export function validateSummary(value:unknown,context:SummaryContext):Summary {
 const parsed=summarySchema.safeParse(value);if(!parsed.success)throw new InputError('The AI response did not match the summary format.',502);
 const known=new Set(context.evidence.map(e=>e.id));
 if([...parsed.data.findings,...parsed.data.suggestedChecks].some(c=>c.evidenceIds.some(id=>!known.has(id))))throw new InputError('The AI response referenced evidence outside this investigation.',502);
 // These conservative checks address observed errors; they are not a semantic truth judge.
 const monetaryValues=(evidence:Evidence[])=>{
  const amounts=new Set<string>();
  const walk=(value:unknown)=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(key.endsWith('Paise')&&typeof item==='string'&&/^\d+$/.test(item))amounts.add(item);else if(item&&typeof item==='object')walk(item);}};
  for(const e of evidence)if(e.kind==='DETERMINISTIC_FINDING'||e.kind==='ACCEPTED_RECORD')walk(e.data);
  return amounts;
 };
 const finding=context.evidence.find(e=>e.kind==='DETERMINISTIC_FINDING');
 const codes=Array.isArray(finding?.data.codes)?finding.data.codes:[];
 const checkText=(text:string,evidence:Evidence[])=>{
  if(/(?:₹|\bINR\s*|\bRs\.?\s*)\d|\d[\d,.]*\s*(?:INR|rupees?|Rs\.?)\b/i.test(text))throw new InputError('The AI response converted money instead of using supplied integer paise.',502);
  const allowed=monetaryValues(evidence);
  for(const match of text.matchAll(/([-+]?\d[\d,]*(?:\.\d+)?)[\s-]+paise\b/gi))if(!allowed.has(match[1]!))throw new InputError('The AI response contains a paise amount absent from its cited financial evidence.',502);
  if(/\blimitations?\b/i.test(text)&&!context.limitations.includes(text))throw new InputError('The AI response attributed a limitation that was not supplied verbatim.',502);
  if(codes.includes('AMOUNT_MISMATCH')&&!codes.includes('SETTLEMENT_ARITHMETIC')&&/\bnet\b/i.test(text))throw new InputError('The AI response mixes net settlement into a gross-amount mismatch explanation.',502);
 };
 for(const claim of [...parsed.data.findings,...parsed.data.suggestedChecks])checkText(claim.text,context.evidence.filter(e=>claim.evidenceIds.includes(e.id)));
 for(const text of parsed.data.uncertainties)checkText(text,context.evidence);
 return parsed.data;
}
export const generationSchema=z.object({requestId:z.uuid(),sourceHash:z.string().regex(/^[0-9a-f]{64}$/),regenerate:z.boolean().default(false)}).strict();
export type Generation=z.infer<typeof generationSchema>;
export const providerReplySchema=z.object({status:z.enum(['COMPLETED','REJECTED']),summary:z.unknown().nullable(),usage:z.object({inputTokens:z.number().int().min(0).max(maxInputTokens),outputTokens:z.number().int().min(0).max(maxOutputTokens)}),error:z.enum(['REFUSED','INCOMPLETE','INVALID_OUTPUT']).nullable()}).strict();
export type ProviderReply=z.infer<typeof providerReplySchema>;
export type SummaryProvider=(context:SummaryContext,requestId:string)=>Promise<ProviderReply>;
export function httpSummaryProvider(url:string,token:string):SummaryProvider {
 return async(context,requestId)=>{
  const response=await fetch(new URL('/summaries',url),{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({context,requestId}),signal:AbortSignal.timeout(60000),redirect:'error'});
  if(!response.ok)throw new Error('AI service could not complete the request.');
  const text=await response.text();if(text.length>32000)throw new Error('AI response exceeded the size limit.');
  return providerReplySchema.parse(JSON.parse(text));
 };
}
