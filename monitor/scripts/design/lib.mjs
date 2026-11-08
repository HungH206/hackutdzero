// Shared helpers for the design tools (shoot.mjs, audit.mjs).
// No npm dependencies: Node built-ins plus the Chrome DevTools Protocol over
// Node's global WebSocket (Node 22+). Chrome runs headless with a throwaway
// profile and is closed when the run ends.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const ALL_VIEWS = ['graph', 'overview', 'houses', 'map', 'tree', 'analytics', 'log'];
export const ALL_STATES = ['clear', 'incident'];
export const DEFAULT_BASE = 'http://127.0.0.1:5192';

/** Views that draw into a <canvas> and need extra time (three.js is lazy-loaded). */
const VIEW_WAIT_SELECTOR = { graph: 'canvas' };

/** The "incident" scene: quake, fire, power loss, then fast-forward so the queue and ladder fill. */
export const INCIDENT = { quake: { x: 200, y: 160, magnitude: 1 }, powerRadius: 420, fireName: 'Mr. Chen', ffMinutes: 8 };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- CLI

/** `--key value`, `--key=value`, booleans, and repeatable keys. */
export function parseArgs(argv, { booleans = [], multi = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const k = eq < 0 ? a.slice(2) : a.slice(2, eq);
    let v = eq < 0 ? undefined : a.slice(eq + 1);
    if (booleans.includes(k)) {
      out[k] = v === undefined ? true : !/^(0|false|no)$/i.test(v);
      continue;
    }
    if (v === undefined) {
      v = argv[++i];
      if (v === undefined) throw new Error(`--${k} needs a value`);
    }
    if (multi.includes(k)) (out[k] ??= []).push(v);
    else out[k] = v;
  }
  return out;
}

const list = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);

export function parseSize(s) {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(s.trim());
  if (!m) throw new Error(`Bad size "${s}" (want WxH, e.g. 1440x900)`);
  return { width: Number(m[1]), height: Number(m[2]), label: `${m[1]}x${m[2]}` };
}

/** Options shared by shoot.mjs and audit.mjs. */
export function commonOptions(args) {
  if (!args.out) throw new Error('--out <dir> is required');
  const views = args.views ? list(args.views) : ALL_VIEWS;
  const states = args.states ? list(args.states) : ALL_STATES;
  for (const s of states) if (!['clear', 'incident', 'current'].includes(s)) throw new Error(`Unknown state "${s}" (clear, incident, current)`);
  for (const v of views) if (!ALL_VIEWS.includes(v)) console.warn(`warning: "${v}" is not a known view (${ALL_VIEWS.join(', ')}); the app may fall back to graph`);
  return {
    base: (args.base ?? DEFAULT_BASE).replace(/\/+$/, ''),
    out: path.resolve(args.out),
    views,
    states,
    sizes: (args.sizes ? list(args.sizes) : ['1440x900']).map(parseSize),
    query: args.query ?? [],
    chrome: args.chrome,
    settleMs: Number(args.settle ?? 1000),
    canvasSettleMs: Number(args['canvas-settle'] ?? 2000),
    timeoutMs: Number(args.timeout ?? 45000),
    waitSelector: args.wait ?? null,
    fire: args.fire !== undefined ? Number(args.fire) : undefined,
    ffMinutes: Number(args.ff ?? INCIDENT.ffMinutes),
    headful: Boolean(args.headful),
    verbose: Boolean(args.verbose),
  };
}

export function pageUrl(base, view, query) {
  const u = new URL(base + '/');
  u.searchParams.set('view', view);
  for (const q of query) for (const [k, v] of new URLSearchParams(q)) u.searchParams.append(k, v);
  return u.toString();
}

// ---------------------------------------------------------------- Simulation (local backend)

export async function hcCall(base, reducer, args = {}) {
  const r = await fetch(`${base}/__headcount/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reducer, args }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${reducer}(${JSON.stringify(args)}) failed: HTTP ${r.status} ${text.slice(0, 300)}`);
}

