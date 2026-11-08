#!/usr/bin/env node
// One dev server, one localhost port per dashboard.
//
//   npm run dashboards          local in-process backend (no SpacetimeDB server needed)
//   npm run dashboards:live     connect to the published SpacetimeDB module
//   add -- --attach             reuse a dev server already running on devPort
//   add -- --lan                listen on 0.0.0.0 so other devices (phone, Pi) can open them
//   add -- --all                also open dashboards marked "optional" in dashboards.json (CBRE)
//
// Every port is a plain TCP forward to the same Vite server, so all dashboards
// share one simulation and one set of live data.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(path.join(root, 'dashboards.json'), 'utf8'));
const { devPort } = config;
const args = new Set(process.argv.slice(2));
// The State Farm / welfare-check dashboards are the primary demo. CBRE is optional and off by default.
const dashboards = config.dashboards.filter((d) => args.has('--all') || !d.optional);
const attach = args.has('--attach');
const host = args.has('--lan') ? '0.0.0.0' : '127.0.0.1';
const target = '127.0.0.1';

const up = () =>
  new Promise((ok) => {
    const s = net.connect(devPort, target, () => (s.end(), ok(true)));
    s.on('error', () => ok(false));
  });

let vite;
if (!(await up())) {
  if (attach) {
    console.error(`No dev server on ${target}:${devPort}. Drop --attach to start one.`);
    process.exit(1);
  }
  vite = spawn('npx', ['vite', '--host', host, '--port', String(devPort), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, HEADCOUNT_SOURCE: process.env.HEADCOUNT_SOURCE ?? 'local' },
  });
  vite.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(d));
  vite.on('exit', (code) => {
    console.error(`Vite exited (${code}).`);
    process.exit(code ?? 1);
  });
  for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  if (!(await up())) {
    console.error('Vite did not start.');
    process.exit(1);
  }
}

const servers = [];
for (const d of dashboards) {
  const srv = net.createServer((client) => {
    const upstream = net.connect(devPort, target);
    client.pipe(upstream).pipe(client);
    const close = () => (client.destroy(), upstream.destroy());
    client.on('error', close);
    upstream.on('error', close);
  });
  await new Promise((ok) => {
    srv.once('error', (e) => {
      console.error(`  port ${d.port} (${d.label}) unavailable: ${e.code}`);
      ok();
    });
    srv.listen(d.port, host, () => {
      servers.push(srv);
      ok();
    });
  });
}

const shown = host === '0.0.0.0' ? 'localhost' : host;
console.log(`\nHeadcount dashboards (${process.env.HEADCOUNT_SOURCE ?? (vite ? 'local' : 'attached')} data, dev server :${devPort})\n`);
for (const d of dashboards) console.log(`  ${d.label.padEnd(28)} http://${shown}:${d.port}/`);
if (host === '0.0.0.0') console.log('\n  Listening on all interfaces: replace localhost with this machine\'s IP or Tailscale name.');
console.log('\nCtrl+C to stop.\n');

const stop = () => {
  for (const s of servers) s.close();
  vite?.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
