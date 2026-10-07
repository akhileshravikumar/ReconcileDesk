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
