#!/usr/bin/env node
// Rendered-style uniformity audit: checks the computed styles of every visible
// element on every screen against src/theme/allowlist.json, and compares the
// shared data-ui landmarks across screens.
//
//   node scripts/design/audit.mjs --base http://127.0.0.1:5192 --out <dir>
//        [--views ...] [--states clear,incident] [--sizes 1440x900] [--query k=v]
//        [--allowlist <path>] [--landmarks topbar,panel,...] [--text-scope own|all]
//
// Writes <out>/audit.json and <out>/audit.md. Exit 0 unless the run failed (2),
// or --fail-on-violations is set and something is off-list (1).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commonOptions, parseArgs, rel, runMatrix } from './lib.mjs';
import { colorAllowed, cornerAllowed, firstFamily, fmtShadow, nearIn, normColor, normCorner, parseColor, parseShadow, shadowEqual } from './normalize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ALLOWLIST = path.resolve(here, '../../src/theme/allowlist.json');
// From src/theme/SYSTEM.md §2: every shared landmark carries data-ui="<name>".
const DEFAULT_LANDMARKS = ['topbar', 'panel', 'inspector', 'rail', 'row', 'chip', 'btn-primary', 'btn-secondary', 'pin', 'map-controls', 'alert', 'toast', 'kpi', 'tabs', 'seg'];
// Landmarks whose height should match across screens (panels and lists grow with content).
const HEIGHT_LANDMARKS = new Set(['topbar', 'row', 'chip', 'btn-primary', 'btn-secondary', 'pin', 'tabs', 'seg']);

const USAGE = `usage: node scripts/design/audit.mjs --out <dir> [--base http://127.0.0.1:5192]
  [--views graph,overview,houses,map,tree,analytics,log] [--states clear,incident|current]
  [--sizes 1440x900,1280x800] [--query key=value]... [--allowlist <path>]
  [--landmarks topbar,panel,... or CSS selectors] [--text-scope own|all] [--max-rows 80]
  [--fail-on-violations] [--settle ms] [--timeout ms] [--chrome <path>] [--verbose]`;

// ---------------------------------------------------------------- in-page collector

