import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, Lightformer, Line, MapControls, useCursor } from '@react-three/drei';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clockText, type View } from '../../data/derive';
import type { Household, Snapshot } from '../../data/types';
import { STATION } from '../MapCanvas';
import type { GraphFilter } from '../py/Graph';
import { CEDAR_Y, dispatchedOf, HOUSE, knocksOf, massesOf, ROADS, roofTop, STATUS_LABEL, statusOf, visibleUnder, type Mass, type Status } from './model';
import { creekEdgeAt, drawSitePlan, PARKS, SITE, SITE_CX, SITE_CZ, SITE_D, SITE_W } from './sitePlan';

// The main dashboard's map as a live architectural model of Cedar Hollow.
// One matte material for everything built, one sun, soft shadows and ambient
// occlusion; color is reserved for live data (pins, hazards, routes), which
// sits on top as real DOM buttons so it stays sharp, focusable and readable.

type V3 = [number, number, number];
interface Box {
  p: V3;
  s: V3;
}

const DEG = Math.PI / 180;
const ELEV = 42 * DEG;
const AZ = -18 * DEG;
const BASE_DIST = 1550;
const HOME = new THREE.Vector3(40, 0, 70);
const SUN = new THREE.Vector3(0.72, 0.5, 0.42).normalize().multiplyScalar(1400);
const SKY = '#f5f5f7';

// light balance: the sun carries the form, a low sky fill keeps shadows readable
const LIGHT = { sun: 3.9, env: 0.27, hemi: 0.12, ao: 2.4 };

const camAt = (t: THREE.Vector3, dist: number, az = AZ, el = ELEV) =>
  new THREE.Vector3(t.x + Math.sin(az) * Math.cos(el) * dist, t.y + Math.sin(el) * dist, t.z + Math.cos(az) * Math.cos(el) * dist);

