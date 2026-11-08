import { copy } from './copy.ts';
import { guardMessage } from './guard.ts';
import type { Store } from './store.ts';
import type { Account, Contact, Db, Household, Inbound, Language, Send, Snapshot, Task, Understand, VoiceHooks } from './types.ts';

const CLOSED = new Set(['done', 'cancelled']);
const IN_PROGRESS = new Set(['asked', 'accepted']);
/** Map units per minute on foot. The seeded map is about 1000 units wide, so this reads as a walkable neighborhood. */
const UNITS_PER_MINUTE = 100;

export interface AgentOptions {
  db: Db;
  store: Store;
  send: Send;
  understand: Understand;
  now?: () => number;
  askTimeoutMs?: number;
  followUpMs?: number;
  ringAfterMs?: number;
  voice?: VoiceHooks;
}

export interface Candidate { contact: Contact; minutes: number }

export class Agent {
  private readonly db: Db;
  private readonly store: Store;
  private readonly sendRaw: Send;
  private readonly understand: Understand;
  private readonly now: () => number;
  private readonly askTimeoutMs: number;
  private readonly followUpMs: number;
  private readonly ringAfterMs: number;
  private readonly voice: VoiceHooks | null;
  private readonly checkinSentAt = new Map<string, number>();
  private snap: Snapshot | null = null;

  constructor(o: AgentOptions) {
    this.db = o.db;
    this.store = o.store;
    this.sendRaw = o.send;
    this.understand = o.understand;
    this.now = o.now ?? Date.now;
    this.askTimeoutMs = o.askTimeoutMs ?? 90_000;
    this.followUpMs = o.followUpMs ?? 240_000;
    this.ringAfterMs = o.ringAfterMs ?? 45_000;
    this.voice = o.voice ?? null;
  }

  // ---------- Reads ----------

  private async fresh(): Promise<Snapshot> {
    this.snap = await this.db.snapshot();
    return this.snap;
  }

  private household = (s: Snapshot, id: number): Household | undefined => s.households.find((h) => h.id === id);
  private account = (s: Snapshot, id: number): Account | undefined => s.accounts.find((a) => a.householdId === id);
  private openTask = (s: Snapshot, id: number): Task | undefined => s.tasks.find((t) => t.householdId === id && !CLOSED.has(t.state));
  private eventActive = (s: Snapshot) => s.disasters.some((d) => d.active);

  private place(s: Snapshot, h: Household) {
    const building = s.buildings.find((b) => b.id === h.buildingId)?.name ?? 'your block';
    return `${building}, unit ${h.unit}`;
  }

  /** The only way a message leaves the agent. Help can only be promised if a neighbor accepted a task for this household. */
  private async say(to: Contact, text: string, key: string, aboutHousehold: number | null) {
    if (to.stopped || !to.spaceId || this.store.wasSent(key)) return;
    const s = this.snap;
    const confirmed = aboutHousehold !== null && !!s && s.tasks.some((t) => t.householdId === aboutHousehold && t.state === 'accepted');
    const guarded = guardMessage(text, confirmed, copy.noPromiseFallback(to.language));
    if (guarded.blocked) console.warn('Blocked an unconfirmed promise of help:', text);
    await this.sendRaw(to, guarded.text, key);
    this.store.markSent(key);
  }

  /** For callers outside the text loop, such as the end of a phone call. Goes through the same guard. */
  async notify(to: Contact, text: string, key: string, aboutHousehold: number | null) {
    await this.fresh();
    await this.say(to, text, key, aboutHousehold);
  }

  // ---------- Inbound ----------