/* Runs inside the page. Must be self-contained (it is serialized with toString). */
function collectStyles(opts) {
  const CONTROL = 'button, a[href], input, select, textarea, [role=tab], [role=switch], [role=button]';
  const NO_HEIGHT_INPUT = /^(checkbox|radio|range|hidden|color|file|image)$/i;
  const SKIP = new Set(['script', 'style', 'head', 'meta', 'link', 'template', 'noscript', 'br', 'wbr', 'title', 'canvas']);
  const SVG_TEXT = new Set(['text', 'tspan', 'textPath']);
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  const doc = document.documentElement;
  const SW = Math.max(doc.scrollWidth, innerWidth);
  const SH = Math.max(doc.scrollHeight, innerHeight);
  const matches = (el, sel) => {
    try {
      return el.matches(sel);
    } catch {
      return false;
    }
  };
  const ignoredBy = (el) => opts.ignore.find((s) => matches(el, s));
  const alphaOf = (c) => {
    if (!c || c === 'transparent') return 0;
    let m = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c);
    if (m) return m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    m = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(c);
    return m ? parseFloat(m[1]) : 1;
  };
  const tok = (el) => {
    let t = el.localName;
    if (el.id) t += '#' + el.id;
    for (const c of (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3)) t += '.' + c;
    const ui = el.getAttribute('data-ui');
    if (ui) t += `[data-ui="${ui}"]`;
    return t;
  };
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
      if (e === document.body || e === doc) {
        if (!parts.length) parts.unshift(e.localName);
        break;
      }
      parts.unshift(tok(e));
    }
    return parts.join(' > ');
  };
  const ownText = (el) => {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.data.trim()) return true;
    return false;
  };
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    const ok = r.width > 0 && r.height > 0 && !(r.width <= 1 && r.height <= 1) && r.right > 0 && r.bottom > 0 && r.left < SW && r.top < SH;
    return ok ? r : null;
  };
  const fontOf = (cs, colorProp) => ({ ff: cs.fontFamily, fs: cs.fontSize, fw: cs.fontWeight, c: colorProp === 'fill' ? cs.fill : cs.color });
  const boxProps = (cs, rec, replaced) => {
    const bgA = alphaOf(cs.backgroundColor);
    if (bgA > 0) rec.bg = cs.backgroundColor;
    const borders = [];
    for (const s of SIDES) {
      const w = parseFloat(cs.getPropertyValue(`border-${s}-width`));
      const st = cs.getPropertyValue(`border-${s}-style`);
      const col = cs.getPropertyValue(`border-${s}-color`);
      if (w > 0 && st !== 'none' && st !== 'hidden' && alphaOf(col) > 0 && !borders.includes(col)) borders.push(col);
    }
    if (borders.length) rec.bc = borders;
    if (cs.boxShadow && cs.boxShadow !== 'none') rec.sh = cs.boxShadow;
    const bf = cs.backdropFilter || cs.webkitBackdropFilter;
    if (bf && bf !== 'none') rec.bf = bf;
    // Radius only where it can be seen: a filled, bordered, shadowed, blurred, clipping or replaced box.
    const clips = cs.overflow !== 'visible' && cs.overflow !== '';
    const bgImg = cs.backgroundImage && cs.backgroundImage !== 'none';
    if (bgA > 0 || borders.length || rec.sh || rec.bf || bgImg || replaced || clips) rec.r = CORNERS.map((c) => cs.getPropertyValue(`border-${c}-radius`));
    if (bgImg && /gradient/.test(cs.backgroundImage)) rec.gr = cs.backgroundImage.slice(0, 160);
  };

  const out = [];
  const stats = { visited: 0, visible: 0, ignored: 0, pseudo: 0 };
  const ignoredHits = {};

  const visitSvg = (el) => {
    // Inside SVG only text is audited; foreignObject switches back to HTML.
    for (const ch of el.children) {
      stats.visited++;
      const cs = getComputedStyle(ch);
      if (cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      const ig = ignoredBy(ch);
      if (ig) {
        stats.ignored++;
        ignoredHits[ig] = (ignoredHits[ig] || 0) + 1;
        continue;
      }
      if (ch.localName === 'foreignObject') {
        for (const h of ch.children) visit(h);
        continue;
      }
      if (SVG_TEXT.has(ch.localName) && ownText(ch) && cs.visibility === 'visible' && boxOf(ch)) {
        stats.visible++;
        const fill = cs.fill && /^(rgb|#|color|oklch|oklab|lab|lch|hsl)/.test(cs.fill) ? 'fill' : 'color';
        out.push({ p: pathOf(ch), f: fontOf(cs, fill) });
      }
      visitSvg(ch);
    }
  };

  const visit = (el) => {
    stats.visited++;
    const tag = el.localName;
    if (SKIP.has(tag)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || parseFloat(cs.opacity) === 0 || cs.contentVisibility === 'hidden') return;
    const ig = ignoredBy(el);
    if (ig) {
      stats.ignored++;
      ignoredHits[ig] = (ignoredHits[ig] || 0) + 1;
      return;
    }
    const isSvgRoot = tag === 'svg';
    const r = cs.display === 'contents' ? null : boxOf(el);
    if (r && cs.visibility === 'visible') {
      stats.visible++;
      const rec = { p: pathOf(el) };
      const formControl = (tag === 'input' && !NO_HEIGHT_INPUT.test(el.type)) || tag === 'textarea' || tag === 'select';
      if (!isSvgRoot && (opts.textScope === 'all' || ownText(el) || formControl)) rec.f = fontOf(cs, 'color');
      boxProps(cs, rec, /^(img|video|iframe|picture)$/.test(tag));
      if (matches(el, CONTROL)) {
        const inlineLink = tag === 'a' && cs.display === 'inline';
        const skipInput = tag === 'input' && NO_HEIGHT_INPUT.test(el.type);
        if (!inlineLink && !skipInput) rec.h = Math.round(r.height * 100) / 100;
      }
      if (Object.keys(rec).length > 1) out.push(rec);
      if (!isSvgRoot)
        for (const pe of ['::before', '::after']) {
          const ps = getComputedStyle(el, pe);
          const content = ps.content;
          if (!content || content === 'none' || content === 'normal' || ps.display === 'none' || ps.visibility !== 'visible' || parseFloat(ps.opacity) === 0) continue;
          const prec = { p: pathOf(el) + pe };
          if (/^".+"$/.test(content)) prec.f = fontOf(ps, 'color');
          boxProps(ps, prec, false);
          const w = parseFloat(ps.width), h = parseFloat(ps.height);
          if (w === 0 || h === 0) delete prec.bg, delete prec.r;
          if (Object.keys(prec).length > 1) {
            stats.pseudo++;
            out.push(prec);
          }
        }
    }
    if (isSvgRoot) visitSvg(el);
    else for (const ch of el.children) visit(ch);
  };
  visit(doc);

  // Landmarks: key computed styles of every visible instance.
  const landmarks = {};
  for (const [name, sel] of opts.landmarks) {
    let els = [];
    try {
      els = [...document.querySelectorAll(sel)];
    } catch {}
    const rows = [];
    for (const el of els) {
      const vis = el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }) : true;
      const r = el.getBoundingClientRect();
      if (!vis || !(r.width > 0 && r.height > 0)) continue;
      const cs = getComputedStyle(el);
      rows.push({
        p: pathOf(el),
        height: Math.round(r.height * 10) / 10,
        padding: SIDES.map((s) => cs.getPropertyValue(`padding-${s}`)),
        ff: cs.fontFamily,
        fs: cs.fontSize,
        fw: cs.fontWeight,
        color: cs.color,
        bg: cs.backgroundColor,
        border: SIDES.map((s) => [cs.getPropertyValue(`border-${s}-width`), cs.getPropertyValue(`border-${s}-style`), cs.getPropertyValue(`border-${s}-color`)]),
        radius: CORNERS.map((c) => cs.getPropertyValue(`border-${c}-radius`)),
        shadow: cs.boxShadow,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
      });
    }
    landmarks[name] = { selector: sel, matched: els.length, rows };
  }

  const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/^['"]|['"]$/g, '')} ${f.weight}`))];
  return { elements: out, stats, ignoredHits, landmarks, fonts };
}

