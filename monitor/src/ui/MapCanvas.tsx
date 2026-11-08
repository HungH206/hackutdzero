import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import type { View } from '../data/derive';
import { bandOf } from '../data/derive';
import type { Disaster, Household } from '../data/types';
import { BAND_COLOR } from './Gauges';
import { Icon, iconPath, type IconName } from './Icon';

export type Layer = 'heat' | 'hazard' | 'responders' | 'outage' | 'power' | 'coverage';
export const LAYERS: { id: Layer; label: string; icon: IconName }[] = [
  { id: 'heat', label: 'Priority heat', icon: 'activity' },
  { id: 'hazard', label: 'Hazard footprint', icon: 'quake' },
  { id: 'responders', label: 'Responders & volunteers', icon: 'siren' },
  { id: 'outage', label: 'Comms outage', icon: 'wifiOff' },
  { id: 'power', label: 'Power-loss clocks', icon: 'zap' },
  { id: 'coverage', label: 'Sensor coverage', icon: 'radio' },
];

const W = 1000;
const H = 640;
/** Simulated EMS station. Units drive from here along the roads. */
export const STATION = { x: 982, y: 300, name: 'Station 7 · EMS (simulated)' };
const MAIN_ROAD_Y = 300;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const FULL: Box = { x: -20, y: -10, w: W + 40, h: H + 20 };

interface Props {
  view: View;
  disasters: Disaster[];
  now: number;
  layers: Set<Layer>;
  hovered: number | null;
  selected: number | null;
  onHover(id: number | null): void;
  onSelect(id: number | null): void;
  onToggleLayer(l: Layer): void;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Point a fraction of the way along a polyline. */
function along(pts: { x: number; y: number }[], f: number) {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  let d = Math.max(0, Math.min(1, f)) * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]! || i === segs.length - 1) {
      const t = segs[i]! === 0 ? 0 : Math.min(1, d / segs[i]!);
      return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t };
    }
    d -= segs[i]!;
  }
  return pts[pts.length - 1]!;
}

