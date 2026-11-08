import { useState } from 'react';
import { CHECKIN_LABEL, FINAL_LABEL, STEP_LABEL, agoText, bandOf, clockText, countdown, type View } from '../data/derive';
import type { Actions, OverrideLog, TimelineRow } from '../data/types';
import { ArcGauge, BAND_COLOR, Ring, TankGauge } from './Gauges';
import { Icon, type IconName } from './Icon';

type Tab = 'overview' | 'factors' | 'sensors' | 'history';

interface Props {
  id: number;
  view: View;
  now: number;
  overrides: OverrideLog[];
  timeline: TimelineRow[];
  actions: Actions;
  onClose(): void;
  onError(msg: string): void;
}

export function DetailCard({ id, view, now, overrides, timeline, actions, onClose, onError }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState(0);
  const [why, setWhy] = useState('');
  const h = view.hh.get(id);
  if (!h) return null;
  const p = view.prio.get(id);
  const n = view.node.get(id);
  const e = view.esc.get(id);
  const ci = view.checkin.get(id);
  const b = view.building.get(h.buildingId);
  const band = bandOf(h, p);
  const color = BAND_COLOR[band]!;

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

  const tags: { icon: IconName; text: string }[] = [];
  if (h.age) tags.push({ icon: 'user', text: `${h.age} yrs` });
  if (h.medicalDevice) tags.push({ icon: 'heart', text: h.medicalDevice });
  if (h.mobilityLimited) tags.push({ icon: 'accessibility', text: 'Limited mobility' });
  if (h.livesAlone) tags.push({ icon: 'home', text: 'Lives alone' });
  if (h.infant) tags.push({ icon: 'baby', text: 'Infant' });
  if (h.language !== 'English') tags.push({ icon: 'globe', text: h.language });

  // Warning bar: the single most urgent fact, in words.
  let warning: { tone: string; icon: IconName; title: string; text: string } | null = null;
  if (n?.flame) warning = { tone: 'crit', icon: 'flame', title: 'Fire in unit', text: `Flame sensor plus +${n.tempRiseC.toFixed(0)}°C. Responders routed.` };
  else if (p && p.tthMin >= 0)
    warning = {
      tone: p.tthMin < 60 ? 'crit' : 'warn',
      icon: 'zap',
      title: `${h.medicalDevice} backup runs out at ${clockText(now + p.tthMin * 6e7).slice(0, 5)}`,
      text: `${Math.round(p.tthMin)} min of battery left. Clock term K = ${p.K.toFixed(2)}.`,
    };
  else if (ci?.state === 'help') warning = { tone: 'crit', icon: 'alert', title: 'Pressed “I need help”', text: `From the ${ci.source}, ${agoText(ci.answeredAtMicros, now)}.` };
  else if (n && !n.online && h.hasSensor) warning = { tone: 'warn', icon: 'wifiOff', title: 'Node silent', text: `${n.abrupt ? 'Stopped abruptly at the event. ' : ''}Last signal ${agoText(n.lastSignalMicros, now)}.` };
  else if (!h.hasSensor) warning = { tone: 'warn', icon: 'alert', title: 'No sensor here', text: 'Status unknown, never assumed safe. Needs a manual check.' };

  const ladderPct = e && e.step > 0 && !e.done ? Math.min(1, Math.max(0, (now - e.stepAtMicros) / Math.max(1, e.nextAtMicros - e.stepAtMicros))) : 0;
  const myLog = timeline.filter((t) => t.householdId === id).sort((a, c) => c.id - a.id);
  const myOverrides = overrides.filter((o) => o.householdId === id).sort((a, c) => c.atMicros - a.atMicros);
  const status = FINAL_LABEL[h.finalState];
  const statusTone = h.finalState === 'found_ok' ? 'good' : h.finalState === 'assisted' ? 'blue' : h.finalState === 'found_needs_help' ? 'crit' : !h.hasSensor ? '' : 'warn';

  return (
    <section className="detail glass" aria-label={`${h.name} details`}>
      <header className="dt-head">
        <div className="dt-avatar" style={{ borderColor: color }}>
          <Icon name="home" size={20} />
        </div>
        <div className="dt-title">
          <div className="dt-name">
            {h.name} <span className={`chip ${statusTone}`}>{status}</span>
          </div>
          <div className="dt-sub">
            Unit {h.unit} · {b?.name ?? 'No building record'}
            {h.hero ? ` · demo case` : ''}
          </div>
        </div>
        <button className="icon-btn ghost" onClick={onClose} aria-label="Close details">
          <Icon name="x" size={18} />
        </button>
      </header>

      {h.hasSensor && e && e.step > 0 && (
        <div className="ladder-track">
          <div className="lt-top">
            <span>{e.done ? 'Ladder finished' : `Step ${e.step} · ${STEP_LABEL[e.step]}`}</span>
            {!e.done && <span className="mono">{e.step === 4 ? 'arrival' : 'next step'} in {countdown(e.nextAtMicros, now)}</span>}
          </div>
          <div className="lt-steps">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`lt-seg${e.step > s || (e.done && e.step >= s) ? ' done' : ''}${e.step === s && !e.done ? ' now' : ''}`}>
                <i style={e.step === s && !e.done ? { width: `${ladderPct * 100}%` } : undefined} />
                <span>{['Check-in', 'Contact', 'Knock', 'Dispatch'][s - 1]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        {(['overview', 'factors', 'sensors', 'history'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
            {t === 'history' && myLog.length > 0 && <span className="tab-count">{myLog.length}</span>}
          </button>
        ))}
      </div>

      <div className="dt-body">
        {tab === 'overview' && (
          <>
            <div className="gauge-row">
              <div className="gauge-card">
                <div className="gc-head">
                  <span>Priority</span>
                  {p && p.rank > 0 && <span className="chip">Rank {p.rank}</span>}
                </div>
                {h.hasSensor && p ? <ArcGauge value={p.hpi} band={band} label={`HPI · ${band.toUpperCase()}`} /> : <div className="gauge-na">Not scored</div>}
              </div>
              <div className="gauge-card">
                <div className="gc-head">
                  <span>{p && p.tthMin >= 0 ? 'Backup power' : 'Signal'}</span>
                  {n?.onBattery && <span className="chip warn">On battery</span>}
                </div>
                {p && p.tthMin >= 0 ? (
                  <TankGauge fraction={p.tthMin / Math.max(1, h.backupRuntimeMin)} minutes={p.tthMin} label={h.medicalDevice} />
                ) : (
                  <div className="signal">
                    <Ring value={n?.online ? 1 : Math.max(0.05, 1 - (p?.minutesSilent ?? 0) / 20)} color={n?.online ? 'var(--ok)' : 'var(--high)'} size={84}>
                      <Icon name={n?.online ? 'radio' : 'wifiOff'} size={22} />
                    </Ring>
                    <span>{!n ? 'No node' : n.online ? 'Node reporting' : `Silent ${Math.round(p?.minutesSilent ?? 0)} min`}</span>
                    <small>{ci ? CHECKIN_LABEL[ci.state] : ''}</small>
                  </div>
                )}
              </div>
            </div>

            {warning && (
              <div className={`warnbar ${warning.tone}`}>
                <Icon name={warning.icon} size={18} />
                <div>
                  <b>{warning.title}</b>
                  <span>{warning.text}</span>
                </div>
              </div>
            )}

            {p && (
              <div className="reason">
                <div className="eyebrow">Why this rank</div>
                <p>{p.reason}</p>
              </div>
            )}

            {tags.length > 0 && (
              <div className="tagrow">
                {tags.map((t) => (
                  <span key={t.text} className="tag">
                    <Icon name={t.icon} size={13} /> {t.text}
                  </span>
                ))}
              </div>
            )}

            {h.hasSensor && (
              <div className="act-grid">
                <button className="act good" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'found_ok', 'Marked found OK by dispatcher.'))}>
                  <Icon name="check" size={16} /> Found OK
                </button>
                <button className="act crit" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'found_needs_help', 'Marked needs help by dispatcher.'))}>
                  <Icon name="alert" size={16} /> Needs help
                </button>
                <button className="act blue" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'assisted', 'Marked assisted by dispatcher.'))}>
                  <Icon name="shield" size={16} /> Assisted
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'factors' && p && p.scored && (
          <>
            <div className="factor-list">
              {[
                { k: 'E', v: p.E, max: 1, d: 'Exposure', s: 'Shaking, building risk, fire' },
                { k: 'S', v: p.S, max: 1, d: 'Silence', s: p.minutesSilent >= 1 ? `${Math.round(p.minutesSilent)} min since last signal${p.commsOutage ? ' (outage discount)' : ''}` : 'Node reporting' },
                { k: 'C', v: p.C, max: 1, d: 'Check-in', s: ci ? CHECKIN_LABEL[ci.state] : '—' },
                { k: 'V', v: p.V, max: 1, d: 'Vulnerability', s: 'Need-based only' },
                { k: 'K', v: p.K - 1, max: 0.5, d: 'Clock', s: p.tthMin >= 0 ? `${Math.round(p.tthMin)} min backup left` : n?.flame ? 'Flame in unit' : 'No time pressure', shown: p.K },
              ].map((f) => (
                <div className="factor" key={f.k}>
                  <span className="f-k">{f.k}</span>
                  <div className="f-main">
                    <div className="f-top">
                      <span>{f.d}</span>
                      <b className="mono">{(f.shown ?? f.v).toFixed(2)}</b>
                    </div>
                    <div className="f-bar">
                      <i style={{ width: `${Math.min(100, (f.v / f.max) * 100)}%` }} />
                    </div>
                    <small>{f.s}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="formula mono">
              HPI = 100 · L · M · K + A + δ<br />L {p.L.toFixed(3)} · M {p.M.toFixed(2)} · K {p.K.toFixed(2)} · A +{p.A} · δ {p.override >= 0 ? '+' : ''}
              {p.override} → <b style={{ color }}>{p.hpi.toFixed(1)}</b>
            </div>
            <p className="fine">Computed by the recompute_hpi reducer on the server. This screen only displays it.</p>
            <form
              className="override"
              onSubmit={(ev) => {
                ev.preventDefault();
                void run(async () => {
                  await actions.overridePriority(id, delta, why);
                  setWhy('');
                });
              }}
            >
              <div className="ov-top">
                <span className="eyebrow">Human override · logged</span>
                <b className="mono">
                  {delta > 0 ? '+' : ''}
                  {delta}
                </b>
              </div>
              <input type="range" min={-30} max={30} step={5} value={delta} onChange={(ev) => setDelta(Number(ev.target.value))} aria-label="Override amount" />
              <label className="sr-only" htmlFor={`why-${id}`}>
                Reason
              </label>
              <input id={`why-${id}`} type="text" placeholder="Reason (required)" value={why} onChange={(ev) => setWhy(ev.target.value)} />
              <button className="btn primary" type="submit" disabled={busy || !why.trim()}>
                Apply override
              </button>
              {myOverrides.map((o) => (
                <div key={o.id} className="fine">
                  {o.delta > 0 ? '+' : ''}
                  {o.delta} · {o.reason} · {agoText(o.atMicros, now)}
                </div>
              ))}
            </form>
          </>
        )}
        {tab === 'factors' && (!p || !p.scored) && <p className="fine">Not scored: no sensor here, so this home shows as unknown, never safe.</p>}

        {tab === 'sensors' && (
          <>
            {n ? (
              <div className="sensor-grid">
                <Sensor icon="radio" label="Node" value={n.online ? 'Online' : 'Silent'} sub={`Last signal ${agoText(n.lastSignalMicros, now)}`} tone={n.online ? 'good' : 'warn'} />
                <Sensor icon="zap" label="Power" value={n.onBattery ? 'Battery' : 'Mains'} sub={n.onBattery ? `Lost ${agoText(n.powerLostAtMicros, now)}` : 'Normal'} tone={n.onBattery ? 'warn' : 'good'} />
                <Sensor icon="quake" label="Shaking" value={n.shakeConfirmed ? `${n.shakePeakG.toFixed(2)} g` : 'None'} sub={n.shakeConfirmed ? `${n.shakeDurationS.toFixed(0)} s, confirmed` : 'No confirmed event'} tone={n.shakeConfirmed ? 'warn' : 'good'} />
                <Sensor icon="flame" label="Flame" value={n.flame ? 'Detected' : 'Clear'} tone={n.flame ? 'crit' : 'good'} />
                <Sensor icon="thermo" label="Temperature" value={n.tempRiseC > 0 ? `+${n.tempRiseC.toFixed(0)}°C` : 'Normal'} tone={n.tempRiseC >= 10 ? 'crit' : n.tempRiseC > 0 ? 'warn' : 'good'} />
                <Sensor icon="activity" label="Motion" value={n.lastMotionMicros ? agoText(n.lastMotionMicros, now) : 'None'} tone="" />
              </div>
            ) : (
              <p className="fine">No node installed at this address.</p>
            )}
            {h.hasSensor && (
              <div className="resident">
                <div className="eyebrow">Play the resident (simulated phone app)</div>
                <div className="act-grid two">
                  <button className="act good" disabled={busy} onClick={() => run(() => actions.submitCheckin(id, 'ok', 'phone'))}>
                    I'm OK
                  </button>
                  <button className="act crit" disabled={busy} onClick={() => run(() => actions.submitCheckin(id, 'help', 'phone'))}>
                    I need help
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'history' && (
          <ol className="mini-log">
            {myLog.length === 0 && <li className="fine">Nothing logged for this home yet.</li>}
            {myLog.map((t) => (
              <li key={t.id}>
                <span className={`sev ${t.severity}`} />
                <time className="mono">{clockText(t.atMicros).slice(0, 5)}</time>
                <span>{t.message}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Sensor({ icon, label, value, sub, tone }: { icon: IconName; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`sensor ${tone}`}>
      <Icon name={icon} size={16} />
      <span className="s-lbl">{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}
