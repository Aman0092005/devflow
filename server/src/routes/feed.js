import { Router } from 'express';
import { query } from '../db.js';
import { getRole } from '../access.js';

const router = Router();

router.get('/projects/:projectId/activity', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if (!(await getRole(projectId, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const before = Number(req.query.before) || null;
    const { rows } = await query(
      `SELECT a.id, a.project_id, a.user_id, a.kind, a.task_id, a.meta, a.created_at, u.name AS user_name
       FROM project_activity a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.project_id = $1 AND ($2::int IS NULL OR a.id < $2)
       ORDER BY a.id DESC LIMIT $3`, [projectId, before, limit]);
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
