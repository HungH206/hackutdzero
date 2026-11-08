import { useState } from 'react';
import type { View } from '../../data/derive';
import { Icon } from '../Icon';
import { KIND_LABEL, kindOf } from './kind';
import { Orb, type OrbKind } from './Orb';

export function PyLegend({ view, updates }: { view: View; updates: number }) {
  const [open, setOpen] = useState(true);
  const counts = new Map<OrbKind, number>();
  for (const h of view.households) counts.set(kindOf(view, h), (counts.get(kindOf(view, h)) ?? 0) + 1);
  const rows: [OrbKind, number][] = [
    ['sun', 1],
    ['rose', view.building.size],
    ...(['ember', 'violet', 'amber', 'mint', 'sky', 'slate'] as OrbKind[]).filter((k) => counts.get(k)).map((k) => [k, counts.get(k)!] as [OrbKind, number]),
  ];
  const c = view.counts;
  return (
    <section className={`py-legend${open ? '' : ' closed'}`} aria-label="Legend">
      <button className="py-legend-h" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        LEGEND <Icon name="chevronDown" size={13} className={open ? undefined : 'rot'} />
      </button>
      {open && (
        <ul>
          {rows.map(([k, n]) => (
            <li key={k}>
              <span className="py-chip-orb">
                <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                  <Orb kind={k} x={0} y={0} r={k === 'sun' || k === 'rose' ? 4.3 : 5} bezel={k === 'sun' || k === 'rose'} />
                </svg>
                <b>{n}</b>
              </span>
              {KIND_LABEL[k]}
            </li>
          ))}
          <li className="py-legend-stat">
            <Icon name="users" size={13} /> Accounted <span>{c.total ? Math.round((c.accounted / c.total) * 100) : 0}%</span>
          </li>
          <li className="py-legend-stat">
            <Icon name="activity" size={13} /> Updates <span>{updates}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