// ---------- materials (shared, created once) ----------
const std = (color: string, roughness = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
const M = {
  walls: ['#f4f1eb', '#f1ebe1', '#f3f2ee', '#f2ece3', '#f5f3ee'].map((c) => std(c, 0.92)),
  office: std('#eef0f0', 0.85),
  warehouse: std('#ece8e0', 0.95),
  station: std('#f3f4f5', 0.88),
  fire: std('#f3cabd', 0.9),
  roof: std('#e4e1da', 0.96),
  trim: std('#fbfaf7', 0.8),
  glass: std('#9fb1bc', 0.2, { metalness: 0.18, envMapIntensity: 1.2 }),
  door: std('#a9aaa6', 0.6),
  houseRoof: std('#cdbfaf', 0.85),
  canopy: std('#ffffff', 0.95),
  trunk: std('#b9ad9b', 1),
  plinth: std('#dcd5c8', 0.95),
  water: std('#34474a', 0.12, { envMapIntensity: 0.9 }),
  ems: std('#2563eb', 0.55),
  rail: std('#cfc8bc', 0.8),
};
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// ---------- instanced boxes ----------
function Boxes({ items, material, shadow = true }: { items: Box[]; material: THREE.Material; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    items.forEach((b, i) => {
      o.position.set(b.p[0], b.p[1], b.p[2]);
      o.scale.set(b.s[0], b.s[1], b.s[2]);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh key={items.length} ref={ref} args={[UNIT_BOX, material, items.length]} castShadow={shadow} receiveShadow />;
}

// ---------- detail generators (all in map units, y up) ----------
interface Details {
  glass: Box[];
  trim: Box[];
  roof: Box[];
  door: Box[];
  ems: Box[];
}

function faces(x0: number, x1: number, z0: number, z1: number) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return [
    { along: 'x' as const, at: z1, out: 1, len: x1 - x0, c: cx, south: true },
    { along: 'x' as const, at: z0, out: -1, len: x1 - x0, c: cx, south: false },
    { along: 'z' as const, at: x0, out: -1, len: z1 - z0, c: cz, south: false },
    { along: 'z' as const, at: x1, out: 1, len: z1 - z0, c: cz, south: false },
  ];
}
type Face = ReturnType<typeof faces>[number];

/** box lying on a facade: u = offset along the face, y = height, n = offset outward, size (along, height, depth) */
const onFace = (f: Face, u: number, y: number, n: number, along: number, h: number, depth: number): Box =>
  f.along === 'x' ? { p: [f.c + u, y, f.at + f.out * n], s: [along, h, depth] } : { p: [f.at + f.out * n, y, f.c + u], s: [depth, h, along] };

function details(masses: Mass[], homes: Household[]): Details {
  const d: Details = { glass: [], trim: [], roof: [], door: [], ems: [] };
  for (const m of masses) {
    const H = m.h;
    const fh = m.fh;
    const floors = Math.max(1, Math.round(H / fh));
    const fs = faces(m.x0, m.x1, m.z0, m.z1);
    const cx = (m.x0 + m.x1) / 2;
    const cz = (m.z0 + m.z1) / 2;
    if (m.kind === 'multifamily') {
      for (const f of fs) {
        const pitch = 7.4;
        const n = Math.floor((f.len - 8) / pitch);
        for (let fl = 0; fl < floors; fl++) {
          for (let i = 0; i < n; i++) {
            const u = (i - (n - 1) / 2) * pitch;
            if (f.south && fl === 0 && Math.abs(u) < 6) continue; // entrance
            d.glass.push(onFace(f, u, fl * fh + fh * 0.52, 0.12, 4.2, fh * 0.48, 0.6));
          }
          if (fl > 0) d.trim.push(onFace(f, 0, fl * fh, 0, f.len + 0.9, 0.55, 0.9));
        }
        d.trim.push(onFace(f, 0, H + 0.6, -0.45, f.len, 1.2, 0.9));
      }
      d.glass.push({ p: [cx, fh * 0.36, m.z1 + 0.15], s: [6, fh * 0.66, 0.6] });
      d.trim.push({ p: [cx, fh * 0.74, m.z1 + 1.7], s: [11, 0.5, 3.6] });
      d.roof.push({ p: [cx, H + 2.4, cz], s: [9, 4.8, 6.5] });
      const w = m.x1 - m.x0;
      d.roof.push({ p: [cx - w * 0.25, H + 1.1, cz], s: [4.2, 2.2, 3.2] });
      d.roof.push({ p: [cx + w * 0.25, H + 1.1, cz], s: [4.2, 2.2, 3.2] });
    } else if (m.kind === 'office') {
      for (const f of fs) {
        for (let fl = 0; fl < floors; fl++) d.glass.push(onFace(f, 0, fl * fh + fh * 0.55, 0.1, f.len - 1.6, fh * 0.56, 0.6));
        const n = Math.floor(f.len / 5);
        for (let i = 0; i <= n; i++) d.trim.push(onFace(f, (i - n / 2) * 5, H / 2, 0.55, 0.45, H, 1.3));
        d.trim.push(onFace(f, 0, H + 0.6, -0.45, f.len, 1.2, 0.9));
      }
      const w = m.x1 - m.x0;
      const dd = m.z1 - m.z0;
      d.roof.push({ p: [cx - w * 0.14, H + 3, cz - dd * 0.05], s: [w * 0.36, 6, dd * 0.42] });
      d.roof.push({ p: [cx + w * 0.26, H + 1.2, cz + dd * 0.1], s: [6, 2.4, 4] });
    } else {
      // warehouse: dock doors on the north apron, a band of clerestory glass on the west end
      const north = fs[1]!;
      for (let x = m.x0 + 12; x < m.x1 - 10; x += 18) d.door.push({ p: [x, 3.6, m.z0 - 0.05], s: [6, 7.2, 0.6] });
      d.glass.push(onFace(fs[2]!, 0, H - 3.2, 0.1, (m.z1 - m.z0) * 0.7, 2.2, 0.6));
      d.trim.push(onFace(north, 0, H - 0.4, 0.3, north.len + 0.6, 0.8, 0.9));
    }
  }

  // Station 7: three ambulance bays facing Cedar Ave, a blue EMS band, a cross on the roof
  const s = stationBox();
  const sf = faces(s.x0, s.x1, s.z0, s.z1);
  for (let i = -1; i <= 1; i++) d.door.push(onFace(sf[0]!, i * 12.5, 4, 0.1, 10, 8, 0.6));
  d.ems.push(onFace(sf[0]!, 0, s.h - 1.6, 0.25, s.x1 - s.x0 + 0.4, 1.4, 0.6));
  for (const f of sf.slice(1)) d.glass.push(onFace(f, 0, s.h * 0.62, 0.1, f.len - 8, 3, 0.6));
  const scx = (s.x0 + s.x1) / 2;
  const scz = (s.z0 + s.z1) / 2;
  d.ems.push({ p: [scx, s.h + 0.25, scz], s: [13, 0.5, 13] });
  d.trim.push({ p: [scx, s.h + 0.55, scz], s: [9, 0.4, 2.6] });
  d.trim.push({ p: [scx, s.h + 0.55, scz], s: [2.6, 0.4, 9] });
  for (const f of sf) d.trim.push(onFace(f, 0, s.h + 0.5, -0.4, f.len, 1, 0.8));

  // single-family houses: door toward the street, a few windows, a chimney
  for (const h of homes) {
    const hf = faces(h.x - HOUSE.w / 2, h.x + HOUSE.w / 2, h.y - HOUSE.d / 2, h.y + HOUSE.d / 2);
    d.door.push(onFace(hf[1]!, -3, 2.6, 0.1, 2.4, 5.2, 0.5));
    for (const u of [2.5, 6.2]) d.glass.push(onFace(hf[1]!, u, 4.4, 0.1, 2.4, 2.4, 0.5));
    for (const u of [-5, 0, 5]) d.glass.push(onFace(hf[0]!, u, 4.4, 0.1, 2.6, 2.6, 0.5));
    d.roof.push({ p: [h.x + 5, HOUSE.wall + HOUSE.ridge - 0.5, h.y - 2], s: [1.8, 5, 1.8] });
  }
  return d;
}

function stationBox() {
  return { x0: STATION.x - 46, x1: STATION.x - 4, z0: STATION.y - 44, z1: STATION.y - 14, h: 12 };
}

// ---------- trees ----------
interface Tree {
  x: number;
  z: number;
  r: number;
  h: number;
  tint: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function treesOf(masses: Mass[], homes: Household[]): Tree[] {
  const r = rng(7);
  const out: Tree[] = [];
  const lots = masses.map((m) => m.lot);
  const st = stationBox();
  const blocked = (x: number, z: number, pad = 4) =>
    lots.some((L) => x > L.x0 - pad && x < L.x1 + pad && z > L.z0 - pad && z < L.z1 + pad) ||
    ROADS.some((rd) => (rd.a[1] === rd.b[1] ? Math.abs(z - rd.a[1]) < (rd.major ? 15 : 12) && x <= Math.max(rd.a[0], rd.b[0]) + 6 : Math.abs(x - rd.a[0]) < 12)) ||
    (x > st.x0 - 10 && x < st.x1 + 10 && z > st.z0 - 26 && z < st.z1 + 6) ||
    homes.some((h) => Math.abs(x - h.x) < 17 && Math.abs(z - h.y) < 14) ||
    z > creekEdgeAt(x) - 7 ||
    x < SITE.x0 + 6 ||
    x > SITE.x1 - 6 ||
    z < SITE.z0 + 6;
  const add = (x: number, z: number, big = 1) => {
    if (blocked(x, z)) return;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 8)) return;
    const k = 0.82 + r() * 0.36;
    out.push({ x, z, r: 6.4 * k * big, h: 11 * k * big, tint: r() });
  };
  // street trees
  for (const rd of ROADS) {
    const horiz = rd.a[1] === rd.b[1];
    const off = rd.major ? 18.5 : 15.5;
    const lo = Math.max(SITE.x0, Math.min(horiz ? rd.a[0] : rd.a[1], horiz ? rd.b[0] : rd.b[1]));
    const hi = Math.min(horiz ? SITE.x1 : SITE.z1, Math.max(horiz ? rd.a[0] : rd.a[1], horiz ? rd.b[0] : rd.b[1]));
    for (let t = lo + 8; t < hi; t += 24 + r() * 6) {
      for (const side of [-1, 1]) {
        const x = horiz ? t + (r() - 0.5) * 3 : rd.a[0] + side * off;
        const z = horiz ? rd.a[1] + side * off : t + (r() - 0.5) * 3;
        const nearX = ROADS.some((o) => o !== rd && (horiz ? o.a[0] === o.b[0] && Math.abs(x - o.a[0]) < 26 : o.a[1] === o.b[1] && Math.abs(z - o.a[1]) < 28));
        if (!nearX) add(x, z);
      }
    }
  }
  // parks: loose clumps
  const ctx = document.createElement('canvas').getContext('2d')!;
  for (const park of [PARKS.ne, PARKS.nw]) {
    const p = new Path2D();
    park(p as unknown as CanvasRenderingContext2D);
    for (let x = SITE.x0; x < SITE.x1; x += 13)
      for (let z = SITE.z0; z < 210; z += 13) {
        const jx = x + (r() - 0.5) * 9;
        const jz = z + (r() - 0.5) * 9;
        if (ctx.isPointInPath(p, jx, jz) && r() < 0.62) add(jx, jz, 1.05 + r() * 0.2);
      }
  }
  // lawns north of each block, a row on the office plaza
  for (const m of masses) {
    if (m.kind === 'multifamily') for (let x = m.lot.x0 + 12; x < m.lot.x1 - 8; x += 21) add(x + (r() - 0.5) * 4, (m.lot.z0 + m.z0) / 2 - 2);
    if (m.kind === 'office') for (let x = m.x0 + 8; x < m.x1; x += 19) out.push({ x, z: (m.z1 + m.lot.z1) / 2, r: 4.4, h: 8, tint: r() });
  }
  // yards and the creek bank
  for (const h of homes) {
    for (const dx of [-15, 14]) {
      const x = h.x + dx;
      const z = h.y - 21;
      out.push({ x, z, r: 5.2, h: 9, tint: r() });
    }
  }
  for (let x = SITE.x0 + 10; x < SITE.x1 - 8; x += 22 + r() * 10) {
    if (Math.abs(x - 362) < 22 || Math.abs(x - 642) < 22 || homes.some((h) => Math.abs(x - h.x) < 32) || (x > 740 && x < 950)) continue;
    const z = creekEdgeAt(x) - 9;
    if (!lots.some((L) => x > L.x0 - 4 && x < L.x1 + 4 && z > L.z0 - 4 && z < L.z1 + 4)) out.push({ x, z, r: 6.4 + r() * 1.6, h: 10, tint: r() });
  }
  return out;
}

function Trees({ trees }: { trees: Tree[] }) {
  const canopy = useRef<THREE.InstancedMesh>(null);
  const trunk = useRef<THREE.InstancedMesh>(null);
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 20, 14), []);
  const cyl = useMemo(() => new THREE.CylinderGeometry(0.35, 0.55, 1, 8), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const greens = ['#3d4d39', '#46523f', '#35463a', '#4b5642'].map((h) => new THREE.Color(h));
    trees.forEach((t, i) => {
      o.position.set(t.x, t.h, t.z);
      o.scale.set(t.r, t.r * 0.92, t.r);
      o.updateMatrix();
      canopy.current!.setMatrixAt(i, o.matrix);
      c.copy(greens[Math.floor(t.tint * greens.length)]!);
      canopy.current!.setColorAt(i, c);
      o.position.set(t.x, (t.h - t.r * 0.5) / 2, t.z);
      o.scale.set(1, t.h - t.r * 0.5, 1);
      o.updateMatrix();
      trunk.current!.setMatrixAt(i, o.matrix);
    });
    for (const m of [canopy.current!, trunk.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    if (canopy.current!.instanceColor) canopy.current!.instanceColor.needsUpdate = true;
  }, [trees]);
  return (
    <group>
      <instancedMesh key={`c${trees.length}`} ref={canopy} args={[sphere, M.canopy, trees.length]} castShadow receiveShadow />
      <instancedMesh key={`t${trees.length}`} ref={trunk} args={[cyl, M.trunk, trees.length]} castShadow />
    </group>
  );
}

// ---------- prisms (gable roofs, sawtooth roofs) ----------
function prism(points: [number, number][], depth: number) {
  const s = new THREE.Shape();
  s.moveTo(points[0]![0], points[0]![1]);
  for (const p of points.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

function House({ h }: { h: Household }) {
  const walls = useMemo(() => new RoundedBoxGeometry(HOUSE.w, HOUSE.wall, HOUSE.d, 2, 0.35), []);
  const roof = useMemo(() => {
    const o = 0.9;
    return prism(
      [
        [-(HOUSE.d / 2 + o), 0],
        [HOUSE.d / 2 + o, 0],
        [0, HOUSE.ridge],
      ],
      HOUSE.w + 1.8,
    );
  }, []);
  return (
    <group position={[h.x, 0, h.y]}>
      <mesh geometry={walls} material={M.walls[1]} position-y={HOUSE.wall / 2} castShadow receiveShadow />
      <mesh geometry={roof} material={M.houseRoof} position={[-(HOUSE.w + 1.8) / 2, HOUSE.wall, 0]} rotation-y={Math.PI / 2} castShadow receiveShadow />
    </group>
  );
}

function Sawtooth({ m }: { m: Mass }) {
  const n = 7;
  const w = (m.x1 - m.x0) / n;
  const d = m.z1 - m.z0;
  const geo = useMemo(
    () =>
      prism(
        [
          [0, 0],
          [w, 0],
          [0, 6.5],
        ],
        d - 1.6,
      ),
    [w, d],
  );
  return (
    <group position={[m.x0, m.h, m.z0 + 0.8]}>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position-x={i * w}>
          <mesh geometry={geo} material={M.roof} castShadow receiveShadow />
          <mesh material={M.glass} position={[-0.12, 3.1, (d - 1.6) / 2]} scale={[0.36, 4.6, d - 4]} geometry={UNIT_BOX} />
        </group>
      ))}
    </group>
  );
}

