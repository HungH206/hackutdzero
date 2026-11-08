import { useId } from 'react';

export const BAND_COLOR: Record<string, string> = {
  low: 'var(--low)',
  guarded: 'var(--guarded)',
  high: 'var(--high)',
  critical: 'var(--critical)',
  unknown: 'var(--unknown)',
};

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

/** Speedometer-style arc for an HPI value the server already computed. */
export function ArcGauge({ value, band, label }: { value: number; band: string; label: string }) {
  const id = useId();
  const v = Math.max(0, Math.min(100, value));
  const end = -120 + (240 * v) / 100;
  const [nx, ny] = polar(80, 80, 50, end);
  return (
    <svg viewBox="0 0 160 128" className="gauge" role="img" aria-label={`${label} ${v.toFixed(1)}`}>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--low)" />
          <stop offset="40%" stopColor="var(--guarded)" />
          <stop offset="70%" stopColor="var(--high)" />
          <stop offset="100%" stopColor="var(--critical)" />
        </linearGradient>
      </defs>
      <path d={arc(80, 80, 62, -120, 120)} stroke="var(--line)" strokeWidth={8} fill="none" strokeLinecap="round" />
      <path d={arc(80, 80, 62, -120, Math.max(-119.5, end))} stroke={`url(#${id})`} strokeWidth={8} fill="none" strokeLinecap="round" />
      {Array.from({ length: 11 }, (_, i) => {
        const d = -120 + i * 24;
        const [x1, y1] = polar(80, 80, 50, d);
        const [x2, y2] = polar(80, 80, i % 5 === 0 ? 42 : 46, d);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--faint)" strokeWidth={1.2} />;
      })}
      <line x1={80} y1={80} x2={nx} y2={ny} stroke={BAND_COLOR[band]} strokeWidth={2.5} strokeLinecap="round" className="needle" />
      <circle cx={80} cy={80} r={4} fill={BAND_COLOR[band]} />
      <text x={80} y={112} textAnchor="middle" className="gauge-num" fill="var(--text)">
        {v.toFixed(1)}
      </text>
      <text x={80} y={126} textAnchor="middle" className="gauge-lbl" fill="var(--muted)">
        {label}
      </text>
    </svg>
  );
}

/** Round "tank" showing the share of backup power left. */
export function TankGauge({ fraction, minutes, label }: { fraction: number; minutes: number; label: string }) {
  const id = useId();
  const f = Math.max(0, Math.min(1, fraction));
  const level = 100 - f * 76 - 12;
  const color = f < 0.25 ? 'var(--critical)' : f < 0.5 ? 'var(--high)' : 'var(--guarded)';
  return (
    <svg viewBox="0 0 120 120" className="gauge" role="img" aria-label={`${label}: ${Math.round(minutes)} minutes`}>
      <defs>
        <clipPath id={id}>
          <circle cx={60} cy={56} r={40} />
        </clipPath>
      </defs>
      <circle cx={60} cy={56} r={46} fill="none" stroke="var(--line)" strokeDasharray="2 4" />
      <circle cx={60} cy={56} r={40} fill="var(--panel-2)" />
      <g clipPath={`url(#${id})`}>
        <path className="wave" d={`M-40 ${level} q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V130 H-40z`} fill={color} opacity={0.85} />
      </g>
      <text x={60} y={54} textAnchor="middle" className="gauge-num sm" fill="var(--text)">
        {Math.round(minutes)}
      </text>
      <text x={60} y={68} textAnchor="middle" className="gauge-lbl" fill="var(--text)">
        min left
      </text>
      <text x={60} y={116} textAnchor="middle" className="gauge-lbl" fill="var(--muted)">
        {label}
      </text>
    </svg>
  );
}

export function Ring({ value, max = 1, color, size = 34, children }: { value: number; max?: number; color: string; size?: number; children?: React.ReactNode }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, value / max));
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden="true">
        <circle cx={18} cy={18} r={r} fill="none" stroke="var(--line)" strokeWidth={3} />
        <circle
          cx={18}
          cy={18}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={`${c * f} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <span className="ring-txt">{children}</span>
    </span>
  );
}

/** Step-area chart, e.g. the found curve. */
export function AreaChart({
  points,
  max,
  height = 120,
  color = 'var(--accent)',
  label,
}: {
  points: { x: number; y: number }[];
  max: number;
  height?: number;
  color?: string;
  label: string;
}) {
  const id = useId();
  const W = 400;
  if (points.length < 2) {
    return (
      <div className="chart-empty" style={{ height }}>
        Starts when an event is confirmed
      </div>
    );
  }
  const x0 = points[0]!.x;
  const x1 = points[points.length - 1]!.x || x0 + 1;
  const sx = (x: number) => ((x - x0) / Math.max(1, x1 - x0)) * W;
  const sy = (y: number) => height - 6 - (y / Math.max(1, max)) * (height - 16);
  let d = `M0 ${sy(points[0]!.y)}`;
  for (let i = 1; i < points.length; i++) d += ` H${sx(points[i]!.x)} V${sy(points[i]!.y)}`;
  const last = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="area" role="img" aria-label={label} style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.08} />
          <stop offset="100%" stopColor={color} stopOpacity={0.08} />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={sy(max)} y2={sy(max)} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
      <path d={`${d} V${height} H0z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={sx(last.x)} cy={sy(last.y)} r={3.5} fill={color} />
    </svg>
  );
}
