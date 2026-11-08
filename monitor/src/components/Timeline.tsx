import { clockText } from '../data/derive';
import type { TimelineRow } from '../data/types';

export function Timeline({ rows, onSelect }: { rows: TimelineRow[]; onSelect(id: number): void }) {
  const latest = [...rows].sort((a, b) => b.id - a.id).slice(0, 80);
  return (
    <>
      <div className="panel-head">
        <h2>Event timeline</h2>
        <span className="tag">{rows.length} events</span>
      </div>
      <ol className="timeline" aria-live="polite">
        {latest.map((r) => (
          <li key={r.id} className={r.householdId ? 'link' : undefined} onClick={() => r.householdId && onSelect(r.householdId)}>
            <time>{clockText(r.atMicros)}</time>
            <span className={`sev ${r.severity}`} />
            <span>{r.message}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
