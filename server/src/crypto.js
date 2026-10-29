import crypto from 'node:crypto';

// AES-256-GCM for GitHub tokens at rest. The key is derived from TOKEN_ENCRYPTION_KEY (falls back to JWT_SECRET).
const key = () => crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET).digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