// ---------- the built model: plinth, plan, water, buildings, trees ----------
interface ModelProps {
  masses: Mass[];
  homes: Household[];
  fireIds: string;
  onOpen(id: number): void;
}

const Model = memo(function Model({ masses, homes, fireIds, onOpen }: ModelProps) {
  const gl = useThree((s) => s.gl);
  const plan = useMemo(() => {
    const t = new THREE.CanvasTexture(drawSitePlan(masses, homes));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = gl.capabilities.getMaxAnisotropy();
    return t;
  }, [masses, homes, gl]);
  useEffect(() => () => plan.dispose(), [plan]);
  const det = useMemo(() => details(masses, homes), [masses, homes]);
  const trees = useMemo(() => treesOf(masses, homes), [masses, homes]);
  const plinth = useMemo(() => new RoundedBoxGeometry(SITE_W + 6, 18, SITE_D + 6, 3, 2.4), []);
  const water = useMemo(() => {
    // three spans between the bridges, each from the bank to the plinth edge
    const spans: [number, number][] = [
      [SITE.x0, 362 - 11],
      [362 + 11, 642 - 11],
      [642 + 11, SITE.x1],
    ];
    return spans.map(([a, b]) => {
      const s = new THREE.Shape();
      s.moveTo(a, -SITE.z1);
      for (let x = a; x <= b; x += Math.min(8, b - x || 8)) {
        s.lineTo(x, -creekEdgeAt(x));
        if (x === b) break;
      }
      s.lineTo(b, -creekEdgeAt(b));
      s.lineTo(b, -SITE.z1);
      s.closePath();
      return new THREE.ShapeGeometry(s, 8);
    });
  }, []);
  const fires = new Set(fireIds.split(',').filter(Boolean).map(Number));
  const st = stationBox();
  return (
    <group>
      <mesh geometry={plinth} material={M.plinth} position={[SITE_CX, -9.05, SITE_CZ]} receiveShadow castShadow />
      {/* the table the model stands on: only its shadow shows */}
      <mesh rotation-x={-Math.PI / 2} position={[SITE_CX, -18.2, SITE_CZ]} receiveShadow>
        <planeGeometry args={[SITE_W * 4, SITE_D * 4]} />
        <shadowMaterial transparent opacity={0.14} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[SITE_CX, 0, SITE_CZ]} receiveShadow>
        <planeGeometry args={[SITE_W, SITE_D]} />
        <meshStandardMaterial map={plan} roughness={1} />
      </mesh>
      {water.map((g, i) => (
        <mesh key={i} geometry={g} material={M.water} rotation-x={-Math.PI / 2} position-y={0.12} receiveShadow />
      ))}
      {/* bridge rails */}
      {[362, 642].map((x) => {
        const z0 = creekEdgeAt(x) - 6;
        return [-1, 1].map((sd) => (
          <mesh key={`${x}${sd}`} material={M.rail} geometry={UNIT_BOX} position={[x + sd * 11, 0.7, (z0 + SITE.z1) / 2]} scale={[0.6, 1.4, SITE.z1 - z0]} castShadow />
        ));
      })}
      {masses.map((m, i) => (
        <Block key={m.b.id} m={m} wall={fires.has(m.b.id) ? M.fire : m.kind === 'office' ? M.office : m.kind === 'warehouse' ? M.warehouse : M.walls[i % M.walls.length]!} fire={fires.has(m.b.id)} onOpen={m.units ? () => onOpen(m.b.id) : undefined} />
      ))}
      <mesh material={M.station} position={[(st.x0 + st.x1) / 2, st.h / 2, (st.z0 + st.z1) / 2]} castShadow receiveShadow>
        <boxGeometry args={[st.x1 - st.x0, st.h, st.z1 - st.z0]} />
      </mesh>
      {homes.map((h) => (
        <House key={h.id} h={h} />
      ))}
      <Boxes items={det.glass} material={M.glass} />
      <Boxes items={det.trim} material={M.trim} />
      <Boxes items={det.roof} material={M.roof} />
      <Boxes items={det.door} material={M.door} />
      <Boxes items={det.ems} material={M.ems} />
      <Trees trees={trees} />
    </group>
  );
});

