// Headcount Priority Index. This file is the formula from README.md
// ("Headcount Priority Index (HPI)"), and only the recompute_hpi reducer
// calls it. Clients never import it. If you change a weight here, change the
// README in the same commit.

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Check-in status C. */
export const CHECKIN_C = {
  ok: 0.0,
  pending: 0.35,
  no_response: 0.7,
  help: 1.0,
} as const;
export type CheckinState = keyof typeof CHECKIN_C | 'none';

export interface ExposureInputs {
  /** Shaking intensity I in [0,1]; 0 unless the event was confirmed. */
  shaking: number;
  /** Building risk B in [0,1]. */
  buildingRisk: number;
  /** Flame in this unit (F). */
  flame: boolean;
  /** Temperature rise in degrees C. */
  tempRiseC: number;
  /** Fire in an adjacent unit (N). */
  neighborFire: boolean;
}

export const TEMP_RISE_MAX_C = 30;

export function exposure(x: ExposureInputs): number {
  const Eq = 0.6 * x.shaking + 0.4 * x.buildingRisk;
  const T = Math.min(1, Math.max(0, x.tempRiseC) / TEMP_RISE_MAX_C);
  const Ef = 0.5 * (x.flame ? 1 : 0) + 0.35 * T + 0.15 * (x.neighborFire ? 1 : 0);
  return 1 - (1 - Eq) * (1 - Ef);
}

/** I = 0.5 * normalized peak + 0.5 * normalized duration. */
export const SHAKE_PEAK_MAX_G = 1.0;
export const SHAKE_DURATION_MAX_S = 30;
export function shakingIntensity(peakG: number, durationS: number, confirmed: boolean): number {
  if (!confirmed) return 0;
  return 0.5 * clamp01(peakG / SHAKE_PEAK_MAX_G) + 0.5 * clamp01(durationS / SHAKE_DURATION_MAX_S);
}

export interface SilenceInputs {
  /** Minutes since the last signal after the event (s). */
  minutesSilent: number;
  /** Heartbeat stopped abruptly at the moment of shaking or fire (alpha = +0.2). */
  abrupt: boolean;
  /** Motion seen in the last 5 minutes (delta = 0.5). */
  recentMotion: boolean;
  /** Whole area went quiet together with no shaking (lambda = 0.5). */
  commsOutage: boolean;
}

export function silence(x: SilenceInputs): number {
  const S0 = Math.min(1, Math.max(0, x.minutesSilent) / 20);
  const delta = x.recentMotion ? 0.5 : 1;
  const alpha = x.abrupt ? 0.2 : 0;
  const lambda = x.commsOutage ? 0.5 : 1;
  return lambda * Math.min(1, delta * S0 + alpha);
}

export interface VulnerabilityInputs {
  poweredMedical: boolean;
  age: number;
  mobilityLimited: boolean;
  livesAlone: boolean;
  languageBarrier: boolean;
  infant: boolean;
}

export function vulnerability(x: VulnerabilityInputs): number {
  const b = (v: boolean) => (v ? 1 : 0);
  return Math.min(
    1,
    0.35 * b(x.poweredMedical) +
      0.25 * b(x.age >= 75) +
      0.25 * b(x.mobilityLimited) +
      0.15 * b(x.livesAlone) +
      0.15 * b(x.languageBarrier) +
      0.1 * b(x.infant),
  );
}

export interface ClockInputs {
  poweredMedical: boolean;
  /** Minutes since mains power was lost, or null if power is on. */
  minutesSincePowerLoss: number | null;
  backupRuntimeMin: number;
  flame: boolean;
}

/** Time to harm in minutes, or null when the power-loss clock does not apply. */
export function timeToHarm(x: ClockInputs): number | null {
  if (!x.poweredMedical || x.minutesSincePowerLoss === null) return null;
  return Math.max(0, x.backupRuntimeMin - x.minutesSincePowerLoss);
}

