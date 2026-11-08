#!/usr/bin/env node
// Renders the graph orbs to transparent PNGs in src/assets/orbs/ (Orb.tsx picks
// them up automatically). No dependencies: a small per-pixel shader plus a PNG
// encoder. Each orb is a glossy resin sphere lit by a studio softbox, sitting in
// a machined metal bezel. Run: node scripts/render-orbs.mjs [kind ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/orbs');

// ---------- PNG ----------
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC[(c ^ b) & 255] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePNG(w, h, px) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 4; // Paeth
    for (let i = 0; i < stride; i++) {
      const cur = px[y * stride + i];
      const a = i >= 4 ? px[y * stride + i - 4] : 0;
      const b = y ? px[(y - 1) * stride + i] : 0;
      const c = i >= 4 && y ? px[(y - 1) * stride + i - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[o + 1 + i] = (cur - pred) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const norm = ([x, y, z]) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; // sRGB -> linear
  });
};
const toSRGB = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
// Photographic shoulder: linear until 0.62, then rolls off to 1 so highlights
// bloom to white instead of clipping into flat discs.
const shoulder = (x) => (x < 0.62 ? x : 0.62 + 0.38 * (1 - Math.exp(-(x - 0.62) / 0.38)));
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- studio environment (y up, z toward the viewer) ----------
function frame(dir) {
  const k = norm(dir);
  const u = norm(cross([0, 1, 0], k));
  const v = cross(k, u);
  return { k, u, v };
}
const KEY = frame([-0.5, 0.66, 0.56]); // large softbox, top left
const FILL = frame([0.86, 0.1, 0.5]); // thin strip, right
const KICK = frame([0.2, -0.85, 0.48]); // low bounce card
const FRONT = frame([0.05, 0.3, 1]); // big dim diffuser behind the camera
function softbox(R, f, hw, hh, round, soft, gain) {
  const c = dot(R, f.k);
  if (c <= 0.05) return 0;
  const a = Math.abs(dot(R, f.u) / c);
  const b = Math.abs(dot(R, f.v) / c);
  // rounded-rectangle distance
  const qx = a - (hw - round);
  const qy = b - (hh - round);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - round;
  const inside = 1 - smooth(-soft, soft, d);
  const falloff = 1 - 0.35 * clamp(Math.hypot(a / hw, b / hh)); // brighter middle
  return inside * falloff * gain;
}
function env(R) {
  const sky = 0.012 + 0.05 * smooth(-0.3, 1, R[1]);
  const key = softbox(R, KEY, 0.6, 0.36, 0.16, 0.09, 7.5);
  const front = softbox(R, FRONT, 0.95, 0.55, 0.3, 0.35, 0.3);
  const fill = softbox(R, FILL, 0.12, 0.42, 0.1, 0.06, 1.6);
  const kick = softbox(R, KICK, 0.55, 0.12, 0.1, 0.12, 0.35);
  const l = sky + key + fill + kick + front;
  return [l * 1.0, l * 0.995, l * 0.985];
}

// ---------- orb looks ----------
// body: resin color; deep: the shadowed tint; glow: light carried inside the sphere
const KINDS = {
  sun: { body: '#c58a32', deep: '#2e1803', glow: '#ffd27a', metal: '#b9a27a', halo: '#f2b85c', haloA: 0.5, corona: true },
  rose: { body: '#c64f72', deep: '#2e0614', glow: '#ff9fbb', metal: '#9a9a9c', halo: '#ff8fae', haloA: 0.1 },
  violet: { body: '#7158d0', deep: '#140a3a', glow: '#c4b2ff', metal: '#9a9a9c', halo: '#a48bff', haloA: 0.2 },
  mint: { body: '#2f9e76', deep: '#032016', glow: '#8ff0c8', metal: '#9a9a9c', halo: '#5fe0b0', haloA: 0.14 },
  sky: { body: '#3f7fcc', deep: '#061a36', glow: '#a9d4ff', metal: '#9a9a9c', halo: '#7cc0ff', haloA: 0.16 },
  amber: { body: '#d08a26', deep: '#331a02', glow: '#ffd27a', metal: '#a59a88', halo: '#ffc861', haloA: 0.26 },
  ember: { body: '#d42f4b', deep: '#33030c', glow: '#ff8c9f', metal: '#a49595', halo: '#ff5d74', haloA: 0.26 },
  focus: { body: '#7a62d6', deep: '#160b3c', glow: '#cbb9ff', metal: '#9a9a9c', halo: '#b8a2ff', haloA: 0.16 },
  slate: { body: '#6d7a80', deep: '#111619', glow: '#c9d3d6', metal: '#8b8f92', halo: '#8fa0a6', haloA: 0.08 },
};

