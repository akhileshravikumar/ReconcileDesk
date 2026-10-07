import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {costMicros,reservationMicros,validateSummary,sourceHash,providerReplySchema,type SummaryContext} from '../src/summary-contract.js';
const context:SummaryContext={transactionRef:'P1',runId:'run',caseVersion:1,status:'OPEN',evidence:[{id:'finding',kind:'DETERMINISTIC_FINDING',data:{codes:['MISSING_SETTLEMENT']}}],limitations:[]};
const valid={findings:[{text:'Missing settlement.',evidenceIds:['finding']}],suggestedChecks:[{text:'Check the settlement file.',evidenceIds:['finding']}],uncertainties:['Cause unknown.']};
describe('AI contract and accounting',()=>{
 it('uses microdollars with upward rounding',()=>{expect(costMicros(3000,600)).toBe(2160);expect(costMicros(1,0)).toBe(1);expect(reservationMicros).toBe(14400);});
 it('accepts bounded claims with authorized references',()=>expect(validateSummary(valid,context)).toEqual(valid));
 it('rejects uncited findings',()=>expect(()=>validateSummary({...valid,findings:[{text:'Unsupported',evidenceIds:[]}]},context)).toThrow());
 it('rejects cross-case references',()=>expect(()=>validateSummary({...valid,findings:[{text:'Other case',evidenceIds:['P2']}]},context)).toThrow('outside'));
 it('rejects oversized output and unexpected fields',()=>{expect(()=>validateSummary({...valid,findings:[{text:'x'.repeat(701),evidenceIds:['finding']}]},context)).toThrow();expect(()=>validateSummary({...valid,writeFinancialRecords:true},context)).toThrow();});
 it('invalidates the cache when evidence or workflow changes',()=>expect(sourceHash({...context,caseVersion:2})).not.toBe(sourceHash(context)));
 it('rejects usage outside the reserved bound',()=>expect(providerReplySchema.safeParse({status:'COMPLETED',summary:valid,usage:{inputTokens:32001,outputTokens:10},error:null}).success).toBe(false));
});

const moneyContext:SummaryContext={...context,evidence:[{id:'finding',kind:'DETERMINISTIC_FINDING',data:{codes:['AMOUNT_MISMATCH'],details:{paymentPaise:'30000',grossPaise:'29000',netPaise:'28420'}}},{id:'note/n1',kind:'OPERATOR_NOTE_UNVERIFIED',data:{amountPaise:'99999'}}]};
const withText=(text:string)=>({...valid,findings:[{text,evidenceIds:['finding']}]});
describe('observed financial wording regressions',()=>{
 it('accepts supplied payment and gross amounts without derived arithmetic',()=>expect(()=>validateSummary(withText('Payment is 30000 paise and gross settlement is 29000 paise.'),moneyContext)).not.toThrow());
 it('rejects a rupee conversion even if arithmetically correct',()=>expect(()=>validateSummary(withText('Payment is 300.00 INR.'),moneyContext)).toThrow('converted'));
 it('rejects a new difference that is not supplied financial evidence',()=>expect(()=>validateSummary(withText('Check the 1580 paise difference.'),moneyContext)).toThrow('absent'));
 it('rejects invented limitation attribution separately from monetary errors',()=>expect(()=>validateSummary({...valid,uncertainties:['Limitations specify no additional evidence was provided.']},context)).toThrow('limitation'));
 it('rejects promotion of note-only amounts to financial facts',()=>expect(()=>validateSummary({...valid,findings:[{text:'Payment is 99999 paise.',evidenceIds:['note/n1']}]},moneyContext)).toThrow('absent'));
 it('rejects net as the amount mismatch basis even when the numbers exist',()=>expect(()=>validateSummary(withText('The net settlement is 28420 paise and differs from payment.'),moneyContext)).toThrow('net'));
 it('accepts a supplied limitation verbatim',()=>expect(()=>validateSummary({...valid,uncertainties:['Context limitations: only the latest five notes are included.']},{...context,limitations:['Context limitations: only the latest five notes are included.']})).not.toThrow());
 const fixture=JSON.parse(readFileSync(new URL('../../../evaluations/summary-contract-cases.json',import.meta.url),'utf8')) as {cases:{id:string;context:SummaryContext;candidate:unknown;expectedValid:boolean}[]};
 for(const c of fixture.cases.filter(c=>c.id.startsWith('live-v1-')))it(`replays ${c.id} without a model call`,()=>{const validate=()=>validateSummary(c.candidate,c.context);if(c.expectedValid)expect(validate).not.toThrow();else expect(validate).toThrow();});
});
