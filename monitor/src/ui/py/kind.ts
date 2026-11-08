import type { View } from '../../data/derive';
import type { Household } from '../../data/types';
import type { OrbKind } from './Orb';

/** Which orb a household gets. Reads final state and the server's band only. */
export function kindOf(view: View, h: Household): OrbKind {
  if (!h.hasSensor) return 'slate';
  if (h.finalState === 'found_ok') return 'mint';
  if (h.finalState === 'assisted') return 'sky';
  if (h.finalState === 'found_needs_help') return 'amber';
  const p = view.prio.get(h.id);
  if (!view.disasterActive || !p?.rank) return 'mint';
  return p.band === 'critical' ? 'ember' : 'violet';
}

export const KIND_LABEL: Record<OrbKind, string> = {
  sun: 'Neighborhood',
  rose: 'Buildings',
  violet: 'Waiting to be reached',
  ember: 'Critical',
  amber: 'Needs help',
  mint: 'Found OK',
  sky: 'Assisted',
  slate: 'Unknown, no sensor',
  focus: 'Selected',
};

// Small deterministic hash so the layout is organic but stable between renders.
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
