import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const { rows } = await query(
      `SELECT id, project_id, title, left(content, 140) AS preview, updated_at FROM notes
       WHERE user_id=$1 AND ($2 = '' OR title ILIKE '%'||$2||'%' OR content ILIKE '%'||$2||'%')
       ORDER BY updated_at DESC`,
      [req.userId, q]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM notes WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Note not found.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title = 'Untitled', content = '', project_id = null } = req.body;
    const { rows } = await query(
      'INSERT INTO notes (user_id, title, content, project_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.userId, title, content, project_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { title, content, project_id } = req.body;
    const { rows } = await query(
      `UPDATE notes SET title=COALESCE($3,title), content=COALESCE($4,content),
         project_id=CASE WHEN $6 THEN $5 ELSE project_id END, updated_at=now()
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.userId, title, content, project_id || null, 'project_id' in req.body]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Note not found.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const r = await query('DELETE FROM notes WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Note not found.' });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
