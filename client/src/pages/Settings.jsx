import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { getTheme, setTheme } from '../theme.js';

const THEMES = [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match my device']];

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [profileMsg, setProfileMsg] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState(null);
  const [theme, setThemeState] = useState(getTheme());
  const [reminders, setReminders] = useState(user.reminders !== false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const d = await api('/auth/profile', { method: 'PUT', body: { name } });
      updateUser({ name: d.user.name });
      setProfileMsg({ ok: true, text: 'Name updated.' });
    } catch (err) { setProfileMsg({ ok: false, text: err.message }); }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next.length < 8) return setPwMsg({ ok: false, text: 'The new password must be at least 8 characters.' });
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: 'The new passwords don’t match.' });
    try {
      await api('/auth/password', { method: 'PUT', body: { current: pw.current, next: pw.next } });
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ ok: true, text: 'Password changed.' });
    } catch (err) { setPwMsg({ ok: false, text: err.message }); }
  };

  const pickTheme = (t) => { setTheme(t); setThemeState(t); };
  const toggleReminders = () => {
    const next = !reminders;
    setReminders(next);
    api('/auth/reminders', { method: 'PUT', body: { enabled: next } }).catch(() => setReminders(!next));
  };

  return (
    <>
      <h1>Settings</h1>
      <p className="muted lead">Signed in as {user.email}</p>

      <div className="settings">
        <section className="panel">
          <h2>Profile</h2>
          <form onSubmit={saveProfile} className="stack">
            <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
            <div className="row-between"><span>{profileMsg && <span role="status" className={profileMsg.ok ? 'ok' : 'error'}>{profileMsg.text}</span>}</span>
              <button className="btn" disabled={!name.trim() || name.trim() === user.name}>Save name</button></div>
          </form>
        </section>

        <section className="panel">
          <h2>Appearance</h2>
          <div className="seg" role="group" aria-label="Theme">
            {THEMES.map(([v, l]) => <button key={v} type="button" aria-pressed={theme === v} className={theme === v ? 'on' : ''} onClick={() => pickTheme(v)}>{l}</button>)}
          </div>
          <p className="muted">Saved on this device only.</p>
        </section>

        <section className="panel">
          <h2>Notifications</h2>
          <label className="check"><input type="checkbox" checked={reminders} onChange={toggleReminders} /> Due-date reminders</label>
          <p className="muted">Get a notification when a task is due tomorrow, due today, or overdue.</p>
        </section>

        <section className="panel">
          <h2>Password</h2>
          <form onSubmit={savePassword} className="stack">
            <label className="field">Current password<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></label>
            <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></label>
            <label className="field">Confirm new password<input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></label>
            <div className="row-between"><span>{pwMsg && <span role="status" className={pwMsg.ok ? 'ok' : 'error'}>{pwMsg.text}</span>}</span>
              <button className="btn">Change password</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
