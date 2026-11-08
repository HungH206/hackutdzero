import { HOUSE, ROADS, roadWidth, type Mass } from './model';

// The printed site plan the 3D model stands on: land, lots, parking, streets
// with sidewalks and markings, parks, the creek and its bridges. Drawn once
// into a canvas in map units (meters), then used as the ground texture.

export const SITE = { x0: -40, x1: 1040, z0: -30, z1: 680 };
export const SITE_W = SITE.x1 - SITE.x0;
export const SITE_D = SITE.z1 - SITE.z0;
export const SITE_CX = (SITE.x0 + SITE.x1) / 2;
export const SITE_CZ = (SITE.z0 + SITE.z1) / 2;

const PPM = 3.2; // texture pixels per meter

export const PLAN = {
  land: '#e9e5dd',
  lawn: '#dce3cf',
  park: '#d3ddc3',
  parkPath: '#f2eee6',
  paving: '#f2efe9',
  parking: '#e4e0d8',
  stall: '#d2ccc1',
  sidewalk: '#f5f2ed',
  curb: '#d6cfc2',
  road: '#fdfcfa',
  major: '#f9f0d6',
  mark: '#e2dccf',
  majorMark: '#e3c987',
  water: '#b9cfd9',
  waterDeep: '#a9c3cf',
  bank: '#9cb4bf',
  shore: '#d4ddc6',
  yard: '#dfe6d1',
  rail: '#b5ad9f',
  concrete: '#e2ded6',
};

export function creekPath(g: CanvasRenderingContext2D | Path2D) {
  g.moveTo(-80, 626);
  g.bezierCurveTo(100, 612, 240, 610, 340, 636);
  g.bezierCurveTo(440, 662, 520, 618, 660, 614);
  g.bezierCurveTo(800, 610, 840, 604, 1100, 624);
}

/** Top edge of the creek at x (sampled from the same curve). */
export function creekEdgeAt(x: number) {
  const segs: [number, number][][] = [
    [[-80, 626], [100, 612], [240, 610], [340, 636]],
    [[340, 636], [440, 662], [520, 618], [660, 614]],
    [[660, 614], [800, 610], [840, 604], [1100, 624]],
  ];
  for (const s of segs) {
    if (x < s[0]![0] || x > s[3]![0]) continue;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const t = (lo + hi) / 2;
      const bx = bez(s.map((p) => p[0]), t);
      if (bx < x) lo = t;
      else hi = t;
    }
    return bez(s.map((p) => p[1]), (lo + hi) / 2);
  }
  return 624;
}
const bez = (p: number[], t: number) => {
  const u = 1 - t;
  return u * u * u * p[0]! + 3 * u * u * t * p[1]! + 3 * u * t * t * p[2]! + t * t * t * p[3]!;
};

export const PARKS = {
  ne(g: CanvasRenderingContext2D) {
    g.moveTo(884, -60);
    g.lineTo(1100, -60);
    g.lineTo(1100, 200);
    g.lineTo(930, 200);
    g.quadraticCurveTo(878, 170, 884, 96);
    g.closePath();
  },
  nw(g: CanvasRenderingContext2D) {
    g.moveTo(-80, -60);
    g.lineTo(150, -60);
    g.quadraticCurveTo(120, 10, 40, 20);
    g.quadraticCurveTo(-20, 26, -80, 4);
    g.closePath();
  },
};

const rr = (g: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number, r: number) => {
  g.beginPath();
  g.roundRect(x0, z0, x1 - x0, z1 - z0, r);
};

const CROSSINGS: [number, number][] = [];
for (const h of ROADS.filter((r) => r.a[1] === r.b[1]))
  for (const v of ROADS.filter((r) => r.a[0] === r.b[0])) {
    const x = v.a[0];
    const z = h.a[1];
    if (x >= Math.min(h.a[0], h.b[0]) && x <= Math.max(h.a[0], h.b[0])) CROSSINGS.push([x, z]);
  }

