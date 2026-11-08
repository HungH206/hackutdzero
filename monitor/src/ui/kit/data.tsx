// Data display wrappers over kit.css (SYSTEM.md §5). Every number and word here
// comes straight from the household, priority and escalation rows. Nothing in
// this file scores, ranks or re-weights a household: priority is only read.
import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import { STEP_LABEL, type View } from '../../data/derive';
import type { Band as BandName, Household, Priority } from '../../data/types';
import { Icon, type IconName } from '../Icon';

export type Status = 'critical' | 'help' | 'open' | 'waiting' | 'fire' | 'power' | 'ok' | 'assisted' | 'info' | 'unknown' | 'neutral';

/** Every status carries a glyph as well as a word (SYSTEM.md §3). */
const STATUS_GLYPH: Record<Status, IconName> = {
  critical: 'alert',
  help: 'alert',
  open: 'clock',
  waiting: 'clock',
  fire: 'flame',
  power: 'battery',
  ok: 'check',
  assisted: 'shield-check',
  info: 'alert',
  unknown: 'question',
  neutral: 'alert',
};

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** The stored HPI has one decimal (round1 in the reducer), so this only pads the trailing zero. */
export const fmtHpi = (hpi: number) => hpi.toFixed(1);

/** A glyph in the status fill. Text stays in ink, so only the glyph takes the fill. */
function StatusGlyph({ status, name, size }: { status: Status; name: IconName; size: number }) {
  return (
    <span data-status={status} style={{ display: 'inline-flex', color: 'var(--status-fill)' }}>
      <Icon name={name} size={size} />
    </span>
  );
}

// ---------- rank, HPI, band ----------

export interface RankProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  /** priority.rank as stored. 0 means the household is not in the queue. */
  value: number;
  band?: BandName;
}

export function Rank({ value, band, className, ...rest }: RankProps) {
  const ranked = value > 0;
  return (
    <span className={cx('hc-rank', className)} data-band={ranked ? band : undefined} {...rest}>
      {ranked ? (
        <>
          <span className="sr-only">Rank </span>
          {value}
        </>
      ) : (
        <>
          <span aria-hidden="true">—</span>
          <span className="sr-only">Not ranked</span>
        </>
      )}
    </span>
  );
}

export interface HpiProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  /** priority.hpi as stored, or null when the household is not scored. */
  value: number | null;
  band?: BandName;
  /** 40px, for the inspector's priority card. */
  lg?: boolean;
}

export function Hpi({ value, band, lg, className, style, ...rest }: HpiProps) {
  return (
    <span
      className={cx('hc-hpi', lg && 'hc-hpi--lg', className)}
      data-band={band}
      // .hc-hpi--lg sets the font shorthand, which resets the tabular figures .hc-hpi asked for.
      style={lg ? { fontVariantNumeric: 'tabular-nums', ...style } : style}
      {...rest}
    >
      {value === null ? (
        <>
          <span aria-hidden="true">—</span>
          <span className="sr-only">Not scored</span>
        </>
      ) : (
        fmtHpi(value)
      )}
    </span>
  );
}

export interface BandProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  /** priority.band as stored. The kit uppercases it. */
  band: BandName;
}

export function Band({ band, className, ...rest }: BandProps) {
  return (
    <span className={cx('hc-band', className)} {...rest}>
      {band}
    </span>
  );
}

// ---------- ladder ----------

/** The step's name in plain words. Step 4 keeps its simulated label (SYSTEM.md §14). */
export function stepName(step: number, done?: boolean): string {
  if (done) return 'Ladder finished';
  if (step === 4) return 'Responder (simulated)';
  return STEP_LABEL[step] ?? STEP_LABEL[0];
}

export interface LadderProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  /** escalation.step as stored, 0 to 4. */
  step: number;
  done?: boolean;
  /** Stretches to fill its container: the inspector's ladder. */
  wide?: boolean;
  /** Replaces the step name. Pass false for the bare segments. */
  label?: ReactNode;
}

