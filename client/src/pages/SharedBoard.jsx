import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate, today } from '../dates.js';

export default function SharedBoard() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api(`/shared/${token}`).then((d) => { setData(d); setError(''); }).catch((e) => setData((prev) => { if (!prev) setError(e.message); return prev; }));
    load();
    const timer = setInterval(load, 30000); // keeps the view fresh while it stays open
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (error) return <div className="auth-page"><div className="auth-card"><h1>DevFlow</h1><p className="error" role="alert">{error}</p><Link to="/" className="link underline">Go to DevFlow</Link></div></div>;
  if (!data) return <p className="center-note">Loading…</p>;

  const { project, columns, tasks, labels } = data;
  const labelById = Object.fromEntries(labels.map((l) => [l.id, l]));
  const now = today();

  return (
    <main className="main shared">
      <div className="head-row">
        <div>
          <h1><i className="dot big" style={{ background: project.color }} />{project.name}</h1>
          {project.description && <p className="muted lead">{project.description}</p>}
        </div>
        <div className="head-right">
          <span className="badge">View only</span>
          <Link to="/login" className="muted">Sign in to DevFlow</Link>
        </div>
      </div>

      <div className="board">
        {columns.map((col) => {
          const list = tasks.filter((t) => t.column_id === col.id);
          return (
            <section key={col.id} className="column">
              <div className="col-head"><h2>{col.name} <span className="muted">{list.length}</span></h2></div>
              {list.length === 0 && <p className="muted empty">Nothing here</p>}
              {list.map((t) => {
                const late = t.status !== 'done' && t.due_date && t.due_date.slice(0, 10) < now;
                return (
                  <article key={t.id} className={`task p-${t.priority}`}>
                    <span>{t.title}</span>
                    {t.description && <p className="muted task-desc">{t.description}</p>}
                    {t.label_ids.length > 0 && (
                      <div className="label-row">{t.label_ids.map((id) => labelById[id]).filter(Boolean).map((l) => <span key={l.id} className="label"><i style={{ background: l.color }} />{l.name}</span>)}</div>
                    )}
                    {t.checklist_total > 0 && (
                      <div className="bar mini" role="progressbar" aria-label="Checklist progress" aria-valuenow={t.checklist_done} aria-valuemin={0} aria-valuemax={t.checklist_total}>
                        <span style={{ width: `${(t.checklist_done / t.checklist_total) * 100}%`, background: 'var(--green)' }} />
                      </div>
                    )}
                    <div className="meta">
                      <span className="tag">{t.priority}</span>
                      {t.due_date && <span className={late ? 'due' : 'muted'}>Due {fmtDate(t.due_date)}</span>}
                      {t.checklist_total > 0 && <span className="muted">{t.checklist_done}/{t.checklist_total}</span>}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>
  );
}
