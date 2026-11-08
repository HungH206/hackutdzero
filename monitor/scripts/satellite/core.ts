// Numeric core of the satellite painter: seeded randomness, noise, colour,
// the G-buffer ("plate") and its rasterisers, a PNG writer. Everything here is
// deterministic and depends only on the world position it is asked about, so a
// crop renders exactly the same pixels as the whole site does.
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

export const DEG = Math.PI / 180;
export const sat = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => {
  const t = sat((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------- colour: hex palette in sRGB, everything painted in linear light ----------
export type RGB = readonly [number, number, number];
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export function hex(s: string): RGB {
  const n = parseInt(s.slice(1), 16);
  return [toLin(((n >> 16) & 255) / 255), toLin(((n >> 8) & 255) / 255), toLin((n & 255) / 255)];
}
export const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

// ---------- randomness ----------
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)] as T;
  }
  gauss() {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 0.7;
  }
}

export const hash2 = (ix: number, iz: number) => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- value noise on a 1024-square lattice ----------
const N = 1024;
const MASK = N - 1;
const LAT = new Float32Array(N * N);
{
  const r = new Rng(0x5eed1234);
  for (let i = 0; i < LAT.length; i++) LAT[i] = r.next();
}
export function vn(x: number, z: number): number {
  const fx0 = Math.floor(x);
  const fz0 = Math.floor(z);
  const fx = x - fx0;
  const fz = z - fz0;
  const xi = fx0 & MASK;
  const zi = fz0 & MASK;
  const xj = (xi + 1) & MASK;
  const zj = (zi + 1) & MASK;
  const a = LAT[zi * N + xi] as number;
  const b = LAT[zi * N + xj] as number;
  const c = LAT[zj * N + xi] as number;
  const d = LAT[zj * N + xj] as number;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** fractal value noise in 0..1; x and z in noise cells */
export function fbm(x: number, z: number, oct = 4): number {
  let s = 0;
  let a = 0.5;
  let w = 0;
  for (let i = 0; i < oct; i++) {
    s += vn(x + i * 37.3, z - i * 91.1) * a;
    w += a;
    a *= 0.5;
    x = x * 2.03 + 11.7;
    z = z * 2.03 - 4.1;
  }
  return s / w;
}
/** 0 on ridge lines, used for cracks and worn lines */
export function ridge(x: number, z: number, oct = 3): number {
  let s = 0;
  let a = 0.5;
  let w = 0;
  for (let i = 0; i < oct; i++) {
    s += Math.abs(vn(x + i * 13.7, z + i * 53.3) * 2 - 1) * a;
    w += a;
    a *= 0.5;
    x *= 2.1;
    z *= 2.1;
  }
  return s / w;
}

// per-pixel white noise, fixed in world space
const SPK_N = 4096;
const SPK = new Float32Array(SPK_N * SPK_N);
{
  const r = new Rng(0xabcdef01);
  for (let i = 0; i < SPK.length; i++) SPK[i] = r.next();
}
export const speck = (ix: number, iz: number) => SPK[(iz & (SPK_N - 1)) * SPK_N + (ix & (SPK_N - 1))] as number;

// ---------- crown-texture tile: broccoli clumps, baked once ----------
const CL_N = 2048;
const CL_PPM = 6.4;
export const CLUMP = new Float32Array(CL_N * CL_N); // height 0..1
export const CLUMPV = new Float32Array(CL_N * CL_N); // per-clump random 0..1
{
  // clumps of two sizes, each a rounded cap; the bigger one decides the colour cell
  const cell = (u: number, v: number, per: number, seed: number) => {
    const iu = Math.floor(u);
    const iv = Math.floor(v);
    let best = 0;
    let id = 0;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const cu = (((iu + a) % per) + per) % per;
        const cv = (((iv + b) % per) + per) % per;
        const px = iu + a + hash2(cu + seed, cv) * 0.9 + 0.05;
        const pz = iv + b + hash2(cu, cv + seed) * 0.9 + 0.05;
        const size = 0.72 + 0.5 * hash2(cu - seed, cv + 7);
        const d = Math.hypot(u - px, v - pz) / size;
        if (d < 1) {
          const cap = Math.sqrt(1 - d * d) * (0.72 + 0.28 * size);
          if (cap > best) {
            best = cap;
            id = hash2(cu + 3 * seed, cv - seed);
          }
        }
      }
    return { best, id };
  };
  const big = 96; // clumps per tile: 320 m / 96 = 3.3 m
  const small = 256; // 1.25 m
  for (let z = 0; z < CL_N; z++)
    for (let x = 0; x < CL_N; x++) {
      const a = cell((x / CL_N) * big, (z / CL_N) * big, big, 11);
      const b = cell((x / CL_N) * small + 3.3, (z / CL_N) * small + 1.7, small, 23);
      CLUMP[z * CL_N + x] = 0.66 * a.best + 0.34 * b.best;
      CLUMPV[z * CL_N + x] = a.id;
    }
}
export const clumpAt = (x: number, z: number) => CLUMP[(((z * CL_PPM) | 0) & (CL_N - 1)) * CL_N + (((x * CL_PPM) | 0) & (CL_N - 1))] as number;
export const clumpIdAt = (x: number, z: number) => CLUMPV[(((z * CL_PPM) | 0) & (CL_N - 1)) * CL_N + (((x * CL_PPM) | 0) & (CL_N - 1))] as number;

