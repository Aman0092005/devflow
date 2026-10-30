import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { getRole } from '../access.js';
import { emitToProject } from '../socket.js';
import { encrypt, decrypt } from '../crypto.js';
import { gh, githubConfigured, sendGitHubError } from '../github.js';
import { logActivity } from '../activityLog.js';

export const githubAccount = Router(); // mounted at /api/github
export const githubProject = Router(); // mounted at /api

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const cache = new Map();
const TTL = 60_000;

const tokenFor = async (userId) => {
  const { rows } = await query('SELECT token_enc FROM github_accounts WHERE user_id=$1', [userId]);
  if (!rows[0]) return null;
  try { return decrypt(rows[0].token_enc); } catch { return null; } // key changed: user must reconnect
};

/* ---------- OAuth callback (public: GitHub redirects the browser here) ---------- */
export async function githubCallback(req, res) {
  const back = (result) => res.redirect(`${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/integrations?github=${result}`);
  try {
    if (req.query.error) return back('denied');
    const { uid, p } = jwt.verify(String(req.query.state || ''), process.env.JWT_SECRET);
    if (p !== 'github') return back('error');

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: req.query.code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
      }),
    });
    const t = await tokenRes.json();
    if (!t.access_token) return back('error');

    const me = await gh(t.access_token, '/user');
    await query(
      `INSERT INTO github_accounts (user_id, github_id, login, avatar_url, token_enc) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET github_id=EXCLUDED.github_id, login=EXCLUDED.login,
         avatar_url=EXCLUDED.avatar_url, token_enc=EXCLUDED.token_enc`,
      [uid, me.id, me.login, me.avatar_url, encrypt(t.access_token)]
    );
    back('connected');
  } catch (e) {
    console.error('GitHub callback failed:', e.message);
    back('error');
  }
}

/* ---------- Account ---------- */
githubAccount.get('/status', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT login, avatar_url FROM github_accounts WHERE user_id=$1', [req.userId]);
    res.json({ configured: githubConfigured(), connected: !!rows[0], login: rows[0]?.login || null, avatar_url: rows[0]?.avatar_url || null });
  } catch (e) { next(e); }
});

githubAccount.get('/connect', (req, res) => {
  if (!githubConfigured()) return res.status(503).json({ error: 'GitHub isn’t set up on this server yet.' });
  const state = jwt.sign({ uid: req.userId, p: 'github' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, scope: 'repo read:user', state });
  if (process.env.GITHUB_CALLBACK_URL) params.set('redirect_uri', process.env.GITHUB_CALLBACK_URL);
  res.json({ url: `https://github.com/login/oauth/authorize?${params}` });
});

