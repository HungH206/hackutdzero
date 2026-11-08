import { useEffect, useMemo, useRef, useState } from 'react';
import { agoText, clockText, useScenarioNow, useView } from '../data/derive';
import { financeOf } from './finance';
import { FinancePanel } from './FinancePanel';
import { useHeadcount } from '../data/HeadcountProvider';
import { Icon, type IconName } from '../ui/Icon';
import { fmtUsd, impacts, type BuildingImpact } from './model';
import './cbre.css';

// CBRE operations view. Same live events as the dispatch console, rolled up to
// the building with SYNTHETIC property numbers. Layout after the staking
// dashboard reference: sidebar, top asset cards, exposure card, detail panel.

const HORIZONS = [
  { h: 24, label: '24H' },
  { h: 72, label: '72H' },
  { h: 168, label: '7D' },
];
type Tab = 'systems' | 'tenants' | 'action' | 'exposure';

export function CbreApp() {
  const { snapshot, connection } = useHeadcount();
  const view = useView(snapshot);
  const now = useScenarioNow(snapshot.clockOffsetMicros);
  const [horizon, setHorizon] = useState(72);
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('systems');
  const all = useMemo(() => impacts(snapshot), [snapshot]);
  const ranked = [...all].sort((a, b) => b.revenueAtRisk(horizon) + b.repairCost - (a.revenueAtRisk(horizon) + a.repairCost));
  const cur = all.find((x) => x.prop.buildingId === sel) ?? ranked[0]!;

  // Client-side history of each building's exposure, for the sparklines.
  const hist = useRef(new Map<number, number[]>());
  useEffect(() => {
    for (const x of all) {
      const v = x.revenueAtRisk(horizon) + x.repairCost;
      const arr = hist.current.get(x.prop.buildingId) ?? [];
      if (arr[arr.length - 1] !== v) arr.push(v);
      if (!view.disasterActive) arr.splice(0, arr.length, v);
      hist.current.set(x.prop.buildingId, arr.slice(-40));
    }
  }, [all, horizon, view.disasterActive]);

  const totalRisk = all.reduce((m, x) => m + x.revenueAtRisk(horizon), 0);
  const totalRepair = all.reduce((m, x) => m + x.repairCost, 0);
  const affected = all.filter((x) => x.failP > 0.1 || x.fire || x.powerOut > 0.2);

  return (
    <div className="cb">
      <aside className="cb-side">
        <div className="cb-brand">
          <span className="cb-mark">
            <Icon name="home" size={20} />
          </span>
          <div>
            <b>Headcount</b>
            <span>Property operations</span>
          </div>
        </div>
        <div className="cb-seg" role="tablist">
          <button role="tab" aria-selected className="on">
            Portfolio
          </button>
          <a role="tab" href="/?view=graph" className="">
            Dispatch
          </a>
        </div>
        <nav className="cb-nav">
          <a className="on" href="#top">
            <Icon name="chart" size={17} /> Dashboard
          </a>
          <a href="#buildings">
            <Icon name="layers" size={17} /> Buildings
          </a>
          <a href="#detail">
            <Icon name="sliders" size={17} /> Systems
          </a>
          <a href="#finance">
            <Icon name="activity" size={17} /> Finance
          </a>
          <a href="/?view=tree">
            <Icon name="route" size={17} /> Building view <Icon name="chevronRight" size={13} />
          </a>
        </nav>
        <div className="cb-active">
          <div className="cb-active-h">
            <Icon name="alert" size={16} /> Affected buildings <span className="cb-count">{affected.length}</span>
          </div>
          {ranked.map((x) => (
            <button key={x.prop.buildingId} className={`cb-asset${cur === x ? ' on' : ''}${affected.includes(x) ? '' : ' dim'}`} onClick={() => setSel(x.prop.buildingId)}>
              <span className={`cb-ico ${x.kind}`}>{x.name[0]}</span>
              <span>
                <small>{x.name}</small>
                <b>At risk {fmtUsd(x.revenueAtRisk(horizon) + x.repairCost)}</b>
              </span>
            </button>
          ))}
        </div>
        <div className="cb-note">
          <Icon name="shield" size={18} />
          <span>
            <b>Synthetic portfolio</b>
            Rents, costs and tenants are invented for the demo.
          </span>
        </div>
      </aside>

      <main className="cb-main" id="top">
        <header className="cb-top">
          <div className="cb-user">
            <span className="cb-avatar">
              <Icon name="user" size={18} />
            </span>
            <span>
              <small>Cedar Hollow portfolio</small>
              <b>Operations manager</b>
            </span>
          </div>
          <a className="cb-primary" href={`/?view=tree&b=${cur.prop.buildingId}`}>
            Open in dispatch <Icon name="route" size={15} />
          </a>
          <div className="cb-top-r">
            <span className="cb-pill mono">{clockText(now)}</span>
            <span className={`cb-pill conn ${connection.status}`}>
              <i /> {connection.source === 'local' ? 'Local data' : 'SpacetimeDB'}
            </span>
            <span className="cb-bell" aria-label={`${affected.length} affected buildings`}>
              <Icon name="bell" size={18} />
              {affected.length > 0 && <em>{affected.length}</em>}
            </span>
          </div>
        </header>

        <section className="cb-hero">
          <div className="cb-hero-main">
            <div className="cb-hero-h">
              <div>
                <span className="cb-kicker">
                  {view.disasterActive ? 'Live incident · estimated impact' : 'No active incident'} <span className="cb-tag">{ranked.length} buildings</span>
                </span>
                <h1>Top Buildings at Risk</h1>
              </div>
              <div className="cb-filters" role="tablist" aria-label="Revenue horizon">
                {HORIZONS.map((x) => (
                  <button key={x.h} role="tab" aria-selected={horizon === x.h} className={horizon === x.h ? 'on' : ''} onClick={() => setHorizon(x.h)}>
                    <Icon name="chevronDown" size={12} /> {x.label}
                  </button>
                ))}
                <span className="cb-fixed">
                  <Icon name="chevronDown" size={12} /> By exposure
                </span>
              </div>
            </div>
            <div className="cb-cards">
              {ranked.slice(0, 3).map((x) => (
                <AssetCard key={x.prop.buildingId} x={x} horizon={horizon} hist={hist.current.get(x.prop.buildingId) ?? []} on={cur === x} onClick={() => setSel(x.prop.buildingId)} />
              ))}
            </div>
          </div>
          <aside className="cb-promo">
            <div className="cb-promo-h">
              <span className="cb-brand-s">
                <Icon name="home" size={16} /> Headcount
              </span>
              <span className="cb-new">{view.disasterActive ? 'Live' : 'Standby'}</span>
            </div>
            <h2>Portfolio Exposure</h2>
            <p>Revenue at risk over the next {HORIZONS.find((x) => x.h === horizon)?.label} plus expected repair cost, from the same sensor events the dispatchers see.</p>
            <div className="cb-promo-big">
              {fmtUsd(totalRisk + totalRepair)}
              <small>
                {fmtUsd(totalRisk)} revenue · {fmtUsd(totalRepair)} repairs
              </small>
            </div>
            <a className="cb-btn light" href="/?view=graph">
              Open dispatch console <Icon name="globe" size={16} />
            </a>
            <a className="cb-btn ghost" href="#buildings">
              Compare buildings <Icon name="chart" size={16} />
            </a>
          </aside>
        </section>

        <section className="cb-panel" id="detail">
          <div className="cb-panel-h">
            <span>Selected building</span>
            <span className="cb-icons">
              <Icon name="activity" size={17} />
              <Icon name="layers" size={17} />
            </span>
          </div>
          <div className="cb-detail">
            <div className="cb-detail-l">
              <span className="cb-upd">
                Last update · {snapshot.timeline.length ? agoText(Math.max(...snapshot.timeline.map((t) => t.atMicros)), now) : 'no events'} <Icon name="clock" size={14} />
              </span>
              <h3>
                {cur.name}
                <span className={`cb-ico lg ${cur.kind}`}>{cur.name[0]}</span>
                <a className="cb-out" href={`/?view=tree&b=${cur.prop.buildingId}`}>
                  View in dispatch <Icon name="chevronRight" size={13} />
                </a>
              </h3>
              <span className="cb-sub">Revenue at risk, next {HORIZONS.find((x) => x.h === horizon)?.label}</span>
              <div className="cb-giant">
                {Math.round(cur.revenueAtRisk(horizon)).toLocaleString('en-US')}
                <small>USD</small>
              </div>
            </div>
            <div className="cb-period">
              <div className="cb-period-h">
                <span>
                  <b>Predicted downtime</b>
                  <small>Hours until full service</small>
                </span>
                <span className="cb-tag">{Math.round(cur.downtimeH)} h</span>
              </div>
              <Slider value={cur.downtimeH} horizon={horizon} onHorizon={setHorizon} />
            </div>
          </div>
          <div className="cb-tabs" role="tablist">
            {(
              [
                ['systems', 'Systems', 'Failure odds'],
                ['tenants', 'Tenants', 'Who is affected'],
                ['action', 'Action', 'Recommended next step'],
                ['exposure', 'Exposure', 'Dollars and context'],
              ] as [Tab, string, string][]
            ).map(([id, t, s]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                <span>
                  <b>{t}</b>
                  <small>{s}</small>
                </span>
                <Icon name="chevronDown" size={14} />
              </button>
            ))}
          </div>
          <div className="cb-tab-body">
            {tab === 'systems' && (
              <ul className="cb-sys">
                {cur.systems.map((s) => (
                  <li key={s.id}>
                    <span>{s.label}</span>
                    <span className="cb-bar">
                      <i style={{ width: `${Math.round(s.p * 100)}%`, background: s.p > 0.5 ? 'var(--cb-red)' : s.p > 0.2 ? 'var(--cb-amber)' : 'var(--cb-lav)' }} />
                    </span>
                    <b>{Math.round(s.p * 100)}%</b>
                    <small>{fmtUsd(s.cost)} expected</small>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'tenants' && (
              <p className="cb-text">
                {cur.prop.tenants}. {cur.unitsAffected} of {cur.prop.units} units likely affected. Occupancy {Math.round(cur.prop.occupancy * 100)}%.
                {cur.kind === 'multifamily' ? ' Resident safety is handled in the dispatch console; this view only covers the building.' : ''}
              </p>
            )}
            {tab === 'action' && <p className="cb-text strong">{cur.action}</p>}
            {tab === 'exposure' && (
              <p className="cb-text">
                Asset value {fmtUsd(cur.prop.value)} · monthly revenue {fmtUsd(cur.prop.monthlyRevenue)} · last inspection {cur.prop.lastInspection}. Shaking at the building {Math.round(cur.shaking * 100)}%, power{' '}
                {cur.powerInferred ? 'inferred from nearby nodes' : 'from its own nodes'}: {Math.round(cur.powerOut * 100)}% on battery{cur.fire ? ', fire confirmed' : ''}.
              </p>
            )}
          </div>
          <div className="cb-stats">
            <Stat label="Failure probability" value={`${(cur.failP * 100).toFixed(1)}`} unit="%" tag="Now" />
            <Stat label="Repair cost" value={fmtUsd(cur.repairCost)} tag="Expected" />
            <Stat label="Units affected" value={String(cur.unitsAffected)} unit={`/ ${cur.prop.units}`} tag="Est." />
            <div className="cb-stat">
              <span>Signals</span>
              <div className="cb-sig">
                <span>
                  <i style={{ left: `${cur.shaking * 100}%` }} /> {Math.round(cur.shaking * 100)}% <small>shaking</small>
                </span>
                <span>
                  <i style={{ left: `${cur.powerOut * 100}%` }} /> {Math.round(cur.powerOut * 100)}% <small>on battery</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        <FinancePanel all={all} cur={cur} horizon={horizon} label={HORIZONS.find((x) => x.h === horizon)?.label ?? `${horizon}H`} onSelect={setSel} />

        <section className="cb-panel" id="buildings">
          <div className="cb-panel-h">
            <span>All buildings</span>
          </div>
          <table className="cb-tbl">
            <thead>
              <tr>
                <th>Building</th>
                <th>Failure odds</th>
                <th>Downtime</th>
                <th>Revenue at risk</th>
                <th>Repairs</th>
                <th>Recovery</th>
                <th>Retained</th>
                <th>NOI hit</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((x) => (
                <tr key={x.prop.buildingId} className={cur === x ? 'on' : ''} onClick={() => setSel(x.prop.buildingId)}>
                  <td>
                    <b>{x.name}</b>
                    <small>{x.kind}</small>
                  </td>
                  <td className="mono">{(x.failP * 100).toFixed(0)}%</td>
                  <td className="mono">{Math.round(x.downtimeH)} h</td>
                  <td className="mono">{fmtUsd(x.revenueAtRisk(horizon))}</td>
                  <td className="mono">{fmtUsd(x.repairCost)}</td>
                  <td className="mono good">{fmtUsd(financeOf(x, horizon).propClaim + financeOf(x, horizon).rentClaim)}</td>
                  <td className="mono bad">{fmtUsd(financeOf(x, horizon).retained)}</td>
                  <td className="mono">{(financeOf(x, horizon).noiHit * 100).toFixed(1)}%</td>
                  <td className="cb-next">{x.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cb-fine">Estimates from a simple synthetic model (see README, “CBRE view”). Not a forecast for any real property.</p>
        </section>
      </main>
    </div>
  );
}

function AssetCard({ x, horizon, hist, on, onClick }: { x: BuildingImpact; horizon: number; hist: number[]; on: boolean; onClick(): void }) {
  const first = hist[0] ?? 0;
  const last = x.revenueAtRisk(horizon) + x.repairCost;
  const delta = last - first;
  const up = delta > 0;
  const pts = hist.length > 1 ? hist : [last, last];
  const max = Math.max(1, ...pts);
  const W = 260;
  const Hh = 80;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, Hh - 8 - (v / max) * (Hh - 24)] as const);
  let d = `M${xy[0]![0]} ${xy[0]![1]}`;
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1]!;
    const [x1, y1] = xy[i]!;
    d += ` C${x0 + (x1 - x0) / 2} ${y0} ${x0 + (x1 - x0) / 2} ${y1} ${x1} ${y1}`;
  }
  const end = xy[xy.length - 1]!;
  const icon: IconName = x.fire ? 'flame' : x.powerOut > 0.3 ? 'zap' : x.shaking > 0.3 ? 'quake' : 'home';
  return (
    <button className={`cb-card${on ? ' on' : ''}`} onClick={onClick}>
      <div className="cb-card-h">
        <span className={`cb-ico ${x.kind}`}>
          <Icon name={icon} size={18} />
        </span>
        <span>
          <small>{x.kind === 'multifamily' ? 'Multifamily' : x.kind === 'office' ? 'Office' : 'Warehouse'}</small>
          <b>{x.name.replace(/ \(.*\)$/, '')}</b>
        </span>
        <span className="cb-arrow">
          <Icon name="arrowUpRight" size={15} />
        </span>
      </div>
      <small className="cb-lbl">Failure probability</small>
      <div className="cb-num">
        {(x.failP * 100).toFixed(2)}
        <span>%</span>
      </div>
      <span className={`cb-delta ${up ? 'bad' : 'good'}`}>
        <i>{up ? '▲' : '▼'}</i> {fmtUsd(Math.abs(delta))} since start
      </span>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="cb-spark" preserveAspectRatio="none" aria-hidden="true">
        <line x1={0} x2={W} y1={Hh - 20} y2={Hh - 20} className="cb-dash" />
        <path d={d} fill="none" stroke={up ? 'var(--cb-red)' : 'var(--cb-lav)'} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={end[0] - 2} cy={end[1]} r={4} fill="#0d0d12" stroke={up ? 'var(--cb-red)' : 'var(--cb-lav)'} strokeWidth={2} />
      </svg>
      <span className="cb-spark-v">
        {up ? '+' : '−'}
        {fmtUsd(Math.abs(delta))}
      </span>
    </button>
  );
}

function Stat({ label, value, unit, tag }: { label: string; value: string; unit?: string; tag: string }) {
  return (
    <div className="cb-stat">
      <span>
        {label} <em>{tag}</em>
      </span>
      <b>
        {value}
        {unit && <small>{unit}</small>}
      </b>
    </div>
  );
}

function Slider({ value, horizon, onHorizon }: { value: number; horizon: number; onHorizon(h: number): void }) {
  const max = 240;
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="cb-slider">
      <span className="cb-bubble" style={{ left: `${pct}%` }}>
        {Math.round(value)} h
      </span>
      <div className="cb-ticks">
        {Array.from({ length: 41 }, (_, i) => (
          <i key={i} className={i % 5 === 0 ? 'tall' : ''} />
        ))}
      </div>
      <span className="cb-knob" style={{ left: `${pct}%` }}>
        <i />
        <i />
      </span>
      <input type="range" min={24} max={168} step={24} value={horizon} onChange={(e) => onHorizon(Number(e.target.value))} aria-label="Revenue horizon in hours" />
      <div className="cb-scale">
        <span>0 h</span>
        <span>Horizon {horizon} h</span>
        <span>{max} h</span>
      </div>
    </div>
  );
}
