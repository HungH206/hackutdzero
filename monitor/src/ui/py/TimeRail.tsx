import type { Snapshot } from '../../data/types';

// Left time axis from the reference (years there, scenario minutes here),
// with a waveform of event activity along the edge.
export function TimeRail({ snapshot, now }: { snapshot: Snapshot; now: number }) {
  const starts = snapshot.disasters.filter((d) => d.active).map((d) => d.confirmedAtMicros);
  const t0 = starts.length ? Math.min(...starts) : null;
  const minNow = t0 === null ? 0 : (now - t0) / 6e7;
  const span = Math.max(30, Math.ceil((minNow + 6) / 5) * 5);
  const ticks = Array.from({ length: span / 5 + 1 }, (_, i) => i * 5);
  const H = 640;
  const yOf = (m: number) => 20 + (m / span) * (H - 40);

  // activity waveform: events per 30 s bin
  const bins = new Array(Math.ceil(span * 2)).fill(0) as number[];
  if (t0 !== null) for (const r of snapshot.timeline) {
    const m = (r.atMicros - t0) / 6e7;
    if (m >= 0 && m < span) bins[Math.floor(m * 2)]! += r.severity === 'critical' ? 3 : 1;
  }
  const max = Math.max(1, ...bins);
  let wave = '';
  for (let i = 0; i <= 200; i++) {
    const m = (i / 200) * span;
    const v = bins[Math.min(bins.length - 1, Math.floor(m * 2))]! / max;
    const jitter = Math.sin(i * 2.7) * 1.6 + Math.sin(i * 7.3) * 1.1;
    wave += `${i ? 'L' : 'M'}${(4 + v * 26 + Math.abs(jitter) + 2).toFixed(1)} ${yOf(m).toFixed(1)}`;
  }

  return (
    <aside className="py-rail" aria-label="Scenario timeline">
      <svg viewBox={`0 0 120 ${H}`} preserveAspectRatio="xMinYMid meet">
        <path d={wave} fill="none" stroke="#7d9a96" strokeOpacity={0.55} strokeWidth={1} />
        <path d={`${wave} L0 ${yOf(span)} L0 ${yOf(0)}Z`} fill="#7d9a96" fillOpacity={0.07} />
        {t0 === null ? (
          <text x={64} y={H / 2} className="py-rail-idle" textAnchor="middle">
            Standing by
          </text>
        ) : (
          <>
            {ticks.map((m) => (
              <text key={m} x={70} y={yOf(m) + 4} className="py-rail-t" textAnchor="middle" opacity={Math.abs(m - minNow) < 2.5 ? 0 : 1}>
                {m === 0 ? 'Event' : `+${m}m`}
              </text>
            ))}
            <line x1={0} x2={30} y1={yOf(minNow)} y2={yOf(minNow)} stroke="#e2bf7b" strokeOpacity={0.6} />
            <g transform={`translate(70 ${yOf(minNow)})`}>
              <rect x={-38} y={-17} width={76} height={34} rx={17} className="py-rail-now" />
              <text y={6.5} textAnchor="middle" className="py-rail-now-t">
                +{minNow.toFixed(minNow < 10 ? 1 : 0)}m
              </text>
            </g>
          </>
        )}
      </svg>
    </aside>
  );
}
