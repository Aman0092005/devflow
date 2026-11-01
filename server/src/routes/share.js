import { Router } from 'express';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { getRole } from '../access.js';
import { ensureColumns } from '../columns.js';

export const shareRoutes = Router();

// Public (mounted before the login check): a read-only snapshot of a board. Deliberately leaves out comments,
// attachments, assignees, member names and emails, and GitHub links.
export async function sharedBoard(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT s.project_id, p.name, p.description, p.color FROM project_shares s JOIN projects p ON p.id = s.project_id
       WHERE s.token = $1 AND NOT s.revoked`, [req.params.token]);
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'This share link isn’t active. Ask the owner for a new one.' });
    await ensureColumns(s.project_id);
    const [columns, tasks, labels] = await Promise.all([
      query('SELECT id, name, stage, position FROM project_columns WHERE project_id=$1 ORDER BY position, id', [s.project_id]),
      query(
        `SELECT t.id, t.title, t.description, t.status, t.column_id, t.priority, t.due_date, t.position,
           COALESCE((SELECT array_agg(tl.label_id ORDER BY tl.label_id) FROM task_labels tl WHERE tl.task_id = t.id), '{}') AS label_ids,
           (SELECT COUNT(*)::int FROM task_checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
           (SELECT COUNT(*)::int FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.done) AS checklist_done
         FROM tasks t WHERE t.project_id = $1 ORDER BY t.position, t.id`, [s.project_id]),
      query('SELECT id, name, color FROM labels WHERE project_id=$1 ORDER BY lower(name)', [s.project_id]),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.json({ project: { name: s.name, description: s.description, color: s.color }, columns: columns.rows, tasks: tasks.rows, labels: labels.rows });
  } catch (e) { next(e); }
}

const ownerOnly = async (req, res) => {
  const role = await getRole(req.params.projectId, req.userId);
  if (role !== 'owner') { res.status(role ? 403 : 404).json({ error: role ? 'Only the project owner can manage the share link.' : 'Project not found.' }); return false; }
  return true;
};
const activeToken = async (projectId) =>
  (await query('SELECT token FROM project_shares WHERE project_id=$1 AND NOT revoked ORDER BY id DESC LIMIT 1', [projectId])).rows[0]?.token || null;

shareRoutes.get('/projects/:projectId/share', async (req, res, next) => {
  try {
    if (!(await ownerOnly(req, res))) return;
    res.json({ token: await activeToken(req.params.projectId) });
  } catch (e) { next(e); }
});

shareRoutes.post('/projects/:projectId/share', async (req, res, next) => {
  try {
    if (!(await ownerOnly(req, res))) return;
    let token = await activeToken(req.params.projectId);
    if (!token) {
      token = crypto.randomBytes(24).toString('base64url');
      await query('INSERT INTO project_shares (project_id, token, created_by) VALUES ($1,$2,$3)', [req.params.projectId, token, req.userId]);
    }
    res.status(201).json({ token });
  } catch (e) { next(e); }
});

shareRoutes.delete('/projects/:projectId/share', async (req, res, next) => {
  try {
    if (!(await ownerOnly(req, res))) return;
    await query('UPDATE project_shares SET revoked = true WHERE project_id=$1', [req.params.projectId]);
    res.status(204).end();
  } catch (e) { next(e); }
});
