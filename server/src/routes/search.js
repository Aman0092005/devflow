import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ projects: [], tasks: [], notes: [], problems: [], snippets: [] });
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'; // escape LIKE wildcards typed by the user
    const uid = req.userId;

    const [projects, tasks, notes, problems, snippets] = await Promise.all([
      query(
        `SELECT p.id, p.name, p.description, p.color FROM projects p
         JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
         WHERE p.name ILIKE $2 OR p.description ILIKE $2 ORDER BY p.name LIMIT 5`, [uid, like]),
      query(
        `SELECT t.id, t.title, t.status, t.project_id, p.name AS project_name FROM tasks t
         JOIN projects p ON p.id = t.project_id
         JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
         WHERE t.title ILIKE $2 OR t.description ILIKE $2 ORDER BY t.updated_at DESC LIMIT 8`, [uid, like]),
      query(
        `SELECT id, title, left(content, 100) AS preview FROM notes
         WHERE user_id = $1 AND (title ILIKE $2 OR content ILIKE $2) ORDER BY updated_at DESC LIMIT 5`, [uid, like]),
      query(
        `SELECT id, title, topic, difficulty, status FROM dsa_problems
         WHERE user_id = $1 AND (title ILIKE $2 OR topic ILIKE $2) ORDER BY created_at DESC LIMIT 5`, [uid, like]),
      query(
        `SELECT id, title, language FROM snippets
         WHERE user_id = $1 AND (title ILIKE $2 OR notes ILIKE $2 OR code ILIKE $2) ORDER BY updated_at DESC LIMIT 5`, [uid, like]),
    ]);
    res.json({ projects: projects.rows, tasks: tasks.rows, notes: notes.rows, problems: problems.rows, snippets: snippets.rows });
  } catch (e) { next(e); }
});

export default router;
