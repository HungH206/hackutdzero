import type { Snapshot } from '../data/types';
import { PORTFOLIO, type Property, type SystemId } from './portfolio';

// Operational-impact ESTIMATE for the CBRE view. This is not the HPI and does
// not rank people. It turns the same live events (confirmed quake, fire, power
// loss on nearby nodes) into per-building failure odds, downtime and dollars,
// using the synthetic numbers in portfolio.ts. Documented in README ("CBRE view").

export interface SystemRisk {
  id: SystemId;
  label: string;
  p: number; // probability of failure, 0..1
  hours: number; // expected downtime contribution
  cost: number; // expected repair cost
}

export interface BuildingImpact {
  prop: Property;
  name: string;
  kind: string;
  shaking: number; // 0..1 at the building
  fire: boolean;
  powerOut: number; // share of nearby nodes on battery, 0..1
  powerInferred: boolean; // true when the building has no nodes of its own
  unitsAffected: number;
  systems: SystemRisk[];
  failP: number; // chance at least one system fails
  downtimeH: number;
  repairCost: number;
  revenueAtRisk: (horizonH: number) => number;
  action: string;
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function impacts(s: Snapshot): BuildingImpact[] {
  const quakes = s.disasters.filter((d) => d.kind === 'quake' && d.active);
  const fires = new Set(s.disasters.filter((d) => d.kind === 'fire' && d.active).map((d) => d.buildingId));
  const nodes = new Map(s.nodes.map((n) => [n.householdId, n]));

  return PORTFOLIO.map((prop) => {
    const b = s.buildings.find((x) => x.id === prop.buildingId);
    const cx = b ? b.x + b.w / 2 : 0;
    const cy = b ? b.y + b.h / 2 : 0;
    const shaking = quakes.reduce((m, q) => Math.max(m, clamp(1 - Math.hypot(q.x - cx, q.y - cy) / 520)), 0);
    const own = s.households.filter((h) => h.buildingId === prop.buildingId && h.hasSensor);
    const near = own.length ? own : s.households.filter((h) => h.hasSensor && Math.hypot(h.x - cx, h.y - cy) < 260);
    const onBat = near.filter((h) => nodes.get(h.id)?.onBattery).length;
    const powerOut = near.length ? onBat / near.length : 0;
    const fire = fires.has(prop.buildingId);
    const risk = b?.risk ?? 0.5;

    const pOf = (id: SystemId): number => {
      switch (id) {
        case 'structure': return clamp(shaking * shaking * risk * 0.55);
        case 'elevator': return clamp(Math.max(shaking * (0.15 + risk * 0.3), powerOut * 0.25));
        case 'power': return clamp(Math.max(powerOut * 0.6, shaking * 0.12));
        case 'hvac': return clamp(Math.max(powerOut * 0.3, shaking * 0.12));
        case 'fire': return fire ? 0.85 : clamp(shaking * 0.08);
        case 'water': return clamp(shaking * (0.08 + risk * 0.15) + (fire ? 0.35 : 0));
      }
    };
    const systems = prop.systems
      .map((x) => {
        const p = pOf(x.id);
        return { id: x.id, label: x.label, p, hours: p * x.repairHours, cost: p * x.repairCost };
      })
      .sort((a, b2) => b2.cost - a.cost);
    const failP = 1 - systems.reduce((m, x) => m * (1 - x.p), 1);
    const downtimeH = systems.reduce((m, x) => Math.max(m, x.hours), 0) + (fire ? 48 : 0);
    const repairCost = systems.reduce((m, x) => m + x.cost, 0) + (fire ? 60000 : 0);
    const perHour = (prop.monthlyRevenue * prop.occupancy) / (30 * 24);
    const unitsAffected = Math.round(prop.units * clamp(Math.max(failP, powerOut)));
    const revenueAtRisk = (horizonH: number) => perHour * Math.min(horizonH, downtimeH) * clamp(Math.max(failP, powerOut * 0.6)) + (fire ? perHour * 24 * 30 * 0.25 : 0);

    const top = systems[0];
    const action = fire
      ? 'Fire confirmed: keep the building closed, start tenant relocation, and send the restoration contractor once the scene is released.'
      : !top || top.p < 0.08
        ? 'No action needed. Keep monitoring.'
        : top.id === 'power'
          ? `Send a mobile generator before cold-chain or medical loads fail. ${Math.round(top.p * 100)}% chance of extended outage.`
          : top.id === 'structure'
            ? `Hold re-entry until a structural engineer inspects. ${Math.round(top.p * 100)}% chance of frame damage.`
            : top.id === 'elevator'
              ? `Lock out elevators and inspect before return to service. Stair-assist residents with limited mobility.`
              : `Inspect ${top.label.toLowerCase()} first: highest expected cost at ${fmtUsd(top.cost)}.`;

    return { prop, name: b?.name ?? `Building ${prop.buildingId}`, kind: b?.kind ?? '', shaking, fire, powerOut, powerInferred: own.length === 0, unitsAffected, systems, failP, downtimeH, repairCost, revenueAtRisk, action };
  });
}

export const fmtUsd = (n: number, digits = 0) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
