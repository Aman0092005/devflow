import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS = [['todo', 'To solve'], ['attempted', 'Attempted'], ['solved', 'Solved'], ['revisit', 'Revisit']];
const today = () => new Date().toISOString().slice(0, 10);
const blank = { title: '', platform: 'LeetCode', url: '', topic: '', difficulty: 'medium', status: 'todo', next_review: '' };

export default function Dsa() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(blank);
  const [filters, setFilters] = useState({ q: '', status: '', difficulty: '' });
  const [error, setError] = useState('');

  const load = () => {
    const qs = new URLSearchParams(filters).toString();
    api(`/dsa?${qs}`).then(setItems).catch((e) => setError(e.message));
    api('/dsa/stats').then(setStats).catch(() => {});
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [filters]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/dsa', { method: 'POST', body: form });
      setForm({ ...blank, platform: form.platform });
      load();
    } catch (err) { setError(err.message); }
  };
  const patch = async (id, body) => {
    try { await api(`/dsa/${id}`, { method: 'PATCH', body }); load(); } catch (err) { setError(err.message); }
  };
  const remove = async (p) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    await api(`/dsa/${p.id}`, { method: 'DELETE' });
    load();
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h1>DSA tracker</h1>
      <p className="muted lead">Log problems, track what you've solved, and schedule revision.</p>

      {stats && (
        <div className="stats tracker-stats">
          <div className="stat"><b>{stats.solved}</b><span>Solved of {stats.total}</span></div>
          <div className="stat"><b className="diff-easy">{stats.easy}</b><span>Easy</span></div>
          <div className="stat"><b className="diff-medium">{stats.medium}</b><span>Medium</span></div>
          <div className="stat"><b className="diff-hard">{stats.hard}</b><span>Hard</span></div>
          <div className="stat"><b className={stats.review_due ? 'due' : ''}>{stats.review_due}</b><span>Due for revision</span></div>
        </div>
      )}

      <form className="inline-form panel" onSubmit={add}>
        <input placeholder="Problem title" value={form.title} onChange={set('title')} required />
        <input placeholder="Topic (e.g. Arrays)" value={form.topic} onChange={set('topic')} style={{ flex: '0 1 160px' }} />
        <select value={form.platform} onChange={set('platform')} aria-label="Platform">
          {['LeetCode', 'GeeksforGeeks', 'Codeforces', 'HackerRank', 'CodeChef', 'Other'].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={form.difficulty} onChange={set('difficulty')} aria-label="Difficulty">
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <select value={form.status} onChange={set('status')} aria-label="Status">
          {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input placeholder="Link (optional)" value={form.url} onChange={set('url')} />
        <input type="date" value={form.next_review} onChange={set('next_review')} aria-label="Revise on" title="Revise on" />
        <button className="btn">Add problem</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="filters">
        <input placeholder="Search title or topic" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })} aria-label="Filter by difficulty">
          <option value="">All difficulties</option>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
      </div>

      {items.length === 0 ? (
        <p className="muted">{filters.q || filters.status || filters.difficulty ? 'No problems match these filters.' : 'No problems yet. Add the first one above.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="dsa">
            <thead><tr><th>Problem</th><th>Topic</th><th>Difficulty</th><th>Status</th><th>Revise on</th><th></th></tr></thead>
            <tbody>
              {items.map((p) => {
                const due = p.next_review && p.next_review.slice(0, 10) <= today() && p.status !== 'todo';
                return (
                  <tr key={p.id}>
                    <td>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}<div className="muted">{p.platform}</div></td>
                    <td>{p.topic}</td>
                    <td className={`diff-${p.difficulty}`}>{p.difficulty}</td>
                    <td>
                      <select value={p.status} onChange={(e) => patch(p.id, { status: e.target.value })} aria-label={`Status of ${p.title}`}>
                        {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="date" className={due ? 'due' : ''} value={p.next_review ? p.next_review.slice(0, 10) : ''}
                        onChange={(e) => patch(p.id, { next_review: e.target.value || null })} aria-label={`Revise ${p.title} on`} />
                    </td>
                    <td><button className="link" onClick={() => remove(p)} aria-label={`Delete ${p.title}`}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
