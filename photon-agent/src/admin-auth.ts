import { timingSafeEqual } from 'node:crypto';

/** Basic supports the local admin page; Bearer supports the monitor. */
export function authorized(header: string | undefined, token: string | undefined): boolean {
  if (!token) return true; // Local-only mode. Public binding requires a token at startup.
  let candidate = '';
  if (header?.startsWith('Bearer ')) candidate = header.slice(7);
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    if (decoded.startsWith('dispatcher:')) candidate = decoded.slice('dispatcher:'.length);
  }
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
