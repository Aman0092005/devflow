import { Link } from 'react-router-dom';
import { fmtClock, useFocus } from './focus.jsx';

export default function FocusPill() {
  const { session, remainingMs, pause, resume, stop, start, notice, dismissNotice } = useFocus();
  if (!session && !notice) return null;

  if (!session) {
    return (
      <div className="focus-pill" role="status">
        {notice.kind === 'done'
          ? <p>Focus session complete: {notice.minutes} min{notice.title ? ` on “${notice.title}”` : ''}. Nice work.</p>
          : <p>Break over. Ready for the next one?</p>}
        <div className="row-between">
          {notice.kind === 'done' && <button className="btn ghost" onClick={() => start({ mode: 'break', minutes: 5, title: 'Break' })}>5-min break</button>}
          <button className="link" onClick={dismissNotice}>Dismiss</button>
        </div>
      </div>
    );
  }

  const paused = !session.runningSince;
  return (
    <div className="focus-pill" role="timer" aria-label={`${session.mode} timer`}>
      <span className="muted">{session.mode === 'focus' ? 'Focus' : 'Break'}{paused ? ' (paused)' : ''}</span>
      <span className="focus-time">{fmtClock(remainingMs)}</span>
      {session.taskId
        ? <Link to={`/projects/${session.projectId}`} state={{ openTask: session.taskId }} className="focus-task">{session.title}</Link>
        : <span className="focus-task">{session.title}</span>}
      <div className="row-between">
        <button className="btn ghost" onClick={paused ? resume : pause}>{paused ? 'Resume' : 'Pause'}</button>
        <button className="link" onClick={stop}>Stop</button>
      </div>
    </div>
  );
}