export function Ladder({ step, done, wide, label, className, ...rest }: LadderProps) {
  const shown = label === undefined ? stepName(step, done) : label;
  return (
    <span className={cx('hc-ladder', wide && 'hc-ladder--wide', className)} {...rest}>
      {[1, 2, 3, 4].map((s) => (
        <i key={s} data-on={s <= step ? 'true' : undefined} />
      ))}
      <span className="sr-only">{step > 0 ? `Step ${step} of 4. ` : 'Ladder not started. '}</span>
      {shown !== false && shown !== null && <span className="hc-ladder__label">{shown}</span>}
    </span>
  );
}

// ---------- status bar ----------

export interface StatusSegment {
  status: Status;
  count: number;
  label: string;
}

/** The accounted-for split from view.counts: found first, then whoever is still open. */
export function accountedSegments(c: Pick<View['counts'], 'ok' | 'help' | 'assisted' | 'unresolved' | 'unknown'>): StatusSegment[] {
  return [
    { status: 'ok', count: c.ok, label: 'Found OK' },
    { status: 'assisted', count: c.assisted, label: 'Assisted' },
    { status: 'help', count: c.help, label: 'Needs help' },
    { status: 'open', count: c.unresolved, label: 'Open' },
    { status: 'unknown', count: c.unknown, label: 'No sensor' },
  ];
}

export interface StatusBarProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** view.counts, or any counts of the same shape (one building's, say). */
  counts?: Parameters<typeof accountedSegments>[0];
  /** Any other split. Wins over counts. */
  segments?: StatusSegment[];
}

export function StatusBar({ counts, segments, className, ...rest }: StatusBarProps) {
  const parts = (segments ?? (counts ? accountedSegments(counts) : [])).filter((s) => s.count > 0);
  return (
    <div
      className={cx('hc-statusbar', className)}
      role="img"
      aria-label={parts.length ? parts.map((s) => `${s.count} ${s.label}`).join(', ') : 'No households'}
      {...rest}
    >
      {parts.map((s) => (
        <i key={`${s.status}-${s.label}`} data-status={s.status} style={{ flexGrow: s.count, flexBasis: 0 }} />
      ))}
    </div>
  );
}

// ---------- tile, stat, KPI ----------

export interface TileProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  label: ReactNode;
  value: ReactNode;
  /** Small text after the value: "min", "next in 1:32". */
  unit?: ReactNode;
  icon?: IconName;
  /** Colors the value with this status's ink. */
  status?: Status;
}

export function Tile({ label, value, unit, icon, status, className, ...rest }: TileProps) {
  const glyph = icon ?? (status ? STATUS_GLYPH[status] : undefined);
  return (
    <div className={cx('hc-tile', className)} data-status={status} {...rest}>
      <div className="hc-tile__label">
        {glyph && (status ? <StatusGlyph status={status} name={glyph} size={14} /> : <Icon name={glyph} size={14} />)}
        {label}
      </div>
      <div className="hc-tile__value">
        {value}
        {unit != null && <small>{unit}</small>}
      </div>
    </div>
  );
}

export interface StatProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  label: ReactNode;
  value: ReactNode;
}

export function Stat({ label, value, className, ...rest }: StatProps) {
  return (
    <span className={cx('hc-stat', className)} {...rest}>
      {label}
      <b>{value}</b>
    </span>
  );
}

const decimalsOf = (n: number) => (Number.isInteger(n) ? 0 : (String(n).split('.')[1]?.length ?? 0));

/** Counts to a new value over --dur-count. The first render and reduced motion show it directly. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = value;
      setShown(value);
      return;
    }
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-count')) || 400;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const next = k === 1 ? value : from + (value - from) * (1 - (1 - k) ** 3);
      current.current = next;
      setShown(next);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const decimals = decimalsOf(value);
  return (
    <>
      <span aria-hidden="true">{shown.toFixed(decimals)}</span>
      <span className="sr-only">{value.toFixed(decimals)}</span>
    </>
  );
}

export interface KpiProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  label: ReactNode;
  /** A number counts to its new value. Pass a string for text like "12 of 40". */
  value: ReactNode;
  unit?: ReactNode;
  /** The value at the start of the incident. */
  was?: ReactNode;
  wasLabel?: ReactNode;
}

