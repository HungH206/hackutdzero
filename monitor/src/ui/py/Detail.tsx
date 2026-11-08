import { useState } from 'react';
import { agoText, CHECKIN_LABEL, FINAL_LABEL, STEP_LABEL, type View } from '../../data/derive';
import type { Actions } from '../../data/types';
import { Icon } from '../Icon';
import { LiveSensorBadge } from '../LiveSensor';
import '../live-sensor.css';

interface Props {
  id: number;
  view: View;
  now: number;
  actions: Actions;
  onClose(): void;
  onError(msg: string): void;
  onFullRecord(): void;
}

// Right-hand panel, after the reference's detail card. Read-only except for
// the dispatcher actions, which call reducers.
export function PyDetail({ id, view, now, actions, onClose, onError, onFullRecord }: Props) {
  const [busy, setBusy] = useState(false);
  const h = view.hh.get(id);
  if (!h) return null;
  const p = view.prio.get(id);
  const n = view.node.get(id);
  const e = view.esc.get(id);
  const ci = view.checkin.get(id);
  const b = view.building.get(h.buildingId);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const band = !h.hasSensor ? 'unknown' : (p?.band ?? 'low');
  const factors = p?.scored
    ? [
        ['E', p.E],
        ['S', p.S],
        ['C', p.C],
        ['V', p.V],
        ['K', Math.min(1, (p.K - 1) * 2)],
        ['L', p.L],
        ['M', p.M],
      ]
    : [];

  return (
    <aside className="py-detail" aria-label={`${h.name} details`}>
      <div className="py-d-top">
        <span className="py-d-kicker">
          <Icon name="home" size={18} /> {b?.name ?? 'No building record'}
        </span>
        <button className="py-x" onClick={onClose} aria-label="Close details">
          <Icon name="x" size={15} />
        </button>
      </div>
      <LiveSensorBadge h={h} n={n} now={now} />
      <h2 className="py-d-title">
        {h.name}
        <span>
          Unit {h.unit} · {h.age} yrs{h.language !== 'English' ? ` · speaks ${h.language}` : ''}
        </span>
      </h2>

      <div className="py-d-status">
        <div>
          <span className={`py-state ${h.finalState}`}>{FINAL_LABEL[h.finalState]}</span>
          <p>{n ? `Last signal ${agoText(n.lastSignalMicros, now)}${n.online ? '' : ', node silent'}` : 'No sensor installed at this address.'}</p>
        </div>
        <button className="py-explore" onClick={onFullRecord}>
          Full record <Icon name="chevronRight" size={15} />
        </button>
      </div>

      <div className={`py-d-score ${band}`}>
        <div className="py-d-score-h">
          <span>Priority index</span>
          <span className="py-band">{band === 'unknown' ? 'Unknown' : band[0]!.toUpperCase() + band.slice(1)}</span>
        </div>
        <div className="py-d-score-b">
          <div>
            <b>{p?.scored ? p.hpi.toFixed(1) : '—'}</b>
            <small>{p?.rank ? `rank #${p.rank}` : h.hasSensor ? 'not in queue' : 'not scored'}</small>
          </div>
          {factors.length > 0 && (
            <svg className="py-dots" viewBox="0 0 120 44" aria-label="Factor breakdown E S C V K L M">
              {factors.map(([k, v], i) => (
                <g key={k as string} transform={`translate(${6 + i * 17} 0)`}>
                  {Array.from({ length: 6 }, (_, j) => (
                    <circle key={j} cx={0} cy={34 - j * 5.4} r={1.6} className={(v as number) * 6 > j ? 'on' : ''} />
                  ))}
                  <text y={43} textAnchor="middle">
                    {k as string}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
        {p?.reason && <p className="py-d-reason">{p.reason}</p>}
      </div>

      <div className="py-d-tiles">
        <div>
          <Icon name="route" size={22} />
          <b>{e && e.step ? e.step : '—'}</b>
          <span>{e && e.step ? STEP_LABEL[e.step] : 'Ladder not started'}</span>
        </div>
        <div>
          <Icon name="zap" size={22} />
          <b>{p && p.tthMin >= 0 ? Math.round(p.tthMin) : '—'}</b>
          <span>{p && p.tthMin >= 0 ? `min backup · ${h.medicalDevice}` : n?.onBattery ? 'On battery' : 'Mains power'}</span>
        </div>
        <div>
          <Icon name="wifiOff" size={22} />
          <b>{p ? Math.round(p.minutesSilent) : '—'}</b>
          <span>min silent</span>
        </div>
        <div>
          <Icon name="phone" size={22} />
          <b>{ci && ci.state !== 'none' ? (ci.state === 'ok' ? 'OK' : ci.state === 'help' ? 'HELP' : '…') : '—'}</b>
          <span>{ci ? CHECKIN_LABEL[ci.state] : 'No check-in'}</span>
        </div>
      </div>

      {h.hasSensor && (
        <div className="py-d-acts">
          <button className="ok" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'found_ok', 'Marked found OK by dispatcher'))}>
            <Icon name="check" size={15} /> Found OK
          </button>
          <button className="help" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'found_needs_help', 'Marked needs help by dispatcher'))}>
            <Icon name="alert" size={15} /> Needs help
          </button>
          <button className="as" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'assisted', 'Marked assisted by dispatcher'))}>
            <Icon name="shield" size={15} /> Assisted
          </button>
        </div>
      )}
    </aside>
  );
}
