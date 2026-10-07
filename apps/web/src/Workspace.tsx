import { useCallback, useEffect, useState, type FormEvent } from 'react';
import './workspace.css';
import {request,type User} from './client';
import {InvestigationDesk} from './InvestigationDesk';
type Batch={id:string;kind:string;fileName:string;status:string;total:number;accepted:number;duplicate:number;rejected:number;quarantined:number;error:string|null};
type Run={id:string;createdAt:string;matchedCount:number;exceptionCount:number;paymentCount:number;groupCount:number;durationMs:number;ruleVersion:string};
type Workspace={batches:Batch[];counts:Record<string,number>;pending:number;rejected:number;quarantined:number;latest:Run|null};
type Item={transactionRef:string;status:string;codes:string[];details:{paymentPaise:string|null;grossPaise:string;netPaise:string;refundPaise:string;settlementRefs:string[];refundRefs:string[]}};
type Results={run:Run|null;items:Item[];total:number;page:number;pageSize:number};
type Row={rowNumber:number;outcome:string;reference:string|null;reason:string|null};
type Detail={batch:Batch;rows:Row[];total:number;page:number;pageSize:number};
const services=[['database','PostgreSQL'],['redis','Redis'],['worker','Background worker'],['aiService','Python service']];
const empty:Workspace={batches:[],counts:{},pending:0,rejected:0,quarantined:0,latest:null};
function inr(paise:string|null) {
  if(paise===null)return '—';const n=BigInt(paise);return `₹${(n/100n).toLocaleString('en-IN')}.${(n%100n).toString().padStart(2,'0')}`;
}
export function Workspace({user,onLogout}:{user:User;onLogout:()=>void}) {
  const operator=user.role==='OPERATOR';
  const [workspace,setWorkspace]=useState<Workspace>(empty);
  const [ready,setReady]=useState<Record<string,string>>({});
  const [results,setResults]=useState<Results>({run:null,items:[],total:0,page:1,pageSize:50});
  const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const [kind,setKind]=useState('PAYMENT');const [file,setFile]=useState<File|null>(null);
  const [page,setPage]=useState(1);const [exceptionsOnly,setExceptionsOnly]=useState(false);
  const [detail,setDetail]=useState<Detail|null>(null);
  const refresh=useCallback(async()=>{
    try {
      const [health,data,rows]=await Promise.all([
        fetch('/api/ready',{signal:AbortSignal.timeout(5000)}).then(r=>r.json()) as Promise<{dependencies:Record<string,string>}>,
        request<Workspace>('/api/workspace'),request<Results>(`/api/reconciliation/latest?page=${page}&exceptions=${exceptionsOnly}`)
      ]);
      setReady(health.dependencies??{});setWorkspace(data);setResults(rows);setError('');
    } catch {setReady({});setError('Cannot reach the API. Check the local services and refresh.');}
  },[page,exceptionsOnly]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>{void refresh();},5000);return()=>clearInterval(timer);},[refresh]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(!file)return;
    setBusy(true);setMessage('');
    try {
      if(file.size>5*1024*1024)throw new Error('Choose a CSV file no larger than 5 MiB.');
      const batch=await request<Batch>(`/api/imports/${kind}`,{method:'POST',headers:{'Content-Type':'text/csv','x-file-name':encodeURIComponent(file.name)},body:await file.text()});
      setMessage(batch.status==='COMPLETED'?'This file was already processed; no duplicate records were created.':'Import queued. The worker will validate and persist its rows.');
      await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:'Import failed.');}finally{setBusy(false);}
  }
  async function run() {
    setBusy(true);setMessage('');
    try {
      const result=await request<{reused:boolean}>('/api/reconciliation',{method:'POST'});
      setMessage(result.reused?'Records are unchanged; showing the existing reconciliation.':'Reconciliation complete.');
      setPage(1);await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:'Reconciliation failed.');}finally{setBusy(false);}
  }
  async function inspect(id:string,rowPage=1) {
    try {setDetail(await request<Detail>(`/api/imports/${id}?page=${rowPage}`));}
    catch(e){setMessage(e instanceof Error?e.message:'Cannot load import.');}
  }
  async function retry(id:string) {
    setBusy(true);try{await request(`/api/imports/${id}/retry`,{method:'POST'});await refresh();setMessage('Retry queued.');}
    catch(e){setMessage(e instanceof Error?e.message:'Retry failed.');}finally{setBusy(false);}
  }
  const total=Object.values(workspace.counts).reduce((s,n)=>s+n,0);
  return <div className="shell">
    <aside><div className="brand"><span className="logo">R</span>ReconcileDesk</div><p className="sidebar-label">PAYMENT OPERATIONS</p>
      <a className="nav-active" href="#overview">Workspace overview</a><a className="nav-future" href="#imports">Imports</a><a className="nav-future" href="#results">Reconciliation</a>
      <a className="nav-future" href="#investigations">Investigations</a><a className="nav-future" href="#audit">Audit history</a><div className="sidebar-footer">Portfolio workspace<br/><small>Synthetic data only · INR</small></div></aside>
    <main id="overview"><header><div><span className="eyebrow">RECONCILEDESK / RECONCILIATION</span><h1>A clear view of every payment.</h1><p className="intro">Compare source records, surface discrepancies, and trace every import.</p></div><div className="identity"><span className="badge">Milestone 5</span><strong>{user.displayName}</strong><small>{user.role}</small><button onClick={onLogout}>Sign out</button></div></header>
      <div className="local-note">{operator?'Operator access · Imports, reconciliation and investigations enabled.':'Viewer access · Reports and history are read-only.'}</div>
      {error&&<p className="error" role="alert">{error}</p>}
      <section className="section-heading"><div><h2>Service connectivity</h2><p>Live status, refreshed every five seconds.</p></div><button onClick={()=>{void refresh();}}>Refresh checks</button></section>
      <div className="services">{services.map(([key,name])=><article className="service" key={key}><span className={`status ${ready[key!]==='ok'?'online':''}`}>{ready[key!]==='ok'?'Connected':ready[key!]??'not checked'}</span><h3>{name}</h3></article>)}</div>
      <section className="metrics-grid" aria-label="Source record counts">{[['PAYMENT','Payments'],['SETTLEMENT','Settlements'],['REFUND','Refunds']].map(([key,label])=><article key={key}><span>{label}</span><strong>{workspace.counts[key!]??0}</strong></article>)}<article><span>Pending imports</span><strong>{workspace.pending}</strong></article></section>
      {!total&&<p className="muted">No financial records loaded</p>}
      {message&&<p className="feedback" role="status">{message}</p>}
      <section className="panel" id="imports"><div className="section-heading"><div><h2>Import source records</h2><p>CSV · integer paise · INR · maximum 5 MiB / 25,000 rows</p></div></div>
        <form className="upload-form" onSubmit={event=>{void submit(event);}}><label>Record type<select disabled={!operator} value={kind} onChange={e=>setKind(e.target.value)}><option value="PAYMENT">Payments</option><option value="SETTLEMENT">Settlements</option><option value="REFUND">Refunds</option></select></label>
          <label>CSV file<input disabled={!operator} type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]??null)}/></label><button className="primary" disabled={!operator||!file||busy} type="submit">Upload CSV</button></form>
        <p className="muted">Valid rows are accepted; rejected and quarantined rows remain visible in the import report. Identical repeats are skipped.</p>
        <div className="table-scroll"><table><caption>Most recent 20 imports</caption><thead><tr><th>File / type</th><th>Status</th><th>Accepted</th><th>Duplicate</th><th>Rejected</th><th>Quarantined</th><th>Details</th></tr></thead><tbody>
          {workspace.batches.map(batch=><tr key={batch.id}><td>{batch.fileName}<small>{batch.kind}</small></td><td>{batch.status}{batch.error&&<small>{batch.error}</small>}</td><td>{batch.accepted}</td><td>{batch.duplicate}</td><td>{batch.rejected}</td><td>{batch.quarantined}</td><td><button onClick={()=>{void inspect(batch.id);}}>View rows</button>{batch.status==='FAILED'&&<button disabled={!operator||busy} onClick={()=>{void retry(batch.id);}}>Retry</button>}</td></tr>)}
          {!workspace.batches.length&&<tr><td colSpan={7}>Upload the demo CSV files from data/demo to begin.</td></tr>}</tbody></table></div>
      </section>
      {detail&&<section className="panel" aria-label="Import row report"><div className="section-heading"><div><h2>Row report: {detail.batch.fileName}</h2><p>{detail.batch.status} · {detail.total} processed rows</p></div><button onClick={()=>setDetail(null)}>Close report</button></div>
        <div className="table-scroll"><table><thead><tr><th>CSV record</th><th>Reference</th><th>Outcome</th><th>Reason</th></tr></thead><tbody>{detail.rows.map(row=><tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.reference??'—'}</td><td>{row.outcome}</td><td>{row.reason??'Accepted'}</td></tr>)}</tbody></table></div>
        <div className="pager"><button disabled={detail.page===1} onClick={()=>{void inspect(detail.batch.id,detail.page-1);}}>Previous rows</button><span>Page {detail.page}</span><button disabled={detail.page*detail.pageSize>=detail.total} onClick={()=>{void inspect(detail.batch.id,detail.page+1);}}>Next rows</button></div></section>}
      <section className="panel" id="results"><div className="section-heading"><div><h2>Reconciliation results</h2><p>Deterministic matching · gross amounts compared before fees</p></div><button className="primary" disabled={!operator||busy||workspace.pending>0||!total} onClick={()=>{void run();}}>Run reconciliation</button></div>
        <p className="muted">Rejected source rows: {workspace.rejected} · Quarantined source rows: {workspace.quarantined}. These are not silently included in financial totals.</p>
        {results.run?<><div className="run-summary"><strong>{results.run.matchedCount} matched groups</strong><strong>{results.run.exceptionCount} exception groups</strong><span>Snapshot: {new Date(results.run.createdAt).toLocaleString()}</span></div>
          <p className="muted">Results describe the displayed snapshot. Rerun after importing additional records. One group represents one transaction reference; orphan references also form groups.</p>
          <label className="filter"><input type="checkbox" checked={exceptionsOnly} onChange={e=>{setExceptionsOnly(e.target.checked);setPage(1);}}/> Show exceptions only</label>
          <div className="table-scroll"><table><thead><tr><th>Transaction</th><th>Status / findings</th><th>Payment</th><th>Gross settled</th><th>Net settled</th><th>Refunded</th></tr></thead><tbody>{results.items.map(item=><tr key={item.transactionRef}><td>{item.transactionRef}<small>{item.details.settlementRefs.join(', ')}</small></td><td><span className={item.status==='MATCHED'?'online':'exception'}>{item.status}</span><small>{item.codes.join(', ')||'Exact match'}</small></td><td>{inr(item.details.paymentPaise)}</td><td>{inr(item.details.grossPaise)}</td><td>{inr(item.details.netPaise)}</td><td>{inr(item.details.refundPaise)}</td></tr>)}</tbody></table></div>
          <div className="pager"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous results</button><span>Page {page} · {results.total} groups</span><button disabled={page*results.pageSize>=results.total} onClick={()=>setPage(p=>p+1)}>Next results</button></div></>:<p className="empty-state">Import your source files, then run reconciliation to see matches and exceptions.</p>}
      </section><InvestigationDesk user={user} snapshotId={workspace.latest?.id}/><footer>Investigation release · Milestone 5<span>Financial decisions use fixed rules. AI summaries are not enabled.</span></footer>
    </main>
  </div>;
}
