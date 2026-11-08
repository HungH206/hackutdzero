import { useEffect, useMemo, useState } from 'react';
import type { Building, Checkin, Escalation, Household, NodeRow, Priority, Snapshot } from './types';

// Display helpers only. Nothing here scores a household: rank, HPI, band and
// reason all come from the priority table written by recompute_hpi.

export const STEP_LABEL = ['Monitoring', 'Check-in sent', 'Emergency contact', 'Neighbor knock', 'Responder dispatched'] as const;
export const FINAL_LABEL = {
  unresolved: 'Unresolved',
  found_ok: 'Found, OK',
  found_needs_help: 'Found, needs help',
  assisted: 'Assisted',
} as const;
export const CHECKIN_LABEL = {
  none: 'No prompt',
  pending: 'Prompt sent',
  no_response: 'No response',
  ok: 'Answered OK',
  help: 'Pressed HELP',
} as const;

/** Scenario time in microseconds (wall clock plus the demo fast-forward), ticking every second. */
export function useScenarioNow(offsetMicros: number): number {
  const [wall, setWall] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setWall(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return wall * 1000 + offsetMicros;
}

export interface View {
  households: Household[];
  hh: Map<number, Household>;
  prio: Map<number, Priority>;
  node: Map<number, NodeRow>;
  checkin: Map<number, Checkin>;
  esc: Map<number, Escalation>;
  building: Map<number, Building>;
  queue: Household[];
  counts: { total: number; ok: number; help: number; assisted: number; unresolved: number; unknown: number; accounted: number };
  disasterActive: boolean;
}

const byKey = <T, K>(rows: T[], key: (r: T) => K) => new Map(rows.map((r) => [key(r), r]));

export function useView(s: Snapshot): View {
  return useMemo(() => {
    const prio = byKey(s.priorities, (p) => p.householdId);
    const households = [...s.households].sort((a, b) => a.id - b.id);
    const queue = households
      .filter((h) => (prio.get(h.id)?.rank ?? 0) > 0)
      .sort((a, b) => prio.get(a.id)!.rank - prio.get(b.id)!.rank);
    const counts = { total: households.length, ok: 0, help: 0, assisted: 0, unresolved: 0, unknown: 0, accounted: 0 };
    for (const h of households) {
      if (!h.hasSensor && h.finalState === 'unresolved') counts.unknown++;
      else if (h.finalState === 'found_ok') counts.ok++;
      else if (h.finalState === 'found_needs_help') counts.help++;
      else if (h.finalState === 'assisted') counts.assisted++;
      else counts.unresolved++;
    }
    counts.accounted = counts.ok + counts.help + counts.assisted;
    return {
      households,
      hh: byKey(households, (h) => h.id),
      prio,
      node: byKey(s.nodes, (n) => n.householdId),
      checkin: byKey(s.checkins, (c) => c.householdId),
      esc: byKey(s.escalations, (e) => e.householdId),
      building: byKey(s.buildings, (b) => b.id),
      queue,
      counts,
      disasterActive: s.disasters.some((d) => d.active),
    };
  }, [s]);
}

export function clockText(micros: number): string {
  return new Date(micros / 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function countdown(targetMicros: number, nowMicros: number): string {
  const s = Math.max(0, Math.round((targetMicros - nowMicros) / 1e6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function agoText(micros: number, nowMicros: number): string {
  const m = Math.max(0, (nowMicros - micros) / 6e7);
  if (m < 1) return 'just now';
  if (m < 60) return `${Math.floor(m)} min ago`;
  return `${Math.floor(m / 60)} h ${Math.floor(m % 60)} min ago`;
}

export const bandOf = (h: Household, p: Priority | undefined) => (!h.hasSensor ? 'unknown' : (p?.band ?? 'low'));
