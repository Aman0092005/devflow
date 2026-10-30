import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, reminders: u.reminders !== false });

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, lower($2), $3) RETURNING *',
      [name.trim(), email.trim(), hash]
    );
    res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email already has an account.' });
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await query('SELECT * FROM users WHERE email = lower($1)', [email || '']);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash)))
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) return res.status(401).json({ error: 'Account not found.' });
    res.json({ user: publicUser(rows[0]) });
  } catch (e) { next(e); }
});

router.put('/timezone', requireAuth, async (req, res, next) => {
  try {
    const tz = String(req.body.tz || '');
    if (!(await query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [tz])).rowCount)
      return res.status(400).json({ error: 'Unknown timezone.' });
    await query('UPDATE users SET timezone=$2 WHERE id=$1', [req.userId, tz]);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.put('/reminders', requireAuth, async (req, res, next) => {
  try {
    await query('UPDATE users SET reminders=$2 WHERE id=$1', [req.userId, !!req.body.enabled]);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Your name can’t be empty.' });
    if (name.length > 60) return res.status(400).json({ error: 'Names can be up to 60 characters.' });
    const { rows } = await query('UPDATE users SET name=$2 WHERE id=$1 RETURNING *', [req.userId, name]);
    res.json({ user: publicUser(rows[0]) });
  } catch (e) { next(e); }
});

// Wrong current password is a 400, not a 401: a 401 would sign the person out of the app.
router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const fresh = req.body.next;
    if (typeof fresh !== 'string' || fresh.length < 8) return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
    const { rows } = await query('SELECT password_hash FROM users WHERE id=$1', [req.userId]);
    if (!rows[0] || !(await bcrypt.compare(String(req.body.current || ''), rows[0].password_hash)))
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.userId, await bcrypt.hash(fresh, 10)]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
