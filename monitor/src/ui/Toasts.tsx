import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clockText } from '../data/derive';
import type { TimelineRow } from '../data/types';
import { Icon, type IconName } from './Icon';
import './shell/dock.css';

/** SYSTEM.md §6: never more than two toasts on screen, error and Undo toasts included. */
export const MAX_TOASTS = 2;
const AUTO_DISMISS_MS = 6000;

/** Pops critical events that arrive while the dashboard is open. */
export function useAlerts(rows: TimelineRow[]) {
  const seen = useRef<number | null>(null);
  const [toasts, setToasts] = useState<TimelineRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [held, setHeld] = useState(false);
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
    setToasts((t) => [...fresh.slice(-3).reverse(), ...t].slice(0, MAX_TOASTS));
  }, [rows]);
  useEffect(() => {
    if (!toasts.length || held) return;
    const id = setTimeout(() => setToasts((t) => t.slice(0, -1)), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [toasts, held]);
  return {
    toasts,
    dismiss: (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    unread,
    clearUnread: () => setUnread(0),
    /** Pass to `<Toasts onHold>` so a toast stays while the pointer or focus is on it. */
    hold: setHeld,
  };
}

export type ToastStatus = 'critical' | 'help' | 'fire' | 'waiting' | 'power' | 'ok' | 'assisted' | 'info' | 'unknown';

export interface ToastProps {
  status: ToastStatus;
  icon: IconName;
  title: string;
  /** One sentence. */
  text: ReactNode;
  /** Clock time, set in mono. */
  time?: string;
  /** Clicking anywhere on the toast calls this; keyboard users get a hidden button. */
  onOpen?(): void;
  /** Screen reader name for the open action. */
  openLabel?: string;
  onDismiss?(): void;
  /** A secondary small pill such as Undo. */
  action?: { label: string; onClick(): void };
  /** `alert` interrupts a screen reader, `status` waits its turn. */
  role?: 'alert' | 'status';
}

/** One card, the `.hc-alert.hc-alert--white.hc-toast` pattern. Place it in `<Toasts>` or a `.hc-toasts` stack. */
export function Toast({ status, icon, title, text, time, onOpen, openLabel, onDismiss, action, role = 'alert' }: ToastProps) {
  return (
    <div className="hc-alert hc-alert--white hc-toast" data-ui="toast" data-status={status} data-openable={onOpen ? 'true' : undefined} role={role} onClick={onOpen}>
      <Icon name={icon} size={20} className="hc-alert__icon" />
      <div className="hc-alert__title">{title}</div>
      <div className="hc-alert__text">{text}</div>
      {time && <time className="hc-alert__time">{time}</time>}
      {(onDismiss || action) && (
        <div className="hc-alert__aside">
          {action && (
            <button
              type="button"
              className="hc-btn hc-btn--secondary hc-btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
            >
              {action.label}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              className="hc-btn hc-btn--icon hc-btn--ghost hc-btn--sm hc-toast__close"
              aria-label="Dismiss"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      )}
      {onOpen && (
        <button
          type="button"
          className="sr-only hc-toast__open"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {openLabel ?? `Open: ${title}`}
        </button>
      )}
    </div>
  );
}

/** A failed action. The same pattern with `data-status="critical"`. */
export function ErrorToast({ message, onDismiss, now }: { message: string; onDismiss?(): void; /** Scenario time in microseconds; defaults to the wall clock. */ now?: number }) {
  const [time] = useState(() => clockText(now ?? Date.now() * 1000));
  return <Toast status="critical" icon="alert" title="That didn't go through" text={message} time={time} onDismiss={onDismiss} />;
}

/** The status, glyph and heading for a critical timeline row. The sentence is the server's, word for word. */
function presentRow(t: TimelineRow): Pick<ToastProps, 'status' | 'icon' | 'title'> {
  if (t.kind === 'dispatch') return { status: 'assisted', icon: 'route', title: 'Responder dispatched (simulated)' };
  if (t.kind === 'disaster') return /fire/i.test(t.message) ? { status: 'fire', icon: 'flame', title: 'Fire confirmed' } : { status: 'critical', icon: 'quake', title: 'Earthquake confirmed' };
  return { status: 'critical', icon: 'alert', title: 'Needs help' };
}

interface Slot {
  key: string;
  node: ReactNode;
  leaving: boolean;
}

/** Keeps a removed card mounted for its exit, without ever showing more than MAX_TOASTS cards. */
function useSlots(items: { key: string; node: ReactNode }[]) {
  const [slots, setSlots] = useState<Slot[]>([]);
  useLayoutEffect(() => {
    setSlots((cur) => {
      const live = new Set(items.map((i) => i.key));
      const kept = cur.filter((s) => !live.has(s.key)).map((s) => ({ ...s, leaving: true }));
      const room = Math.max(0, MAX_TOASTS - items.length);
      const staying = kept.slice(0, room);
      // Newest first: the live items hold the top of the stack, anything leaving finishes below.
      return [...items.map((i) => ({ ...i, leaving: false })), ...staying];
    });
  }, [items]);
  const remove = (key: string) => setSlots((cur) => cur.filter((s) => s.key !== key));
  return { slots, remove };
}

export interface ToastsProps {
  toasts: TimelineRow[];
  onOpen(r: TimelineRow): void;
  onDismiss(id: number): void;
  /** Message of a failed action. Takes the top slot. */
  error?: string | null;
  onDismissError?(): void;
  /** Toasts that are not timeline rows, such as Undo. They share the two slots, after the error. */
  notices?: (ToastProps & { key: string })[];
  /** Scenario time in microseconds, for stamping the error toast. */
  now?: number;
  /** Connect to `useAlerts().hold` to pause the 6 s timer while a toast is hovered or focused. */
  onHold?(held: boolean): void;
}

/** The toast stack: top right, at most two, left of the inspector when it is open. */
export function Toasts({ toasts, onOpen, onDismiss, error, onDismissError, notices, now, onHold }: ToastsProps) {
  const items = useMemo(() => {
    const out: { key: string; node: ReactNode }[] = [];
    if (error) out.push({ key: `error:${error}`, node: <ErrorToast message={error} onDismiss={onDismissError} now={now} /> });
    for (const { key, ...n } of notices ?? []) out.push({ key: `notice:${key}`, node: <Toast {...n} /> });
    for (const t of toasts) {
      out.push({
        key: `row:${t.id}`,
        node: <Toast {...presentRow(t)} text={t.message} time={clockText(t.atMicros)} onOpen={() => onOpen(t)} onDismiss={() => onDismiss(t.id)} />,
      });
    }
    return out.slice(0, MAX_TOASTS);
    // `now` only stamps a new error; onOpen and onDismiss close over App state that is safe to read late.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts, error, notices]);
  const { slots, remove } = useSlots(items);

  // A card that goes away under the pointer must not leave the timer paused.
  useEffect(() => {
    if (!slots.some((s) => !s.leaving)) onHold?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  return (
    <div
      className="hc-toasts"
      role="region"
      aria-label="Notifications"
      onMouseEnter={() => onHold?.(true)}
      onMouseLeave={() => onHold?.(false)}
      onFocusCapture={() => onHold?.(true)}
      onBlurCapture={() => onHold?.(false)}
    >
      {slots.map((s) => (
        <div
          key={s.key}
          className="hc-toasts__slot"
          data-leaving={s.leaving ? 'true' : undefined}
          onAnimationEnd={(e) => {
            if (s.leaving && e.target === e.currentTarget) remove(s.key);
          }}
        >
          {s.node}
        </div>
      ))}
    </div>
  );
}
