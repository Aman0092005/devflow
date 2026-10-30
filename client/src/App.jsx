import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import SearchPalette from './SearchPalette.jsx';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Board from './pages/Board.jsx';
import Notes from './pages/Notes.jsx';
import Dsa from './pages/Dsa.jsx';
import Analytics from './pages/Analytics.jsx';
import Integrations from './pages/Integrations.jsx';
import Invite from './pages/Invite.jsx';
import Settings from './pages/Settings.jsx';
import NotificationBell from './NotificationBell.jsx';

function Shell() {
  const { user, loading, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  // Tell the server your timezone so due-date reminders arrive on your calendar day.
  useEffect(() => {
    if (user) api('/auth/timezone', { method: 'PUT', body: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone } }).catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((o) => !o); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (loading) return <p className="center-note">Loading your workspace…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand">DevFlow</div><NotificationBell /></div>
        <button className="search-btn" onClick={() => setSearchOpen(true)}>Search <kbd>Ctrl K</kbd></button>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/notes">Notes</NavLink>
          <NavLink to="/dsa">DSA tracker</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/integrations">Integrations</NavLink>
        </nav>
        <div className="sidebar-foot">
          <Link to="/settings" className="settings-link" title="Settings">{user.name} · Settings</Link>
          <button className="link" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<Board />} />
        <Route path="notes" element={<Notes />} />
        <Route path="dsa" element={<Dsa />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
