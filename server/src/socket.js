import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getRole } from './access.js';

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

// Send to everyone viewing the project except the browser tab that made the change.
export function emitToProject(projectId, event, payload, exceptSocketId) {
  if (!io) return;
  let target = io.to(room(projectId));
  if (exceptSocketId) target = target.except(exceptSocketId);
  target.emit(event, payload);
}

export function removeUserFromProject(projectId, userId) {
  io?.in(`user:${userId}`).socketsLeave(room(projectId));
}
