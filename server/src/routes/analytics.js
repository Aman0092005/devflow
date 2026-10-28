import { Router } from 'express';
import { query } from '../db.js';

const router = Router();
const DAYS = (table, col, where) => `
  SELECT d::date AS day, COALESCE(c.n, 0)::int AS n
  FROM generate_series((CURRENT_DATE - 13)::timestamp, CURRENT_DATE::timestamp, interval '1 day') d
  LEFT JOIN (SELECT ${col}::date AS day, COUNT(*) AS n ${table} WHERE ${where} AND ${col} >= CURRENT_DATE - 13 GROUP BY 1) c
    ON c.day = d::date
  ORDER BY d`;

router.get('/', async (req, res, next) => {
  try {
    const uid = req.userId;
    const memberTasks = 'FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $1';
    const [kpi, tasksPerDay, dsaPerDay, topics, workload, solvedDays, todayRow] = await Promise.all([
      query(
        `SELECT COUNT(*) FILTER (WHERE t.completed_at >= now() - interval '7 days')::int AS done_7d,
           COUNT(*) FILTER (WHERE t.status <> 'done' AND t.due_date < CURRENT_DATE)::int AS overdue,
           ROUND((AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 86400)
             FILTER (WHERE t.completed_at IS NOT NULL))::numeric, 1) AS avg_days
         ${memberTasks}`, [uid]),
      query(DAYS(memberTasks, 't.completed_at', 't.completed_at IS NOT NULL'), [uid]),
      query(DAYS('FROM dsa_problems d2', 'd2.solved_at', "d2.user_id = $1 AND d2.status = 'solved'"), [uid]),
      query(
        `SELECT topic, COUNT(*)::int AS n FROM dsa_problems WHERE user_id = $1 AND status = 'solved'
         GROUP BY topic ORDER BY n DESC, topic LIMIT 6`, [uid]),
      query(
        `SELECT COALESCE(u.name, 'Unassigned') AS name, COUNT(*)::int AS n
         ${memberTasks} LEFT JOIN users u ON u.id = t.assignee_id
         WHERE t.status <> 'done' GROUP BY 1 ORDER BY n DESC, name LIMIT 8`, [uid]),
      query(`SELECT DISTINCT solved_at FROM dsa_problems WHERE user_id = $1 AND status = 'solved' AND solved_at IS NOT NULL
             ORDER BY solved_at DESC LIMIT 400`, [uid]),
      query('SELECT CURRENT_DATE AS today'),
    ]);

    // Current solving streak: consecutive days ending today (or yesterday if nothing solved yet today).
    const solved = new Set(solvedDays.rows.map((r) => r.solved_at));
    const iso = (d) => d.toISOString().slice(0, 10);
    const cursor = new Date(`${todayRow.rows[0].today}T00:00:00Z`);
    if (!solved.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let streak = 0;
    while (solved.has(iso(cursor))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }

    const k = kpi.rows[0];
    res.json({
      kpi: { done_7d: k.done_7d, overdue: k.overdue, avg_days: k.avg_days === null ? null : Number(k.avg_days), streak },
      tasksPerDay: tasksPerDay.rows,
      dsaPerDay: dsaPerDay.rows,
      topics: topics.rows,
      workload: workload.rows,
    });
  } catch (e) { next(e); }
});

export default router;
