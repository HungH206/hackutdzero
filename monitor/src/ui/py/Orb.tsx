// Orbs are rendered artwork: glossy resin spheres in a machined metal bezel,
// lit by a studio softbox (see scripts/render-orbs.mjs). PNGs in
// src/assets/orbs replace the SVG fallback automatically; drop in your own
// renders with the same names to restyle them (see the README there).

export type OrbKind = 'sun' | 'rose' | 'violet' | 'mint' | 'sky' | 'amber' | 'ember' | 'slate' | 'focus';

const PNG = import.meta.glob<string>('../../assets/orbs/*.png', { eager: true, query: '?url', import: 'default' });
const png = (name: string) => PNG[`../../assets/orbs/${name}.png`];

/** Fraction of the PNG's half-width taken by the sphere. Keeps layout radii unchanged. */
const SPHERE = 0.62;

// [highlight, body, shadow, bloom]: used by the SVG fallback and for UI accents.
export const ORB_TONE: Record<OrbKind, [string, string, string, string]> = {
  sun: ['#fff1cf', '#c58a32', '#2e1803', '#f2b85c'],
  rose: ['#ffe0e9', '#c64f72', '#2e0614', '#ff8fae'],
  violet: ['#ece5ff', '#7158d0', '#140a3a', '#a48bff'],
  mint: ['#dcfff0', '#2f9e76', '#032016', '#5fe0b0'],
  sky: ['#e3f1ff', '#3f7fcc', '#061a36', '#7cc0ff'],
  amber: ['#fff0cf', '#d08a26', '#331a02', '#ffc861'],
  ember: ['#ffdfe4', '#d42f4b', '#33030c', '#ff5d74'],
  slate: ['#e2e8ea', '#6d7a80', '#111619', '#8fa0a6'],
  focus: ['#efe8ff', '#7a62d6', '#160b3c', '#b8a2ff'],
};

/** Shared gradients for the SVG fallback. Render once inside an SVG's <defs>. */
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
              <stop offset="0%" stopColor={bloom} stopOpacity="0.5" />
              <stop offset="40%" stopColor={bloom} stopOpacity="0.12" />
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
    </>
  );
}

interface OrbProps {
  kind: OrbKind;
  x: number;
  y: number;
  r: number;
  bezel?: boolean;
  /** Extra light around the orb, as a multiple of r. Only drawn for "hot" orbs (>= 3). */
  bloom?: number;
}

export function Orb({ kind, x, y, r, bezel = true, bloom = 0 }: OrbProps) {
  const src = (!bezel && png(`${kind}-bare`)) || png(kind);
  const half = r / SPHERE;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {bloom >= 3 && <circle r={r * bloom} fill={`url(#orb-bloom-${kind})`} opacity={0.7} />}
      {src ? (
        <image href={src} x={-half} y={-half} width={half * 2} height={half * 2} />
      ) : (
        <>
          {bezel && <circle r={r * 1.22} fill="#0c1314" stroke="url(#orb-bezel)" strokeWidth={Math.max(1, r * 0.09)} />}
          <circle r={r} fill={`url(#orb-body-${kind})`} />
        </>
      )}
    </g>
  );
}

/** The neighborhood hub: a gold orb that is also the light source for the beams. */
export function Sun({ x, y, r }: { x: number; y: number; r: number }) {
  const src = png('sun');
  const corona = png('sun-corona');
  const half = r / SPHERE;
  // Both PNGs share the same frame geometry (the corona just has more pixels).
  const ch = half;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r * 5} fill="url(#hub-light)" />
      {corona && (
        <g className="py-corona">
          <image href={corona} x={-ch} y={-ch} width={ch * 2} height={ch * 2} />
        </g>
      )}
      {src ? <image href={src} x={-half} y={-half} width={half * 2} height={half * 2} /> : <Orb kind="sun" x={0} y={0} r={r} />}
    </g>
  );
}

/** The selected orb in the building view: a large orb inside a slow waveform ring. */
export function FocusOrb({ x, y, r, seed = 1, tone = 'focus' as OrbKind }: { x: number; y: number; r: number; seed?: number; tone?: OrbKind }) {
  const ring = (radius: number, amp: number, n: number, s: number) => {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      // smooth noise: a few low-frequency sines, plus fine ripple, so it reads as a signal
      const low = Math.sin(a * 3 + seed * 1.7) * 0.5 + Math.sin(a * 7 + s * 4.1) * 0.3 + Math.sin(a * 13 + seed) * 0.2;
      const fine = Math.sin(i * 12.9898 * s + seed * 78.233) * 43758.5453;
      const k = amp * (0.55 * Math.abs(low) + 0.45 * (fine - Math.floor(fine)));
      const rr = radius + (i % 2 ? k : -k * 0.35);
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`;
    }
    return d + 'Z';
  };
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r * 3.4} className="py-focus-well" />
      <path d={ring(r * 2.1, r * 0.3, 260, 1.3)} className="py-wave slow" />
      <path d={ring(r * 1.62, r * 0.32, 200, 2.1)} className="py-wave" />
      <Orb kind={tone} x={0} y={0} r={r} />
    </g>
  );
}
