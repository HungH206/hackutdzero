import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { View } from '../../data/derive';
import type { Household } from '../../data/types';
import { hash, kindOf } from './kind';
import { Orb, OrbDefs, Sun, type OrbKind } from './Orb';

// Main dashboard graph, after the policy-platform reference: the neighborhood
// is the gold hub, buildings are bezel orbs on light beams, households orbit
// their building. Everything is read from server rows.

const W = 1400;
const H = 900;
const CX = W / 2 - 90;
const CY = H / 2 - 40;

export type GraphFilter = 'all' | 'open' | 'help';

interface Props {
  view: View;
  zoom: number;
  filter: GraphFilter;
  selected: number | null;
  onSelect(id: number): void;
  onOpenBuilding(id: number): void;
}

interface HubLayout {
  id: number;
  name: string;
  x: number;
  y: number;
  a: number;
  hs: { h: Household; x: number; y: number; r: number; kind: OrbKind }[];
  pct: number;
  open: number;
  hot: boolean;
}

export function Graph({ view, zoom, filter, selected, onSelect, onOpenBuilding }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const hubs: HubLayout[] = useMemo(() => {
    const groups = [...view.building.values()]
      .map((b) => ({ id: b.id, name: b.name, hs: view.households.filter((h) => h.buildingId === b.id) }))
      .filter((g) => g.hs.length);
    const orphans = view.households.filter((h) => !view.building.has(h.buildingId));
    if (orphans.length) groups.push({ id: -1, name: 'Homes without sensors', hs: orphans });
    const n = groups.length;
    return groups.map((g, i) => {
      // Start just left of 12 o'clock so no hub lands bottom-right, under the command bar.
      const a = (i / n) * Math.PI * 2 - Math.PI / 2 - 0.35 + (hash(g.id) - 0.5) * 0.2;
      const rad = 255 + hash(g.id + 9) * 110;
      const x = CX + Math.cos(a) * rad * 1.28;
      const y = CY + Math.sin(a) * rad * 0.86;
      const hs = g.hs.map((h, j) => {
        const spread = (j - (g.hs.length - 1) / 2) / Math.max(1, g.hs.length - 1);
        const ang = a + spread * 2.5 + (hash(h.id) - 0.5) * 0.4;
        const d = 62 + hash(h.id + 3) * 78 + (j % 3) * 10;
        const kind = kindOf(view, h);
        const hpi = view.prio.get(h.id)?.hpi ?? 0;
        const r = kind === 'ember' ? 8 + hpi * 0.05 : kind === 'violet' ? 6 + hpi * 0.06 : kind === 'amber' ? 7.5 : 4.6;
        return { h, x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d, r, kind };
      });
      const acc = g.hs.filter((h) => h.finalState !== 'unresolved').length;
      const open = g.hs.filter((h) => view.prio.get(h.id)?.rank).length;
      const hot = g.hs.some((h) => view.prio.get(h.id)?.band === 'critical' && view.prio.get(h.id)?.rank) || g.hs.some((h) => view.node.get(h.id)?.flame);
      return { id: g.id, name: g.name, x, y, a, hs, pct: Math.round((acc / g.hs.length) * 100), open, hot };
    });
  }, [view]);

  const visible = (k: OrbKind) => filter === 'all' || (filter === 'open' ? k === 'violet' || k === 'ember' || k === 'amber' : k === 'amber' || k === 'ember');

  // Volunteer knocks: a found neighbor walking to a household at ladder step 3.
  const pos = new Map(hubs.flatMap((g) => g.hs.map((s) => [s.h.id, s] as const)));
  const knocks = view.disasterActive
    ? view.queue
        .filter((h) => view.esc.get(h.id)?.step === 3)
        .map((h) => {
          const from = view.households
            .filter((o) => o.finalState === 'found_ok' && o.buildingId === h.buildingId)
            .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
          return from && pos.get(from.id) && pos.get(h.id) ? { a: pos.get(from.id)!, b: pos.get(h.id)! } : null;
        })
        .filter(<T,>(x: T | null): x is T => x !== null)
    : [];
  const dispatched = view.queue.filter((h) => view.esc.get(h.id)?.step === 4 && !view.esc.get(h.id)?.done).map((h) => pos.get(h.id)).filter(Boolean) as HubLayout['hs'];

  const c = view.counts;

  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    d.moved = true;
    const r = svgRef.current!.getBoundingClientRect();
    const s = Math.max(W / r.width, H / r.height) / zoom;
    setPan({ x: d.px + dx * s, y: d.py + dy * s });
  };

  return (
    <svg
      ref={svgRef}
      className="py-graph"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
      role="application"
      aria-label={`Neighborhood graph. ${c.accounted} of ${c.total} households accounted for. Drag to pan.`}
    >
      <defs>
        <OrbDefs />
        <linearGradient id="beam-gold" x1="0" x2="1">
          <stop offset="0%" stopColor="#ffe3a6" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#e8b56b" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#e8b56b" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="beam-teal" x1="0" x2="1">
          <stop offset="0%" stopColor="#bff6ee" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#5fd0c4" stopOpacity="0.05" />
        </linearGradient>
        <filter id="beam-blur" x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id="spark" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${pan.x + CX} ${pan.y + CY}) scale(${zoom}) translate(${-CX} ${-CY})`}>
        {/* faint background rays, like the long beams that leave the frame in the reference */}
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 + 0.17;
          const len = 520 + hash(i + 40) * 260;
          return <line key={i} x1={CX} y1={CY} x2={CX + Math.cos(a) * len} y2={CY + Math.sin(a) * len} stroke="#9fe3db" strokeOpacity={0.05} strokeWidth={1} />;
        })}

        {/* center -> building beams */}
        {hubs.map((g) => {
          const dx = g.x - CX;
          const dy = g.y - CY;
          const len = Math.hypot(dx, dy);
          const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          const w = g.hot ? 14 : 8;
          return (
            <g key={`beam${g.id}`} transform={`translate(${CX} ${CY}) rotate(${deg})`} pointerEvents="none">
              <path d={`M 34 0 Q ${len * 0.45} ${-w} ${len - 30} 0 Q ${len * 0.45} ${w} 34 0 Z`} fill="url(#beam-gold)" filter="url(#beam-blur)" opacity={g.hot ? 1 : 0.75} />
              <path d={`M 34 0 Q ${len * 0.45} ${-w * 0.28} ${len - 30} 0 Q ${len * 0.45} ${w * 0.28} 34 0 Z`} fill="url(#beam-gold)" opacity={0.9} />
              <line x1={34} y1={0} x2={len - 30} y2={0} stroke="#fff1cf" strokeOpacity={g.hot ? 0.85 : 0.45} strokeWidth={g.hot ? 1.3 : 0.8} />
              {view.disasterActive && g.open > 0 && (
                <circle r={2.2} fill="#fff6dc" filter="url(#spark)" className="py-travel" style={{ ['--len' as string]: `${len - 64}px`, animationDelay: `${hash(g.id) * 2}s` }} cx={34} />
              )}
            </g>
          );
        })}

        {/* building -> household spokes */}
        {hubs.map((g) =>
          g.hs.map((s) =>
            visible(s.kind) ? (
              <line
                key={`sp${s.h.id}`}
                x1={g.x}
                y1={g.y}
                x2={s.x}
                y2={s.y}
                stroke={s.kind === 'ember' ? '#ff8fa0' : s.kind === 'amber' ? '#ffd27a' : s.kind === 'violet' ? '#bda9ff' : '#8fded2'}
                strokeOpacity={hover === s.h.id || selected === s.h.id ? 0.9 : 0.32}
                strokeWidth={0.8}
                strokeDasharray={s.kind === 'mint' || s.kind === 'sky' ? undefined : '2 3'}
                pointerEvents="none"
              />
            ) : null,
          ),
        )}

        {/* volunteer knocks: teal light line from a found neighbor */}
        {knocks.map((k, i) => (
          <g key={`k${i}`} pointerEvents="none">
            <line x1={k.a.x} y1={k.a.y} x2={k.b.x} y2={k.b.y} stroke="url(#beam-teal)" strokeWidth={1.6} />
            <circle cx={k.b.x} cy={k.b.y} r={2} fill="#c9fff6" filter="url(#spark)" />
          </g>
        ))}

        {/* responders: bright point traveling from the hub to the household */}
        {dispatched.map((s) => (
          <g key={`d${s.h.id}`} pointerEvents="none">
            <line x1={CX} y1={CY} x2={s.x} y2={s.y} stroke="#9fd8ff" strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="1 5" />
            <circle r={2.6} fill="#e6f6ff" filter="url(#spark)">
              <animateMotion dur="3.2s" repeatCount="indefinite" path={`M${CX},${CY} L${s.x},${s.y}`} />
            </circle>
          </g>
        ))}

        {/* households */}
        {hubs.map((g) =>
          g.hs.map((s) => {
            if (!visible(s.kind)) return null;
            const p = view.prio.get(s.h.id);
            const rank = view.disasterActive && (s.kind === 'violet' || s.kind === 'ember' || s.kind === 'amber') ? (p?.rank ?? 0) : 0;
            const on = hover === s.h.id || selected === s.h.id;
            return (
              <g
                key={`h${s.h.id}`}
                className="py-node"
                onPointerEnter={() => setHover(s.h.id)}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!drag.current?.moved) onSelect(s.h.id);
                }}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(s.h.id)}
                role="button"
                tabIndex={0}
                aria-label={`${s.h.name}, ${s.kind === 'mint' ? 'found OK' : s.kind}${rank ? `, rank ${rank}` : ''}`}
              >
                <circle cx={s.x} cy={s.y} r={s.r + 9} fill="transparent" />
                {s.kind === 'ember' && <circle cx={s.x} cy={s.y} r={s.r + 4} className="py-pulse" />}
                <Orb kind={s.kind} x={s.x} y={s.y} r={s.r} bezel={s.r >= 6} bloom={s.kind === 'mint' ? 1.8 : 2.6} />
                {on && <circle cx={s.x} cy={s.y} r={s.r + 6} fill="none" stroke="#f2e2bd" strokeWidth={1} />}
                {rank > 0 && (
                  <g transform={`translate(${s.x + s.r + 2} ${s.y - s.r - 12})`} pointerEvents="none">
                    <rect width={rank > 9 ? 17 : 12} height={11} rx={5.5} className={`py-badge${s.kind === 'ember' ? ' crit' : ''}`} />
                    <text x={rank > 9 ? 8.5 : 6} y={8.2} className="py-badge-t">
                      {rank}
                    </text>
                  </g>
                )}
                {on && (
                  <text x={s.x} y={s.y + s.r + 16} className="py-hover">
                    {s.h.name} · {s.h.unit}
                    {p?.scored && p.rank ? ` · HPI ${p.hpi.toFixed(0)}` : ''}
                  </text>
                )}
              </g>
            );
          }),
        )}

        {/* building hubs */}
        {hubs.map((g) => {
          const left = Math.cos(g.a) < -0.15;
          return (
            <g
              key={`b${g.id}`}
              className="py-node"
              onClick={(e) => {
                e.stopPropagation();
                if (!drag.current?.moved && g.id > 0) onOpenBuilding(g.id);
              }}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && g.id > 0 && onOpenBuilding(g.id)}
              role="button"
              tabIndex={0}
              aria-label={`${g.name}: ${g.pct}% accounted for, ${g.open} open. Open building view.`}
            >
              <circle cx={g.x} cy={g.y} r={30} fill="transparent" />
              <Orb kind={g.id < 0 ? 'slate' : 'rose'} x={g.x} y={g.y} r={14} bloom={g.hot ? 3.4 : 2.4} />
              <g transform={`translate(${g.x + (left ? -24 : 24)} ${g.y - 2})`} pointerEvents="none">
                <text className="py-label" textAnchor={left ? 'end' : 'start'}>
                  {g.name}
                </text>
                <g transform={`translate(${left ? -46 : 0} 8)`}>
                  <path d="M4 0 H46 L42 14 H0 Z" className="py-tag" />
                  <text x={23} y={10.5} className="py-tag-t">
                    {view.disasterActive ? `${g.pct}%` : `${g.hs.length}`}
                    <tspan className="py-tag-u">{view.disasterActive ? ' found' : ' homes'}</tspan>
                  </text>
                </g>
              </g>
            </g>
          );
        })}

        {/* neighborhood hub */}
        <Sun x={CX} y={CY} r={30} />
        <g transform={`translate(${CX + 58} ${CY + 4})`} pointerEvents="none">
          <text className="py-label big">Cedar Hollow</text>
          <g transform="translate(0 9)">
            <path d="M4 0 H92 L88 16 H0 Z" className="py-tag" />
            <text x={46} y={12} className="py-tag-t">
              {view.disasterActive ? `${c.accounted}/${c.total}` : `${c.total}`}
              <tspan className="py-tag-u">{view.disasterActive ? ' accounted' : ' homes'}</tspan>
            </text>
          </g>
        </g>
      </g>
    </svg>
  );
}
