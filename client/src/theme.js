// Theme is stored per device. 'dark' is the default; 'system' follows the operating system.
const mq = window.matchMedia('(prefers-color-scheme: light)');

export const getTheme = () => { try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; } };
const resolve = (pref) => (pref === 'system' ? (mq.matches ? 'light' : 'dark') : pref);

export function applyTheme() { document.documentElement.dataset.theme = resolve(getTheme()); }
export function setTheme(pref) {
  try { localStorage.setItem('theme', pref); } catch { /* private mode: the choice just won't persist */ }
  applyTheme();
}
mq.addEventListener('change', () => { if (getTheme() === 'system') applyTheme(); });
