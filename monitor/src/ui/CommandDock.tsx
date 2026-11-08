import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtMin, median, timesToFound, type View } from '../data/derive';
import type { Actions, Snapshot } from '../data/types';
import { BAND_COLOR } from './Gauges';
import { Icon, type IconName } from './Icon';

interface Props {
  view: View;
  snapshot: Snapshot;
  actions: Actions;
  onSelect(id: number): void;
  onError(msg: string): void;
  footer?: ReactNode;
  placeholder?: string;
}

export interface DockHandle {
  focus(): void;
}

interface Result {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
  color?: string;
  run(): void | Promise<void>;
}

export const CommandDock = forwardRef<DockHandle, Props>(function CommandDock({ view, snapshot, actions, onSelect, onError, footer, placeholder }, ref) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const alvarez = view.households.find((h) => h.name === 'Mrs. Alvarez');
  const chen = view.households.find((h) => h.name === 'Mr. Chen');
  const elm = [...view.building.values()].find((b) => b.name.startsWith('Elm'));

  const commands: Result[] = useMemo(
    () => [
      { key: 'quake', icon: 'quake', title: 'Simulate earthquake', sub: 'Near Alder Court', run: () => alvarez && actions.simQuake(alvarez.x + 40, alvarez.y + 30, 1) },
      { key: 'power', icon: 'zap', title: 'Simulate power loss', sub: 'West side, 420 m radius', run: () => alvarez && actions.simPowerLoss(alvarez.x, alvarez.y, 420) },
      { key: 'fire', icon: 'flame', title: 'Simulate fire', sub: 'Cypress Flats 3B', run: () => chen && actions.simFire(chen.id) },
      { key: 'outage', icon: 'wifiOff', title: 'Simulate comms outage', sub: 'Elm Gardens', run: () => elm && actions.simCommsOutage(elm.x + elm.w / 2, elm.y + elm.h / 2, 120) },
      { key: 'ff', icon: 'forward', title: 'Fast-forward 5 min', sub: 'Type “ff 15” for a custom amount', run: () => actions.simFastForward(5) },
      { key: 'reset', icon: 'reset', title: 'Reset simulation', sub: 'Back to all clear', run: () => actions.simReset() },
    ],
    [actions, alvarez, chen, elm],
  );

  const results: Result[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ff = s.match(/^(?:ff|\+)\s*(\d+(?:\.\d+)?)/);
    if (ff) {
      const m = Number(ff[1]);
      return [{ key: 'ffn', icon: 'forward', title: `Fast-forward ${m} min`, sub: 'Simulation clock', run: () => actions.simFastForward(m) }];
    }
    const homes: Result[] = view.households
      .filter((h) => !s || h.name.toLowerCase().includes(s) || h.unit.toLowerCase().includes(s) || (view.building.get(h.buildingId)?.name.toLowerCase().includes(s) ?? false))
      .sort((a, b) => (view.prio.get(b.id)?.hpi ?? 0) - (view.prio.get(a.id)?.hpi ?? 0))
      .slice(0, s ? 6 : 4)
      .map((h) => {
        const p = view.prio.get(h.id);
        return {
          key: `h${h.id}`,
          icon: 'home' as IconName,
          title: `${h.name} · ${h.unit}`,
          sub: p?.scored ? `HPI ${p.hpi.toFixed(0)} · ${p.reason}` : 'No sensor · unknown',
          color: p?.scored ? BAND_COLOR[p.band] : undefined,
          run: () => onSelect(h.id),
        };
      });
    const cmds = commands.filter((c) => !s || c.title.toLowerCase().includes(s) || c.key.includes(s));
    return [...homes, ...cmds];
  }, [q, view, commands, actions, onSelect]);

  const exec = async (r: Result | undefined) => {
    if (!r) return;
    setOpen(false);
    setQ('');
    input.current?.blur();
    try {
      await r.run();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const c = view.counts;
  const ttf = median(timesToFound(snapshot));
  const highNeed = view.households.filter((h) => h.hasSensor && (view.prio.get(h.id)?.V ?? 0) >= 0.4);
  const hnAcc = highNeed.filter((h) => h.finalState !== 'unresolved').length;
  const nextClock = view.queue.map((h) => view.prio.get(h.id)!.tthMin).filter((t) => t >= 0).sort((a, b) => a - b)[0];

  const stats: { icon: IconName; label: string; value: string; unit?: string }[] = [
    { icon: 'users', label: 'Accounted', value: String(c.total ? Math.round((c.accounted / c.total) * 100) : 0), unit: '%' },
    { icon: 'clock', label: 'Median to found', value: ttf === null ? '—' : fmtMin(ttf).replace(' min', ''), unit: ttf === null ? '' : 'min' },
    { icon: 'heart', label: 'High-need found', value: `${hnAcc}/${highNeed.length}` },
    { icon: 'zap', label: 'Next power clock', value: nextClock === undefined ? '—' : String(Math.round(nextClock)), unit: nextClock === undefined ? '' : 'min' },
  ];

  return (
    <div className="dock glass">
      <div className="dock-stats">
        {stats.map((s) => (
          <div key={s.label} className="dstat">
            <span className="dstat-lbl">{s.label}</span>
            <span className="dstat-val">
              <Icon name={s.icon} size={14} />
              <b>{s.value}</b>
              {s.unit && <small>{s.unit}</small>}
            </span>
          </div>
        ))}
      </div>
      <div className="dock-input">
        <Icon name="command" size={16} />
        <input
          ref={input}
          value={q}
          placeholder={placeholder ?? 'Find a household, or type quake, fire, ff 10, reset…'}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') void exec(results[cursor]);
            else if (e.key === 'Escape') {
              setOpen(false);
              input.current?.blur();
            }
          }}
          aria-label="Command bar"
          aria-expanded={open}
          aria-controls="cmd-results"
          role="combobox"
        />
        <button className="send" onClick={() => void exec(results[cursor])} aria-label="Run">
          <Icon name="chevronRight" size={18} />
        </button>
        {open && results.length > 0 && (
          <ul className="cmd-results glass" id="cmd-results" role="listbox">
            {results.map((r, i) => (
              <li key={r.key} role="option" aria-selected={i === cursor}>
                <button className={i === cursor ? 'on' : ''} onMouseEnter={() => setCursor(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => void exec(r)}>
                  <span className="cr-icon" style={r.color ? { color: r.color } : undefined}>
                    <Icon name={r.icon} size={16} />
                  </span>
                  <span className="cr-main">
                    <b>{r.title}</b>
                    <small>{r.sub}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {footer}
    </div>
  );
});
