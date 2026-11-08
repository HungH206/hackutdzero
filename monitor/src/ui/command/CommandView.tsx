import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { agoText, clockText, countdown, STEP_LABEL, type View } from '../../data/derive';
import type { Snapshot } from '../../data/types';
import type { GraphFilter } from '../py/Graph';
import { FlatMap } from './FlatMap';
import type { Map3DProps } from './Map3D';
import { KIND_LABEL, STATUS_LABEL, type Status } from './model';
import './command.css';
import { LiveSensorBadge, LiveSensorStrip } from '../LiveSensor';
import '../live-sensor.css';

// Main dashboard: the real neighborhood as a live 3D model, with the incident
// summary and the dispatch queue beside it. Everything is read from server
// rows: the queue is the priority table's rank order, and every score keeps
// its reason. Without WebGL (or if the 3D map fails) the flat map stands in.

const Map3D = lazy(() => import('./Map3D'));

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('3D map failed, using the flat map instead', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface Props {
  view: View;
  snapshot: Snapshot;
  now: number;
  zoom: number;
  filter: GraphFilter;
  selected: number | null;
  onSelect(id: number): void;
  onOpenBuilding(id: number): void;
  /** concern cards (fire, power clocks, help, silent, unknown) shown above the queue */
  attention?: ReactNode;
}

export function CommandView({ view, snapshot, now, zoom, filter, selected, onSelect, onOpenBuilding, attention }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [gl] = useState(hasWebGL2);

  const c = view.counts;
  const active = snapshot.disasters.filter((d) => d.active);
  const t0 = active.length ? Math.min(...active.map((d) => d.confirmedAtMicros)) : null;
  const kinds = [...new Set(active.map((d) => KIND_LABEL[d.kind] ?? d.kind))];

  // activity: timeline rows per minute since the first confirmed event
  const spark = useMemo(() => {
    if (t0 === null) return [];
    const mins = Math.max(10, Math.ceil((now - t0) / 6e7) + 1);
    const bins = new Array(mins).fill(0) as number[];
    for (const r of snapshot.timeline) {
      const m = Math.floor((r.atMicros - t0) / 6e7);
      if (m >= 0 && m < mins) bins[m]! += 1;
    }
    return bins;
  }, [snapshot.timeline, t0, now]);
  const sparkMax = Math.max(1, ...spark);

  const segs: [string, number, string][] = [
    ['ok', c.ok, 'Found OK'],
    ['assisted', c.assisted, 'Assisted'],
    ['help', c.help, 'Needs help'],
    ['open', c.unresolved, 'Waiting'],
    ['unknown', c.unknown, 'No sensor'],
  ];

  const mapProps: Map3DProps = { view, snapshot, zoom, filter, selected, hover, onHover: setHover, onSelect, onOpenBuilding };
  const flat = <FlatMap {...mapProps} />;

  return (
    <div className="cm">
      {gl ? (
        <MapBoundary fallback={flat}>
          <Suspense fallback={<div className="cm-map m3 loading" aria-busy="true" aria-label="Loading the 3D map" />}>
            <Map3D {...mapProps} />
          </Suspense>
        </MapBoundary>
      ) : (
        flat
      )}

      <aside className="cm-side" aria-label="Incident and dispatch queue">
        <section className="cm-card cm-incident">
          <div className={`cm-state${view.disasterActive ? ' live' : ''}`}>
            <i />
            {view.disasterActive ? kinds.join(' + ') : 'All clear'}
            <span>{t0 !== null ? `confirmed ${clockText(t0)} · ${agoText(t0, now)}` : 'monitoring'}</span>
          </div>
          <div className="cm-count">
            <b>{view.disasterActive ? c.accounted : c.total}</b>
            <span>{view.disasterActive ? `of ${c.total} households accounted for` : 'households monitored'}</span>
          </div>
          <div className="cm-bar" role="img" aria-label={segs.map(([, n, l]) => `${l} ${n}`).join(', ')}>
            {segs.map(([k, n]) => (n > 0 ? <i key={k} className={k} style={{ flexGrow: n }} /> : null))}
          </div>
          <ul className="cm-keys">
            {segs.map(([k, n, l]) => (
              <li key={k}>
                <i className={k} />
                {l}
                <b>{n}</b>
              </li>
            ))}
          </ul>
          {spark.length > 0 && (
            <svg className="cm-spark" viewBox={`0 0 ${spark.length * 6} 28`} preserveAspectRatio="none" aria-label="Events per minute since the event">
              {spark.map((v, i) => (
                <rect key={i} x={i * 6 + 1} y={28 - (v / sparkMax) * 26} width={4} height={(v / sparkMax) * 26} rx={1} />
              ))}
            </svg>
          )}
        </section>

        <LiveSensorStrip households={view.households} nodes={view.node} buildings={view.building} now={now} onSelect={onSelect} />

        {attention}

        <section className="cm-card cm-queue">
          <h2>
            Dispatch queue <span>{view.queue.length} open</span>
          </h2>
          {view.queue.length === 0 ? (
            <p className="cm-empty">{view.disasterActive ? 'Everyone with a sensor is accounted for.' : 'No open households. Start a simulation to see the queue.'}</p>
          ) : (
            <ol>
              {view.queue.map((h) => {
                const p = view.prio.get(h.id);
                const e = view.esc.get(h.id);
                const b = view.building.get(h.buildingId);
                return (
                  <li key={h.id}>
                    <button
                      className={`cm-row${selected === h.id ? ' sel' : ''}${hover === h.id ? ' hov' : ''}`}
                      onClick={() => onSelect(h.id)}
                      onPointerEnter={() => setHover(h.id)}
                      onPointerLeave={() => setHover(null)}
                    >
                      <span className={`cm-rank ${p?.band ?? 'low'}`}>{p?.rank ?? '–'}</span>
                      <span className="cm-row-main">
                        <span className="cm-row-name">
                          {h.name} <em>{b ? `${b.name} ${h.unit}` : h.unit}</em>
                        </span>
                        <LiveSensorBadge h={h} n={view.node.get(h.id)} now={now} compact />
                        <span className="cm-row-reason">{p?.reason ?? ''}</span>
                        <span className="cm-row-step">
                          {[1, 2, 3, 4].map((j) => (
                            <i key={j} className={(e?.step ?? 0) >= j ? 'on' : ''} />
                          ))}
                          {e && e.step > 0 ? STEP_LABEL[e.step] : 'Not started'}
                          {e && !e.done && e.step > 0 && e.step < 4 ? ` · next in ${countdown(e.nextAtMicros, now)}` : ''}
                        </span>
                      </span>
                      <span className={`cm-hpi ${p?.band ?? 'low'}`}>{p?.scored ? p.hpi.toFixed(0) : '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </aside>

      <div className="cm-legend" aria-label="Map key">
        {(['critical', 'open', 'help', 'ok', 'assisted', 'unknown'] as Status[]).map((st) => (
          <span key={st}>
            <i className={`k3 ${st}`} aria-hidden="true">
              {st === 'ok' || st === 'assisted' ? (
                <svg viewBox="-6 -6 12 12">
                  <path d="M-3.4 0.2 L-1 2.6 L3.6 -2.4" />
                </svg>
              ) : st === 'critical' ? (
                '1'
              ) : st === 'open' ? (
                '4'
              ) : st === 'help' ? (
                '!'
              ) : (
                '?'
              )}
            </i>
            {STATUS_LABEL[st]}
          </span>
        ))}
        <span>
          <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
            <path d="M1 5 H17" className="cm-route" />
          </svg>
          Responder route
        </span>
      </div>
    </div>
  );
}