export async function hcState(base) {
  const r = await fetch(`${base}/__headcount/state`);
  if (!r.ok) throw new Error(`GET /__headcount/state: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/** Fails fast with a useful message when the server is down or not running the local backend. */
export async function checkServer(base, states) {
  const needsLocal = states.some((s) => s !== 'current');
  try {
    if (needsLocal) await hcState(base);
    else {
      const r = await fetch(base + '/');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }
  } catch (e) {
    const hint = needsLocal
      ? 'Start a dev server with the in-process backend (HEADCOUNT_SOURCE=local), see scripts/design/README.md. Use --states current to shoot a server without changing its simulation.'
      : 'Is the dev server running?';
    throw new Error(`Cannot reach ${base}: ${e.message}\n${hint}`);
  }
}

function summarize(s) {
  return {
    households: (s.households ?? []).length,
    disasterActive: (s.disasters ?? []).some((d) => d.active),
    activeDisasters: (s.disasters ?? []).filter((d) => d.active).length,
    priorities: (s.priorities ?? []).length,
    escalations: (s.escalations ?? []).length,
    timeline: (s.timeline ?? []).length,
    unresolved: (s.households ?? []).filter((h) => h.finalState === 'unresolved').length,
    clockOffsetMin: Math.round(((s.clockOffsetMicros ?? 0) / 60e6) * 10) / 10,
  };
}

function pickFireHousehold(s, explicitId) {
  const hh = s.households ?? [];
  if (explicitId !== undefined) {
    const h = hh.find((x) => x.id === explicitId);
    if (!h) throw new Error(`--fire ${explicitId}: no such household`);
    return h;
  }
  const byName = hh.find((h) => h.name === INCIDENT.fireName);
  if (byName) return byName;
  // Fallback: the simulated sensor household nearest the quake.
  const { x, y } = INCIDENT.quake;
  const cands = hh.filter((h) => h.hasSensor && h.simulated).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  if (!cands.length) throw new Error('No household available for sim_fire');
  return cands[0];
}

/**
 * Puts the simulation into a named state and returns a summary read back from
 * /__headcount/state. The local bridge runs reducers as "internal", so the
 * operator check passes without any setup. Changes are synchronous on the
 * server; pages pick them up on their next 800 ms poll (or on load).
 */
export async function applyState(base, state, opts = {}) {
  if (state === 'current') return { state, note: 'simulation left as is', ...summarize(await hcState(base).catch(() => ({}))) };
  await hcCall(base, 'sim_reset', {});
  if (state === 'clear') {
    const sum = summarize(await hcState(base));
    if (sum.disasterActive) throw new Error('sim_reset left an active disaster');
    return { state, steps: ['sim_reset'], ...sum };
  }
  const before = await hcState(base);
  const fire = pickFireHousehold(before, opts.fire);
  const { quake, powerRadius } = INCIDENT;
  const ff = opts.ffMinutes ?? INCIDENT.ffMinutes;
  const steps = [
    ['sim_quake', quake],
    ['sim_fire', { householdId: fire.id }],
    ['sim_power_loss', { x: quake.x, y: quake.y, radius: powerRadius }],
    ['sim_fast_forward', { minutes: ff }],
  ];
  for (const [r, a] of steps) await hcCall(base, r, a);
  const sum = summarize(await hcState(base));
  if (!sum.disasterActive) throw new Error('Incident setup finished without an active disaster (check reducer arguments)');
  return {
    state,
    steps: ['sim_reset', ...steps.map(([r, a]) => `${r} ${JSON.stringify(a)}`)],
    fire: { id: fire.id, name: fire.name, unit: fire.unit },
    ...sum,
  };
}

// ---------------------------------------------------------------- Chrome + CDP

export class CDP {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => resolve(new CDP(ws));
      ws.onerror = () => reject(new Error(`CDP WebSocket error (${url})`));
    });
  }
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    ws.onmessage = (ev) => this.#onMessage(ev.data);
    ws.onclose = () => {
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error(`CDP connection closed during ${p.method}`));
      this.pending.clear();
    };
  }
  send(method, params = {}, sessionId, timeoutMs = 60000) {
    if (this.closed) return Promise.reject(new Error(`CDP connection closed (${method})`));
    const id = ++this.seq;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.ws.send(JSON.stringify(msg));
    });
  }
  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
  #onMessage(data) {
    const msg = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}${msg.error.data ? ` (${msg.error.data})` : ''}`));
      else p.resolve(msg.result);
    } else for (const l of this.listeners) l(msg);
  }
}

