import type { View } from '../data/derive';

// Counts only. V comes from the priority table; nothing is scored here.
export function Coverage({ view, onSelect }: { view: View; onSelect(id: number): void }) {
  const all = view.households;
  const sensored = all.filter((h) => h.hasSensor);
  const accounted = (h: (typeof all)[number]) => h.finalState !== 'unresolved';
  const highNeed = sensored.filter((h) => (view.prio.get(h.id)?.V ?? 0) >= 0.4);
  const others = sensored.filter((h) => (view.prio.get(h.id)?.V ?? 0) < 0.4);
  const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

  const fires = all.filter((h) => {
    const n = view.node.get(h.id);
    return n && (n.flame || n.tempRiseC >= 10);
  });
  const clocks = all
    .filter((h) => (view.prio.get(h.id)?.tthMin ?? -1) >= 0 && h.finalState !== 'assisted')
    .sort((a, b) => view.prio.get(a.id)!.tthMin - view.prio.get(b.id)!.tthMin);

  const rows = [
    { label: 'Sensor coverage', a: sensored.length, b: all.length, color: 'var(--accent)', note: `${all.length - sensored.length} homes unknown` },
    { label: 'High-need homes accounted (V ≥ 0.4)', a: highNeed.filter(accounted).length, b: highNeed.length, color: 'var(--ok)' },
    { label: 'Everyone else accounted', a: others.filter(accounted).length, b: others.length, color: 'var(--ok)' },
  ];

  return (
    <>
      <div className="panel-head">
        <h2>Coverage & alerts</h2>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        <div className="meter">
          {rows.map((r) => (
            <div className="meter-row" key={r.label}>
              <span>{r.label}</span>
              <b>
                {r.a}/{r.b} · {pct(r.a, r.b)}%
              </b>
              <div className="track">
                <div style={{ width: `${pct(r.a, r.b)}%`, background: r.color }} />
              </div>
              {r.note && <span style={{ color: 'var(--faint)', fontSize: 11 }}>{r.note}</span>}
            </div>
          ))}
        </div>
        {fires.map((h) => {
          const n = view.node.get(h.id)!;
          return (
            <div key={`f${h.id}`} className="alert fire" onClick={() => onSelect(h.id)}>
              <span>🔥</span>
              <span>
                <b>
                  {n.flame ? 'Flame detected' : 'Temperature rising'} · {h.unit}, {view.building.get(h.buildingId)?.name}
                </b>
                {h.name} · temp +{n.tempRiseC.toFixed(0)}°C
              </span>
            </div>
          );
        })}
        {clocks.map((h) => {
          const p = view.prio.get(h.id)!;
          return (
            <div key={`p${h.id}`} className="alert power" onClick={() => onSelect(h.id)}>
              <span>⚡</span>
              <span>
                <b>
                  {Math.round(p.tthMin)} min of backup power left · {h.name}
                </b>
                {h.medicalDevice} · power-loss clock running
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
