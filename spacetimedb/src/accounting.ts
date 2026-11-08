// Decides whether a person is accounted for, from what people have reported about them.
// Pure on purpose: the rule that hearsay cannot close a high-risk person lives here and is tested alone.

export type ClaimKind = 'safe' | 'away' | 'needs_help' | 'unknown';
/** self: the person. visit: an assigned helper who went in person. family/neighbor: someone else. */
export type Relation = 'self' | 'visit' | 'family' | 'neighbor';
export type AccountStatus = 'accounted' | 'reported' | 'needs_help' | 'conflict' | 'unaccounted';

export const CLAIM_KINDS: readonly string[] = ['safe', 'away', 'needs_help', 'unknown'];
export const RELATIONS: readonly string[] = ['self', 'visit', 'family', 'neighbor'];

export interface Claim {
  sourceKey: string;
  relation: Relation;
  firsthand: boolean;
  kind: ClaimKind;
  atMicros: bigint;
}

export interface AccountInput {
  claims: Claim[];
  highRisk: boolean;
  finalState: string;
}

export interface Account {
  status: AccountStatus;
  sources: number;
  note: string;
}

export function isHighRisk(h: { medicalDevice: string; age: number; mobilityLimited: boolean; infant: boolean }): boolean {
  return h.medicalDevice !== '' || h.age >= 70 || h.mobilityLimited || h.infant;
}

/** Each source's most recent claim that says something. A person can correct themselves. */
function latestBySource(claims: Claim[]): Claim[] {
  const latest = new Map<string, Claim>();
  for (const c of claims) {
    if (c.kind === 'unknown') continue;
    const prev = latest.get(c.sourceKey);
    if (!prev || c.atMicros >= prev.atMicros) latest.set(c.sourceKey, c);
  }
  return [...latest.values()];
}

const isOkKind = (k: ClaimKind) => k === 'safe' || k === 'away';
const isDirect = (c: Claim) => c.relation === 'self' || c.relation === 'visit';

export function accountFor({ claims, highRisk, finalState }: AccountInput): Account {
  const current = latestBySource(claims);
  const sources = current.length;

  // A person speaking for themselves, or someone standing in front of them, outranks anything secondhand.
  const direct = current.filter(isDirect).sort((a, b) => (a.atMicros < b.atMicros ? 1 : -1))[0];
  if (direct) {
    if (direct.kind === 'needs_help') return { status: 'needs_help', sources, note: direct.relation === 'self' ? 'Asked for help.' : 'Found in person, needs help.' };
    return { status: 'accounted', sources, note: direct.relation === 'self' ? 'Confirmed by the person.' : 'Confirmed in person.' };
  }

  // The dispatcher's or the sensor pipeline's decision stands when nobody has spoken directly.
  if (finalState === 'found_ok' || finalState === 'assisted') return { status: 'accounted', sources, note: 'Confirmed by dispatch.' };

  const help = current.filter((c) => c.kind === 'needs_help');
  const ok = current.filter((c) => isOkKind(c.kind));
  if (help.length > 0 && ok.length > 0) return { status: 'conflict', sources, note: `${ok.length} say OK, ${help.length} say help. Needs a person to check.` };
  if (help.length > 0 || finalState === 'found_needs_help') return { status: 'needs_help', sources, note: help.length > 0 ? 'Reported as needing help.' : 'Found, needs help.' };

  if (ok.length === 0) return { status: 'unaccounted', sources, note: 'No word yet.' };

  const witnesses = ok.filter((c) => c.firsthand).length;
  const enough = highRisk ? witnesses >= 2 : witnesses >= 1;
  if (enough) return { status: 'accounted', sources, note: `Seen by ${witnesses} ${witnesses === 1 ? 'person' : 'people'}.` };
  return { status: 'reported', sources, note: highRisk ? 'Reported OK, unconfirmed. High-risk: needs direct contact.' : 'Reported OK, unconfirmed.' };
}
