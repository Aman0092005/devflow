import { Router } from 'express';
import { pool, query } from '../db.js';
import { getRole } from '../access.js';
import { emitToProject } from '../socket.js';
import { ensureColumns } from '../columns.js';
import { TASK_SELECT } from './tasks.js';

const router = Router();
const STAGES = ['todo', 'in_progress', 'done'];
const MAX_COLUMNS = 12;
const listColumns = async (projectId) =>
  (await query('SELECT id, project_id, name, stage, position FROM project_columns WHERE project_id=$1 ORDER BY position, id', [projectId])).rows;
const columnFor = async (id, userId) =>
  (await query(
    `SELECT c.*, pm.role FROM project_columns c JOIN project_members pm ON pm.project_id = c.project_id AND pm.user_id = $2 WHERE c.id = $1`,
    [id, userId])).rows[0];
const cleanName = (v) => String(v || '').trim();

router.get('/projects/:projectId/columns', async (req, res, next) => {
  try {
    if (!(await getRole(req.params.projectId, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    await ensureColumns(req.params.projectId);
    res.json(await listColumns(req.params.projectId));
  } catch (e) { next(e); }
});

router.post('/projects/:projectId/columns', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await getRole(projectId, req.userId);
    if (!role) return res.status(404).json({ error: 'Project not found.' });
    if (role !== 'owner') return res.status(403).json({ error: 'Only the project owner can change the columns.' });
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Give the column a name.' });
    if (name.length > 30) return res.status(400).json({ error: 'Column names can be up to 30 characters.' });
    if (!STAGES.includes(req.body.stage)) return res.status(400).json({ error: 'Choose what the column counts as.' });
    await ensureColumns(projectId);
    if ((await listColumns(projectId)).length >= MAX_COLUMNS) return res.status(400).json({ error: `A board can have up to ${MAX_COLUMNS} columns.` });
    await query(
      `INSERT INTO project_columns (project_id, name, stage, position)
       VALUES ($1,$2,$3,(SELECT COALESCE(MAX(position) + 1, 0) FROM project_columns WHERE project_id = $1))`, [projectId, name, req.body.stage]);
    const columns = await listColumns(projectId);
    emitToProject(projectId, 'columns:changed', { columns }, req.get('x-socket-id'));
    res.status(201).json({ columns });
  } catch (e) { next(e); }
});

router.patch('/columns/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const c = await columnFor(req.params.id, req.userId);
    if (!c) return res.status(404).json({ error: 'Column not found.' });
    if (c.role !== 'owner') return res.status(403).json({ error: 'Only the project owner can change the columns.' });

    if (req.body.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name || name.length > 30) return res.status(400).json({ error: 'Column names must be 1 to 30 characters.' });
      await query('UPDATE project_columns SET name=$2 WHERE id=$1', [c.id, name]);
    }
    if (req.body.direction === 'left' || req.body.direction === 'right') {
      const list = await listColumns(c.project_id);
      const i = list.findIndex((x) => x.id === c.id);
      const j = req.body.direction === 'left' ? i - 1 : i + 1;
      if (j >= 0 && j < list.length) {
        [list[i], list[j]] = [list[j], list[i]];
        await client.query('BEGIN');
        for (let k = 0; k < list.length; k++) await client.query('UPDATE project_columns SET position=$2 WHERE id=$1', [list[k].id, k]);
        await client.query('COMMIT');
      }
    }
    const columns = await listColumns(c.project_id);
    emitToProject(c.project_id, 'columns:changed', { columns }, req.get('x-socket-id'));
    res.json({ columns });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

// Deleting a column that holds tasks needs a place for them to go (?move_to=ID).
router.delete('/columns/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const c = await columnFor(req.params.id, req.userId);
    if (!c) return res.status(404).json({ error: 'Column not found.' });
    if (c.role !== 'owner') return res.status(403).json({ error: 'Only the project owner can change the columns.' });

    const list = await listColumns(c.project_id);
    if (list.filter((x) => x.stage === c.stage).length <= 1)
      return res.status(400).json({ error: 'Every board needs at least one To do, In progress and Done column, so this one has to stay.' });

    const count = (await query('SELECT COUNT(*)::int AS n FROM tasks WHERE column_id=$1', [c.id])).rows[0].n;
    let target = null;
    if (count > 0) {
      target = list.find((x) => x.id === Number(req.query.move_to) && x.id !== c.id);
      if (!target) return res.status(400).json({ error: 'Choose a column to move this column’s tasks into.' });
    }

    await client.query('BEGIN');
    if (target) {
      const offset = (await client.query('SELECT COALESCE(MAX(position) + 1, 0) AS n FROM tasks WHERE column_id=$1', [target.id])).rows[0].n;
      await client.query(
        `UPDATE tasks SET column_id=$2, status=$3, position = position + $4, updated_at = now(),
           completed_at = CASE WHEN $3 = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END
         WHERE column_id=$1`, [c.id, target.id, target.stage, offset]);
    }
    await client.query('DELETE FROM project_columns WHERE id=$1', [c.id]);
    const rest = list.filter((x) => x.id !== c.id);
    for (let k = 0; k < rest.length; k++) await client.query('UPDATE project_columns SET position=$2 WHERE id=$1', [rest[k].id, k]);
    await client.query('COMMIT');

    const columns = await listColumns(c.project_id);
    const tasks = (await query(TASK_SELECT, [c.project_id])).rows;
    emitToProject(c.project_id, 'columns:changed', { columns }, req.get('x-socket-id'));
    emitToProject(c.project_id, 'tasks:reordered', { tasks, movedId: null }, req.get('x-socket-id'));
    res.json({ columns, tasks });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

export default router;
