import 'dotenv/config';
import { createApp } from './app.mjs';
import { privateDirectory } from './storage.mjs';
import { submissionsDirectory, authDirectory } from './paths.mjs';

const port = Number(process.env.PORT || 3001);
if (process.argv.includes('--dev')) process.env.NODE_ENV = 'development';
await privateDirectory(submissionsDirectory(process.env));
await privateDirectory(authDirectory(process.env));
const server = createApp().listen(port, '0.0.0.0', () => console.log(`Retinaad server listening on port ${server.address().port}`));
