import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { disconnectSocket } from './socket.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('token'));

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const authenticate = async (mode, form) => {
    const data = await api(`/auth/${mode}`, { method: 'POST', body: form });
    localStorage.setItem('token', data.token);
    setUser(data.user);
  };
  const updateUser = (patch) => setUser((u) => ({ ...u, ...patch }));
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('devflow-focus');
    disconnectSocket();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authenticate, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
