import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// The browser runs the timer and reports a finished (or stopped) session here.
router.post('/focus', async (req, res, next) => {
  try {
    const seconds = Math.round(Number(req.body.seconds));
    if (!Number.isFinite(seconds) || seconds < 60 || seconds > 3 * 3600)
      return res.status(400).json({ error: 'A focus session must be between 1 minute and 3 hours.' });
    const started = new Date(req.body.started_at);
    const now = Date.now();
    if (isNaN(started) || started.getTime() > now + 5 * 60_000 || started.getTime() < now - 24 * 3600_000)
      return res.status(400).json({ error: 'That session start time isn’t valid.' });

    let taskId = null;
    if (req.body.task_id) {
      const t = await query(
        `SELECT t.id FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2 WHERE t.id = $1`,
        [req.body.task_id, req.userId]);
      if (!t.rows[0]) return res.status(404).json({ error: 'Task not found.' });
      taskId = t.rows[0].id;
    }
    await query(
      `INSERT INTO focus_sessions (user_id, task_id, started_at, seconds, completed) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, started_at) DO NOTHING`, // a second tab reporting the same session is ignored
      [req.userId, taskId, started.toISOString(), seconds, !!req.body.completed]);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/tasks/:id/focus', async (req, res, next) => {
  try {
    const ok = await query(
      `SELECT 1 FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2 WHERE t.id = $1`, [req.params.id, req.userId]);
    if (!ok.rowCount) return res.status(404).json({ error: 'Task not found.' });
    const { rows } = await query(
      `SELECT COALESCE(SUM(seconds), 0)::int AS total, COALESCE(SUM(seconds) FILTER (WHERE user_id = $2), 0)::int AS mine, COUNT(*)::int AS sessions
       FROM focus_sessions WHERE task_id = $1`, [req.params.id, req.userId]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

export default router;