export function findChrome(explicit) {
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const cands =
    process.platform === 'win32'
      ? [
          path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  for (const p of [explicit, process.env.CHROME_PATH, ...cands].filter(Boolean)) if (fs.existsSync(p)) return p;
  throw new Error('Chrome not found. Pass --chrome <path> or set CHROME_PATH.');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function launchChrome({ chrome, headful = false } = {}) {
  const exe = findChrome(chrome);
  const port = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-design-chrome-'));
  const args = [
    ...(headful ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-component-update',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars',
    '--mute-audio',
    '--force-color-profile=srgb',
    // Lets WebGL fall back to software rendering on machines without a usable GPU.
    '--enable-unsafe-swiftshader',
    '--window-size=1920,1080',
    'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => {
    if (stderr.length < 20000) stderr += d;
  });
  const exited = new Promise((r) => proc.once('exit', r));
  let ver;
  for (let i = 0; i < 200 && !ver; i++) {
    if (proc.exitCode !== null) break;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) ver = await r.json();
    } catch {}
    if (!ver) await sleep(100);
  }
  const cleanup = async () => {
    await Promise.race([exited, sleep(5000)]);
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill();
      await Promise.race([exited, sleep(3000)]);
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {}
  };
  if (!ver) {
    proc.kill();
    await cleanup();
    throw new Error(`Chrome did not open its debugging port (${exe}).\n${stderr.slice(-1500)}`);
  }
  const cdp = await CDP.connect(ver.webSocketDebuggerUrl);
  let closing;
  const close = () =>
    (closing ??= (async () => {
      try {
        await cdp.send('Browser.close', {}, undefined, 3000);
      } catch {}
      cdp.close();
      await cleanup();
    })());
  return { cdp, version: ver.Browser, exe, close };
}

// ---------------------------------------------------------------- Pages

const argText = (a) => {
  if (!a) return '';
  if (a.type === 'string') return a.value;
  if (a.value !== undefined) return typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value);
  return a.unserializableValue ?? a.description ?? a.type;
};
const clip = (s, n = 600) => (s && s.length > n ? s.slice(0, n) + '…' : s);
const STUCK_MS = 10000; // requests pending longer than this (long-poll, streams) don't block "idle"

