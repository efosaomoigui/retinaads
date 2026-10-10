import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { readAdmin, verifyPassword, createSessions, authVersion } from './admin-auth.mjs';
import { authDirectory } from './paths.mjs';

const ui = fileURLToPath(new URL('./admin-ui/', import.meta.url));
const categories = new Set(['all', 'contact', 'demo', 'careers', 'website_entry', 'other']);
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const cookieName = 'retinaad_admin';
function tokenFrom(req) {
  const value = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`));
  return value?.slice(cookieName.length + 1);
}
function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createAdminRouter({ env, store, now = Date.now }) {
  const router = express.Router();
  const sessions = createSessions({ now });
  const production = !['development', 'test'].includes(env.NODE_ENV);
  const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/admin' };
  const loginAttempts = new Map();
  let hashing = 0;
  let globalAttempts = { count: 0, expires: 0 };
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    if (production && !req.secure) return res.status(426).type('text').send('Admin requires HTTPS. Check the hosting proxy configuration.');
    next();
  });
  function sameOrigin(req, res, next) {
    let expected;
    try {
      if (production && (!env.APP_URL || !req.secure || new URL(env.APP_URL).protocol !== 'https:')) throw new Error('HTTPS configuration missing');
      expected = new URL(env.APP_URL || `${req.protocol}://${req.get('host')}`).origin;
    } catch { return res.status(503).json({ error: 'Admin HTTPS configuration is incomplete.' }); }
    if (req.get('origin') !== expected) return res.status(403).json({ error: 'Request origin rejected.' });
    next();
  }
  const authenticated = asyncRoute(async (req, res, next) => {
    const session = sessions.get(tokenFrom(req));
    if (!session) return req.path === '/' ? res.redirect('/admin/login') : res.status(401).json({ error: 'Please sign in.' });
    const account = await readAdmin(authDirectory(env));
    if (session.version !== authVersion(account)) {
      sessions.remove(tokenFrom(req));
      return res.status(401).json({ error: 'Please sign in again.' });
    }
    req.adminSession = session;
    next();
  });
  function loginLimit(req, res, next) {
    const time = now();
    for (const [ip, entry] of loginAttempts) if (entry.expires <= time) loginAttempts.delete(ip);
    if (globalAttempts.expires <= time) globalAttempts = { count: 0, expires: time + 60000 };
    if (++globalAttempts.count > 100 || hashing >= 4 || (!loginAttempts.has(req.ip) && loginAttempts.size >= 10000)) {
      return res.status(429).set('Retry-After', '60').json({ error: 'Too many sign-in attempts. Please try again later.' });
    }
    const entry = loginAttempts.get(req.ip) || { count: 0, expires: time + 15 * 60000 };
    loginAttempts.set(req.ip, entry);
    if (++entry.count > 5) return res.status(429).set('Retry-After', String(Math.ceil((entry.expires - time) / 1000))).json({ error: 'Too many sign-in attempts. Please try again later.' });
    next();
  }
  router.get('/assets/admin.css', (_req, res) => res.sendFile(path.join(ui, 'admin.css')));
  router.get('/assets/admin.js', (_req, res) => res.sendFile(path.join(ui, 'admin.js')));
  router.get('/login', (_req, res) => res.sendFile(path.join(ui, 'login.html')));
  router.post('/api/login', sameOrigin, loginLimit, express.json({ limit: '4kb' }), asyncRoute(async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || username.length > 100 || typeof password !== 'string' || password.length > 256) return res.status(400).json({ error: 'Enter a valid username and password.' });
    let account;
    try { account = await readAdmin(authDirectory(env)); }
    catch { return res.status(503).json({ error: 'Admin login has not been configured.' }); }
    hashing++;
    let valid;
    try { valid = await verifyPassword(password, account.passwordHash); }
    finally { hashing--; }
    if (!valid || username.trim() !== account.username) return res.status(401).json({ error: 'Incorrect username or password.' });
    sessions.remove(tokenFrom(req));
    const { token } = sessions.create(account);
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessions.duration });
    return res.json({ ok: true });
  }));
  router.get('/', authenticated, (_req, res) => res.sendFile(path.join(ui, 'index.html')));
  router.get('/api/session', authenticated, (req, res) => res.json({ username: req.adminSession.username, csrf: req.adminSession.csrf, expires: req.adminSession.expires }));
  router.post('/api/logout', sameOrigin, authenticated, (req, res) => {
    if (!equal(req.get('X-CSRF-Token'), req.adminSession.csrf)) return res.status(403).json({ error: 'Request rejected.' });
    sessions.remove(tokenFrom(req));
    res.clearCookie(cookieName, cookieOptions);
    res.json({ ok: true });
  });
  router.get('/api/submissions', authenticated, asyncRoute(async (req, res) => {
    const category = req.query.category || 'all';
    const page = Number(req.query.page || 1);
    if (!categories.has(category) || !Number.isSafeInteger(page) || page < 1) return res.status(400).json({ error: 'Invalid filter.' });
    const rows = await store.list(category);
    res.json({ items: rows.slice((page - 1) * 50, page * 50), total: rows.length, page, pageSize: 50 });
  }));
  router.get('/api/export', authenticated, asyncRoute(async (req, res) => {
    const category = req.query.category || 'all';
    if (!categories.has(category)) return res.status(400).json({ error: 'Invalid filter.' });
    const rows = await store.list(category);
    res.attachment(`retinaad-${category}.jsonl`).type('application/x-ndjson');
    for (const row of rows) {
      if (res.destroyed) return;
      const record = await store.get(row.id);
      if (!record) continue;
      const { resume, ...fields } = record;
      const line = JSON.stringify({ ...fields, status: fields.status || 'received', ...(resume ? { resume: { name: resume.name } } : {}) }) + '\n';
      if (!res.write(line)) await new Promise(resolve => { const finish = () => { res.off('drain', finish); res.off('close', finish); resolve(); }; res.once('drain', finish); res.once('close', finish); });
    }
    res.end();
  }));
  router.get('/api/submissions/:id', authenticated, asyncRoute(async (req, res) => {
    const record = await store.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Submission not found.' });
    const { resume, ...fields } = record;
    res.json({ ...fields, status: fields.status || 'received', ...(resume ? { resume: { name: resume.name } } : {}) });
  }));
  router.get('/api/submissions/:id/resume', authenticated, asyncRoute(async (req, res) => {
    const record = await store.get(req.params.id);
    if (!record?.resume) return res.status(404).json({ error: 'CV not found.' });
    const extension = path.extname(record.resume.name).toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(extension)) return res.status(404).json({ error: 'CV not found.' });
    res.attachment(`resume-${record.id}${extension}`).type('application/octet-stream').send(Buffer.from(record.resume.base64, 'base64'));
  }));
  router.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  router.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 503).json({ error: 'The request could not be completed. Please try again.' });
  });
  return router;
}
