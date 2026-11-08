#!/usr/bin/env node
// Screenshots every screen in each simulation state at each viewport size.
//
//   node scripts/design/shoot.mjs --base http://127.0.0.1:5192 --out <dir>
//        [--views graph,overview,houses,map,tree,analytics,log] [--states clear,incident]
//        [--sizes 1440x900,1920x1080] [--query extra=1]
//
// Writes <out>/<view>-<state>-<w>x<h>.png and <out>/report.json, prints one line
// per shot, and exits 1 if any page logged a console error or threw (2 if the
// run itself failed). See README.md in this folder.

import fs from 'node:fs';
import path from 'node:path';
import { commonOptions, parseArgs, rel, runMatrix } from './lib.mjs';

const USAGE = `usage: node scripts/design/shoot.mjs --out <dir> [--base http://127.0.0.1:5192]
  [--views graph,overview,houses,map,tree,analytics,log] [--states clear,incident|current]
  [--sizes 1440x900,1920x1080] [--query key=value]... [--settle ms] [--canvas-settle ms]
  [--timeout ms] [--wait <css>] [--fire <householdId>] [--ff <minutes>] [--chrome <path>] [--headful] [--verbose]`;

async function main() {
  const args = parseArgs(process.argv.slice(2), { booleans: ['headful', 'verbose', 'help'], multi: ['query'] });
  if (args.help) return console.log(USAGE), 0;
  const opts = commonOptions(args);
  fs.mkdirSync(opts.out, { recursive: true });
  const t0 = Date.now();
  const shots = [];
  const pad = String(opts.states.length * opts.views.length * opts.sizes.length).length;

  const run = await runMatrix(opts, {
    capture: async (page, ctx) => {
      ctx.file = path.join(opts.out, `${ctx.view}-${ctx.state}-${ctx.size.label}.png`);
      await page.screenshot(ctx.file);
    },
    done: (ctx) => {
      const d = ctx.diag;
      const shot = {
        view: ctx.view,
        state: ctx.state,
        size: ctx.size.label,
        url: ctx.url,
        file: ctx.file && fs.existsSync(ctx.file) ? path.basename(ctx.file) : null,
        ok: !ctx.error && d.consoleErrors.length === 0 && d.exceptions.length === 0,
        error: ctx.error ?? null,
        ms: ctx.ms,
        readyMs: ctx.ready?.readyMs ?? null,
        notes: ctx.ready?.notes ?? [],
        facts: ctx.facts ?? null,
        ...d,
      };
      shots.push(shot);
      const counts = `err ${d.consoleErrors.length}  warn ${d.consoleWarnings.length}  exc ${d.exceptions.length}  failed-req ${d.failedRequests.length}`;
      const status = ctx.error ? 'FAIL ' : shot.ok ? 'ok   ' : 'ERROR';
      console.log(
        `[${String(ctx.index).padStart(pad)}/${ctx.total}] ${status} ${ctx.view.padEnd(9)} ${ctx.state.padEnd(8)} ${ctx.size.label.padEnd(9)} ` +
          `${(ctx.ms / 1000).toFixed(1).padStart(5)}s  ${counts}  ${shot.file ?? '(no file)'}` +
          (shot.notes.length ? `  [${shot.notes.join('; ')}]` : ''),
      );
      if (ctx.error) console.log(`      ${ctx.error}`);
      const uniq = (arr) => {
        const m = new Map();
        for (const e of arr) {
          const k = e.text.split('\n')[0].slice(0, 200);
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        return [...m].map(([k, n]) => (n > 1 ? `${k} (x${n})` : k));
      };
      for (const t of uniq([...d.exceptions, ...d.consoleErrors]).slice(0, opts.verbose ? 20 : 3)) console.log(`      ! ${t}`);
      if (opts.verbose) {
        for (const t of uniq(d.consoleWarnings)) console.log(`      ~ ${t}`);
        for (const f of d.failedRequests) console.log(`      x ${f.status ?? f.error} ${f.url}`);
        console.log(`      root: ${ctx.facts?.rootClass}  canvases: ${ctx.facts?.canvases}  webgl: ${ctx.facts?.webgl ?? '-'}`);
      }
    },
  });

  const summary = {
    shots: shots.length,
    saved: shots.filter((s) => s.file).length,
    pagesWithErrors: shots.filter((s) => !s.ok).length,
    consoleErrors: shots.reduce((n, s) => n + s.consoleErrors.length, 0),
    consoleWarnings: shots.reduce((n, s) => n + s.consoleWarnings.length, 0),
    exceptions: shots.reduce((n, s) => n + s.exceptions.length, 0),
    failedRequests: shots.reduce((n, s) => n + s.failedRequests.length, 0),
  };
  const report = {
    tool: 'shoot',
    base: opts.base,
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
    chrome: run.chrome,
    views: opts.views,
    sizes: opts.sizes.map((s) => s.label),
    query: opts.query,
    states: run.states,
    summary,
    shots,
  };
  fs.writeFileSync(path.join(opts.out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    `\n${summary.saved}/${summary.shots} screenshots in ${rel(opts.out)} (${(report.durationMs / 1000).toFixed(0)} s). ` +
      `${summary.pagesWithErrors} page(s) with errors; ${summary.consoleErrors} console errors, ${summary.exceptions} exceptions, ` +
      `${summary.consoleWarnings} warnings, ${summary.failedRequests} failed requests. Report: ${rel(path.join(opts.out, 'report.json'))}`,
  );
  return summary.pagesWithErrors > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`shoot: ${e.message}`);
    process.exit(2);
  },
);