// Layout in frame units (frame half-size = 1). The sphere radius is RS so the
// app can map its layout radius onto it (see SPHERE in Orb.tsx).
const RS = 0.62;
const RB0 = 0.655; // bezel inner edge
const RB1 = 0.75; // bezel outer edge

function shadeSphere(x, y, k, look) {
  const d2 = x * x + y * y;
  const z = Math.sqrt(Math.max(0, RS * RS - d2));
  const n = [x / RS, y / RS, z / RS];
  const nv = n[2];
  const L = norm([-0.5, 0.62, 0.6]);
  const wrap = Math.max(0, (dot(n, L) + 0.2) / 1.2);
  const amb = 0.05 + 0.07 * (n[1] * 0.5 + 0.5);
  // light scattered inside the resin collects opposite the key light
  const gx = 0.24 * RS, gy = -0.46 * RS;
  const g = Math.exp(-((x - gx) ** 2 + (y - gy) ** 2) / (0.5 * RS) ** 2) * smooth(0, 0.6, nv);
  const limb = 0.35 + 0.65 * nv ** 0.7;
  const body = [0, 1, 2].map((i) => {
    const lit = k.body[i] * (amb + 1.1 * wrap);
    const dark = (1 - wrap) ** 1.5 * 0.85;
    const base = lit * (1 - dark) + k.deep[i] * dark;
    return (base + k.glow[i] * 1.1 * g) * limb;
  });
  // clear coat
  const F = 0.04 + 0.96 * (1 - nv) ** 5;
  const R = [2 * nv * n[0], 2 * nv * n[1], 2 * nv * n[2] - 1];
  const e = env(R);
  // colored rim from light passing through the far side
  const rimDir = norm([0.62, -0.58, -0.15]);
  const rim = (1 - nv) ** 2.6 * Math.max(0, dot(n, rimDir)) * 1.6;
  return [0, 1, 2].map((i) => body[i] * (1 - F) + e[i] * (F + 0.015) + k.glow[i] * rim);
}

function shadeBezel(x, y, rho, k) {
  const mid = (RB0 + RB1) / 2;
  const half = (RB1 - RB0) / 2;
  const t = clamp((rho - mid) / half, -1, 1);
  const nr = t * 0.96; // rounded, like a polished torus
  const nz = Math.sqrt(Math.max(0, 1 - nr * nr));
  const n = [(nr * x) / rho, (nr * y) / rho, nz];
  const R = [2 * nz * n[0], 2 * nz * n[1], 2 * nz * n[2] - 1];
  const e = env(R);
  // brushed metal: faint circular streaks
  const ang = Math.atan2(y, x);
  const brush = 0.92 + 0.08 * Math.sin(ang * 90 + hash(Math.floor(rho * 900)) * 6.28);
  const ao = 0.35 + 0.65 * smooth(-1, -0.35, t); // darker where the sphere sits
  return [0, 1, 2].map((i) => (k.metal[i] * e[i] * 1.15 * brush + 0.006) * ao);
}