function Block({ m, wall, fire, onOpen }: { m: Mass; wall: THREE.Material; fire: boolean; onOpen?: () => void }) {
  const w = m.x1 - m.x0;
  const d = m.z1 - m.z0;
  const geo = useMemo(() => new RoundedBoxGeometry(w, m.h, d, 2, 0.7), [w, d, m.h]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.3, m.h + 0.3, d + 0.3)), [w, d, m.h]);
  const [hot, setHot] = useState(false);
  useCursor(hot && !!onOpen);
  const mats = useMemo(() => [wall, wall, M.roof, wall, wall, wall], [wall]);
  return (
    <group position={[(m.x0 + m.x1) / 2, 0, (m.z0 + m.z1) / 2]}>
      <mesh
        geometry={geo}
        material={mats}
        position-y={m.h / 2}
        castShadow
        receiveShadow
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHot(true);
        }}
        onPointerOut={() => setHot(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta < 6) onOpen?.();
        }}
      />
      {fire && (
        <lineSegments geometry={edges} position-y={m.h / 2}>
          <lineBasicMaterial color="#d92d20" />
        </lineSegments>
      )}
      {m.kind === 'warehouse' && (
        <group position={[-(m.x0 + m.x1) / 2, 0, -(m.z0 + m.z1) / 2]}>
          <Sawtooth m={m} />
        </group>
      )}
    </group>
  );
}

