import { apiBlob } from './api.js';

// Downloads need the login token, so they go through fetch and are saved from a blob.
export async function download(path, filename) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