export function MapCanvas({ view, disasters, now, layers, hovered, selected, onHover, onSelect, onToggleLayer }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<Box>(FULL);
  const boxRef = useRef(box);
  boxRef.current = box;
  const anim = useRef(0);
  const drag = useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);

  const flyTo = useCallback((target: Box) => {
    cancelAnimationFrame(anim.current);
    if (reduced()) return setBox(target);
    const from = boxRef.current;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 450);
      const e = 1 - Math.pow(1 - k, 3);
      setBox({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  // Fly to the selected household.
  useEffect(() => {
    if (selected === null) return;
    const h = view.hh.get(selected);
    if (!h) return;
    const w = 760;
    flyTo({ x: h.x - w * 0.42, y: h.y - (w * H) / W / 2, w, h: (w * H) / W });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const toSvg = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const scale = Math.max(box.w / r.width, box.h / r.height); // meet: the larger ratio is the fitted one
    const offX = (r.width * scale - box.w) / 2;
    const offY = (r.height * scale - box.h) / 2;
    return { x: box.x - offX + (cx - r.left) * scale, y: box.y - offY + (cy - r.top) * scale, scale };
  };

  const zoomBy = (f: number, cx?: number, cy?: number) => {
    const b = boxRef.current;
    const p = cx !== undefined && cy !== undefined ? toSvg(cx, cy) : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const w = Math.min(FULL.w * 1.3, Math.max(180, b.w * f));
    const h = (w * b.h) / b.w;
    const next = { x: p.x - ((p.x - b.x) * w) / b.w, y: p.y - ((p.y - b.y) * h) / b.h, w, h };
    if (cx === undefined) flyTo(next);
    else setBox(next);
  };

  const onWheel = (e: RWheelEvent) => {
    cancelAnimationFrame(anim.current);
    zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  };
  const onPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(anim.current);
    drag.current = { x: e.clientX, y: e.clientY, box, moved: false };
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    d.moved = true;
    const { scale } = toSvg(e.clientX, e.clientY);
    setBox({ ...d.box, x: d.box.x - dx * scale, y: d.box.y - dy * scale });
  };
  const onPointerUp = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && (e.target as Element).tagName === 'rect' && (e.target as Element).classList.contains('bg')) onSelect(null);
  };

  const zoomPct = Math.round((FULL.w / box.w) * 100);

  const unknownZone = useMemo(() => {
    const pts = view.households.filter((h) => !h.hasSensor);
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs) - 70, y: Math.min(...ys) - 32, w: Math.max(...xs) - Math.min(...xs) + 140, h: Math.max(...ys) - Math.min(...ys) + 58 };
  }, [view.households]);

  const ordered = useMemo(() => [...view.households].sort((a, b) => (view.prio.get(a.id)?.hpi ?? 0) - (view.prio.get(b.id)?.hpi ?? 0)), [view]);
  const quakes = disasters.filter((d) => d.active && d.kind === 'quake');
  const fireBuildings = new Set(disasters.filter((d) => d.active && d.kind === 'fire').map((d) => d.buildingId));

  // Responder units and volunteers, positioned from the escalation table's own times.
  const movers = useMemo(() => {
    const units: { h: Household; route: { x: number; y: number }[]; pos: { x: number; y: number }; arrived: boolean }[] = [];
    const walkers: { h: Household; from: { x: number; y: number }; pos: { x: number; y: number } }[] = [];
    const calls: Household[] = [];
    for (const h of view.households) {
      const e = view.esc.get(h.id);
      if (!e || e.done || h.finalState === 'found_ok' || h.finalState === 'assisted') continue;
      const span = Math.max(1, e.nextAtMicros - e.stepAtMicros);
      const f = (now - e.stepAtMicros) / span;
      if (e.step === 4) {
        const route = [STATION, { x: STATION.x - 40, y: MAIN_ROAD_Y }, { x: h.x, y: MAIN_ROAD_Y }, { x: h.x, y: h.y }];
        units.push({ h, route, pos: along(route, Math.min(1, f * 1.1)), arrived: f >= 0.9 });
      } else if (e.step === 3) {
        const helper = view.households
          .filter((o) => o.id !== h.id && o.finalState === 'found_ok')
          .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
        const from = helper ? { x: helper.x, y: helper.y } : { x: h.x + 60, y: h.y + 40 };
        walkers.push({ h, from, pos: along([from, h], Math.min(1, f * 1.2)) });
      } else if (e.step === 2) calls.push(h);
    }
    return { units, walkers, calls };
  }, [view, now]);

  const selHousehold = selected !== null ? view.hh.get(selected) : undefined;

  return (
    <div className="map-canvas">
      <svg
        ref={svgRef}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (drag.current = null)}
        role="application"
        aria-label="Live priority map of Cedar Hollow, a fictional neighborhood. Drag to pan, scroll to zoom."
      >
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#e9e5dd" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#d6cfc2" strokeWidth="2.5" />
          </pattern>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#000000" strokeOpacity="0.03" />
          </pattern>
          <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id="shock">
            <stop offset="0%" stopColor="#ff4d5e" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ff4d5e" stopOpacity="0" />
          </radialGradient>
          {(['low', 'guarded', 'high', 'critical', 'unknown'] as const).map((b) => (
            <radialGradient key={b} id={`orb-${b}`} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="28%" stopColor={BAND_COLOR[b]} />
              <stop offset="100%" stopColor={BAND_COLOR[b]} stopOpacity="0.7" />
            </radialGradient>
          ))}
          {(['low', 'guarded', 'high', 'critical'] as const).map((b) => (
            <radialGradient key={b} id={`heat-${b}`}>
              <stop offset="0%" stopColor={BAND_COLOR[b]} stopOpacity="0.2" />
              <stop offset="100%" stopColor={BAND_COLOR[b]} stopOpacity="0" />
            </radialGradient>
          ))}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Basemap, drawn in-app so the demo never depends on map tiles. */}
        <rect className="bg" x={-600} y={-600} width={W + 1200} height={H + 1200} fill="#e9e5dd" />
        <rect className="bg" x={-600} y={-600} width={W + 1200} height={H + 1200} fill="url(#grid)" />
        <path d="M-200 612 C 180 588, 300 650, 470 606 S 760 586, 1200 616 L1200 900 L-200 900z" fill="#b9cfd9" />
        <path d="M-200 612 C 180 588, 300 650, 470 606 S 760 586, 1200 616" stroke="#9cb4bf" strokeWidth="3" fill="none" />
        <text x={30} y={636} className="map-label water">
          Cedar Creek
        </text>
        <path d="M880 20 h120 v170 h-80 q-50 -30 -40 -90z" fill="#d3ddc3" stroke="#c5d1b4" />
        <text x={905} y={60} className="map-label park">
          Hollow Park
        </text>
        {Array.from({ length: 24 }, (_, i) => (
          <line key={`v${i}`} x1={i * 45 + 10} y1={-40} x2={i * 45 + 10} y2={680} stroke="#e2ded6" strokeWidth={2} />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <line key={`h${i}`} x1={-40} y1={i * 45 + 8} x2={1040} y2={i * 45 + 8} stroke="#e2ded6" strokeWidth={2} />
        ))}
        {[
          { d: 'M-60 62 H1060', n: 'RIDGE RD', x: 760, y: 56 },
          { d: `M-60 ${MAIN_ROAD_Y} H1060`, n: 'CEDAR AVE', x: 760, y: 294 },
          { d: 'M-60 538 H740', n: 'MAPLE ST', x: 470, y: 532 },
          { d: 'M362 -40 V680', n: 'HOLLOW LN', x: 0, y: 0, vx: 356, vy: 470 },
          { d: 'M642 -40 V680', n: 'MILL ST', x: 0, y: 0, vx: 636, vy: 470 },
        ].map((r) => (
          <g key={r.n}>
            <path d={r.d} stroke="#fdfcfa" strokeWidth={15} />
            <path d={r.d} stroke="#e2dccf" strokeWidth={1} strokeDasharray="5 9" />
            {'vx' in r ? (
              <text x={r.vx} y={r.vy} className="map-label road" transform={`rotate(-90 ${r.vx} ${r.vy})`}>
                {r.n}
              </text>
            ) : (
              <text x={r.x} y={r.y} className="map-label road">
                {r.n}
              </text>
            )}
          </g>
        ))}

        {layers.has('coverage') &&
          view.households.filter((h) => h.hasSensor).map((h) => <circle key={`cov${h.id}`} cx={h.x} cy={h.y} r={38} fill="#7dd3fc" opacity={0.045} />)}

        {[...view.building.values()].map((b) => {
          const onFire = fireBuildings.has(b.id);
          return (
            <g key={b.id}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} className={`bldg${onFire && layers.has('hazard') ? ' fire' : ''}`} />
              <text x={b.x + 10} y={b.y - 8} className="map-label bldg-name">
                {b.name.toUpperCase()}
                <tspan className="bldg-meta">{b.kind === 'multifamily' ? `  ${b.floors} FL · ${b.builtYear}` : ''}</tspan>
              </text>
            </g>
          );
        })}

        {unknownZone && (
          <g>
            <rect {...unknownZone} rx={10} fill="url(#hatch)" stroke="#8a8f98" strokeDasharray="4 4" />
            <text x={unknownZone.x + 10} y={unknownZone.y - 8} className="map-label bldg-name">
              UNKNOWN · NO SENSORS (NOT “SAFE”)
            </text>
          </g>
        )}

        <g transform={`translate(${STATION.x} ${STATION.y})`}>
          <rect x={-16} y={-16} width={32} height={32} rx={9} fill="#ffffff" stroke="#1f6feb" />
          <path d={iconPath('siren')} transform="translate(-9 -9) scale(0.75)" fill="none" stroke="#1f6feb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <text x={-22} y={34} className="map-label station" textAnchor="end">
            STATION 7 · EMS (SIM)
          </text>
        </g>

        {layers.has('heat') &&
          view.queue.map((h) => {
            const p = view.prio.get(h.id)!;
            return <circle key={`heat${h.id}`} cx={h.x} cy={h.y} r={22 + p.hpi * 0.55} fill={`url(#heat-${p.band})`} className="heat" />;
          })}

        {layers.has('hazard') &&
          quakes.map((q) => (
            <g key={q.id} pointerEvents="none">
              <circle cx={q.x} cy={q.y} r={300} fill="none" stroke="#d92d20" strokeWidth={1.5} strokeDasharray="6 5" />
              <path d={`M${q.x - 6} ${q.y}H${q.x + 6}M${q.x} ${q.y - 6}V${q.y + 6}`} stroke="#d92d20" strokeWidth={1.5} />
              <text x={q.x + 10} y={q.y - 10} className="map-label epi">
                EPICENTER
              </text>
            </g>
          ))}

        {layers.has('outage') &&
          view.households
            .filter((h) => view.prio.get(h.id)?.commsOutage)
            .map((h) => <circle key={`out${h.id}`} cx={h.x} cy={h.y} r={26} fill="#94a3b8" fillOpacity={0.08} stroke="#94a3b8" strokeOpacity={0.5} strokeDasharray="2 4" />)}

        {layers.has('responders') && (
          <g pointerEvents="none">
            {movers.units.map((u) => (
              <g key={`u${u.h.id}`}>
                <polyline points={u.route.map((p) => `${p.x},${p.y}`).join(' ')} className="route" />
                <g transform={`translate(${u.pos.x} ${u.pos.y})`} filter={undefined}>
                  <circle r={9} className={`unit${u.arrived ? ' arrived' : ''}`} />
                  <path d={iconPath('siren')} transform="translate(-6 -6) scale(0.5)" fill="none" stroke="#fff" strokeWidth={2.4} />
                </g>
              </g>
            ))}
            {movers.walkers.map((w) => (
              <g key={`w${w.h.id}`}>
                <line x1={w.from.x} y1={w.from.y} x2={w.h.x} y2={w.h.y} className="walk" />
                <circle cx={w.pos.x} cy={w.pos.y} r={5} className="walker" />
              </g>
            ))}
            {movers.calls.map((h) => (
              <g key={`c${h.id}`}>
                <circle cx={h.x} cy={h.y} r={14} className="callwave" />
                <circle cx={h.x} cy={h.y} r={14} className="callwave" style={{ animationDelay: '0.8s' }} />
              </g>
            ))}
          </g>
        )}

        {selHousehold && (
          <g pointerEvents="none">
            <circle cx={selHousehold.x} cy={selHousehold.y} r={34} className="sel-ring" />
            <circle cx={selHousehold.x} cy={selHousehold.y} r={34} fill="#000000" fillOpacity={0.04} />
          </g>
        )}

        {ordered.map((h) => {
          const p = view.prio.get(h.id);
          const n = view.node.get(h.id);
          const band = bandOf(h, p);
          const hpi = p?.hpi ?? 0;
          const rank = view.disasterActive ? (p?.rank ?? 0) : 0;
          const hot = hovered === h.id || selected === h.id;
          const offline = n ? !n.online : false;
          const done = h.finalState === 'found_ok' || h.finalState === 'assisted';
          const r = done ? 7 : !h.hasSensor ? 8 : 6 + hpi * 0.1;
          const tth = p && p.tthMin >= 0 ? Math.round(p.tthMin) : null;
          const fill = h.finalState === 'found_ok' ? 'var(--ok)' : h.finalState === 'assisted' ? 'var(--assisted)' : band === 'critical' ? 'var(--critical)' : band === 'high' || band === 'guarded' ? 'var(--waiting)' : 'var(--unknown)';
          return (
            <g
              key={h.id}
              className={`mk${hot ? ' hot' : ''}`}
              onPointerEnter={() => onHover(h.id)}
              onPointerLeave={() => onHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(h.id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(h.id)}
              aria-label={`${h.name}, unit ${h.unit}. ${h.hasSensor ? `${band}, HPI ${hpi}` : 'unknown, no sensor'}${rank ? `, rank ${rank}` : ''}`}
            >
              {band === 'critical' && rank > 0 && <circle cx={h.x} cy={h.y} r={r} className="pulse" stroke={BAND_COLOR.critical} />}
              <circle cx={h.x} cy={h.y} r={r + 6} fill="transparent" />
              <circle
                cx={h.x}
                cy={h.y}
                r={r}
                fill={h.hasSensor ? fill : '#8a8f98'}
                stroke={hot ? '#1d1d1f' : '#ffffff'}
                strokeWidth={hot ? 2 : 1}
                strokeDasharray={offline && h.hasSensor && !done ? '2.5 2' : undefined}
                className="orb"
                filter={undefined}
              />
              {done && (
                <path
                  d={iconPath(h.finalState === 'found_ok' ? 'check' : 'shield')}
                  transform={`translate(${h.x - 5} ${h.y - 5}) scale(0.42)`}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {!h.hasSensor && (
                <text x={h.x} y={h.y + 3.5} className="mk-glyph" fill="#94a3b8">
                  ?
                </text>
              )}
              {!done && h.hasSensor && rank > 0 && rank <= 9 && r >= 9 && (
                <text x={h.x} y={h.y + 3.5} className="mk-glyph">
                  {rank}
                </text>
              )}
              {n?.flame && layers.has('hazard') && (
                <path d={iconPath('flame')} transform={`translate(${h.x + r - 2} ${h.y - r - 14}) scale(0.62)`} className="mk-flame" />
              )}
              {layers.has('power') && n?.onBattery && tth !== null && !done && (
                <g transform={`translate(${h.x} ${h.y + r + 4})`}>
                  <rect x={-22} y={0} width={44} height={13} rx={6.5} className="pwr-chip" />
                  <text x={0} y={9.5} className="pwr-txt">
                    {tth} MIN
                  </text>
                </g>
              )}
              {!done && rank > 0 && rank <= 5 && (
                <g transform={`translate(${h.x + r + 5} ${h.y - 8})`} className="mk-tag">
                  <rect width={h.name.length * 5.4 + 40} height={16} rx={8} />
                  <text x={7} y={11.2}>
                    <tspan className="mk-tag-rank">#{rank}</tspan> {h.name} · {hpi.toFixed(0)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        
      </svg>

      <div className="map-tools" role="toolbar" aria-label="Map controls">
        <div className="compass" aria-hidden="true">
          <span>N</span>
          <small>{zoomPct}%</small>
        </div>
        <div className="tool-stack">
          <button className="tool" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom in">
            <Icon name="plus" />
          </button>
          <button className="tool" onClick={() => zoomBy(1.4)} aria-label="Zoom out">
            <Icon name="minus" />
          </button>
          <button className="tool" onClick={() => flyTo(FULL)} aria-label="Show whole neighborhood">
            <Icon name="locate" />
          </button>
          <button className={`tool${layersOpen ? ' on' : ''}`} onClick={() => setLayersOpen((o) => !o)} aria-label="Map layers" aria-expanded={layersOpen}>
            <Icon name="layers" />
          </button>
        </div>
        {layersOpen && (
          <div className="layers-pop glass" role="menu">
            <div className="eyebrow">Map layers</div>
            {LAYERS.map((l) => (
              <button key={l.id} className={`layer-row${layers.has(l.id) ? ' on' : ''}`} onClick={() => onToggleLayer(l.id)} role="menuitemcheckbox" aria-checked={layers.has(l.id)}>
                <Icon name={l.icon} size={16} />
                <span>{l.label}</span>
                <span className="switch" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="map-hint">Drag to pan · scroll to zoom · map drawn offline</div>
    </div>
  );
}
