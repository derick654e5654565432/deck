import crypto from 'node:crypto';

// Password hashing shared by the server (login/signup) and the DB seed.
// Format matches scripts/hash-password.mjs: "scrypt:<saltHex>:<hashHex>" (32-byte hash).
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = String(stored).split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  let actual;
  try { actual = crypto.scryptSync(String(password), salt, expected.length); }
  catch { return false; }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
