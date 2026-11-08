import { bandCounts, fmtMin, foundCurve, ladderFunnel, median, timesToFound, type View } from '../data/derive';
import type { Snapshot } from '../data/types';
import { AreaChart, BAND_COLOR, Ring } from './Gauges';
import { Icon } from './Icon';

// Counts, times and roll-ups of server data. No scoring happens here.
export function Analytics({ view, snapshot, now, onSelect }: { view: View; snapshot: Snapshot; now: number; onSelect(id: number): void }) {
  const curve = foundCurve(snapshot, now);
  const c = view.counts;
  const funnel = ladderFunnel(view);
  const bands = bandCounts(view);
  const ttf = timesToFound(snapshot);
  const med = median(ttf);
  const p90 = ttf.length ? [...ttf].sort((a, b) => a - b)[Math.min(ttf.length - 1, Math.floor(ttf.length * 0.9))]! : null;
  const sensored = view.households.filter((h) => h.hasSensor);
  const isAcc = (h: (typeof sensored)[number]) => h.finalState !== 'unresolved';
  const high = sensored.filter((h) => (view.prio.get(h.id)?.V ?? 0) >= 0.4);
  const rest = sensored.filter((h) => (view.prio.get(h.id)?.V ?? 0) < 0.4);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const clocks = view.households
    .filter((h) => (view.prio.get(h.id)?.tthMin ?? -1) >= 0 && h.finalState !== 'assisted')
    .sort((a, b) => view.prio.get(a.id)!.tthMin - view.prio.get(b.id)!.tthMin);
  const totalBand = Math.max(1, bands.critical + bands.high + bands.guarded + bands.low);
  const hist = Array.from({ length: 8 }, (_, i) => ttf.filter((t) => t >= i * 5 && (i === 7 || t < (i + 1) * 5)).length);
  const histMax = Math.max(1, ...hist);

  const buildings = [...view.building.values()]
    .map((b) => {
      const hs = view.households.filter((h) => h.buildingId === b.id);
      const worst = hs.reduce((m, h) => Math.max(m, view.prio.get(h.id)?.rank ? view.prio.get(h.id)!.hpi : 0), 0);
      const fire = hs.some((h) => view.node.get(h.id)?.flame);
      return { b, units: hs.length, acc: hs.filter((h) => h.finalState !== 'unresolved').length, open: hs.filter((h) => view.prio.get(h.id)?.rank).length, worst, fire };
    })
    .filter((r) => r.units > 0)
    .sort((a, b) => b.worst - a.worst);

  return (
    <div className="analytics">
      <div className="an-head">
        <div>
          <div className="eyebrow">Incident analytics</div>
          <h1>Is everyone being found?</h1>
        </div>
        <span className="chip">{view.disasterActive ? 'Live incident' : 'No active incident'} · synthetic data</span>
      </div>

      <div className="bento">
        <section className="card hero-card span-2">
          <div className="card-top">
            <div>
              <div className="eyebrow">Found curve</div>
              <div className="big">
                {c.accounted}
                <small> of {c.total} accounted for</small>
              </div>
            </div>
            <div className="legend-inline">
              <span>
                <i style={{ background: 'var(--accent)' }} /> Accounted over time
              </span>
              <span>
                <i className="dash" /> Everyone ({c.total})
              </span>
            </div>
          </div>
          <AreaChart points={curve.map((p) => ({ x: p.t, y: p.accounted }))} max={c.total} height={170} label="Households accounted for over time" />
          <p className="fine">
            Planned comparison: the same scenario under first-come-first-served. Not measured yet, so not shown.
          </p>
        </section>

        <section className="card">
          <div className="eyebrow">Time to found</div>
          <div className="big">
            {med === null ? '—' : fmtMin(med).replace(' min', '')}
            <small> min median</small>
          </div>
          <div className="hist" role="img" aria-label="Distribution of minutes to found">
            {hist.map((v, i) => (
              <div key={i} title={`${i * 5}-${i === 7 ? '∞' : (i + 1) * 5} min: ${v}`}>
                <i style={{ height: `${(v / histMax) * 100}%` }} />
                <span>{i === 7 ? '35+' : i * 5}</span>
              </div>
            ))}
          </div>
          <p className="fine">90th percentile: {fmtMin(p90)}</p>
        </section>

        <section className="card">
          <div className="eyebrow">Escalation ladder</div>
          <div className="funnel">
            {['Check-in sent', 'Emergency contact', 'Neighbor knock', 'Responder dispatch'].map((l, i) => (
              <div key={l} className="fn-row">
                <span>{l}</span>
                <div className="fn-bar">
                  <i style={{ width: `${(funnel[i + 1]! / Math.max(1, funnel[1]!)) * 100}%`, opacity: 1 - i * 0.16 }} />
                </div>
                <b className="mono">{funnel[i + 1]}</b>
              </div>
            ))}
          </div>
          <p className="fine">Cheapest step first. Responders only get who the earlier steps could not reach.</p>
        </section>

        <section className="card">
          <div className="eyebrow">Equity check</div>
          <div className="equity">
            <div>
              <Ring value={pct(high.filter(isAcc).length, high.length)} max={100} color="var(--accent)" size={92}>
                <b>{pct(high.filter(isAcc).length, high.length)}%</b>
              </Ring>
              <span>High-need (V ≥ 0.4)</span>
              <small>
                {high.filter(isAcc).length}/{high.length}
              </small>
            </div>
            <div>
              <Ring value={pct(rest.filter(isAcc).length, rest.length)} max={100} color="var(--ok)" size={92}>
                <b>{pct(rest.filter(isAcc).length, rest.length)}%</b>
              </Ring>
              <span>Everyone else</span>
              <small>
                {rest.filter(isAcc).length}/{rest.length}
              </small>
            </div>
          </div>
          <p className="fine">Ranked by need, never by worth. {c.unknown} homes have no sensor and count as unknown.</p>
        </section>

        <section className="card">
          <div className="eyebrow">Queue by band</div>
          <div className="stack-bar">
            {(['critical', 'high', 'guarded', 'low'] as const).map((b) => (
              <i key={b} style={{ flexGrow: bands[b], background: BAND_COLOR[b] }} />
            ))}
          </div>
          <div className="band-grid">
            {(['critical', 'high', 'guarded', 'low'] as const).map((b) => (
              <div key={b}>
                <span className="swatch" style={{ background: BAND_COLOR[b] }} />
                <span>{b}</span>
                <b className="mono">{bands[b]}</b>
                <small>{Math.round((bands[b] / totalBand) * 100)}%</small>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="eyebrow">Power-loss clocks</div>
          {clocks.length === 0 ? (
            <p className="fine">No powered medical device is on battery.</p>
          ) : (
            <ul className="clock-list">
              {clocks.map((h) => {
                const p = view.prio.get(h.id)!;
                const f = p.tthMin / Math.max(1, h.backupRuntimeMin);
                return (
                  <li key={h.id}>
                    <button onClick={() => onSelect(h.id)}>
                      <span>
                        <b>{h.name}</b>
                        <small>{h.medicalDevice}</small>
                      </span>
                      <span className="cl-bar">
                        <i style={{ width: `${f * 100}%`, background: f < 0.25 ? 'var(--critical)' : f < 0.5 ? 'var(--high)' : 'var(--guarded)' }} />
                      </span>
                      <b className="mono">{Math.round(p.tthMin)}m</b>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card span-2">
          <div className="card-top">
            <div className="eyebrow">Buildings · roll-up for property operations</div>
            <span className="chip">
              <Icon name="home" size={12} /> {buildings.length} buildings
            </span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Building</th>
                <th>Units</th>
                <th>Accounted</th>
                <th>Open</th>
                <th>Worst HPI</th>
                <th>Hazard</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((r) => (
                <tr key={r.b.id}>
                  <td>
                    <b>{r.b.name}</b>
                    <small>
                      {' '}
                      · {r.b.builtYear}, {r.b.floors} fl
                    </small>
                  </td>
                  <td className="mono">{r.units}</td>
                  <td>
                    <span className="mini-bar">
                      <i style={{ width: `${pct(r.acc, r.units)}%` }} />
                    </span>
                    <span className="mono">
                      {r.acc}/{r.units}
                    </span>
                  </td>
                  <td className="mono">{r.open}</td>
                  <td className="mono" style={{ color: r.worst >= 75 ? 'var(--critical)' : r.worst >= 50 ? 'var(--high)' : undefined }}>
                    {r.worst ? r.worst.toFixed(0) : '—'}
                  </td>
                  <td>{r.fire ? <span className="chip crit">Fire</span> : <span className="fine">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
