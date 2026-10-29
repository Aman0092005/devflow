import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDate } from '../dates.js';
import DailyFocus from '../DailyFocus.jsx';

const fmt = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/dashboard').then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { counts, dueSoon, recentNotes, activeProjects } = data;
  const open = counts.todo + counts.in_progress;

  return (
    <>
      <h1>Welcome back, {user.name.split(' ')[0]}</h1>
      <p className="muted lead">
        {open ? `${open} open task${open === 1 ? '' : 's'} across ${counts.projects} project${counts.projects === 1 ? '' : 's'}.` : 'Nothing open. Create a project to get started.'}
      </p>

      <div className="stats">
        <div className="stat"><b>{counts.todo}</b><span>To do</span></div>
        <div className="stat"><b>{counts.in_progress}</b><span>In progress</span></div>
        <div className="stat"><b>{counts.done}</b><span>Done</span></div>
        <div className="stat"><b>{counts.assigned_to_me}</b><span>Assigned to you</span></div>
        <div className="stat"><b>{counts.notes}</b><span>Notes</span></div>
      </div>

      <DailyFocus />

      <div className="grid-2">
        <section className="panel">
          <h2>Due soon</h2>
          {dueSoon.length === 0 && <p className="muted">No tasks with due dates. Add one on a board.</p>}
          <ul className="rows">
            {dueSoon.map((t) => (
              <li key={t.id}>
                <Link to={`/projects/${t.project_id}`}>{t.title}</Link>
                <span className="muted">{t.project_name} · {fmtDate(t.due_date)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Active projects</h2>
          {activeProjects.length === 0 && <p className="muted">No projects yet.</p>}
          <ul className="rows">
            {activeProjects.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`}><i className="dot" style={{ background: p.color }} />{p.name}</Link>
                <span className="muted">{p.done_count}/{p.task_count} done</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Recent notes</h2>
          {recentNotes.length === 0 && <p className="muted">No notes yet.</p>}
          <ul className="rows">
            {recentNotes.map((n) => (
              <li key={n.id}><Link to="/notes" state={{ open: n.id }}>{n.title}</Link><span className="muted">{fmt(n.updated_at)}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
