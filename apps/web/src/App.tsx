import { useEffect, useState } from 'react';
type Ready = { status: string; dependencies: Record<string, string> };
const services = [['database','PostgreSQL','Persistent records'],['redis','Redis','Queue connection'],['worker','Background worker','Job processing'],['aiService','Python service','AI service foundation']];
export function App() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  async function refresh() {
    setChecking(true);
    setError('');
    try {
      const response = await fetch('/api/ready', { signal: AbortSignal.timeout(5000) });
      const data: Ready = await response.json();
      if (!data.dependencies) throw new Error('Unexpected service response');
      setReady(data);
    } catch { setReady(null); setError('Cannot reach the API. Check that the local services are running.'); }
    finally { setChecking(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <div className="shell">
    <aside><div className="brand"><span className="logo">R</span>ReconcileDesk</div>
      <p className="sidebar-label">PAYMENT OPERATIONS</p>
      <div className="nav-active">Workspace overview</div>
      <div className="nav-future">Imports <span>Next</span></div>
      <div className="nav-future">Exceptions <span>Planned</span></div>
      <div className="nav-future">Audit history <span>Planned</span></div>
      <div className="sidebar-footer">Portfolio workspace<br/><small>Synthetic data only · INR</small></div>
    </aside>
    <main>
      <header><div><span className="eyebrow">RECONCILEDESK / FOUNDATION</span><h1>A clear view of every payment.</h1>
        <p className="intro">Import records, reconcile settlements, and investigate exceptions in one workspace.</p></div>
        <span className="badge">Milestone 2</span></header>
      <section className="hero"><div><span className="eyebrow">WORKSPACE STATUS</span><h2>Your foundation starts here.</h2>
        <p>The service foundation is ready to verify. Financial records and reconciliation workflows arrive in the next milestones.</p></div>
        <div className="hero-note"><span className="dot"/>Development environment<br/><small>No financial records loaded</small></div></section>
      <section className="section-heading"><div><h2>Service connectivity</h2><p>Live checks from your local environment.</p></div>
        <button onClick={() => { void refresh(); }} disabled={checking}>{checking ? 'Checking…' : 'Refresh checks'}</button></section>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="services" aria-live="polite">{services.map(([key, name, description]) => {
        const state = ready?.dependencies[key!] ?? 'not checked';
        return <article className="service" key={key}><div className="service-top"><span className="service-icon">{name?.slice(0,1)}</span>
          <span className={`status ${state === 'ok' ? 'online' : ''}`}>{state === 'ok' ? 'Connected' : state}</span></div>
          <h3>{name}</h3><p>{description}</p></article>;
      })}</div>
      <section className="roadmap"><div><span className="eyebrow">WHAT COMES NEXT</span><h2>From source records to clear decisions.</h2></div>
        <ol><li><strong>01 / Import and reconcile</strong><span>Validated CSVs and deterministic matching.</span></li>
          <li><strong>02 / Investigate exceptions</strong><span>Assignments, notes, and an audit history.</span></li>
          <li><strong>03 / Add AI assistance</strong><span>Evidence-based summaries with operator review.</span></li></ol></section>
      <footer>Foundation release 0.1.0 <span>AI summaries are not enabled in this milestone.</span></footer>
    </main>
  </div>;
}
