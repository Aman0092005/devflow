import { query } from './db.js';
import { notify } from './notify.js';

const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// Reminds the assignee (or the project owner when nobody is assigned) about open tasks that are due tomorrow,
// due today, or overdue by up to 3 days. "Today" is each person's own date, using the timezone their browser
// reported. task_reminders makes sure each reminder is sent only once per due date.
export async function runReminders() {
  try {
    const { rows } = await query(`
      WITH due AS (
        SELECT t.id AS task_id, t.title, t.project_id, t.due_date, COALESCE(t.assignee_id, p.owner_id) AS user_id,
               (now() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::date AS today
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN users u ON u.id = COALESCE(t.assignee_id, p.owner_id) AND u.reminders
        WHERE t.status <> 'done' AND t.due_date IS NOT NULL
      )
      SELECT task_id, title, project_id, due_date, user_id,
             CASE WHEN due_date = today + 1 THEN 'tomorrow' WHEN due_date = today THEN 'today' ELSE 'overdue' END AS kind
      FROM due WHERE due_date BETWEEN today - 3 AND today + 1`);

    for (const r of rows) {
      const sent = await query(
        `INSERT INTO task_reminders (task_id, user_id, kind, due_date) VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING RETURNING task_id`, [r.task_id, r.user_id, r.kind, r.due_date]);
      if (!sent.rowCount) continue; // already reminded
      const text = r.kind === 'tomorrow' ? `“${r.title}” is due tomorrow`
        : r.kind === 'today' ? `“${r.title}” is due today`
        : `“${r.title}” is overdue (was due ${fmt(r.due_date)})`;
      await notify({ userId: r.user_id, projectId: r.project_id, taskId: r.task_id, type: 'task_due', text, system: true });
    }
  } catch (e) {
    console.error('reminders failed:', e.message);
  }
}

// Runs once at startup (to catch up after downtime), then every 15 minutes.
export function startReminders() {
  runReminders();
  setInterval(runReminders, 15 * 60 * 1000);
}
