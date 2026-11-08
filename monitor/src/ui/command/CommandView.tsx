import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { agoText, clockText, countdown, STEP_LABEL, type View } from '../../data/derive';
import type { Household, Snapshot } from '../../data/types';
import { STATION } from '../MapCanvas';
import type { GraphFilter } from '../py/Graph';
import './command.css';

// Main dashboard: the real neighborhood. Streets, the creek, building
// footprints and every home at its real position, with the hazards, responder
// routes and the dispatch queue on top. Everything is read from server rows:
// the queue is the priority table's rank order, and every score keeps its reason.

const W = 1000;
const H = 640;
const BOX = { x: -40, y: -24, w: W + 70, h: H + 64 };
const CX = BOX.x + BOX.w / 2;
const CY = BOX.y + BOX.h / 2;
const CEDAR_Y = 300;

const ROADS = [
  { name: 'Ridge Rd', d: 'M-80 62 H1080', major: false, lx: 860, ly: 62, v: false },
  { name: 'Cedar Ave', d: `M-80 ${CEDAR_Y} H1080`, major: true, lx: 520, ly: CEDAR_Y, v: false },
  { name: 'Maple St', d: 'M-80 538 H742', major: false, lx: 520, ly: 538, v: false },
  { name: 'Hollow Ln', d: 'M362 -60 V700', major: false, lx: 362, ly: 452, v: true },
  { name: 'Mill St', d: 'M642 -60 V700', major: false, lx: 642, ly: 452, v: true },
];

type Status = 'calm' | 'ok' | 'assisted' | 'help' | 'critical' | 'open' | 'unknown';

function statusOf(view: View, h: Household): Status {
  if (!h.hasSensor && h.finalState === 'unresolved') return 'unknown';
  if (h.finalState === 'found_ok') return view.disasterActive ? 'ok' : 'calm';
  if (h.finalState === 'assisted') return 'assisted';
  if (h.finalState === 'found_needs_help') return 'help';
  const p = view.prio.get(h.id);
  if (!view.disasterActive || !p?.rank) return 'calm';
  return p.band === 'critical' ? 'critical' : 'open';
}

const STATUS_LABEL: Record<Status, string> = {
  calm: 'Monitored, all clear',
  ok: 'Found OK',
  assisted: 'Assisted',
  help: 'Needs help',
  critical: 'Open, critical',
  open: 'Open, waiting',
  unknown: 'No sensor',
};

const KIND_LABEL: Record<string, string> = { quake: 'Earthquake', fire: 'Fire' };

interface Props {
  view: View;
  snapshot: Snapshot;
  now: number;
  zoom: number;
  filter: GraphFilter;
  selected: number | null;
  onSelect(id: number): void;
  onOpenBuilding(id: number): void;
  /** concern cards (fire, power clocks, help, silent, unknown) shown above the queue */
  attention?: ReactNode;
}

