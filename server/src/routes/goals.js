import { Router } from 'express';
import { query } from '../db.js';

const router = Router();
const METRICS = ['tasks_done', 'dsa_solved', 'dsa_revised', 'focus_minutes'];
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= '2100-12-31';
const shift = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Per-day counts between two dates, for each kind of goal. Dates follow the person's own timezone.
const daily = {
  tasks_done: (uid, tz, a, b) => query(
    `SELECT (t.completed_at AT TIME ZONE $2)::date AS day, COUNT(*)::int AS n
     FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $1
     WHERE t.completed_at IS NOT NULL AND (t.assignee_id = $1 OR t.assignee_id IS NULL)
       AND (t.completed_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date GROUP BY 1`, [uid, tz, a, b]),
  dsa_solved: (uid, tz, a, b) => query(
    `SELECT solved_at AS day, COUNT(*)::int AS n FROM dsa_problems
     WHERE user_id = $1 AND solved_at BETWEEN $2::date AND $3::date GROUP BY 1`, [uid, a, b]),
  dsa_revised: (uid, tz, a, b) => query(
    `SELECT reviewed_on AS day, COUNT(*)::int AS n FROM dsa_reviews
     WHERE user_id = $1 AND reviewed_on BETWEEN $2::date AND $3::date GROUP BY 1`, [uid, a, b]),
  focus_minutes: (uid, tz, a, b) => query(
    `SELECT (started_at AT TIME ZONE $2)::date AS day, ROUND(SUM(seconds) / 60.0)::int AS n FROM focus_sessions
     WHERE user_id = $1 AND (started_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date GROUP BY 1`, [uid, tz, a, b]),
};

router.get('/', async (req, res, next) => {
  try {
    const uid = req.userId;
    const today = isDay(req.query.today) ? req.query.today : (await query('SELECT CURRENT_DATE AS d')).rows[0].d;
    const tzKnown = typeof req.query.tz === 'string' && (await query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [req.query.tz])).rowCount > 0;
    const tz = tzKnown ? req.query.tz : 'UTC';

    // Weeks run Monday to Sunday.
    const monday = shift(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    const week = { start: monday, end: shift(monday, 6) };
    const prev = { start: shift(monday, -7), end: shift(monday, -1) };

    const goals = (await query('SELECT id, metric, target FROM goals WHERE user_id = $1 ORDER BY id', [uid])).rows;
    const out = [];
    for (const g of goals) {
      const rows = (await daily[g.metric](uid, tz, prev.start, week.end)).rows;
      const sum = (r) => rows.filter((x) => x.day >= r.start && x.day <= r.end).reduce((s, x) => s + x.n, 0);
      out.push({ ...g, progress: sum(week), last_week: sum(prev) });
    }
    res.json({ week_start: week.start, week_end: week.end, goals: out });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { metric } = req.body;
    const target = Math.round(Number(req.body.target));
    if (!METRICS.includes(metric)) return res.status(400).json({ error: 'Unknown goal type.' });
    if (!Number.isFinite(target) || target < 1 || target > 10000) return res.status(400).json({ error: 'The target must be a number from 1 to 10000.' });
    const { rows } = await query(
      `INSERT INTO goals (user_id, metric, target) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, metric) DO UPDATE SET target = EXCLUDED.target RETURNING id, metric, target`, [req.userId, metric, target]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM goals WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
