import { useEffect, useState } from 'react';
import { api } from './api.js';

const fmt = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const linkFor = (token) => `${window.location.origin}/invite/${token}`;

export default function InviteLinks({ projectId }) {
  const [links, setLinks] = useState(null);
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState(5);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api(`/projects/${projectId}/invites`).then(setLinks).catch((e) => setError(e.message)); }, [projectId]);

  const create = async () => {
    setBusy(true); setError('');
    try {
      const l = await api(`/projects/${projectId}/invites`, { method: 'POST', body: { days, maxUses } });
      setLinks((p) => [l, ...(p || [])]);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const copy = async (l) => {
    try { await navigator.clipboard.writeText(linkFor(l.token)); }
    catch { window.prompt('Copy this link:', linkFor(l.token)); }
    setCopied(l.id);
    setTimeout(() => setCopied((c) => (c === l.id ? null : c)), 2000);
  };

  const revoke = async (l) => {
    if (!confirm('Cancel this link? Anyone who hasn’t used it yet will no longer be able to join with it.')) return;
    try { await api(`/projects/${projectId}/invites/${l.id}`, { method: 'DELETE' }); setLinks((p) => p.filter((x) => x.id !== l.id)); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="invite-links">
      <h3>Invite link</h3>
      <p className="muted">Anyone with the link can sign up or sign in and join this project.</p>
      <div className="invite">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Link expires after">
          <option value={1}>Expires in 1 day</option><option value={7}>Expires in 7 days</option><option value={30}>Expires in 30 days</option>
        </select>
        <select value={maxUses === null ? 'any' : maxUses} onChange={(e) => setMaxUses(e.target.value === 'any' ? null : Number(e.target.value))} aria-label="Number of people who can use it">
          <option value={1}>1 person</option><option value={5}>Up to 5 people</option><option value="any">Unlimited</option>
        </select>
        <button className="btn" onClick={create} disabled={busy}>Create link</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="link-list">
        {links?.map((l) => (
          <li key={l.id}>
            <div className="grow">
              <code>{linkFor(l.token)}</code>
              <div className="muted">Expires {fmt(l.expires_at)} · used {l.uses}{l.max_uses === null ? '' : ` of ${l.max_uses}`}</div>
            </div>
            <button className="btn ghost" onClick={() => copy(l)}>{copied === l.id ? 'Copied' : 'Copy'}</button>
            <button className="link" onClick={() => revoke(l)}>Cancel</button>
          </li>
        ))}
      </ul>
      {links?.length === 0 && <p className="muted">No active links.</p>}
    </div>
  );
}
