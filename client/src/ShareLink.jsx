import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function ShareLink({ projectId }) {
  const [token, setToken] = useState(undefined); // undefined = loading, null = not shared
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api(`/projects/${projectId}/share`).then((d) => setToken(d.token)).catch((e) => setError(e.message)); }, [projectId]);

  const url = token ? `${window.location.origin}/shared/${token}` : '';
  const create = async () => { setError(''); try { setToken((await api(`/projects/${projectId}/share`, { method: 'POST' })).token); } catch (err) { setError(err.message); } };
  const stop = async () => {
    if (!confirm('Stop sharing? The current link will stop working for everyone.')) return;
    try { await api(`/projects/${projectId}/share`, { method: 'DELETE' }); setToken(null); } catch (err) { setError(err.message); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copy this link:', url); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="invite-links">
      <h3>View-only link</h3>
      <p className="muted">Anyone with the link can see this board without signing in. They’ll see task titles, descriptions, labels, due dates and checklist progress. They won’t see comments, files, people or emails, and they can’t change anything.</p>
      {token === null && <button className="btn" onClick={create}>Create view-only link</button>}
      {token && (
        <div className="link-list">
          <li style={{ listStyle: 'none' }}>
            <div className="grow"><code>{url}</code></div>
            <button className="btn ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            <button className="link" onClick={stop}>Stop sharing</button>
          </li>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
