import { query } from './db.js';
import { emitToProject } from './socket.js';

// Records "who did what" for a project's activity feed and pushes it live. Never throws.
export async function logActivity({ projectId, userId, kind, taskId = null, meta = {} }) {
  try {
    const { rows } = await query(
      `WITH a AS (
         INSERT INTO project_activity (project_id, user_id, kind, task_id, meta) VALUES ($1,$2,$3,$4,$5) RETURNING *
       ) SELECT a.id, a.project_id, a.user_id, a.kind, a.task_id, a.meta, a.created_at, u.name AS user_name
         FROM a LEFT JOIN users u ON u.id = a.user_id`,
      [projectId, userId, kind, taskId, meta]
    );
    emitToProject(projectId, 'activity:new', { item: rows[0] });
  } catch (e) {
    console.error('activity log failed:', e.message);
  }
}
