import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { addDays } from './dates.js';
import { useLiveRefresh } from './useLive.js';

const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);
const WEEKS = 20, CELL = 14, GAP = 3, LEFT = 28, TOP = 16;

function Heatmap({ today, days }) {
  const counts = Object.fromEntries(days.map((d) => [d.day, d.n]));
  const start = addDays(today, -(WEEKS * 7 - 1));
  const gridStart = addDays(start, -new Date(`${start}T00:00:00`).getDay()); // back to the Sunday
  const cells = [];
  for (let d = gridStart, i = 0; d <= today; d = addDays(d, 1), i++) cells.push({ day: d, col: Math.floor(i / 7), row: i % 7, n: counts[d] || 0 });
  const cols = cells[cells.length - 1].col + 1;
  const total = cells.filter((c) => c.day >= start).reduce((s, c) => s + c.n, 0);

  const months = [];
  let prev = -1;
  cells.filter((c) => c.row === 0).forEach((c) => {
    const m = new Date(`${c.day}T00:00:00`).getMonth();
    if (m !== prev) { months.push({ col: c.col, label: new Date(`${c.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }) }); prev = m; }
  });

  const W = LEFT + cols * (CELL + GAP);
  const H = TOP + 7 * (CELL + GAP);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="heat" role="img" aria-label={`${total} activities in the last ${WEEKS} weeks`}>
        {months.map((m) => <text key={m.col} x={LEFT + m.col * (CELL + GAP)} y={10} className="chart-lbl">{m.label}</text>)}
        {[['Mon', 1], ['Wed', 3], ['Fri', 5]].map(([l, r]) => <text key={l} x={0} y={TOP + r * (CELL + GAP) + 11} className="chart-lbl">{l}</text>)}
        {cells.map((c) => (
          <rect key={c.day} x={LEFT + c.col * (CELL + GAP)} y={TOP + c.row * (CELL + GAP)} width={CELL} height={CELL} rx="2"
            className={`h${level(c.n)}${c.day < start ? ' pre' : ''}`}>
            <title>{`${c.n} ${c.n === 1 ? 'activity' : 'activities'} on ${new Date(`${c.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}</title>
          </rect>
        ))}
      </svg>
      <div className="heat-foot">
        <span className="muted">{total} activities in the last {WEEKS} weeks</span>
        <span className="legend muted">Less <i className="h0" /><i className="h1" /><i className="h2" /><i className="h3" /><i className="h4" /> More</span>
      </div>
    </>
  );
}

export default function DailyFocus() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    api(`/activity?today=${today}&tz=${encodeURIComponent(tz)}`).then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, []);
  useLiveRefresh(load);

  if (error) return <p className="error">{error}</p>;
  if (!data) return null;
  const { today, focus, up_next, revise_due, streak, today_count, days } = data;
  const state = (t) => (t.due_date && t.due_date.slice(0, 10) < today ? 'Overdue' : t.due_date && t.due_date.slice(0, 10) === today ? 'Due today' : 'In progress');
  const clear = focus.length === 0 && up_next.length === 0 && revise_due === 0;

  return (
    <div className="focus-grid">
      <section className="panel">
        <div className="row-between">
          <h2>Today</h2>
          <span className="muted">{streak > 0 ? `${streak}-day streak` : 'No streak yet'} · {today_count} done today</span>
        </div>
        {clear && <p className="muted">No open tasks are assigned to you. Add one on a board, or solve a DSA problem{streak > 0 ? ' to keep your streak going' : ''}.</p>}
        <ul className="rows">
          {revise_due > 0 && (
            <li><Link to="/dsa">{revise_due} DSA {revise_due === 1 ? 'problem' : 'problems'} to revise</Link><span className="tag due-tag">Revise</span></li>
          )}
          {focus.map((t) => (
            <li key={t.id}>
              <Link to={`/projects/${t.project_id}`} state={{ openTask: t.id }}>{t.title}</Link>
              <span className="muted">{t.project_name} <span className={`tag ${state(t) === 'Overdue' ? 'due-tag' : ''}`}>{state(t)}</span></span>
            </li>
          ))}
        </ul>
        {up_next.length > 0 && (
          <>
            <h3 className="up-next">{focus.length > 0 || revise_due > 0 ? 'Up next' : 'Nothing urgent. Up next'}</h3>
            <ul className="rows">
              {up_next.map((t) => (
                <li key={t.id}>
                  <Link to={`/projects/${t.project_id}`} state={{ openTask: t.id }}>{t.title}</Link>
                  <span className="muted">{t.project_name} <span className="tag">{t.priority}</span></span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="panel">
        <h2>Activity</h2>
        <Heatmap today={today} days={days} />
      </section>
    </div>
  );
}
