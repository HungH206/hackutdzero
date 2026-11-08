import { useEffect, useMemo, useRef, useState } from 'react';
import { countdown, FINAL_LABEL, STEP_LABEL, type View } from '../../data/derive';
import type { Household } from '../../data/types';
import { Icon } from '../Icon';
import { STATION } from '../MapCanvas';
import { massesOf } from '../command/model';
import { drawSitePlan, SITE, SITE_D, SITE_W } from '../command/sitePlan';
import './houses.css';

// Calm neighborhood view, after the terrain-map reference: soft terrain with a
// tilt-shift blur toward the edges, white roads, every home drawn as a house,
// and one frosted card for the selected home. Read-only except selection.

const W = 1000;
const H = 640;
const PAD = 30;
// Extra room on the left so the summary card never sits on a building.
const BOX = { x: -300, y: -PAD - 10, w: W + 300 + PAD, h: H + PAD * 2 + 20 };
const ROAD_Y = 300;

type Status = 'ok' | 'assisted' | 'help' | 'critical' | 'waiting' | 'unknown' | 'calm';

function statusOf(view: View, h: Household): Status {
  if (!h.hasSensor) return 'unknown';
  if (h.finalState === 'found_ok') return 'ok';
  if (h.finalState === 'assisted') return 'assisted';
  if (h.finalState === 'found_needs_help') return 'help';
  const p = view.prio.get(h.id);
  if (!view.disasterActive || !p?.rank) return 'calm';
  return p.band === 'critical' || p.band === 'high' ? 'critical' : 'waiting';
}

const ROOF: Record<Status, string> = {
  calm: '#cfd8d2',
  ok: '#12a150',
  assisted: '#1f6feb',
  help: '#d92d20',
  critical: '#d92d20',
  waiting: '#e8590c',
  unknown: '#8a8f98',
};
const LABEL: Record<Status, string> = {
  calm: 'All clear',
  ok: 'Found OK',
  assisted: 'Assisted',
  help: 'Needs help',
  critical: 'Urgent',
  waiting: 'Waiting',
  unknown: 'No sensor',
};

interface Props {
  view: View;
  now: number;
  selected: number | null;
  onSelect(id: number | null): void;
  onOpen(id: number): void;
}

