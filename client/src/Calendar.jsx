import { useState } from 'react';
import { addDays, today } from './dates.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');
const dow = (s) => new Date(`${s}T00:00:00`).getDay();
const firstOfMonth = (s) => `${s.slice(0, 8)}01`;
const addMonths = (s, n) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};

export default function Calendar({ tasks, onOpen, onSetDue }) {
  const [month, setMonth] = useState(firstOfMonth(today()));
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const now = today();
  const gridStart = addDays(month, -((dow(month) + 6) % 7)); // weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const byDay = {};
  for (const t of tasks) {
    if (!t.due_date) continue;
    const d = t.due_date.slice(0, 10);
    (byDay[d] = byDay[d] || []).push(t);
  }
  const undated = tasks.filter((t) => !t.due_date && t.status !== 'done');

  const chip = (t) => {
    const late = t.status !== 'done' && t.due_date && t.due_date.slice(0, 10) < now;
    return (
      <button key={t.id} draggable className={`cal-task p-${t.priority} ${t.status === 'done' ? 'done' : ''} ${late ? 'late' : ''}`}
        onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverDay(null); }}
        onClick={() => onOpen(t.id)} title={t.title}>
        {t.title}
      </button>
    );
  };

  const drop = (day) => {
    const t = tasks.find((x) => x.id === dragId);
    setDragId(null); setOverDay(null);
    if (t && (t.due_date || '').slice(0, 10) !== day) onSetDue(t, day);
  };

  return (
    <section aria-label="Calendar">
      <div className="cal-head">
        <button className="btn ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">‹</button>
        <h2>{new Date(`${month}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button className="btn ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">›</button>
        <button className="link" onClick={() => setMonth(firstOfMonth(now))}>Today</button>
      </div>

      {undated.length > 0 && (
        <div className="cal-undated">
          <span className="muted">No due date, drag onto a day:</span>
          <div className="cal-undated-list">{undated.slice(0, 12).map(chip)}{undated.length > 12 && <span className="muted">+{undated.length - 12} more</span>}</div>
        </div>
      )}

      <div className="cal-scroll">
        <div className="cal-grid">
          {WEEKDAYS.map((w) => <div key={w} className="cal-dow">{w}</div>)}
          {days.map((day) => {
            const list = byDay[day] || [];
            const open = expanded === day;
            const shown = open ? list : list.slice(0, 3);
            return (
              <div key={day} className={`cal-day ${day.slice(0, 7) !== month.slice(0, 7) ? 'out' : ''} ${day === now ? 'today' : ''} ${overDay === day ? 'over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverDay(day); }} onDragLeave={() => setOverDay((d) => (d === day ? null : d))}
                onDrop={() => drop(day)}>
                <span className="cal-num">{Number(day.slice(8))}</span>
                {shown.map(chip)}
                {list.length > 3 && <button className="link" onClick={() => setExpanded(open ? null : day)}>{open ? 'Show less' : `+${list.length - 3} more`}</button>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
