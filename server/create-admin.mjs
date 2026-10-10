import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createAdmin } from './admin-auth.mjs';
import { authDirectory } from './paths.mjs';

if (!process.stdin.isTTY) {
  console.error('Run npm run admin:create from an interactive terminal. Do not pass passwords as command arguments.');
  process.exitCode = 1;
} else {
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const username = (await prompt.question('Admin username/email: ')).trim();
    process.stdout.write('Password (hidden, minimum 14 characters): ');
    muted = true;
    const password = await prompt.question('');
    process.stdout.write('\nConfirm password (hidden): ');
    const confirmation = await prompt.question('');
    muted = false;
    process.stdout.write('\n');
    if (password !== confirmation) throw new Error('Passwords do not match');
    const replace = process.argv.includes('--replace');
    await createAdmin(authDirectory(process.env), username, password, replace);
    console.log(replace ? 'Admin account replaced. Existing sessions will be rejected.' : 'Admin account created. Password was stored only as a salted hash.');
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'An admin already exists. Use --replace only for an intentional password/account reset.' : error.message);
    process.exitCode = 1;
  } finally { muted = false; prompt.close(); }
}
