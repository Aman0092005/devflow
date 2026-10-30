import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Invite() {
  const { token } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/invites/${token}`).then(setInfo).catch((e) => setError(e.message)); }, [token]);

  const join = async () => {
    setBusy(true); setError('');
    try {
      const r = await api(`/invites/${token}/accept`, { method: 'POST' });
      navigate(`/projects/${r.project_id}`);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>DevFlow</h1>
        {!info && !error && <p className="muted">Checking your invite…</p>}
        {error && (
          <>
            <p className="error" role="alert">{error}</p>
            <Link to="/" className="link underline">Go to DevFlow</Link>
          </>
        )}
        {info && !loading && (
          <>
            <p>{info.invited_by ? <b>{info.invited_by}</b> : 'Someone'} invited you to join <b>{info.project_name}</b>.</p>
            {user ? (
              <>
                <p className="muted">You’re signed in as {user.name}.</p>
                <button className="btn" onClick={join} disabled={busy}>{busy ? 'Joining…' : 'Join project'}</button>
              </>
            ) : (
              <>
                <p className="muted">Sign in or create an account to join. You’ll come straight back here.</p>
                <Link className="btn" to={`/login?next=${next}`}>Sign in</Link>
                <Link className="btn ghost" to={`/login?next=${next}&mode=register`}>Create an account</Link>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
