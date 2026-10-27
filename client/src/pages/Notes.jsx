import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';

export default function Notes() {
  const location = useLocation();
  const [notes, setNotes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [q, setQ] = useState('');
  const [current, setCurrent] = useState(null);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState('');

  const load = (query = q) => api(`/notes?q=${encodeURIComponent(query)}`).then(setNotes).catch((e) => setError(e.message));

  useEffect(() => {
    api('/projects').then(setProjects).catch(() => {});
  }, []);
  useEffect(() => { if (location.state?.open) open(location.state.open); }, [location.key]);
  useEffect(() => { const t = setTimeout(() => load(q), 250); return () => clearTimeout(t); }, [q]);

  const open = (id) => api(`/notes/${id}`).then((n) => { setCurrent(n); setSaved(true); });

  const create = async () => {
    const n = await api('/notes', { method: 'POST', body: { title: 'Untitled', content: '' } });
    setCurrent(n); setSaved(true); load();
  };
  const edit = (patch) => { setCurrent({ ...current, ...patch }); setSaved(false); };
  const save = async () => {
    try {
      await api(`/notes/${current.id}`, { method: 'PATCH', body: { title: current.title, content: current.content, project_id: current.project_id } });
      setCurrent(null); setSaved(true); load();
    } catch (err) { setError(err.message); }
  };
  const remove = async () => {
    if (!confirm('Delete this note?')) return;
    await api(`/notes/${current.id}`, { method: 'DELETE' });
    setCurrent(null); load();
  };

  return (
    <>
      <h1>Notes</h1>
      {error && <p className="error">{error}</p>}
      <div className="notes">
        <aside className="note-list">
          <div className="row-between">
            <input placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" onClick={create}>New note</button>
          </div>
          {notes.length === 0 && <p className="muted">{q ? 'No notes match that search.' : 'No notes yet. Start one with New note.'}</p>}
          {notes.map((n) => (
            <button key={n.id} className={`note-item ${current?.id === n.id ? 'on' : ''}`} onClick={() => open(n.id)}>
              <b>{n.title}</b><span className="muted">{n.preview || 'Empty note'}</span>
            </button>
          ))}
        </aside>
        <section className="editor">
          {!current ? <p className="muted">Pick a note or create a new one.</p> : (
            <>
              <input className="title-input" value={current.title} onChange={(e) => edit({ title: e.target.value })} aria-label="Note title" />
              <select value={current.project_id || ''} onChange={(e) => edit({ project_id: e.target.value ? Number(e.target.value) : null })} aria-label="Linked project">
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <textarea value={current.content} onChange={(e) => edit({ content: e.target.value })} placeholder="Write anything: snippets, decisions, links…" />
              <div className="row-between">
                <button className="link" onClick={remove}>Delete note</button>
                <div>
                  <span className="muted">{saved ? 'All changes saved' : 'Unsaved changes'}</span>{' '}
                  <button className="btn" onClick={save} disabled={saved}>Save note</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
