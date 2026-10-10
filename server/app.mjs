import express from 'express';
import { businessEmailError } from '../shared/business-email.mjs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSubmissionProtection } from './submission-protection.mjs';
import { createSubmissionStore } from './storage.mjs';
import { createAdminRouter } from './admin.mjs';
import { applicationRoot, submissionsDirectory } from './paths.mjs';

export function createApp({ env = process.env, protection, saveSubmission, now } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Leave proxy trust disabled unless the actual host provides trusted proxy IPs.
  if (env.TRUSTED_PROXY_IPS) app.set('trust proxy', env.TRUSTED_PROXY_IPS.split(',').map(value => value.trim()));
  // Never let the SPA fallback or a deployment mistake expose runtime files.
  app.use((req, res, next) => {
    let pathname;
    try { pathname = decodeURIComponent(req.path).replaceAll('\\', '/'); } catch { return res.sendStatus(400); }
    if (/(^|\/)\./.test(pathname) || /^\/(private|server|src|logs|node_modules)(\/|$)/i.test(pathname) || /^\/(package(?:-lock)?\.json|.*\.log)$/i.test(pathname)) return res.sendStatus(404);
    next();
  });
  const store = createSubmissionStore(submissionsDirectory(env));
  app.use('/admin', createAdminRouter({ env, store, now }));
  const protect = protection || createSubmissionProtection({
    secret: env.TURNSTILE_SECRET_KEY,
    hostnames: (env.TURNSTILE_ALLOWED_HOSTNAMES || '').split(',').map(value => value.trim()).filter(Boolean),
  });
  app.post('/api/submissions', protect, express.json({ limit: '15mb' }), async (req, res) => {
    const { form, fields, resume } = req.body || {};
    if (!['contact', 'demo', 'careers', 'request', 'about', 'website_entry'].includes(form) || !fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return res.status(400).json({ error: 'Invalid submission.' });
    }
    const entries = Object.entries(fields);
    if (entries.length > 30 || entries.some(([key, value]) => key.length > 150 || typeof value !== 'string' || value.length > 5000)) {
      return res.status(400).json({ error: 'Please shorten your message and try again.' });
    }
    if (form === 'website_entry') {
      if (entries.length !== 2 || !Object.hasOwn(fields, 'fullName') || !Object.hasOwn(fields, 'businessEmail') ||
          !fields.fullName.trim() || fields.fullName.trim().length > 150 || /[\u0000-\u001f\u007f]/.test(fields.fullName)) {
        return res.status(400).json({ error: 'Please enter your full name and business email.' });
      }
      const error = businessEmailError(fields.businessEmail);
      if (error) return res.status(400).json({ error });
      fields.fullName = fields.fullName.trim();
      fields.businessEmail = fields.businessEmail.trim();
    }
    if (!fields.fullName?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email || fields.workEmail || fields.businessEmail || '')) {
      return res.status(400).json({ error: 'Please enter your name and a valid email address.' });
    }
    if (form === 'careers' && !resume) return res.status(400).json({ error: 'Please attach your CV.' });
    if (resume) {
      if (form !== 'careers' || typeof resume.name !== 'string' || resume.name.length > 255 || !/\.(pdf|doc|docx)$/i.test(resume.name) ||
          typeof resume.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(resume.base64) || !resume.base64.length ||
          Buffer.byteLength(resume.base64, 'base64') > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Please attach a PDF, DOC or DOCX file up to 10MB.' });
      }
    }
    const record = { id: randomUUID(), receivedAt: new Date().toISOString(), status: 'received', form, fields,
      ...(resume ? { resume: { name: resume.name, base64: resume.base64 } } : {}) };
    try {
      if (saveSubmission) await saveSubmission(record);
      else await store.save(record);
      return res.status(201).json({ id: record.id });
    } catch {
      return res.status(503).json({ error: 'Your request could not be saved. Please try again later.' });
    }
  });
  app.all('/api/*', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(express.static(path.join(applicationRoot, 'dist'), { dotfiles: 'deny' }));
  app.get('*', (_req, res) => res.sendFile(path.join(applicationRoot, 'dist/index.html')));
  app.use((error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Invalid or oversized request.' });
  });
  return app;
}
