import { useMemo, useState } from 'react';
import { bandOf, type View } from '../data/derive';
import type { Household } from '../data/types';
import { Icon, type IconName } from './Icon';

// Neighborhood -> buildings -> households as a glowing network.
// Visual language follows the policy-platform reference. Read-only: every
// number shown comes from server rows; nothing is scored here.

const W = 1200;
const H = 760;
const CX = W / 2;
const CY = 290;

const DOT: Record<string, string> = {
  critical: '#ff8fa6',
  high: '#f4b26a',
  guarded: '#e9c46a',
  low: '#5fd3a6',
  unknown: '#6b7a80',
};

interface Concern {
  key: string;
  tone: 'crit' | 'warn' | 'info';
  icon: IconName;
  title: string;
  ref: string;
  text: string;
  target?: number;
}

export function NetworkView({ view, onSelect }: { view: View; onSelect(id: number): void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const groups = useMemo(() => {
    const bs = [...view.building.values()]
      .map((b) => ({ b, hs: view.households.filter((h) => h.buildingId === b.id) }))
      .filter((g) => g.hs.length > 0)
      .sort((a, b) => a.b.id - b.b.id);
    const orphans = view.households.filter((h) => !view.building.has(h.buildingId));
    return { bs, orphans };
  }, [view]);

  const n = groups.bs.length + (groups.orphans.length ? 1 : 0);
  const hubs = [
    ...groups.bs.map((g, i) => ({ id: g.b.id, name: g.b.name, hs: g.hs, i })),
    ...(groups.orphans.length ? [{ id: -1, name: 'Unsensored homes', hs: groups.orphans, i: groups.bs.length }] : []),
  ].map((g) => {
    const a = (g.i / n) * Math.PI * 2 - Math.PI / 2 + 0.35;
    return { ...g, x: CX + Math.cos(a) * 420, y: CY + Math.sin(a) * 205, a };
  });

  const c = view.counts;
  const pctAll = c.total ? Math.round((c.accounted / c.total) * 100) : 0;
  const isAcc = (h: Household) => h.finalState !== 'unresolved';

  const concerns: Concern[] = [];
  const fireHomes = view.households.filter((h) => view.node.get(h.id)?.flame && h.finalState !== 'assisted');
  for (const h of fireHomes)
    concerns.push({ key: `f${h.id}`, tone: 'crit', icon: 'flame', title: 'Fire in unit', ref: `${view.building.get(h.buildingId)?.name ?? ''} ${h.unit}`, text: `${h.name}: flame sensor tripped. Neighbors in the building are exposed.`, target: h.id });
  const clocks = view.queue.filter((h) => (view.prio.get(h.id)?.tthMin ?? -1) >= 0).sort((a, b) => view.prio.get(a.id)!.tthMin - view.prio.get(b.id)!.tthMin);
  for (const h of clocks.slice(0, 2))
    concerns.push({ key: `p${h.id}`, tone: view.prio.get(h.id)!.tthMin < 60 ? 'crit' : 'warn', icon: 'zap', title: 'Power-loss clock', ref: h.medicalDevice, text: `${h.name}: ${Math.round(view.prio.get(h.id)!.tthMin)} min of backup power left.`, target: h.id });
  const help = view.households.filter((h) => h.finalState === 'found_needs_help');
  if (help.length)
    concerns.push({ key: 'help', tone: 'crit', icon: 'alert', title: 'Asked for help', ref: `${help.length} homes`, text: help.slice(0, 3).map((h) => h.name).join(', ') + (help.length > 3 ? ` +${help.length - 3}` : ''), target: help[0]!.id });
  const silent = view.queue.filter((h) => view.node.get(h.id) && !view.node.get(h.id)!.online && !view.prio.get(h.id)?.commsOutage);
  if (silent.length)
    concerns.push({ key: 'silent', tone: 'warn', icon: 'wifiOff', title: 'Gone silent', ref: `${silent.length} nodes`, text: 'Heartbeat stopped after the event. Silence is a signal.', target: silent[0]!.id });
  if (c.unknown)
    concerns.push({ key: 'unknown', tone: 'info', icon: 'search', title: 'No sensor, status unknown', ref: `${c.unknown} homes`, text: 'Not counted as safe. Needs a door knock to resolve.', target: view.households.find((h) => !h.hasSensor)?.id });
  const shown = expanded ? concerns : concerns.slice(0, 1);

  const highNeed = view.households.filter((h) => h.hasSensor && (view.prio.get(h.id)?.V ?? 0) >= 0.4);
  const stats: { icon: IconName; label: string; value: string; unit: string }[] = [
    { icon: 'users', label: 'Accounted', value: String(pctAll), unit: '%' },
    { icon: 'activity', label: 'Waiting', value: String(view.queue.length), unit: 'homes' },
    { icon: 'heart', label: 'High-need found', value: `${highNeed.filter(isAcc).length}/${highNeed.length}`, unit: '' },
    { icon: 'siren', label: 'Responders out', value: String([...view.esc.values()].filter((e) => e.step === 4 && !e.done).length), unit: '' },
  ];

  return (
    <div className="network">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Network of buildings and households">
        <defs>
          <radialGradient id="nw-sun" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#fff4d6" />
            <stop offset="45%" stopColor="#e3b46a" />
            <stop offset="100%" stopColor="#7a5a2a" />
          </radialGradient>
          {(['crit', 'calm'] as const).map((k) => (
            <radialGradient key={k} id={`nw-hub-${k}`} cx="38%" cy="32%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor={k === 'crit' ? '#ff9fb4' : '#b9a6ff'} />
              <stop offset="100%" stopColor={k === 'crit' ? '#8a2f4a' : '#4b3a8f'} />
            </radialGradient>
          ))}
          <linearGradient id="nw-ray" x1="0" x2="1">
            <stop offset="0%" stopColor="#ffd89a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7fd6d0" stopOpacity="0.15" />
          </linearGradient>
          <filter id="nw-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* far background rays */}
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2 + 0.2;
          return <line key={i} x1={CX} y1={CY} x2={CX + Math.cos(a) * 900} y2={CY + Math.sin(a) * 900} stroke="#7fd6d0" strokeOpacity={0.05} strokeWidth={1} />;
        })}

        {hubs.map((g) => {
          const open = g.hs.filter((h) => view.prio.get(h.id)?.rank).length;
          const hot = g.hs.some((h) => view.prio.get(h.id)?.band === 'critical' && view.prio.get(h.id)?.rank);
          const acc = g.hs.filter(isAcc).length;
          const pct = Math.round((acc / g.hs.length) * 100);
          const r = 16 + Math.min(14, g.hs.length * 1.4);
          // Dots fan outward, so the label sits on the side facing the center.
          const labelRight = Math.cos(g.a) < 0;
          return (
            <g key={g.id}>
              <line x1={CX} y1={CY} x2={g.x} y2={g.y} stroke="url(#nw-ray)" strokeWidth={hot ? 2.2 : 1.2} className={view.disasterActive ? 'nw-ray live' : 'nw-ray'} />
              {g.hs.map((h, j) => {
                const p = view.prio.get(h.id);
                const band = bandOf(h, p);
                const ang = g.a + ((j - (g.hs.length - 1) / 2) / Math.max(1, g.hs.length)) * 2.2;
                const dist = r + 46 + (j % 2) * 26;
                const x = g.x + Math.cos(ang) * dist;
                const y = g.y + Math.sin(ang) * dist;
                const done = h.finalState === 'found_ok' || h.finalState === 'assisted';
                const rank = view.disasterActive && !done ? (p?.rank ?? 0) : 0;
                const rr = done ? 4 : 4 + (p?.hpi ?? 0) * 0.07;
                const fill = done ? (h.finalState === 'assisted' ? '#7cb4ff' : '#3aa98a') : DOT[band]!;
                return (
                  <g
                    key={h.id}
                    className="nw-dot"
                    onPointerEnter={() => setHover(h.id)}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => onSelect(h.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(h.id)}
                    aria-label={`${h.name}, ${done ? 'accounted for' : band}${rank ? `, rank ${rank}` : ''}`}
                  >
                    <line x1={g.x} y1={g.y} x2={x} y2={y} stroke={fill} strokeOpacity={0.35} strokeDasharray="2 4" />
                    {band === 'critical' && rank > 0 && <circle cx={x} cy={y} r={rr} className="nw-pulse" stroke={fill} />}
                    <circle cx={x} cy={y} r={rr + 8} fill="transparent" />
                    <circle cx={x} cy={y} r={rr} fill={fill} stroke={hover === h.id ? '#fff' : 'rgba(0,0,0,.4)'} filter={band === 'critical' && rank ? 'url(#nw-glow)' : undefined} />
                    {rank > 0 && rank <= 40 && (
                      <text x={x + rr + 3} y={y - rr - 1} className="nw-num">
                        {rank}
                      </text>
                    )}
                    {hover === h.id && (
                      <text x={x} y={y + rr + 14} className="nw-hover" textAnchor="middle">
                        {h.name} · {h.unit}
                      </text>
                    )}
                  </g>
                );
              })}
              <circle cx={g.x} cy={g.y} r={r + 7} fill="none" stroke={hot ? '#ff9fb4' : '#b9a6ff'} strokeOpacity={0.35} />
              <circle cx={g.x} cy={g.y} r={r + 12} fill="none" stroke={hot ? '#ff9fb4' : '#b9a6ff'} strokeOpacity={0.15} strokeDasharray="1 3" className={hot ? 'nw-spin' : undefined} />
              <circle cx={g.x} cy={g.y} r={r} fill={`url(#nw-hub-${hot ? 'crit' : 'calm'})`} filter="url(#nw-glow)" />
              <g transform={`translate(${g.x + (labelRight ? r + 18 : -r - 18)} ${g.y + (Math.sin(g.a) > 0.5 ? r + 8 : Math.sin(g.a) < -0.5 ? -r + 4 : -2)})`} textAnchor={labelRight ? 'start' : 'end'}>
                <text className="nw-hub-name">{g.name}</text>
                <text y={22} className="nw-hub-pct">
                  {view.disasterActive ? `${pct}% found` : `${g.hs.length} homes`}
                  {view.disasterActive && open ? ` · ${open} open` : ''}
                </text>
              </g>
            </g>
          );
        })}

        <g filter="url(#nw-glow)">
          {Array.from({ length: 36 }, (_, i) => {
            const a = (i / 36) * Math.PI * 2;
            return <line key={i} x1={CX + Math.cos(a) * 46} y1={CY + Math.sin(a) * 46} x2={CX + Math.cos(a) * (54 + (i % 3) * 5)} y2={CY + Math.sin(a) * (54 + (i % 3) * 5)} stroke="#ffd89a" strokeOpacity={0.6} />;
          })}
          <circle cx={CX} cy={CY} r={40} fill="url(#nw-sun)" />
        </g>
        <circle cx={CX} cy={CY} r={66} fill="none" stroke="#ffd89a" strokeOpacity={0.25} className="nw-spin slow" strokeDasharray="2 6" />
        <text x={CX + 82} y={CY - 6} className="nw-center-name">
          Cedar Hollow
        </text>
        <text x={CX + 82} y={CY + 18} className="nw-hub-pct">
          {view.disasterActive ? `${c.accounted} of ${c.total} accounted for` : `${c.total} homes monitored`}
        </text>
      </svg>

      <div className="nw-bottom">
        {view.disasterActive && concerns.length > 0 && (
          <section className="nw-analysis" aria-label="What needs attention">
            <div className="nw-an-head">
              <span>
                <b>HPI</b> Analysis
              </span>
              {concerns.length > 1 && (
                <button className="nw-more" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
                  <Icon name="chevronDown" size={13} className={expanded ? undefined : 'flip'} /> {expanded ? 'Less' : `+${concerns.length - 1}`}
                </button>
              )}
            </div>
            {shown.map((k) => (
              <button key={k.key} className={`nw-concern ${k.tone}`} onClick={() => k.target !== undefined && onSelect(k.target)}>
                <span className="nw-c-top">
                  <span className="nw-c-title">
                    <i>[</i> <Icon name={k.icon} size={14} /> {k.title}
                  </span>
                  <span className="nw-c-ref">
                    {k.ref} <Icon name="chevronRight" size={13} />
                  </span>
                </span>
                <span className="nw-c-text">{k.text}</span>
              </button>
            ))}
          </section>
        )}
        <div className="nw-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <span>{s.label}</span>
              <b>
                <Icon name={s.icon} size={15} /> {s.value} <small>{s.unit}</small>
              </b>
            </div>
          ))}
        </div>
        {!view.disasterActive && <p className="nw-idle">No confirmed event. Hubs light up and rays pulse once shaking is confirmed.</p>}
      </div>
    </div>
  );
}
