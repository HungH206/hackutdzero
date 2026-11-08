import { useState } from 'react';
import { agoText, CHECKIN_LABEL, clockText, countdown, fmtMin, FINAL_LABEL, median, STEP_LABEL, timesToFound, type View } from '../../data/derive';
import type { Actions, Household, Snapshot } from '../../data/types';
import { Icon, type IconName } from '../Icon';
import './overview.css';

// Regular operations dashboard, after the fleet-dispatch reference: icon rail,
// stat pills, breadcrumb + title row with actions, tabs, a unit layout grid
// (cargo grid there) and a waiting list with an expandable card (packages there).

export type OvNav = 'graph' | 'tree' | 'map' | 'houses' | 'analytics' | 'log';
type Tab = 'units' | 'escalations' | 'alerts';
type Pri = 'critical' | 'high' | 'normal' | 'low' | 'found' | 'nosensor' | 'help';

const PRI_LABEL: Record<Pri, string> = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low', found: 'Found', nosensor: 'No sensor', help: 'Needs help' };
const PRI_ICON: Record<Pri, IconName> = { critical: 'alert', high: 'activity', normal: 'clock', low: 'check', found: 'check', nosensor: 'search', help: 'siren' };

function priOf(view: View, h: Household): Pri {
  if (!h.hasSensor) return 'nosensor';
  if (h.finalState === 'found_needs_help') return 'help';
  if (h.finalState !== 'unresolved') return 'found';
  const p = view.prio.get(h.id);
  if (!view.disasterActive || !p?.rank) return 'low';
  return p.band === 'critical' ? 'critical' : p.band === 'high' ? 'high' : p.band === 'guarded' ? 'normal' : 'low';
}

interface Props {
  view: View;
  snapshot: Snapshot;
  now: number;
  actions: Actions;
  unread: number;
  onNav(s: OvNav): void;
  onSelectGlobal(id: number): void;
  onSearch(): void;
  onError(msg: string): void;
}

