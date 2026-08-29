import crypto from 'node:crypto';

// Symmetric encryption for vault secrets, so passwords are never stored as
// plaintext in the DB. This is NOT zero-knowledge: the server can decrypt (it
// must, so an authorised user can just log in and read the secret — no master
// password, per the product decision). A DB leak alone does not expose secrets;
// an attacker also needs the key from the server's .env.
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret';

function loadKey() {
  const k = process.env.VAULT_KEY;
  if (k && /^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, 'hex');
  // Fallback: derive a stable 32-byte key from SESSION_SECRET so the vault works
  // with zero extra config. Set VAULT_KEY (64 hex chars) in .env to decouple it
  // from the session secret (recommended in production).
  return crypto.scryptSync(SESSION_SECRET, 'deck-vault-v1', 32);
}
const KEY = loadKey();

export function encryptSecret(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

export function decryptSecret(blob) {
  if (!blob) return '';
  const [v, ivHex, tagHex, ctHex] = String(blob).split(':');
  if (v !== 'v1' || !ivHex || !tagHex || !ctHex) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
  } catch { return ''; }
}
