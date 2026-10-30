import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar } from '../ui.jsx';
import { getSocket } from '../socket.js';
import TaskModal from '../TaskModal.jsx';
import GitHubPanel from '../GitHubPanel.jsx';
import AssistantPanel from '../AssistantPanel.jsx';
import ActivityFeed from '../ActivityFeed.jsx';
import Calendar from '../Calendar.jsx';
import InviteLinks from '../InviteLinks.jsx';
import { addDays, fmtDate, today } from '../dates.js';

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
  const location = useLocation();
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
  const [openTaskId, setOpenTaskId] = useState(null);
  const [filters, setFilters] = useState({ q: '', assignee: '', priority: '', due: '', label: '' });
  const [showGh, setShowGh] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showAct, setShowAct] = useState(false);
  const [labels, setLabels] = useState([]);
  const [view, setView] = useState('board');

  useEffect(() => {
    Promise.all([api(`/projects/${id}`), api(`/projects/${id}/tasks`), api(`/projects/${id}/members`), api(`/projects/${id}/labels`)])
      .then(([p, t, m, l]) => { setProject(p); setTasks(t); setMembers(m); setLabels(l); })
      .catch((e) => setError(e.message));
  }, [id]);

  // Replaces the label list and drops deleted labels from tasks.
  const applyLabels = (list) => {
    setLabels(list);
    const ids = new Set(list.map((l) => l.id));
    setTasks((p) => p.map((t) => ((t.label_ids || []).some((x) => !ids.has(x)) ? { ...t, label_ids: t.label_ids.filter((x) => ids.has(x)) } : t)));
  };

  // Opened from the global search: jump straight to the task.
  useEffect(() => {
    if (project && location.state?.openTask) setOpenTaskId(location.state.openTask);
  }, [!!project, location.key]);

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
        Promise.all([api(`/projects/${id}/tasks`), api(`/projects/${id}/members`), api(`/projects/${id}/labels`)])
          .then(([t, m, l]) => { setTasks(t); setMembers(m); setLabels(l); }).catch(() => {});
      }
      first = false;
    };
    const onDisconnect = () => setLive(false);
    const handlers = {
      'task:created': ({ task }) => { setTasks((p) => (p.some((t) => t.id === task.id) ? p : [...p, task])); flash(task.id); },
      'task:updated': ({ task }) => { setTasks((p) => p.map((t) => (t.id === task.id ? { ...t, ...task } : t))); flash(task.id); },
      'checklist:changed': ({ taskId, total, done }) => setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, checklist_total: total, checklist_done: done } : t))),
      'task:labels': ({ taskId, label_ids }) => setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, label_ids } : t))),
      'labels:changed': ({ labels: list }) => applyLabels(list),
      'comment:created': ({ comment, count }) => setTasks((p) => p.map((t) => (t.id === comment.task_id ? { ...t, comment_count: count } : t))),
      'comment:deleted': ({ taskId, count }) => setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, comment_count: count } : t))),
      'attachments:changed': ({ taskId, count }) => setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, attachment_count: count } : t))),
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
  const openTask = tasks.find((t) => t.id === openTaskId);

  const filtersOn = Object.values(filters).some(Boolean);
  const matches = (t) => {
    const q = filters.q.trim().toLowerCase();
    if (q && !t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.label && !(t.label_ids || []).includes(Number(filters.label))) return false;
    if (filters.assignee === 'me' && t.assignee_id !== user.id) return false;
    if (filters.assignee === 'none' && t.assignee_id) return false;
    if (/^\d+$/.test(filters.assignee) && t.assignee_id !== Number(filters.assignee)) return false;
    if (filters.due) {
      const d = t.due_date?.slice(0, 10);
      if (!d || t.status === 'done') return false;
      if (filters.due === 'overdue' && d >= today()) return false;
      if (filters.due === 'week' && (d < today() || d > addDays(today(), 7))) return false;
    }
    return true;
  };
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const labelById = Object.fromEntries(labels.map((l) => [l.id, l]));

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

  const setDue = async (t, day) => {
    const prev = tasks;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, due_date: day } : x)));
    try { await api(`/tasks/${t.id}`, { method: 'PATCH', body: { due_date: day } }); }
    catch (err) { setTasks(prev); setError(err.message); }
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
          <div className="head-btns">
          <button className="team-btn" onClick={() => setShowAct((s) => !s)} aria-expanded={showAct}>Activity</button>
          <button className="team-btn" onClick={() => setShowAi((s) => !s)} aria-expanded={showAi}>Assistant</button>
          <button className="team-btn" onClick={() => setShowGh((s) => !s)} aria-expanded={showGh}>GitHub</button>
          <button className="team-btn" onClick={() => setShowTeam((s) => !s)} aria-expanded={showTeam}>
          <span className="avatar-stack">
            {members.slice(0, 4).map((m) => <Avatar key={m.id} name={m.name} id={m.id} size={26} />)}
          </span>
          Team · {members.length}
        </button>
          </div>
        </div>
      </div>

      {showAct && <ActivityFeed projectId={id} onOpenTask={setOpenTaskId} />}

      {showAi && <AssistantPanel projectId={id} />}

      {showGh && (
        <GitHubPanel projectId={id} isOwner={isOwner}
          onImported={(t) => setTasks((p) => (p.some((x) => x.id === t.id) ? p : [...p, t]))} />
      )}

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
          {isOwner && <InviteLinks projectId={id} />}
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

      <div className="tabs view-tabs" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'tab on' : 'tab'} onClick={() => setView('board')}>Board</button>
        <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'tab on' : 'tab'} onClick={() => setView('calendar')}>Calendar</button>
      </div>

      <div className="filters" role="search" aria-label="Filter tasks">
        <input placeholder="Filter tasks by title or description" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.assignee} onChange={(e) => setFilters({ ...filters, assignee: e.target.value })} aria-label="Filter by assignee">
          <option value="">All assignees</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} aria-label="Filter by priority">
          <option value="">Any priority</option>
          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        {labels.length > 0 && (
          <select value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })} aria-label="Filter by label">
            <option value="">All labels</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <select value={filters.due} onChange={(e) => setFilters({ ...filters, due: e.target.value })} aria-label="Filter by due date">
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due in 7 days</option>
        </select>
        {filtersOn && (
          <>
            <span className="muted" role="status">Showing {tasks.filter(matches).length} of {tasks.length}</span>
            <button className="link" onClick={() => setFilters({ q: '', assignee: '', priority: '', due: '', label: '' })}>Clear filters</button>
          </>
        )}
      </div>

      {view === 'calendar' && <Calendar tasks={tasks.filter(matches)} onOpen={setOpenTaskId} onSetDue={setDue} />}

      {view === 'board' && (
      <div className="board">
        {COLUMNS.map(([status, label]) => {
          const all = tasks.filter((t) => t.status === status).sort(byPos);
          const col = all.filter(matches);
          return (
            <section key={status}
              className={`column ${overCol === status ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(status); }}
              onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
              onDrop={() => drop(status, all.filter((t) => t.id !== dragId).length)}>
              <h2>{label} <span className="muted">{filtersOn ? `${col.length}/${all.length}` : col.length}</span></h2>
              {col.length === 0 && <p className="muted empty">{filtersOn && all.length > 0 ? 'No tasks match the filters' : 'Drop a task here'}</p>}
              {col.map((t) => {
                const a = memberById[t.assignee_id];
                return (
                  <article key={t.id} draggable
                    className={`task p-${t.priority} ${dragId === t.id ? 'dragging' : ''} ${flashIds.has(t.id) ? 'flash' : ''}`}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      const others = all.filter((x) => x.id !== dragId);
                      drop(status, Math.max(0, others.findIndex((x) => x.id === t.id)));
                    }}>
                    <div className="row-between">
                      <button className="task-title" onClick={() => setOpenTaskId(t.id)}>{t.title}</button>
                      <button className="link" aria-label={`Delete ${t.title}`} onClick={() => remove(t)}>×</button>
                    </div>
                    {t.description && <p className="muted task-desc">{t.description}</p>}
                    {(t.label_ids || []).length > 0 && (
                      <div className="label-row">
                        {t.label_ids.map((lid) => labelById[lid]).filter(Boolean).map((l) => <span key={l.id} className="label"><i style={{ background: l.color }} />{l.name}</span>)}
                      </div>
                    )}
                    {t.checklist_total > 0 && (
                      <div className="bar mini" role="progressbar" aria-label="Checklist progress" aria-valuenow={t.checklist_done} aria-valuemin={0} aria-valuemax={t.checklist_total}>
                        <span style={{ width: `${(t.checklist_done / t.checklist_total) * 100}%`, background: 'var(--green)' }} />
                      </div>
                    )}
                    <div className="meta">
                      <span className="tag">{t.priority}</span>
                      {t.github_ref && <a className="tag gh" href={t.github_url} target="_blank" rel="noreferrer" draggable="false" title="Open on GitHub">GH {t.github_ref}</a>}
                      {t.attachment_count > 0 && (
                        <span className="muted clip" title="Attachments">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
                          {t.attachment_count}
                        </span>
                      )}
                      {t.due_date && <span className={t.status !== 'done' && t.due_date.slice(0, 10) < today() ? 'due' : 'muted'}>Due {fmtDate(t.due_date)}</span>}
                      {t.checklist_total > 0 && (
                        <span className="muted clip" title="Checklist">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                          {t.checklist_done}/{t.checklist_total}
                        </span>
                      )}
                      {t.comment_count > 0 && (
                        <span className="muted clip" title="Comments">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                          {t.comment_count}
                        </span>
                      )}
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
      )}

      {openTask && (
        <TaskModal task={openTask} onClose={() => setOpenTaskId(null)}
          onSaved={(t) => setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, ...t } : x)))}
          onCount={(taskId, count) => setTasks((p) => p.map((x) => (x.id === taskId ? { ...x, attachment_count: count } : x)))}
          onCreated={(t) => setTasks((p) => (p.some((x) => x.id === t.id) ? p : [...p, t]))}
          isOwner={isOwner} labels={labels} onLabelsList={applyLabels}
          onChecklistCounts={(taskId, total, done) => setTasks((p) => p.map((x) => (x.id === taskId ? { ...x, checklist_total: total, checklist_done: done } : x)))}
          onTaskLabels={(taskId, ids) => setTasks((p) => p.map((x) => (x.id === taskId ? { ...x, label_ids: ids } : x)))}
          onComments={(taskId, count) => setTasks((p) => p.map((x) => (x.id === taskId ? { ...x, comment_count: count } : x)))} />
      )}
    </>
  );
}
