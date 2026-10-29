import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { getSocket } from './socket.js';

const ago = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [reminders, setReminders] = useState(true);
  const box = useRef(null);

  useEffect(() => {
    api('/notifications').then((d) => { setItems(d.items); setUnread(d.unread); setReminders(d.reminders); }).catch(() => {});
  }, []);

  useEffect(() => {
    const s = getSocket();
    const onNew = (n) => { setItems((p) => [n, ...p]); setUnread((u) => u + 1); setToast(n); };
    s.on('notification', onNew);
    return () => s.off('notification', onNew);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => { document.title = unread ? `(${unread}) DevFlow` : 'DevFlow'; }, [unread]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const openItem = (n) => {
    setOpen(false);
    setToast(null);
    if (!n.is_read) {
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    }
    if (n.project_id) navigate(`/projects/${n.project_id}`, n.task_id ? { state: { openTask: n.task_id } } : undefined);
  };

  const toggleReminders = () => {
    const next = !reminders;
    setReminders(next);
    api('/auth/reminders', { method: 'PUT', body: { enabled: next } }).catch(() => setReminders(!next));
  };

  const markAll = () => {
    setItems((p) => p.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
    api('/notifications/read-all', { method: 'POST' }).catch(() => {});
  };

  return (
    <>
      <div className="bell-wrap" ref={box}>
        <button className="bell" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
        </button>

        {open && (
          <div className="notif-panel" role="dialog" aria-label="Notifications">
            <div className="row-between notif-head">
              <h2>Notifications</h2>
              <button className="link" onClick={markAll} disabled={unread === 0}>Mark all read</button>
            </div>
            {items.length === 0 ? (
              <p className="muted notif-empty">You're all caught up. Assignments and invites will show up here.</p>
            ) : (
              <ul className="notif-list">
                {items.map((n) => (
                  <li key={n.id}>
                    <button className={`notif ${n.is_read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                      <span className="notif-dot" aria-hidden="true" />
                      <span className="grow">
                        <span className="notif-msg">{n.message}</span>
                        <span className="muted">{n.project_name ? `${n.project_name} · ` : ''}{ago(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="notif-foot">
              <label><input type="checkbox" checked={reminders} onChange={toggleReminders} /> Due-date reminders</label>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <button className="toast" role="status" onClick={() => openItem(toast)}>
          <b>{toast.message}</b>
          {toast.project_name && <span className="muted">{toast.project_name}</span>}
        </button>
      )}
    </>
  );
}