export function Kpi({ label, value, unit, was, wasLabel = 'At incident start', className, ...rest }: KpiProps) {
  return (
    <div className={cx('hc-panel', 'hc-kpi', className)} data-ui="kpi" {...rest}>
      <div className="hc-kpi__label">{label}</div>
      <div className="hc-kpi__value">
        {typeof value === 'number' ? <CountUp value={value} /> : value}
        {unit != null && <small>{unit}</small>}
      </div>
      {was != null && (
        <div className="hc-kpi__was">
          {wasLabel}: <b className="t-num">{was}</b>
        </div>
      )}
    </div>
  );
}

// ---------- factors ----------

const FACTOR_NAME = {
  E: 'Exposure',
  S: 'Silence',
  C: 'Check-in',
  V: 'Vulnerability',
  K: 'Clock',
  L: 'Likelihood',
  M: 'Consequence',
} as const;

export type FactorLetter = keyof typeof FACTOR_NAME;

export const FACTOR_LETTERS: FactorLetter[] = ['E', 'S', 'C', 'V', 'K', 'L', 'M'];

export interface FactorProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  letter: FactorLetter;
  /** The stored value, printed as stored (two decimals). */
  value: number;
}

export function Factor({ letter, value, className, ...rest }: FactorProps) {
  // Bar length only. K is the one factor that runs past 1: its range is 1.0 to 1.5.
  const max = letter === 'K' ? 1.5 : 1;
  const text = value.toFixed(2);
  return (
    <div
      className={cx('hc-factor', className)}
      role="meter"
      aria-label={`${FACTOR_NAME[letter]} (${letter})`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={text}
      {...rest}
    >
      <b>{letter}</b>
      <div className="hc-factor__track">
        <i style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
      </div>
      <span className="hc-factor__val">{text}</span>
    </div>
  );
}

export interface FactorsProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  priority: Priority;
}

/** All seven factors in their fixed order. An unscored household has none to show. */
export function Factors({ priority, style, ...rest }: FactorsProps) {
  if (!priority.scored) return null;
  return (
    <div style={{ display: 'grid', gap: 'var(--s-2)', ...style }} {...rest}>
      {FACTOR_LETTERS.map((l) => (
        <Factor key={l} letter={l} value={priority[l]} />
      ))}
    </div>
  );
}

// ---------- alert ----------

export interface AlertProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'onClick' | 'children'> {
  status: Status;
  title: ReactNode;
  /** One sentence. */
  text?: ReactNode;
  /** Timestamp, already formatted (clockText). */
  time?: ReactNode;
  /** Replaces the status's own glyph. */
  icon?: IconName;
  /** White background: toasts. */
  white?: boolean;
  /** Controls on the right, such as a dismiss button. */
  aside?: ReactNode;
  /** Makes the whole alert open something, such as the household. */
  onClick?: MouseEventHandler<HTMLElement>;
}

export function Alert({ status, title, text, time, icon, white, aside, onClick, className, style, ...rest }: AlertProps) {
  const cls = cx('hc-alert', white && 'hc-alert--white', className);
  const body = (
    <>
      <Icon name={icon ?? STATUS_GLYPH[status]} size={20} className="hc-alert__icon" />
      {/* With a dismiss button the alert can't be one big <button>, so the title carries keyboard access. */}
      {onClick && aside ? (
        <button type="button" className="hc-alert__title" style={{ textAlign: 'left' }}>
          {title}
        </button>
      ) : (
        <span className="hc-alert__title">{title}</span>
      )}
      {text != null && <span className="hc-alert__text">{text}</span>}
      {time != null && <time className="hc-alert__time">{time}</time>}
      {aside != null && (
        <span className="hc-alert__aside" onClick={onClick ? (e) => e.stopPropagation() : undefined}>
          {aside}
        </span>
      )}
    </>
  );

  if (onClick && !aside) {
    return (
      <button type="button" className={cls} data-status={status} data-ui="alert" onClick={onClick} style={style} {...(rest as ComponentPropsWithoutRef<'button'>)}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} data-status={status} data-ui="alert" onClick={onClick} style={onClick ? { cursor: 'pointer', ...style } : style} {...rest}>
      {body}
    </div>
  );
}

// ---------- household row ----------

