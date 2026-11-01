import { useState } from 'react';
import { download } from './download.js';

export default function ExportPanel({ projectId, name }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

  const go = async (format) => {
    setBusy(format); setError('');
    try { await download(`/export/project/${projectId}?format=${format}`, `devflow-${slug}-${format === 'csv' ? 'tasks.csv' : 'full.json'}`); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  return (
    <section className="panel export-panel" aria-label="Export">
      <h2>Export</h2>
      <p className="muted">Download this project’s tasks. <b>CSV</b> opens in Excel or Google Sheets. <b>JSON</b> is a full copy with columns, labels, checklists and comments.</p>
      <div className="snippet-actions">
        <button className="btn ghost" onClick={() => go('csv')} disabled={!!busy}>{busy === 'csv' ? 'Preparing…' : 'Download CSV'}</button>
        <button className="btn ghost" onClick={() => go('json')} disabled={!!busy}>{busy === 'json' ? 'Preparing…' : 'Download JSON'}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
