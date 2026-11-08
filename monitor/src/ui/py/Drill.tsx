import type { View } from '../../data/derive';
import type { Household } from '../../data/types';
import { iconPath, type IconName } from '../Icon';
import { kindOf } from './kind';
import { FocusOrb, Orb, OrbDefs } from './Orb';

// Building view, after the reference's drill-down: focus orb on the left,
// category cards in the middle, households fanned out along an arc.

const W = 1400;
const H = 900;
const OX = 200;
const OY = 470;

export type Cat = 'help' | 'open' | 'power' | 'silent' | 'found' | 'unknown';

const CATS: { id: Cat; label: string; icon: IconName; test(v: View, h: Household): boolean }[] = [
  { id: 'help', label: 'Asked for help', icon: 'alert', test: (_v, h) => h.finalState === 'found_needs_help' },
  { id: 'open', label: 'Waiting to be reached', icon: 'activity', test: (v, h) => h.hasSensor && h.finalState === 'unresolved' && !!v.prio.get(h.id)?.rank },
  { id: 'power', label: 'Power-loss clocks', icon: 'zap', test: (v, h) => (v.prio.get(h.id)?.tthMin ?? -1) >= 0 && h.finalState !== 'assisted' },
  { id: 'silent', label: 'Silent nodes', icon: 'wifiOff', test: (v, h) => !!v.node.get(h.id) && !v.node.get(h.id)!.online && h.finalState === 'unresolved' },
  { id: 'found', label: 'Found or assisted', icon: 'check', test: (_v, h) => h.finalState === 'found_ok' || h.finalState === 'assisted' },
  { id: 'unknown', label: 'No sensor, unknown', icon: 'search', test: (_v, h) => !h.hasSensor },
];

interface Props {
  view: View;
  buildingId: number; // 0 = whole neighborhood
  cat: Cat | null;
  onCat(c: Cat): void;
  onBuilding(id: number): void;
  selected: number | null;
  onSelect(id: number): void;
}

