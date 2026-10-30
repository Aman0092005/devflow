import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { query } from '../db.js';
import { UPLOAD_DIR, removeFiles } from '../uploads.js';
import { emitToProject } from '../socket.js';
import { logActivity } from '../activityLog.js';

const router = Router();
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (_req, _file, cb) => cb(null, crypto.randomUUID()) }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const COLS = 'a.id, a.task_id, a.original_name, a.mime, a.size, a.created_at, a.uploader_id, u.name AS uploader_name';

const loadTask = async (taskId, userId) =>
  (await query(
    `SELECT t.* FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2
     WHERE t.id = $1`, [taskId, userId])).rows[0];

const countFor = async (taskId) =>
  (await query('SELECT COUNT(*)::int AS c FROM task_attachments WHERE task_id=$1', [taskId])).rows[0].c;

// Attachment plus the caller's role, only if the caller belongs to the project.
const loadAttachment = async (id, userId) =>
  (await query(
    `SELECT a.*, t.project_id, pm.role FROM task_attachments a
     JOIN tasks t ON t.id = a.task_id
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2
     WHERE a.id = $1`, [id, userId])).rows[0];

router.get('/tasks/:id/attachments', async (req, res, next) => {
  try {
    if (!(await loadTask(req.params.id, req.userId))) return res.status(404).json({ error: 'Task not found.' });
    const { rows } = await query(
      `SELECT ${COLS} FROM task_attachments a LEFT JOIN users u ON u.id = a.uploader_id
       WHERE a.task_id = $1 ORDER BY a.created_at`, [req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post(
  '/tasks/:id/attachments',
  // Check access before accepting the file so non-members can't fill the disk.
  async (req, res, next) => {
    try {
      req.task = await loadTask(req.params.id, req.userId);
      if (!req.task) return res.status(404).json({ error: 'Task not found.' });
      next();
    } catch (e) { next(e); }
  },
  (req, res, next) => upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'That file is over the 10 MB limit.' : 'Upload failed. Try again.' });
  }),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
      const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const { rows } = await query(
        `WITH a AS (
           INSERT INTO task_attachments (task_id, uploader_id, original_name, stored_name, mime, size)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
         ) SELECT ${COLS} FROM a LEFT JOIN users u ON u.id = a.uploader_id`,
        [req.task.id, req.userId, name, req.file.filename, req.file.mimetype, req.file.size]
      );
      emitToProject(req.task.project_id, 'attachments:changed',
        { taskId: req.task.id, count: await countFor(req.task.id) }, req.get('x-socket-id'));
      logActivity({ projectId: req.task.project_id, userId: req.userId, kind: 'attachment_added', taskId: req.task.id, meta: { title: req.task.title, file: name } });
      res.status(201).json(rows[0]);
    } catch (e) {
      if (req.file) removeFiles([req.file.filename]);
      next(e);
    }
  }
);

router.get('/attachments/:id/download', async (req, res, next) => {
  try {
    const a = await loadAttachment(req.params.id, req.userId);
    if (!a) return res.status(404).json({ error: 'File not found.' });
    res.download(path.join(UPLOAD_DIR, a.stored_name), a.original_name, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File is missing from storage.' });
    });
  } catch (e) { next(e); }
});

router.delete('/attachments/:id', async (req, res, next) => {
  try {
    const a = await loadAttachment(req.params.id, req.userId);
    if (!a) return res.status(404).json({ error: 'File not found.' });
    if (a.uploader_id !== req.userId && a.role !== 'owner')
      return res.status(403).json({ error: 'Only the uploader or the project owner can delete this file.' });
    await query('DELETE FROM task_attachments WHERE id=$1', [a.id]);
    await removeFiles([a.stored_name]);
    emitToProject(a.project_id, 'attachments:changed',
      { taskId: a.task_id, count: await countFor(a.task_id) }, req.get('x-socket-id'));
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
