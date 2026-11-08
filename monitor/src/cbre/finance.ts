import type { BuildingImpact } from './model';

// Finance layer for the CBRE view. SYNTHETIC assumptions, documented in the
// README ("CBRE view"). It only re-prices the estimates from model.ts; it never
// touches the HPI or anything about people.

export const BI_WAIT_H = 72; // loss-of-rents cover starts after a 72 h waiting period
const OPEX_RATIO: Record<string, number> = { multifamily: 0.42, office: 0.38, warehouse: 0.18 };
const QUAKE_DED = 0.02; // quake deductible: 2% of building value
const AOP_DED = 25000; // all-other-perils (fire, power) deductible, flat

export interface Finance {
  x: BuildingImpact;
  revenue: number; // lost revenue over the horizon
  repairs: number; // expected repair cost
  gross: number;
  deductible: number;
  propClaim: number; // repairs above the deductible
  rentClaim: number; // lost rent after the waiting period
  retained: number; // what the owner keeps: gross - claims
  annualNoi: number;
  noiHit: number; // retained / annual NOI, 0..n
  stabilizeDays: number;
}

export function financeOf(x: BuildingImpact, horizonH: number): Finance {
  const revenue = x.revenueAtRisk(horizonH);
  const repairs = x.repairCost;
  const quakeDriven = !x.fire && x.shaking > 0.05;
  const deductible = quakeDriven ? x.prop.value * QUAKE_DED : AOP_DED;
  const propClaim = Math.max(0, repairs - deductible);
  const rentClaim = horizonH > BI_WAIT_H ? Math.max(0, revenue - x.revenueAtRisk(BI_WAIT_H)) : 0;
  const gross = revenue + repairs;
  const retained = Math.max(0, gross - propClaim - rentClaim);
  const annualNoi = 12 * x.prop.monthlyRevenue * x.prop.occupancy * (1 - (OPEX_RATIO[x.kind] ?? 0.4));
  return { x, revenue, repairs, gross, deductible, propClaim, rentClaim, retained, annualNoi, noiHit: annualNoi ? retained / annualNoi : 0, stabilizeDays: x.downtimeH / 24 };
}

export function sumFinance(fs: Finance[]) {
  const s = { revenue: 0, repairs: 0, gross: 0, deductible: 0, propClaim: 0, rentClaim: 0, retained: 0, annualNoi: 0 };
  for (const f of fs) for (const k of Object.keys(s) as (keyof typeof s)[]) s[k] += f[k];
  return { ...s, noiHit: s.annualNoi ? s.retained / s.annualNoi : 0 };
}

// Cash out by time t (hours), for the cash-flow chart. Rent is lost as it
// accrues; repairs (and the matching property claim) are paid evenly across the
// repair window, so the curve starts at zero instead of jumping at t = 0.
export function curveAt(xs: BuildingImpact[], t: number) {
  let gross = 0;
  let retained = 0;
  for (const x of xs) {
    const f = financeOf(x, t);
    const paid = x.downtimeH > 0 ? Math.min(1, t / x.downtimeH) : 1;
    const g = f.revenue + f.repairs * paid;
    gross += g;
    retained += Math.max(0, g - f.propClaim * paid - f.rentClaim);
  }
  return { gross, retained };
}
