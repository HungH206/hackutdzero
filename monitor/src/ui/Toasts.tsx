import { useEffect, useRef, useState } from 'react';
import type { TimelineRow } from '../data/types';
import { Icon } from './Icon';

/** Pops critical events that arrive while the dashboard is open. */
export function useAlerts(rows: TimelineRow[]) {
  const seen = useRef<number | null>(null);
  const [toasts, setToasts] = useState<TimelineRow[]>([]);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const max = rows.reduce((m, r) => Math.max(m, r.id), 0);
    if (seen.current === null || max < seen.current) {
      seen.current = max; // first load or reset: do not replay history
      return;
    }
    const fresh = rows.filter((r) => r.id > seen.current! && r.severity === 'critical');
    seen.current = max;
    if (!fresh.length) return;
    setUnread((u) => u + fresh.length);
    setToasts((t) => [...fresh.slice(-3).reverse(), ...t].slice(0, 2));
  }, [rows]);
  useEffect(() => {
    if (!toasts.length) return;
    const id = setTimeout(() => setToasts((t) => t.slice(0, -1)), 6000);
    return () => clearTimeout(id);
  }, [toasts]);
  return { toasts, dismiss: (id: number) => setToasts((t) => t.filter((x) => x.id !== id)), unread, clearUnread: () => setUnread(0) };
}

export function Toasts({ toasts, onOpen, onDismiss }: { toasts: TimelineRow[]; onOpen(r: TimelineRow): void; onDismiss(id: number): void }) {
  return (
    <div className="toasts" aria-live="assertive">
      {toasts.map((t) => (
        <div key={t.id} className="toast glass" role="alert">
          <span className="toast-icon">
            <Icon name={t.kind === 'disaster' ? 'quake' : t.kind === 'dispatch' ? 'siren' : 'alert'} size={18} />
          </span>
          <button className="toast-body" onClick={() => onOpen(t)}>
            <b>{t.kind === 'dispatch' ? 'Responder dispatched' : t.kind === 'disaster' ? 'Event confirmed' : 'Needs attention'}</b>
            <span>{t.message}</span>
          </button>
          <button className="icon-btn ghost sm" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