export function Overview({ view, snapshot, now, actions, unread, onNav, onSelectGlobal, onSearch, onError }: Props) {
  const buildings = [...view.building.values()].filter((b) => view.households.some((h) => h.buildingId === b.id));
  const worstFirst = [...buildings].sort((a, b) => worst(view, b.id) - worst(view, a.id));
  const [bid, setBid] = useState<number>(() => worstFirst[0]?.id ?? 1);
  const [tab, setTab] = useState<Tab>('units');
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const b = view.building.get(bid) ?? buildings[0];
  if (!b) return null;
  const homes = view.households.filter((h) => h.buildingId === b.id);
  const waiting = homes.filter((h) => h.finalState === 'unresolved' || h.finalState === 'found_needs_help').sort((a, c) => (view.prio.get(c.id)?.hpi ?? 0) - (view.prio.get(a.id)?.hpi ?? 0));
  const acc = homes.filter((h) => h.finalState !== 'unresolved').length;
  const online = homes.filter((h) => view.node.get(h.id)?.online).length;
  const sensored = homes.filter((h) => h.hasSensor).length;
  const escal = homes.filter((h) => (view.esc.get(h.id)?.step ?? 0) > 0);
  const alerts = snapshot.timeline.filter((t) => homes.some((h) => h.id === t.householdId) && (t.severity === 'critical' || t.severity === 'warn'));
  const c = view.counts;
  const med = median(timesToFound(snapshot));
  const responders = [...view.esc.values()].filter((e) => e.step === 4 && !e.done).length;
  const floors = [...new Set(homes.map((h) => h.floor))].sort((x, y) => y - x);
  const idx = worstFirst.findIndex((x) => x.id === b.id);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pills: { icon: IconName; label: string; value: string }[] = [
    { icon: 'users', label: 'Accounted', value: `${c.accounted}/${c.total}` },
    { icon: 'activity', label: 'Waiting', value: String(view.queue.length) },
    { icon: 'siren', label: 'Responders', value: String(responders) },
    { icon: 'clock', label: 'Median found', value: med === null ? '—' : fmtMin(med) },
    { icon: 'radio', label: 'Online', value: `${[...view.node.values()].filter((n) => n.online).length}/${view.node.size}` },
  ];
  const nav: { id: OvNav | 'overview'; icon: IconName; label: string }[] = [
    { id: 'overview', icon: 'list', label: 'Overview' },
    { id: 'graph', icon: 'globe', label: 'Network graph' },
    { id: 'tree', icon: 'route', label: 'Building view' },
    { id: 'houses', icon: 'home', label: 'Houses' },
    { id: 'map', icon: 'map', label: 'Live map' },
    { id: 'analytics', icon: 'chart', label: 'Analytics' },
  ];

  return (
    <div className="ov">
      <nav className="ov-rail" aria-label="Views">
        <span className="ov-logo" aria-label="Headcount">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill="#e4f46b" />
          </svg>
        </span>
        <div className="ov-rail-items">
          {nav.map((n) => (
            <button key={n.id} className={n.id === 'overview' ? 'on' : ''} onClick={() => n.id !== 'overview' && onNav(n.id)} aria-label={n.label} data-tip={n.label}>
              <Icon name={n.icon} size={17} />
            </button>
          ))}
        </div>
        <div className="ov-rail-foot">
          <a href="/?app=cbre" aria-label="Property operations" data-tip="Property operations">
            <Icon name="layers" size={17} />
          </a>
          <button onClick={() => onNav('log')} aria-label="Event log" data-tip="Event log">
            <Icon name="bell" size={17} />
          </button>
        </div>
      </nav>

      <div className="ov-main">
        <header className="ov-top">
          <div className="ov-pills">
            {pills.map((p) => (
              <span key={p.label} className="ov-pill">
                <Icon name={p.icon} size={13} /> {p.label}: <b>{p.value}</b>
              </span>
            ))}
          </div>
          <div className="ov-top-r">
            <button className="ov-search" onClick={onSearch}>
              <Icon name="search" size={15} /> Search households, units, or commands <kbd>⌘K</kbd>
            </button>
            <button className="ov-bell" onClick={() => onNav('log')} aria-label={`Event log, ${unread} unread`}>
              <Icon name="bell" size={16} />
              {unread > 0 && <em>+{unread > 9 ? 9 : unread}</em>}
            </button>
            <span className="ov-user">
              <span className="ov-av">DS</span>
              <span>
                <b>Dispatcher</b>
                <small>{clockText(now)}</small>
              </span>
            </span>
          </div>
        </header>

        <div className="ov-crumb">
          <Icon name="home" size={13} /> Dashboard <Icon name="chevronRight" size={12} /> Buildings <Icon name="chevronRight" size={12} /> <b>{b.name}</b>
        </div>

        <div className="ov-title">
          <div>
            <h1>
              {b.name}
              <span className={`ov-state ${waiting.length && view.disasterActive ? 'bad' : 'good'}`}>
                <i /> {view.disasterActive ? (waiting.length ? `${waiting.length} open` : 'All accounted') : 'All clear'}
              </span>
            </h1>
            <span className="ov-sub">
              {b.kind === 'multifamily' ? 'Multifamily' : b.kind} · {b.floors} floors · built {b.builtYear}
            </span>
          </div>
          <div className="ov-actions">
            <button className="ov-btn" onClick={() => setBid(worstFirst[(idx + worstFirst.length - 1) % worstFirst.length]!.id)} aria-label="Previous building">
              <Icon name="chevronRight" size={15} className="flip" />
            </button>
            <button className="ov-btn" onClick={() => setBid(worstFirst[(idx + 1) % worstFirst.length]!.id)} aria-label="Next building">
              <Icon name="chevronRight" size={15} />
            </button>
            <button className="ov-btn" onClick={() => onNav('tree')}>
              <Icon name="route" size={15} /> Building view
            </button>
            <button className="ov-btn" onClick={() => onNav('map')}>
              <Icon name="map" size={15} /> Live map
            </button>
            <button className="ov-btn lime" disabled={!waiting[0]} onClick={() => waiting[0] && setOpen(waiting[0].id)}>
              <Icon name="play" size={13} /> Next to reach
            </button>
          </div>
        </div>

        <div className="ov-tabs" role="tablist">
          {(
            [
              ['units', 'Units', homes.length],
              ['escalations', 'Escalations', escal.length],
              ['alerts', 'Alerts', alerts.length],
            ] as [Tab, string, number][]
          ).map(([id, l, n]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {l} <span>{n}</span>
            </button>
          ))}
        </div>

        <div className="ov-grid">
          <section className="ov-card">
            {tab === 'units' && (
              <>
                <div className="ov-card-h">
                  <span className="ov-h">
                    <Icon name="layers" size={16} /> Unit Layout
                    <span className={`ov-tagdot ${waiting.length ? 'bad' : 'good'}`}>
                      <i /> {waiting.length ? `${waiting.length} not reached` : 'Everyone reached'}
                    </span>
                  </span>
                </div>
                <div className="ov-caps">
                  <Cap icon="users" value={`${acc}`} of={`${homes.length}`} unit="units" label="Accounted for" pct={homes.length ? acc / homes.length : 0} tone="amber" />
                  <Cap icon="radio" value={`${online}`} of={`${sensored}`} unit="nodes" label="Sensors reporting" pct={sensored ? online / sensored : 0} tone={online < sensored ? 'red' : 'amber'} />
                </div>
                <div className="ov-floors">
                  {floors.map((f) => (
                    <div key={f} className="ov-floor">
                      <span className="ov-fl">F{f}</span>
                      <div className="ov-cells">
                        {homes
                          .filter((h) => h.floor === f)
                          .sort((x, y) => x.unit.localeCompare(y.unit))
                          .map((h) => {
                            const pr = priOf(view, h);
                            return (
                              <button key={h.id} className={`ov-cell${open === h.id ? ' on' : ''}`} onClick={() => setOpen(h.id)}>
                                <span className="ov-cell-t">
                                  {h.unit} <small>{h.name}</small>
                                </span>
                                <span className={`ov-chip ${pr}`}>
                                  <Icon name={PRI_ICON[pr]} size={11} /> {PRI_LABEL[pr]}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === 'escalations' && (
              <>
                <div className="ov-card-h">
                  <span className="ov-h">
                    <Icon name="route" size={16} /> Escalation ladder
                  </span>
                </div>
                <ul className="ov-rows">
                  {escal.length === 0 && <li className="ov-empty">No escalations in this building.</li>}
                  {escal.map((h) => {
                    const e = view.esc.get(h.id)!;
                    return (
                      <li key={h.id}>
                        <button onClick={() => setOpen(h.id)}>
                          <b>{h.name}</b>
                          <span className="ov-steps">
                            {[1, 2, 3, 4].map((s) => (
                              <i key={s} className={e.step >= s ? 'on' : ''} />
                            ))}
                          </span>
                          <span>{STEP_LABEL[e.step]}</span>
                          <span className="ov-mono">{e.done ? 'done' : countdown(e.nextAtMicros, now)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {tab === 'alerts' && (
              <>
                <div className="ov-card-h">
                  <span className="ov-h">
                    <Icon name="bell" size={16} /> Alerts
                  </span>
                </div>
                <ul className="ov-rows">
                  {alerts.length === 0 && <li className="ov-empty">No alerts for this building.</li>}
                  {[...alerts].reverse().map((t) => (
                    <li key={t.id}>
                      <button onClick={() => t.householdId && setOpen(t.householdId)}>
                        <span className={`ov-sev ${t.severity}`} />
                        <span className="ov-mono">{clockText(t.atMicros).slice(0, 5)}</span>
                        <span className="ov-msg">{t.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="ov-card ov-list">
            <div className="ov-card-h">
              <span className="ov-h big">
                <Icon name="users" size={17} /> Waiting
              </span>
              <span className="ov-round" aria-hidden="true">
                <Icon name="sliders" size={15} />
              </span>
            </div>
            <div className="ov-totals">
              Total: <b>{waiting.length}/{homes.length} units</b> &nbsp; Highest HPI: <b>{waiting[0] && view.prio.get(waiting[0].id)?.scored ? view.prio.get(waiting[0].id)!.hpi.toFixed(0) : '—'}</b>
            </div>
            <div className="ov-items">
              {(open !== null && !waiting.some((h) => h.id === open) && homes.some((h) => h.id === open) ? [view.hh.get(open)!, ...waiting] : waiting).map((h) => {
                const pr = priOf(view, h);
                const p = view.prio.get(h.id);
                const e = view.esc.get(h.id);
                const n = view.node.get(h.id);
                const ci = view.checkin.get(h.id);
                const isOpen = open === h.id;
                const warn = p && p.tthMin >= 0 ? { t: h.medicalDevice, s: `${Math.round(p.tthMin)} min of backup power left. Bring a battery or generator.` } : n?.flame ? { t: 'Fire in unit', s: 'Flame sensor and temperature rise. Do not send volunteers.' } : h.mobilityLimited ? { t: 'Limited mobility', s: 'May need help evacuating. Send two people.' } : null;
                return (
                  <article key={h.id} className={`ov-item${isOpen ? ' open' : ''}`}>
                    <button className="ov-item-h" onClick={() => setOpen(isOpen ? null : h.id)} aria-expanded={isOpen}>
                      <span className="ov-thumb" aria-hidden="true">
                        <svg viewBox="-14 -14 28 28" width="44" height="44">
                          <path d="M-9 -1 V9 H9 V-1" fill="#3a3a3a" stroke="#5a5a5a" strokeWidth={0.8} />
                          <path d="M-12 0 L0 -11 L12 0 Z" fill="#4a4a4a" stroke="#6a6a6a" strokeWidth={0.8} strokeLinejoin="round" />
                          <rect x={-2.5} y={3} width={5} height={6} fill="#2a2a2a" />
                          <rect x={-7} y={1} width={3.5} height={3} fill={pr === 'critical' || pr === 'help' ? '#f87171' : '#e4f46b'} opacity={0.8} />
                        </svg>
                      </span>
                      <span className="ov-item-m">
                        <b>
                          {h.name} <small>{h.unit}</small>
                        </b>
                        <span>{p?.reason ?? 'No sensor: status unknown'}</span>
                        <span className="ov-mini">
                          <em>{h.age} yrs</em>
                          {h.medicalDevice && <em>{h.medicalDevice}</em>}
                          {h.livesAlone && <em className="warn">◇ Lives alone</em>}
                          {h.language !== 'English' && <em>{h.language}</em>}
                        </span>
                      </span>
                      <span className={`ov-chip ${pr} tr`}>{PRI_LABEL[pr]}</span>
                    </button>
                    {isOpen && (
                      <div className="ov-item-b">
                        <dl>
                          <div>
                            <dt>Ladder step</dt>
                            <dd>{e && e.step ? STEP_LABEL[e.step] : 'Not started'}</dd>
                          </div>
                          <div>
                            <dt>Queue rank</dt>
                            <dd>{p?.rank ? `#${p.rank}` : '—'}</dd>
                          </div>
                          <div>
                            <dt>Check-in</dt>
                            <dd>{ci ? CHECKIN_LABEL[ci.state] : '—'}</dd>
                          </div>
                          <div>
                            <dt>Priority</dt>
                            <dd>
                              {p?.scored ? p.hpi.toFixed(0) : '—'} <span className={`ov-chip ${pr} sm`}>{PRI_LABEL[pr]}</span>
                              <span className="ov-risk">
                                <i style={{ width: `${p?.hpi ?? 0}%` }} />
                              </span>
                            </dd>
                          </div>
                        </dl>
                        <div className="ov-metrics">
                          <span>
                            <Icon name="wifiOff" size={14} /> <b>{p ? Math.round(p.minutesSilent) : 0}</b> min silent
                          </span>
                          <span>
                            <Icon name="clock" size={14} /> {n ? agoText(n.lastSignalMicros, now) : 'no node'}
                          </span>
                        </div>
                        {warn && (
                          <div className="ov-warn">
                            <Icon name="alert" size={16} />
                            <span>
                              <b>{warn.t}</b>
                              {warn.s}
                            </span>
                          </div>
                        )}
                        <div className="ov-item-acts">
                          <button onClick={() => onSelectGlobal(h.id)}>
                            <Icon name="map" size={14} /> View on map
                          </button>
                          {h.hasSensor && (
                            <button disabled={busy} onClick={() => run(() => actions.setFinalState(h.id, 'found_ok', 'Marked found OK by dispatcher'))}>
                              <Icon name="check" size={14} /> Mark found OK
                            </button>
                          )}
                          {h.hasSensor && h.finalState !== 'assisted' && (
                            <button disabled={busy} onClick={() => run(() => actions.setFinalState(h.id, 'assisted', 'Marked assisted by dispatcher'))}>
                              <Icon name="shield" size={14} /> {FINAL_LABEL.assisted}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              {waiting.length === 0 && open === null && <p className="ov-empty">Everyone in {b.name} is accounted for.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function worst(view: View, bid: number) {
  return view.households.filter((h) => h.buildingId === bid).reduce((m, h) => Math.max(m, view.prio.get(h.id)?.rank ? view.prio.get(h.id)!.hpi : 0), 0);
}

function Cap({ icon, value, of, unit, label, pct, tone }: { icon: IconName; value: string; of: string; unit: string; label: string; pct: number; tone: 'amber' | 'red' }) {
  return (
    <div className="ov-cap">
      <span className="ov-cap-v">
        <Icon name={icon} size={14} /> <b>{value}</b> / {of} {unit}
      </span>
      <span className="ov-cap-l">{label}</span>
      <span className="ov-cap-bar">
        <em>{Math.round(pct * 100)}%</em>
        <span className={tone}>
          <i style={{ width: `${pct * 100}%` }} />
        </span>
      </span>
    </div>
  );
}
