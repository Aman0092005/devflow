import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const COLORS = ['#f5d547', '#7ab8ff', '#6fd3a0', '#ff9b85', '#c9a7ff'];

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', color: COLORS[0] });
  const [error, setError] = useState('');

  const load = () => api('/projects').then(setProjects).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/projects', { method: 'POST', body: form });
      setForm({ name: '', description: '', color: form.color });
      load();
    } catch (err) { setError(err.message); }
  };

  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}" and its tasks for everyone?`)) return;
    try { await api(`/projects/${p.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  };
  const leave = async (p) => {
    if (!confirm(`Leave "${p.name}"?`)) return;
    try { await api(`/projects/${p.id}/members/${user.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  };

  return (
    <>
      <h1>Projects</h1>
      <form className="inline-form panel" onSubmit={create}>
        <input placeholder="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="What is it for? (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="swatches" role="radiogroup" aria-label="Project colour">
          {COLORS.map((c) => (
            <button type="button" key={c} role="radio" aria-checked={form.color === c} aria-label={c}
              className={form.color === c ? 'swatch on' : 'swatch'} style={{ background: c }}
              onClick={() => setForm({ ...form, color: c })} />
          ))}
        </div>
        <button className="btn">Create project</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {projects && projects.length === 0 && <p className="muted">No projects yet. Name one above to open its board.</p>}
      <div className="cards">
        {projects?.map((p) => (
          <article key={p.id} className="project" style={{ borderTopColor: p.color }}>
            <div className="row-between">
              <Link to={`/projects/${p.id}`}><h2>{p.name}</h2></Link>
              <span className={`badge ${p.role}`}>{p.role === 'owner' ? 'Owner' : 'Member'}</span>
            </div>
            <p className="muted">{p.description || 'No description'}</p>
            <div className="bar"><span style={{ width: p.task_count ? `${(p.done_count / p.task_count) * 100}%` : 0, background: p.color }} /></div>
            <div className="row-between">
              <span className="muted">{p.done_count}/{p.task_count} done · {p.member_count} {p.member_count === 1 ? 'person' : 'people'}</span>
              {p.role === 'owner'
                ? <button className="link" onClick={() => remove(p)}>Delete</button>
                : <button className="link" onClick={() => leave(p)}>Leave</button>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
