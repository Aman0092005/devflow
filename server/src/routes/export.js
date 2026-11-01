import { Router } from 'express';
import { query } from '../db.js';
import { getRole } from '../access.js';

const router = Router();

// CSV cells that start with = + - @ can run as formulas when opened in Excel, so they get a leading apostrophe.
const cell = (v) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) =>
  '\uFEFF' + [cols.map(([h]) => h).join(','), ...rows.map((r) => cols.map(([, get]) => cell(get(r))).join(','))].join('\r\n');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
const send = (res, filename, type, body) => {
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(body);
};
const fence = (code) => '`'.repeat(Math.max(3, ...(code.match(/`+/g) || []).map((m) => m.length + 1)));

const TASKS_SQL = `
  SELECT t.id, t.title, t.description, t.status, c.name AS column_name, t.priority, t.due_date, u.name AS assignee,
    t.created_at, t.completed_at, t.github_ref,
    COALESCE((SELECT array_agg(l.name ORDER BY l.name) FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = t.id), '{}') AS labels,
    (SELECT COUNT(*)::int FROM task_checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
    (SELECT COUNT(*)::int FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.done) AS checklist_done,
    COALESCE((SELECT SUM(seconds) FROM focus_sessions f WHERE f.task_id = t.id), 0)::int AS focus_seconds
  FROM tasks t LEFT JOIN project_columns c ON c.id = t.column_id LEFT JOIN users u ON u.id = t.assignee_id
  WHERE t.project_id = $1 ORDER BY c.position, t.position, t.id`;

async function projectData(projectId) {
  const [project, columns, labels, tasks, checklist, comments] = await Promise.all([
    query('SELECT id, name, description, color, created_at FROM projects WHERE id=$1', [projectId]),
    query('SELECT name, stage, position FROM project_columns WHERE project_id=$1 ORDER BY position', [projectId]),
    query('SELECT name, color FROM labels WHERE project_id=$1 ORDER BY lower(name)', [projectId]),
    query(TASKS_SQL, [projectId]),
    query(`SELECT i.task_id, i.text, i.done FROM task_checklist_items i JOIN tasks t ON t.id = i.task_id WHERE t.project_id = $1 ORDER BY i.position, i.id`, [projectId]),
    query(`SELECT c.task_id, u.name AS author, c.body, c.created_at FROM task_comments c JOIN tasks t ON t.id = c.task_id
           LEFT JOIN users u ON u.id = c.user_id WHERE t.project_id = $1 ORDER BY c.created_at`, [projectId]),
  ]);
  const group = (rows) => rows.reduce((m, r) => { (m[r.task_id] = m[r.task_id] || []).push(r); return m; }, {});
  const cl = group(checklist.rows), cm = group(comments.rows);
  return {
    project: project.rows[0], columns: columns.rows, labels: labels.rows,
    tasks: tasks.rows.map((t) => ({
      ...t,
      checklist: (cl[t.id] || []).map((i) => ({ text: i.text, done: i.done })),
      comments: (cm[t.id] || []).map((c) => ({ author: c.author, body: c.body, created_at: c.created_at })),
    })),
  };
}

router.get('/project/:id', async (req, res, next) => {
  try {
    if (!(await getRole(req.params.id, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    const data = await projectData(req.params.id);
    const name = slug(data.project.name);
    if (req.query.format === 'json') return send(res, `devflow-${name}.json`, 'application/json', JSON.stringify(data, null, 2));
    const cols = [
      ['Title', (t) => t.title], ['Column', (t) => t.column_name], ['Stage', (t) => t.status], ['Priority', (t) => t.priority],
      ['Due date', (t) => t.due_date], ['Assignee', (t) => t.assignee], ['Labels', (t) => t.labels.join('; ')],
      ['Checklist done', (t) => t.checklist_done], ['Checklist total', (t) => t.checklist_total],
      ['Focus minutes', (t) => Math.round(t.focus_seconds / 60)], ['GitHub issue', (t) => t.github_ref],
      ['Created', (t) => t.created_at], ['Completed', (t) => t.completed_at], ['Description', (t) => t.description],
    ];
    send(res, `devflow-${name}-tasks.csv`, 'text/csv', toCsv(data.tasks, cols));
  } catch (e) { next(e); }
});

router.get('/dsa', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM dsa_problems WHERE user_id=$1 ORDER BY created_at', [req.userId]);
    if (req.query.format === 'json') return send(res, 'devflow-dsa-problems.json', 'application/json', JSON.stringify(rows.map(({ user_id, ...r }) => r), null, 2));
    const cols = ['title', 'platform', 'url', 'topic', 'difficulty', 'status', 'solved_at', 'next_review', 'review_count', 'last_reviewed', 'notes', 'created_at']
      .map((k) => [k.replace(/_/g, ' '), (r) => r[k]]);
    send(res, 'devflow-dsa-problems.csv', 'text/csv', toCsv(rows, cols));
  } catch (e) { next(e); }
});

router.get('/notes', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, title, content, project_id, created_at, updated_at FROM notes WHERE user_id=$1 ORDER BY created_at', [req.userId]);
    if (req.query.format === 'json') return send(res, 'devflow-notes.json', 'application/json', JSON.stringify(rows, null, 2));
    const md = rows.map((n) => `# ${n.title}\n\n_Updated ${n.updated_at.toISOString().slice(0, 10)}_\n\n${n.content}\n`).join('\n---\n\n');
    send(res, 'devflow-notes.md', 'text/markdown', md || '# Notes\n\nNo notes yet.\n');
  } catch (e) { next(e); }
});

router.get('/snippets', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT title, language, code, notes, tags, created_at, updated_at FROM snippets WHERE user_id=$1 ORDER BY created_at', [req.userId]);
    if (req.query.format === 'json') return send(res, 'devflow-snippets.json', 'application/json', JSON.stringify(rows, null, 2));
    const md = rows.map((s) => {
      const f = fence(s.code);
      return `## ${s.title}\n\n${s.tags.length ? `Tags: ${s.tags.map((t) => `#${t}`).join(' ')}\n\n` : ''}${s.notes ? `${s.notes}\n\n` : ''}${f}${s.language === 'text' ? '' : s.language}\n${s.code}\n${f}\n`;
    }).join('\n');
    send(res, 'devflow-snippets.md', 'text/markdown', md || '# Snippets\n\nNo snippets yet.\n');
  } catch (e) { next(e); }
});

