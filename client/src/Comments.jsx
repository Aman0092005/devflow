import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { getSocket } from './socket.js';
import { Avatar } from './ui.jsx';
import { ago } from './dates.js';

export default function Comments({ task, isOwner, onCount }) {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);

  useEffect(() => {
    api(`/tasks/${task.id}/comments`)
      .then((l) => { setList(l); onCount?.(task.id, l.length); })
      .catch((e) => setError(e.message));
  }, [task.id]);

  // Comments from other people appear live. (The board card's count is updated by the board itself.)
  useEffect(() => {
    const s = getSocket();
    const onNew = ({ comment }) => {
      if (comment.task_id === task.id) setList((p) => (p && !p.some((c) => c.id === comment.id) ? [...p, comment] : p));
    };
    const onDel = ({ taskId, id }) => { if (taskId === task.id) setList((p) => p && p.filter((c) => c.id !== id)); };
    s.on('comment:created', onNew);
    s.on('comment:deleted', onDel);
    return () => { s.off('comment:created', onNew); s.off('comment:deleted', onDel); };
  }, [task.id]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [list?.length]);

  const post = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    try {
      const { comment, count } = await api(`/tasks/${task.id}/comments`, { method: 'POST', body: { body } });
      setList((p) => [...(p || []), comment]);
      onCount?.(task.id, count);
      setText('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const remove = async (c) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await api(`/comments/${c.id}`, { method: 'DELETE' });
      const next = list.filter((x) => x.id !== c.id);
      setList(next);
      onCount?.(task.id, next.length);
    } catch (err) { setError(err.message); }
  };

  return (
    <section className="comments" aria-label="Comments">
      <h3>Comments {list && list.length > 0 && <span className="muted">{list.length}</span>}</h3>
      {list === null && !error && <p className="muted">Loading…</p>}
      {list?.length === 0 && <p className="muted">No comments yet. Start the discussion.</p>}
      <ul className="comment-list">
        {list?.map((c) => (
          <li key={c.id} className="comment">
            <Avatar name={c.author_name || '?'} id={c.user_id || 0} size={26} />
            <div className="grow">
              <div className="comment-head">
                <b>{c.author_name || 'Former member'}</b>
                <span className="muted">{ago(c.created_at)}</span>
                {(c.user_id === user.id || isOwner) && <button className="link" onClick={() => remove(c)} aria-label="Delete comment">Delete</button>}
              </div>
              <p className="comment-body">{c.body}</p>
            </div>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ul>
      <div className="comment-input">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
          placeholder="Write a comment…  (Ctrl+Enter to post)" aria-label="New comment"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } }} />
        <button type="button" className="btn" onClick={post} disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Comment'}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
