import { Router } from 'express';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { getRole } from '../access.js';
import { emitToProject } from '../socket.js';
import { notify } from '../notify.js';
import { logActivity } from '../activityLog.js';

export const inviteAuthed = Router();

const DAYS = [1, 7, 30];
const USES = [1, 5, null];

const whyUnusable = (i) => {
  if (i.revoked) return 'This invite link was cancelled. Ask the project owner for a new one.';
  if (new Date(i.expires_at) < new Date()) return 'This invite link has expired. Ask the project owner for a new one.';
  if (i.max_uses !== null && i.uses >= i.max_uses) return 'This invite link has already been used the maximum number of times. Ask for a new one.';
  return null;
};

// Public (mounted before the login check): lets someone see which project they are being invited to.
export async function invitePreview(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT i.revoked, i.expires_at, i.max_uses, i.uses, p.name AS project_name, u.name AS invited_by
       FROM project_invites i JOIN projects p ON p.id = i.project_id LEFT JOIN users u ON u.id = i.created_by
       WHERE i.token = $1`, [req.params.token]);
    const i = rows[0];
    if (!i) return res.status(404).json({ error: 'This invite link doesn’t exist. Check that you copied all of it.' });
    const gone = whyUnusable(i);
    if (gone) return res.status(410).json({ error: gone });
    res.json({ project_name: i.project_name, invited_by: i.invited_by });
  } catch (e) { next(e); }
}

inviteAuthed.get('/projects/:projectId/invites', async (req, res, next) => {
  try {
    if ((await getRole(req.params.projectId, req.userId)) !== 'owner') return res.status(403).json({ error: 'Only the project owner can manage invite links.' });
    const { rows } = await query(
      `SELECT id, token, expires_at, max_uses, uses, created_at FROM project_invites
       WHERE project_id = $1 AND NOT revoked AND expires_at > now() AND (max_uses IS NULL OR uses < max_uses)
       ORDER BY created_at DESC`, [req.params.projectId]);
    res.json(rows);
  } catch (e) { next(e); }
});

inviteAuthed.post('/projects/:projectId/invites', async (req, res, next) => {
  try {
    if ((await getRole(req.params.projectId, req.userId)) !== 'owner') return res.status(403).json({ error: 'Only the project owner can create invite links.' });
    const days = DAYS.includes(Number(req.body.days)) ? Number(req.body.days) : 7;
    const maxUses = USES.includes(req.body.maxUses) ? req.body.maxUses : 5;
    const token = crypto.randomBytes(24).toString('base64url');
    const { rows } = await query(
      `INSERT INTO project_invites (project_id, token, created_by, expires_at, max_uses)
       VALUES ($1,$2,$3, now() + ($4 || ' days')::interval, $5)
       RETURNING id, token, expires_at, max_uses, uses, created_at`,
      [req.params.projectId, token, req.userId, String(days), maxUses]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

inviteAuthed.delete('/projects/:projectId/invites/:inviteId', async (req, res, next) => {
  try {
    if ((await getRole(req.params.projectId, req.userId)) !== 'owner') return res.status(403).json({ error: 'Only the project owner can cancel invite links.' });
    await query('UPDATE project_invites SET revoked = true WHERE id = $1 AND project_id = $2', [req.params.inviteId, req.params.projectId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

inviteAuthed.post('/invites/:token/accept', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT i.*, p.owner_id FROM project_invites i JOIN projects p ON p.id = i.project_id WHERE i.token = $1`, [req.params.token]);
    const invite = rows[0];
    if (!invite) return res.status(404).json({ error: 'This invite link doesn’t exist.' });
    const gone = whyUnusable(invite);
    if (gone) return res.status(410).json({ error: gone });

    if (await getRole(invite.project_id, req.userId)) return res.json({ project_id: invite.project_id, joined: false }); // already a member: no use consumed

    // Consume one use atomically so two people can't both take the last slot.
    const used = await query(
      `UPDATE project_invites SET uses = uses + 1
       WHERE id = $1 AND NOT revoked AND expires_at > now() AND (max_uses IS NULL OR uses < max_uses) RETURNING id`, [invite.id]);
    if (!used.rowCount) return res.status(410).json({ error: 'This invite link has just run out of uses. Ask for a new one.' });

    await query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [invite.project_id, req.userId]);
    const me = (await query('SELECT id, name, email FROM users WHERE id = $1', [req.userId])).rows[0];
    emitToProject(invite.project_id, 'member:added', { member: { ...me, role: 'member' } });
    await notify({ userId: invite.owner_id, actorId: req.userId, projectId: invite.project_id, type: 'member_joined', text: 'joined the project through an invite link' });
    logActivity({ projectId: invite.project_id, userId: req.userId, kind: 'member_joined' });
    res.json({ project_id: invite.project_id, joined: true });
  } catch (e) { next(e); }
});
