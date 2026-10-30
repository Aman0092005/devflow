import { Router } from 'express';
import { query } from '../db.js';
import { emitToProject } from '../socket.js';

const router = Router();
const MAX_ITEMS = 50;

const loadTask = async (taskId, userId) =>
  (await query(
    `SELECT t.id, t.project_id FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2
     WHERE t.id = $1`, [taskId, userId])).rows[0];

const loadItem = async (id, userId) =>
  (await query(
    `SELECT i.*, t.project_id FROM task_checklist_items i JOIN tasks t ON t.id = i.task_id
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2 WHERE i.id = $1`, [id, userId])).rows[0];

const payload = async (taskId) => {
  const { rows } = await query('SELECT id, task_id, text, done, position FROM task_checklist_items WHERE task_id=$1 ORDER BY position, id', [taskId]);
  return { items: rows, total: rows.length, done: rows.filter((r) => r.done).length };
};

// Every change returns (and broadcasts) the whole list, so everyone's view ends up identical.
const respond = async (req, res, projectId, taskId) => {
  const p = await payload(taskId);
  emitToProject(projectId, 'checklist:changed', { taskId, ...p }, req.get('x-socket-id'));
  res.json(p);
};

router.get('/tasks/:id/checklist', async (req, res, next) => {
  try {
    if (!(await loadTask(req.params.id, req.userId))) return res.status(404).json({ error: 'Task not found.' });
    res.json(await payload(req.params.id));
  } catch (e) { next(e); }
});

router.post('/tasks/:id/checklist', async (req, res, next) => {
  try {
    const task = await loadTask(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Write the checklist item first.' });
    if (text.length > 200) return res.status(400).json({ error: 'Checklist items can be up to 200 characters.' });
    const { rows } = await query('SELECT COUNT(*)::int AS n, COALESCE(MAX(position), -1) + 1 AS next FROM task_checklist_items WHERE task_id=$1', [task.id]);
    if (rows[0].n >= MAX_ITEMS) return res.status(400).json({ error: `A checklist can have up to ${MAX_ITEMS} items.` });
    await query('INSERT INTO task_checklist_items (task_id, text, position) VALUES ($1,$2,$3)', [task.id, text, rows[0].next]);
    await respond(req, res, task.project_id, task.id);
  } catch (e) { next(e); }
});

router.patch('/checklist/:id', async (req, res, next) => {
  try {
    const item = await loadItem(req.params.id, req.userId);
    if (!item) return res.status(404).json({ error: 'Checklist item not found.' });
    const text = req.body.text === undefined ? null : String(req.body.text).trim();
    if (text !== null && (!text || text.length > 200)) return res.status(400).json({ error: 'Checklist items must be 1 to 200 characters.' });
    const done = typeof req.body.done === 'boolean' ? req.body.done : null;
    await query('UPDATE task_checklist_items SET text = COALESCE($2, text), done = COALESCE($3, done) WHERE id = $1', [item.id, text, done]);
    await respond(req, res, item.project_id, item.task_id);
  } catch (e) { next(e); }
});

router.delete('/checklist/:id', async (req, res, next) => {
  try {
    const item = await loadItem(req.params.id, req.userId);
    if (!item) return res.status(404).json({ error: 'Checklist item not found.' });
    await query('DELETE FROM task_checklist_items WHERE id = $1', [item.id]);
    await respond(req, res, item.project_id, item.task_id);
  } catch (e) { next(e); }
});

export default router;
