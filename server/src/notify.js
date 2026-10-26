import { query } from './db.js';
import { emitToUser } from './socket.js';

// Saves a notification and pushes it live. Never throws: a failed notification must not fail the request.
export async function notify({ userId, actorId, projectId, type, text }) {
  try {
    userId = Number(userId);
    if (!userId || userId === actorId) return;
    const actor = (await query('SELECT name FROM users WHERE id=$1', [actorId])).rows[0]?.name || 'Someone';
    const { rows } = await query(
      `WITH n AS (
         INSERT INTO notifications (user_id, project_id, type, message) VALUES ($1,$2,$3,$4) RETURNING *
       ) SELECT n.*, p.name AS project_name FROM n LEFT JOIN projects p ON p.id = n.project_id`,
      [userId, projectId, type, `${actor} ${text}`]
    );
    emitToUser(userId, 'notification', rows[0]);
  } catch (e) {
    console.error('notify failed:', e.message);
  }
}
