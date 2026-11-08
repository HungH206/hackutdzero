import { useId } from 'react';

// Orbs drawn to match the reference: a glossy sphere sitting in a thin metal
// bezel, with a soft color bloom behind it. If a PNG with the same name exists
// in src/assets/orbs it is used instead (see the README there).

export type OrbKind = 'sun' | 'rose' | 'violet' | 'mint' | 'sky' | 'amber' | 'ember' | 'slate' | 'focus';

const PNG = import.meta.glob<string>('../../assets/orbs/*.png', { eager: true, query: '?url', import: 'default' });
const png = (k: OrbKind) => PNG[`../../assets/orbs/${k}.png`];

// [highlight, body, shadow, bloom]
export const ORB_TONE: Record<OrbKind, [string, string, string, string]> = {
  sun: ['#fff3d2', '#d9a55a', '#5e3e17', '#f0b860'],
  rose: ['#ffe6ec', '#e98aa2', '#6e2238', '#ff8fae'],
  violet: ['#f1ebff', '#a993ec', '#3b2a78', '#a48bff'],
  mint: ['#e4fff4', '#63c9a0', '#14523d', '#5fe0b0'],
  sky: ['#e8f4ff', '#79aee8', '#1c3f6e', '#7cc0ff'],
  amber: ['#fff4d6', '#eab35a', '#6a4512', '#ffc861'],
  ember: ['#ffe2e2', '#f0687a', '#6b1424', '#ff5d74'],
  slate: ['#e2e8ea', '#7c8a8f', '#262f33', '#8fa0a6'],
  focus: ['#f4efff', '#b29cf2', '#3d2b7c', '#b8a2ff'],
};

/** Shared gradients. Render once inside the graph's <defs>. */
export function OrbDefs() {
  return (
    <>
      {(Object.keys(ORB_TONE) as OrbKind[]).map((k) => {
        const [hi, body, shade, bloom] = ORB_TONE[k];
        return (
          <g key={k}>
            <radialGradient id={`orb-body-${k}`} cx="38%" cy="30%" r="78%" fx="34%" fy="26%">
              <stop offset="0%" stopColor={hi} />
              <stop offset="22%" stopColor={body} stopOpacity="0.98" />
              <stop offset="70%" stopColor={body} stopOpacity="0.92" />
              <stop offset="100%" stopColor={shade} />
            </radialGradient>
            <radialGradient id={`orb-bloom-${k}`}>
              <stop offset="0%" stopColor={bloom} stopOpacity="0.55" />
              <stop offset="45%" stopColor={bloom} stopOpacity="0.16" />
              <stop offset="100%" stopColor={bloom} stopOpacity="0" />
            </radialGradient>
          </g>
        );
      })}
      <linearGradient id="orb-bezel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f6f2ea" />
        <stop offset="35%" stopColor="#8d8a86" />
        <stop offset="60%" stopColor="#3a3a3c" />
        <stop offset="100%" stopColor="#d8d2c6" />
      </linearGradient>
      <radialGradient id="orb-rim" cx="62%" cy="72%" r="50%">
        <stop offset="70%" stopColor="#fff" stopOpacity="0" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0.35" />
      </radialGradient>
      <filter id="orb-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.8" />
      </filter>
    </>
  );
}

interface OrbProps {
  kind: OrbKind;
  x: number;
  y: number;
  r: number;
  bezel?: boolean;
  bloom?: number; // bloom radius as a multiple of r
}

