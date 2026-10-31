import { Router } from 'express';
import { query } from '../db.js';
import { getRole } from '../access.js';

const router = Router();
const LANGS = new Set(['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'csharp', 'go', 'rust', 'sql', 'bash', 'html', 'css', 'json', 'markdown', 'text']);
const SELECT = `SELECT s.id, s.title, s.language, s.code, s.notes, s.tags, s.project_id, p.name AS project_name, s.created_at, s.updated_at
                FROM snippets s LEFT JOIN projects p ON p.id = s.project_id`;

const cleanTags = (tags) =>
  [...new Set((Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map((t) => String(t).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24)).filter(Boolean))].slice(0, 8);

// Returns { error } or the cleaned fields.
async function validate(body, userId) {
  const title = String(body.title || '').trim();
  const code = String(body.code || '');
  if (!title) return { error: 'Give the snippet a title.' };
  if (title.length > 100) return { error: 'Titles can be up to 100 characters.' };
  if (!code.trim()) return { error: 'Paste some code first.' };
  if (code.length > 50_000) return { error: 'Snippets can be up to 50,000 characters.' };
  const notes = String(body.notes || '');
  if (notes.length > 2000) return { error: 'Notes can be up to 2000 characters.' };
  const language = LANGS.has(body.language) ? body.language : 'text';
  const projectId = body.project_id ? Number(body.project_id) : null;
  if (projectId && !(await getRole(projectId, userId))) return { error: 'You’re not a member of that project.' };
  return { title, code, notes, language, tags: cleanTags(body.tags), projectId };
}

router.get('/tags', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t AS tag, COUNT(*)::int AS n FROM snippets, unnest(tags) t WHERE user_id = $1 GROUP BY t ORDER BY n DESC, t LIMIT 30`, [req.userId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    const { rows } = await query(
      `${SELECT} WHERE s.user_id = $1
         AND ($2 = '' OR s.title ILIKE $5 OR s.notes ILIKE $5 OR s.code ILIKE $5)
         AND ($3 = '' OR $3 = ANY(s.tags)) AND ($4 = '' OR s.language = $4)
       ORDER BY s.updated_at DESC LIMIT 200`,
      [req.userId, q, String(req.query.tag || ''), String(req.query.language || ''), like]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const v = await validate(req.body, req.userId);
    if (v.error) return res.status(400).json({ error: v.error });
    const { rows } = await query(
      `INSERT INTO snippets (user_id, project_id, title, language, code, notes, tags) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.userId, v.projectId, v.title, v.language, v.code, v.notes, v.tags]);
    res.status(201).json((await query(`${SELECT} WHERE s.id = $1`, [rows[0].id])).rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const v = await validate(req.body, req.userId);
    if (v.error) return res.status(400).json({ error: v.error });
    const r = await query(
      `UPDATE snippets SET project_id=$3, title=$4, language=$5, code=$6, notes=$7, tags=$8, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id`,
      [req.params.id, req.userId, v.projectId, v.title, v.language, v.code, v.notes, v.tags]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Snippet not found.' });
    res.json((await query(`${SELECT} WHERE s.id = $1`, [r.rows[0].id])).rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const r = await query('DELETE FROM snippets WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Snippet not found.' });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