function render(kind, size, { bezel = true, ss = 4, corona = false, only = false } = {}) {
  const look = KINDS[kind];
  const k = {
    body: hex(look.body),
    deep: hex(look.deep),
    glow: hex(look.glow),
    metal: hex(look.metal),
    halo: hex(look.halo),
  };
  const px = new Uint8ClampedArray(size * size * 4);
  const coronaN = 300;
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((pxl + (sx + 0.5) / ss) / size) * 2 - 1;
          const y = -(((py + (sy + 0.5) / ss) / size) * 2 - 1);
          const rho = Math.hypot(x, y);
          let c = null;
          let a = 0;
          if (only) {
            // corona layer only (handled below)
          }
          if (!only && rho <= RS) {
            c = shadeSphere(x, y, k, look);
            a = 1;
          } else if (!only && bezel && rho < RB0) {
            const t = (rho - RS) / (RB0 - RS);
            c = [0.003 + 0.01 * t, 0.003 + 0.01 * t, 0.004 + 0.01 * t];
            a = 1;
          } else if (!only && bezel && rho <= RB1) {
            c = shadeBezel(x, y, rho, k);
            a = 1;
          } else {
            // outside: contact shadow plus a tight color halo, and the sun's corona
            const edge = bezel ? RB1 : RS;
            const sh = bezel && !only ? 0.6 * (1 - smooth(edge, edge + 0.12, rho)) : 0;
            const h = (only ? 0 : 1) * look.haloA * Math.exp(-(((rho - edge) / (look.corona ? 0.2 : 0.09)) ** 2) * 1.2);
            let lr = k.halo[0] * h, lg = k.halo[1] * h, lb = k.halo[2] * h;
            if (corona) {
              const ang = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
              const fi = ang * coronaN;
              const i = Math.round(fi);
              const len = 0.06 + 0.17 * hash(i) ** 1.6;
              const w = 0.5 * (0.6 + hash(i + 7));
              const off = Math.abs(fi - i) / w;
              const r0 = edge + 0.015;
              const along = rho > r0 ? 1 - smooth(r0 + len * 0.15, r0 + len, rho) : 0;
              const fil = Math.exp(-off * off * 3) * along * (0.45 + 0.9 * hash(i + 3));
              const warm = hash(i + 11) > 0.7 ? [1, 0.93, 0.78] : [1, 0.74, 0.38];
              lr += warm[0] * fil * 0.9;
              lg += warm[1] * fil * 0.9;
              lb += warm[2] * fil * 0.9;
            }
            // light over a shadow: premultiplied black with alpha `sh`, then add light
            const la = Math.max(lr, lg, lb);
            a = clamp(sh + la);
            c = a > 0 ? [lr / a, lg / a, lb / a] : [0, 0, 0];
          }
          if (a > 0) {
            const t = c.map((v) => toSRGB(clamp(shoulder(v))));
            pr += t[0] * a;
            pg += t[1] * a;
            pb += t[2] * a;
            pa += a;
          }
        }
      }
      const n = ss * ss;
      const A = pa / n;
      const o = (py * size + pxl) * 4;
      const dither = () => (hash(o * 0.37 + pr) - 0.5) / 255;
      if (A > 0) {
        px[o] = Math.round(clamp(pr / pa + dither()) * 255);
        px[o + 1] = Math.round(clamp(pg / pa + dither()) * 255);
        px[o + 2] = Math.round(clamp(pb / pa + dither()) * 255);
      }
      px[o + 3] = Math.round(clamp(A + dither() * 0.5) * 255);
    }
  }
  return encodePNG(size, size, px);
}

// Film grain tile for the background (overlay blend). Gaussian noise with a
// light wrap-around blur so it reads as photographic grain, not digital static.
function grain(size) {
  let seed = 20261108;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const px = new Uint8ClampedArray(size * size * 4);
  const at = (x, y) => g[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = (4 * at(x, y) + 2 * (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) + at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) / 16;
      const v = Math.round(clamp(0.5 + s * 0.42) * 255);
      const o = (y * size + x) * 4;
      px[o] = px[o + 1] = px[o + 2] = v;
      px[o + 3] = 255;
    }
  }
  return encodePNG(size, size, px);
}

mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const jobs = [
  ['sun', 384, { bezel: true }],
  ['sun-corona', 512, { only: true, corona: true }],
  ['focus', 384, { bezel: true }],
  ...['rose', 'violet', 'mint', 'sky', 'amber', 'ember', 'slate'].map((k) => [k, 256, { bezel: true }]),
  ...['violet', 'mint', 'sky', 'amber', 'ember', 'slate'].map((k) => [`${k}-bare`, 160, { bezel: false }]),
];
for (const [name, size, opt] of jobs) {
  const kind = name.replace(/-(bare|corona)$/, '');
  if (want.length && !want.includes(name) && !want.includes(kind)) continue;
  const t = Date.now();
  writeFileSync(path.join(OUT, `${name}.png`), render(kind, size, opt));
  console.log(`${name}.png ${size}px ${Date.now() - t}ms`);
}
if (!want.length || want.includes('grain')) {
  writeFileSync(path.resolve(OUT, '../grain.png'), grain(256));
  console.log('grain.png 256px');
}
