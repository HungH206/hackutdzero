import type { View } from '../data/derive';
import { CHECKIN_LABEL, STEP_LABEL, countdown } from '../data/derive';

const BAND_COLOR: Record<string, string> = {
  low: 'var(--low)',
  guarded: 'var(--guarded)',
  high: 'var(--high)',
  critical: 'var(--critical)',
};

interface Props {
  view: View;
  now: number;
  hovered: number | null;
  selected: number | null;
  onHover(id: number | null): void;
  onSelect(id: number): void;
}

export function Queue({ view, now, hovered, selected, onHover, onSelect }: Props) {
  return (
    <>
      <div className="panel-head">
        <h2>Priority queue</h2>
        <span className="tag">{view.disasterActive ? `${view.queue.length} in queue · ranked by HPI` : 'standing by'}</span>
      </div>
      {view.queue.length === 0 || !view.disasterActive ? (
        <div className="empty">
          {view.disasterActive ? 'Everyone with a sensor is accounted for.' : 'No confirmed event. Every node is reporting normally.'}
        </div>
      ) : (
        <ol className="queue">
          {view.queue.map((h) => {
            const p = view.prio.get(h.id)!;
            const e = view.esc.get(h.id);
            const ci = view.checkin.get(h.id);
            const color = BAND_COLOR[p.band] ?? 'var(--muted)';
            return (
              <li
                key={h.id}
                className={`qrow${hovered === h.id ? ' hot' : ''}${selected === h.id ? ' sel' : ''}`}
                onMouseEnter={() => onHover(h.id)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(h.id)}
              >
                <div className="rank" style={{ background: color, color: '#0d1117' }}>
                  {p.rank}
                </div>
                <div>
                  <div className="qname">
                    {h.name}
                    <small>
                      {h.unit} · {view.building.get(h.buildingId)?.name ?? ''}
                    </small>
                  </div>
                  <div className="qreason">{p.reason}</div>
                  <div className="qmeta">
                    {h.finalState === 'found_needs_help' && <span className="tag crit">Found, needs help</span>}
                    {e && e.step > 0 && !e.done && (
                      <span className={`tag ${e.step === 4 ? 'crit' : 'warn'}`}>
                        Step {e.step}: {STEP_LABEL[e.step]} · next {countdown(e.nextAtMicros, now)}
                      </span>
                    )}
                    {ci && ci.state !== 'none' && <span className="tag">{CHECKIN_LABEL[ci.state]}</span>}
                    {p.tthMin >= 0 && <span className="tag warn">⚡ {Math.round(p.tthMin)} min backup left</span>}
                  </div>
                </div>
                <div className="hpi" style={{ color }}>
                  <b>{p.hpi.toFixed(0)}</b>
                  <small>{p.band}</small>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
