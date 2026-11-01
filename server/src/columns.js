import { query } from './db.js';

// Makes sure a project has its three default columns and that every task sits in one.
export async function ensureColumns(projectId) {
  await query(
    `INSERT INTO project_columns (project_id, name, stage, position)
     SELECT $1::int, d.name, d.stage, d.pos FROM (VALUES ('To do','todo',0), ('In progress','in_progress',1), ('Done','done',2)) AS d(name, stage, pos)
     WHERE NOT EXISTS (SELECT 1 FROM project_columns WHERE project_id = $1::int)`, [projectId]);
  await query(
    `UPDATE tasks t SET column_id = (SELECT c.id FROM project_columns c WHERE c.project_id = t.project_id AND c.stage = t.status ORDER BY c.position LIMIT 1)
     WHERE t.project_id = $1 AND t.column_id IS NULL`, [projectId]);
}
