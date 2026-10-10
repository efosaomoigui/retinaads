import path from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { atomicJson, privateDirectory, readPrivateJson } from './storage.mjs';
import { authDirectory } from './paths.mjs';

const derive = promisify(scrypt);
const params = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 256) throw new Error('Use a password of 14–256 characters');
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, params);
  return `scrypt$32768$8$3$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256 || typeof encoded !== 'string') return false;
  const match = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  return timingSafeEqual(await derive(password, match[1], 64, params), Buffer.from(match[2], 'hex'));
}
export async function authFile(directory = authDirectory({})) {
  return path.join(await privateDirectory(directory), 'admin.json');
}
export async function createAdmin(directory, username, password, replace = false) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9@._+-]{3,100}$/.test(username)) throw new Error('Use a username/email of 3–100 letters, digits, or @ . _ + -');
  const record = { username, passwordHash: await hashPassword(password), updatedAt: new Date().toISOString() };
  await atomicJson(await authFile(directory), record, { replace });
}
export async function readAdmin(directory) {
  return readPrivateJson(await authFile(directory), 4096);
}
export const authVersion = account => createHash('sha256').update(`${account.username}:${account.passwordHash}`).digest('hex');

export function createSessions({ now = Date.now } = {}) {
  const sessions = new Map();
  const duration = 8 * 60 * 60 * 1000;
  function prune() { for (const [id, session] of sessions) if (session.expires <= now()) sessions.delete(id); }
  const digest = token => createHash('sha256').update(token).digest('hex');
  return {
    duration,
    create(account) {
      prune();
      if (sessions.size >= 100) throw new Error('Too many active sessions');
      const token = randomBytes(32).toString('hex');
      const session = { username: account.username, version: authVersion(account), csrf: randomBytes(32).toString('hex'), expires: now() + duration };
      sessions.set(digest(token), session);
      return { token, session };
    },
    get(token) { prune(); return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? sessions.get(digest(token)) : undefined; },
    remove(token) { if (typeof token === 'string') sessions.delete(digest(token)); },
  };
}
