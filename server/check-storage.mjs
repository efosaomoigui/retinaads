import 'dotenv/config';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { privateDirectory, atomicJson, readPrivateJson } from './storage.mjs';
import { submissionsDirectory, authDirectory } from './paths.mjs';

let probe;
try {
  for (const configured of [submissionsDirectory(process.env), authDirectory(process.env)]) {
    const directory = await privateDirectory(configured);
    const id = randomUUID();
    probe = path.join(directory, `.storage-probe-${id}.json`);
    await atomicJson(probe, { id });
    if ((await readPrivateJson(probe)).id !== id) throw new Error('Read-back failed');
    await unlink(probe);
    probe = undefined;
  }
  console.log('PASS: submission and authentication directories support atomic writes and read-back.');
  console.log('This does NOT prove persistence across host restarts or deployments. Confirm that with the hosting provider.');
} catch (error) {
  console.error(`Storage check failed: ${error.message}`);
  process.exitCode = 1;
} finally { if (probe) await unlink(probe).catch(() => {}); }