  async handle(m: Inbound): Promise<void> {
    if (!this.store.firstTime(m.id)) return;
    const contact = this.store.contact(m.handle) ?? this.store.upsert({
      handle: m.handle, name: 'there', householdId: null, careFor: [], language: 'en', assignedNumber: null,
    });
    this.store.patch(m.handle, { spaceId: m.spaceId, agentId: m.agentId });
    const replyKey = `reply:${m.id}`;
    if (await this.voice?.answerPending(m.handle, m.text)) return;

    if (/^\s*(stop|unsubscribe|quit|cancel|end|alto)\s*$/i.test(m.text)) {
      await this.sendRaw({ ...contact, spaceId: m.spaceId, agentId: m.agentId }, copy.stopped(contact.language), replyKey);
      this.store.patch(m.handle, { stopped: true });
      return;
    }
    if (contact.stopped) this.store.patch(m.handle, { stopped: false });

    const s = await this.fresh();
    const active = this.eventActive(s);
    const pending = this.pendingTaskFor(s, m.handle);
    const careFor = contact.careFor.flatMap((id) => {
      const h = this.household(s, id);
      return h ? [{ id: h.id, name: h.name }] : [];
    });
    const u = await this.understand({
      text: m.text, selfHouseholdId: contact.householdId, careFor,
      roster: s.households.map((h) => ({ id: h.id, name: h.name, unit: h.unit })),
      pendingHelperFor: pending ? this.household(s, pending.householdId)?.name ?? null : null,
      eventActive: active,
    });
    console.log(`[${u.source}] ${contact.name}: helper=${u.helper} claims=${JSON.stringify(u.claims.map((c) => [c.subjectHouseholdId, c.kind, c.firsthand]))}`);
    if (u.language !== contact.language) this.store.patch(m.handle, { language: u.language });
    const me = this.store.contact(m.handle)!;

    if (pending && u.helper !== 'none') {
      await this.helperReply(s, me, pending, u.helper, replyKey);
      return;
    }

    if (!active) {
      await this.quietDay(me, m.text, u.capabilities, u.reply, replyKey);
      return;
    }

    const valid = u.claims.filter((c) => c.kind !== 'unknown' && this.household(s, c.subjectHouseholdId));
    if (valid.length === 0) {
      await this.say(me, u.reply && u.source === 'model' ? u.reply : copy.notUnderstood(me.language), replyKey, me.householdId);
      return;
    }
    for (const c of valid) {
      const self = c.subjectHouseholdId === me.householdId;
      await this.db.recordClaim({
        householdId: c.subjectHouseholdId, sourceKey: me.sourceKey,
        relation: self ? 'self' : me.careFor.includes(c.subjectHouseholdId) ? 'family' : 'neighbor',
        firsthand: self || c.firsthand, kind: c.kind, detail: c.detail,
      });
    }
    const after = await this.fresh();
    await this.acknowledge(after, me, valid, replyKey);
    const asked = valid.find((c) => c.subjectHouseholdId === me.householdId && c.kind === 'needs_help');
    if (asked && this.voice) {
      const h = this.household(after, asked.subjectHouseholdId)!;
      const prompted = after.checkins.find((c) => c.householdId === h.id)?.promptedAtMicros ?? 0;
      await this.voice.speakFor(me, h, this.place(after, h), m.text, `speak-for-${prompted}-${h.id}`);
    }
  }

  private async quietDay(me: Contact, _text: string, capabilities: string[], reply: string, key: string) {
    if (me.stage === 'new') {
      this.store.patch(me.handle, { stage: 'asked_capabilities' });
      await this.say(me, copy.welcome(me.language, me.name), key, null);
      return;
    }
    if (me.stage === 'asked_capabilities') {
      this.store.patch(me.handle, { stage: 'ready', capabilities });
      await this.say(this.store.contact(me.handle)!, copy.capabilitiesSaved(me.language, capabilities), key, null);
      return;
    }
    if (capabilities.length > 0) this.store.patch(me.handle, { capabilities: [...new Set([...me.capabilities, ...capabilities])] });
    await this.say(me, reply || copy.quietDay(me.language), key, null);
  }

  private async acknowledge(s: Snapshot, me: Contact, claims: { subjectHouseholdId: number; kind: string; detail: string }[], key: string) {
    const first = claims[0]!;
    const h = this.household(s, first.subjectHouseholdId)!;
    const l = me.language;
    const closed = this.account(s, h.id)?.status === 'accounted';
    let text: string;
    if (h.id === me.householdId) {
      const c = s.summary;
      const tally = c ? (l === 'es' ? ` (${c.accounted} de ${c.total} localizados)` : ` (${c.accounted} of ${c.total} accounted for)`) : '';
      text = first.kind === 'needs_help' ? copy.selfHelp(l) : copy.selfSafe(l, tally);
    } else if (first.kind === 'needs_help') text = copy.reportHelp(l, h.name);
    else if (first.kind === 'away') text = copy.reportAway(l, h.name, first.detail);
    else text = copy.reportSafe(l, h.name, closed);
    await this.say(me, text, key, h.id);
  }

  // ---------- Neighbor tasks ----------

