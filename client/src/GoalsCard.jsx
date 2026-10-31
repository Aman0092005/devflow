import { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtDate } from './dates.js';
import { useLiveRefresh } from './useLive.js';

const META = {
  tasks_done: { label: 'Tasks finished', unit: 'tasks' },
  dsa_solved: { label: 'DSA problems solved', unit: 'problems' },
  dsa_revised: { label: 'DSA revisions', unit: 'revisions' },
  focus_minutes: { label: 'Focus time', unit: 'min' },
};
const PRESETS = [
  { metric: 'dsa_solved', target: 5, text: 'Solve 5 DSA problems' },
  { metric: 'tasks_done', target: 10, text: 'Finish 10 tasks' },
  { metric: 'focus_minutes', target: 360, text: 'Focus for 6 hours' },
  { metric: 'dsa_revised', target: 10, text: 'Revise 10 problems' },
];

function Ring({ value, target }) {
  const r = 26, c = 2 * Math.PI * r;
  const pct = Math.min(1, value / target);
  return (
    <svg viewBox="0 0 64 64" className="ring" role="img" aria-label={`${value} of ${target}`}>
      <circle cx="32" cy="32" r={r} className="ring-bg" />
      <circle cx="32" cy="32" r={r} className={`ring-fg ${value >= target ? 'done' : ''}`} strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="36" textAnchor="middle" className="ring-text">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

export default function GoalsCard() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');

  const load = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    api(`/goals?today=${today}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`).then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, []);
  useLiveRefresh(load);
  useEffect(() => { window.addEventListener('focus', load); return () => window.removeEventListener('focus', load); }, []);

  const setGoal = async (metric, target) => {
    setError('');
    try { await api('/goals', { method: 'POST', body: { metric, target } }); load(); } catch (err) { setError(err.message); }
  };
  const removeGoal = async (g) => {
    try { await api(`/goals/${g.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  };

  if (!data) return error ? <p className="error">{error}</p> : null;
  const { goals } = data;
  const hit = goals.filter((g) => g.progress >= g.target).length;

  return (
    <section className="panel goals" aria-label="Weekly goals">
      <div className="row-between">
        <div>
          <h2>Weekly goals</h2>
          <span className="muted">{fmtDate(data.week_start)} – {fmtDate(data.week_end)}{goals.length > 0 ? ` · ${hit} of ${goals.length} reached` : ''}</span>
        </div>
        <button className="link" onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : goals.length ? 'Edit goals' : 'Set goals'}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {goals.length === 0 && !editing && (
        <div>
          <p className="muted">Pick a target for the week and watch the ring fill up.</p>
          <div className="chips">{PRESETS.map((p) => <button key={p.metric} className="chip" onClick={() => setGoal(p.metric, p.target)}>{p.text}</button>)}</div>
        </div>
      )}

      {goals.length > 0 && (
        <div className="goal-grid">
          {goals.map((g) => (
            <div key={g.id} className="goal">
              <Ring value={g.progress} target={g.target} />
              <div>
                <b>{META[g.metric].label}</b>
                <div>{g.progress} / {g.target} {META[g.metric].unit}{g.progress >= g.target ? ' ✓' : ''}</div>
                <div className="muted">Last week: {g.last_week}{g.last_week >= g.target ? ' ✓' : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="goal-edit">
          {Object.entries(META).map(([metric, m]) => {
            const g = goals.find((x) => x.metric === metric);
            const value = drafts[metric] ?? (g ? String(g.target) : '');
            return (
              <div key={metric} className="goal-edit-row">
                <label className="grow" htmlFor={`goal-${metric}`}>{m.label} <span className="muted">per week ({m.unit})</span></label>
                <input id={`goal-${metric}`} type="number" min="1" max="10000" value={value} placeholder="Off"
                  onChange={(e) => setDrafts({ ...drafts, [metric]: e.target.value })} />
                <button className="btn ghost" disabled={!value || Number(value) === g?.target} onClick={() => { setGoal(metric, Number(value)); setDrafts({ ...drafts, [metric]: undefined }); }}>Save</button>
                {g && <button className="link" onClick={() => removeGoal(g)}>Remove</button>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
