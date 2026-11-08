import type { View } from '../data/derive';

// Damage estimate for the State Farm agent view. A SIMULATION: every number here is an assumption
// shown on the page, not a measurement and not an actuarial model.
//
// Each household is assumed to carry the same claim limit. For each household the estimate is
//   loss = limit x damage ratio
// where the ratio comes from what the module already knows about the household:
//   - fire:  the node reports flame, or a large temperature rise  -> fire ratio
//   - quake: otherwise, the exposure E (0..1, shaking at the node, building risk, neighbors) scales
//            the quake ratio.
// Low / likely / high just swap in a lower or higher ceiling for each ratio.

export const DEFAULT_LIMIT = 250_000;

export type Scenario = 'low' | 'likely' | 'high';

/** Ceiling damage ratio per hazard, as a share of the claim limit. */
export const CEILING: Record<Scenario, { quake: number; fire: number }> = {
  low: { quake: 0.2, fire: 0.4 },
  likely: { quake: 0.35, fire: 0.6 },
  high: { quake: 0.5, fire: 1 },
};

/** Temperature rise (deg C) at a node that counts as a fire even if the flame sensor has not tripped. */
export const FIRE_TEMP_RISE_C = 15;
/** A household counts as "affected" once its likely loss passes this share of the limit. */
const AFFECTED_RATIO = 0.05;

export interface HouseholdLoss {
  id: number;
  buildingId: number;
  hazard: 'quake' | 'fire' | null;
  low: number;
  likely: number;
  high: number;
}

export interface Estimate {
  limit: number;
  households: number;
  exposure: number;
  active: boolean;
  low: number;
  likely: number;
  high: number;
  quake: number;
  fire: number;
  affected: number;
  fires: number;
  byBuilding: { buildingId: number; name: string; likely: number; affected: number }[];
  perHousehold: HouseholdLoss[];
}

/** The live database column is `e`; the in-process fallback uses `E`. Read either. */
const exposureOf = (p: object): number => {
  const row = p as { E?: number; e?: number };
  return row.E ?? row.e ?? 0;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function estimateDamage(view: View, limit = DEFAULT_LIMIT): Estimate {
  const perHousehold: HouseholdLoss[] = view.households.map((h) => {
    const empty = { id: h.id, buildingId: h.buildingId, hazard: null, low: 0, likely: 0, high: 0 } as HouseholdLoss;
    if (!view.disasterActive) return empty;
    const node = view.node.get(h.id);
    const p = view.prio.get(h.id);
    const onFire = Boolean(node && (node.flame || node.tempRiseC >= FIRE_TEMP_RISE_C));
    if (onFire) {
      return { ...empty, hazard: 'fire', low: limit * CEILING.low.fire, likely: limit * CEILING.likely.fire, high: limit * CEILING.high.fire };
    }
    const e = p?.scored ? clamp01(exposureOf(p)) : 0;
    if (e === 0) return empty;
    return {
      ...empty,
      hazard: 'quake',
      low: limit * CEILING.low.quake * e,
      likely: limit * CEILING.likely.quake * e,
      high: limit * CEILING.high.quake * e,
    };
  });

  const sum = (f: (l: HouseholdLoss) => number) => perHousehold.reduce((a, l) => a + f(l), 0);
  const buildings = new Map<number, { likely: number; affected: number }>();
  for (const l of perHousehold) {
    const b = buildings.get(l.buildingId) ?? { likely: 0, affected: 0 };
    b.likely += l.likely;
    if (l.likely >= limit * AFFECTED_RATIO) b.affected += 1;
    buildings.set(l.buildingId, b);
  }

  return {
    limit,
    households: view.households.length,
    exposure: limit * view.households.length,
    active: view.disasterActive,
    low: sum((l) => l.low),
    likely: sum((l) => l.likely),
    high: sum((l) => l.high),
    quake: sum((l) => (l.hazard === 'quake' ? l.likely : 0)),
    fire: sum((l) => (l.hazard === 'fire' ? l.likely : 0)),
    affected: perHousehold.filter((l) => l.likely >= limit * AFFECTED_RATIO).length,
    fires: perHousehold.filter((l) => l.hazard === 'fire').length,
    byBuilding: [...buildings.entries()]
      .map(([buildingId, v]) => ({ buildingId, name: view.building.get(buildingId)?.name ?? `Building ${buildingId}`, ...v }))
      .filter((b) => b.likely > 0)
      .sort((a, b) => b.likely - a.likely),
    perHousehold,
  };
}

/** $1.2M, $850K, $0. Whole thousands are enough for an estimate. */
export function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}
