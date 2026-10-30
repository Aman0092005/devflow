import { Router } from 'express';
import { query } from '../db.js';
import { emitToProject } from '../socket.js';
import { notify } from '../notify.js';
import { logActivity } from '../activityLog.js';

const router = Router();
const COLS = 'c.id, c.task_id, c.user_id, u.name AS author_name, c.body, c.created_at';

const loadTask = async (taskId, userId) =>
  (await query(
    `SELECT t.* FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2
     WHERE t.id = $1`, [taskId, userId])).rows[0];

const countFor = async (taskId) =>
  (await query('SELECT COUNT(*)::int AS c FROM task_comments WHERE task_id=$1', [taskId])).rows[0].c;

router.get('/tasks/:id/comments', async (req, res, next) => {
  try {
    if (!(await loadTask(req.params.id, req.userId))) return res.status(404).json({ error: 'Task not found.' });
    const { rows } = await query(
      `SELECT ${COLS} FROM task_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.task_id = $1 ORDER BY c.created_at, c.id`, [req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/tasks/:id/comments', async (req, res, next) => {
  try {
    const task = await loadTask(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Write something before posting.' });
    if (body.length > 2000) return res.status(400).json({ error: 'Comments can be up to 2000 characters.' });

    const { rows } = await query(
      `WITH c AS (INSERT INTO task_comments (task_id, user_id, body) VALUES ($1,$2,$3) RETURNING *)
       SELECT ${COLS} FROM c LEFT JOIN users u ON u.id = c.user_id`, [task.id, req.userId, body]);
    const comment = rows[0];
    const count = await countFor(task.id);
    emitToProject(task.project_id, 'comment:created', { comment, count }, req.get('x-socket-id'));
    logActivity({ projectId: task.project_id, userId: req.userId, kind: 'task_comment', taskId: task.id, meta: { title: task.title } });

    // Tell the assignee and everyone already in the thread, but only people still on the project.
    const thread = await query('SELECT DISTINCT user_id FROM task_comments WHERE task_id=$1 AND user_id IS NOT NULL', [task.id]);
    const people = new Set(thread.rows.map((r) => r.user_id));
    if (task.assignee_id) people.add(task.assignee_id);
    people.delete(req.userId);
    if (people.size) {
      const members = await query('SELECT user_id FROM project_members WHERE project_id=$1 AND user_id = ANY($2::int[])', [task.project_id, [...people]]);
      for (const m of members.rows)
        await notify({ userId: m.user_id, actorId: req.userId, projectId: task.project_id, taskId: task.id, type: 'task_comment', text: `commented on “${task.title}”` });
    }
    res.status(201).json({ comment, count });
  } catch (e) { next(e); }
});

router.delete('/comments/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.user_id, c.task_id, t.project_id, pm.role FROM task_comments c
       JOIN tasks t ON t.id = c.task_id
       JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2
       WHERE c.id = $1`, [req.params.id, req.userId]);
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'Comment not found.' });
    if (c.user_id !== req.userId && c.role !== 'owner')
      return res.status(403).json({ error: 'Only the author or the project owner can delete this comment.' });
    await query('DELETE FROM task_comments WHERE id=$1', [c.id]);
    emitToProject(c.project_id, 'comment:deleted', { id: c.id, taskId: c.task_id, count: await countFor(c.task_id) }, req.get('x-socket-id'));
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