/** One fresh tab, attached in flattened-session mode, recording errors and network activity. */
export class Page {
  static async open(cdp, { width, height }) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(cdp, targetId, sessionId);
    await Promise.all([p.send('Page.enable'), p.send('Runtime.enable'), p.send('Network.enable'), p.send('Log.enable')]);
    await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });
    await p.send('Page.bringToFront');
    return p;
  }

  constructor(cdp, targetId, sessionId) {
    Object.assign(this, { cdp, targetId, sessionId });
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.exceptions = [];
    this.failedRequests = [];
    this.inflight = new Map();
    this.lastActivity = Date.now();
    this.loaded = false;
    this.navigations = 0;
    this.off = cdp.onEvent((m) => {
      if (m.sessionId === sessionId) this.#event(m.method, m.params);
    });
  }

  send(method, params = {}, timeoutMs) {
    return this.cdp.send(method, params, this.sessionId, timeoutMs);
  }

  #event(method, p) {
    const now = Date.now();
    switch (method) {
      case 'Runtime.consoleAPICalled': {
        if (!['error', 'warning', 'assert'].includes(p.type)) break;
        const f = p.stackTrace?.callFrames?.[0];
        const rec = { text: clip(p.args.map(argText).join(' ')), url: f?.url, line: f ? f.lineNumber + 1 : undefined };
        (p.type === 'warning' ? this.consoleWarnings : this.consoleErrors).push(rec);
        break;
      }
      case 'Log.entryAdded': {
        const e = p.entry;
        // The app ships no favicon; Chrome's automatic /favicon.ico 404 is not a page error.
        if (e.source === 'network' && /\/favicon\.ico(\?|$)/.test(e.url ?? '')) break;
        const rec = { text: clip(e.text), source: e.source, url: e.url };
        if (e.level === 'error') this.consoleErrors.push(rec);
        else if (e.level === 'warning') this.consoleWarnings.push(rec);
        break;
      }
      case 'Runtime.exceptionThrown': {
        const d = p.exceptionDetails;
        this.exceptions.push({ text: clip(d.exception?.description ?? d.text), url: d.url, line: d.lineNumber + 1 });
        break;
      }
      case 'Network.requestWillBeSent':
        if (!p.request.url.startsWith('data:')) this.inflight.set(p.requestId, { url: p.request.url, t: now });
        this.lastActivity = now;
        break;
      case 'Network.loadingFinished':
        this.inflight.delete(p.requestId);
        this.lastActivity = now;
        break;
      case 'Network.loadingFailed': {
        const r = this.inflight.get(p.requestId);
        this.inflight.delete(p.requestId);
        this.lastActivity = now;
        if (!p.canceled) this.failedRequests.push({ url: r?.url, error: p.errorText, type: p.type });
        break;
      }
      case 'Network.responseReceived':
        if (p.response.status >= 400 && !/\/favicon\.ico(\?|$)/.test(p.response.url)) this.failedRequests.push({ url: p.response.url, status: p.response.status, type: p.type });
        break;
      case 'Page.frameNavigated':
        // Main-frame navigations to real pages; the initial about:blank doesn't count.
        if (!p.frame.parentId && p.frame.url !== 'about:blank') {
          this.navigations++;
          this.loaded = false;
        }
        break;
      case 'Page.loadEventFired':
        this.loaded = true;
        break;
    }
  }

  idle(idleMs) {
    const now = Date.now();
    for (const r of this.inflight.values()) if (now - r.t < STUCK_MS) return false;
    return now - this.lastActivity >= idleMs;
  }

  async evaluate(expression, { awaitPromise = false, timeoutMs } = {}) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, timeoutMs);
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  async goto(url) {
    this.loaded = false;
    this.gotoNav = this.navigations;
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) throw new Error(`navigate ${url}: ${r.errorText}`);
  }

  /**
   * Load event, then no network requests for idleMs (the page polls state every
   * 800 ms, so idle windows are short but real), then the view's selector
   * (canvas for the 3D screen), fonts, two frames, and a settle delay. Starts
   * over if the page navigates meanwhile (for example a Vite dependency reload).
   */
  async waitReady({ view, timeoutMs = 45000, settleMs = 1000, canvasSettleMs = 2000, waitSelector = null, idleMs = 500 }) {
    const t0 = Date.now();
    const deadline = t0 + timeoutMs;
    const notes = [];
    const selectors = [VIEW_WAIT_SELECTOR[view], waitSelector].filter(Boolean);
    for (let attempt = 0; attempt < 3; attempt++) {
      // The frameNavigated event for goto() can arrive after Page.navigate returns.
      while (Date.now() < deadline && this.navigations <= (this.gotoNav ?? -1)) await sleep(50);
      while (Date.now() < deadline && !(this.loaded && this.idle(idleMs))) await sleep(50);
      const nav0 = this.navigations;
      if (Date.now() >= deadline) {
        notes.push(this.loaded ? 'network never went idle' : 'load event never fired');
        break;
      }
      for (const sel of selectors) {
        const selDeadline = Math.min(deadline, Date.now() + 20000);
        let found = false;
        while (Date.now() < selDeadline && !(found = await this.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`))) await sleep(150);
        if (!found) notes.push(`selector ${sel} not found`);
      }
      // Lazy chunks requested after the selector appeared (three.js textures, fonts).
      while (Date.now() < deadline && !this.idle(idleMs)) await sleep(50);
      await this.evaluate(
        `Promise.race([document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))), new Promise((r) => setTimeout(r, 3000))]).then(() => true)`,
        { awaitPromise: true, timeoutMs: 10000 },
      );
      const hasCanvas = await this.evaluate(`!!document.querySelector('canvas')`);
      await sleep(settleMs + (hasCanvas ? canvasSettleMs : 0));
      if (this.navigations === nav0) return { readyMs: Date.now() - t0, notes, hasCanvas };
      notes.push('page navigated while settling; waiting again');
    }
    return { readyMs: Date.now() - t0, notes, hasCanvas: await this.evaluate(`!!document.querySelector('canvas')`).catch(() => false) };
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }

  /** A few facts that help confirm the right screen and state were captured. */
  async facts() {
    return this.evaluate(`(() => {
      const root = document.querySelector('#root > *');
      let webgl = null;
      const c = document.querySelector('canvas');
      if (c) {
        try {
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
          webgl = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl') : 'no context';
        } catch (e) { webgl = 'error: ' + e.message; }
      }
      return { title: document.title, rootClass: root ? String(root.className) : null, canvases: document.querySelectorAll('canvas').length, webgl, scrollHeight: document.documentElement.scrollHeight };
    })()`);
  }

  async close() {
    this.off();
    try {
      await this.cdp.send('Target.closeTarget', { targetId: this.targetId }, undefined, 10000);
    } catch {}
  }

  diagnostics() {
    return {
      consoleErrors: this.consoleErrors,
      consoleWarnings: this.consoleWarnings,
      exceptions: this.exceptions,
      failedRequests: this.failedRequests,
    };
  }
}

/**
 * For every state × view × size: open a fresh tab, load and settle the page,
 * call `capture(page, ctx)` while it is open, close it, then call `done(ctx)`
 * with timings and diagnostics. The simulation is set once per state.
 * Returns the per-state summaries.
 */
export async function runMatrix(opts, { capture, done }, { log = console.log } = {}) {
  await checkServer(opts.base, opts.states);
  const browser = await launchChrome({ chrome: opts.chrome, headful: opts.headful });
  const onSig = () => {
    browser.close().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSig);
  const states = {};
  const total = opts.states.length * opts.views.length * opts.sizes.length;
  let n = 0;
  try {
    log(`chrome: ${browser.version} (${browser.exe})`);
    for (const state of opts.states) {
      const st = await applyState(opts.base, state, opts);
      states[state] = st;
      log(
        `state ${state}: ${st.steps ? st.steps.length + ' reducer call(s)' : st.note}; disaster ${st.disasterActive ? 'active' : 'none'}, ` +
          `${st.priorities} priorities, ${st.timeline} timeline rows, clock +${st.clockOffsetMin} min` +
          (st.fire ? `, fire at #${st.fire.id} ${st.fire.name} (${st.fire.unit})` : ''),
      );
      for (const view of opts.views)
        for (const size of opts.sizes) {
          n++;
          const url = pageUrl(opts.base, view, opts.query);
          const t0 = Date.now();
          const ctx = { view, state, size, url, index: n, total };
          let page;
          try {
            page = await Page.open(browser.cdp, size);
            await page.goto(url);
            ctx.ready = await page.waitReady({ view, ...opts });
            ctx.facts = await page.facts().catch((e) => ({ error: e.message }));
            await capture(page, ctx);
            // Guard against another client (or a second tool run) changing this server's simulation mid-run.
            if (state !== 'current') {
              const s = await hcState(opts.base).catch(() => null);
              const active = s ? (s.disasters ?? []).some((d) => d.active) : null;
              if (active !== null && active !== (state === 'incident')) {
                ctx.stateMismatch = true;
                ctx.ready.notes.push(`simulation is no longer "${state}" (disaster ${active ? 'active' : 'none'}): did another client change it?`);
              }
            }
          } catch (e) {
            ctx.error = e.message;
          } finally {
            ctx.ms = Date.now() - t0;
            ctx.diag = page ? page.diagnostics() : { consoleErrors: [], consoleWarnings: [], exceptions: [], failedRequests: [] };
            if (page) await page.close();
          }
          await done?.(ctx);
        }
    }
  } finally {
    process.off('SIGINT', onSig);
    await browser.close();
  }
  return { states, chrome: browser.version };
}

export const rel = (p) => path.relative(process.cwd(), p) || '.';