export function Drill({ view, buildingId, cat, onCat, onBuilding, selected, onSelect }: Props) {
  const b = buildingId ? view.building.get(buildingId) : undefined;
  const homes = view.households.filter((h) => !buildingId || h.buildingId === buildingId);
  const cats = CATS.map((c) => ({ ...c, items: homes.filter((h) => c.test(view, h)) })).filter((c) => c.items.length || c.id === 'open' || c.id === 'found');
  const active = cats.find((c) => c.id === cat) ?? cats.find((c) => c.items.length) ?? cats[0]!;
  const items = [...active.items].sort((a, b2) => (view.prio.get(b2.id)?.hpi ?? 0) - (view.prio.get(a.id)?.hpi ?? 0)).slice(0, 18);
  const open = homes.filter((h) => view.prio.get(h.id)?.rank).length;
  const worst = homes.reduce((m, h) => Math.max(m, view.prio.get(h.id)?.rank ? view.prio.get(h.id)!.hpi : 0), 0);

  const cardX = 430;
  const cardW = 190;
  const cardH = 62;
  const gap = 18;
  const top = OY - ((cats.length * (cardH + gap) - gap) / 2);
  const cardY = (i: number) => top + i * (cardH + gap);
  const ai = cats.findIndex((c) => c.id === active.id);
  const fromX = cardX + cardW;
  const fromY = cardY(ai) + cardH / 2;

  const R = 640;
  const step = Math.min(0.068, 1.25 / Math.max(1, items.length - 1));
  const th0 = (-(items.length - 1) * step) / 2;
  const itemPos = items.map((h, i) => {
    const th = th0 + i * step;
    return { h, x: OX + Math.cos(th) * R, y: OY + Math.sin(th) * R * 0.96 };
  });

  const buildings = [...view.building.values()].filter((x) => view.households.some((h) => h.buildingId === x.id));

  return (
    <div className="py-drill">
      <div className="py-bpills" role="tablist" aria-label="Choose building">
        <button role="tab" aria-selected={!buildingId} className={!buildingId ? 'on' : ''} onClick={() => onBuilding(0)}>
          All of Cedar Hollow
        </button>
        {buildings.map((x) => (
          <button key={x.id} role="tab" aria-selected={buildingId === x.id} className={buildingId === x.id ? 'on' : ''} onClick={() => onBuilding(x.id)}>
            {x.name}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" className="py-drill-svg" role="img" aria-label={`${b?.name ?? 'Cedar Hollow'}: ${active.label}, ${active.items.length} households`}>
        <defs>
          <OrbDefs />
          <linearGradient id="fan" x1="0" x2="1">
            <stop offset="0%" stopColor="#f3d79c" />
            <stop offset="100%" stopColor="#8fe3d6" />
          </linearGradient>
          <filter id="cardglow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <circle cx={OX} cy={OY} r={250} className="py-orbit-disc" />
        <circle cx={OX} cy={OY} r={R} fill="none" className="py-orbit-line" />

        <text x={OX} y={OY - 108} className="py-drill-title" textAnchor="middle">
          {b?.name ?? 'Cedar Hollow'}
        </text>
        <text x={OX} y={OY - 82} className="py-drill-sub" textAnchor="middle">
          {b ? (
            <>
              Built <tspan className="gold">{b.builtYear}</tspan> · <tspan className="gold">{b.floors}</tspan> floors
            </>
          ) : (
            <>
              <tspan className="gold">{homes.length}</tspan> homes · <tspan className="gold">{view.building.size}</tspan> buildings
            </>
          )}
        </text>
        <FocusOrb x={OX} y={OY} r={30} seed={buildingId + 1} tone={worst >= 75 ? 'ember' : 'focus'} />
        <g transform={`translate(${OX - 40} ${OY + 92})`}>
          <path d="M6 0 H80 L74 22 H0 Z" className="py-tag" />
          <text x={40} y={15} className="py-tag-t lg">
            OPEN <tspan className="gold">{open}</tspan>
          </text>
        </g>
        <g transform={`translate(${OX - 24} ${OY + 122})`}>
          <rect width={48} height={18} rx={9} className="py-mini-pill" />
          {[0, 1, 2].map((j) => (
            <rect key={j} x={9 + j * 11} y={6} width={8} height={6} rx={2} fill={worst >= 75 ? '#ff5d74' : worst >= 50 ? '#f0a35e' : worst >= 25 ? '#e9c46a' : '#5fd3a6'} opacity={j <= Math.floor(worst / 34) ? 1 : 0.2} />
          ))}
        </g>

        {cats.map((c, i) => {
          const y = cardY(i) + cardH / 2;
          const on = c.id === active.id;
          return (
            <path key={`l${c.id}`} d={`M ${OX + 40} ${OY} C ${OX + 150} ${OY}, ${cardX - 110} ${y}, ${cardX} ${y}`} fill="none" stroke={on ? '#f0d394' : '#8fb9b3'} strokeOpacity={on ? 0.9 : 0.35} strokeWidth={on ? 1.4 : 1} />
          );
        })}

        {itemPos.map((p, i) => (
          <path key={`f${p.h.id}`} d={`M ${fromX} ${fromY} C ${fromX + 120} ${fromY}, ${p.x - 160} ${p.y}, ${p.x - 8} ${p.y}`} fill="none" stroke="url(#fan)" strokeOpacity={selected === p.h.id ? 1 : 0.55 - Math.abs(i - items.length / 2) * 0.012} strokeWidth={selected === p.h.id ? 1.6 : 1} />
        ))}

        {cats.map((c, i) => {
          const y = cardY(i);
          const on = c.id === active.id;
          return (
            <g key={c.id} className="py-node" role="button" tabIndex={0} aria-pressed={on} onClick={() => onCat(c.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onCat(c.id)} aria-label={`${c.label}: ${c.items.length}`}>
              {on && <rect x={cardX} y={y} width={cardW} height={cardH} rx={8} fill="#f0d394" opacity={0.25} filter="url(#cardglow)" />}
              <rect x={cardX} y={y} width={cardW} height={cardH} rx={8} className={`py-card${on ? ' on' : ''}`} />
              <rect x={cardX - 1} y={y + 16} width={3} height={cardH - 32} rx={1.5} fill={on ? '#f0d394' : '#5fd0c4'} />
              <path d={iconPath(c.icon)} transform={`translate(${cardX + 16} ${y + 12}) scale(0.68)`} fill="none" stroke={on ? '#f0d394' : '#8fe3d6'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <text x={cardX + 40} y={y + 27} className="py-card-n">
                {c.items.length}
              </text>
              <text x={cardX + 16} y={y + 48} className="py-card-l">
                {c.label}
              </text>
            </g>
          );
        })}

        {itemPos.map((p) => {
          const pr = view.prio.get(p.h.id);
          const kind = kindOf(view, p.h);
          const e = view.esc.get(p.h.id);
          const on = selected === p.h.id;
          const color = kind === 'ember' ? '#ff5d74' : kind === 'amber' ? '#e9c46a' : kind === 'violet' ? '#b39dff' : kind === 'slate' ? '#7c8a8f' : '#5fd3a6';
          return (
            <g key={p.h.id} className="py-node" role="button" tabIndex={0} onClick={() => onSelect(p.h.id)} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onSelect(p.h.id)} aria-label={`${p.h.name}${pr?.scored ? `, HPI ${pr.hpi.toFixed(0)}` : ''}`}>
              <rect x={p.x - 10} y={p.y - 18} width={210} height={38} fill="transparent" />
              <Orb kind={kind} x={p.x} y={p.y} r={5.5} />
              <text x={p.x + 16} y={p.y - 3} className={`py-item${on ? ' on' : ''}`}>
                {p.h.name.length > 18 ? `${p.h.name.slice(0, 17)}…` : p.h.name} <tspan className="py-item-u">{p.h.unit}</tspan>
              </text>
              <g transform={`translate(${p.x + 16} ${p.y + 4})`}>
                <path d="M3 0 H50 L47 11 H0 Z" className="py-tag" />
                <text x={25} y={8.4} className="py-tag-t sm">
                  {pr?.scored ? `HPI ${pr.hpi.toFixed(0)}` : 'NO SENSOR'}
                </text>
                <rect x={58} y={1} width={30} height={9} rx={3} className="py-mini-pill" />
                {[1, 2, 3].map((j) => (
                  <rect key={j} x={60 + (j - 1) * 9} y={3} width={7} height={5} rx={1.2} fill={color} opacity={(e?.step ?? 0) >= j || p.h.finalState !== 'unresolved' ? 1 : 0.2} />
                ))}
              </g>
            </g>
          );
        })}
        {active.items.length > items.length && (
          <text x={OX + R - 40} y={OY + R * 0.7} className="py-drill-sub">
            +{active.items.length - items.length} more
          </text>
        )}
        {items.length === 0 && (
          <text x={cardX + cardW + 120} y={OY} className="py-drill-sub">
            Nobody in this group.
          </text>
        )}
      </svg>
    </div>
  );
}
