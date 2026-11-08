import { useState } from 'react';
import { clockText, type View } from '../data/derive';
import type { TimelineRow } from '../data/types';
import { Icon } from './Icon';

type Sev = 'all' | 'critical' | 'warn' | 'good' | 'info';

export function EventLog({ rows, view, onSelect }: { rows: TimelineRow[]; view: View; onSelect(id: number): void }) {
  const [sev, setSev] = useState<Sev>('all');
  const [q, setQ] = useState('');
  const list = [...rows]
    .sort((a, b) => b.id - a.id)
    .filter((r) => (sev === 'all' || r.severity === sev) && (!q || r.message.toLowerCase().includes(q.toLowerCase())));
  const count = (s: Sev) => (s === 'all' ? rows.length : rows.filter((r) => r.severity === s).length);
  return (
    <div className="eventlog">
      <div className="an-head">
        <div>
          <div className="eyebrow">Event log</div>
          <h1>Everything that happened, in order</h1>
        </div>
        <label className="searchbox glass inline">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter events" aria-label="Filter events" />
        </label>
      </div>
      <div className="seg wide" role="tablist" aria-label="Severity">
        {(['all', 'critical', 'warn', 'good', 'info'] as Sev[]).map((s) => (
          <button key={s} role="tab" aria-selected={sev === s} className={sev === s ? 'on' : ''} onClick={() => setSev(s)}>
            {s === 'warn' ? 'Escalations' : s === 'good' ? 'Found' : s[0]!.toUpperCase() + s.slice(1)} <span className="tab-count">{count(s)}</span>
          </button>
        ))}
      </div>
      <ol className="log-list">
        {list.map((r) => {
          const h = r.householdId ? view.hh.get(r.householdId) : undefined;
          return (
            <li key={r.id}>
              <button disabled={!h} onClick={() => h && onSelect(h.id)}>
                <time className="mono">{clockText(r.atMicros)}</time>
                <span className={`sev ${r.severity}`} />
                <span className="log-msg">{r.message}</span>
                {h && <Icon name="chevronRight" size={16} />}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="fine">No events match.</li>}
      </ol>
    </div>
  );
}