// ---------------------------------------------------------------- checks

function loadAllowlist(file) {
  if (!fs.existsSync(file)) throw new Error(`Allow-list not found: ${file} (pass --allowlist <path>)`);
  const a = JSON.parse(fs.readFileSync(file, 'utf8'));
  const colors = a.colors ?? {};
  const parseList = (l) => (l ?? []).map((c) => parseColor(c)).filter(Boolean);
  const shadows = (a.shadows ?? []).map((s) => ({ raw: s, layers: parseShadow(s) }));
  for (const s of shadows) if (!s.layers) console.warn(`warning: allow-list shadow not understood: ${s.raw}`);
  return {
    raw: a,
    fonts: (a.fonts ?? []).map((f) => firstFamily(f).toLowerCase()),
    fontSizes: (a.fontSizes ?? []).map(Number),
    fontWeights: (a.fontWeights ?? []).map(Number),
    text: parseList(colors.text),
    background: parseList(colors.background),
    border: parseList(colors.border),
    allowAlpha: Boolean(colors.allowAlpha),
    radii: a.radii ?? [],
    shadows: shadows.filter((s) => s.layers),
    controlHeights: (a.controlHeights ?? []).map(Number),
    backdropFilters: a.backdropFilters ?? null,
    ignore: [...new Set(['canvas', ...(a.ignore ?? [])])],
  };
}

