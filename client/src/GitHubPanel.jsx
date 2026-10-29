import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';

const TABS = [['issues', 'Issues'], ['pulls', 'Pull requests'], ['commits', 'Commits']];
const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

export default function GitHubPanel({ projectId, isOwner, onImported }) {
  const [info, setInfo] = useState(null);
  const [repos, setRepos] = useState(null);
  const [pick, setPick] = useState('');
  const [kind, setKind] = useState('issues');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadInfo = () => api(`/projects/${projectId}/github`).then(setInfo).catch((e) => setError(e.message));
  useEffect(() => { loadInfo(); }, [projectId]);

  useEffect(() => {
    if (info && !info.repo && isOwner && info.myConnected && !repos)
      api('/github/repos').then(setRepos).catch((e) => setError(e.message));
  }, [info]);

  const loadItems = (fresh) => {
    setItems(null);
    setError('');
    api(`/projects/${projectId}/github/activity?kind=${kind}${fresh ? '&fresh=1' : ''}`)
      .then(setItems)
      .catch((e) => { setError(e.message); setItems([]); });
  };
  useEffect(() => { if (info?.repo) loadItems(false); }, [info?.repo, kind]);

  const link = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api(`/projects/${projectId}/github`, { method: 'PUT', body: { repo: pick } }); setPick(''); await loadInfo(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const unlink = async () => {
    if (!confirm('Unlink this repository? Tasks already imported stay on the board.')) return;
    try { await api(`/projects/${projectId}/github`, { method: 'DELETE' }); setItems(null); await loadInfo(); } catch (err) { setError(err.message); }
  };
  const importIssue = async (issue) => {
    setError('');
    try {
      const task = await api(`/projects/${projectId}/github/import`, { method: 'POST', body: { number: issue.number } });
      onImported(task);
      setItems((p) => p.map((i) => (i.id === issue.id ? { ...i, imported: true } : i)));
    } catch (err) { setError(err.message); }
  };

  if (!info) return <section className="panel gh-panel"><p className="muted">{error || 'Loading…'}</p></section>;

  return (
    <section className="panel gh-panel" aria-label="GitHub">
      <h2>GitHub</h2>

      {!info.repo && (
        <>
          {!info.configured && <p className="muted">GitHub isn’t set up on this server yet. See <Link to="/integrations">Integrations</Link>.</p>}
          {info.configured && !isOwner && <p className="muted">No repository is linked. The project owner can link one.</p>}
          {info.configured && isOwner && !info.myConnected && (
            <p className="muted">Connect your GitHub account first on the <Link to="/integrations">Integrations</Link> page.</p>
          )}
          {info.configured && isOwner && info.myConnected && (
            <form className="invite" onSubmit={link}>
              <input list="gh-repos" placeholder="owner/name, or pick one of yours" value={pick} onChange={(e) => setPick(e.target.value)} required aria-label="Repository" />
              <datalist id="gh-repos">
                {repos?.map((r) => <option key={r.full_name} value={r.full_name}>{r.private ? 'private' : 'public'}</option>)}
              </datalist>
              <button className="btn" disabled={busy}>Link repository</button>
            </form>
          )}
        </>
      )}

      {info.repo && (
        <>
          <div className="row-between">
            <a href={`https://github.com/${info.repo}`} target="_blank" rel="noreferrer"><b>{info.repo}</b></a>
            <span>
              <button className="link" onClick={() => loadItems(true)}>Refresh</button>
              {isOwner && <> · <button className="link" onClick={unlink}>Unlink</button></>}
            </span>
          </div>
          <p className="muted">Linked by {info.linked_by_name}. Activity is read through their GitHub connection.</p>

          <div className="tabs" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'tab on' : 'tab'} onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>

          {items === null && <p className="muted">Loading…</p>}
          {items?.length === 0 && !error && <p className="muted">Nothing here right now.</p>}
          <ul className="gh-list">
            {items?.map((i) => (
              <li key={i.id}>
                <div className="grow">
                  <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a>
                  <div className="muted">
                    {i.ref} · {i.author} · {day(i.date)}
                    {i.draft && ' · draft'}{i.branch && ` · ${i.branch}`}{i.comments > 0 && ` · ${i.comments} comments`}
                  </div>
                </div>
                {kind === 'issues' && (i.imported
                  ? <span className="muted">On board</span>
                  : <button className="link" onClick={() => importIssue(i)}>Add as task</button>)}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
