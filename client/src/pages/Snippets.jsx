import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { LANGUAGES, renderCode } from '../code.js';
import { ago } from '../dates.js';

const LABEL = Object.fromEntries(LANGUAGES);

function SnippetForm({ initial, projects, onSave, onCancel }) {
  const [f, setF] = useState({
    title: initial?.title || '', language: initial?.language || 'javascript', code: initial?.code || '',
    notes: initial?.notes || '', tags: (initial?.tags || []).join(', '), project_id: initial?.project_id || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await onSave({ ...f, project_id: f.project_id ? Number(f.project_id) : null }); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <form className="panel stack snippet-form" onSubmit={submit}>
      <h2>{initial ? 'Edit snippet' : 'New snippet'}</h2>
      <div className="snippet-row">
        <label className="field grow">Title<input value={f.title} onChange={set('title')} maxLength={100} required autoFocus /></label>
        <label className="field">Language
          <select value={f.language} onChange={set('language')}>{LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>
      <label className="field">Code<textarea className="code-input" value={f.code} onChange={set('code')} spellCheck={false} required placeholder="Paste your code here" /></label>
      <div className="snippet-row">
        <label className="field grow">Tags (comma separated)<input value={f.tags} onChange={set('tags')} placeholder="array, sorting, helper" /></label>
        <label className="field">Project (optional)
          <select value={f.project_id} onChange={set('project_id')}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <label className="field">Notes (optional)<textarea className="short" value={f.notes} onChange={set('notes')} maxLength={2000} placeholder="When to use it, gotchas, links…" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-foot">
        <button type="button" className="link" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save snippet'}</button>
      </div>
    </form>
  );
}

export default function Snippets() {
  const location = useLocation();
  const [items, setItems] = useState(null);
  const [tags, setTags] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState({ q: location.state?.q || '', tag: '', language: '' });
  const [editing, setEditing] = useState(null); // null, 'new', or a snippet
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    const qs = new URLSearchParams(filters).toString();
    api(`/snippets?${qs}`).then(setItems).catch((e) => setError(e.message));
    api('/snippets/tags').then(setTags).catch(() => {});
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [filters]);
  useEffect(() => { api('/projects').then(setProjects).catch(() => {}); }, []);
  useEffect(() => { if (location.state?.q) setFilters((f) => ({ ...f, q: location.state.q })); }, [location.key]);

  const save = async (payload) => {
    if (editing === 'new') await api('/snippets', { method: 'POST', body: payload });
    else await api(`/snippets/${editing.id}`, { method: 'PATCH', body: payload });
    setEditing(null);
    load();
  };
  const remove = async (s) => {
    if (!confirm(`Delete “${s.title}”?`)) return;
    try { await api(`/snippets/${s.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  };
  const copy = async (s) => {
    try { await navigator.clipboard.writeText(s.code); } catch { window.prompt('Copy the code:', s.code); }
    setCopied(s.id);
    setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 2000);
  };

  const filtersOn = filters.q || filters.tag || filters.language;
  return (
    <>
      <div className="row-between">
        <div>
          <h1>Snippets</h1>
          <p className="muted lead">Code you want to reuse, with highlighting, tags and one-click copy.</p>
        </div>
        {!editing && <button className="btn" onClick={() => setEditing('new')}>New snippet</button>}
      </div>

      {editing && <SnippetForm initial={editing === 'new' ? null : editing} projects={projects} onSave={save} onCancel={() => setEditing(null)} />}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="filters">
        <input placeholder="Search title, notes or code" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.language} onChange={(e) => setFilters({ ...filters, language: e.target.value })} aria-label="Filter by language">
          <option value="">All languages</option>
          {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {filtersOn && <button className="link" onClick={() => setFilters({ q: '', tag: '', language: '' })}>Clear filters</button>}
      </div>
      {tags.length > 0 && (
        <div className="tag-cloud" aria-label="Tags">
          {tags.map((t) => (
            <button key={t.tag} className={`tag-chip ${filters.tag === t.tag ? 'on' : ''}`} aria-pressed={filters.tag === t.tag}
              onClick={() => setFilters({ ...filters, tag: filters.tag === t.tag ? '' : t.tag })}>#{t.tag} <span className="muted">{t.n}</span></button>
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <p className="muted">{filtersOn ? 'No snippets match these filters.' : 'No snippets yet. Save the first piece of code you keep rewriting.'}</p>
      )}
      <div className="snippets">
        {items?.map((s) => (
          <article key={s.id} className="snippet">
            <div className="row-between">
              <h2>{s.title}</h2>
              <span className="badge">{LABEL[s.language] || s.language}</span>
            </div>
            {(s.tags.length > 0 || s.project_name) && (
              <div className="label-row">
                {s.tags.map((t) => <button key={t} className="tag-chip" onClick={() => setFilters({ ...filters, tag: t })}>#{t}</button>)}
                {s.project_name && <span className="tag">{s.project_name}</span>}
              </div>
            )}
            {s.notes && <p className="muted snippet-notes">{s.notes}</p>}
            <pre className="code"><code dangerouslySetInnerHTML={{ __html: renderCode(s.code, s.language) }} /></pre>
            <div className="row-between">
              <span className="muted">Updated {ago(s.updated_at)}</span>
              <span className="snippet-actions">
                <button className="btn ghost" onClick={() => copy(s)}>{copied === s.id ? 'Copied' : 'Copy'}</button>
                <button className="link" onClick={() => { setEditing(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                <button className="link" onClick={() => remove(s)}>Delete</button>
              </span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
