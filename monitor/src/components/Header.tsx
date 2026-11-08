import type { ReactNode } from 'react';
import type { View } from '../data/derive';
import { clockText } from '../data/derive';
import type { ConnectionInfo } from '../data/types';

export function Header({ view, now, offsetMicros, connection, demo }: { view: View; now: number; offsetMicros: number; connection: ConnectionInfo; demo: ReactNode }) {
  const c = view.counts;
  const segs = [
    { key: 'ok', n: c.ok, color: 'var(--ok)', label: 'Found, OK' },
    { key: 'help', n: c.help, color: 'var(--help)', label: 'Found, needs help' },
    { key: 'assisted', n: c.assisted, color: 'var(--assisted)', label: 'Assisted' },
    view.disasterActive
      ? { key: 'unresolved', n: c.unresolved, color: 'var(--guarded)', label: 'Unresolved' }
      : { key: 'unresolved', n: c.unresolved, color: 'var(--low)', label: 'Reporting normally' },
    { key: 'unknown', n: c.unknown, color: 'var(--unknown)', label: 'Unknown (no sensor)' },
  ];
  const ffMin = Math.round(offsetMicros / 6e7);

  return (
    <header className="header">
      <div className="brand">
        <h1>
          Head<span>count</span>
        </h1>
        <small>Monitor dashboard · Everyone found.</small>
      </div>

      <div className="counter" aria-live="polite">
        <div className="counter-line">
          <div className="counter-big">
            {view.disasterActive ? (
              <>
                <b>{c.accounted}</b> of {c.total} accounted for
              </>
            ) : (
              <>All clear · {c.total} homes monitored</>
            )}
          </div>
          {view.disasterActive && c.unresolved > 0 && <div className="counter-sub">{c.unresolved} still being escalated</div>}
        </div>
        <div className="segbar" role="img" aria-label={segs.map((s) => `${s.n} ${s.label}`).join(', ')}>
          {segs.map((s) => (
            <div key={s.key} style={{ flexGrow: s.n, background: s.color }} />
          ))}
        </div>
        <div className="seg-legend">
          {segs.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.n} {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="status">
        <div className="clock" title="Scenario time">
          {clockText(now)}
          {ffMin > 0 && <em>+{ffMin} min fast-forward</em>}
        </div>
        <div className={`pill ${connection.status}`} title={connection.detail}>
          <span className="dot" />
          <span className="txt">{connection.detail}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="sim-badge">SYNTHETIC DATA · SIMULATED 911</span>
          {demo}
        </div>
      </div>
    </header>
  );
}