/** The household's own status, if it has left "open". The words are SYSTEM.md §14's. */
function finalWord(h: Household): { status: Status; word: string; glyph: IconName } | null {
  if (h.finalState === 'found_ok') return { status: 'ok', word: 'Found OK', glyph: 'check' };
  if (h.finalState === 'found_needs_help') return { status: 'help', word: 'Needs help', glyph: 'alert' };
  if (h.finalState === 'assisted') return { status: 'assisted', word: 'Assisted', glyph: 'shield-check' };
  return h.hasSensor ? null : { status: 'unknown', word: 'No sensor', glyph: 'question' };
}

export interface HouseholdRowProps extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'onSelect'> {
  /** The household as the view provides it: an entry of view.queue, view.households or view.hh. */
  household: Household;
  /** Priority, escalation and building are read from here, so every list shows the same row. */
  view: Pick<View, 'prio' | 'esc' | 'building'>;
  selected?: boolean;
  /** Hover linked from elsewhere, such as the map pin. */
  hovered?: boolean;
  onSelect?: (id: number) => void;
  onHover?: (id: number | null) => void;
}

/** The one household row: dispatch queue, Live map list, waiting list, Building column, search results. */
export function HouseholdRow({ household: h, view, selected, hovered, onSelect, onHover, onClick, onPointerEnter, onPointerLeave, className, ...rest }: HouseholdRowProps) {
  const p = view.prio.get(h.id);
  const e = view.esc.get(h.id);
  const building = view.building.get(h.buildingId);
  const state = finalWord(h);
  const stepped = e && e.step > 0;

  const spoken = [
    h.name,
    building ? `${building.name} ${h.unit}` : `Unit ${h.unit}`,
    state ? state.word : 'open',
    ...(p?.scored ? [p.band, ...(p.rank > 0 ? [`rank ${p.rank}`] : []), `HPI ${fmtHpi(p.hpi)}`] : []),
    ...(p ? [p.reason] : []),
    ...(stepped ? [`ladder step ${e.step} of 4, ${stepName(e.step, e.done)}`] : []),
  ].join(', ');

  // Found OK and Assisted have left the queue: the stored score stays readable but stops looking urgent.
  const urgent = h.finalState !== 'found_ok' && h.finalState !== 'assisted';

  return (
    <button
      type="button"
      className={cx('hc-row', className)}
      data-ui="row"
      data-hover={hovered ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      aria-label={spoken}
      onClick={(ev) => {
        onClick?.(ev);
        onSelect?.(h.id);
      }}
      onPointerEnter={(ev) => {
        onPointerEnter?.(ev);
        onHover?.(h.id);
      }}
      onPointerLeave={(ev) => {
        onPointerLeave?.(ev);
        onHover?.(null);
      }}
      {...rest}
    >
      <Rank value={p?.rank ?? 0} band={p?.band} />
      <span className="hc-row__main">
        <span className="hc-row__name">
          {h.name}
          <small>{h.unit}</small>
        </span>
        <span className="hc-row__reason">{p ? p.reason : 'Not scored'}</span>
        <span className="hc-row__meta">
          <Ladder
            step={e?.step ?? 0}
            done={e?.done}
            label={
              state ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                  <StatusGlyph status={state.status} name={state.glyph} size={14} />
                  <span data-status={state.status} style={{ color: 'var(--status-ink)' }}>
                    {state.word}
                  </span>
                </span>
              ) : undefined
            }
          />
        </span>
      </span>
      <span className="hc-row__end">
        <Hpi value={p?.scored ? p.hpi : null} band={urgent ? p?.band : undefined} />
        {p && <Band band={p.band} />}
      </span>
    </button>
  );
}

/** Same box as a row while the first snapshot loads, so nothing jumps when data lands. */
export function HouseholdRowSkeleton() {
  return (
    <div className="hc-row" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <span className="hc-rank" />
      <span className="hc-row__main">
        <span className="hc-skel" style={{ display: 'block', width: '50%', height: 12, margin: '4px 0' }} />
        <span className="hc-skel" style={{ display: 'block', width: '90%', height: 10, margin: '4px 0' }} />
        <span className="hc-row__meta">
          <Ladder step={0} label={false} />
        </span>
      </span>
      <span className="hc-row__end">
        <span className="hc-skel" style={{ display: 'block', width: 40, height: 16, margin: '4px 0' }} />
      </span>
    </div>
  );
}
