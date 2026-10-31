import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';

const STATUS = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

export default function SearchPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setData(null); setActive(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(term)}`)
        .then((d) => { if (!cancelled) { setData(d); setActive(0); } })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  const items = data ? [
    ...data.projects.map((p) => ({ key: `p${p.id}`, group: 'Projects', label: p.name, sub: p.description, go: () => navigate(`/projects/${p.id}`) })),
    ...data.tasks.map((t) => ({ key: `t${t.id}`, group: 'Tasks', label: t.title, sub: `${t.project_name} · ${STATUS[t.status]}`, go: () => navigate(`/projects/${t.project_id}`, { state: { openTask: t.id } }) })),
    ...data.notes.map((n) => ({ key: `n${n.id}`, group: 'Notes', label: n.title, sub: n.preview, go: () => navigate('/notes', { state: { open: n.id } }) })),
    ...data.problems.map((p) => ({ key: `d${p.id}`, group: 'DSA problems', label: p.title, sub: `${p.topic} · ${p.difficulty}`, go: () => navigate('/dsa', { state: { q: p.title } }) })),
    ...(data.snippets || []).map((s) => ({ key: `s${s.id}`, group: 'Snippets', label: s.title, sub: s.language, go: () => navigate('/snippets', { state: { q: s.title } }) })),
  ] : [];

  useEffect(() => { document.getElementById(`sr-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!open) return null;

  const choose = (it) => { onClose(); it.go(); };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') return onClose();
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
    if (e.key === 'Enter') { e.preventDefault(); choose(items[active]); }
  };

  const term = q.trim();
  let lastGroup = null;

  return (
    <div className="overlay top" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Search projects, tasks, notes and DSA problems…" aria-label="Search" />
        <div className="palette-body" role="listbox">
          {term.length < 2 && <p className="muted palette-hint">Type at least 2 characters. Use ↑ ↓ to move, Enter to open, Esc to close.</p>}
          {term.length >= 2 && loading && !data && <p className="muted palette-hint">Searching…</p>}
          {term.length >= 2 && data && items.length === 0 && <p className="muted palette-hint">No matches for “{term}”.</p>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="palette-group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header}
                <button id={`sr-${i}`} role="option" aria-selected={i === active}
                  className={`palette-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)} onClick={() => choose(it)}>
                  <span>{it.label}</span>
                  {it.sub && <span className="muted">{it.sub}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
