import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar } from '../ui.jsx';
import { getSocket } from '../socket.js';

const COLUMNS = [['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']];
const byPos = (a, b) => a.position - b.position || a.id - b.id;

function applyMove(tasks, id, status, index) {
  const moving = tasks.find((t) => t.id === id);
  const rest = tasks.filter((t) => t.id !== id);
  const col = rest.filter((t) => t.status === status).sort(byPos);
  col.splice(index, 0, { ...moving, status });
  return [...rest.filter((t) => t.status !== status), ...col.map((t, i) => ({ ...t, position: i }))];
}

export default function Board() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [form, setForm] = useState({ title: '', priority: 'medium', due_date: '', assignee_id: '' });
  const [showTeam, setShowTeam] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState([]);
  const [live, setLive] = useState(false);
  const [flashIds, setFlashIds] = useState(new Set());

  useEffect(() => {
    Promise.all([api(`/projects/${id}`), api(`/projects/${id}/tasks`), api(`/projects/${id}/members`)])
      .then(([p, t, m]) => { setProject(p); setTasks(t); setMembers(m); })
      .catch((e) => setError(e.message));
  }, [id]);

  const flash = (taskId) => {
    setFlashIds((s) => new Set(s).add(taskId));
    setTimeout(() => setFlashIds((s) => { const n = new Set(s); n.delete(taskId); return n; }), 1600);
  };

  useEffect(() => {
    const s = getSocket();
    let first = true;
    const join = () => {
      setLive(true);
      s.emit('project:join', Number(id));
      if (!first) {
        // Reconnected: catch up on anything missed while offline.
        Promise.all([api(`/projects/${id}/tasks`), api(`/projects/${id}/members`)])
          .then(([t, m]) => { setTasks(t); setMembers(m); }).catch(() => {});
      }
      first = false;
    };
    const onDisconnect = () => setLive(false);
    const handlers = {
      'task:created': ({ task }) => { setTasks((p) => (p.some((t) => t.id === task.id) ? p : [...p, task])); flash(task.id); },
      'task:updated': ({ task }) => { setTasks((p) => p.map((t) => (t.id === task.id ? task : t))); flash(task.id); },
      'task:deleted': ({ id: taskId }) => setTasks((p) => p.filter((t) => t.id !== taskId)),
      'tasks:reordered': ({ tasks: all, movedId }) => { setTasks(all); flash(movedId); },
      'member:added': ({ member }) => setMembers((p) => (p.some((m) => m.id === member.id) ? p : [...p, member])),
      'member:removed': ({ userId }) => {
        if (userId === user.id) return navigate('/projects');
        setMembers((p) => p.filter((m) => m.id !== userId));
        setTasks((p) => p.map((t) => (t.assignee_id === userId ? { ...t, assignee_id: null } : t)));
      },
      'project:deleted': () => navigate('/projects'),
      presence: (ids) => setOnline(ids),
    };
    s.on('connect', join);
    s.on('disconnect', onDisconnect);
    Object.entries(handlers).forEach(([e, h]) => s.on(e, h));
    if (s.connected) join();
    return () => {
      s.emit('project:leave', Number(id));
      s.off('connect', join);
      s.off('disconnect', onDisconnect);
      Object.entries(handlers).forEach(([e, h]) => s.off(e, h));
    };
  }, [id]);

  const isOwner = project?.role === 'owner';
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));

  const addTask = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form, assignee_id: form.assignee_id ? Number(form.assignee_id) : null };
      const t = await api(`/projects/${id}/tasks`, { method: 'POST', body });
      setTasks((prev) => [...prev, t]);
      setForm({ ...form, title: '', due_date: '' });
    } catch (err) { setError(err.message); }
  };

  const assign = async (t, value) => {
    const assignee_id = value ? Number(value) : null;
    const prev = tasks;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, assignee_id } : x)));
    try { await api(`/tasks/${t.id}`, { method: 'PATCH', body: { assignee_id } }); }
    catch (err) { setTasks(prev); setError(err.message); }
  };

  const drop = async (status, index) => {
    if (dragId == null) return;
    const prev = tasks;
    setTasks(applyMove(tasks, dragId, status, index));
    setDragId(null);
    setOverCol(null);
    try {
      await api(`/tasks/${dragId}/move`, { method: 'POST', body: { status, index } });
    } catch (err) { setTasks(prev); setError(err.message); }
  };

  const remove = async (t) => {
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    await api(`/tasks/${t.id}`, { method: 'DELETE' }).catch((e) => setError(e.message));
  };

  const invite = async (e) => {
    e.preventDefault();
    setInviteMsg(null);
    try {
      const m = await api(`/projects/${id}/members`, { method: 'POST', body: { email: inviteEmail } });
      setMembers((prev) => [...prev, m]);
      setInviteEmail('');
      setInviteMsg({ ok: true, text: `${m.name} was added to the project.` });
    } catch (err) { setInviteMsg({ ok: false, text: err.message }); }
  };

  const removeMember = async (m) => {
    const self = m.id === user.id;
    if (!confirm(self ? 'Leave this project?' : `Remove ${m.name} from this project?`)) return;
    try {
      await api(`/projects/${id}/members/${m.id}`, { method: 'DELETE' });
      if (self) return navigate('/projects');
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
      setTasks((prev) => prev.map((t) => (t.assignee_id === m.id ? { ...t, assignee_id: null } : t)));
    } catch (err) { setInviteMsg({ ok: false, text: err.message }); }
  };

  if (error && !project) return <p className="error">{error}</p>;
  if (!project) return <p className="muted">Loading…</p>;

  return (
    <>
      <p><Link to="/projects" className="muted">← All projects</Link></p>
      <div className="head-row">
        <div>
          <h1><i className="dot big" style={{ background: project.color }} />{project.name}</h1>
          {project.description && <p className="muted lead">{project.description}</p>}
        </div>
        <div className="head-right">
          <span className={`live ${live ? 'on' : ''}`} role="status">{live ? `Live · ${online.length} online` : 'Reconnecting…'}</span>
          <button className="team-btn" onClick={() => setShowTeam((s) => !s)} aria-expanded={showTeam}>
          <span className="avatar-stack">
            {members.slice(0, 4).map((m) => <Avatar key={m.id} name={m.name} id={m.id} size={26} />)}
          </span>
          Team · {members.length}
        </button>
        </div>
      </div>

      {showTeam && (
        <section className="panel team-panel" aria-label="Project team">
          <h2>Team</h2>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id}>
                <span className="av-wrap"><Avatar name={m.name} id={m.id} />{online.includes(m.id) && <i className="online-dot" title="Online" />}</span>
                <div className="grow"><b>{m.name}{m.id === user.id && ' (you)'}</b><div className="muted">{m.email}</div></div>
                <span className={`badge ${m.role}`}>{m.role === 'owner' ? 'Owner' : 'Member'}</span>
                {m.role !== 'owner' && (isOwner || m.id === user.id) &&
                  <button className="link" onClick={() => removeMember(m)}>{m.id === user.id ? 'Leave' : 'Remove'}</button>}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <form className="invite" onSubmit={invite}>
              <input type="email" placeholder="Invite by email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required aria-label="Email to invite" />
              <button className="btn">Invite</button>
            </form>
          ) : <p className="muted">Only the owner can invite people.</p>}
          {inviteMsg && <p role="status" className={inviteMsg.ok ? 'ok' : 'error'}>{inviteMsg.text}</p>}
        </section>
      )}

      <form className="inline-form panel" onSubmit={addTask}>
        <input placeholder="Add a task" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} aria-label="Assignee">
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} aria-label="Priority">
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
        <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} aria-label="Due date" />
        <button className="btn">Add task</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="board">
        {COLUMNS.map(([status, label]) => {
          const col = tasks.filter((t) => t.status === status).sort(byPos);
          return (
            <section key={status}
              className={`column ${overCol === status ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(status); }}
              onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
              onDrop={() => drop(status, col.filter((t) => t.id !== dragId).length)}>
              <h2>{label} <span className="muted">{col.length}</span></h2>
              {col.length === 0 && <p className="muted empty">Drop a task here</p>}
              {col.map((t) => {
                const a = memberById[t.assignee_id];
                return (
                  <article key={t.id} draggable
                    className={`task p-${t.priority} ${dragId === t.id ? 'dragging' : ''} ${flashIds.has(t.id) ? 'flash' : ''}`}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      const others = col.filter((x) => x.id !== dragId);
                      drop(status, Math.max(0, others.findIndex((x) => x.id === t.id)));
                    }}>
                    <div className="row-between">
                      <span>{t.title}</span>
                      <button className="link" aria-label={`Delete ${t.title}`} onClick={() => remove(t)}>×</button>
                    </div>
                    <div className="meta">
                      <span className="tag">{t.priority}</span>
                      {t.due_date && <span className="muted">Due {new Date(t.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                      <label className="assignee">
                        {a ? <Avatar name={a.name} id={a.id} size={22} /> : <span className="avatar empty-av" aria-hidden="true">+</span>}
                        <select value={t.assignee_id || ''} onChange={(e) => assign(t, e.target.value)} aria-label={`Assign ${t.title}`}>
                          <option value="">Unassigned</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </label>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
