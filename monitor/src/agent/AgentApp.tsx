import { useMemo, useState } from 'react';
import '../theme/tokens.css';
import '../theme/base.css';
import '../ui/kit/kit.css';
import './agent.css';
import { useHeadcount } from '../data/HeadcountProvider';
import { STEP_LABEL, agoText, clockText, useView } from '../data/derive';
import type { Household } from '../data/types';
import { LiveSensorBadge, sensorState } from '../ui/LiveSensor';
import '../ui/live-sensor.css';

// State Farm agent view: the household-to-agent hand-off. Read-only on the
// priority table (AGENTS.md rule 4). Every policyholder and action here is
// simulated; nothing contacts a real person or files a real claim. Lists are
// ordered only by the module's need-based rank, never by policy value.

const HERO_ID = 1; // Mrs. Alvarez, the household driven by the real Pi node

type Group = 'help' | 'open' | 'found' | 'assisted' | 'unknown';
const GROUPS: { id: Group; label: string; tone: string }[] = [
  { id: 'help', label: 'Found, needs help', tone: 'critical' },
  { id: 'open', label: 'Not yet reached', tone: 'waiting' },
  { id: 'assisted', label: 'Assisted', tone: 'assisted' },
  { id: 'found', label: 'Found OK', tone: 'ok' },
  { id: 'unknown', label: 'No sensor', tone: 'unknown' },
];

const groupOf = (h: Household): Group =>
  h.finalState === 'found_needs_help' ? 'help'
  : h.finalState === 'found_ok' ? 'found'
  : h.finalState === 'assisted' ? 'assisted'
  : !h.hasSensor ? 'unknown' : 'open';

const NEXT_STEPS: Record<Group, string[]> = {
  help: ['Call policyholder (simulated)', 'Open claim (simulated)', 'Arrange temporary housing', 'Schedule damage inspection'],
  open: ['Wait for Headcount to reach them', 'Call emergency contact on file (simulated)'],
  assisted: ['Call policyholder (simulated)', 'Open claim (simulated)', 'Schedule damage inspection'],
  found: ['Send check-in message (simulated)', 'Offer damage inspection'],
  unknown: ['Request a welfare check through dispatch (simulated)'],
};

export function AgentApp() {
  const { snapshot } = useHeadcount();
  const view = useView(snapshot);
  const [sel, setSel] = useState<number>(HERO_ID);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const now = Date.now() * 1000 + snapshot.clockOffsetMicros;

  const grouped = useMemo(() => {
    const rank = (h: Household) => view.prio.get(h.id)?.rank || 9999;
    const m = new Map<Group, Household[]>(GROUPS.map((g) => [g.id, []]));
    for (const h of view.households) if (h.id !== HERO_ID) m.get(groupOf(h))!.push(h);
    for (const list of m.values()) list.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
    return m;
  }, [view]);

  const hero = view.hh.get(HERO_ID);
  const h = view.hh.get(sel) ?? hero;
  const c = view.counts;

  return (
    <div className="ag">
      <header className="ag-top">
        <div className="ag-brand">
          <span className="ag-mark" aria-hidden>SF</span>
          <div>
            <div className="ag-title">Agent hand-off</div>
            <div className="ag-sub">State Farm agent view · simulated book of 40 policyholders</div>
          </div>
        </div>
        <div className="ag-kpis" aria-live="polite">
          <Kpi n={c.help} label="Need help" tone="critical" />
          <Kpi n={c.unresolved} label="Not yet reached" tone="waiting" />
          <Kpi n={c.assisted} label="Assisted" tone="assisted" />
          <Kpi n={c.ok} label="Found OK" tone="ok" />
        </div>
        <div className="ag-who">
          <div className="ag-who-name">Agent J. Rivera</div>
          <div className="ag-sub">Simulated agent · Cedar Hollow office</div>
        </div>
      </header>

      <main className="ag-main">
        <aside className="hc-panel ag-list">
          {hero && (
            <button className={`ag-hero${sel === HERO_ID ? ' on' : ''}`} onClick={() => setSel(HERO_ID)}>
              <div className="ag-kicker">{sensorState(hero, view.node.get(HERO_ID), now).live ? 'Live device · real sensor node' : 'Demo household'}</div>
              <Row h={hero} view={view} />
              <LiveSensorBadge h={hero} n={view.node.get(HERO_ID)} now={now} compact />
            </button>
          )}
          {GROUPS.map((g) => {
            const list = grouped.get(g.id)!;
            if (!list.length) return null;
            return (
              <section key={g.id}>
                <div className="ag-group"><span className={`hc-dot t-${g.tone}`} />{g.label}<span className="ag-n">{list.length}</span></div>
                {list.map((x) => (
                  <button key={x.id} className={`ag-item${sel === x.id ? ' on' : ''}`} onClick={() => setSel(x.id)}>
                    <Row h={x} view={view} />
                  </button>
                ))}
              </section>
            );
          })}
        </aside>

        {h && <Detail h={h} view={view} now={now} timeline={snapshot.timeline.filter((t) => t.householdId === h.id).sort((a, b) => b.atMicros - a.atMicros).slice(0, 12)}
          done={done} onToggle={(k) => setDone((d) => ({ ...d, [k]: !d[k] }))} />}
      </main>
      <footer className="ag-foot">Synthetic data. Headcount shares a household with its agent only after the household is found; ranking is by need only, never policy value. No real claims, calls or messages are made.</footer>
    </div>
  );
}

