import path from 'node:path';
import { constants } from 'node:fs';
import { mkdir, realpath, open, link, rename, unlink, readdir, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { applicationRoot, privateRoot, submissionsDirectory } from './paths.mjs';

export const submissionId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function privateDirectory(directory = submissionsDirectory({})) {
  if (!directory || !path.isAbsolute(directory)) throw new Error('Private storage directory must be configured');
  if (inside(applicationRoot, path.resolve(directory)) && !inside(privateRoot, path.resolve(directory))) throw new Error('Application storage must be under private/');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const canonical = await realpath(directory);
  const root = await realpath(applicationRoot);
  if (inside(root, canonical) && !inside(path.join(root, 'private'), canonical)) throw new Error('Application storage must be under private/');
  return canonical;
}

export async function atomicJson(file, value, { replace = false } = {}) {
  const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
    await handle.close();
    // Same-filesystem publication exposes only complete records. link refuses
    // to overwrite existing records; rename is reserved for explicit admin reset.
    if (replace) await rename(temporary, file);
    else await link(temporary, file);
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function readPrivateJson(file, maxBytes = 15 * 1024 * 1024) {
  if ((await lstat(file)).isSymbolicLink()) throw new Error('Private records cannot be symlinks');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid private record');
    return JSON.parse(await handle.readFile('utf8'));
  } finally { await handle.close(); }
}

export function createSubmissionStore(directory) {
  return {
    async save(record) {
      if (!submissionId.test(record.id)) throw new Error('Invalid submission ID');
      const root = await privateDirectory(directory);
      await atomicJson(path.join(root, `${record.id}.json`), record);
    },
    async get(id) {
      if (!submissionId.test(id)) return null;
      const root = await privateDirectory(directory);
      try {
        const record = await readPrivateJson(path.join(root, `${id}.json`));
        if (record.id !== id || !record.fields || typeof record.fields !== 'object') throw new Error('Invalid submission record');
        return record;
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async list(category = 'all') {
      const root = await privateDirectory(directory);
      const result = [];
      for (const name of await readdir(root)) {
        if (!name.endsWith('.json') || !submissionId.test(name.slice(0, -5))) continue;
        const record = await this.get(name.slice(0, -5));
        if (!record) continue;
        const group = ['contact', 'about'].includes(record.form) ? 'contact' : ['demo', 'careers', 'website_entry'].includes(record.form) ? record.form : 'other';
        if (category !== 'all' && category !== group) continue;
        result.push({ id: record.id, form: record.form, receivedAt: record.receivedAt,
          status: record.status || 'received', fullName: record.fields.fullName || '', email: record.fields.email || record.fields.workEmail || record.fields.businessEmail || '' });
      }
      return result.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    },
  };
}
