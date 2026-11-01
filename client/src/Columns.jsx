import { useState } from 'react';
import { api } from './api.js';

const STAGES = [['todo', 'Not started'], ['in_progress', 'In progress'], ['done', 'Done']];
const stageLabel = (s) => (STAGES.find(([v]) => v === s) || [])[1] || s;

export function ColumnMenu({ column, columns, count, onColumns, onTasks }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(column.name);
  const [moveTo, setMoveTo] = useState('');
  const [error, setError] = useState('');

  const index = columns.findIndex((c) => c.id === column.id);
  const others = columns.filter((c) => c.id !== column.id);
  const sameStage = columns.filter((c) => c.stage === column.stage).length;
  const target = moveTo || String((others.find((c) => c.stage === column.stage) || others[0])?.id || '');

  const run = async (request) => {
    setError('');
    try { return await request; } catch (err) { setError(err.message); return null; }
  };
  const rename = async (e) => {
    e.preventDefault();
    const d = await run(api(`/columns/${column.id}`, { method: 'PATCH', body: { name } }));
    if (d) onColumns(d.columns);
  };
  const move = async (direction) => {
    const d = await run(api(`/columns/${column.id}`, { method: 'PATCH', body: { direction } }));
    if (d) onColumns(d.columns);
  };
  const remove = async () => {
    if (!confirm(count > 0 ? `Delete “${column.name}” and move its ${count} task${count === 1 ? '' : 's'}?` : `Delete “${column.name}”?`)) return;
    const d = await run(api(`/columns/${column.id}${count > 0 ? `?move_to=${target}` : ''}`, { method: 'DELETE' }));
    if (d) { onColumns(d.columns); onTasks(d.tasks); }
  };

  return (
    <>
      <button className="link col-more" onClick={() => { setOpen((o) => !o); setName(column.name); }} aria-expanded={open} aria-label={`Options for ${column.name}`}>⋯</button>
      {open && (
        <div className="col-menu" role="dialog" aria-label={`Options for ${column.name}`}>
          <form onSubmit={rename} className="invite">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-label="Column name" required />
            <button className="btn ghost" disabled={!name.trim() || name.trim() === column.name}>Rename</button>
          </form>
          <p className="muted">Counts as: {stageLabel(column.stage)}</p>
          <div className="snippet-actions">
            <button className="btn ghost" onClick={() => move('left')} disabled={index === 0}>← Move left</button>
            <button className="btn ghost" onClick={() => move('right')} disabled={index === columns.length - 1}>Move right →</button>
          </div>
          {sameStage <= 1 ? (
            <p className="muted">This is the only {stageLabel(column.stage)} column, so it can’t be deleted.</p>
          ) : (
            <>
              {count > 0 && (
                <label className="field">Move its {count} task{count === 1 ? '' : 's'} to
                  <select value={target} onChange={(e) => setMoveTo(e.target.value)}>
                    {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
              <button className="link" onClick={remove}>Delete column</button>
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </>
  );
}

export function AddColumn({ projectId, onColumns }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [stage, setStage] = useState('in_progress');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const d = await api(`/projects/${projectId}/columns`, { method: 'POST', body: { name, stage } });
      onColumns(d.columns);
      setName(''); setOpen(false);
    } catch (err) { setError(err.message); }
  };

  if (!open) return <button className="col-add" onClick={() => setOpen(true)}>+ Add column</button>;
  return (
    <form className="col-add open stack" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Column name, e.g. In review" aria-label="New column name" required autoFocus />
      <label className="field">Counts as
        <select value={stage} onChange={(e) => setStage(e.target.value)}>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <p className="muted">This decides how its tasks are counted in stats, reminders and completion.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="snippet-actions"><button className="btn" disabled={!name.trim()}>Add</button><button type="button" className="link" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}
