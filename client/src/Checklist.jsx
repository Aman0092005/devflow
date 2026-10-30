import { useEffect, useState } from 'react';
import { api } from './api.js';
import { getSocket } from './socket.js';

export default function Checklist({ task, refresh, onCounts }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const apply = (p) => { setItems(p.items); onCounts?.(task.id, p.total, p.done); };
  const load = () => api(`/tasks/${task.id}/checklist`).then(apply).catch((e) => setError(e.message));

  useEffect(() => { load(); }, [task.id, refresh]);

  // Ticks by other people show up live. (The board card's counts are updated by the board itself.)
  useEffect(() => {
    const s = getSocket();
    const onChange = ({ taskId, items: list }) => { if (taskId === task.id) setItems(list); };
    s.on('checklist:changed', onChange);
    return () => s.off('checklist:changed', onChange);
  }, [task.id]);

  const run = async (request) => {
    setError('');
    try { apply(await request); } catch (err) { setError(err.message); load(); }
  };

  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    run(api(`/tasks/${task.id}/checklist`, { method: 'POST', body: { text: t } }));
  };
  const toggle = (i) => {
    setItems((p) => p.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x))); // tick instantly, confirm with the server
    run(api(`/checklist/${i.id}`, { method: 'PATCH', body: { done: !i.done } }));
  };
  const remove = (i) => run(api(`/checklist/${i.id}`, { method: 'DELETE' }));

  const total = items?.length || 0;
  const done = items?.filter((i) => i.done).length || 0;

  return (
    <section className="checklist" aria-label="Checklist">
      <div className="row-between">
        <h3>Checklist</h3>
        {total > 0 && <span className="muted">{done} of {total}</span>}
      </div>
      {total > 0 && <div className="bar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}><span style={{ width: `${(done / total) * 100}%`, background: 'var(--green)' }} /></div>}
      <ul className="check-list">
        {items?.map((i) => (
          <li key={i.id}>
            <label className={`grow ${i.done ? 'done' : ''}`}>
              <input type="checkbox" checked={i.done} onChange={() => toggle(i)} /> {i.text}
            </label>
            <button type="button" className="link" onClick={() => remove(i)} aria-label={`Delete ${i.text}`}>✕</button>
          </li>
        ))}
      </ul>
      <form className="invite" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Add an item and press Enter" aria-label="New checklist item" />
        <button className="btn ghost" disabled={!text.trim()}>Add</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
