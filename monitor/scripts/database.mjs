#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { database, server, monitorRoot } from './target.mjs';
const action = process.argv[2];
const args = action === 'status'
  ? ['sql', '--no-config', '--server', server, database, 'SELECT COUNT(*) AS households FROM household']
  : action === 'publish'
    ? ['publish', '--no-config', '--server', server, '--module-path', '../spacetimedb', '--delete-data=never', database]
    : null;
if (!args) throw new Error('Expected status or publish');
console.log(`${action}: ${database} @ ${server}`);
const result = spawnSync('spacetime', args, { cwd: monitorRoot, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
