import type { View } from '../../data/derive';
import type { Building, Household } from '../../data/types';
import type { GraphFilter } from '../py/Graph';

// Shared by the 3D map, the flat fallback map and the side panel. Nothing here
// computes priority: status comes from final_state plus the priority table's
// rank and band, exactly as the server wrote them.

export const CEDAR_Y = 300;

export type Status = 'calm' | 'ok' | 'assisted' | 'help' | 'critical' | 'open' | 'unknown';

export function statusOf(view: View, h: Household): Status {
  if (!h.hasSensor && h.finalState === 'unresolved') return 'unknown';
  if (h.finalState === 'found_ok') return view.disasterActive ? 'ok' : 'calm';
  if (h.finalState === 'assisted') return 'assisted';
  if (h.finalState === 'found_needs_help') return 'help';
  const p = view.prio.get(h.id);
  if (!view.disasterActive || !p?.rank) return 'calm';
  return p.band === 'critical' ? 'critical' : 'open';
}

export const STATUS_LABEL: Record<Status, string> = {
  calm: 'Monitored, all clear',
  ok: 'Found OK',
  assisted: 'Assisted',
  help: 'Needs help',
  critical: 'Open, critical',
  open: 'Open, waiting',
  unknown: 'No sensor',
};

export const KIND_LABEL: Record<string, string> = { quake: 'Earthquake', fire: 'Fire' };

export function visibleUnder(filter: GraphFilter, s: Status) {
  if (filter === 'all') return true;
  if (filter === 'open') return s === 'open' || s === 'critical' || s === 'help';
  return s === 'critical' || s === 'help';
}

/** Street grid of Cedar Hollow in map units (1 unit = 1 m on this synthetic map). */
export interface Road {
  name: string;
  major: boolean;
  a: [number, number];
  b: [number, number];
  /** where the name sits */
  at: [number, number];
}

export const ROADS: Road[] = [
  { name: 'Ridge Rd', major: false, a: [-80, 62], b: [1080, 62], at: [52, 62] },
  { name: 'Cedar Ave', major: true, a: [-80, CEDAR_Y], b: [1080, CEDAR_Y], at: [505, CEDAR_Y] },
  { name: 'Maple St', major: false, a: [-80, 538], b: [742, 538], at: [400, 538] },
  { name: 'Hollow Ln', major: false, a: [362, -60], b: [362, 700], at: [362, 352] },
  { name: 'Mill St', major: false, a: [642, -60], b: [642, 700], at: [642, 352] },
];

export const roadWidth = (r: Road) => (r.major ? 19 : 13);

/** Households with a responder on the way (ladder step 4, not done), in queue order. */
export function dispatchedOf(view: View) {
  return view.queue.filter((h) => view.esc.get(h.id)?.step === 4 && !view.esc.get(h.id)?.done);
}

/** Volunteer knocks (ladder step 3): the closest neighbor already found OK in the same building. */
export function knocksOf(view: View) {
  if (!view.disasterActive) return [];
  const out: { a: Household; b: Household }[] = [];
  for (const h of view.queue) {
    if (view.esc.get(h.id)?.step !== 3) continue;
    const from = view.households
      .filter((o) => o.finalState === 'found_ok' && o.buildingId === h.buildingId && o.id !== h.id)
      .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (from) out.push({ a: from, b: h });
  }
  return out;
}

/**
 * Built form of each building. Apartment blocks wrap their unit grid (the
 * households' x/y) with half a unit of margin; the rest of the footprint is
 * the lot (parking, lawn). Heights are exaggerated about 4x so the blocks
 * read from above (cartographic vertical exaggeration); floors keep their
 * real count.
 */
export interface Mass {
  b: Building;
  kind: 'multifamily' | 'office' | 'warehouse';
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** wall height */
  h: number;
  /** height of one floor */
  fh: number;
  lot: { x0: number; x1: number; z0: number; z1: number };
  units: number;
}

export function massesOf(buildings: Iterable<Building>, households: Household[]): Mass[] {
  const out: Mass[] = [];
  for (const b of buildings) {
    const lot = { x0: b.x - 10, x1: b.x + b.w + 10, z0: b.y - 10, z1: Math.min(b.y + b.h + 10, 602) };
    const hs = households.filter((h) => h.buildingId === b.id);
    const kind = b.kind === 'office' ? 'office' : b.kind === 'warehouse' ? 'warehouse' : 'multifamily';
    if (kind === 'multifamily' && hs.length) {
      const xs = [...new Set(hs.map((h) => Math.round(h.x)))].sort((a, z) => a - z);
      const ys = [...new Set(hs.map((h) => Math.round(h.y)))].sort((a, z) => a - z);
      const gap = (v: number[], d: number) => (v.length > 1 ? Math.min(...v.slice(1).map((x, i) => x - v[i]!)) : d);
      const dx = gap(xs, 42);
      const dz = gap(ys, 30);
      const fh = 14;
      out.push({
        b,
        kind,
        x0: xs[0]! - dx / 2,
        x1: xs[xs.length - 1]! + dx / 2,
        z0: ys[0]! - dz / 2,
        z1: ys[ys.length - 1]! + dz / 2,
        h: b.floors * fh,
        fh,
        lot,
        units: hs.length,
      });
    } else if (kind === 'office') {
      const fh = 12;
      out.push({ b, kind, x0: b.x + 10, x1: b.x + b.w - 10, z0: b.y + 10, z1: b.y + b.h - 10, h: b.floors * fh, fh, lot, units: 0 });
    } else {
      out.push({ b, kind: 'warehouse', x0: b.x + 5, x1: b.x + b.w - 5, z0: b.y + 5, z1: Math.min(b.y + b.h - 5, 594), h: 17, fh: 17, lot, units: hs.length });
    }
  }
  return out;
}

/** Roof height a household's pin stands on. */
export const HOUSE = { w: 18, d: 13, wall: 9, ridge: 7 };
export function roofTop(masses: Mass[], h: Household) {
  const m = masses.find((x) => x.b.id === h.buildingId);
  if (m) return m.h + 1.2;
  return HOUSE.wall + HOUSE.ridge;
}
