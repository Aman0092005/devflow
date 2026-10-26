import { query } from './db.js';

export async function getRole(projectId, userId) {
  const { rows } = await query(
    'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2', [projectId, userId]);
  return rows[0]?.role || null;
}