// ---------- the sun: one key light, soft PCF shadows over the whole site ----------
function Sun() {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff7ee', LIGHT.sun);
    l.position.copy(SUN);
    l.castShadow = true;
    l.shadow.mapSize.set(4096, 4096);
    const c = l.shadow.camera;
    c.left = -700;
    c.right = 700;
    c.top = 700;
    c.bottom = -700;
    c.near = 100;
    c.far = 3400;
    c.updateProjectionMatrix();
    l.shadow.bias = -0.0002;
    l.shadow.normalBias = 0.6;
    l.shadow.radius = 4;
    return l;
  }, []);
  return <primitive object={light} />;
}

// ---------- camera: home view, header zoom, pan limits, compass ----------
interface Ctl {
  target: THREE.Vector3;
  update(): void;
  getAzimuthalAngle(): number;
}

function Rig({ zoom, reduced, home, compass }: { zoom: number; reduced: boolean; home: number; compass: React.RefObject<HTMLSpanElement | null> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Ctl | null;
  const invalidate = useThree((s) => s.invalidate);
  const want = useRef({ dist: BASE_DIST / zoom, home: false, active: false });
  useEffect(() => {
    want.current.dist = BASE_DIST / zoom;
    want.current.active = true;
    invalidate();
  }, [zoom, invalidate]);
  useEffect(() => {
    if (home === 0) return;
    want.current.home = true;
    want.current.active = true;
    invalidate();
  }, [home, invalidate]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!controls) return;
    const t = controls.target;
    // keep the model in view: clamp the pan target, moving the camera with it
    const cx = THREE.MathUtils.clamp(t.x, -SITE_W / 2, SITE_W / 2);
    const cz = THREE.MathUtils.clamp(t.z, -SITE_D / 2, SITE_D / 2);
    if (cx !== t.x || cz !== t.z || t.y !== 0) {
      camera.position.x += cx - t.x;
      camera.position.z += cz - t.z;
      camera.position.y -= t.y;
      t.set(cx, 0, cz);
    }
    const w = want.current;
    if (w.active) {
      const k = reduced ? 1 : 0.16;
      if (w.home) {
        t.lerp(HOME, k);
        const goal = camAt(t, w.dist);
        camera.position.lerp(goal, k);
        if (camera.position.distanceTo(goal) < 0.5 && t.distanceTo(HOME) < 0.5) w.home = w.active = false;
      } else {
        tmp.copy(camera.position).sub(t);
        const dist = tmp.length();
        const next = dist + (w.dist - dist) * k;
        tmp.setLength(next);
        camera.position.copy(t).add(tmp);
        if (Math.abs(next - w.dist) < 0.5) w.active = false;
      }
      controls.update();
      invalidate();
    }
    if (compass.current) compass.current.style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;
  });
  return null;
}

