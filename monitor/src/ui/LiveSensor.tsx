import type { Household, NodeRow } from '../data/types';

// Shows that a household is driven by a real hardware node (the Raspberry Pi),
// and what that node just reported. Read-only: it only displays node rows.

// Households whose node is registered to real hardware. The module's `simulated` flag is
// the source of truth; this list only covers resets on module versions that cleared it.
const LIVE_HOUSEHOLDS = (import.meta.env.VITE_LIVE_HOUSEHOLDS ?? '1').split(',').map(Number);

const RECENT_MICROS = 60e6; // a shake in the last 60 s of scenario time counts as "just now"

export interface SensorState {
  live: boolean;
  online: boolean;
  shakingAgoS: number | null;
  flame: boolean;
}

export function sensorState(h: Household | undefined, n: NodeRow | undefined, now: number): SensorState {
  const shakeAt = Number((n as (NodeRow & { shakeAtMicros?: number }) | undefined)?.shakeAtMicros ?? 0);
  const ago = shakeAt > 0 ? now - shakeAt : Infinity;
  return {
    live: !!h && (!h.simulated || LIVE_HOUSEHOLDS.includes(h.id)),
    online: !!n?.online,
    shakingAgoS: ago >= 0 && ago <= RECENT_MICROS ? Math.round(ago / 1e6) : null,
    flame: !!n?.flame,
  };
}

/** Small inline chips: "Live sensor", plus "Shaking detected 4 s ago" / "Flame detected". */
export function LiveSensorBadge({ h, n, now, compact }: { h?: Household; n?: NodeRow; now: number; compact?: boolean }) {
  const s = sensorState(h, n, now);
  if (!s.live) return null;
  return (
    <span className="ls-badges" aria-live="polite">
      <span className={`ls-chip ls-live${s.online ? '' : ' off'}`} title="Real hardware node (Raspberry Pi) in this home">
        <i aria-hidden /> {s.online ? 'Live sensor' : 'Sensor offline'}
      </span>
      {s.shakingAgoS !== null && (
        <span className="ls-chip ls-alert" title="Reported by the real shock sensor">
          Shaking detected{compact ? '' : ` · ${s.shakingAgoS}s ago`}
        </span>
      )}
      {s.flame && <span className="ls-chip ls-alert">Flame detected</span>}
    </span>
  );
}

/** A strip for the main screen: every household with a real node, always visible. */
export function LiveSensorStrip({ households, nodes, buildings, now, onSelect }: {
  households: Household[];
  nodes: Map<number, NodeRow>;
  buildings: Map<number, { name: string }>;
  now: number;
  onSelect: (id: number) => void;
}) {
  const live = households.filter((h) => !h.simulated || LIVE_HOUSEHOLDS.includes(h.id));
  if (!live.length) return null;
  return (
    <section className="cm-card ls-strip" aria-label="Live hardware sensors">
      <h2>Live hardware</h2>
      {live.map((h) => (
        <button key={h.id} className="ls-row" onClick={() => onSelect(h.id)}>
          <span className="ls-name">{h.name} <em>{buildings.get(h.buildingId)?.name} {h.unit}</em></span>
          <LiveSensorBadge h={h} n={nodes.get(h.id)} now={now} />
        </button>
      ))}
    </section>
  );
}
