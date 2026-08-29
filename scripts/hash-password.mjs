#!/usr/bin/env node
// Generate a scrypt password hash for DECK_PASSWORD_HASH.
// Usage: node scripts/hash-password.mjs 'your-password'
import crypto from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs 'your-password'");
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 32);
console.log(`scrypt:${salt.toString('hex')}:${hash.toString('hex')}`);