export function drawSitePlan(masses: Mass[], homes: { x: number; y: number }[]): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(SITE_W * PPM);
  cv.height = Math.round(SITE_D * PPM);
  const g = cv.getContext('2d')!;
  g.setTransform(PPM, 0, 0, PPM, -SITE.x0 * PPM, -SITE.z0 * PPM);

  g.fillStyle = PLAN.land;
  g.fillRect(SITE.x0, SITE.z0, SITE_W, SITE_D);

  // parks with a looping footpath
  g.fillStyle = PLAN.park;
  g.beginPath();
  PARKS.ne(g);
  g.fill();
  g.beginPath();
  PARKS.nw(g);
  g.fill();
  g.strokeStyle = PLAN.parkPath;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(905, 190);
  g.bezierCurveTo(960, 150, 900, 110, 960, 88);
  g.bezierCurveTo(1010, 70, 990, 20, 1040, 8);
  g.stroke();
  g.beginPath();
  g.moveTo(1000, 196);
  g.bezierCurveTo(990, 150, 1030, 130, 1040, 120);
  g.stroke();

  // creek: grassy shore, water, a darker channel, the bank line
  g.lineJoin = 'round';
  g.strokeStyle = PLAN.shore;
  g.lineWidth = 22;
  g.beginPath();
  creekPath(g);
  g.stroke();
  g.fillStyle = PLAN.water;
  g.beginPath();
  creekPath(g);
  g.lineTo(1100, 760);
  g.lineTo(-80, 760);
  g.closePath();
  g.fill();
  g.save();
  g.translate(0, 26);
  g.strokeStyle = PLAN.waterDeep;
  g.lineWidth = 26;
  g.beginPath();
  creekPath(g);
  g.stroke();
  g.restore();
  g.strokeStyle = PLAN.bank;
  g.lineWidth = 1.1;
  g.beginPath();
  creekPath(g);
  g.stroke();

  // lots
  for (const m of masses) {
    const L = m.lot;
    if (m.kind === 'multifamily') {
      g.fillStyle = PLAN.lawn;
      rr(g, L.x0, L.z0, L.x1, L.z1, 6);
      g.fill();
      // parking court south of the block: two rows of stalls around an aisle
      const pz0 = m.z1 + 8;
      const pz1 = L.z1 - 5;
      if (pz1 - pz0 > 16) {
        g.fillStyle = PLAN.parking;
        rr(g, L.x0 + 10, pz0, L.x1 - 10, pz1, 3);
        g.fill();
        g.strokeStyle = PLAN.stall;
        g.lineWidth = 0.35;
        g.beginPath();
        for (let x = L.x0 + 14; x <= L.x1 - 14; x += 2.8) {
          g.moveTo(x, pz0 + 0.8);
          g.lineTo(x, pz0 + 5.6);
          g.moveTo(x, pz1 - 5.6);
          g.lineTo(x, pz1 - 0.8);
        }
        g.stroke();
      }
      // front walk from the entrance to the parking court
      g.fillStyle = PLAN.paving;
      const cx = (m.x0 + m.x1) / 2;
      g.fillRect(cx - 2, m.z1, 4, 8);
      // driveway out to the nearest street
      const north = L.z1 < 300;
      if (north) g.fillRect(L.x0 + 22, L.z1 - 5, 7, 287 - (L.z1 - 5));
      else if (L.z1 < 528) g.fillRect(L.x0 + 22, L.z1 - 5, 7, 528 - (L.z1 - 5));
    } else if (m.kind === 'office') {
      g.fillStyle = PLAN.paving;
      rr(g, L.x0, L.z0, L.x1, L.z1, 4);
      g.fill();
      g.strokeStyle = PLAN.curb;
      g.lineWidth = 0.4;
      g.beginPath();
      for (let x = L.x0 + 6; x < L.x1; x += 6) {
        g.moveTo(x, L.z0 + 1);
        g.lineTo(x, L.z1 - 1);
      }
      g.stroke();
      g.fillStyle = PLAN.paving;
      g.fillRect(m.x0, m.z0, m.x1 - m.x0, m.z1 - m.z0);
    } else {
      g.fillStyle = PLAN.concrete;
      rr(g, L.x0, L.z0, L.x1, L.z1, 3);
      g.fill();
      // truck bays along the north apron
      g.strokeStyle = PLAN.stall;
      g.lineWidth = 0.4;
      g.beginPath();
      for (let x = m.x0 + 8; x < m.x1 - 8; x += 9) {
        g.moveTo(x, L.z0 + 1.5);
        g.lineTo(x, m.z0 - 1.5);
      }
      g.stroke();
    }
  }

  // single-family yards, driveways and fences
  for (const h of homes) {
    const x0 = h.x - 26;
    const x1 = h.x + 26;
    const z0 = h.y - 30;
    const z1 = Math.min(h.y + 14, 612);
    g.fillStyle = PLAN.yard;
    rr(g, x0, z0, x1, z1, 3);
    g.fill();
    g.strokeStyle = PLAN.rail;
    g.lineWidth = 0.35;
    g.stroke();
    g.fillStyle = PLAN.paving;
    g.fillRect(h.x + HOUSE.w / 2 - 6, 548, 5, h.y - HOUSE.d / 2 - 548);
  }

  // station yard
  g.fillStyle = PLAN.concrete;
  rr(g, 922, 232, 1004, 287, 2);
  g.fill();

  // streets: outer curb, sidewalk, inner curb, carriageway
  g.lineCap = 'round';
  const line = (r: (typeof ROADS)[number]) => {
    g.beginPath();
    g.moveTo(r.a[0], r.a[1]);
    g.lineTo(r.b[0], r.b[1]);
  };
  const order = [...ROADS].sort((a, b) => Number(a.major) - Number(b.major));
  for (const [extra, color] of [
    [8.6, PLAN.curb],
    [7.8, PLAN.sidewalk],
    [0.9, PLAN.curb],
  ] as const) {
    for (const r of order) {
      line(r);
      g.strokeStyle = color;
      g.lineWidth = roadWidth(r) + extra;
      g.stroke();
    }
  }
  for (const r of order) {
    line(r);
    g.strokeStyle = r.major ? PLAN.major : PLAN.road;
    g.lineWidth = roadWidth(r);
    g.stroke();
  }

  // markings, broken at every intersection
  g.lineCap = 'butt';
  for (const r of ROADS) {
    const horiz = r.a[1] === r.b[1];
    const fixed = horiz ? r.a[1] : r.a[0];
    const lo = Math.min(horiz ? r.a[0] : r.a[1], horiz ? r.b[0] : r.b[1]);
    const hi = Math.max(horiz ? r.a[0] : r.a[1], horiz ? r.b[0] : r.b[1]);
    const cuts = CROSSINGS.filter(([x, z]) => (horiz ? z === fixed : x === fixed)).map(([x, z]) => (horiz ? x : z));
    const spans: [number, number][] = [];
    let s = lo;
    for (const c of cuts.sort((a, b) => a - b)) {
      spans.push([s, c - 19]);
      s = c + 19;
    }
    spans.push([s, hi]);
    const seg = (a: number, b: number, off: number) => {
      if (horiz) {
        g.moveTo(a, fixed + off);
        g.lineTo(b, fixed + off);
      } else {
        g.moveTo(fixed + off, a);
        g.lineTo(fixed + off, b);
      }
    };
    g.beginPath();
    for (const [a, b] of spans) {
      if (r.major) {
        seg(a, b, -0.55);
        seg(a, b, 0.55);
      } else seg(a, b, 0);
    }
    g.strokeStyle = r.major ? PLAN.majorMark : PLAN.mark;
    g.lineWidth = r.major ? 0.4 : 0.45;
    g.setLineDash(r.major ? [] : [3.5, 5]);
    g.stroke();
    if (r.major) {
      g.beginPath();
      for (const [a, b] of spans) {
        seg(a, b, -4.8);
        seg(a, b, 4.8);
      }
      g.strokeStyle = PLAN.mark;
      g.lineWidth = 0.35;
      g.setLineDash([3, 6]);
      g.stroke();
    }
    g.setLineDash([]);
  }

  // zebra crossings on every approach
  g.fillStyle = PLAN.mark;
  for (const [x, z] of CROSSINGS) {
    const hRoad = ROADS.find((r) => r.a[1] === r.b[1] && r.a[1] === z)!;
    const vRoad = ROADS.find((r) => r.a[0] === r.b[0] && r.a[0] === x)!;
    const hw = roadWidth(hRoad) / 2;
    const vw = roadWidth(vRoad) / 2;
    for (const side of [-1, 1]) {
      // across the horizontal road, west and east of the crossing
      const cx = x + side * (vw + 5.5);
      if (cx < Math.min(hRoad.a[0], hRoad.b[0]) || cx > Math.max(hRoad.a[0], hRoad.b[0])) continue;
      for (let t = -hw + 0.8; t < hw - 0.6; t += 1.5) g.fillRect(cx - 1.6, z + t, 3.2, 0.75);
    }
    for (const side of [-1, 1]) {
      const cz = z + side * (hw + 5.5);
      for (let t = -vw + 0.8; t < vw - 0.6; t += 1.5) g.fillRect(x + t, cz - 1.6, 0.75, 3.2);
    }
  }

  // bridges where the side streets cross the creek
  g.strokeStyle = PLAN.rail;
  g.lineWidth = 0.8;
  g.beginPath();
  for (const r of ROADS.filter((r) => r.a[0] === r.b[0])) {
    const x = r.a[0];
    const z0 = creekEdgeAt(x) - 6;
    const off = roadWidth(r) / 2 + 4.6;
    g.moveTo(x - off, z0);
    g.lineTo(x - off, SITE.z1);
    g.moveTo(x + off, z0);
    g.lineTo(x + off, SITE.z1);
  }
  g.stroke();

  return cv;
}
