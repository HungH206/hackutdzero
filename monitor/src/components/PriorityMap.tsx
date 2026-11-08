import { useMemo } from 'react';
import type { View } from '../data/derive';
import { bandOf } from '../data/derive';
import type { Disaster } from '../data/types';

export type Layer = 'hazard' | 'outage' | 'power' | 'coverage';
export const LAYERS: { id: Layer; label: string }[] = [
  { id: 'hazard', label: 'Hazard footprint' },
  { id: 'outage', label: 'Comms outage' },
  { id: 'power', label: 'Power-loss clocks' },
  { id: 'coverage', label: 'Sensor coverage' },
];

const BAND_COLOR: Record<string, string> = {
  low: 'var(--low)',
  guarded: 'var(--guarded)',
  high: 'var(--high)',
  critical: 'var(--critical)',
  unknown: 'var(--unknown)',
};

interface Props {
  view: View;
  disasters: Disaster[];
  layers: Set<Layer>;
  hovered: number | null;
  selected: number | null;
  onHover(id: number | null): void;
  onSelect(id: number): void;
}

// The basemap is drawn here so the demo never depends on internet tiles.
const ROADS = [
  { d: 'M0 62 H1000', name: 'Ridge Rd', x: 920, y: 56 },
  { d: 'M0 300 H1000', name: 'Cedar Ave', x: 905, y: 294 },
  { d: 'M0 538 H740', name: 'Maple St', x: 360, y: 532 },
  { d: 'M362 0 V640', name: 'Hollow Ln', x: 368, y: 630 },
  { d: 'M642 0 V640', name: 'Mill St', x: 648, y: 630 },
];

