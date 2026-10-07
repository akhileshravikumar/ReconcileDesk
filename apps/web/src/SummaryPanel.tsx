import {useCallback,useEffect,useRef,useState} from 'react';
import {request,type User} from './client';
import './summaries.css';
type Claim={text:string;evidenceIds:string[]};
type Evidence={id:string;kind:string;data:Record<string,unknown>};
type Saved={id:string;sourceHash:string;status:string;stale:boolean;interrupted:boolean;model:string;promptVersion:string;priceVersion:string;createdAt:string;inputTokens:number|null;outputTokens:number|null;durationMs:number|null;chargedMicros:number;reservedMicros:number;error:string|null;context:{evidence:Evidence[];limitations:string[]};output:{findings:Claim[];suggestedChecks:Claim[];uncertainties:string[]}|null};
type View={enabled:boolean;model:string;sourceHash:string|null;blockedReason:string|null;budget:{limitMicros:number;spentMicros:number;reservedMicros:number;availableMicros:number;reservationMicros:number};summaries:Saved[]};
const usd=(micros:number)=>`$${(micros/1000000).toFixed(6)}`;
export function SummaryPanel({investigationId,user,version,snapshotId}:{investigationId:string;user:User;version:number;snapshotId:string|undefined}){
 const [view,setView]=useState<View|null>(null);const [selectedId,setSelectedId]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [source,setSource]=useState<Evidence|null>(null);const pending=useRef<{requestId:string;sourceHash:string;regenerate:boolean}|null>(null);
 const sequence=useRef(0);
 const load=useCallback(async()=>{const current=++sequence.current;try{const data=await request<View>(`/api/investigations/${investigationId}/summaries`);if(current===sequence.current)setView(data);}catch(e){if(current===sequence.current)setMessage(e instanceof Error?e.message:'Could not load summaries.');}},[investigationId]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load,version,snapshotId]);
 const selected=view?.summaries.find(x=>x.id===selectedId)??view?.summaries[0];
 const hasCurrent=view?.summaries.some(s=>s.status==='SUCCEEDED'&&!s.stale)??false;
 const active=view?.summaries.some(s=>s.status==='PENDING'&&!s.interrupted)??false;
 async function generate(regenerate:boolean){
  if(!view?.sourceHash)return;setBusy(true);setMessage('');setSource(null);
  if(!pending.current||pending.current.sourceHash!==view.sourceHash||pending.current.regenerate!==regenerate)pending.current={requestId:crypto.randomUUID(),sourceHash:view.sourceHash,regenerate};
  try{const result=await request<{request:Saved;reused:boolean}>(`/api/investigations/${investigationId}/summaries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current)});
   setSelectedId(result.request.id);pending.current=null;setMessage(result.request.status==='SUCCEEDED'?(result.reused?'Saved summary reused. No new model call.':'Summary saved. Review its claims against the evidence.'):result.request.error??'Request is still pending. Refresh its status.');await load();
  }catch(e){setMessage(e instanceof Error?e.message:'Generation failed. Refresh before trying again.');await load();}finally{setBusy(false);}
 }
 function exportEvaluation(){
  if(!selected)return;const data={status:'unreviewed',exportedAt:new Date().toISOString(),request:selected,review:{factualAccuracy:null,referencesValid:null,suggestionsClearlySeparated:null,missingEvidenceAcknowledged:null,injectionResistance:null,unsupportedClaimCount:null,totalFactualClaims:null,reviewerNotes:''}};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`summary-evaluation-${selected.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const citations=(claim:Claim)=><span className="ai-citations">{claim.evidenceIds.map(id=><button key={id} onClick={()=>setSource(selected?.context.evidence.find(e=>e.id===id)??null)}>{id}</button>)}</span>;
 return <section className="ai-panel" aria-label="AI summary"><div className="section-heading"><div><h3>AI summary</h3><p>Evidence-linked assistance for human review.</p></div><button disabled={busy} onClick={()=>{setMessage('');void load();}}>Refresh summaries</button></div>
 {message&&<p role="status" className="feedback">{message}</p>}
 {!view&&<p>Loading summary status…</p>}
 {view&&<><p className="ai-budget">Lifetime project budget: <strong>{usd(view.budget.limitMicros)}</strong> · Estimated used {usd(view.budget.spentMicros)} · Reserved {usd(view.budget.reservedMicros)} · Available {usd(view.budget.availableMicros)}</p>
 {!view.enabled&&<p className="muted">Live AI is disabled. Saved summaries remain readable. Follow the private setup guide to enable generation.</p>}
 {view.blockedReason&&<p className="feedback">{view.blockedReason}</p>}
 {user.role==='OPERATOR'&&<div className="ai-actions"><button disabled={busy||!view.enabled||!view.sourceHash||active||(!hasCurrent&&view.budget.availableMicros<view.budget.reservationMicros)} onClick={()=>{void generate(false);}}>{busy?'Generating…':hasCurrent?'Use saved summary':'Generate AI summary'}</button>
 {hasCurrent&&<button disabled={busy||!view.enabled||!view.sourceHash||active||view.budget.availableMicros<view.budget.reservationMicros} onClick={()=>{void generate(true);}}>Regenerate (paid call)</button>}
 <small>A new call reserves up to {usd(view.budget.reservationMicros)}. No automatic paid retries.</small></div>}
 {user.role==='VIEWER'&&<p className="muted">Viewer access: you can read saved summaries and source evidence.</p>}
 {active&&<p>Generation is in progress. Refresh summaries to check its status.</p>}
 {!view.summaries.length&&<p>No AI summary has been generated for this investigation.</p>}
 {view.summaries.length>1&&<label>Summary history (latest 10)<select aria-label="Summary history" value={selected?.id??''} onChange={e=>{setSelectedId(e.target.value);setSource(null);}}>{view.summaries.map(s=><option key={s.id} value={s.id}>{new Date(s.createdAt).toLocaleString()} · {s.status}</option>)}</select></label>}
 {selected&&<article className="ai-result"><p><strong>{selected.status}</strong> · {selected.model} · {new Date(selected.createdAt).toLocaleString()}</p>
 {selected.stale&&<p className="feedback">Source evidence has changed. This saved summary may be outdated.</p>}
 {(selected.status==='UNKNOWN'||selected.interrupted)&&<p className="feedback">Usage is uncertain or the request was interrupted. Its full reservation remains counted against the budget.</p>}
 {selected.error&&<p>{selected.error}</p>}
 {selected.output&&<><h4>Findings</h4><ul>{selected.output.findings.map((c,i)=><li key={i}>{c.text} {citations(c)}</li>)}</ul><h4>Suggested checks</h4><ul>{selected.output.suggestedChecks.map((c,i)=><li key={i}>{c.text} {citations(c)}</li>)}</ul><h4>Uncertainties</h4><ul>{selected.output.uncertainties.map((s,i)=><li key={i}>{s}</li>)}</ul><p className="muted">Citations identify supplied evidence; they do not guarantee every claim is correct. AI cannot change financial records or resolve investigations.</p></>}
 {selected.context.limitations.map((text,i)=><p className="muted" key={i}>{text}</p>)}
 {source&&<div className="ai-evidence"><h4>Evidence: {source.id}</h4><p>{source.kind.replaceAll('_',' ')} · Amounts ending in Paise are integer paise.</p><pre>{JSON.stringify(source.data,null,2)}</pre></div>}
 <p className="muted">Input tokens: {selected.inputTokens??'unknown'} · Output tokens: {selected.outputTokens??'unknown'} · Estimated cost: {selected.inputTokens===null?'unknown':usd(selected.chargedMicros)} · Duration: {selected.durationMs===null?'unknown':`${selected.durationMs} ms`}</p>
 <button onClick={exportEvaluation}>Export summary for evaluation</button></article>}
 </>}
 </section>;
}
