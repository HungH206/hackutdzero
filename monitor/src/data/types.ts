// Row shapes the dashboard reads. They mirror the tables in
// spacetimedb/src/index.ts, with u64 microsecond times normalized to numbers.
// The dashboard only reads these: it never computes an HPI.

export type FinalState = 'unresolved' | 'found_ok' | 'found_needs_help' | 'assisted';
export type Band = 'low' | 'guarded' | 'high' | 'critical' | 'unknown';

export interface Building {
  id: number;
  name: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floors: number;
  builtYear: number;
  risk: number;
}

export interface Household {
  id: number;
  buildingId: number;
  floor: number;
  unit: string;
  name: string;
  x: number;
  y: number;
  age: number;
  medicalDevice: string;
  backupRuntimeMin: number;
  mobilityLimited: boolean;
  livesAlone: boolean;
  language: string;
  infant: boolean;
  hasSensor: boolean;
  hero: string;
  finalState: FinalState;
  finalAtMicros: number;
  finalNote: string;
  simulated: boolean;
}

export interface NodeRow {
  householdId: number;
  online: boolean;
  lastSignalMicros: number;
  abrupt: boolean;
  onBattery: boolean;
  powerLostAtMicros: number;
  flame: boolean;
  tempRiseC: number;
  lastMotionMicros: number;
  shakePeakG: number;
  shakeDurationS: number;
  shakeConfirmed: boolean;
}

export interface Disaster {
  id: number;
  kind: string;
  x: number;
  y: number;
  buildingId: number;
  confirmedAtMicros: number;
  active: boolean;
}

export interface Checkin {
  householdId: number;
  state: 'none' | 'pending' | 'no_response' | 'ok' | 'help';
  promptedAtMicros: number;
  answeredAtMicros: number;
  source: string;
}

export interface Escalation {
  householdId: number;
  step: number;
  stepAtMicros: number;
  nextAtMicros: number;
  done: boolean;
}

export interface Priority {
  householdId: number;
  scored: boolean;
  hpi: number;
  band: Band;
  rank: number;
  E: number;
  S: number;
  C: number;
  V: number;
  K: number;
  L: number;
  M: number;
  A: number;
  override: number;
  minutesSilent: number;
  tthMin: number;
  commsOutage: boolean;
  reason: string;
  updatedAtMicros: number;
}

export interface OverrideLog {
  id: number;
  householdId: number;
  delta: number;
  reason: string;
  by: string;
  atMicros: number;
}

export interface TimelineRow {
  id: number;
  atMicros: number;
  kind: string;
  severity: 'info' | 'warn' | 'critical' | 'good';
  householdId: number;
  message: string;
}

export interface Snapshot {
  clockOffsetMicros: number;
  buildings: Building[];
  households: Household[];
  nodes: NodeRow[];
  disasters: Disaster[];
  checkins: Checkin[];
  escalations: Escalation[];
  priorities: Priority[];
  overrides: OverrideLog[];
  timeline: TimelineRow[];
  /** Written by the text agent. Missing on the in-process local fallback, so every reader must default to empty. */
  accounts?: AccountRow[];
  helpTasks?: HelpTaskRow[];
  summaries?: SummaryRow[];
}

/** Who is accounted for, from what people reported by text. */
export interface AccountRow { householdId: number; status: string; sources: number; note: string }
/** A neighbor check. A dispatcher has to approve it before anyone is asked. */
export interface HelpTaskRow { id: number; householdId: number; state: string; helperLabel: string; reason: string; approvedBy: string }
export interface SummaryRow { total: number; accounted: number; reported: number; needsHelp: number; conflict: number; unaccounted: number; eventActive: boolean }

export const emptySnapshot: Snapshot = {
  clockOffsetMicros: 0,
  buildings: [],
  households: [],
  nodes: [],
  disasters: [],
  checkins: [],
  escalations: [],
  priorities: [],
  overrides: [],
  timeline: [],
};

/** Reducer calls the dashboard can make. Names match the module's reducers. */
export interface Actions {
  overridePriority(householdId: number, delta: number, reason: string): Promise<void>;
  setFinalState(householdId: number, state: FinalState, note: string): Promise<void>;
  submitCheckin(householdId: number, answer: 'ok' | 'help', source: string): Promise<void>;
  simQuake(x: number, y: number, magnitude: number): Promise<void>;
  simFire(householdId: number): Promise<void>;
  simPowerLoss(x: number, y: number, radius: number): Promise<void>;
  simCommsOutage(x: number, y: number, radius: number): Promise<void>;
  simFastForward(minutes: number): Promise<void>;
  simReset(): Promise<void>;
  /** Dispatcher only. Lets the agent ask the proposed neighbor. */
  approveHelpTask(id: number, by: string): Promise<void>;
}

export type SourceKind = 'spacetimedb' | 'local';

export interface ConnectionInfo {
  source: SourceKind;
  status: 'connecting' | 'live' | 'error';
  detail: string;
  /** This client's SpacetimeDB identity (hex). A dispatcher is an identity an operator has added. */
  identity?: string;
}

/** Convert a row from either source: bigints become numbers. */
export function normalize<T>(row: unknown): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out as T;
}
