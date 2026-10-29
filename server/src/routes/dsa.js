import { Router } from 'express';
import { query } from '../db.js';

const router = Router();
const STATUSES = ['todo', 'attempted', 'solved', 'revisit'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const validDate = (v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= '2100-12-31');
const DATE_ERROR = 'The revise-on date must be a real date between 2000 and 2100.';
// Days until the next revision after each successful review: solved -> +1 day, then these.
const INTERVALS = [1, 3, 7, 14, 30, 60];
// The browser sends its own calendar date so "today" matches the user's timezone, not the database's.
const clientToday = (v) => (typeof v === 'string' && v && validDate(v) ? v : null);

router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status='solved')::int AS solved,
         COUNT(*) FILTER (WHERE status='solved' AND difficulty='easy')::int AS easy,
         COUNT(*) FILTER (WHERE status='solved' AND difficulty='medium')::int AS medium,
         COUNT(*) FILTER (WHERE status='solved' AND difficulty='hard')::int AS hard,
         COUNT(*) FILTER (WHERE next_review IS NOT NULL AND next_review <= COALESCE($2::date, CURRENT_DATE) AND status<>'todo')::int AS review_due
       FROM dsa_problems WHERE user_id=$1`, [req.userId, clientToday(req.query.today)]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.get('/due', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM dsa_problems
       WHERE user_id=$1 AND status<>'todo' AND next_review IS NOT NULL AND next_review <= COALESCE($2::date, CURRENT_DATE)
       ORDER BY next_review, id LIMIT 20`, [req.userId, clientToday(req.query.today)]);
    res.json(rows);
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
    if (!validDate(next_review)) return res.status(400).json({ error: DATE_ERROR });
    const { rows } = await query(
      `INSERT INTO dsa_problems (user_id, title, platform, url, topic, difficulty, status, notes, next_review, solved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
         COALESCE($9::date, CASE WHEN $7 = 'solved' THEN COALESCE($10::date, CURRENT_DATE) + 1 END),
         CASE WHEN $7 = 'solved' THEN COALESCE($10::date, CURRENT_DATE) END) RETURNING *`,
      [req.userId, title.trim(), platform, url, topic.trim() || 'General', difficulty, status, notes, next_review || null, clientToday(req.body.today)]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { title, platform, url, topic, difficulty, status, notes, next_review } = req.body;
    if (difficulty && !DIFFICULTIES.includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty.' });
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    if (!validDate(next_review)) return res.status(400).json({ error: DATE_ERROR });
    const { rows } = await query(
      `UPDATE dsa_problems SET
         title=COALESCE($3,title), platform=COALESCE($4,platform), url=COALESCE($5,url),
         topic=COALESCE($6,topic), difficulty=COALESCE($7,difficulty), status=COALESCE($8,status),
         notes=COALESCE($9,notes),
         next_review = CASE WHEN $11 THEN $10::date
                            WHEN $8 = 'solved' AND solved_at IS NULL AND next_review IS NULL THEN COALESCE($12::date, CURRENT_DATE) + 1
                            ELSE next_review END,
         solved_at = CASE WHEN $8 = 'solved' AND solved_at IS NULL THEN COALESCE($12::date, CURRENT_DATE) ELSE solved_at END
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.userId, title, platform, url, topic, difficulty, status, notes, next_review || null,
       'next_review' in req.body, clientToday(req.body.today)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Problem not found.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// "good" pushes the next revision further out (3, 7, 14, 30, 60 days); "again" brings it back tomorrow.
router.post('/:id/review', async (req, res, next) => {
  try {
    const result = req.body.result;
    if (!['good', 'again'].includes(result)) return res.status(400).json({ error: 'Choose Got it or Forgot.' });
    const { rows } = await query(
      `UPDATE dsa_problems SET
         review_count = CASE WHEN $3 = 'good' THEN review_count + 1 ELSE 0 END,
         last_reviewed = COALESCE($4::date, CURRENT_DATE),
         next_review = COALESCE($4::date, CURRENT_DATE) + CASE WHEN $3 = 'good' THEN ($5::int[])[LEAST(review_count + 2, 6)] ELSE 1 END
       WHERE id=$1 AND user_id=$2 AND status<>'todo' RETURNING *`,
      [req.params.id, req.userId, result, clientToday(req.body.today), INTERVALS]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Problem not found, or you haven’t started it yet.' });
    await query('INSERT INTO dsa_reviews (problem_id, user_id, reviewed_on, result) VALUES ($1,$2,$3,$4)',
      [rows[0].id, req.userId, rows[0].last_reviewed, result]);
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