/** Turns one collected element into [{prop, value, allowed}] checks. */
function checksFor(rec, A) {
  const out = [];
  if (rec.f) {
    const fam = firstFamily(rec.f.ff);
    out.push({ prop: 'font-family', value: fam, allowed: A.fonts.includes(fam.toLowerCase()) });
    const fs = parseFloat(rec.f.fs);
    out.push({ prop: 'font-size', value: `${Math.round(fs * 100) / 100}px`, allowed: nearIn(fs, A.fontSizes) });
    const fw = Number(rec.f.fw);
    out.push({ prop: 'font-weight', value: String(fw), allowed: A.fontWeights.includes(fw) });
    const c = parseColor(rec.f.c);
    if (!c || c.a > 0) out.push({ prop: 'color', value: normColor(rec.f.c), allowed: !!c && colorAllowed(c, A.text, A.allowAlpha) });
  }
  if (rec.bg) {
    const c = parseColor(rec.bg);
    out.push({ prop: 'background-color', value: normColor(rec.bg), allowed: !!c && colorAllowed(c, A.background, A.allowAlpha) });
  }
  for (const b of rec.bc ?? []) {
    const c = parseColor(b);
    out.push({ prop: 'border-color', value: normColor(b), allowed: !!c && colorAllowed(c, A.border, A.allowAlpha) });
  }
  if (rec.r) {
    const corners = rec.r.map(normCorner);
    const value = corners.every((c) => c === corners[0]) ? corners[0] : corners.join(' / ');
    out.push({ prop: 'border-radius', value, allowed: corners.every((c) => cornerAllowed(c, A.radii)) });
  }
  if (rec.sh) {
    const layers = parseShadow(rec.sh);
    out.push({ prop: 'box-shadow', value: layers ? fmtShadow(layers) : rec.sh, allowed: !!layers && A.shadows.some((s) => shadowEqual(layers, s.layers)) });
  }
  if (rec.bf) out.push({ prop: 'backdrop-filter', value: rec.bf, allowed: A.backdropFilters ? A.backdropFilters.includes(rec.bf) : true, unchecked: !A.backdropFilters });
  if (rec.gr) out.push({ prop: 'background-image', value: rec.gr, allowed: true, unchecked: true });
  if (rec.h !== undefined) out.push({ prop: 'control-height', value: `${rec.h}px`, allowed: nearIn(rec.h, A.controlHeights) });
  return out;
}

// Landmark rows -> a flat {prop: value} of normalized key styles.
function landmarkStyle(name, row) {
  const side = (i) => {
    const [w, st, c] = row.border[i];
    return parseFloat(w) > 0 && st !== 'none' && st !== 'hidden' ? `${w} ${st} ${normColor(c)}` : 'none';
  };
  const borders = [0, 1, 2, 3].map(side);
  const corners = row.radius.map(normCorner);
  const pad = row.padding.map((p) => p.replace(/\.\d+px$/, (m) => `${Math.round(parseFloat(m) * 10) / 10}px`));
  const sh = parseShadow(row.shadow);
  const s = {
    'font-family': firstFamily(row.ff),
    'font-size': row.fs,
    'font-weight': row.fw,
    color: normColor(row.color),
    'background-color': normColor(row.bg),
    border: borders.every((b) => b === borders[0]) ? borders[0] : borders.join(' / '),
    'border-radius': corners.every((c) => c === corners[0]) ? corners[0] : corners.join(' / '),
    'box-shadow': sh ? fmtShadow(sh) : row.shadow,
    'backdrop-filter': row.backdrop,
    padding: pad.join(' '),
  };
  if (HEIGHT_LANDMARKS.has(name)) s.height = `${row.height}px`;
  return s;
}

// ---------------------------------------------------------------- report