export function clockK(x: ClockInputs): number {
  const tth = timeToHarm(x);
  const Kp = tth === null ? 1 : 1 + 0.5 * (1 - Math.min(1, tth / 240));
  const Kf = x.flame ? 1.5 : 1;
  return Math.max(Kp, Kf);
}

export const aging = (minutesWaiting: number) => Math.min(10, Math.floor(Math.max(0, minutesWaiting) / 10));

export interface Factors {
  E: number;
  S: number;
  C: number;
  V: number;
  K: number;
  /** Aging bonus A (points). */
  A: number;
  /** Dispatcher override delta_h in [-30, 30]. */
  override: number;
  /** Flame confirmed in this household's own unit (for the fire floor). */
  flame: boolean;
}

export interface Score {
  hpi: number;
  L: number;
  M: number;
}

export function score(f: Factors): Score {
  let L = 0.4 * f.E + 0.35 * f.S + 0.25 * f.C;
  // Override rule 1: help or fire floor.
  if (f.C >= 1 || f.flame) L = Math.max(L, 0.9);
  const M = 0.5 + 0.5 * f.V;
  const raw = 100 * L * M * f.K + f.A + clamp(f.override, -30, 30);
  return { hpi: round1(clamp(raw, 0, 100)), L, M };
}

export const round1 = (x: number) => Math.round(x * 10) / 10;

export type Band = 'low' | 'guarded' | 'high' | 'critical';
export function band(hpi: number): Band {
  if (hpi >= 75) return 'critical';
  if (hpi >= 50) return 'high';
  if (hpi >= 25) return 'guarded';
  return 'low';
}

export interface ReasonInputs {
  age: number;
  medicalDevice: string;
  mobilityLimited: boolean;
  livesAlone: boolean;
  languageBarrier: boolean;
  language: string;
  infant: boolean;
  shaking: number;
  flame: boolean;
  neighborFire: boolean;
  tempRiseC: number;
  checkin: CheckinState;
  minutesSilent: number | null;
  recentMotion: boolean;
  commsOutage: boolean;
  tth: number | null;
  override: number;
}

/** Plain-English reason, most important facts first. */
export function reason(x: ReasonInputs): string {
  const parts: string[] = [];
  if (x.checkin === 'help') parts.push('pressed I NEED HELP');
  if (x.flame) parts.push('flame in unit');
  else if (x.neighborFire) parts.push('fire next door');
  else if (x.tempRiseC >= 10) parts.push(`temp +${Math.round(x.tempRiseC)}°C`);
  parts.push(String(x.age));
  if (x.medicalDevice) parts.push(x.medicalDevice);
  if (x.tth !== null) parts.push(`${Math.round(x.tth)} min of backup power left`);
  if (x.mobilityLimited) parts.push('limited mobility');
  if (x.livesAlone) parts.push('lives alone');
  if (x.infant) parts.push('infant at home');
  if (x.languageBarrier) parts.push(`speaks ${x.language}`);
  if (x.shaking >= 0.6) parts.push('heavy-shake zone');
  else if (x.shaking >= 0.3) parts.push('moderate shaking');
  if (x.minutesSilent !== null && x.minutesSilent >= 1 && x.checkin !== 'ok' && x.checkin !== 'help') {
    parts.push(`silent ${Math.round(x.minutesSilent)} min`);
    if (x.recentMotion) parts.push('moving, not responding');
    if (x.commsOutage) parts.push('area comms outage');
  }
  if (x.checkin === 'pending') parts.push('check-in sent');
  if (x.checkin === 'ok') parts.push('answered OK');
  if (x.override !== 0) parts.push(`dispatcher ${x.override > 0 ? '+' : ''}${x.override}`);
  return parts.join(', ');
}

/** Escalation ladder waits shrink as HPI grows: 6 min at HPI 0, 1.5 min at HPI 100. */
export function ladderWaitMinutes(hpi: number): number {
  return Math.max(1, round1(6 * (1 - 0.75 * clamp01(hpi / 100))));
}

/** A household at or above this HPI skips steps 2 and 3 and goes straight to responders. */
export const SKIP_TO_DISPATCH_HPI = 85;
