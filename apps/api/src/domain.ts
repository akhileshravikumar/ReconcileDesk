import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export type Kind = 'PAYMENT' | 'SETTLEMENT' | 'REFUND';
export const ruleVersion = 'exact-inr-v1';
export const headers: Record<Kind,string[]> = {
  PAYMENT: ['transaction_ref','amount_paise','currency','paid_at'],
  SETTLEMENT: ['settlement_ref','transaction_ref','gross_paise','fee_paise','net_paise','currency','settled_at'],
  REFUND: ['refund_ref','transaction_ref','amount_paise','currency','refunded_at']
};
export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export interface RecordData {
  kind: Kind; reference: string; transactionRef: string;
  amountPaise: bigint; feePaise: bigint; netPaise: bigint;
  currency: string; occurredAt: Date; fingerprint: string;
}
export interface ParsedRow {
  rowNumber: number; raw: string[]; record?: RecordData; error?: string;
}
export function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function kindOf(value: unknown): Kind {
  if (value !== 'PAYMENT' && value !== 'SETTLEMENT' && value !== 'REFUND') throw new InputError('Choose PAYMENT, SETTLEMENT, or REFUND.');
  return value;
}
function reference(value: string | undefined, label: string) {
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) throw new InputError(`${label}: use 1-64 letters, digits, dots, hyphens or underscores; start with a letter or digit.`);
  return value;
}
function money(value: string | undefined, label: string, zero = false) {
  if (!value || !/^\d{1,19}$/.test(value)) throw new InputError(`${label}: use integer paise without signs, separators or decimals.`);
  const n = BigInt(value);
  if (n < (zero ? 0n : 1n) || n > 9223372036854775807n) throw new InputError(`${label}: amount is outside the supported range.`);
  return n;
}
function date(value: string | undefined) {
  const result = z.iso.datetime({offset:true}).safeParse(value);
  if (!result.success || Number.isNaN(Date.parse(result.data))) throw new InputError('Timestamp must be a valid ISO 8601 date with Z or an explicit offset.');
  return new Date(result.data);
}
export function serializeRecord(r: RecordData) {
  return {kind:r.kind,reference:r.reference,transactionRef:r.transactionRef,amountPaise:r.amountPaise.toString(),feePaise:r.feePaise.toString(),netPaise:r.netPaise.toString(),currency:r.currency,occurredAt:r.occurredAt.toISOString()};
}
export function parseCsv(kind: Kind, source: string): ParsedRow[] {
  if (Buffer.byteLength(source,'utf8') > 5*1024*1024) throw new InputError('File exceeds the 5 MiB limit.',413);
  let rows: string[][];
  try { rows = parse(source,{bom:true,skip_empty_lines:true,relax_column_count:true,max_record_size:16384,trim:true}) as string[][]; }
  catch { throw new InputError('Malformed CSV: check quoting, delimiters and record size. No rows were imported.'); }
  const head=rows.shift();
  if (!head || new Set(head).size!==head.length || head.length!==headers[kind].length || !headers[kind].every(h=>head.includes(h))) {
    throw new InputError(`Required columns (no extras or duplicates): ${headers[kind].join(',')}`);
  }
  if (!rows.length) throw new InputError('The file contains no data rows.');
  if (rows.length>25000) throw new InputError('Use at most 25,000 data rows per file.',413);
  return rows.map((raw,i) => {
    const rowNumber=i+2; // Logical CSV record number, not physical line for quoted multiline fields.
    try {
      if (raw.length!==head.length) throw new InputError('Column count does not match the header.');
      const x=Object.fromEntries(head.map((h,j)=>[h,raw[j]?.trim() ?? '']));
      if (x.currency!=='INR') throw new InputError('Only INR currency is supported.');
      const transactionRef=reference(x.transaction_ref,'transaction_ref');
      const ref=kind==='PAYMENT'?transactionRef:reference(x[kind==='SETTLEMENT'?'settlement_ref':'refund_ref'],'record reference');
      const r:RecordData={kind,reference:ref,transactionRef,
        amountPaise:money(x[kind==='SETTLEMENT'?'gross_paise':'amount_paise'],'amount'),
        feePaise:kind==='SETTLEMENT'?money(x.fee_paise,'fee_paise',true):0n,
        netPaise:kind==='SETTLEMENT'?money(x.net_paise,'net_paise',true):0n,
        currency:'INR',occurredAt:date(x[kind==='PAYMENT'?'paid_at':kind==='SETTLEMENT'?'settled_at':'refunded_at']),fingerprint:''};
      r.fingerprint=digest(JSON.stringify(serializeRecord(r)));
      return {rowNumber,raw,record:r};
    } catch(error) { return {rowNumber,raw,error:error instanceof Error?error.message:'Invalid row'}; }
  });
}
export interface Disposition {
  rowNumber:number; raw:string[]; outcome:'ACCEPTED'|'DUPLICATE'|'REJECTED'|'QUARANTINED';
  reference?:string; transactionRef?:string; existingTransactionRef?:string; reason?:string;
}
export function planImport(rows:ParsedRow[], existing:RecordData[]) {
  const known=new Map(existing.map(r=>[`${r.kind}/${r.reference}`,r]));
  const accepted:RecordData[]=[];
  const dispositions:Disposition[]=rows.map(row=> {
    const base={rowNumber:row.rowNumber,raw:row.raw};
    if (!row.record) return {...base,outcome:'REJECTED',reason:row.error};
    const r=row.record; const key=`${r.kind}/${r.reference}`; const previous=known.get(key);
    const identity={reference:r.reference,transactionRef:r.transactionRef};
    if (previous) return {...base,...identity,
      outcome:previous.fingerprint===r.fingerprint?'DUPLICATE':'QUARANTINED',
      existingTransactionRef:previous.transactionRef,
      reason:previous.fingerprint===r.fingerprint?'Identical normalized record already accepted.':'Conflicting identifier; accepted record was not changed.'};
    known.set(key,r); accepted.push(r);
    return {...base,...identity,outcome:'ACCEPTED'};
  });
  return {accepted,dispositions};
}
export interface ResultItem {transactionRef:string;status:'MATCHED'|'EXCEPTION';codes:string[];details:{paymentPaise:string|null;grossPaise:string;netPaise:string;refundPaise:string;settlementRefs:string[];refundRefs:string[]}}
export function reconcile(records:RecordData[], conflicts:string[]=[]):ResultItem[] {
  const groups=new Map<string,RecordData[]>();
  for (const r of records) { const group=groups.get(r.transactionRef)??[]; group.push(r); groups.set(r.transactionRef,group); }
  for (const ref of conflicts) if(!groups.has(ref)) groups.set(ref,[]);
  const blocked=new Set(conflicts);
  return [...groups].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([transactionRef,group])=> {
    const payment=group.find(r=>r.kind==='PAYMENT');
    const settlements=group.filter(r=>r.kind==='SETTLEMENT');
    const refunds=group.filter(r=>r.kind==='REFUND');
    const totalRefund=refunds.reduce((s,r)=>s+r.amountPaise,0n);
    const codes:string[]=[];
    if(payment) {
      if(!settlements.length) codes.push('MISSING_SETTLEMENT');
      else if(settlements.length>1) codes.push('MULTIPLE_SETTLEMENTS');
      else if(settlements[0]!.amountPaise!==payment.amountPaise) codes.push('AMOUNT_MISMATCH');
      if(totalRefund>payment.amountPaise) codes.push('REFUND_EXCEEDS_PAYMENT');
    } else {
      if(settlements.length) codes.push('MISSING_PAYMENT');
      if(refunds.length) codes.push('ORPHAN_REFUND');
    }
    if(settlements.some(r=>r.amountPaise-r.feePaise!==r.netPaise)) codes.push('SETTLEMENT_ARITHMETIC');
    if(blocked.has(transactionRef)) codes.push('SOURCE_CONFLICT');
    return {transactionRef,status:codes.length?'EXCEPTION':'MATCHED',codes:codes.sort(),details:{
      paymentPaise:payment?.amountPaise.toString()??null,
      grossPaise:settlements.reduce((s,r)=>s+r.amountPaise,0n).toString(),
      netPaise:settlements.reduce((s,r)=>s+r.netPaise,0n).toString(),refundPaise:totalRefund.toString(),
      settlementRefs:settlements.map(r=>r.reference).sort(),refundRefs:refunds.map(r=>r.reference).sort()
    }};
  });
}
