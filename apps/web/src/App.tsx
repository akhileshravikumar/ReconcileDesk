import {useEffect,useState,type FormEvent} from 'react';
import {request,setCsrfToken,ApiError,type User} from './client';
import {Workspace} from './Workspace';
import './auth.css';
export function App(){
  const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let mounted=true;
    const expire=()=>{setCsrfToken('');setUser(null);setError('Your session ended. Sign in again.');};
    window.addEventListener('session-expired',expire);
    request<{user:User;csrfToken:string}>('/api/auth/session').then(session=>{if(mounted){setCsrfToken(session.csrfToken);setUser(session.user);setError('');}})
      .catch(e=>{if(mounted)setError(e instanceof ApiError&&e.status===401?'': 'Cannot check your session. Check the local API and try signing in.');})
      .finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;window.removeEventListener('session-expired',expire);};
  },[]);
  async function login(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{const result=await request<{user:User;csrfToken:string}>('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})});setCsrfToken(result.csrfToken);setUser(result.user);setPassword('');}
    catch(e){setError(e instanceof Error?e.message:'Sign-in failed.');}finally{setBusy(false);}
  }
  async function logout(){
    try{await request('/api/auth/logout',{method:'POST'});setUser(null);setCsrfToken('');setError('');}
    catch(e){setError(e instanceof Error?e.message:'Could not sign out. Try again.');}
  }
  if(loading)return <main className="login-shell"><p>Checking your session…</p></main>;
  if(user)return <>{error&&<p className="error" role="alert">{error}</p>}<Workspace user={user} onLogout={()=>{void logout();}}/></>;
  return <main className="login-shell"><section className="login-card"><div className="brand"><span className="logo">R</span>ReconcileDesk</div><span className="eyebrow">PAYMENT OPERATIONS</span><h1>Welcome to your workspace.</h1><p>Sign in to reconcile records and investigate exceptions.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    <form onSubmit={e=>{void login(e);}}><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form>
    <p className="muted">Use one of the demo accounts created during setup. Viewer accounts can read reports; operator accounts can manage investigations.</p><small>Local portfolio demo · Synthetic data only</small></section></main>;
}
