import { useEffect, useState } from 'react';
import { api } from './api.js';
import { getSocket } from './socket.js';
import { Avatar } from './ui.jsx';
import { ago } from './dates.js';

const STATUS = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

const sentence = (a) => {
  const m = a.meta || {};
  const t = `“${m.title}”`;
  switch (a.kind) {
    case 'task_created': return `created ${t}`;
    case 'task_moved': return `moved ${t} from ${STATUS[m.from] || m.from} to ${STATUS[m.to] || m.to}`;
    case 'task_assigned': return `assigned ${t} to ${m.assignee || 'someone'}`;
    case 'task_unassigned': return `unassigned ${t}`;
    case 'task_deleted': return `deleted ${t}`;
    case 'task_comment': return `commented on ${t}`;
    case 'attachment_added': return `attached ${m.file || 'a file'} to ${t}`;
    case 'github_closed': return `closed GitHub issue ${m.ref} for ${t}`;
    case 'github_reopened': return `reopened GitHub issue ${m.ref} for ${t}`;
    case 'task_imported': return `imported ${t} from GitHub (${m.ref})`;
    case 'member_added': return `added ${m.name || 'someone'} to the project`;
    case 'member_removed': return `removed ${m.name || 'someone'} from the project`;
    case 'member_left': return 'left the project';
    case 'member_joined': return 'joined through an invite link';
    default: return 'did something';
  }
};

export default function ActivityFeed({ projectId, onOpenTask }) {
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/projects/${projectId}/activity?limit=30`).then((l) => { setItems(l); setMore(l.length === 30); }).catch((e) => setError(e.message));
  }, [projectId]);

  useEffect(() => {
    const s = getSocket();
    const onNew = ({ item }) => {
      if (String(item.project_id) === String(projectId)) setItems((p) => (p && !p.some((x) => x.id === item.id) ? [item, ...p] : p));
    };
    s.on('activity:new', onNew);
    return () => s.off('activity:new', onNew);
  }, [projectId]);

  const loadMore = async () => {
    try {
      const l = await api(`/projects/${projectId}/activity?limit=30&before=${items[items.length - 1].id}`);
      setItems((p) => [...p, ...l]);
      setMore(l.length === 30);
    } catch (err) { setError(err.message); }
  };

  return (
    <section className="panel feed-panel" aria-label="Project activity">
      <h2>Activity</h2>
      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && <p className="muted">Nothing yet. Changes to tasks and the team will show up here as they happen.</p>}
      <ul className="feed">
        {items?.map((a) => (
          <li key={a.id}>
            <Avatar name={a.user_name || '?'} id={a.user_id || 0} size={26} />
            <div className="grow">
              <span><b>{a.user_name || 'Someone'}</b> {sentence(a)}</span>
              <div className="muted">{ago(a.created_at)}</div>
            </div>
            {a.task_id && <button className="link" onClick={() => onOpenTask(a.task_id)}>Open</button>}
          </li>
        ))}
      </ul>
      {more && <button className="link underline" onClick={loadMore}>Load more</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
