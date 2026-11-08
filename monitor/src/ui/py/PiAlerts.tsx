import { useEffect, useRef, useState } from 'react';
import { usePiSensors, type PiEvent } from '../../data/pi';
import { Icon, type IconName } from '../Icon';

const SHOW_MS = 5000;
const LOUD: Record<string, { title: string; icon: IconName }> = {
  shock: { title: 'Shock detected', icon: 'quake' },
  flame: { title: 'Flame detected', icon: 'flame' },
  heat: { title: 'Heat detected', icon: 'thermo' },
};

/** Top-of-screen banner when the live Pi node trips shock, flame or heat, on any screen. */
export function PiAlerts({ names, onOpen }: { names: (id: number) => string | null; onOpen(id: number): void }) {
  const pi = usePiSensors();
  const seen = useRef<number | null>(null);
  const [shown, setShown] = useState<{ e: PiEvent; at: number } | null>(null);
  const newest = pi.available ? pi.events[0] : undefined;

  useEffect(() => {
    if (!newest) return;
    if (seen.current === null) {
      seen.current = newest.t;
      return;
    }
    if (newest.t > seen.current) {
      seen.current = newest.t;
      if (LOUD[newest.kind]) setShown({ e: newest, at: Date.now() });
    }
  }, [newest]);

  useEffect(() => {
    if (!shown) return;
    const id = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [shown]);

  if (!shown || !pi.available) return null;
  const meta = LOUD[shown.e.kind]!;
  const who = names(pi.household);
  return (
    <div className={`py-pialert is-${shown.e.kind}`} role="alert" aria-live="assertive">
      <span className="py-pialert-ico">
        <Icon name={meta.icon} size={22} />
      </span>
      <button className="py-pialert-body" onClick={() => onOpen(pi.household)}>
        <b>{meta.title}</b>
        <span>{who ? `${who} · live Pi sensor` : 'Live Pi sensor'}</span>
      </button>
      <button className="py-pialert-x" onClick={() => setShown(null)} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
