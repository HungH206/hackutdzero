// Match Vite's development environment, including .env.local, without printing secrets.
import { loadEnv } from 'vite';
// npm scripts run with monitor/ as their working directory, including bundled checks.
export const monitorRoot = process.cwd();
const env = loadEnv('development', monitorRoot, '');
export const database = process.env.SPACETIME_DB ?? env.VITE_SPACETIME_DB ?? 'rescuedb';
export const uri = env.VITE_SPACETIME_URI ?? 'wss://maincloud.spacetimedb.com';
// Derive the CLI server from the same URI unless explicitly overridden.
const endpoint = new URL(uri);
endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
export const server = process.env.SPACETIME_SERVER ?? endpoint.origin;