// A full backup of everything you can see.
router.get('/all', async (req, res, next) => {
  try {
    const uid = req.userId;
    const [user, projectIds, notes, dsa, reviews, snippets, goals, focus] = await Promise.all([
      query('SELECT id, name, email, created_at FROM users WHERE id=$1', [uid]),
      query('SELECT project_id FROM project_members WHERE user_id=$1 ORDER BY project_id', [uid]),
      query('SELECT id, title, content, project_id, created_at, updated_at FROM notes WHERE user_id=$1 ORDER BY created_at', [uid]),
      query('SELECT * FROM dsa_problems WHERE user_id=$1 ORDER BY created_at', [uid]),
      query('SELECT problem_id, reviewed_on, result FROM dsa_reviews WHERE user_id=$1 ORDER BY id', [uid]),
      query('SELECT title, language, code, notes, tags, created_at, updated_at FROM snippets WHERE user_id=$1 ORDER BY created_at', [uid]),
      query('SELECT metric, target FROM goals WHERE user_id=$1', [uid]),
      query('SELECT task_id, started_at, seconds, completed FROM focus_sessions WHERE user_id=$1 ORDER BY started_at', [uid]),
    ]);
    const projects = [];
    for (const r of projectIds.rows) projects.push(await projectData(r.project_id));
    const body = {
      exported_at: new Date().toISOString(), user: user.rows[0], projects, notes: notes.rows,
      dsa_problems: dsa.rows.map(({ user_id, ...r }) => r), dsa_reviews: reviews.rows, snippets: snippets.rows, goals: goals.rows, focus_sessions: focus.rows,
    };
    send(res, 'devflow-backup.json', 'application/json', JSON.stringify(body, null, 2));
  } catch (e) { next(e); }
});

export default router;
