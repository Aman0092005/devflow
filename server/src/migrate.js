import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
await pool.query(sql);
console.log('Database schema is up to date.');
await pool.end();
