import { useEffect, useRef } from 'react';
import { getSocket } from './socket.js';

// Re-runs `refresh` shortly after any of your projects change (tasks, members), and after a reconnect.
export function useLiveRefresh(refresh) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    const s = getSocket();
    let timer;
    const onChange = () => { clearTimeout(timer); timer = setTimeout(() => latest.current(), 400); };
    s.on('project:changed', onChange);
    s.on('connect', onChange);
    return () => { clearTimeout(timer); s.off('project:changed', onChange); s.off('connect', onChange); };
  }, []);
}
