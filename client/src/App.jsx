import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import Board from './pages/Board.jsx';
import Notes from './pages/Notes.jsx';
import Dsa from './pages/Dsa.jsx';
import NotificationBell from './NotificationBell.jsx';

function Shell() {
  const { user, loading, logout } = useAuth();
  if (loading) return <p className="center-note">Loading your workspace…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand">DevFlow</div><NotificationBell /></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/notes">Notes</NavLink>
          <NavLink to="/dsa">DSA tracker</NavLink>
        </nav>
        <div className="sidebar-foot">
          <span>{user.name}</span>
          <button className="link" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<Board />} />
        <Route path="notes" element={<Notes />} />
        <Route path="dsa" element={<Dsa />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
