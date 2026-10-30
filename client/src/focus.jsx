import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const KEY = 'devflow-focus';
const FocusContext = createContext(null);
export const useFocus = () => useContext(FocusContext);

export const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.total && s.startedAt ? s : null; } catch { return null; } };
const elapsedOf = (s, at) => s.elapsedMs + (s.runningSince ? at - s.runningSince : 0);

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  } catch { /* sound is optional */ }
}

// The timer lives above the pages, so it keeps running while you move around the app. It survives a reload.
export function FocusProvider({ children }) {
  const [session, setSession] = useState(load);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState(null);
  const [logged, setLogged] = useState(0);

  useEffect(() => {
    try { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, [session]);

  const log = async (s, seconds, completed) => {
    if (s.mode !== 'focus' || seconds < 60) return; // very short sessions aren't recorded
    try {
      await api('/focus', { method: 'POST', body: { task_id: s.taskId, started_at: new Date(s.startedAt).toISOString(), seconds, completed } });
      setLogged((n) => n + 1);
    } catch { /* tracking is best-effort */ }
  };

  const finish = (s) => {
    beep();
    setSession(null);
    if (s.mode === 'focus') { log(s, s.total, true); setNotice({ kind: 'done', title: s.title, minutes: Math.round(s.total / 60) }); }
    else setNotice({ kind: 'break-done' });
  };

  useEffect(() => {
    if (!session?.runningSince) return;
    const check = () => {
      const t = Date.now();
      setNow(t);
      if (session.total * 1000 - elapsedOf(session, t) <= 0) finish(session);
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [session]);

  const stop = () => {
    if (!session) return;
    log(session, Math.floor(elapsedOf(session, Date.now()) / 1000), false);
    setSession(null);
  };

  const start = ({ taskId = null, projectId = null, title = '', minutes = 25, mode = 'focus' }) => {
    if (session) {
      if (!confirm(`A ${session.mode} timer is already running. Stop it (its time so far is saved) and start a new one?`)) return false;
      stop();
    }
    setNotice(null);
    setSession({ mode, taskId, projectId, title, total: minutes * 60, elapsedMs: 0, runningSince: Date.now(), startedAt: Date.now() });
    return true;
  };
  const pause = () => setSession((s) => (s && s.runningSince ? { ...s, elapsedMs: s.elapsedMs + (Date.now() - s.runningSince), runningSince: null } : s));
  const resume = () => setSession((s) => (s && !s.runningSince ? { ...s, runningSince: Date.now() } : s));

  const remainingMs = session ? session.total * 1000 - elapsedOf(session, now) : 0;
  return (
    <FocusContext.Provider value={{ session, remainingMs, start, pause, resume, stop, notice, dismissNotice: () => setNotice(null), logged }}>
      {children}
    </FocusContext.Provider>
  );
}
