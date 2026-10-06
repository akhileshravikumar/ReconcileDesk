import {useCallback,useEffect,useState} from 'react';
import {request,type User} from './client';
type Case={id:string;transactionRef:string;status:'OPEN'|'IN_PROGRESS'|'RESOLVED';assigneeId:string|null;assignee:User|null;version:number;updatedAt:string};
type Note={id:string;body:string;kind:string;createdAt:string;author:User};
type Detail={investigation:Case&{notes:Note[]};finding:{status:string;codes:string[]}|null};
type Event={id:string;action:string;actorLabel:string;entityId:string;entityType:string;details:Record<string,unknown>;createdAt:string};
export function InvestigationDesk({user,snapshotId}:{user:User;snapshotId:string|undefined}){
  const operator=user.role==='OPERATOR';const [cases,setCases]=useState<Case[]>([]);const [total,setTotal]=useState(0);const [page,setPage]=useState(1);const [status,setStatus]=useState('');
  const [operators,setOperators]=useState<User[]>([]);const [selected,setSelected]=useState<Detail|null>(null);const [assignee,setAssignee]=useState('');const [note,setNote]=useState('');const [resolution,setResolution]=useState('');
  const [events,setEvents]=useState<Event[]>([]);const [auditTotal,setAuditTotal]=useState(0);const [auditPage,setAuditPage]=useState(1);const [auditEntity,setAuditEntity]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    try{const [list,people,history]=await Promise.all([
      request<{items:Case[];total:number}>(`/api/investigations?page=${page}&status=${status}`),request<{items:User[]}>('/api/operators'),
      request<{items:Event[];total:number}>(`/api/audit?page=${auditPage}&entityId=${encodeURIComponent(auditEntity)}`)]);
      setCases(list.items);setTotal(list.total);setOperators(people.items);setEvents(history.items);setAuditTotal(history.total);
    }catch(e){setMessage(e instanceof Error?e.message:'Cannot load investigations.');}
  },[page,status,auditPage,auditEntity]);
  useEffect(()=>{void load();},[load,snapshotId]);
  async function open(id:string){try{const detail=await request<Detail>(`/api/investigations/${id}`);setSelected(detail);setAssignee(detail.investigation.assigneeId??'');setNote('');setResolution('');setMessage('');}catch(e){setMessage(e instanceof Error?e.message:'Cannot open investigation.');}}
  async function act(action:Record<string,unknown>){
    if(!selected)return;setBusy(true);setMessage('');
    try{const updated=await request<Detail>(`/api/investigations/${selected.investigation.id}/actions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...action,version:selected.investigation.version})});
      setSelected(updated);setAssignee(updated.investigation.assigneeId??'');setNote('');setResolution('');setMessage('Investigation updated. Financial records and reconciliation findings were not changed.');await load();}
    catch(e){setMessage(e instanceof Error?e.message:'Update failed.');}finally{setBusy(false);}
  }
  return <><section className="panel" id="investigations"><div className="section-heading"><div><h2>Investigations</h2><p>Track ownership and review decisions separately from financial findings.</p></div><button onClick={()=>{void load();}}>Refresh investigations</button></div>
    {message&&<p className="feedback" role="status">{message}</p>}<label className="filter">Workflow status<select aria-label="Workflow status filter" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label>
    <div className="table-scroll"><table><thead><tr><th>Transaction</th><th>Workflow status</th><th>Assigned to</th><th>Open</th></tr></thead><tbody>{cases.map(item=><tr key={item.id}><td>{item.transactionRef}</td><td>{item.status.replaceAll('_',' ')}</td><td>{item.assignee?.displayName??'Unassigned'}</td><td><button onClick={()=>{void open(item.id);}}>Open investigation</button></td></tr>)}{!cases.length&&<tr><td colSpan={4}>No investigations in this view. Reconcile source records to identify exceptions.</td></tr>}</tbody></table></div>
    <div className="pager"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous cases</button><span>{total} cases · Page {page}</span><button disabled={page*50>=total} onClick={()=>setPage(p=>p+1)}>Next cases</button></div>
    {selected&&<div className="case-detail"><div className="section-heading"><div><h3>{selected.investigation.transactionRef}</h3><p>Workflow: {selected.investigation.status.replaceAll('_',' ')} · Version {selected.investigation.version}</p></div><button onClick={()=>{void open(selected.investigation.id);}}>Reload investigation</button></div>
      <p className="finding-note">Latest financial finding: <strong>{selected.finding?.status??'Unavailable'}</strong> · {selected.finding?.codes.join(', ')||'No current exception codes'}. Resolving this investigation does not remove financial findings.</p>
      {operator&&<><div className="case-controls"><label>Assigned operator<select aria-label="Assigned operator" value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Unassigned</option>{operators.map(person=><option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><button disabled={busy||assignee===(selected.investigation.assigneeId??'')} onClick={()=>{void act({action:'ASSIGN',assigneeId:assignee||null});}}>Save assignment</button></div>
        <label className="note-label">Investigation note<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={busy||!note.trim()} onClick={()=>{void act({action:'NOTE',body:note});}}>Add note</button>
        <div className="status-controls">{selected.investigation.status==='OPEN'&&<button disabled={busy} onClick={()=>{void act({action:'STATUS',status:'IN_PROGRESS'});}}>Start investigation</button>}
          {selected.investigation.status==='IN_PROGRESS'&&<><label className="note-label">Resolution note<textarea maxLength={2000} value={resolution} onChange={e=>setResolution(e.target.value)}/></label><button disabled={busy||!resolution.trim()} onClick={()=>{void act({action:'STATUS',status:'RESOLVED',note:resolution});}}>Resolve investigation</button></>}
          {selected.investigation.status==='RESOLVED'&&<button disabled={busy} onClick={()=>{void act({action:'STATUS',status:'OPEN'});}}>Reopen investigation</button>}</div></>}
      <h3>Notes</h3>{selected.investigation.notes.length?selected.investigation.notes.map(n=><article className="case-note" key={n.id}><small>{n.author.displayName} · {n.kind} · {new Date(n.createdAt).toLocaleString()}</small><p>{n.body}</p></article>):<p className="muted">No notes yet.</p>}
      <button onClick={()=>{setAuditEntity(selected.investigation.id);setAuditPage(1);}}>Show this investigation’s audit history</button></div>}
  </section><section className="panel" id="audit"><div className="section-heading"><div><h2>Audit history</h2><p>Read-only events with actors, timestamps and changes.</p></div><button onClick={()=>{if(!auditEntity&&auditPage===1)void load();setAuditEntity('');setAuditPage(1);}}>Show all events</button></div>
    {auditEntity&&<p className="muted">Filtered to investigation {auditEntity}</p>}<div className="table-scroll"><table><thead><tr><th>Time</th><th>Actor</th><th>Action / entity</th><th>Changes</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td>{event.actorLabel}</td><td>{event.action}<small>{event.entityType} · {event.entityId}</small></td><td><pre>{JSON.stringify(event.details,null,2)}</pre></td></tr>)}</tbody></table></div>
    <div className="pager"><button disabled={auditPage===1} onClick={()=>setAuditPage(p=>p-1)}>Previous events</button><span>{auditTotal} events · Page {auditPage}</span><button disabled={auditPage*50>=auditTotal} onClick={()=>setAuditPage(p=>p+1)}>Next events</button></div></section></>;
}
