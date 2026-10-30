import { useState } from 'react';
import { api } from './api.js';

const COLORS = ['#ff9b85', '#f5d547', '#6fd3a0', '#7ab8ff', '#c9a7ff', '#5fd0d8', '#ff7eb6', '#9aa9bd'];

export default function LabelPicker({ task, labels, isOwner, onTaskLabels, onLabelsList }) {
  const chosen = task.label_ids || [];
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[3]);
  const [manage, setManage] = useState(false);
  const [error, setError] = useState('');

  const save = async (ids) => {
    const prev = chosen;
    onTaskLabels(task.id, ids);
    try { await api(`/tasks/${task.id}/labels`, { method: 'PUT', body: { label_ids: ids } }); }
    catch (err) { onTaskLabels(task.id, prev); setError(err.message); }
  };
  const toggle = (l) => { setError(''); save(chosen.includes(l.id) ? chosen.filter((x) => x !== l.id) : [...chosen, l.id]); };

  const create = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setError('');
    try {
      const l = await api(`/projects/${task.project_id}/labels`, { method: 'POST', body: { name: n, color } });
      onLabelsList([...labels, l]);
      setName('');
      save([...chosen, l.id]); // the new label goes straight onto this task
    } catch (err) { setError(err.message); }
  };

  const remove = async (l) => {
    if (!confirm(`Delete the label “${l.name}” from every task?`)) return;
    try { await api(`/labels/${l.id}`, { method: 'DELETE' }); onLabelsList(labels.filter((x) => x.id !== l.id)); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="labels-box">
      <div className="row-between">
        <h3>Labels</h3>
        {isOwner && labels.length > 0 && <button type="button" className="link" onClick={() => setManage((m) => !m)}>{manage ? 'Done' : 'Delete labels'}</button>}
      </div>
      {labels.length === 0 && <p className="muted">No labels yet. Create the first one below.</p>}
      <div className="label-row">
        {labels.map((l) => (
          <span key={l.id} className="label-wrap">
            <button type="button" className={`label label-btn ${chosen.includes(l.id) ? 'on' : ''}`} aria-pressed={chosen.includes(l.id)} onClick={() => toggle(l)}>
              <i style={{ background: l.color }} />{l.name}
            </button>
            {manage && <button type="button" className="link" onClick={() => remove(l)} aria-label={`Delete label ${l.name}`}>✕</button>}
          </span>
        ))}
      </div>
      <form className="label-new" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="New label (e.g. bug)" aria-label="New label name" />
        <span className="swatches" role="radiogroup" aria-label="Label colour">
          {COLORS.map((c) => (
            <button type="button" key={c} role="radio" aria-checked={color === c} aria-label={c}
              className={color === c ? 'swatch on' : 'swatch'} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </span>
        <button className="btn ghost" disabled={!name.trim()}>Add</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
