import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useFocus } from './focus.jsx';

const fmt = (sec) => {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function FocusPanel({ task }) {
  const { session, start, logged } = useFocus();
  const [stats, setStats] = useState(null);
  const [minutes, setMinutes] = useState(25);

  useEffect(() => { api(`/tasks/${task.id}/focus`).then(setStats).catch(() => {}); }, [task.id, logged]);
  const here = session && session.mode === 'focus' && session.taskId === task.id;

  return (
    <section className="focus-panel" aria-label="Focus timer">
      <div className="row-between">
        <h3>Focus</h3>
        {stats && stats.sessions > 0 && <span className="muted">{fmt(stats.total)} focused · {stats.sessions} {stats.sessions === 1 ? 'session' : 'sessions'}{stats.mine !== stats.total ? ` (you: ${fmt(stats.mine)})` : ''}</span>}
      </div>
      {here ? <p className="muted">A focus session is running on this task. Watch it in the sidebar.</p> : (
        <div className="invite">
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Session length">
            {[15, 25, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
          <button type="button" className="btn ghost" onClick={() => start({ taskId: task.id, projectId: task.project_id, title: task.title, minutes })}>Start focus session</button>
        </div>
      )}
    </section>
  );
}
