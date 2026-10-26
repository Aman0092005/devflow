import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
      auth: (cb) => cb({ token: localStorage.getItem('token') }),
    });
  }
  return socket;
}

// Sent with API calls so the server doesn't echo a change back to the tab that made it.
export const getSocketId = () => socket?.id || null;

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