export function Houses({ view, now, selected, onSelect, onOpen }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  // The same fictional satellite paint as the 3D main map and the Live map.
  const geoKey = `${view.building.size}:${view.households.length}`;
  const satellite = useMemo(
    () => (view.building.size ? drawSitePlan(massesOf(view.building.values(), view.households), view.households).toDataURL('image/jpeg', 0.86) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geoKey],
  );
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRect(el.getBoundingClientRect()));
    ro.observe(el);
    setRect(el.getBoundingClientRect());
    return () => ro.disconnect();
  }, []);

  // svg -> screen, for placing the HTML card next to a house (meet scaling).
  const toScreen = (x: number, y: number) => {
    if (!rect) return { x: 0, y: 0 };
    const s = Math.min(rect.width / BOX.w, rect.height / BOX.h);
    const ox = (rect.width - BOX.w * s) / 2;
    const oy = (rect.height - BOX.h * s) / 2;
    return { x: ox + (x - BOX.x) * s, y: oy + (y - BOX.y) * s };
  };

  const sel = selected !== null ? view.hh.get(selected) : undefined;
  const c = view.counts;
  const pct = c.total ? Math.round((c.accounted / c.total) * 100) : 0;
  const dispatched = view.queue.filter((h) => view.esc.get(h.id)?.step === 4 && !view.esc.get(h.id)?.done);
  const counts = new Map<Status, number>();
  for (const h of view.households) counts.set(statusOf(view, h), (counts.get(statusOf(view, h)) ?? 0) + 1);

  const house = (h: Household) => {
    const st = statusOf(view, h);
    const on = selected === h.id || hover === h.id;
    const pin = st === 'critical' || st === 'help';
    const p = view.prio.get(h.id);
    return (
      <g
        key={h.id}
        className="hs-house"
        transform={`translate(${h.x} ${h.y})`}
        onPointerEnter={() => setHover(h.id)}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(h.id);
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(h.id)}
        role="button"
        tabIndex={0}
        aria-label={`${h.name}, unit ${h.unit}: ${LABEL[st]}${p?.rank ? `, rank ${p.rank}` : ''}`}
      >
        <g transform="scale(1.4)">
        <ellipse cx={0} cy={9} rx={11} ry={3.2} fill="#000" opacity={0.28} />
        <circle r={16} fill="transparent" />
        {/* house: walls + pitched roof + door */}
        <path d="M-8 -1 V8 H8 V-1" fill="#eef2ee" stroke={on ? '#fff' : '#1c2620'} strokeWidth={on ? 1.4 : 0.7} />
        <path d="M-11 0 L0 -10 L11 0 Z" fill={ROOF[st]} stroke="#1c2620" strokeWidth={0.7} strokeLinejoin="round" />
        <rect x={-2} y={2.5} width={4} height={5.5} rx={0.6} fill={st === 'calm' ? '#93a39a' : ROOF[st]} opacity={0.9} />
        </g>
        {pin && (
          <g transform="translate(13 -19)">
            <circle r={7} className={`hs-pin ${st}`} />
            <path d={st === 'help' ? 'M0 -3.2 V0.6 M0 2.8 V2.9' : 'M0 -3.2 V0.6 M0 2.8 V2.9'} stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
          </g>
        )}
        {view.node.get(h.id)?.flame && (
          <g transform="translate(-13 -19)">
            <circle r={6.5} className="hs-pin fire" />
            <path d="M0 -3.5 C2 -1 2.5 0.5 1.6 2.4 A2 2 0 0 1 -1.6 2.4 C-2.4 0.6 -1 -0.8 0 -3.5Z" fill="#fff" />
          </g>
        )}
        {(on || (p?.rank && p.rank <= 3)) && view.disasterActive && st !== 'ok' && (
          <text y={28} className="hs-name">
            {h.name}
          </text>
        )}
      </g>
    );
  };

  const selPos = sel ? toScreen(sel.x, sel.y) : null;
  const sp = sel ? view.prio.get(sel.id) : undefined;
  const se = sel ? view.esc.get(sel.id) : undefined;
  const sst = sel ? statusOf(view, sel) : 'calm';

  return (
    <div className="hs">
      <svg ref={svgRef} viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`} preserveAspectRatio="xMidYMid meet" onClick={() => onSelect(null)} role="application" aria-label="Neighborhood map with every home drawn as a house">
        <defs>
          <filter id="hs-terrain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="3" seed="7" />
            <feColorMatrix values="0 0 0 0 0.11  0 0 0 0 0.16  0 0 0 0 0.13  0 0 0 0.9 0" />
          </filter>
          <filter id="hs-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0" />
          </filter>
          <filter id="hs-blur">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="hs-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="hs-focus" cx="50%" cy="48%" r="58%">
            <stop offset="55%" stopColor="#fff" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
          <mask id="hs-sharp">
            <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill="url(#hs-focus)" />
          </mask>
          <radialGradient id="hs-vig" cx="50%" cy="48%" r="70%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
        </defs>

        {/* Terrain is drawn twice: blurred everywhere, sharp in the middle (tilt-shift). */}
        {[false, true].map((sharp) => (
          <g key={String(sharp)} filter={sharp ? undefined : 'url(#hs-blur)'} mask={sharp ? 'url(#hs-sharp)' : undefined}>
            <rect x={BOX.x - 50} y={BOX.y - 50} width={BOX.w + 100} height={BOX.h + 100} fill="#5d6046" />
            <rect x={BOX.x - 50} y={BOX.y - 50} width={BOX.w + 100} height={BOX.h + 100} filter="url(#hs-terrain)" opacity={0.55} />
            <path d="M-380 618 C -120 600, 180 588, 300 650 S 470 606, 620 600 S 760 586, 1100 616 L1100 760 L-380 760z" fill="#2c3b3a" />
            <path d="M-380 618 C -120 600, 180 588, 300 650 S 470 606, 620 600 S 760 586, 1100 616" stroke="#4f5b44" strokeWidth={3} fill="none" />
            <path d="M880 20 h150 v170 h-110 q-50 -30 -40 -90z" fill="#2f4134" />
            <path d="M-40 -40 h180 q-30 60 -110 70 q-50 5 -70 -20z" fill="#414b3c" opacity={0.9} />
            {[
              `M-360 62 H1060`,
              `M-360 ${ROAD_Y} H1060`,
              'M-360 538 H740',
              'M362 -40 V680',
              'M642 -40 V680',
            ].map((d) => (
              <g key={d}>
                <path d={d} stroke="#45474a" strokeWidth={12} opacity={0.95} />
                <path d={d} stroke="#ffffff" strokeWidth={0.8} strokeDasharray="6 6" opacity={0.7} />
              </g>
            ))}
            {satellite && <image href={satellite} x={SITE.x0} y={SITE.z0} width={SITE_W} height={SITE_D} preserveAspectRatio="none" />}
            {[...view.building.values()].map((b) => (
              <rect key={b.id} x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx={14} className="hs-lot" />
            ))}
          </g>
        ))}
        <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} filter="url(#hs-grain)" pointerEvents="none" />

        {[...view.building.values()].map((b) => (
          <text key={b.id} x={b.x + 4} y={b.y - 12} className="hs-lot-name">
            {b.name}
          </text>
        ))}
        <text x={-250} y={650} className="hs-water">
          Cedar Creek
        </text>

        {/* responders: dashed white route like the reference */}
        {dispatched.map((h) => (
          <g key={`r${h.id}`} pointerEvents="none">
            <path d={`M${STATION.x} ${STATION.y} H${h.x} V${h.y}`} className="hs-route" />
          </g>
        ))}
        <g transform={`translate(${STATION.x - 12} ${STATION.y})`} pointerEvents="none">
          <circle r={11} className="hs-station" />
          <path d="M-4 3 V-1 a4 4 0 0 1 8 0 V3 M-6 5 H6" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </g>

        {view.households.map(house)}

        {sel && (
          <g transform={`translate(${sel.x} ${sel.y})`} pointerEvents="none">
            <circle r={58} className="hs-radius" />
            <circle r={22} className="hs-puck" />
            <path d="M-6 6 L0 -8 L6 6 L0 2 Z" fill="#fff" transform="rotate(35)" />
          </g>
        )}
        <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill="url(#hs-vig)" pointerEvents="none" />
      </svg>

      <section className="hs-glass hs-summary" aria-label="Neighborhood status">
        <span className="hs-k">Cedar Hollow</span>
        <span className="hs-sub">{view.disasterActive ? 'Homes accounted for' : 'Homes monitored'}</span>
        <b className="hs-big">
          {view.disasterActive ? pct : c.total}
          <small>{view.disasterActive ? '%' : ''}</small>
        </b>
        <span className="hs-sub">
          {view.disasterActive ? `${c.accounted} of ${c.total} · ${view.queue.length} still waiting` : 'No confirmed event'}
        </span>
      </section>

      <section className="hs-glass hs-key" aria-label="House colors">
        {(['critical', 'help', 'waiting', 'ok', 'assisted', 'unknown', 'calm'] as Status[])
          .filter((s) => counts.get(s))
          .map((s) => (
            <span key={s}>
              <svg width="18" height="16" viewBox="-11 -11 22 20" aria-hidden="true">
                <path d="M-8 -1 V8 H8 V-1" fill="#eef2ee" />
                <path d="M-11 0 L0 -10 L11 0 Z" fill={ROOF[s]} />
              </svg>
              {LABEL[s]} <b>{counts.get(s)}</b>
            </span>
          ))}
      </section>

      {sel && selPos && (
        <section
          className="hs-glass hs-card"
          style={{ left: Math.min(selPos.x + 84, window.innerWidth - 360), top: Math.min(Math.max(90, selPos.y - 30), window.innerHeight - 300) }}
          aria-label={`${sel.name} details`}
        >
          <button className="hs-open" onClick={() => onOpen(sel.id)} aria-label="Open full record">
            <Icon name="arrowUpRight" size={20} />
          </button>
          <span className="hs-k">{sel.name}</span>
          <span className="hs-sub">
            {se && se.step > 0 && !se.done ? `Next: ${STEP_LABEL[Math.min(4, se.step + 1)] ?? STEP_LABEL[4]} in ${countdown(se.nextAtMicros, now)}` : `Unit ${sel.unit} · ${FINAL_LABEL[sel.finalState]}`}
          </span>
          <b className="hs-big">
            {sp?.scored ? sp.hpi.toFixed(0) : '—'}
            <small>{sp?.scored ? ' HPI' : ''}</small>
          </b>
          <span className={`hs-status ${sst}`}>{LABEL[sst]}</span>
          {sp?.reason && <p className="hs-reason">{sp.reason}</p>}
        </section>
      )}
    </div>
  );
}