// ---------- plate: one set of G-buffers over a world rectangle ----------
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export class Plate {
  readonly W: number;
  readonly H: number;
  readonly ppm: number;
  readonly rect: Rect;
  /** linear albedo, 3 per pixel */
  alb: Float32Array;
  /** height in meters */
  hgt: Float32Array;
  mat: Uint8Array;
  constructor(rect: Rect, ppm: number) {
    this.rect = rect;
    this.ppm = ppm;
    this.W = Math.round((rect.x1 - rect.x0) * ppm);
    this.H = Math.round((rect.z1 - rect.z0) * ppm);
    this.alb = new Float32Array(this.W * this.H * 3);
    this.hgt = new Float32Array(this.W * this.H);
    this.mat = new Uint8Array(this.W * this.H);
  }
  ixOf(x: number) {
    return Math.ceil((x - this.rect.x0) * this.ppm - 0.5);
  }
  izOf(z: number) {
    return Math.ceil((z - this.rect.z0) * this.ppm - 0.5);
  }
  put(i: number, c: RGB, k = 1) {
    this.alb[i * 3] = c[0] * k;
    this.alb[i * 3 + 1] = c[1] * k;
    this.alb[i * 3 + 2] = c[2] * k;
  }
  mul(i: number, k: number) {
    this.alb[i * 3] = (this.alb[i * 3] as number) * k;
    this.alb[i * 3 + 1] = (this.alb[i * 3 + 1] as number) * k;
    this.alb[i * 3 + 2] = (this.alb[i * 3 + 2] as number) * k;
  }
  blend(i: number, c: RGB, a: number) {
    const j = i * 3;
    const A = this.alb;
    A[j] = (A[j] as number) + (c[0] - (A[j] as number)) * a;
    A[j + 1] = (A[j + 1] as number) + (c[1] - (A[j + 1] as number)) * a;
    A[j + 2] = (A[j + 2] as number) + (c[2] - (A[j + 2] as number)) * a;
  }
  /** visit every pixel whose centre lies in the rectangle */
  rect_(x0: number, z0: number, x1: number, z1: number, fn: (i: number, x: number, z: number, ix: number, iz: number) => void) {
    const R = this.rect;
    const p = this.ppm;
    const ix0 = Math.max(0, this.ixOf(x0));
    const ix1 = Math.min(this.W, this.ixOf(x1));
    const iz0 = Math.max(0, this.izOf(z0));
    const iz1 = Math.min(this.H, this.izOf(z1));
    for (let iz = iz0; iz < iz1; iz++) {
      const z = R.z0 + (iz + 0.5) / p;
      for (let ix = ix0; ix < ix1; ix++) fn(iz * this.W + ix, R.x0 + (ix + 0.5) / p, z, ix, iz);
    }
  }
  rrect(x0: number, z0: number, x1: number, z1: number, r: number, fn: (i: number, x: number, z: number, ix: number, iz: number) => void) {
    this.rect_(x0, z0, x1, z1, (i, x, z, ix, iz) => {
      const dx = Math.max(x0 + r - x, x - (x1 - r), 0);
      const dz = Math.max(z0 + r - z, z - (z1 - r), 0);
      if (dx * dx + dz * dz <= r * r) fn(i, x, z, ix, iz);
    });
  }
  /** rectangle rotated about its centre; fn gets u along the long axis, v across */
  obb(cx: number, cz: number, hu: number, hv: number, ang: number, fn: (i: number, u: number, v: number, x: number, z: number) => void) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const ex = Math.abs(ca) * hu + Math.abs(sa) * hv;
    const ez = Math.abs(sa) * hu + Math.abs(ca) * hv;
    this.rect_(cx - ex, cz - ez, cx + ex, cz + ez, (i, x, z) => {
      const dx = x - cx;
      const dz = z - cz;
      const u = dx * ca + dz * sa;
      const v = -dx * sa + dz * ca;
      if (Math.abs(u) <= hu && Math.abs(v) <= hv) fn(i, u, v, x, z);
    });
  }
  disc(cx: number, cz: number, r: number, fn: (i: number, d: number, x: number, z: number) => void) {
    this.rect_(cx - r, cz - r, cx + r, cz + r, (i, x, z) => {
      const d = Math.hypot(x - cx, z - cz);
      if (d <= r) fn(i, d, x, z);
    });
  }
  /** segment with pixel-accurate coverage; fn gets coverage 0..1 and position t along it */
  seg(ax: number, az: number, bx: number, bz: number, w: number, fn: (i: number, cov: number, t: number, x: number, z: number) => void) {
    const p = this.ppm;
    const hw = w / 2;
    const pad = hw + 1.5 / p;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-9;
    this.rect_(Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad, (i, x, z) => {
      const t = sat(((x - ax) * dx + (z - az) * dz) / len2);
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      const cov = sat((hw - d) * p + 0.5);
      if (cov > 0) fn(i, cov, t, x, z);
    });
  }
  poly(pts: readonly (readonly [number, number])[], fn: (i: number, x: number, z: number, ix: number, iz: number) => void) {
    const R = this.rect;
    const p = this.ppm;
    let zmin = Infinity;
    let zmax = -Infinity;
    for (const q of pts) {
      zmin = Math.min(zmin, q[1]);
      zmax = Math.max(zmax, q[1]);
    }
    const iz0 = Math.max(0, this.izOf(zmin));
    const iz1 = Math.min(this.H, this.izOf(zmax));
    const xs: number[] = [];
    for (let iz = iz0; iz < iz1; iz++) {
      const z = R.z0 + (iz + 0.5) / p;
      xs.length = 0;
      for (let k = 0, n = pts.length; k < n; k++) {
        const a = pts[k] as readonly [number, number];
        const b = pts[(k + 1) % n] as readonly [number, number];
        if (a[1] <= z !== b[1] <= z) xs.push(a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ix0 = Math.max(0, this.ixOf(xs[k] as number));
        const ix1 = Math.min(this.W, this.ixOf(xs[k + 1] as number));
        for (let ix = ix0; ix < ix1; ix++) fn(iz * this.W + ix, R.x0 + (ix + 0.5) / p, z, ix, iz);
      }
    }
  }
}

