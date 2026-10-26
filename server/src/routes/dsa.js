import { Router } from 'express';
import { query } from '../db.js';

const router = Router();
const STATUSES = ['todo', 'attempted', 'solved', 'revisit'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status='solved')::int AS solved,
         COUNT(*) FILTER (WHERE status='solved' AND difficulty='easy')::int AS easy,
         COUNT(*) FILTER (WHERE status='solved' AND difficulty='medium')::int AS medium,
         COUNT(*) FILTER (WHERE status='solved' AND difficulty='hard')::int AS hard,
         COUNT(*) FILTER (WHERE next_review IS NOT NULL AND next_review <= CURRENT_DATE AND status<>'todo')::int AS review_due
       FROM dsa_problems WHERE user_id=$1`, [req.userId]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const { status = '', difficulty = '', q = '' } = req.query;
    const { rows } = await query(
      `SELECT * FROM dsa_problems WHERE user_id=$1
         AND ($2='' OR status=$2) AND ($3='' OR difficulty=$3)
         AND ($4='' OR title ILIKE '%'||$4||'%' OR topic ILIKE '%'||$4||'%')
       ORDER BY created_at DESC`,
      [req.userId, status, difficulty, q.trim()]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, platform = 'LeetCode', url = '', topic = 'General', difficulty = 'medium', status = 'todo', notes = '', next_review = null } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Give the problem a title.' });
    if (!DIFFICULTIES.includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty.' });
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const { rows } = await query(
      `INSERT INTO dsa_problems (user_id, title, platform, url, topic, difficulty, status, notes, next_review, solved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $7='solved' THEN CURRENT_DATE END) RETURNING *`,
      [req.userId, title.trim(), platform, url, topic.trim() || 'General', difficulty, status, notes, next_review || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { title, platform, url, topic, difficulty, status, notes, next_review } = req.body;
    if (difficulty && !DIFFICULTIES.includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty.' });
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const { rows } = await query(
      `UPDATE dsa_problems SET
         title=COALESCE($3,title), platform=COALESCE($4,platform), url=COALESCE($5,url),
         topic=COALESCE($6,topic), difficulty=COALESCE($7,difficulty), status=COALESCE($8,status),
         notes=COALESCE($9,notes),
         next_review=CASE WHEN $11 THEN $10 ELSE next_review END,
         solved_at=CASE WHEN $8='solved' AND solved_at IS NULL THEN CURRENT_DATE ELSE solved_at END
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.userId, title, platform, url, topic, difficulty, status, notes, next_review || null, 'next_review' in req.body]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Problem not found.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const r = await query('DELETE FROM dsa_problems WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Problem not found.' });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
