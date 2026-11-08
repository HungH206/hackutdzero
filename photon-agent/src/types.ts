export type Language = 'en' | 'es';

export interface Contact {
  handle: string;
  name: string;
  /** Opaque hash of the handle. This is the only identifier that reaches SpacetimeDB. */
  sourceKey: string;
  householdId: number | null;
  careFor: number[];
  language: Language;
  capabilities: string[];
  /** Filled from the first inbound message. A line can only text people who have texted it. */
  spaceId: string | null;
  agentId: string | null;
  assignedNumber: string | null;
  stage: 'new' | 'asked_capabilities' | 'ready';
  stopped: boolean;
}

export interface Assignment {
  helper: string;
  askedAt: number;
  declined: string[];
  followedUp: boolean;
}

export interface Inbound {
  id: string;
  handle: string;
  spaceId: string;
  agentId: string;
  text: string;
}

export interface Household {
  id: number; buildingId: number; unit: string; name: string; x: number; y: number; age: number;
  medicalDevice: string; mobilityLimited: boolean; language: string; infant: boolean; simBehavior: string;
}
export interface Building { id: number; name: string }
export interface Disaster { id: number; kind: string; active: boolean; confirmedAtMicros: bigint | number }
export interface Checkin { householdId: number; state: string; promptedAtMicros: bigint | number }
export interface Account { householdId: number; status: string; sources: number; note: string }
export interface Task { id: bigint | number; householdId: number; state: string; helperLabel: string; reason: string }
export interface Summary { total: number; accounted: number; reported: number; needsHelp: number; conflict: number; unaccounted: number; eventActive: boolean }

export interface Snapshot {
  households: Household[];
  buildings: Building[];
  disasters: Disaster[];
  checkins: Checkin[];
  accounts: Account[];
  tasks: Task[];
  summary: Summary | null;
}

export interface Db {
  snapshot(): Promise<Snapshot>;
  linkHousehold(householdId: number): Promise<void>;
  recordClaim(c: { householdId: number; sourceKey: string; relation: string; firsthand: boolean; kind: string; detail: string }): Promise<void>;
  proposeTask(householdId: number, helperLabel: string, reason: string): Promise<void>;
  approveTask(id: bigint | number, by: string): Promise<void>;
  updateTask(id: bigint | number, state: string, helperLabel: string): Promise<void>;
}

export interface Send {
  (to: Contact, text: string, idempotencyKey: string): Promise<void>;
}

export type ClaimKind = 'safe' | 'away' | 'needs_help' | 'unknown';
export type HelperReply = 'accept' | 'decline' | 'found_ok' | 'found_needs_help' | 'none';

export interface Understood {
  language: Language;
  claims: { subjectHouseholdId: number; kind: ClaimKind; firsthand: boolean; detail: string }[];
  helper: HelperReply;
  capabilities: string[];
  reply: string;
  source: 'model' | 'keywords';
}

export interface UnderstandContext {
  text: string;
  selfHouseholdId: number | null;
  careFor: { id: number; name: string }[];
  roster: { id: number; name: string; unit: string }[];
  pendingHelperFor: string | null;
  eventActive: boolean;
}

export type Understand = (ctx: UnderstandContext) => Promise<Understood>;
