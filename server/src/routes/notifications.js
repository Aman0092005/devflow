import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const [items, unread, pref] = await Promise.all([
      query(
        `SELECT n.*, p.name AS project_name FROM notifications n
         LEFT JOIN projects p ON p.id = n.project_id
         WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 30`, [req.userId]),
      query('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND NOT is_read', [req.userId]),
      query('SELECT reminders FROM users WHERE id=$1', [req.userId]),
    ]);
    res.json({ items: items.rows, unread: unread.rows[0].c, reminders: pref.rows[0]?.reminders !== false });
  } catch (e) { next(e); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE user_id=$1 AND NOT is_read', [req.userId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
