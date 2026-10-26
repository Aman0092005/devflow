import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const uid = req.userId;
    const [counts, dueSoon, recentNotes, activeProjects] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM project_members WHERE user_id=$1) AS projects,
           (SELECT COUNT(*)::int FROM notes WHERE user_id=$1) AS notes,
           COUNT(t.id) FILTER (WHERE t.status='todo')::int AS todo,
           COUNT(t.id) FILTER (WHERE t.status='in_progress')::int AS in_progress,
           COUNT(t.id) FILTER (WHERE t.status='done')::int AS done,
           COUNT(t.id) FILTER (WHERE t.assignee_id=$1 AND t.status<>'done')::int AS assigned_to_me
         FROM tasks t JOIN project_members pm ON pm.project_id=t.project_id AND pm.user_id=$1`, [uid]),
      query(
        `SELECT t.id, t.title, t.due_date, t.priority, t.project_id, p.name AS project_name
         FROM tasks t JOIN projects p ON p.id=t.project_id
         JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$1
         WHERE t.status<>'done' AND t.due_date IS NOT NULL
         ORDER BY t.due_date LIMIT 6`, [uid]),
      query('SELECT id, title, updated_at FROM notes WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 5', [uid]),
      query(
        `SELECT p.id, p.name, p.color, COUNT(t.id)::int AS task_count,
           COUNT(t.id) FILTER (WHERE t.status='done')::int AS done_count
         FROM projects p JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$1
         LEFT JOIN tasks t ON t.project_id=p.id
         GROUP BY p.id ORDER BY MAX(t.updated_at) DESC NULLS LAST LIMIT 4`, [uid]),
    ]);
    res.json({ counts: counts.rows[0], dueSoon: dueSoon.rows, recentNotes: recentNotes.rows, activeProjects: activeProjects.rows });
  } catch (e) { next(e); }
});

export default router;
