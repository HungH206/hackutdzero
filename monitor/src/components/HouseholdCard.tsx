import { useState } from 'react';
import type { View } from '../data/derive';
import { CHECKIN_LABEL, FINAL_LABEL, STEP_LABEL, agoText, bandOf, countdown } from '../data/derive';
import type { Actions, OverrideLog } from '../data/types';

const BAND_COLOR: Record<string, string> = {
  low: 'var(--low)',
  guarded: 'var(--guarded)',
  high: 'var(--high)',
  critical: 'var(--critical)',
  unknown: 'var(--unknown)',
};

interface Props {
  id: number;
  view: View;
  now: number;
  overrides: OverrideLog[];
  actions: Actions;
  onClose(): void;
  onError(msg: string): void;
}

export function HouseholdCard({ id, view, now, overrides, actions, onClose, onError }: Props) {
  const h = view.hh.get(id);
  const p = view.prio.get(id);
  const n = view.node.get(id);
  const e = view.esc.get(id);
  const ci = view.checkin.get(id);
  const [delta, setDelta] = useState(0);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  if (!h) return null;
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

  const profile = [
    h.age ? `${h.age} yrs` : null,
    h.medicalDevice ? `${h.medicalDevice} (${h.backupRuntimeMin} min backup)` : null,
    h.mobilityLimited ? 'limited mobility' : null,
    h.livesAlone ? 'lives alone' : null,
    h.infant ? 'infant at home' : null,
    h.language !== 'English' ? `speaks ${h.language}` : null,
  ].filter(Boolean) as string[];

  const factorRows = p
    ? [
        { k: 'E', v: p.E, max: 1, desc: 'Exposure: shaking, building risk, fire' },
        { k: 'S', v: p.S, max: 1, desc: `Silence: ${p.minutesSilent >= 1 ? `${Math.round(p.minutesSilent)} min since last signal` : 'node reporting'}${p.commsOutage ? ', area outage discount' : ''}` },
        { k: 'C', v: p.C, max: 1, desc: `Check-in: ${ci ? CHECKIN_LABEL[ci.state] : 'n/a'}` },
        { k: 'V', v: p.V, max: 1, desc: 'Vulnerability (need-based only)' },
        { k: 'K', v: p.K - 1, max: 0.5, shown: p.K, desc: p.tthMin >= 0 ? `Clock: ${Math.round(p.tthMin)} min of backup power left` : n?.flame ? 'Clock: flame in unit' : 'Clock: no time pressure' },
      ]
    : [];
  const mine = overrides.filter((o) => o.householdId === id).sort((a, b) => b.atMicros - a.atMicros);

  return (
    <div className="card" role="dialog" aria-label={`${h.name} details`}>
      <div className="card-top">
        <div>
          <h3>{h.name}</h3>
          <p>
            Unit {h.unit} · {b?.name ?? 'No building record'}
            {h.hero ? ` · demo case: ${h.hero}` : ''}
          </p>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="card-body">
        <div className="big-hpi">
          <div className="num" style={{ color }}>
            {h.hasSensor && p ? p.hpi.toFixed(1) : '?'}
          </div>
          <div>
            <div style={{ color, fontWeight: 700, textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.06em' }}>
              {band}
              {p && p.rank > 0 ? ` · rank ${p.rank}` : ''}
            </div>
            <div className="tag" style={{ marginTop: 4, display: 'inline-block' }}>
              {FINAL_LABEL[h.finalState]}
              {h.finalAtMicros > 0 ? ` · ${agoText(h.finalAtMicros, now)}` : ''}
            </div>
          </div>
        </div>

        {p && <div className="reason-box">{p.reason}</div>}
        {h.finalNote && <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{h.finalNote}</div>}

        {p && p.scored && (
          <div>
            <div className="section-title">Factor breakdown (from recompute_hpi)</div>
            <div className="factors">
              {factorRows.map((f) => (
                <FactorRow key={f.k} k={f.k} v={f.v} max={f.max} shown={f.shown ?? f.v} desc={f.desc} />
              ))}
            </div>
            <div className="formula" style={{ marginTop: 8 }}>
              L {p.L.toFixed(3)} · M {p.M.toFixed(2)} · K {p.K.toFixed(2)} · A +{p.A} · δ {p.override >= 0 ? '+' : ''}
              {p.override} → HPI {p.hpi.toFixed(1)}
            </div>
          </div>
        )}

        {h.hasSensor && e && (
          <div>
            <div className="section-title">Escalation ladder</div>
            <div className="ladder">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className={`${e.step === s && !e.done ? `now s${s}` : ''} ${e.step > s || (e.done && e.step >= s) ? 'done' : ''}`}>
                  {s}. {STEP_LABEL[s]}
                </div>
              ))}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
              {e.step === 0
                ? 'Waiting for a confirmed event.'
                : e.done
                  ? 'Ladder finished.'
                  : `${e.step === 4 ? 'Responder arrival expected' : 'Next step'} in ${countdown(e.nextAtMicros, now)}. Waits shrink as HPI grows.`}
            </div>
          </div>
        )}

        {n && (
          <dl className="kv">
            <dt>Node</dt>
            <dd>
              {n.online ? 'online' : `offline${n.abrupt ? ' (stopped abruptly)' : ''}`} · last signal {agoText(n.lastSignalMicros, now)}
            </dd>
            <dt>Power</dt>
            <dd>{n.onBattery ? `mains lost ${agoText(n.powerLostAtMicros, now)}, on battery` : 'mains OK'}</dd>
            <dt>Sensors</dt>
            <dd>
              {n.flame ? '🔥 flame · ' : ''}
              {n.tempRiseC > 0 ? `temp +${n.tempRiseC.toFixed(0)}°C · ` : ''}
              {n.shakeConfirmed ? `shaking ${n.shakePeakG.toFixed(2)} g for ${n.shakeDurationS.toFixed(0)} s` : 'no confirmed shaking'}
            </dd>
            <dt>Profile</dt>
            <dd>{profile.length ? profile.join(' · ') : 'no special needs on file'}</dd>
          </dl>
        )}

        {h.hasSensor && (
          <div>
            <div className="section-title">Responder actions</div>
            <div className="btn-row">
              <button className="btn good" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'found_ok', 'Marked found OK by dispatcher.'))}>
                ✓ Found, OK
              </button>
              <button className="btn crit" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'found_needs_help', 'Marked needs help by dispatcher.'))}>
                ! Needs help
              </button>
              <button className="btn blue" disabled={busy} onClick={() => run(() => actions.setFinalState(id, 'assisted', 'Marked assisted by dispatcher.'))}>
                A Assisted
              </button>
            </div>
          </div>
        )}

        {h.hasSensor && p && (
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
            <div className="section-title" style={{ margin: 0 }}>
              Human override (logged)
            </div>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span>Adjust HPI</span>
              <b style={{ fontFamily: 'var(--mono)' }}>
                {delta > 0 ? '+' : ''}
                {delta}
              </b>
            </label>
            <input type="range" min={-30} max={30} step={5} value={delta} onChange={(ev) => setDelta(Number(ev.target.value))} aria-label="Override amount" />
            <input type="text" placeholder="Reason (required), e.g. neighbor reports smoke" value={why} onChange={(ev) => setWhy(ev.target.value)} />
            <button className="btn primary" type="submit" disabled={busy || !why.trim()}>
              Apply override
            </button>
            {mine.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {mine.map((o) => (
                  <div key={o.id}>
                    {o.delta > 0 ? '+' : ''}
                    {o.delta} · {o.reason} · {agoText(o.atMicros, now)}
                  </div>
                ))}
              </div>
            )}
          </form>
        )}

        {h.hasSensor && (
          <div>
            <div className="section-title">Play the resident (simulated phone app)</div>
            <div className="btn-row">
              <button className="btn good" disabled={busy} onClick={() => run(() => actions.submitCheckin(id, 'ok', 'phone'))}>
                I'm OK
              </button>
              <button className="btn crit" disabled={busy} onClick={() => run(() => actions.submitCheckin(id, 'help', 'phone'))}>
                I need help
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FactorRow({ k, v, max, shown, desc }: { k: string; v: number; max: number; shown: number; desc: string }) {
  return (
    <>
      <span className="lbl">{k}</span>
      <div className="bar">
        <div style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
      </div>
      <span className="val">{shown.toFixed(2)}</span>
      <span />
      <span className="desc">{desc}</span>
    </>
  );
}
