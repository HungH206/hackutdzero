import { useMemo, useState } from 'react';
import type { View } from '../data/derive';
import { CEILING, DEFAULT_LIMIT, FIRE_TEMP_RISE_C, estimateDamage, money } from './damage';

// Overall damage estimate for the agent's book. Simulated: the assumptions are listed under the numbers.

export function DamagePanel({ view }: { view: View }) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const est = useMemo(() => estimateDamage(view, limit), [view, limit]);
  const share = est.exposure > 0 ? Math.round((est.likely / est.exposure) * 100) : 0;
  const pct = (n: number) => `${est.exposure > 0 ? Math.min(100, (n / est.exposure) * 100) : 0}%`;

  return (
    <section className="hc-panel ag-est" aria-label="Damage estimate">
      <div className="ag-est-head">
        <div>
          <div className="ag-kicker">Estimated damage · earthquake and fire</div>
          <div className="ag-est-big">
            {money(est.likely)} <span className="ag-sub">likely</span>
          </div>
          <div className="ag-sub">
            {est.active ? `Range ${money(est.low)} to ${money(est.high)}` : 'No active event, nothing lost yet'} · {share}% of {money(est.exposure)} insured ({est.households} × {money(est.limit)})
          </div>
        </div>
        <label className="ag-est-limit">
          <span className="ag-cap">Claim limit per household</span>
          <input type="number" min={0} step={25000} value={limit} onChange={(e) => setLimit(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </div>

      <div className="ag-est-bar" role="img" aria-label={`Likely loss is ${share}% of insured exposure, high case ${money(est.high)}`}>
        <span className="ag-est-fill ag-est-fill--high" style={{ width: pct(est.high) }} />
        <span className="ag-est-fill ag-est-fill--likely" style={{ width: pct(est.likely) }} />
      </div>

      <div className="ag-grid">
        <div className="hc-tile"><div className="ag-cap">Earthquake</div><div className="ag-mid">{money(est.quake)}</div><div className="ag-sub">{est.affected - est.fires} households shaken</div></div>
        <div className="hc-tile"><div className="ag-cap">Fire hazard</div><div className="ag-mid">{money(est.fire)}</div><div className="ag-sub">{est.fires} {est.fires === 1 ? 'unit' : 'units'} with fire signs</div></div>
        <div className="hc-tile"><div className="ag-cap">Affected</div><div className="ag-mid">{est.affected} of {est.households}</div><div className="ag-sub">households with a likely loss</div></div>
      </div>

      {est.byBuilding.length > 0 && (
        <ul className="ag-est-list" aria-label="Estimated loss by building">
          {est.byBuilding.slice(0, 4).map((b) => (
            <li key={b.buildingId}>
              <span className="ag-name">{b.name}</span>
              <span className="ag-sub">{b.affected} affected</span>
              <span className="ag-est-amt">{money(b.likely)}</span>
            </li>
          ))}
        </ul>
      )}

      <details className="ag-est-how">
        <summary>How this is estimated</summary>
        <p>
          Simulated estimate, not an actuarial model. Every household is assumed to carry the same claim limit ({money(limit)}). A household with a flame
          reading or a temperature rise of {FIRE_TEMP_RISE_C} °C or more is treated as a fire loss: {Math.round(CEILING.likely.fire * 100)}% of the limit
          likely ({Math.round(CEILING.low.fire * 100)}% low, {Math.round(CEILING.high.fire * 100)}% high). Every other household is an earthquake loss:
          its exposure score E (0 to 1, from shaking, building risk and neighbors) times {Math.round(CEILING.likely.quake * 100)}% of the limit likely
          ({Math.round(CEILING.low.quake * 100)}% low, {Math.round(CEILING.high.quake * 100)}% high). Households with no exposure count as no loss.
        </p>
      </details>
    </section>
  );
}