// ---------- blur ----------
export function boxBlur(src: Float32Array, W: number, H: number, r: number, passes = 2): Float32Array {
  const R = Math.max(1, Math.round(r));
  let a = src;
  let b = new Float32Array(src.length);
  const norm = 1 / (2 * R + 1);
  const line = new Float32Array(Math.max(W, H));
  for (let p = 0; p < passes; p++) {
    for (let z = 0; z < H; z++) {
      const o = z * W;
      let s = (a[o] as number) * (R + 1);
      for (let k = 1; k <= R; k++) s += a[o + Math.min(k, W - 1)] as number;
      for (let x = 0; x < W; x++) {
        b[o + x] = s * norm;
        s += (a[o + Math.min(x + R + 1, W - 1)] as number) - (a[o + Math.max(x - R, 0)] as number);
      }
    }
    if (a === src) a = new Float32Array(src.length);
    [a, b] = [b, a];
    for (let x = 0; x < W; x++) {
      let s = (a[x] as number) * (R + 1);
      for (let k = 1; k <= R; k++) s += a[Math.min(k, H - 1) * W + x] as number;
      for (let z = 0; z < H; z++) {
        line[z] = s * norm;
        s += (a[Math.min(z + R + 1, H - 1) * W + x] as number) - (a[Math.max(z - R, 0) * W + x] as number);
      }
      for (let z = 0; z < H; z++) b[z * W + x] = line[z] as number;
    }
    [a, b] = [b, a];
  }
  return a;
}

// ---------- PNG (the only image format the pipeline writes itself) ----------
export function writePng(path: string, W: number, H: number, rgb: Uint8Array) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let z = 0; z < H; z++) {
    raw[z * (W * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + z * W * 3, W * 3).copy(raw, z * (W * 3 + 1) + 1);
  }
  const chunk = (tag: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(tag), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 2 })), chunk('IEND', Buffer.alloc(0))]));
}
