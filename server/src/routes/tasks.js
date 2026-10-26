import { Router } from 'express';
import { pool, query } from '../db.js';
import { getRole } from '../access.js';
import { emitToProject } from '../socket.js';
import { notify } from '../notify.js';

const router = Router();
const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const LABELS = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

const loadTask = async (taskId, userId) =>
  (await query(
    `SELECT t.* FROM tasks t
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2
     WHERE t.id = $1`, [taskId, userId])).rows[0];

router.get('/projects/:projectId/tasks', async (req, res, next) => {
  try {
    if (!(await getRole(req.params.projectId, req.userId)))
      return res.status(404).json({ error: 'Project not found.' });
    const { rows } = await query(
      'SELECT * FROM tasks WHERE project_id=$1 ORDER BY status, position, id', [req.params.projectId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/projects/:projectId/tasks', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { title, description = '', priority = 'medium', due_date = null, assignee_id = null } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Give the task a title.' });
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority.' });
    if (!(await getRole(projectId, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    if (assignee_id && !(await getRole(projectId, assignee_id)))
      return res.status(400).json({ error: 'You can only assign tasks to project members.' });
    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, description, priority, due_date, assignee_id, position)
       VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(MAX(position)+1,0) FROM tasks WHERE project_id=$1 AND status='todo'))
       RETURNING *`,
      [projectId, title.trim(), description, priority, due_date || null, assignee_id || null]
    );
    emitToProject(projectId, 'task:created', { task: rows[0] }, req.get('x-socket-id'));
    if (assignee_id) await notify({ userId: assignee_id, actorId: req.userId, projectId: Number(projectId), type: 'task_assigned', text: `assigned you “${rows[0].title}”` });
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/tasks/:id', async (req, res, next) => {
  try {
    const task = await loadTask(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const { title, description, priority, due_date, assignee_id } = req.body;
    if (priority && !PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority.' });
    if (assignee_id && !(await getRole(task.project_id, assignee_id)))
      return res.status(400).json({ error: 'You can only assign tasks to project members.' });
    const { rows } = await query(
      `UPDATE tasks SET title=COALESCE($2,title), description=COALESCE($3,description),
         priority=COALESCE($4,priority),
         due_date=CASE WHEN $6 THEN $5 ELSE due_date END,
         assignee_id=CASE WHEN $8 THEN $7 ELSE assignee_id END,
         updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.id, title, description, priority, due_date || null, 'due_date' in req.body,
       assignee_id || null, 'assignee_id' in req.body]
    );
    emitToProject(task.project_id, 'task:updated', { task: rows[0] }, req.get('x-socket-id'));
    if (assignee_id && Number(assignee_id) !== task.assignee_id)
      await notify({ userId: assignee_id, actorId: req.userId, projectId: task.project_id, type: 'task_assigned', text: `assigned you “${rows[0].title}”` });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// Move a task to a column at a given index and renumber that column.
router.post('/tasks/:id/move', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { status, index = 0 } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const task = await loadTask(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM tasks WHERE project_id=$1 AND status=$2 AND id<>$3 ORDER BY position, id FOR UPDATE',
      [task.project_id, status, task.id]
    );
    const ids = rows.map((r) => r.id);
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, task.id);
    await client.query('UPDATE tasks SET status=$2, updated_at=now() WHERE id=$1', [task.id, status]);
    for (let i = 0; i < ids.length; i++)
      await client.query('UPDATE tasks SET position=$2 WHERE id=$1', [ids[i], i]);
    await client.query('COMMIT');
    const all = await query('SELECT * FROM tasks WHERE project_id=$1 ORDER BY status, position, id', [task.project_id]);
    emitToProject(task.project_id, 'tasks:reordered', { tasks: all.rows, movedId: task.id }, req.get('x-socket-id'));
    if (task.assignee_id && status !== task.status)
      await notify({ userId: task.assignee_id, actorId: req.userId, projectId: task.project_id, type: 'task_moved', text: `moved “${task.title}” to ${LABELS[status]}` });
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.delete('/tasks/:id', async (req, res, next) => {
  try {
    const task = await loadTask(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    await query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    emitToProject(task.project_id, 'task:deleted', { id: task.id }, req.get('x-socket-id'));
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
