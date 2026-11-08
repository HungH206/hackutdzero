// The one icon set for the whole monitor (theme/SYSTEM.md §5): a 24 grid, stroke
// 1.6, round caps and joins, with filled variants for selected states.
// No emoji, no icon fonts. Ink stays inside the 2-22 live area of the grid.
import { useId, type SVGProps } from 'react';

interface Glyph {
  /** The outline: every stroke of the glyph. This is what iconPath() returns. */
  d: string;
  /** Filled variant: closed shapes painted solid (even-odd, so a subpath can be a hole). */
  solid?: string;
  /** Filled variant: open strokes that stay strokes next to the solid. */
  line?: string;
  /** Filled variant: strokes knocked out of the solid, so the background shows through. */
  cut?: string;
}

/** Glyphs with no solid form (a plus, a chevron) draw their outline when filled. */
const lineOnly = (d: string): Glyph => ({ d });
/** A closed outline whose filled variant is simply that outline painted solid. */
const closed = (d: string): Glyph => ({ d, solid: d });
const square = (x: number, y: number) => `M${x + 1.5} ${y}h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z`;

const CIRCLE = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z';
const SHIELD = 'M12 21.4s7.5-3.6 7.5-9.4V5.6L12 2.8 4.5 5.6V12c0 5.8 7.5 9.4 7.5 9.4z';
const BANG = 'M12 7.6v5.2M12 16.4h.01';
const HOOK = 'M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 3.9M12 17h.01';
const HANDS = 'M12 7v5.2l3.4 2';
const TICK = 'M8.7 11.6l2.3 2.3 4.3-4.6';
const BELL = 'M6 9a6 6 0 1 1 12 0c0 6.5 2.6 8 2.6 8H3.4S6 15.5 6 9z';
const CLAPPER = 'M10.3 20.6a1.9 1.9 0 0 0 3.4 0';
const SHEET = 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z';
const FOLDS = 'M9 4v14M15 6v14';
const LAYER_TOP = 'M12 3 3 7.5l9 4.5 9-4.5L12 3z';
const LAYER_REST = 'M3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5';
const LOCATE_RING = 'M12 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z';
const LOCATE_TICKS = 'M12 2.8v2.7M12 18.5v2.7M2.8 12h2.7M18.5 12h2.7';
const TOWER = 'M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16z';
const WINDOWS = 'M9.75 7.5h.01M14.25 7.5h.01M9.75 11.5h.01M14.25 11.5h.01M9.75 15.5h.01M14.25 15.5h.01';
const HEAD = 'M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z';
const SHOULDERS = 'M5 20.5V19a4.5 4.5 0 0 1 4.5-4.5h5A4.5 4.5 0 0 1 19 19v1.5';
const STOPS = 'M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z';
const PATHWAY = 'M8 18.5h8.75a3.25 3.25 0 0 0 0-6.5h-9.5a3.25 3.25 0 0 1 0-6.5H16';
const LIST_ROWS = 'M8.5 6h12M8.5 12h12M8.5 18h12';
const TEARDROP = 'M12 21.5s-7-6.1-7-11.5a7 7 0 0 1 14 0c0 5.4-7 11.5-7 11.5z';
const BATTERY = 'M5 7.5h11a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 14v-4A2.5 2.5 0 0 1 5 7.5z';
const AXES = 'M3.5 3.5v15a2 2 0 0 0 2 2h15';

const house: Glyph = {
  d: 'M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-8.5zM9.5 20.5v-6h5v6',
  // The door is a notch in the silhouette, open at the ground line.
  solid: 'M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-3.7v-6.1H8.7v6.1H5A1.5 1.5 0 0 1 3.5 19v-8.5z',
};
const close = lineOnly('M18 6 6 18M6 6l12 12');
const chevronRight = lineOnly('m9 18 6-6-6-6');
const chevronDown = lineOnly('m6 9 6 6 6-6');
const fastForward = closed('M12.6 6.2v11.6L21 12l-8.4-5.8zM3 6.2v11.6L11.4 12 3 6.2z');
const wifiOff = lineOnly('M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M2.8 8.8a15 15 0 0 1 3.9-2.6M10.7 5.2a15 15 0 0 1 10.5 3.6M5.2 12.6a10 10 0 0 1 5-2.5M16.8 11.1a10 10 0 0 1 2 1.5M12 20h.01');

