#!/usr/bin/env node
// Make a browser a dispatcher (operator) on a published Headcount module.
//
// On a real SpacetimeDB server the simulation controls, overrides and "mark found" are
// operator-only. The publisher is the first operator; every browser starts read-only.
// This promotes one, without copying a 64-character identity by hand.
//
//   npm run promote              promote every client currently connected (open the dashboard first)
//   npm run promote -- 0xc200…   promote one identity (what the New Simulation panel shows)
//   npm run promote -- --list    show who is connected and who is already an operator
//
// Uses the same Vite environment as the monitor; defaults to Maincloud rescuedb.
// Run through npm from the monitor/ directory.
import { execFileSync } from 'node:child_process';

import { database as DB, server as SERVER } from './target.mjs';
const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const given = args.filter((a) => !a.startsWith('--'));

const HEX = /^0x[0-9a-f]{64}$/i;

/**
 * Run the CLI with --server. Flags must come BEFORE the `--` separator: everything after it
 * is passed to the reducer, so `call db fn -- args --server x` silently targets the default server.
 */
function spacetime(cmdArgs) {
  const sep = cmdArgs.indexOf('--');
  const withServer = sep === -1 ? [...cmdArgs, '--server', SERVER] : [...cmdArgs.slice(0, sep), '--server', SERVER, ...cmdArgs.slice(sep)];
  try {
    return execFileSync('spacetime', withServer, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const detail = [e.stdout, e.stderr]
      .filter(Boolean)
      .join('\n')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('WARNING:'))
      .join('\n');
    throw new Error(detail || e.message);
  }
}

/** One column of hex identities from a SQL query, via --format json. */
function identities(query) {
  const out = spacetime(['sql', DB, query, '--format', 'json']);
  const parsed = JSON.parse(out);
  return parsed.flatMap((r) => (r.rows ?? []).map((row) => String(row[0]).toLowerCase()));
}

function main() {
  let connected;
  let operators;
  try {
    connected = [...new Set(identities('select identity from st_client'))];
    operators = identities('select identity from operator');
  } catch (e) {
    console.error(`Could not read ${DB} on server "${SERVER}".\n${e.message}\n`);
    console.error('Check that the server is running (spacetime start) and the module is published:');
    console.error(`  spacetime publish --server ${SERVER} --module-path ../spacetimedb ${DB}`);
    process.exit(2);
  }

  const isOperator = (id) => operators.includes(id);
  const show = (id) => `${id}${isOperator(id) ? '  (already a dispatcher)' : ''}`;

  if (listOnly || (!given.length && !connected.length)) {
    console.log(`Database ${DB} on server "${SERVER}"\n`);
    console.log(`Dispatchers (${operators.length}):`);
    for (const id of operators) console.log(`  ${id}`);
    console.log(`\nConnected clients (${connected.length}):`);
    for (const id of connected) console.log(`  ${show(id)}`);
    if (!connected.length) console.log('  none — open the dashboard (npm run dev) first, then run this again.');
    return;
  }

  for (const id of given) {
    if (!HEX.test(id)) {
      console.error(`Not an identity: ${id}`);
      console.error('Expected 0x followed by 64 hex characters, as the New Simulation panel shows.');
      process.exit(2);
    }
  }

  const targets = (given.length ? given.map((s) => s.toLowerCase()) : connected).filter((id) => !isOperator(id));
  if (!targets.length) {
    console.log(`Nothing to do: ${given.length ? 'that identity is' : 'every connected client is'} already a dispatcher.`);
    return;
  }

  for (const id of targets) {
    spacetime(['call', DB, 'add_operator', '--', JSON.stringify([id])]);
    console.log(`Promoted ${id}`);
  }
  console.log(`\n${targets.length} client${targets.length === 1 ? '' : 's'} promoted on ${DB}. Reload the dashboard.`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
