import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const IDEAS = ['What is overdue?', 'What should I focus on today?', 'Summarize this project’s progress', 'Who has the most open tasks?'];

export default function AssistantPanel({ projectId }) {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);

  useEffect(() => { api('/ai/status').then(setStatus).catch(() => setStatus({ configured: false })); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);

  const send = async (q) => {
    const message = (q ?? text).trim();
    if (!message || busy) return;
    setError('');
    const history = messages.slice(-10);
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setText('');
    setBusy(true);
    try {
      const d = await api(`/projects/${projectId}/ai/chat`, { method: 'POST', body: { message, history } });
      setMessages((m) => [...m, { role: 'assistant', content: d.reply }]);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="panel ai-panel" aria-label="Project assistant">
      <div className="row-between">
        <h2>Assistant</h2>
        {messages.length > 0 && <button className="link" onClick={() => { setMessages([]); setError(''); }}>Clear chat</button>}
      </div>

      {status && !status.configured ? (
        <p className="muted">The assistant isn’t set up on this server yet. Add <code>GEMINI_API_KEY</code> to <code>server/.env</code> and restart the API.</p>
      ) : (
        <>
          <div className="chat" role="log" aria-live="polite">
            {messages.length === 0 && (
              <div>
                <p className="muted">Ask about this project’s tasks. I can read them but I can’t change anything.</p>
                <div className="chips">{IDEAS.map((i) => <button key={i} className="chip" onClick={() => send(i)}>{i}</button>)}</div>
              </div>
            )}
            {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
            {busy && <div className="msg assistant muted">Thinking…</div>}
            <div ref={end} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <form className="invite" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Ask about this project…" aria-label="Question" />
            <button className="btn" disabled={busy || !text.trim()}>Ask</button>
          </form>
          <p className="muted ai-note">AI answers can be wrong. Check anything important.</p>
        </>
      )}
    </section>
  );
}