const md = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (s) => '`' + String(s).replace(/`/g, "'") + '`';

function topValues(map, n = 3) {
  const e = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const shown = e.slice(0, n).map(([v, c]) => (e.length > 1 ? `${v} (${c})` : v));
  return shown.join('<br>') + (e.length > n ? `<br>+${e.length - n} more` : '');
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { booleans: ['headful', 'verbose', 'help', 'fail-on-violations'], multi: ['query'] });
  if (args.help) return console.log(USAGE), 0;
  const opts = commonOptions(args);
  const allowFile = path.resolve(args.allowlist ?? DEFAULT_ALLOWLIST);
  const A = loadAllowlist(allowFile);
  const landmarkList = (args.landmarks ? args.landmarks.split(',').map((x) => x.trim()).filter(Boolean) : DEFAULT_LANDMARKS).map((l) =>
    /^[a-z0-9-]+$/i.test(l) ? [l, `[data-ui="${l}"]`] : [l, l],
  );
  const textScope = args['text-scope'] === 'all' ? 'all' : 'own';
  const maxRows = Number(args['max-rows'] ?? 80);
  fs.mkdirSync(opts.out, { recursive: true });
  const t0 = Date.now();
  const pages = [];
  const collectSrc = `(${collectStyles.toString()})(${JSON.stringify({ ignore: A.ignore, landmarks: landmarkList, textScope })})`;

  const run = await runMatrix(opts, {
    capture: async (page, ctx) => {
      ctx.data = await page.evaluate(collectSrc, { timeoutMs: 120000 });
    },
    done: (ctx) => {
      const p = {
        view: ctx.view,
        state: ctx.state,
        size: ctx.size.label,
        url: ctx.url,
        error: ctx.error ?? null,
        notes: ctx.ready?.notes ?? [],
        ms: ctx.ms,
        stats: ctx.data?.stats ?? null,
        ignoredHits: ctx.data?.ignoredHits ?? {},
        fonts: ctx.data?.fonts ?? [],
        consoleErrors: ctx.diag.consoleErrors.length,
        exceptions: ctx.diag.exceptions.length,
        checks: new Map(),
        landmarks: ctx.data?.landmarks ?? {},
      };
      for (const rec of ctx.data?.elements ?? [])
        for (const c of checksFor(rec, A)) {
          const k = `${rec.p}\u0000${c.prop}\u0000${c.value}`;
          const cur = p.checks.get(k) ?? { path: rec.p, prop: c.prop, value: c.value, allowed: c.allowed, unchecked: !!c.unchecked, count: 0 };
          cur.count++;
          p.checks.set(k, cur);
        }
      pages.push(p);
      const off = [...p.checks.values()].filter((c) => !c.allowed);
      const offCount = off.reduce((n, c) => n + c.count, 0);
      const lm = Object.entries(p.landmarks).filter(([, v]) => v.rows.length).map(([k]) => k);
      console.log(
        `[${ctx.index}/${ctx.total}] ${ctx.error ? 'FAIL' : 'ok  '} ${ctx.view.padEnd(9)} ${ctx.state.padEnd(8)} ${ctx.size.label.padEnd(9)} ` +
          `${(ctx.ms / 1000).toFixed(1).padStart(5)}s  ${String(p.stats?.visible ?? 0).padStart(4)} visible elements, ` +
          `${off.length} off-list (selector, property, value) combos on ${offCount} element-properties; landmarks: ${lm.length ? lm.join(' ') : 'none'}` +
          (ctx.error ? `\n      ${ctx.error}` : '') +
          (p.notes.length ? `  [${p.notes.join('; ')}]` : ''),
      );
    },
  });

  // ---- aggregate
  const screens = opts.views;
  const violations = new Map(); // screen|state|path|prop|value -> {count, sizes}
  const distinct = new Map(); // screen -> prop -> value -> {count, allowed, states}
  for (const p of pages)
    for (const c of p.checks.values()) {
      if (!c.allowed) {
        const k = [p.view, p.state, c.path, c.prop, c.value].join('\u0000');
        const v = violations.get(k) ?? { screen: p.view, state: p.state, path: c.path, prop: c.prop, value: c.value, count: 0, sizes: [] };
        v.count = Math.max(v.count, c.count);
        if (!v.sizes.includes(p.size)) v.sizes.push(p.size);
        violations.set(k, v);
      }
    }
  for (const p of pages) {
    const perPage = new Map(); // prop|value -> count on this page
    for (const c of p.checks.values()) {
      const k = `${c.prop}\u0000${c.value}`;
      const cur = perPage.get(k) ?? { prop: c.prop, value: c.value, allowed: c.allowed, unchecked: c.unchecked, count: 0 };
      cur.count += c.count;
      perPage.set(k, cur);
    }
    const byProp = distinct.get(p.view) ?? new Map();
    distinct.set(p.view, byProp);
    for (const c of perPage.values()) {
      const vals = byProp.get(c.prop) ?? new Map();
      byProp.set(c.prop, vals);
      const cur = vals.get(c.value) ?? { value: c.value, allowed: c.allowed, unchecked: c.unchecked, count: 0, states: [] };
      cur.count = Math.max(cur.count, c.count);
      if (!cur.states.includes(p.state)) cur.states.push(p.state);
      vals.set(c.value, cur);
    }
  }

  // Cross-screen landmark comparison, per size, over all states.
  const comparison = {};
  for (const size of opts.sizes.map((s) => s.label)) {
    const perLandmark = {};
    for (const [name, sel] of landmarkList) {
      const perScreen = {};
      for (const p of pages.filter((x) => x.size === size)) {
        const lm = p.landmarks[name];
        if (!lm || !lm.rows.length) continue;
        const sc = (perScreen[p.view] ??= { instances: 0, props: {} });
        sc.instances += lm.rows.length;
        for (const row of lm.rows)
          for (const [prop, val] of Object.entries(landmarkStyle(name, row))) {
            const m = (sc.props[prop] ??= new Map());
            m.set(val, (m.get(val) ?? 0) + 1);
          }
      }
      const present = Object.keys(perScreen);
      const props = [...new Set(present.flatMap((s) => Object.keys(perScreen[s].props)))];
      const differs = [];
      const varies = [];
      for (const prop of props) {
        const sets = present.map((s) => [...(perScreen[s].props[prop]?.keys() ?? [])].sort().join(' | '));
        if (new Set(sets).size > 1) differs.push(prop);
        if (present.some((s) => (perScreen[s].props[prop]?.size ?? 0) > 1)) varies.push(prop);
      }
      perLandmark[name] = {
        selector: sel,
        screens: present,
        missingOn: screens.filter((s) => !present.includes(s)),
        differs,
        variesWithinScreen: varies,
        perScreen: Object.fromEntries(
          present.map((s) => [s, { instances: perScreen[s].instances, props: Object.fromEntries(Object.entries(perScreen[s].props).map(([k, m]) => [k, Object.fromEntries(m)])) }]),
        ),
      };
    }
    comparison[size] = perLandmark;
  }

  const violationList = [...violations.values()].sort((a, b) => a.screen.localeCompare(b.screen) || a.state.localeCompare(b.state) || b.count - a.count || a.prop.localeCompare(b.prop));
  const distinctOut = Object.fromEntries(
    [...distinct.entries()].map(([s, byProp]) => [
      s,
      Object.fromEntries([...byProp.entries()].map(([prop, vals]) => [prop, [...vals.values()].sort((a, b) => b.count - a.count)])),
    ]),
  );
  const summary = Object.fromEntries(
    screens.map((s) => {
      const byProp = distinct.get(s) ?? new Map();
      const off = {};
      for (const [prop, vals] of byProp) off[prop] = [...vals.values()].filter((v) => !v.allowed).length;
      return [
        s,
        {
          pages: pages.filter((p) => p.view === s).length,
          visibleElements: Math.max(0, ...pages.filter((p) => p.view === s).map((p) => p.stats?.visible ?? 0)),
          violations: violationList.filter((v) => v.screen === s).length,
          offListDistinctValues: off,
        },
      ];
    }),
  );

  const report = {
    tool: 'audit',
    base: opts.base,
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
    chrome: run.chrome,
    allowlist: allowFile,
    textScope,
    states: run.states,
    sizes: opts.sizes.map((s) => s.label),
    query: opts.query,
    landmarks: Object.fromEntries(landmarkList),
    pages: pages.map(({ checks, landmarks, ...p }) => ({
      ...p,
      landmarksFound: Object.fromEntries(Object.entries(landmarks).map(([k, v]) => [k, v.rows.length])),
    })),
    summary,
    violations: violationList,
    distinct: distinctOut,
    comparison,
  };
  fs.writeFileSync(path.join(opts.out, 'audit.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(opts.out, 'audit.md'), renderMarkdown(report, { screens, maxRows }));

  const failed = pages.filter((p) => p.error).length;
  const totalViolations = violationList.length;
  const flagged = Object.values(comparison).flatMap((c) => Object.entries(c).filter(([, v]) => v.differs.length).map(([k]) => k));
  console.log(
    `\nAudited ${pages.length - failed}/${pages.length} pages in ${((Date.now() - t0) / 1000).toFixed(0)} s. ` +
      `${totalViolations} off-list (screen, state, selector, property, value) entries. ` +
      `Landmarks differing across screens: ${flagged.length ? [...new Set(flagged)].join(', ') : 'none'}.\n` +
      `Report: ${rel(path.join(opts.out, 'audit.md'))} (+ audit.json)`,
  );
  if (failed) return 2;
  return args['fail-on-violations'] && totalViolations > 0 ? 1 : 0;
}

function renderMarkdown(r, { screens, maxRows }) {
  const L = [];
  const props = ['font-family', 'font-size', 'font-weight', 'color', 'background-color', 'border-color', 'border-radius', 'box-shadow', 'control-height'];
  L.push('# Style uniformity audit', '');
  L.push(`- Server: ${r.base} · Chrome ${r.chrome} · ${new Date(r.startedAt).toLocaleString()} · ${(r.durationMs / 1000).toFixed(0)} s`);
  L.push(`- Allow-list: ${code(r.allowlist)}`);
  L.push(`- Pages: ${r.pages.length} (${screens.length} screens × ${Object.keys(r.states).length} states × ${r.sizes.length} sizes: ${r.sizes.join(', ')})`);
  for (const [s, st] of Object.entries(r.states))
    L.push(`- State ${code(s)}: ${(st.steps ?? [st.note]).join(' → ')}; disaster ${st.disasterActive ? 'active' : 'none'}, clock +${st.clockOffsetMin} min`);
  const bad = r.pages.filter((p) => p.error || p.notes.length);
  for (const p of bad) L.push(`- **${p.view} ${p.state} ${p.size}**: ${p.error ?? ''} ${p.notes.join('; ')}`);
  L.push(
    '',
    `Text properties (font-*, color) are checked on elements that render their own text${r.textScope === 'own' ? ' (own text nodes, form fields, SVG text)' : ' and on every element (--text-scope all)'}. ` +
      'Radius is checked where it is visible (filled, bordered, shadowed, blurred, clipping or replaced boxes). Control height covers buttons, links styled as blocks, fields, tabs, switches and role=button (not checkboxes, radios or inline links). ' +
      'Counts are elements per page (max over states and sizes). Colors are `#rrggbb` or `#rrggbb/alpha`; the allow-list accepts alpha variants when `allowAlpha` is true.',
    '',
  );

  L.push('## Summary', '');
  L.push('| Screen | Visible elements | Off-list entries | ' + props.map((p) => p.replace('background-color', 'bg').replace('border-', 'border ')).join(' | ') + ' |');
  L.push('|---|---:|---:|' + props.map(() => '---:').join('|') + '|');
  for (const s of screens) {
    const sm = r.summary[s];
    L.push(`| ${s} | ${sm.visibleElements} | ${sm.violations} | ` + props.map((p) => sm.offListDistinctValues[p] ?? 0).join(' | ') + ' |');
  }
  L.push('', 'Per-property columns count distinct off-list values on that screen.', '');

  // Cross-screen comparison
  L.push('## Cross-screen comparison (landmarks)', '');
  const sizes = Object.keys(r.comparison);
  for (const [i, size] of sizes.entries()) {
    const comp = r.comparison[size];
    const found = Object.entries(comp).filter(([, v]) => v.screens.length);
    const missing = Object.entries(comp).filter(([, v]) => !v.screens.length).map(([k]) => k);
    L.push(`### At ${size}`, '');
    if (!found.length) L.push(`No landmark was found on any screen (looked for ${Object.values(r.landmarks).map(code).join(', ')}).`, '');
    else {
      const flagged = found.filter(([, v]) => v.differs.length);
      L.push(flagged.length ? `**Differs between screens:** ${flagged.map(([k, v]) => `${code(k)} (${v.differs.join(', ')})`).join('; ')}` : 'All found landmarks render the same on every screen where they appear.', '');
      if (missing.length) L.push(`Not found on any screen: ${missing.map(code).join(', ')}.`, '');
      if (i > 0) continue; // full tables for the first size only
      for (const [name, v] of found) {
        L.push(`#### ${name} ${v.differs.length ? '— DIFFERS' : '— consistent'}`, '');
        L.push(`Selector ${code(v.selector)}. Present on ${v.screens.join(', ')}${v.missingOn.length ? `; missing on ${v.missingOn.join(', ')}` : ''}.` + (v.variesWithinScreen.length ? ` Varies within a screen: ${v.variesWithinScreen.join(', ')}.` : ''), '');
        L.push('| Property | ' + v.screens.map((s) => `${s} (${v.perScreen[s].instances})`).join(' | ') + ' |');
        L.push('|---|' + v.screens.map(() => '---').join('|') + '|');
        const allProps = [...new Set(v.screens.flatMap((s) => Object.keys(v.perScreen[s].props)))];
        for (const prop of allProps) {
          const cells = v.screens.map((s) => md(topValues(new Map(Object.entries(v.perScreen[s].props[prop] ?? {})))));
          L.push(`| ${v.differs.includes(prop) ? `**${prop}** ≠` : prop} | ${cells.join(' | ')} |`);
        }
        L.push('');
      }
    }
  }

  // Distinct values per screen
  L.push('## Distinct values per screen', '');
  for (const s of screens) {
    const d = r.distinct[s];
    if (!d) continue;
    L.push(`### ${s}`, '');
    L.push('| Property | Allowed values used | Off-list values |');
    L.push('|---|---|---|');
    for (const prop of [...props, 'backdrop-filter', 'background-image']) {
      const vals = d[prop];
      if (!vals) continue;
      const short = (s) => (s.length > 90 ? s.slice(0, 90) + '…' : s);
      const fmt = (v) => `${code(short(v.value))} ×${v.count}${v.states.length < Object.keys(r.states).length ? ` (${v.states.join(',')})` : ''}`;
      const ok = vals.filter((v) => v.allowed);
      const off = vals.filter((v) => !v.allowed);
      const cap = (arr) => md(arr.slice(0, 12).map(fmt).join(', ') + (arr.length > 12 ? `, +${arr.length - 12} more` : ''));
      L.push(`| ${prop}${vals[0]?.unchecked ? ' (not in allow-list)' : ''} | ${cap(ok) || '—'} | ${cap(off) || '—'} |`);
    }
    const fonts = [...new Set(r.pages.filter((p) => p.view === s).flatMap((p) => p.fonts))];
    L.push('', `Web fonts loaded: ${fonts.length ? fonts.join(', ') : 'none'}.`, '');
  }

  // Violations
  L.push('## Violations by screen', '');
  for (const s of screens) {
    const vs = r.violations.filter((v) => v.screen === s);
    L.push(`### ${s} (${vs.length})`, '');
    if (!vs.length) {
      L.push('None.', '');
      continue;
    }
    L.push('| State | Selector | Property | Value | Count |');
    L.push('|---|---|---|---|---:|');
    for (const v of vs.slice(0, maxRows)) L.push(`| ${v.state} | ${code(md(v.path))} | ${v.prop} | ${code(md(v.value))} | ${v.count} |`);
    if (vs.length > maxRows) L.push('', `…and ${vs.length - maxRows} more in audit.json.`);
    L.push('');
  }
  return L.join('\n') + '\n';
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`audit: ${e.stack ?? e.message}`);
    process.exit(2);
  },
);