export function PriorityMap({ view, disasters, layers, hovered, selected, onHover, onSelect }: Props) {
  const unknownZone = useMemo(() => {
    const pts = view.households.filter((h) => !h.hasSensor);
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs) - 70, y: Math.min(...ys) - 32, w: Math.max(...xs) - Math.min(...xs) + 140, h: Math.max(...ys) - Math.min(...ys) + 58 };
  }, [view.households]);

  // Draw low priority first so urgent markers sit on top.
  const ordered = useMemo(
    () => [...view.households].sort((a, b) => (view.prio.get(a.id)?.hpi ?? 0) - (view.prio.get(b.id)?.hpi ?? 0)),
    [view],
  );
  const quakes = disasters.filter((d) => d.active && d.kind === 'quake');
  const fireBuildings = new Set(disasters.filter((d) => d.active && d.kind === 'fire').map((d) => d.buildingId));

  return (
    <svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Live priority map of Cedar Hollow (fictional)">
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#161b22" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#3b4554" strokeWidth="3" />
        </pattern>
        <radialGradient id="quake">
          <stop offset="0%" stopColor="#f85149" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f85149" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1000" height="640" fill="#10161e" />
      <path d="M0 610 C 180 590, 300 640, 470 605 S 760 585, 1000 612" stroke="#1d3349" strokeWidth="16" fill="none" opacity="0.8" />
      <text x="20" y="602" fill="#2f4a66" fontSize="11">Cedar Creek</text>
      {ROADS.map((r) => (
        <g key={r.name}>
          <path d={r.d} stroke="#1c2430" strokeWidth="16" />
          <path d={r.d} stroke="#263040" strokeWidth="1" strokeDasharray="6 8" />
          <text x={r.x} y={r.y} fill="#4a5668" fontSize="10" textAnchor="middle">
            {r.name}
          </text>
        </g>
      ))}

      {layers.has('hazard') &&
        quakes.map((q) => (
          <g key={q.id}>
            <circle cx={q.x} cy={q.y} r={420} fill="url(#quake)" />
            {[140, 280, 420].map((r) => (
              <circle key={r} cx={q.x} cy={q.y} r={r} fill="none" stroke="#f85149" strokeOpacity={0.35 - r / 2000} strokeDasharray="4 6" />
            ))}
            <text x={q.x} y={q.y - 6} fill="#ff9b94" fontSize="11" textAnchor="middle">
              ✱ epicenter
            </text>
          </g>
        ))}

      {[...view.building.values()].map((b) => {
        const onFire = fireBuildings.has(b.id);
        return (
          <g key={b.id}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={6}
              fill={b.kind === 'multifamily' ? '#18202b' : '#151a22'}
              stroke={onFire && layers.has('hazard') ? 'var(--critical)' : '#2a3443'}
              strokeWidth={onFire ? 2 : 1}
              className={onFire ? 'flame' : undefined}
            />
            <text x={b.x + 8} y={b.y - 6} fill="#6b788b" fontSize="11">
              {b.name}
              {b.kind === 'multifamily' ? ` · ${b.floors} fl · ${b.builtYear}` : ''}
            </text>
          </g>
        );
      })}

      {unknownZone && (
        <g>
          <rect {...unknownZone} rx={6} fill="url(#hatch)" stroke="#4a5568" strokeDasharray="4 4" />
          <text x={unknownZone.x + 8} y={unknownZone.y - 6} fill="#8b98a9" fontSize="11">
            Unknown: no sensors here (not "safe")
          </text>
        </g>
      )}

      {layers.has('coverage') &&
        view.households
          .filter((h) => h.hasSensor)
          .map((h) => <circle key={`cov${h.id}`} cx={h.x} cy={h.y} r={34} fill="#79c0ff" opacity={0.05} />)}

      {layers.has('outage') &&
        view.households
          .filter((h) => view.prio.get(h.id)?.commsOutage)
          .map((h) => <circle key={`out${h.id}`} cx={h.x} cy={h.y} r={30} fill="#8b98a9" opacity={0.16} stroke="#8b98a9" strokeDasharray="2 4" />)}

      {ordered.map((h) => {
        const p = view.prio.get(h.id);
        const n = view.node.get(h.id);
        const band = bandOf(h, p);
        const hpi = p?.hpi ?? 0;
        const rank = p?.rank ?? 0;
        const isHot = hovered === h.id || selected === h.id;
        const offline = n ? !n.online : false;
        let fill = BAND_COLOR[band]!;
        let glyph = rank > 0 && rank <= 10 ? String(rank) : '';
        let r = 7 + hpi * 0.1;
        if (h.finalState === 'found_ok') {
          fill = 'var(--ok)';
          glyph = '✓';
          r = 8;
        } else if (h.finalState === 'assisted') {
          fill = 'var(--assisted)';
          glyph = 'A';
          r = 8;
        } else if (!h.hasSensor) {
          glyph = '?';
          r = 9;
        } else if (h.finalState === 'found_needs_help' && !glyph) {
          glyph = '!';
        }
        const pulsing = band === 'critical' && rank > 0;
        const flame = n?.flame;
        const tth = p && p.tthMin >= 0 ? Math.round(p.tthMin) : null;
        return (
          <g
            key={h.id}
            className="marker"
            onMouseEnter={() => onHover(h.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(h.id)}
            role="button"
            aria-label={`${h.name} ${h.unit}, ${band}, HPI ${hpi}${rank ? `, rank ${rank}` : ''}`}
          >
            {pulsing && <circle className="pulse" cx={h.x} cy={h.y} r={r} fill="none" stroke={fill} strokeWidth={2} />}
            <circle
              className="body"
              cx={h.x}
              cy={h.y}
              r={r}
              fill={h.hasSensor ? fill : '#1b2330'}
              fillOpacity={h.finalState === 'found_ok' || h.finalState === 'assisted' ? 0.85 : 1}
              stroke={isHot ? '#ffffff' : h.hasSensor ? '#0d1117' : 'var(--unknown)'}
              strokeWidth={isHot ? 3 : 1.5}
              strokeDasharray={offline && h.hasSensor && !isHot ? '3 2' : undefined}
            />
            {glyph && (
              <text x={h.x} y={h.y + 4} fontSize={glyph.length > 1 ? 10 : 11} fill={h.hasSensor ? '#0d1117' : '#8b98a9'} textAnchor="middle">
                {glyph}
              </text>
            )}
            {flame && layers.has('hazard') && (
              <text x={h.x + r + 2} y={h.y - r + 2} fontSize="14" className="flame">
                🔥
              </text>
            )}
            {layers.has('power') && n?.onBattery && tth !== null && (
              <text x={h.x} y={h.y + r + 12} fontSize="10" textAnchor="middle" fill="var(--guarded)" fontWeight={700} stroke="#0d1117" strokeWidth={3} paintOrder="stroke">
                ⚡ {tth} min
              </text>
            )}
            {isHot && (
              <text x={h.x} y={h.y - r - 6} fontSize="11" textAnchor="middle" fill="#e6edf3" fontWeight={600} stroke="#0d1117" strokeWidth={3} paintOrder="stroke">
                {h.name} · {h.unit}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