  private pendingTaskFor(s: Snapshot, handle: string): Task | undefined {
    return s.tasks.find((t) => IN_PROGRESS.has(t.state) && this.store.assignment(t.id)?.helper === handle);
  }

  private async helperReply(s: Snapshot, helper: Contact, task: Task, reply: string, key: string) {
    const h = this.household(s, task.householdId);
    if (!h) return;
    const a = this.store.assignment(task.id)!;
    const l = helper.language;
    if (reply === 'accept' && task.state === 'asked') {
      const label = this.label(this.minutes(s, helper, h));
      await this.db.updateTask(task.id, 'accepted', label);
      await this.fresh();
      this.store.setAssignment(task.id, { ...a, askedAt: this.now() });
      await this.say(helper, copy.acceptThanks(l, h.name), key, h.id);
      await this.tellHousehold(h, task, 'accepted');
    } else if (reply === 'decline') {
      await this.say(helper, copy.declineThanks(l), key, null);
      await this.askNext(s, task, [...a.declined, helper.handle]);
    } else if (reply === 'found_ok' || reply === 'found_needs_help') {
      const ok = reply === 'found_ok';
      await this.db.recordClaim({ householdId: h.id, sourceKey: helper.sourceKey, relation: 'visit', firsthand: true, kind: ok ? 'safe' : 'needs_help', detail: 'Checked in person.' });
      await this.db.updateTask(task.id, 'done', '');
      await this.fresh();
      await this.say(helper, ok ? copy.foundOkThanks(l, h.name) : copy.foundHelpThanks(l), key, h.id);
      await this.tellHousehold(h, task, ok ? 'found' : 'found_help');
    }
  }

  private async tellHousehold(h: Household, task: Task, what: 'accepted' | 'found' | 'found_help') {
    for (const c of this.store.contacts()) {
      const key = `household-update:${task.id}:${what}:${c.handle}`;
      if (c.householdId === h.id && what === 'accepted') await this.say(c, copy.neighborComing(c.language), key, h.id);
      if (!c.careFor.includes(h.id)) continue;
      const text = what === 'accepted' ? copy.circleCovered(c.language, h.name) : what === 'found' ? copy.circleFound(c.language, h.name) : copy.circleFoundHelp(c.language, h.name);
      await this.say(c, text, key, h.id);
    }
  }

  private minutes(s: Snapshot, helper: Contact, target: Household): number {
    const home = helper.householdId === null ? undefined : this.household(s, helper.householdId);
    if (!home) return Number.POSITIVE_INFINITY;
    return Math.max(1, Math.round(Math.hypot(home.x - target.x, home.y - target.y) / UNITS_PER_MINUTE));
  }

  private label = (minutes: number) => `Neighbor, about ${minutes} min away`;

  /** Nearest person who is safe themselves, has opted in, and isn't already on a task. Useful skills count as a shorter walk. */
  candidates(s: Snapshot, target: Household, declined: string[]): Candidate[] {
    const busy = new Set(s.tasks.filter((t) => IN_PROGRESS.has(t.state)).map((t) => this.store.assignment(t.id)?.helper));
    const needsSkill = (c: Contact) => {
      let bonus = 0;
      const has = (word: string) => c.capabilities.some((x) => x.toLowerCase() === word);
      if (target.medicalDevice !== '' && (has('medical') || has('generator'))) bonus += 3;
      if (target.mobilityLimited && has('medical')) bonus += 1;
      if (target.language !== 'English' && has(target.language.toLowerCase())) bonus += 3;
      return bonus;
    };
    return this.store.contacts()
      .filter((c) => c.spaceId && !c.stopped && c.householdId !== null && c.householdId !== target.id && !c.careFor.includes(target.id))
      .filter((c) => !busy.has(c.handle) && !declined.includes(c.handle))
      .filter((c) => {
        // Never send someone who hasn't been confirmed safe.
        const own = this.account(s, c.householdId!)?.status;
        const eventActive = this.eventActive(s);
        return !eventActive || own === 'accounted';
      })
      .map((contact) => ({ contact, minutes: this.minutes(s, contact, target) }))
      .filter((c) => Number.isFinite(c.minutes))
      .sort((a, b) => a.minutes - needsSkill(a.contact) - (b.minutes - needsSkill(b.contact)));
  }

