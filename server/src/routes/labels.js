import { Router } from 'express';
import { pool, query } from '../db.js';
import { getRole } from '../access.js';
import { emitToProject } from '../socket.js';

const router = Router();
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const listLabels = async (projectId) =>
  (await query('SELECT id, project_id, name, color FROM labels WHERE project_id=$1 ORDER BY lower(name)', [projectId])).rows;

router.get('/projects/:projectId/labels', async (req, res, next) => {
  try {
    if (!(await getRole(req.params.projectId, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    res.json(await listLabels(req.params.projectId));
  } catch (e) { next(e); }
});

router.post('/projects/:projectId/labels', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if (!(await getRole(projectId, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Give the label a name.' });
    if (name.length > 30) return res.status(400).json({ error: 'Label names can be up to 30 characters.' });
    const color = COLOR_RE.test(req.body.color) ? req.body.color : '#7ab8ff';
    const { rows } = await query(
      'INSERT INTO labels (project_id, name, color) VALUES ($1,$2,$3) RETURNING id, project_id, name, color', [projectId, name, color]);
    emitToProject(projectId, 'labels:changed', { labels: await listLabels(projectId) }, req.get('x-socket-id'));
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A label with that name already exists.' });
    next(e);
  }
});

router.delete('/labels/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT l.id, l.project_id, pm.role FROM labels l
       JOIN project_members pm ON pm.project_id = l.project_id AND pm.user_id = $2 WHERE l.id = $1`, [req.params.id, req.userId]);
    const l = rows[0];
    if (!l) return res.status(404).json({ error: 'Label not found.' });
    if (l.role !== 'owner') return res.status(403).json({ error: 'Only the project owner can delete labels.' });
    await query('DELETE FROM labels WHERE id=$1', [l.id]);
    emitToProject(l.project_id, 'labels:changed', { labels: await listLabels(l.project_id) }, req.get('x-socket-id'));
    res.status(204).end();
  } catch (e) { next(e); }
});

// Replaces the full set of labels on a task.
router.put('/tasks/:id/labels', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { rows } = await query(
      `SELECT t.id, t.project_id FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2
       WHERE t.id = $1`, [req.params.id, req.userId]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const wanted = [...new Set((Array.isArray(req.body.label_ids) ? req.body.label_ids : []).map(Number).filter(Number.isInteger))].slice(0, 10);
    const valid = (await query('SELECT id FROM labels WHERE project_id=$1 AND id = ANY($2::int[]) ORDER BY id', [task.project_id, wanted])).rows.map((r) => r.id);
    if (valid.length !== wanted.length) return res.status(400).json({ error: 'One of those labels doesn’t belong to this project.' });

    await client.query('BEGIN');
    await client.query('DELETE FROM task_labels WHERE task_id=$1', [task.id]);
    if (valid.length) await client.query('INSERT INTO task_labels (task_id, label_id) SELECT $1, unnest($2::int[])', [task.id, valid]);
    await client.query('COMMIT');
    emitToProject(task.project_id, 'task:labels', { taskId: task.id, label_ids: valid }, req.get('x-socket-id'));
    res.json({ label_ids: valid });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

export default router;
