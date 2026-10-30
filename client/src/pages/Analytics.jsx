import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from '../dates.js';
import { useLiveRefresh } from '../useLive.js';

const fmtMin = (m) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);

function Bars({ data, tone, label, empty }) {
  if (data.every((d) => d.n === 0)) return <p className="muted chart-empty">{empty}</p>;
  const W = 560, H = 150, bw = W / data.length;
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={label} className="chart">
      <line x1="0" x2={W} y1={H} y2={H} className="chart-axis" />
      {data.map((d, i) => {
        const h = (d.n / max) * (H - 18);
        return (
          <g key={d.day}>
            <rect x={i * bw + 5} y={H - h} width={bw - 10} height={h} rx="2" className={`bar-${tone}`}>
              <title>{`${fmtDate(d.day)}: ${d.n}`}</title>
            </rect>
            {d.n > 0 && <text x={i * bw + bw / 2} y={H - h - 5} textAnchor="middle" className="chart-val">{d.n}</text>}
            {i % 2 === 0 && <text x={i * bw + bw / 2} y={H + 17} textAnchor="middle" className="chart-lbl">{fmtDate(d.day).replace(/^\w+ /, '')}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function HBars({ rows, tone, empty }) {
  if (rows.length === 0) return <p className="muted chart-empty">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hb-label">{r.label}</span>
          <span className="hb-track"><span className={`hb-fill bar-${tone}`} style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <b>{r.n}</b>
        </li>
      ))}
    </ul>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/analytics').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useLiveRefresh(load);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { kpi } = data;

  return (
    <>
      <h1>Analytics</h1>
      <p className="muted lead">How your work and practice are going.</p>

      <div className="stats">
        <div className="stat"><b>{kpi.done_7d}</b><span>Tasks done, last 7 days</span></div>
        <div className="stat"><b className={kpi.overdue ? 'due' : ''}>{kpi.overdue}</b><span>Overdue open tasks</span></div>
        <div className="stat"><b>{kpi.avg_days === null ? '–' : `${kpi.avg_days}d`}</b><span>Avg time to finish a task</span></div>
        <div className="stat"><b>{kpi.streak}</b><span>DSA streak (days)</span></div>
        <div className="stat"><b>{fmtMin(kpi.focus_7d_min || 0)}</b><span>Focused, last 7 days</span></div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Tasks completed, last 14 days</h2>
          <Bars data={data.tasksPerDay} tone="blue" label="Tasks completed per day over the last 14 days"
            empty="Nothing completed yet. Move a task to Done and it will show up here." />
        </section>
        <section className="panel">
          <h2>DSA problems solved, last 14 days</h2>
          <Bars data={data.dsaPerDay} tone="chalk" label="DSA problems solved per day over the last 14 days"
            empty="No problems solved in this period. Mark one as Solved in the tracker." />
        </section>
        <section className="panel">
          <h2>Focus time, last 14 days (minutes)</h2>
          <Bars data={data.focusPerDay} tone="green" label="Minutes of focus per day over the last 14 days"
            empty="No focus sessions yet. Open a task and click Start focus session." />
        </section>
        <section className="panel">
          <h2>Solved by topic</h2>
          <HBars rows={data.topics.map((t) => ({ label: t.topic, n: t.n }))} tone="green" empty="Solved problems will be grouped by topic here." />
        </section>
        <section className="panel">
          <h2>Open tasks by person</h2>
          <HBars rows={data.workload.map((w) => ({ label: w.name, n: w.n }))} tone="blue" empty="No open tasks right now." />
        </section>
      </div>
    </>
  );
}