  private async askNext(s: Snapshot, task: Task, declined: string[]) {
    const h = this.household(s, task.householdId);
    if (!h) return;
    const next = this.candidates(s, h, declined)[0];
    if (!next) {
      await this.db.updateTask(task.id, 'cancelled', 'No neighbor available');
      return;
    }
    const attempt = declined.length;
    this.store.setAssignment(task.id, { helper: next.contact.handle, askedAt: this.now(), declined, followedUp: false });
    await this.db.updateTask(task.id, 'asked', this.label(next.minutes));
    await this.say(next.contact, copy.ask(next.contact.language, next.minutes, this.place(s, h)), `ask:${task.id}:${attempt}:${next.contact.handle}`, null);
  }

  // ---------- The loop that watches the database ----------

  async tick(): Promise<void> {
    const s = await this.fresh();
    for (const c of this.store.contacts()) {
      if (c.householdId === null) continue;
      const h = this.household(s, c.householdId);
      if (h && h.simBehavior !== 'agent') await this.db.linkHousehold(c.householdId);
    }
    if (!this.eventActive(s)) return;
    await this.sendCheckins(s);
    await this.proposeTasks(s);
    await this.driveTasks(s);
  }

  private async sendCheckins(s: Snapshot) {
    const open = s.checkins.filter((c) => c.state === 'pending' || c.state === 'no_response');
    const kind = s.disasters.find((d) => d.active)?.kind ?? 'quake';
    for (const ci of open) {
      const h = this.household(s, ci.householdId);
      if (!h) continue;
      for (const c of this.store.contacts()) {
        if (c.householdId === h.id) {
          const key = `checkin:${ci.promptedAtMicros}:${c.handle}`;
          await this.say(c, copy.checkin(c.language as Language, kind), key, null);
          if (!this.checkinSentAt.has(key)) this.checkinSentAt.set(key, this.now());
          if (this.voice && this.now() - this.checkinSentAt.get(key)! > this.ringAfterMs) {
            await this.voice.ring(c, h, kind, `ring-${ci.promptedAtMicros}-${h.id}`);
          }
        }
        if (c.careFor.includes(h.id)) await this.say(c, copy.circleCheck(c.language as Language, h.name), `circle:${ci.promptedAtMicros}:${h.id}:${c.handle}`, null);
      }
    }
  }

  private async proposeTasks(s: Snapshot) {
    const linked = new Set(this.store.contacts().flatMap((c) => [...(c.householdId === null ? [] : [c.householdId]), ...c.careFor]));
    for (const a of s.accounts) {
      if (!linked.has(a.householdId) || this.openTask(s, a.householdId)) continue;
      const silent = s.checkins.find((c) => c.householdId === a.householdId)?.state === 'no_response';
      const needsSomeone = a.status === 'needs_help' || a.status === 'conflict' || (a.status === 'unaccounted' && silent);
      if (!needsSomeone) continue;
      const h = this.household(s, a.householdId)!;
      const best = this.candidates(s, h, [])[0];
      if (!best) continue;
      const reason = a.status === 'unaccounted' ? 'No answer to the check-in.' : a.note;
      await this.db.proposeTask(h.id, this.label(best.minutes), reason);
    }
  }

  private async driveTasks(s: Snapshot) {
    for (const task of s.tasks) {
      if (CLOSED.has(task.state)) continue;
      const a = this.store.assignment(task.id);
      const h = this.household(s, task.householdId);
      if (!h) continue;

      if (this.account(s, h.id)?.status === 'accounted') {
        await this.db.updateTask(task.id, 'cancelled', '');
        const helper = a && this.store.contact(a.helper);
        if (helper) await this.say(helper, copy.standDown(helper.language, h.name), `stand-down:${task.id}:${helper.handle}`, null);
        continue;
      }
      if (task.state === 'approved') await this.askNext(s, task, []);
      else if (task.state === 'asked' && a && this.now() - a.askedAt > this.askTimeoutMs) await this.askNext(s, task, [...a.declined, a.helper]);
      else if (task.state === 'accepted' && a && !a.followedUp && this.now() - a.askedAt > this.followUpMs) {
        const helper = this.store.contact(a.helper);
        this.store.setAssignment(task.id, { ...a, followedUp: true });
        if (helper) await this.say(helper, copy.followUp(helper.language, h.name), `follow-up:${task.id}:${helper.handle}`, h.id);
      }
    }
  }
}