export function Orb({ kind, x, y, r, bezel = true, bloom = 2.6 }: OrbProps) {
  const src = png(kind);
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r * bloom} fill={`url(#orb-bloom-${kind})`} />
      {src ? (
        <image href={src} x={-r * 1.25} y={-r * 1.25} width={r * 2.5} height={r * 2.5} />
      ) : (
        <>
          {bezel && (
            <>
              <circle r={r + r * 0.32} fill="#0c1314" stroke="url(#orb-bezel)" strokeWidth={Math.max(1, r * 0.09)} />
              <circle r={r + r * 0.14} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={Math.max(0.8, r * 0.08)} />
            </>
          )}
          <circle r={r} fill={`url(#orb-body-${kind})`} />
          <circle r={r} fill="url(#orb-rim)" />
          <ellipse cx={-r * 0.32} cy={-r * 0.42} rx={r * 0.36} ry={r * 0.2} fill="#fff" opacity={0.55} transform={`rotate(-28 ${-r * 0.32} ${-r * 0.42})`} filter="url(#orb-soft)" />
        </>
      )}
    </g>
  );
}

/** Gold hub with the fine radial "corona" from the reference. */
export function Sun({ x, y, r }: { x: number; y: number; r: number }) {
  const id = useId();
  const src = png('sun');
  const spikes = 120;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r * 4} fill="url(#orb-bloom-sun)" />
      {src ? (
        <image href={src} x={-r * 1.9} y={-r * 1.9} width={r * 3.8} height={r * 3.8} />
      ) : (
        <>
          <g className="py-corona">
            {Array.from({ length: spikes }, (_, i) => {
              const a = (i / spikes) * Math.PI * 2;
              const len = r * (0.18 + ((i * 37) % 11) / 22);
              const r0 = r * 1.22;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * r0}
                  y1={Math.sin(a) * r0}
                  x2={Math.cos(a) * (r0 + len)}
                  y2={Math.sin(a) * (r0 + len)}
                  stroke={i % 3 === 0 ? '#ffe2a8' : '#c99a54'}
                  strokeOpacity={0.55 + ((i * 13) % 5) / 12}
                  strokeWidth={0.7}
                />
              );
            })}
          </g>
          <circle r={r * 1.2} fill="none" stroke="#e9c98f" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="1 2.2" />
          <circle r={r * 1.1} fill="#1a1408" stroke="url(#orb-bezel)" strokeWidth={1.4} />
          <circle r={r} fill="url(#orb-body-sun)" />
          <radialGradient id={id} cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#3b2608" stopOpacity="0.6" />
          </radialGradient>
          <circle r={r} fill={`url(#${id})`} />
          <ellipse cx={-r * 0.3} cy={-r * 0.4} rx={r * 0.38} ry={r * 0.22} fill="#fff" opacity={0.45} transform={`rotate(-28 ${-r * 0.3} ${-r * 0.4})`} filter="url(#orb-soft)" />
        </>
      )}
    </g>
  );
}

/** The selected orb in the drill-down view: sphere inside a ragged waveform ring. */
export function FocusOrb({ x, y, r, seed = 1, tone = 'focus' as OrbKind }: { x: number; y: number; r: number; seed?: number; tone?: OrbKind }) {
  const src = png('focus');
  const ring = (radius: number, amp: number, n: number, s: number) => {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const noise = Math.sin(i * 12.9898 * s + seed * 78.233) * 43758.5453;
      const k = amp * (noise - Math.floor(noise));
      const rr = radius + (i % 2 ? k : -k * 0.4);
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`;
    }
    return d + 'Z';
  };
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r * 3.4} fill="#071010" opacity={0.6} />
      <circle r={r * 3.4} fill="none" stroke="#9fd6cf" strokeOpacity={0.08} />
      {src ? (
        <image href={src} x={-r * 2.3} y={-r * 2.3} width={r * 4.6} height={r * 4.6} />
      ) : (
        <>
          <path d={ring(r * 2.05, r * 0.32, 220, 1.3)} fill="none" stroke="#7c5fd0" strokeOpacity={0.75} strokeWidth={0.8} className="py-wave slow" />
          <path d={ring(r * 1.55, r * 0.34, 160, 2.1)} fill="none" stroke="#5fd0c4" strokeOpacity={0.8} strokeWidth={0.9} className="py-wave" />
          <circle r={r * 1.25} fill="#0a1112" />
          <Orb kind={tone} x={0} y={0} r={r} bezel={false} bloom={1.8} />
        </>
      )}
    </g>
  );
}
