import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const applicationRoot = fileURLToPath(new URL('../', import.meta.url));
export const privateRoot = path.join(applicationRoot, 'private');
export const submissionsDirectory = env => env.SUBMISSIONS_DIRECTORY || path.join(privateRoot, 'submissions');
export const authDirectory = env => env.AUTH_DIRECTORY || path.join(privateRoot, 'auth');
