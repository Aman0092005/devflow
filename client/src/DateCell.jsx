import { useEffect, useRef, useState } from 'react';
import { isValidDate } from './dates.js';

// A date input that keeps your typing to itself and only saves a complete, valid date.
// (Saving on every keystroke made the box reset while you were still typing.)
export default function DateCell({ value, due, label, onCommit }) {
  const saved = value ? value.slice(0, 10) : '';
  const [val, setVal] = useState(saved);
  const [bad, setBad] = useState(false);
  const timer = useRef(null);

  useEffect(() => { setVal(saved); setBad(false); }, [saved]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (v, final) => {
    clearTimeout(timer.current);
    if (!v) { if (final) setVal(saved); return; } // an empty box never overwrites the saved date; use ✕ to clear
    if (v === saved) { setBad(false); return; }
    if (!isValidDate(v)) { if (final) setBad(true); return; }
    setBad(false);
    onCommit(v);
  };

  const change = (e) => {
    const v = e.target.value;
    setVal(v);
    setBad(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v, false), 800);
  };

  return (
    <div className="date-cell">
      <input type="date" min="2000-01-01" max="2100-12-31" className={due ? 'due' : ''} value={val}
        onChange={change} onBlur={() => commit(val, true)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(val, true); } }}
        aria-label={label} aria-invalid={bad} />
      {saved && <button className="link" onClick={() => onCommit(null)} aria-label="Clear date" title="Clear date">✕</button>}
      {bad && <span className="error date-err" role="alert">Use a year between 2000 and 2100</span>}
    </div>
  );
}