// ---------- data on top: pins, labels, hazards, routes ----------
const PIN_Z: [number, number] = [80, 20];

function Pin({
  h,
  st,
  top,
  rank,
  hpi,
  flame,
  battery,
  dim,
  selected,
  hover,
  onSelect,
  onHover,
}: {
  h: Household;
  st: Status;
  top: number;
  rank: number;
  hpi: string;
  flame: boolean;
  battery: boolean;
  dim: boolean;
  selected: boolean;
  hover: boolean;
  onSelect(id: number): void;
  onHover(id: number | null): void;
}) {
  return (
    <Html position={[h.x, top, h.y]} zIndexRange={selected || hover ? [90, 90] : PIN_Z} pointerEvents="none">
      <button
        className={`p3 ${st}${dim ? ' dim' : ''}${selected ? ' sel' : ''}${hover ? ' hov' : ''}`}
        onClick={() => onSelect(h.id)}
        onPointerEnter={() => onHover(h.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(h.id)}
        onBlur={() => onHover(null)}
        aria-label={`${h.name}, unit ${h.unit}: ${STATUS_LABEL[st]}${rank ? `, rank ${rank}` : ''}${hpi ? `, HPI ${hpi}` : ''}${flame ? ', flame sensor' : ''}${battery ? ', on battery' : ''}`}
        aria-pressed={selected}
      >
        <span className="p3-head">
          {st === 'critical' && <i className="p3-pulse" aria-hidden="true" />}
          {(st === 'ok' || st === 'assisted') && (
            <svg viewBox="-6 -6 12 12" aria-hidden="true">
              <path d="M-3.4 0.2 L-1 2.6 L3.6 -2.4" />
            </svg>
          )}
          {st === 'help' && <b>!</b>}
          {st === 'unknown' && <b>?</b>}
          {rank > 0 && <b>{rank}</b>}
          {flame && (
            <i className="p3-badge fire" aria-hidden="true">
              <svg viewBox="-5 -5 10 10">
                <path d="M0 -3.4 C1.9 -1.2 2.4 0.4 1.6 2.2 A1.9 1.9 0 0 1 -1.6 2.2 C-2.3 0.6 -1 -0.8 0 -3.4Z" />
              </svg>
            </i>
          )}
          {battery && (
            <i className="p3-badge power" aria-hidden="true">
              <svg viewBox="-5 -5 10 10">
                <path d="M0.7 -3.4 L-2 0.4 H0.2 L-0.7 3.4 L2 -0.4 H-0.2 Z" />
              </svg>
            </i>
          )}
        </span>
        <span className="p3-stem" aria-hidden="true" />
        {(hover || selected) && (
          <span className="p3-tip" aria-hidden="true">
            {h.name} <em>{h.unit}</em>
            {hpi ? <strong>HPI {hpi}</strong> : null}
          </span>
        )}
      </button>
    </Html>
  );
}

function RoadName({ name, at, horiz }: { name: string; at: [number, number]; horiz: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const last = useRef(999);
  useFrame(() => {
    if (!ref.current) return;
    a.set(at[0] - SITE_CX, 0, at[1] - SITE_CZ).project(camera);
    b.set(at[0] - SITE_CX + (horiz ? 20 : 0), 0, at[1] - SITE_CZ + (horiz ? 0 : 20)).project(camera);
    let ang = (Math.atan2(-(b.y - a.y) * size.height, (b.x - a.x) * size.width) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    if (Math.abs(ang - last.current) > 0.2) {
      last.current = ang;
      ref.current.style.transform = `translate(-50%, -50%) rotate(${ang.toFixed(1)}deg)`;
    }
  });
  return (
    <Html position={[at[0], 0.5, at[1]]} zIndexRange={[12, 10]} pointerEvents="none">
      <span ref={ref} className="r3">
        {name}
      </span>
    </Html>
  );
}

/** Where a quake ring's distance label sits: the first point on the ring, from the viewer's side round, that is on the site and clear of buildings. */
function ringLabel(x: number, z: number, r: number, masses: Mass[]): V3 {
  for (const deg of [120, 150, 180, 210, 60, 30, 240, 0, 330, 300, 90, 270]) {
    const px = x + Math.cos(deg * DEG) * r;
    const pz = z + Math.sin(deg * DEG) * r;
    const onSite = px > SITE.x0 + 20 && px < SITE.x1 - 20 && pz > SITE.z0 + 20 && pz < SITE.z1 - 20;
    const clear = !masses.some((m) => px > m.lot.x0 - 6 && px < m.lot.x1 + 6 && pz > m.lot.z0 - 6 && pz < m.lot.z1 + 6);
    if (onSite && clear) return [px, 1, pz];
  }
  return [x, 1, z - r];
}

export interface Map3DProps {
  view: View;
  snapshot: Snapshot;
  zoom: number;
  filter: GraphFilter;
  selected: number | null;
  hover: number | null;
  onHover(id: number | null): void;
  onSelect(id: number): void;
  onOpenBuilding(id: number): void;
}

export default function Map3D({ view, snapshot, zoom, filter, selected, hover, onHover, onSelect, onOpenBuilding }: Map3DProps) {
  const reduced = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const compass = useRef<HTMLSpanElement>(null);
  const [home, setHome] = useState(0);
  const open = useRef(onOpenBuilding);
  open.current = onOpenBuilding;
  const onOpen = useMemo(() => (id: number) => open.current(id), []);

  // geometry only changes if the seed does: key the static model on positions
  const geoKey = [...view.building.values()].map((b) => `${b.id}:${b.x},${b.y},${b.w},${b.h},${b.floors}`).join('|') + '#' + view.households.map((h) => `${h.id}:${h.buildingId}:${Math.round(h.x)},${Math.round(h.y)}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const masses = useMemo(() => massesOf(view.building.values(), view.households), [geoKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const homes = useMemo(() => view.households.filter((h) => !view.building.has(h.buildingId)), [geoKey]);

  const active = snapshot.disasters.filter((d) => d.active);
  const quakes = active.filter((d) => d.kind === 'quake');
  const fireIds = active
    .filter((d) => d.kind === 'fire')
    .map((d) => d.buildingId)
    .sort((a, b) => a - b)
    .join(',');
  const dispatched = dispatchedOf(view);
  const knocks = knocksOf(view);
  const st = stationBox();
  const c = view.counts;

  const front = (h: Household) => {
    const m = masses.find((x) => x.b.id === h.buildingId);
    if (!m) return h.y - HOUSE.d / 2 - 3;
    return h.y < CEDAR_Y ? m.z1 + 3 : m.z0 - 3;
  };
  const routeOf = (h: Household): V3[] => {
    const sx = (st.x0 + st.x1) / 2;
    const y = 1.1;
    const pts: V3[] = [
      [sx, y, st.z1 + 2],
      [sx, y, CEDAR_Y],
    ];
    if (h.y > 538) {
      const lane = Math.abs(h.x - 362) < Math.abs(h.x - 642) ? 362 : 642;
      pts.push([lane, y, CEDAR_Y], [lane, y, 538], [h.x, y, 538]);
    } else pts.push([h.x, y, CEDAR_Y]);
    pts.push([h.x, y, front(h)]);
    return pts;
  };

  return (
    <div className="cm-map m3" role="region" aria-label={`3D map of Cedar Hollow. ${c.accounted} of ${c.total} households accounted for. Drag to pan, right-drag to rotate, scroll to zoom.`}>
      <Canvas
        shadows="percentage"
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        camera={{ fov: 28, near: 20, far: 9000, position: camAt(HOME, BASE_DIST / zoom).toArray() }}
        aria-hidden="true"
      >
        <color attach="background" args={[SKY]} />
        <hemisphereLight args={['#fffdf8', '#d8cfc0', LIGHT.hemi]} />
        <Sun />
        <Environment resolution={256} frames={1} environmentIntensity={LIGHT.env}>
          <color attach="background" args={['#cfcac2']} />
          <Lightformer form="rect" intensity={2.6} color="#ffffff" scale={[40, 40, 1]} position={[0, 18, 0]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={1.6} color="#fff0dc" scale={[30, 10, 1]} position={[16, 7, 10]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.8} color="#dfe8f4" scale={[30, 10, 1]} position={[-18, 6, -12]} target={[0, 0, 0]} />
        </Environment>

        <group position={[-SITE_CX, 0, -SITE_CZ]}>
          <Model masses={masses} homes={homes} fireIds={fireIds} onOpen={onOpen} />

          {/* quake: tinted reach and distance rings on the ground */}
          {quakes.map((q) => (
            <group key={`q${q.id}`}>
              <mesh rotation-x={-Math.PI / 2} position={[q.x, 0.35, q.y]} renderOrder={1}>
                <circleGeometry args={[300, 128]} />
                <meshBasicMaterial color="#d92d20" transparent opacity={0.07} depthWrite={false} toneMapped={false} />
              </mesh>
              {[150, 300].map((r) => (
                <group key={r}>
                  <Line points={Array.from({ length: 161 }, (_, i) => [q.x + Math.cos((i / 160) * Math.PI * 2) * r, 0.9, q.y + Math.sin((i / 160) * Math.PI * 2) * r] as V3)} color="#d92d20" lineWidth={1.6} dashed dashSize={9} gapSize={7} transparent opacity={0.8} />
                  <Html position={ringLabel(q.x, q.y, r, masses)} zIndexRange={[14, 12]} pointerEvents="none">
                    <span className="q3">{r} m</span>
                  </Html>
                </group>
              ))}
              <Html position={[q.x, 1, q.y]} zIndexRange={[70, 70]} pointerEvents="none">
                <span className="e3">
                  <i aria-hidden="true" />
                  <span>Epicenter · {clockText(q.confirmedAtMicros)}</span>
                </span>
              </Html>
            </group>
          ))}

          {/* responders: station, along Cedar Ave, up the side street to the door, then up to the unit */}
          {dispatched.map((h) => {
            const pts = routeOf(h);
            const end = pts[pts.length - 1]!;
            return (
              <group key={`r${h.id}`}>
                <Line points={pts.map((p) => [p[0], p[1] - 0.3, p[2]] as V3)} color="#ffffff" lineWidth={8} />
                <Line points={pts} color="#2563eb" lineWidth={4} />
                <Line points={[end, [h.x, roofTop(masses, h), h.y]]} color="#2563eb" lineWidth={2} dashed dashSize={3} gapSize={3} depthTest={false} renderOrder={5} />
                <mesh position={end}>
                  <sphereGeometry args={[2.4, 16, 12]} />
                  <meshBasicMaterial color="#2563eb" toneMapped={false} />
                </mesh>
              </group>
            );
          })}
          {/* volunteer knock: a found neighbor walking over */}
          {knocks.map((k) => (
            <Line
              key={`k${k.b.id}`}
              points={[
                [k.a.x, roofTop(masses, k.a) + 2, k.a.y],
                [k.b.x, roofTop(masses, k.b) + 2, k.b.y],
              ]}
              color="#15803d"
              lineWidth={2.4}
              dashed
              dashSize={3}
              gapSize={3}
              depthTest={false}
              renderOrder={5}
            />
          ))}

          {ROADS.map((r) => (
            <RoadName key={r.name} name={r.name} at={r.at} horiz={r.a[1] === r.b[1]} />
          ))}
          <Html position={[70, 0.5, 655]} zIndexRange={[12, 10]} pointerEvents="none">
            <span className="w3">Cedar Creek</span>
          </Html>
          <Html position={[972, 0.5, 132]} zIndexRange={[12, 10]} pointerEvents="none">
            <span className="w3 park">Hollow Park</span>
          </Html>

          {/* building names sit on the lot, in front of each block */}
          {masses.map((m) => {
            const onFire = fireIds.split(',').includes(String(m.b.id));
            const inner = (
              <>
                <b>{m.b.name.replace(/ \((office|warehouse)\)$/, '')}</b>
                <span>{m.units ? `${m.units} units · ${m.b.floors} fl · ${m.b.builtYear}` : m.b.kind}</span>
                {onFire && <em>Fire</em>}
              </>
            );
            return (
              <Html key={`l${m.b.id}`} position={[m.x0, 0.5, m.kind === 'warehouse' ? m.z0 - 14 : m.z1 + 5]} zIndexRange={[16, 14]} pointerEvents="none">
                {m.units ? (
                  <button className={`b3${onFire ? ' fire' : ''}`} onClick={() => onOpenBuilding(m.b.id)} aria-label={`${m.b.name}: open building view`}>
                    {inner}
                  </button>
                ) : (
                  <span className="b3 quiet">{inner}</span>
                )}
              </Html>
            );
          })}
          <Html position={[st.x1, st.h + 2, st.z0]} zIndexRange={[16, 14]} pointerEvents="none">
            <span className="b3 quiet station">
              <b>Station 7</b>
              <span>EMS · simulated</span>
            </span>
          </Html>

          {view.households.map((h) => {
            const s = statusOf(view, h);
            const p = view.prio.get(h.id);
            const n = view.node.get(h.id);
            const rank = (s === 'open' || s === 'critical') && p?.rank ? p.rank : 0;
            return (
              <Pin
                key={h.id}
                h={h}
                st={s}
                top={roofTop(masses, h)}
                rank={rank}
                hpi={p?.scored && p.rank ? p.hpi.toFixed(0) : ''}
                flame={!!n?.flame}
                battery={!!n?.onBattery && h.finalState !== 'assisted'}
                dim={!visibleUnder(filter, s)}
                selected={selected === h.id}
                hover={hover === h.id}
                onSelect={onSelect}
                onHover={onHover}
              />
            );
          })}
        </group>

        <MapControls makeDefault enableDamping={!reduced} dampingFactor={0.12} minDistance={420} maxDistance={3400} minPolarAngle={0.12} maxPolarAngle={1.18} zoomSpeed={0.7} />
        <Rig zoom={zoom} reduced={reduced} home={home} compass={compass} />
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={14} distanceFalloff={1.4} intensity={LIGHT.ao} quality="high" />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      </Canvas>
      <div className="m3-tools">
        <button className="m3-compass" onClick={() => setHome((x) => x + 1)} aria-label="Reset the map view (north up)" title="Reset view">
          <span ref={compass}>
            <svg viewBox="-14 -14 28 28" aria-hidden="true">
              <text y={-8.5}>N</text>
              <path d="M0 -6.5 L3.6 1.5 H-3.6 Z" className="n" />
              <path d="M0 9.5 L3.6 1.5 H-3.6 Z" className="s" />
            </svg>
          </span>
        </button>
        <span className="m3-hint">Drag to pan · right-drag to tilt and turn · scroll to zoom</span>
      </div>
    </div>
  );
}