githubAccount.delete('/', async (req, res, next) => {
  try {
    await query('DELETE FROM project_repos WHERE linked_by=$1', [req.userId]);
    await query('DELETE FROM github_accounts WHERE user_id=$1', [req.userId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

githubAccount.get('/repos', async (req, res, next) => {
  try {
    const token = await tokenFor(req.userId);
    if (!token) return res.status(400).json({ error: 'Connect your GitHub account first.' });
    const repos = await gh(token, '/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member');
    res.json(repos.map((r) => ({ full_name: r.full_name, private: r.private, description: r.description })));
  } catch (e) { sendGitHubError(res, e, next); }
});

/* ---------- Project <-> repo ---------- */
githubProject.get('/projects/:projectId/github', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if (!(await getRole(projectId, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    const [link, mine] = await Promise.all([
      query(`SELECT pr.repo, u.name AS linked_by_name FROM project_repos pr JOIN users u ON u.id = pr.linked_by WHERE pr.project_id=$1`, [projectId]),
      query('SELECT 1 FROM github_accounts WHERE user_id=$1', [req.userId]),
    ]);
    res.json({ configured: githubConfigured(), myConnected: mine.rowCount > 0, repo: link.rows[0]?.repo || null, linked_by_name: link.rows[0]?.linked_by_name || null });
  } catch (e) { next(e); }
});

githubProject.put('/projects/:projectId/github', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if ((await getRole(projectId, req.userId)) !== 'owner') return res.status(403).json({ error: 'Only the project owner can link a repository.' });
    const repo = String(req.body.repo || '').trim();
    if (!REPO_RE.test(repo)) return res.status(400).json({ error: 'Enter the repository as owner/name, for example vercel/next.js.' });
    const token = await tokenFor(req.userId);
    if (!token) return res.status(400).json({ error: 'Connect your GitHub account first.' });
    const found = await gh(token, `/repos/${repo}`); // proves the repo exists and you can read it
    await query(
      `INSERT INTO project_repos (project_id, repo, linked_by) VALUES ($1,$2,$3)
       ON CONFLICT (project_id) DO UPDATE SET repo=EXCLUDED.repo, linked_by=EXCLUDED.linked_by`,
      [projectId, found.full_name, req.userId]
    );
    cache.clear();
    res.json({ repo: found.full_name });
  } catch (e) { sendGitHubError(res, e, next); }
});

githubProject.delete('/projects/:projectId/github', async (req, res, next) => {
  try {
    if ((await getRole(req.params.projectId, req.userId)) !== 'owner') return res.status(403).json({ error: 'Only the project owner can unlink the repository.' });
    await query('DELETE FROM project_repos WHERE project_id=$1', [req.params.projectId]);
    cache.clear();
    res.status(204).end();
  } catch (e) { next(e); }
});

// Uses the token of whoever linked the repo, so every member can see its activity.
const linkedRepo = async (projectId) => {
  const { rows } = await query('SELECT repo, linked_by FROM project_repos WHERE project_id=$1', [projectId]);
  if (!rows[0]) return null;
  return { repo: rows[0].repo, token: await tokenFor(rows[0].linked_by) };
};

githubProject.get('/projects/:projectId/github/activity', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if (!(await getRole(projectId, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    const kind = req.query.kind;
    if (!['issues', 'pulls', 'commits'].includes(kind)) return res.status(400).json({ error: 'Unknown activity type.' });
    const link = await linkedRepo(projectId);
    if (!link) return res.status(404).json({ error: 'No repository is linked to this project.' });
    if (!link.token) return res.status(502).json({ error: 'The GitHub connection for this repository is gone. The owner needs to reconnect and link it again.' });

    const key = `${projectId}:${kind}`;
    let raw = cache.get(key);
    if (!raw || req.query.fresh || Date.now() - raw.at > TTL) {
      const path = { issues: 'issues?state=open&per_page=30', pulls: 'pulls?state=open&per_page=30', commits: 'commits?per_page=15' }[kind];
      raw = { at: Date.now(), data: await gh(link.token, `/repos/${link.repo}/${path}`) };
      cache.set(key, raw);
    }

    if (kind === 'commits') {
      return res.json(raw.data.map((c) => ({
        id: c.sha, ref: c.sha.slice(0, 7), title: c.commit.message.split('\n')[0], url: c.html_url,
        author: c.commit.author?.name || c.author?.login || 'Unknown', date: c.commit.author?.date,
      })));
    }
    if (kind === 'pulls') {
      return res.json(raw.data.map((p) => ({
        id: p.number, ref: `#${p.number}`, title: p.title, url: p.html_url, author: p.user?.login,
        date: p.created_at, draft: p.draft, branch: p.head?.ref,
      })));
    }
    const imported = new Set((await query('SELECT github_ref FROM tasks WHERE project_id=$1 AND github_ref IS NOT NULL', [projectId])).rows.map((r) => r.github_ref));
    res.json(raw.data.filter((i) => !i.pull_request).map((i) => ({
      id: i.number, number: i.number, ref: `#${i.number}`, title: i.title, url: i.html_url, author: i.user?.login,
      date: i.created_at, comments: i.comments, labels: i.labels.map((l) => l.name), imported: imported.has(`#${i.number}`),
    })));
  } catch (e) { sendGitHubError(res, e, next); }
});

githubProject.post('/projects/:projectId/github/import', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if (!(await getRole(projectId, req.userId))) return res.status(404).json({ error: 'Project not found.' });
    const number = Number(req.body.number);
    if (!Number.isInteger(number) || number < 1) return res.status(400).json({ error: 'Invalid issue number.' });
    const link = await linkedRepo(projectId);
    if (!link?.token) return res.status(404).json({ error: 'No usable repository link for this project.' });

    const issue = await gh(link.token, `/repos/${link.repo}/issues/${number}`);
    if (issue.pull_request) return res.status(400).json({ error: 'That is a pull request, not an issue.' });
    const description = `${(issue.body || '').slice(0, 2000)}\n\nImported from GitHub: ${issue.html_url}`.trim();
    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, description, github_url, github_ref, position)
       VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(position)+1,0) FROM tasks WHERE project_id=$1 AND status='todo'))
       ON CONFLICT DO NOTHING RETURNING *`,
      [projectId, issue.title, description, issue.html_url, `#${number}`]
    );
    if (!rows[0]) return res.status(409).json({ error: 'That issue is already on the board.' });
    const task = { ...rows[0], attachment_count: 0 };
    emitToProject(projectId, 'task:created', { task }, req.get('x-socket-id'));
    logActivity({ projectId: Number(projectId), userId: req.userId, kind: 'task_imported', taskId: task.id, meta: { title: task.title, ref: task.github_ref } });
    res.status(201).json(task);
  } catch (e) { sendGitHubError(res, e, next); }
});
