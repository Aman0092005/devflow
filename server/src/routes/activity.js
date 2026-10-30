import { Router } from 'express';
import { query } from '../db.js';

const router = Router();
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= '2100-12-31';
const shift = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

router.get('/', async (req, res, next) => {
  try {
    const uid = req.userId;
    // The browser sends its own date and timezone so "today" and day boundaries match the user, not the server.
    const today = isDay(req.query.today) ? req.query.today : (await query('SELECT CURRENT_DATE AS d')).rows[0].d;
    const tzKnown = typeof req.query.tz === 'string' && (await query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [req.query.tz])).rowCount > 0;
    const tz = tzKnown ? req.query.tz : 'UTC';

    const [events, focus, due, upNext] = await Promise.all([
      // Activity = tasks you finished (assigned to you, or unassigned) + DSA solved + DSA revisions + notes written.
      query(
        `WITH ev AS (
           SELECT (t.completed_at AT TIME ZONE $2)::date AS day
             FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $1
             WHERE t.completed_at IS NOT NULL AND (t.assignee_id = $1 OR t.assignee_id IS NULL)
           UNION ALL SELECT solved_at FROM dsa_problems WHERE user_id = $1 AND solved_at IS NOT NULL
           UNION ALL SELECT reviewed_on FROM dsa_reviews WHERE user_id = $1
           UNION ALL SELECT (created_at AT TIME ZONE $2)::date FROM notes WHERE user_id = $1
         )
         SELECT day, COUNT(*)::int AS n FROM ev
         WHERE day >= $3::date - 365 AND day <= $3::date GROUP BY day ORDER BY day`, [uid, tz, today]),
      query(
        `SELECT t.id, t.title, t.due_date, t.priority, t.status, t.project_id, p.name AS project_name
         FROM tasks t JOIN projects p ON p.id = t.project_id
         JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
         WHERE t.status <> 'done' AND (t.assignee_id = $1 OR t.assignee_id IS NULL)
           AND (t.status = 'in_progress' OR t.due_date <= $2::date)
         ORDER BY (t.due_date IS NULL), t.due_date,
           CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END LIMIT 6`, [uid, today]),
      query(
        `SELECT COUNT(*)::int AS n FROM dsa_problems
         WHERE user_id = $1 AND status <> 'todo' AND next_review IS NOT NULL AND next_review <= $2::date`, [uid, today]),
      // Suggestions when nothing is urgent: your highest-priority To do tasks that aren't already listed above.
      query(
        `SELECT t.id, t.title, t.due_date, t.priority, t.status, t.project_id, p.name AS project_name
         FROM tasks t JOIN projects p ON p.id = t.project_id
         JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
         WHERE t.status = 'todo' AND (t.assignee_id = $1 OR t.assignee_id IS NULL)
           AND NOT (t.due_date IS NOT NULL AND t.due_date <= $2::date)
         ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, (t.due_date IS NULL), t.due_date, t.position
         LIMIT 3`, [uid, today]),
    ]);

    const counts = Object.fromEntries(events.rows.map((r) => [r.day, r.n]));
    let cursor = counts[today] ? today : shift(today, -1); // a streak survives until the day ends
    let streak = 0;
    while (counts[cursor]) { streak++; cursor = shift(cursor, -1); }

    res.json({ today, days: events.rows, streak, today_count: counts[today] || 0, focus: focus.rows, up_next: upNext.rows, revise_due: due.rows[0].n });
  } catch (e) { next(e); }
});

export default router;
