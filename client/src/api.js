import { getSocketId } from './socket.js';

const BASE = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getSocketId() ? { 'X-Socket-Id': getSocketId() } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) localStorage.removeItem('token');
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(getSocketId() ? { 'X-Socket-Id': getSocketId() } : {}),
  };
};

async function failWith(res) {
  if (res.status === 401) localStorage.removeItem('token');
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || 'Request failed.');
}

export async function apiUpload(path, formData) {
  const res = await fetch(BASE + path, { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) await failWith(res);
  return res.json();
}

export async function apiBlob(path) {
  const res = await fetch(BASE + path, { headers: authHeaders() });
  if (!res.ok) await failWith(res);
  return res.blob();
}