export function CommandView({ view, snapshot, now, zoom, filter, selected, onSelect, onOpenBuilding, attention }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const c = view.counts;
  const active = snapshot.disasters.filter((d) => d.active);
  const quakes = active.filter((d) => d.kind === 'quake');
  const fires = active.filter((d) => d.kind === 'fire');
  const t0 = active.length ? Math.min(...active.map((d) => d.confirmedAtMicros)) : null;
  const kinds = [...new Set(active.map((d) => KIND_LABEL[d.kind] ?? d.kind))];

  // Units inside each building: cell size from the spacing of its households.
  const cells = useMemo(() => {
    const out = new Map<number, { w: number; h: number }>();
    for (const b of view.building.values()) {
      const hs = view.households.filter((h) => h.buildingId === b.id);
      const xs = [...new Set(hs.map((h) => Math.round(h.x)))].sort((a, z) => a - z);
      const ys = [...new Set(hs.map((h) => Math.round(h.y)))].sort((a, z) => a - z);
      const gap = (v: number[], span: number) => (v.length > 1 ? Math.min(...v.slice(1).map((x, i) => x - v[i]!)) : span);
      out.set(b.id, { w: Math.min(gap(xs, b.w), 44), h: Math.min(gap(ys, b.h), 40) });
    }
    return out;
  }, [view]);

  const visible = (s: Status) => filter === 'all' || (filter === 'open' ? s === 'open' || s === 'critical' || s === 'help' : s === 'critical' || s === 'help');
  const dispatched = view.queue.filter((h) => view.esc.get(h.id)?.step === 4 && !view.esc.get(h.id)?.done);
  const knocks = view.disasterActive
    ? view.queue
        .filter((h) => view.esc.get(h.id)?.step === 3)
        .map((h) => {
          const from = view.households
            .filter((o) => o.finalState === 'found_ok' && o.buildingId === h.buildingId && o.id !== h.id)
            .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
          return from ? { a: from, b: h } : null;
        })
        .filter(<T,>(x: T | null): x is T => x !== null)
    : [];

  // activity: timeline rows per minute since the first confirmed event
  const spark = useMemo(() => {
    if (t0 === null) return [];
    const mins = Math.max(10, Math.ceil((now - t0) / 6e7) + 1);
    const bins = new Array(mins).fill(0) as number[];
    for (const r of snapshot.timeline) {
      const m = Math.floor((r.atMicros - t0) / 6e7);
      if (m >= 0 && m < mins) bins[m]! += 1;
    }
    return bins;
  }, [snapshot.timeline, t0, now]);
  const sparkMax = Math.max(1, ...spark);

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
    const s = Math.max(BOX.w / r.width, BOX.h / r.height) / zoom;
    setPan({ x: d.px + dx * s, y: d.py + dy * s });
  };

  const segs: [string, number, string][] = [
    ['ok', c.ok, 'Found OK'],
    ['assisted', c.assisted, 'Assisted'],
    ['help', c.help, 'Needs help'],
    ['open', c.unresolved, 'Waiting'],
    ['unknown', c.unknown, 'No sensor'],
  ];

  const marker = (h: Household) => {
    const st = statusOf(view, h);
    const p = view.prio.get(h.id);
    const n = view.node.get(h.id);
    const on = selected === h.id || hover === h.id;
    const rank = (st === 'open' || st === 'critical') && p?.rank ? p.rank : 0;
    const r = st === 'calm' ? 5 : 8.5;
    return (
      <g
        key={h.id}
        className={`cm-home ${st}${visible(st) ? '' : ' dim'}${on ? ' on' : ''}`}
        transform={`translate(${h.x} ${h.y})`}
        onPointerEnter={() => setHover(h.id)}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (!drag.current?.moved) onSelect(h.id);
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(h.id)}
        role="button"
        tabIndex={0}
        aria-label={`${h.name}, unit ${h.unit}: ${STATUS_LABEL[st]}${rank ? `, rank ${rank}` : ''}${p?.scored ? `, HPI ${p.hpi.toFixed(0)}` : ''}`}
      >
        <circle r={16} fill="transparent" />
        {st === 'critical' && <circle r={r + 4} className="cm-pulse" />}
        {selected === h.id && <circle r={r + 5} className="cm-sel" />}
        <circle r={r} className="cm-dot" />
        {(st === 'ok' || st === 'assisted') && <path d="M-3.6 0.2 L-1.1 2.7 L3.8 -2.6" className="cm-glyph" />}
        {st === 'help' && <path d="M0 -4 V0.8 M0 3.4 V3.5" className="cm-glyph" />}
        {st === 'unknown' && (
          <text y={3.4} className="cm-num q">
            ?
          </text>
        )}
        {rank > 0 && (
          <text y={3.2} className="cm-num">
            {rank}
          </text>
        )}
        {n?.flame && (
          <g transform="translate(8 -9)">
            <circle r={5.6} className="cm-badge fire" />
            <path d="M0 -3 C1.7 -1 2.1 0.4 1.4 2 A1.7 1.7 0 0 1 -1.4 2 C-2 0.5 -0.9 -0.7 0 -3Z" fill="#fff" />
          </g>
        )}
        {n?.onBattery && h.finalState !== 'assisted' && (
          <g transform="translate(-8 -9)">
            <circle r={5.2} className="cm-badge power" />
            <path d="M0.6 -3 L-1.8 0.4 H0.2 L-0.6 3 L1.8 -0.4 H-0.2 Z" fill="#fff" />
          </g>
        )}
        {on && (
          <text y={r + 13} className="cm-tip">
            {h.name} · {h.unit}
            {p?.scored && p.rank ? ` · HPI ${p.hpi.toFixed(0)}` : ''}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="cm">
      <svg
        ref={svgRef}
        className="cm-map"
        viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
        role="application"
        aria-label={`Map of Cedar Hollow. ${c.accounted} of ${c.total} households accounted for. Drag to pan.`}
      >
        <defs>
          <pattern id="cm-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="cm-hatch-line" />
          </pattern>
          <marker id="cm-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="cm-arrow" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x + CX} ${pan.y + CY}) scale(${zoom}) translate(${-CX} ${-CY})`}>
          <rect x={BOX.x - 400} y={BOX.y - 400} width={BOX.w + 800} height={BOX.h + 800} className="cm-land" />
          {/* parks and the creek */}
          <path d="M884 -60 H1100 V200 H930 Q878 170 884 96 Z" className="cm-park" />
          <path d="M-80 -60 H150 Q120 10 40 20 Q-20 26 -80 4 Z" className="cm-park" />
          <path d="M-80 626 C 100 612, 240 610, 340 636 S 520 618, 660 614 S 840 604, 1100 624 L1100 760 L-80 760 Z" className="cm-water" />
          <path d="M-80 626 C 100 612, 240 610, 340 636 S 520 618, 660 614 S 840 604, 1100 624" className="cm-bank" />
          <text x={60} y={662} className="cm-water-label">
            Cedar Creek
          </text>
          <text x={960} y={140} className="cm-park-label" textAnchor="middle">
            Hollow Park
          </text>

          {/* roads: casing, then fill, then names along the road */}
          {ROADS.map((r) => (
            <path key={`c${r.name}`} d={r.d} className={`cm-road-case${r.major ? ' major' : ''}`} />
          ))}
          {ROADS.map((r) => (
            <path key={`f${r.name}`} d={r.d} className={`cm-road${r.major ? ' major' : ''}`} />
          ))}
          {ROADS.map((r) => (
            <text key={`n${r.name}`} x={r.lx} y={r.ly + 3.5} className="cm-road-name" textAnchor="middle" transform={r.v ? `rotate(-90 ${r.lx} ${r.ly})` : undefined}>
              {r.name}
            </text>
          ))}

          {/* quake: epicenter and distance rings (1 map unit = 1 m on this synthetic map) */}
          {quakes.map((q) => (
            <g key={`q${q.id}`} className="cm-quake" pointerEvents="none">
              <circle cx={q.x} cy={q.y} r={300} className="cm-quake-area" />
              {[150, 300].map((rr) => (
                <g key={rr}>
                  <circle cx={q.x} cy={q.y} r={rr} className="cm-quake-ring" />
                  <text x={q.x} y={q.y - rr - 5} className="cm-quake-t" textAnchor="middle">
                    {rr} m
                  </text>
                </g>
              ))}
            </g>
          ))}

          {/* buildings */}
          {[...view.building.values()].map((b) => {
            const fire = fires.some((f) => f.buildingId === b.id);
            const hs = view.households.filter((h) => h.buildingId === b.id);
            const cell = cells.get(b.id)!;
            const homes = hs.length > 0;
            return (
              <g
                key={b.id}
                className={`cm-bldg${homes ? '' : ' empty'}${fire ? ' fire' : ''}`}
                role={homes ? 'button' : undefined}
                tabIndex={homes ? 0 : undefined}
                aria-label={homes ? `${b.name}: open building view` : `${b.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (homes && !drag.current?.moved) onOpenBuilding(b.id);
                }}
                onKeyDown={(e) => homes && (e.key === 'Enter' || e.key === ' ') && onOpenBuilding(b.id)}
              >
                <rect x={b.x - 10 + 3} y={b.y - 10 + 4} width={b.w + 20} height={b.h + 20} rx={2} className="cm-shadow" />
                <rect x={b.x - 10} y={b.y - 10} width={b.w + 20} height={b.h + 20} rx={2} className="cm-foot" />
                {!homes && <rect x={b.x - 10} y={b.y - 10} width={b.w + 20} height={b.h + 20} rx={2} fill="url(#cm-hatch)" />}
                {hs.map((h) => (
                  <rect key={h.id} x={h.x - cell.w / 2 + 1.5} y={h.y - cell.h / 2 + 1.5} width={cell.w - 3} height={cell.h - 3} rx={1} className="cm-unit" />
                ))}
                <text x={b.x - 10} y={b.y - 17} className="cm-bldg-name">
                  {b.name}
                  <tspan className="cm-bldg-meta">{homes ? `  ${hs.length} units · ${b.floors} fl · ${b.builtYear}` : `  ${b.kind}`}</tspan>
                </text>
              </g>
            );
          })}
          {/* single-family homes without a building record get their own small footprint */}
          {view.households
            .filter((h) => !view.building.has(h.buildingId))
            .map((h) => (
              <g key={`sf${h.id}`} pointerEvents="none">
                <rect x={h.x - 15 + 2} y={h.y - 13 + 3} width={30} height={26} rx={2} className="cm-shadow" />
                <rect x={h.x - 15} y={h.y - 13} width={30} height={26} rx={2} className="cm-foot" />
                <path d={`M${h.x - 15} ${h.y} H${h.x + 15}`} className="cm-ridge" />
              </g>
            ))}

          {/* responder station */}
          <g pointerEvents="none">
            <rect x={STATION.x - 46 + 2} y={STATION.y - 44 + 3} width={42} height={30} rx={2} className="cm-shadow" />
            <rect x={STATION.x - 46} y={STATION.y - 44} width={42} height={30} rx={2} className="cm-foot station" />
            <rect x={STATION.x - 33} y={STATION.y - 37} width={16} height={16} rx={4} className="cm-station-mark" />
            <path d={`M${STATION.x - 25} ${STATION.y - 33} v8 M${STATION.x - 29} ${STATION.y - 29} h8`} className="cm-station-cross" />
            <text x={STATION.x - 2} y={STATION.y - 52} className="cm-bldg-name" textAnchor="end">
              Station 7
              <tspan className="cm-bldg-meta"> EMS · simulated</tspan>
            </text>
          </g>

          {/* responder routes: station, along Cedar Ave, up the side street */}
          {dispatched.map((h) => (
            <g key={`r${h.id}`} pointerEvents="none">
              <path d={`M${STATION.x - 25} ${STATION.y - 14} V${CEDAR_Y} H${h.x} V${h.y + (h.y < CEDAR_Y ? 12 : -12)}`} className="cm-route-case" />
              <path d={`M${STATION.x - 25} ${STATION.y - 14} V${CEDAR_Y} H${h.x} V${h.y + (h.y < CEDAR_Y ? 12 : -12)}`} className="cm-route" markerEnd="url(#cm-arrow)" />
            </g>
          ))}
          {/* volunteer knock: a found neighbor walking over */}
          {knocks.map((k) => (
            <path key={`k${k.b.id}`} d={`M${k.a.x} ${k.a.y} L${k.b.x} ${k.b.y}`} className="cm-knock" markerEnd="url(#cm-arrow)" pointerEvents="none" />
          ))}

          {/* epicenter mark sits above the buildings */}
          {quakes.map((q) => (
            <g key={`e${q.id}`} transform={`translate(${q.x} ${q.y})`} pointerEvents="none" className="cm-epi">
              <circle r={7} />
              <path d="M-14 0 H-9 M9 0 H14 M0 -14 V-9 M0 9 V14" />
              <text x={12} y={-10} className="cm-epi-t">
                Epicenter · {clockText(q.confirmedAtMicros)}
              </text>
            </g>
          ))}

          {view.households.map(marker)}

          {/* scale bar */}
          <g transform="translate(-20 600)" pointerEvents="none" className="cm-scale">
            <path d="M0 0 V5 H100 V0" />
            <text x={50} y={-4} textAnchor="middle">
              100 m
            </text>
          </g>
        </g>
      </svg>

      <aside className="cm-side" aria-label="Incident and dispatch queue">
        <section className="cm-card cm-incident">
          <div className={`cm-state${view.disasterActive ? ' live' : ''}`}>
            <i />
            {view.disasterActive ? kinds.join(' + ') : 'All clear'}
            <span>{t0 !== null ? `confirmed ${clockText(t0)} · ${agoText(t0, now)}` : 'monitoring'}</span>
          </div>
          <div className="cm-count">
            <b>{view.disasterActive ? c.accounted : c.total}</b>
            <span>{view.disasterActive ? `of ${c.total} households accounted for` : 'households monitored'}</span>
          </div>
          <div className="cm-bar" role="img" aria-label={segs.map(([, n, l]) => `${l} ${n}`).join(', ')}>
            {segs.map(([k, n]) => (n > 0 ? <i key={k} className={k} style={{ flexGrow: n }} /> : null))}
          </div>
          <ul className="cm-keys">
            {segs.map(([k, n, l]) => (
              <li key={k}>
                <i className={k} />
                {l}
                <b>{n}</b>
              </li>
            ))}
          </ul>
          {spark.length > 0 && (
            <svg className="cm-spark" viewBox={`0 0 ${spark.length * 6} 28`} preserveAspectRatio="none" aria-label="Events per minute since the event">
              {spark.map((v, i) => (
                <rect key={i} x={i * 6 + 1} y={28 - (v / sparkMax) * 26} width={4} height={(v / sparkMax) * 26} rx={1} />
              ))}
            </svg>
          )}
        </section>

        {attention}

        <section className="cm-card cm-queue">
          <h2>
            Dispatch queue <span>{view.queue.length} open</span>
          </h2>
          {view.queue.length === 0 ? (
            <p className="cm-empty">{view.disasterActive ? 'Everyone with a sensor is accounted for.' : 'No open households. Start a simulation to see the queue.'}</p>
          ) : (
            <ol>
              {view.queue.map((h) => {
                const p = view.prio.get(h.id);
                const e = view.esc.get(h.id);
                const b = view.building.get(h.buildingId);
                return (
                  <li key={h.id}>
                    <button
                      className={`cm-row${selected === h.id ? ' sel' : ''}${hover === h.id ? ' hov' : ''}`}
                      onClick={() => onSelect(h.id)}
                      onPointerEnter={() => setHover(h.id)}
                      onPointerLeave={() => setHover(null)}
                    >
                      <span className={`cm-rank ${p?.band ?? 'low'}`}>{p?.rank ?? '–'}</span>
                      <span className="cm-row-main">
                        <span className="cm-row-name">
                          {h.name} <em>{b ? `${b.name} ${h.unit}` : h.unit}</em>
                        </span>
                        <span className="cm-row-reason">{p?.reason ?? ''}</span>
                        <span className="cm-row-step">
                          {[1, 2, 3, 4].map((j) => (
                            <i key={j} className={(e?.step ?? 0) >= j ? 'on' : ''} />
                          ))}
                          {e && e.step > 0 ? STEP_LABEL[e.step] : 'Not started'}
                          {e && !e.done && e.step > 0 && e.step < 4 ? ` · next in ${countdown(e.nextAtMicros, now)}` : ''}
                        </span>
                      </span>
                      <span className={`cm-hpi ${p?.band ?? 'low'}`}>{p?.scored ? p.hpi.toFixed(0) : '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </aside>

      <div className="cm-legend" aria-label="Map key">
        {(['critical', 'open', 'help', 'ok', 'assisted', 'unknown'] as Status[]).map((s) => (
          <span key={s}>
            <svg width="14" height="14" viewBox="-8 -8 16 16" aria-hidden="true" className={`cm-home ${s}`}>
              <circle r={6} className="cm-dot" />
            </svg>
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span>
          <svg width="14" height="14" viewBox="-8 -8 16 16" aria-hidden="true">
            <path d="M-7 0 H7" className="cm-route" />
          </svg>
          Responder route
        </span>
      </div>
    </div>
  );
}
