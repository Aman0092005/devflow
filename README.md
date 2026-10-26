# DevFlow

Developer productivity and collaboration platform: projects, kanban boards, notes and a dashboard.

**Stack:** React (Vite) + CSS · Express · PostgreSQL · JWT auth

## Run it

```bash
# 1. Database
docker compose up -d            # or use your own Postgres and edit DATABASE_URL

# 2. API
cd server
cp .env.example .env            # set JWT_SECRET
npm install
npm run migrate
npm run dev                     # http://localhost:4000

# 3. Client (new terminal)
cd client
npm install
npm run dev                     # http://localhost:5173
```

## Phase 1 (included)
- Register / sign in (bcrypt + JWT)
- Dashboard: task counts, due soon, active projects, recent notes
- Projects: create, color, progress, delete
- Kanban board: add tasks, priority, due date, drag between columns and reorder (persisted)
- Notes: create, edit, link to a project, search

## API
| Method | Path |
|---|---|
| POST | /api/auth/register, /api/auth/login |
| GET | /api/auth/me, /api/dashboard |
| GET/POST | /api/projects |
| GET/PATCH/DELETE | /api/projects/:id |
| GET/POST | /api/projects/:id/tasks |
| PATCH/DELETE | /api/tasks/:id |
| POST | /api/tasks/:id/move `{status, index}` |
| GET/POST | /api/notes (`?q=` search) |
| GET/PATCH/DELETE | /api/notes/:id |

## Roadmap
**Phase 2:** `project_members` table + roles for teams; Socket.IO rooms per project for live board updates; `notifications` table + bell UI; Multer uploads to local disk, then S3/R2.
**Phase 3:** AI assistant (Claude API: summarize notes, break tasks down); GitHub OAuth + Octokit (link issues/PRs to tasks); analytics with Recharts; Postgres full-text search (`tsvector` + GIN) and filters.
**Also planned:** DSA tracker (problems, topic, difficulty, status, revision dates), tests (Vitest, Supertest), CI, Docker deploy.