const GLYPHS = {
  // ---------- the contract's set (SYSTEM.md §5) ----------
  check: { d: 'M4.5 12.8l5 5L19.5 7', solid: CIRCLE, cut: 'M7.9 12.4l2.8 2.8 5.4-5.7' },
  alert: { d: `${CIRCLE}${BANG}`, solid: CIRCLE, cut: BANG },
  flame: closed('M12 3c.6 3.4 2.4 5.1 3.9 6.7 1.5 1.6 2.6 3.3 2.6 5.3a6.5 6.5 0 0 1-13 0c0-1.7.7-3.2 1.7-4.4.4 1.8 1.4 2.9 2.7 3.2-.4-3.2.1-7.6 2.1-10.8z'),
  battery: { d: `${BATTERY}M21.5 10.75v2.5M6.25 11v2`, solid: BATTERY, line: 'M21.5 10.75v2.5' },
  'shield-check': { d: `${SHIELD}${TICK}`, solid: SHIELD, cut: TICK },
  question: { d: 'M7.6 7.5a4.5 4.5 0 0 1 8.75 1.5c0 3-4.35 3.6-4.35 5.7M12 19.3h.01', solid: CIRCLE, cut: HOOK },
  pin: { d: `${TEARDROP}M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z`, solid: `${TEARDROP}M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z` },
  search: lineOnly('M10.7 18.2a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM20.6 20.6 16 16'),
  bell: { d: `${BELL}${CLAPPER}`, solid: BELL, line: CLAPPER },
  clock: { d: `${CIRCLE}${HANDS}`, solid: CIRCLE, cut: HANDS },
  layers: { d: `${LAYER_TOP}${LAYER_REST}`, solid: LAYER_TOP, line: LAYER_REST },
  plus: lineOnly('M12 5v14M5 12h14'),
  minus: lineOnly('M5 12h14'),
  locate: { d: `${LOCATE_RING}${LOCATE_TICKS}`, solid: LOCATE_RING, line: LOCATE_TICKS },
  // A needle only: no ring, so it can sit in the round map control.
  compass: { d: 'M12 3l4 9-4 9-4-9 4-9zM8 12h8', solid: 'M12 3l4 9H8l4-9z', line: 'M8 12l4 9 4-9' },
  'chevron-right': chevronRight,
  'chevron-left': lineOnly('m15 18-6-6 6-6'),
  'chevron-down': chevronDown,
  close,
  house,
  building: { d: `${TOWER}M3.5 21h17${WINDOWS}`, solid: TOWER, line: 'M3.5 21h17', cut: WINDOWS },
  map: { d: `${SHEET}${FOLDS}`, solid: SHEET, cut: FOLDS },
  chart: { d: `${AXES}M7.5 15l3.7-4 3.3 3 5-6`, solid: 'M7.5 16.5V15l3.7-4 3.3 3 5-6v8.5z', line: AXES },
  list: { d: `${LIST_ROWS}M3.8 6h.01M3.8 12h.01M3.8 18h.01`, solid: 'M3.8 6.7a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4zM3.8 12.7a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4zM3.8 18.7a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4z', line: LIST_ROWS },
  grid: closed(`${square(3.5, 3.5)}${square(13.5, 3.5)}${square(3.5, 13.5)}${square(13.5, 13.5)}`),
  activity: lineOnly('M21.5 12H18l-3 8L9 4l-3 8H2.5'),
  undo: lineOnly('M8.5 14 4 9.5 8.5 5M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11'),
  route: { d: `${STOPS}${PATHWAY}`, solid: STOPS, line: PATHWAY },
  play: closed('M7 4.6v14.8L19.4 12 7 4.6z'),
  'fast-forward': fastForward,
  reset: lineOnly('M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.2M3.5 3.5v4.7h4.7'),
  quake: lineOnly('M2.8 12H6l2-6 3.2 12 2.8-9 2 5 1.8-2h3.4'),
  user: { d: `${HEAD}${SHOULDERS}`, solid: `${HEAD}${SHOULDERS}z` },
  'wifi-off': wifiOff,

  // ---------- additions ----------
  // The bare mark for inside a status pin, where `alert` would draw a ring in a circle.
  exclaim: lineOnly('M12 4.5v10M12 19.5h.01'),

  // ---------- names existing callers use ----------
  x: close,
  home: house,
  chevronRight,
  chevronDown,
  forward: fastForward,
  wifiOff,
  shield: closed(SHIELD),
  zap: closed('M13 2.8 4 13.5h7.5l-1 7.7 9-10.7H12l1-7.7z'),
  phone: closed('M21.2 16.6v2.8a1.9 1.9 0 0 1-2.1 1.9 18.6 18.6 0 0 1-8.1-2.9 18.3 18.3 0 0 1-5.6-5.6 18.6 18.6 0 0 1-2.9-8.2A1.9 1.9 0 0 1 4.4 2.5h2.8a1.9 1.9 0 0 1 1.9 1.6c.1.9.3 1.8.7 2.6a1.9 1.9 0 0 1-.5 2L8.1 9.9a15 15 0 0 0 5.6 5.6l1.2-1.2a1.9 1.9 0 0 1 2-.4c.8.3 1.7.6 2.6.7a1.9 1.9 0 0 1 1.7 2z'),
  users: lineOnly('M15.5 20.5v-1.5a4 4 0 0 0-4-4h-5.5a4 4 0 0 0-4 4v1.5M8.8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21.5 20.5v-1.5a4 4 0 0 0-3-3.9M15.5 3.1a4 4 0 0 1 0 7.8'),
  siren: lineOnly('M7 18v-6a5 5 0 1 1 10 0v6M5 21h14v-3H5v3zM12 2.8v1M20.7 12h.8M18.5 4.8 18 5.3M2.5 12h.8M5.5 4.8l.5.5'),
  // Ascending bars read as "signal" without the rings a broadcast glyph would need.
  radio: lineOnly('M4 20v-3M9.3 20v-7M14.7 20v-11M20 20V4'),
  sliders: lineOnly('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5'),
  command: lineOnly('M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z'),
  heart: closed('M12 20.5l-6.9-6.9C3.6 12.1 2.5 10.6 2.5 8.5A5 5 0 0 1 7.5 3.5c1.8 0 3 .6 4.5 2 1.5-1.4 2.7-2 4.5-2a5 5 0 0 1 5 5c0 2.1-1.1 3.6-2.6 5.1L12 20.5z'),
  // A flat graticule rather than a sphere: the name stays, no planet is drawn.
  globe: lineOnly('M4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5zM3 12h18M9 5c-1.6 2-2.4 4.4-2.4 7s.8 5 2.4 7M15 5c1.6 2 2.4 4.4 2.4 7s-.8 5-2.4 7'),
  baby: lineOnly('M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5M18.7 7a8.5 8.5 0 0 1-6.7 13.5A8.5 8.5 0 0 1 5.3 7M12 3.5a3 3 0 0 0 0 6'),
  accessibility: lineOnly('M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 9l7 1 7-1M12 10v5l-3 6M12 15l3 6'),
  arrowUpRight: lineOnly('M7 17 17 7M8 7h9v9'),
  thermo: closed('M14 14.8V4.5a2 2 0 0 0-4 0v10.3a4 4 0 1 0 4 0z'),
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

/** Raw outline path data, for drawing a glyph inside an existing SVG (map markers). */
export const iconPath = (name: IconName): string => GLYPHS[name].d;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** The selected-state variant. Line-only glyphs (plus, chevrons…) draw their outline. */
  filled?: boolean;
}

export function Icon({ name, size = 18, strokeWidth = 1.6, filled = false, ...rest }: IconProps) {
  const glyph: Glyph = GLYPHS[name];
  const maskId = useId();
  const solid = filled ? glyph.solid : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {solid === undefined ? (
        <path d={glyph.d} />
      ) : (
        <>
          {glyph.cut && (
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
              <rect width="24" height="24" fill="white" stroke="none" />
              <path d={glyph.cut} stroke="black" strokeWidth={strokeWidth + 0.2} />
            </mask>
          )}
          <path d={solid} fill="currentColor" fillRule="evenodd" mask={glyph.cut ? `url(#${maskId})` : undefined} />
          {glyph.line && <path d={glyph.line} />}
        </>
      )}
    </svg>
  );
}
