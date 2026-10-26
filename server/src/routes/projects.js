import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, pm.role,
         (SELECT COUNT(*)::int FROM project_members x WHERE x.project_id = p.id) AS member_count,
         COUNT(t.id)::int AS task_count,
         COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done_count
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
       LEFT JOIN tasks t ON t.project_id = p.id
       GROUP BY p.id, pm.role ORDER BY p.created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, description = '', color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Give the project a name.' });
    const { rows } = await query(
      `WITH p AS (
         INSERT INTO projects (owner_id, name, description, color)
         VALUES ($1, $2, $3, COALESCE($4, '#f5d547')) RETURNING *
       ), m AS (
         INSERT INTO project_members (project_id, user_id, role) SELECT id, $1, 'owner' FROM p
       ) SELECT * FROM p`,
      [req.userId, name.trim(), description, color]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, pm.role FROM projects p
       JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
       WHERE p.id = $1`, [req.params.id, req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Project not found.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { name, description, color } = req.body;
    const { rows } = await query(
      `UPDATE projects SET name=COALESCE($3,name), description=COALESCE($4,description), color=COALESCE($5,color)
       WHERE id=$1 AND owner_id=$2 RETURNING *`,
      [req.params.id, req.userId, name, description, color]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Project not found, or you are not its owner.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const r = await query('DELETE FROM projects WHERE id=$1 AND owner_id=$2', [req.params.id, req.userId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Project not found, or you are not its owner.' });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
