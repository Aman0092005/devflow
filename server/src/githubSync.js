import { query } from './db.js';
import { decrypt } from './crypto.js';
import { gh } from './github.js';
import { emitToProject } from './socket.js';
import { notify } from './notify.js';
import { logActivity } from './activityLog.js';

// When a task that came from a GitHub issue moves to Done (or back out of Done), close (or reopen) the issue.
// Only runs if the project owner switched "sync" on. Never throws; a failure becomes a notification for the person who moved the task.
export async function syncIssue(task, newStatus, actorId) {
  try {
    const link = (await query('SELECT repo, sync_status, linked_by FROM project_repos WHERE project_id=$1', [task.project_id])).rows[0];
    if (!link || !link.sync_status) return;
    const want = newStatus === 'done' ? 'closed' : 'open';
    if (task.github_state === want) return;

    const row = (await query('SELECT token_enc FROM github_accounts WHERE user_id=$1', [link.linked_by])).rows[0];
    if (!row) throw new Error('the GitHub connection is gone');
    const number = Number(String(task.github_ref).replace('#', ''));
    await gh(decrypt(row.token_enc), `/repos/${link.repo}/issues/${number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(want === 'closed' ? { state: 'closed', state_reason: 'completed' } : { state: 'open' }),
    });

    const { rows } = await query('UPDATE tasks SET github_state=$2 WHERE id=$1 RETURNING *', [task.id, want]);
    emitToProject(task.project_id, 'task:updated', { task: rows[0] });
    logActivity({ projectId: task.project_id, userId: actorId, kind: want === 'closed' ? 'github_closed' : 'github_reopened', taskId: task.id, meta: { title: task.title, ref: task.github_ref } });
  } catch (e) {
    console.error('GitHub sync failed:', e.message, e.ghStatus || '');
    await notify({
      userId: actorId, projectId: task.project_id, taskId: task.id, type: 'github_sync', system: true,
      text: `Couldn’t update GitHub issue ${task.github_ref} for “${task.title}”. Check that the repository link is still valid and has write access.`,
    });
  }
}
