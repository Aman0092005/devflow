import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getRole } from './access.js';
import { query } from './db.js';

let io;
const room = (projectId) => `project:${projectId}`;

async function broadcastPresence(r) {
  const sockets = await io.in(r).fetchSockets();
  io.to(r).emit('presence', [...new Set(sockets.map((s) => s.data.userId))]);
}

export function initSocket(server) {
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' },
  });

  io.use((socket, next) => {
    try {
      socket.data.userId = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET).id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);

    socket.on('project:join', async (projectId, ack) => {
      try {
        if (!Number.isInteger(projectId) || !(await getRole(projectId, socket.data.userId)))
          return ack?.({ ok: false });
        await socket.join(room(projectId));
        await broadcastPresence(room(projectId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on('project:leave', async (projectId) => {
      await socket.leave(room(projectId));
      broadcastPresence(room(projectId));
    });

    socket.on('disconnecting', () => {
      for (const r of socket.rooms) if (r.startsWith('project:')) setImmediate(() => broadcastPresence(r));
    });
  });
}

// Pages that aren't a project board (dashboard, project list, analytics) need to know when a project
// changes. Every member has a personal room, so a short-delayed "project:changed" goes to all of them.
const REFRESH_EVENTS = new Set(['task:created', 'task:updated', 'task:deleted', 'tasks:reordered', 'member:added', 'member:removed']);
const pending = new Map();
function scheduleMembersRefresh(projectId) {
  if (pending.has(projectId)) return; // bursts of changes become one refresh
  pending.set(projectId, setTimeout(async () => {
    pending.delete(projectId);
    try {
      const { rows } = await query('SELECT user_id FROM project_members WHERE project_id=$1', [projectId]);
      for (const r of rows) io.to(`user:${r.user_id}`).emit('project:changed', { projectId: Number(projectId) });
    } catch { /* a missed refresh is harmless */ }
  }, 300));
}

export function notifyProjectChanged(userIds, projectId) {
  for (const id of userIds) io?.to(`user:${id}`).emit('project:changed', { projectId: Number(projectId) });
}

// Send to everyone viewing the project except the browser tab that made the change.
export function emitToProject(projectId, event, payload, exceptSocketId) {
  if (!io) return;
  let target = io.to(room(projectId));
  if (exceptSocketId) target = target.except(exceptSocketId);
  target.emit(event, payload);
  if (REFRESH_EVENTS.has(event)) scheduleMembersRefresh(projectId);
}

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function removeUserFromProject(projectId, userId) {
  io?.in(`user:${userId}`).socketsLeave(room(projectId));
  notifyProjectChanged([userId], projectId); // their dashboard and project list drop it
}
