import { useEffect, useState } from 'react';
import { api } from './api.js';

export function SubtaskSuggester({ task, onCreated }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const suggest = async () => {
    setBusy(true); setError('');
    try {
      const d = await api(`/tasks/${task.id}/ai/breakdown`, { method: 'POST' });
      setItems(d.subtasks.map((s) => ({ ...s, on: true })));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const add = async () => {
    setAdding(true); setError('');
    try {
      for (const s of items.filter((i) => i.on)) {
        const t = await api(`/projects/${task.project_id}/tasks`, { method: 'POST', body: { title: s.title, priority: s.priority } });
        onCreated?.(t);
      }
      setItems(null);
    } catch (err) { setError(err.message); }
    finally { setAdding(false); }
  };

  const chosen = items?.filter((i) => i.on).length || 0;
  return (
    <div className="ai-box">
      {!items && <button type="button" className="btn ghost" onClick={suggest} disabled={busy}>{busy ? 'Thinking…' : 'Suggest subtasks with AI'}</button>}
      {items && (
        <>
          <p className="muted">Suggested subtasks. Untick any you don’t want; they’re added to To do. AI can be wrong, so review them.</p>
          <ul className="files">
            {items.map((s, i) => (
              <li key={i}>
                <label className="grow">
                  <input type="checkbox" checked={s.on} onChange={() => setItems((p) => p.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} /> {s.title}
                </label>
                <span className="tag">{s.priority}</span>
              </li>
            ))}
          </ul>
          <div className="modal-foot">
            <button type="button" className="link" onClick={() => setItems(null)}>Discard</button>
            <button type="button" className="btn" onClick={add} disabled={adding || chosen === 0}>{adding ? 'Adding…' : `Add ${chosen} to board`}</button>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function NoteSummary({ noteId, dirty }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setResult(null); setError(''); }, [noteId]);

  const run = async () => {
    setBusy(true); setError('');
    try { setResult(await api(`/notes/${noteId}/ai/summary`, { method: 'POST' })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="ai-box">
      <button type="button" className="btn ghost" onClick={run} disabled={busy || dirty} title={dirty ? 'Save the note first' : ''}>
        {busy ? 'Thinking…' : 'Summarize with AI'}
      </button>
      {dirty && <span className="muted"> Save the note first.</span>}
      {result && (
        <div className="ai-result">
          <p>{result.summary}</p>
          {result.actions.length > 0 && (<><b>Action items</b><ul>{result.actions.map((a, i) => <li key={i}>{a}</li>)}</ul></>)}
          <p className="muted">AI can be wrong. Check anything important.</p>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
