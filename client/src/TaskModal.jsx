import { useEffect, useRef, useState } from 'react';
import { api, apiBlob, apiUpload } from './api.js';
import { getSocket } from './socket.js';
import { SubtaskSuggester } from './AiTools.jsx';
import Comments from './Comments.jsx';
import LabelPicker from './LabelPicker.jsx';
import Checklist from './Checklist.jsx';
import { isValidDate } from './dates.js';

const MAX = 10 * 1024 * 1024;
const fmtSize = (b) => (b < 1024 ? `${b} B` : b < MAX / 10 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export default function TaskModal({ task, onClose, onSaved, onCount, onCreated, onComments, isOwner, labels = [], onLabelsList, onTaskLabels, onChecklistCounts }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [due, setDue] = useState(task.due_date ? task.due_date.slice(0, 10) : '');
  const [clVersion, setClVersion] = useState(0);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);

  const loadFiles = () =>
    api(`/tasks/${task.id}/attachments`)
      .then((list) => { setFiles(list); onCount(task.id, list.length); })
      .catch((e) => setError(e.message));

  useEffect(() => { loadFiles(); }, [task.id]);

  useEffect(() => {
    const s = getSocket();
    const onChange = ({ taskId }) => { if (taskId === task.id) loadFiles(); };
    s.on('attachments:changed', onChange);
    return () => s.off('attachments:changed', onChange);
  }, [task.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const uploadFiles = async (list) => {
    setError('');
    setUploading(true);
    for (const file of list) {
      if (file.size > MAX) { setError(`${file.name} is over the 10 MB limit.`); continue; }
      try {
        const fd = new FormData();
        fd.append('file', file);
        await apiUpload(`/tasks/${task.id}/attachments`, fd);
      } catch (err) { setError(err.message); }
    }
    await loadFiles();
    setUploading(false);
  };

  const download = async (f) => {
    try {
      const url = URL.createObjectURL(await apiBlob(`/attachments/${f.id}/download`));
      const a = document.createElement('a');
      a.href = url; a.download = f.original_name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  };

  const remove = async (f) => {
    if (!confirm(`Delete ${f.original_name}?`)) return;
    try { await api(`/attachments/${f.id}`, { method: 'DELETE' }); loadFiles(); } catch (err) { setError(err.message); }
  };

  const save = async () => {
    if (!title.trim()) return setError('The title can’t be empty.');
    if (due && !isValidDate(due)) return setError('The due date must be a real date between 2000 and 2100.');
    setSaving(true);
    try {
      const t = await api(`/tasks/${task.id}`, { method: 'PATCH', body: { title: title.trim(), description, due_date: due || null } });
      onSaved(t);
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task details">
        <div className="row-between">
          <h2>Task details</h2>
          <button className="link" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label className="field">Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="field">Description
          <textarea className="short" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add details, links or acceptance criteria…" />
        </label>

        <label className="field">Due date
          <input type="date" min="2000-01-01" max="2100-12-31" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>

        <LabelPicker task={task} labels={labels} isOwner={isOwner} onLabelsList={onLabelsList} onTaskLabels={onTaskLabels} />

        <Checklist task={task} refresh={clVersion} onCounts={onChecklistCounts} />

        <SubtaskSuggester task={task} onCreated={onCreated} onChecklist={() => setClVersion((v) => v + 1)} />

        <h3>Attachments</h3>
        <div className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); uploadFiles([...e.dataTransfer.files]); }}>
          <p>Drop files here or <button type="button" className="link underline" onClick={() => input.current.click()}>browse</button></p>
          <span className="muted">Up to 10 MB each</span>
          <input ref={input} type="file" multiple hidden onChange={(e) => { uploadFiles([...e.target.files]); e.target.value = ''; }} />
        </div>
        {uploading && <p className="muted" role="status">Uploading…</p>}
        {!uploading && files.length === 0 && <p className="muted">No files attached yet.</p>}
        <ul className="files">
          {files.map((f) => (
            <li key={f.id}>
              <div className="grow">
                <button className="link file-name" onClick={() => download(f)}>{f.original_name}</button>
                <div className="muted">{fmtSize(f.size)} · {f.uploader_name || 'Former member'}</div>
              </div>
              <button className="link" onClick={() => remove(f)} aria-label={`Delete ${f.original_name}`}>Delete</button>
            </li>
          ))}
        </ul>

        <Comments task={task} isOwner={isOwner} onCount={onComments} />

        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-foot">
          <button className="link" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={saving}>Save</button>
        </div>
      </div>
    </div>
  );
}