function Kpi({ n, label, tone }: { n: number; label: string; tone: string }) {
  return <div className="ag-kpi"><span className={`ag-kpi-n ink-${tone}`}>{n}</span><span className="ag-sub">{label}</span></div>;
}

function Row({ h, view }: { h: Household; view: ReturnType<typeof useView> }) {
  const g = GROUPS.find((x) => x.id === groupOf(h))!;
  const b = view.building.get(h.buildingId);
  return (
    <div className="ag-row">
      <div className="ag-row-main">
        <span className="ag-name">{h.name}</span>
        <span className="ag-sub">{b?.name} {h.unit}</span>
      </div>
      <span className={`ag-tag t-${g.tone}`}>{g.label}</span>
    </div>
  );
}

function Detail({ h, view, now, timeline, done, onToggle }: {
  h: Household; view: ReturnType<typeof useView>; now: number;
  timeline: { id: number; atMicros: number; message: string; severity: string }[];
  done: Record<string, boolean>; onToggle: (k: string) => void;
}) {
  const g = groupOf(h);
  const p = view.prio.get(h.id);
  const e = view.esc.get(h.id);
  const n = view.node.get(h.id);
  const b = view.building.get(h.buildingId);
  const shared = g !== 'open' && g !== 'unknown';
  const flags = [
    h.medicalDevice && `Medical device: ${h.medicalDevice}`,
    h.mobilityLimited && 'Limited mobility',
    h.livesAlone && 'Lives alone',
    h.infant && 'Infant at home',
    h.language !== 'English' && `Prefers ${h.language}`,
    n?.onBattery && 'Home on battery power',
  ].filter(Boolean) as string[];

  return (
    <section className="hc-panel ag-detail">
      <div className="ag-kicker">{b?.name} · Unit {h.unit} · Policyholder (simulated)</div>
      <div className="ag-head">
        <h1 className="ag-h1">{h.name}</h1>
        <span className={`ag-tag t-${GROUPS.find((x) => x.id === g)!.tone}`}>{GROUPS.find((x) => x.id === g)!.label}</span>
        <LiveSensorBadge h={h} n={n} now={now} />
      </div>

      <div className={`hc-alert ag-share ${shared ? 'is-shared' : ''}`}>
        <strong>{shared ? 'Shared with you by Headcount' : 'Not shared yet'}</strong>
        <span>{shared
          ? `Found ${h.finalAtMicros ? agoText(h.finalAtMicros, now) : ''}${h.finalNote ? ` · "${h.finalNote}"` : ''}`
          : 'Responders reach people first. This record opens to you once the household is found.'}</span>
      </div>

      <div className="ag-grid">
        <div className="hc-tile"><div className="ag-cap">Headcount priority</div><div className="ag-big">{p ? Math.round(p.hpi) : '—'}</div><div className="ag-sub">{p?.reason || 'No active incident'}</div></div>
        <div className="hc-tile"><div className="ag-cap">Response step</div><div className="ag-mid">{STEP_LABEL[e?.step ?? 0]}</div><div className="ag-sub">{e?.step === 4 ? 'Simulated 911 hand-off' : ' '}</div></div>
        <div className="hc-tile"><div className="ag-cap">Device</div><div className="ag-mid">{!h.hasSensor ? 'No sensor' : n?.online ? 'Online' : 'Silent'}</div><div className="ag-sub">{n?.lastSignalMicros ? `Last signal ${agoText(n.lastSignalMicros, now)}` : ' '}</div></div>
      </div>

      {flags.length > 0 && <div className="ag-flags">{flags.map((f) => <span key={f} className="hc-chip">{f}</span>)}</div>}

      <div className="ag-cols">
        <div>
          <div className="ag-cap">Next steps for the agent</div>
          <ul className="ag-steps">
            {NEXT_STEPS[g].map((s) => {
              const k = `${h.id}:${s}`;
              return (
                <li key={k}>
                  <label><input type="checkbox" checked={!!done[k]} onChange={() => onToggle(k)} /> {s}</label>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <div className="ag-cap">What happened</div>
          <ol className="ag-tl">
            {timeline.length === 0 && <li className="ag-sub">No events for this household yet.</li>}
            {timeline.map((t) => (
              <li key={t.id}><span className="ag-time">{clockText(t.atMicros)}</span><span className={`hc-dot t-${t.severity === 'critical' ? 'critical' : t.severity === 'warn' ? 'waiting' : t.severity === 'good' ? 'ok' : 'unknown'}`} />{t.message}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
