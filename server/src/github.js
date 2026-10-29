export class GitHubError extends Error {
  constructor(status) { super(`GitHub responded ${status}`); this.ghStatus = status; }
}

export const githubConfigured = () => !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

export async function gh(token, path, options = {}) {
  let res;
  try {
    res = await fetch('https://api.github.com' + path, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'DevFlow',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new GitHubError(0); // network failure
  }
  if (!res.ok) throw new GitHubError(res.status);
  return res.json();
}

// Turns a GitHub failure into a message the user can act on. Never uses 401, which would sign them out of DevFlow.
export function sendGitHubError(res, e, next) {
  if (!(e instanceof GitHubError)) return next(e);
  const map = {
    401: [502, 'GitHub rejected the saved connection. Reconnect GitHub on the Integrations page.'],
    403: [403, 'GitHub refused the request. You may have hit the rate limit, or the app lacks access to that repository.'],
    404: [404, 'Repository not found, or your GitHub account can’t access it.'],
  };
  const [status, error] = map[e.ghStatus] || [502, 'GitHub didn’t respond properly. Try again in a moment.'];
  res.status(status).json({ error });
}
