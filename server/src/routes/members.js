import { Router } from 'express';
import { query } from '../db.js';
import { getRole } from '../access.js';
import { emitToProject, removeUserFromProject } from '../socket.js';
import { notify } from '../notify.js';

const router = Router();

router.get('/projects/:projectId/members', async (req, res, next) => {
  try {
    if (!(await getRole(req.params.projectId, req.userId)))
      return res.status(404).json({ error: 'Project not found.' });
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, pm.role FROM project_members pm
       JOIN users u ON u.id = pm.user_id WHERE pm.project_id = $1
       ORDER BY (pm.role = 'owner') DESC, u.name`, [req.params.projectId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/projects/:projectId/members', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const role = await getRole(projectId, req.userId);
    if (!role) return res.status(404).json({ error: 'Project not found.' });
    if (role !== 'owner') return res.status(403).json({ error: 'Only the project owner can invite people.' });

    const email = (req.body.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Enter an email address.' });
    const { rows } = await query('SELECT id, name, email FROM users WHERE email = lower($1)', [email]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'No DevFlow account uses that email. Ask them to sign up first.' });
    if (await getRole(projectId, user.id)) return res.status(409).json({ error: `${user.name} is already on this project.` });

    await query('INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,\'member\')', [projectId, user.id]);
    const member = { ...user, role: 'member' };
    emitToProject(projectId, 'member:added', { member }, req.get('x-socket-id'));
    await notify({ userId: user.id, actorId: req.userId, projectId: Number(projectId), type: 'added_to_project', text: 'added you to the project' });
    res.status(201).json(member);
  } catch (e) { next(e); }
});

router.delete('/projects/:projectId/members/:userId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const targetId = Number(req.params.userId);
    const role = await getRole(projectId, req.userId);
    if (!role) return res.status(404).json({ error: 'Project not found.' });
    if (targetId !== req.userId && role !== 'owner')
      return res.status(403).json({ error: 'Only the project owner can remove members.' });
    const targetRole = await getRole(projectId, targetId);
    if (!targetRole) return res.status(404).json({ error: 'That person is not on this project.' });
    if (targetRole === 'owner')
      return res.status(400).json({ error: 'The owner cannot be removed. Delete the project instead.' });

    await query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [projectId, targetId]);
    await query('UPDATE tasks SET assignee_id = NULL WHERE project_id=$1 AND assignee_id=$2', [projectId, targetId]);
    emitToProject(projectId, 'member:removed', { userId: targetId }, req.get('x-socket-id'));
    removeUserFromProject(projectId, targetId);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
