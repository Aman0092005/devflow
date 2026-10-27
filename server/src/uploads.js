import fs from 'node:fs';
import path from 'node:path';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const removeFiles = (names) =>
  Promise.all(names.map((n) => fs.promises.unlink(path.join(UPLOAD_DIR, n)).catch(() => {})));
