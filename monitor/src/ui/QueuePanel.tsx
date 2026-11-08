import { useState } from 'react';
import { STEP_LABEL, countdown, type View } from '../data/derive';
import { BAND_COLOR, Ring } from './Gauges';
import { Icon } from './Icon';

type Filter = 'all' | 'critical' | 'help' | 'silent' | 'power';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'help', label: 'Needs help' },
  { id: 'silent', label: 'Silent' },
  { id: 'power', label: 'Power clock' },
];

interface Props {
  view: View;
  now: number;
  hovered: number | null;
  selected: number | null;
  onHover(id: number | null): void;
  onSelect(id: number): void;
}

export function QueuePanel({ view, now, hovered, selected, onHover, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [collapsed, setCollapsed] = useState(false);
  const rows = view.queue.filter((h) => {
    const p = view.prio.get(h.id)!;
    if (filter === 'critical') return p.band === 'critical';
    if (filter === 'help') return h.finalState === 'found_needs_help';
    if (filter === 'silent') return p.minutesSilent >= 1;
    if (filter === 'power') return p.tthMin >= 0;
    return true;
  });

  return (
    <aside className={`queue-panel glass${collapsed ? ' collapsed' : ''}`} aria-label="Priority queue">
      <div className="qp-head">
        <div>
          <div className="eyebrow">Priority queue</div>
          <div className="qp-title">{view.disasterActive ? `${view.queue.length} households waiting` : 'Standing by'}</div>
        </div>
        <button className="icon-btn ghost" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand queue' : 'Collapse queue'} aria-expanded={!collapsed}>
          <Icon name="chevronDown" size={18} className={collapsed ? 'rot' : undefined} />
        </button>
      </div>
      {!collapsed && (
        <>
          {view.disasterActive && (
            <div className="seg" role="tablist" aria-label="Filter queue">
              {FILTERS.map((f) => (
                <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {!view.disasterActive ? (
            <div className="qp-empty">
              <Icon name="radio" size={28} />
              <p>No confirmed event. Every node is reporting normally.</p>
              <small>Shaking must be confirmed by 2+ nearby nodes before anyone is ranked.</small>
            </div>
          ) : rows.length === 0 ? (
            <div className="qp-empty">
              <Icon name="check" size={28} />
              <p>{view.queue.length === 0 ? 'Everyone with a sensor is accounted for.' : 'No households match this filter.'}</p>
            </div>
          ) : (
            <ol className="qp-list">
              {rows.map((h) => {
                const p = view.prio.get(h.id)!;
                const e = view.esc.get(h.id);
                const color = BAND_COLOR[p.band]!;
                return (
                  <li key={h.id}>
                    <button
                      className={`qp-row${hovered === h.id ? ' hot' : ''}${selected === h.id ? ' sel' : ''}`}
                      onPointerEnter={() => onHover(h.id)}
                      onPointerLeave={() => onHover(null)}
                      onClick={() => onSelect(h.id)}
                    >
                      <Ring value={p.hpi} max={100} color={color} size={42}>
                        <b style={{ color }}>{p.hpi.toFixed(0)}</b>
                      </Ring>
                      <span className="qp-main">
                        <span className="qp-name">
                          <span className="qp-rank">#{p.rank}</span> {h.name}
                          <small> · {h.unit}</small>
                        </span>
                        <span className="qp-reason">{p.reason}</span>
                        <span className="qp-meta">
                          {h.finalState === 'found_needs_help' && <span className="chip crit">Needs help</span>}
                          {e && e.step > 0 && !e.done && (
                            <span className={`chip ${e.step === 4 ? 'crit' : 'warn'}`}>
                              {STEP_LABEL[e.step]} · {countdown(e.nextAtMicros, now)}
                            </span>
                          )}
                          {p.tthMin >= 0 && (
                            <span className="chip warn">
                              <Icon name="zap" size={11} /> {Math.round(p.tthMin)}m
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </aside>
  );
}
