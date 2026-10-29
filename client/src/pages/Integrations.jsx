import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

const MESSAGES = {
  connected: ['ok', 'GitHub connected.'],
  denied: ['error', 'You cancelled the connection, so nothing was changed.'],
  error: ['error', 'Couldn’t connect GitHub. Check the server settings and try again.'],
};

export default function Integrations() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [notice, setNotice] = useState(MESSAGES[params.get('github')] || null);
  const [error, setError] = useState('');

  const load = () => api('/github/status').then(setStatus).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    if (params.get('github')) setParams({}, { replace: true });
  }, []);

  const connect = async () => {
    setError('');
    try { window.location.href = (await api('/github/connect')).url; } catch (err) { setError(err.message); }
  };
  const disconnect = async () => {
    if (!confirm('Disconnect GitHub? Repositories you linked to projects will be unlinked.')) return;
    try { await api('/github', { method: 'DELETE' }); setNotice(['ok', 'GitHub disconnected.']); load(); } catch (err) { setError(err.message); }
  };

  return (
    <>
      <h1>Integrations</h1>
      <p className="muted lead">Connect outside tools to your projects.</p>
      {notice && <p role="status" className={notice[0] === 'ok' ? 'ok' : 'error'}>{notice[1]}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <section className="panel integ">
        <div className="row-between">
          <div>
            <h2>GitHub</h2>
            <p className="muted">Link a repository to a project, see its open issues, pull requests and commits, and turn issues into tasks.</p>
          </div>
          {status?.connected && <img className="gh-avatar" src={status.avatar_url} alt="" width="40" height="40" />}
        </div>

        {!status && <p className="muted">Loading…</p>}

        {status && !status.configured && (
          <div className="setup">
            <p><b>Setup needed.</b> This server doesn’t have GitHub credentials yet:</p>
            <ol>
              <li>On GitHub, open Settings → Developer settings → OAuth Apps → New OAuth App.</li>
              <li>Homepage URL: <code>http://localhost:5173</code>. Authorization callback URL: <code>http://localhost:4000/api/github/callback</code>.</li>
              <li>Copy the Client ID and generate a Client secret.</li>
              <li>Put <code>GITHUB_CLIENT_ID</code>, <code>GITHUB_CLIENT_SECRET</code>, <code>GITHUB_CALLBACK_URL</code> and <code>TOKEN_ENCRYPTION_KEY</code> in <code>server/.env</code>, then restart the API.</li>
            </ol>
          </div>
        )}

        {status?.configured && !status.connected && (
          <button className="btn" onClick={connect}>Connect GitHub</button>
        )}

        {status?.connected && (
          <div className="row-between">
            <span>Connected as <b>@{status.login}</b></span>
            <button className="link" onClick={disconnect}>Disconnect</button>
          </div>
        )}
      </section>
    </>
  );
}
