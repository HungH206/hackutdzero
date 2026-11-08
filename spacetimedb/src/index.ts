// Headcount SpacetimeDB module.
//
// All live state lives here, and the Headcount Priority Index is computed
// only in recompute_hpi (see src/hpi.ts and README.md). Clients subscribe to
// the public tables and never score anything themselves.
//
// Time: every timestamp is "scenario time" in microseconds, which is the real
// clock plus a demo fast-forward offset kept in the `clock` table.

import { ScheduleAt, SenderError, schema, t, table, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import * as H from './hpi';
import { BUILDINGS, seedHouseholds } from './seed';

// ---------- Tables ----------

const clock = table({ public: true }, {
  id: t.u8().primaryKey(),
  offsetMicros: t.i64(),
});

const building = table({ public: true }, {
  id: t.u32().primaryKey(),
  name: t.string(),
  kind: t.string(),
  x: t.f64(),
  y: t.f64(),
  w: t.f64(),
  h: t.f64(),
  floors: t.u32(),
  builtYear: t.u32(),
  risk: t.f64(),
});

const household = table({ public: true }, {
  id: t.u32().primaryKey(),
  buildingId: t.u32().index(),
  floor: t.u32(),
  unit: t.string(),
  name: t.string(),
  x: t.f64(),
  y: t.f64(),
  age: t.u32(),
  medicalDevice: t.string(),
  backupRuntimeMin: t.u32(),
  mobilityLimited: t.bool(),
  livesAlone: t.bool(),
  language: t.string(),
  infant: t.bool(),
  hasSensor: t.bool(),
  hero: t.string(),
  /** unresolved | found_ok | found_needs_help | assisted */
  finalState: t.string(),
  finalAtMicros: t.u64(),
  finalNote: t.string(),
  simulated: t.bool(),
  simBehavior: t.string(),
  simDelayMin: t.f64(),
  simContact: t.string(),
  simKnock: t.string(),
});

const node = table({ public: true }, {
  householdId: t.u32().primaryKey(),
  online: t.bool(),
  lastSignalMicros: t.u64(),
  /** Heartbeat stopped at the moment of shaking or fire. */
  abrupt: t.bool(),
  onBattery: t.bool(),
  powerLostAtMicros: t.u64(),
  flame: t.bool(),
  tempRiseC: t.f64(),
  lastMotionMicros: t.u64(),
  shakePeakG: t.f64(),
  shakeDurationS: t.f64(),
  shakeAtMicros: t.u64(),
  shakeConfirmed: t.bool(),
});

const readingEvent = table({ name: 'reading_event', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  householdId: t.u32().index(),
  kind: t.string(),
  value: t.f64(),
  durationS: t.f64(),
  atMicros: t.u64(),
});

const disaster = table({ public: true }, {
  id: t.u32().primaryKey().autoInc(),
  kind: t.string(),
  x: t.f64(),
  y: t.f64(),
  radius: t.f64(),
  buildingId: t.u32(),
  confirmedAtMicros: t.u64(),
  active: t.bool(),
});

const checkin = table({ public: true }, {
  householdId: t.u32().primaryKey(),
  /** none | pending | no_response | ok | help */
  state: t.string(),
  promptedAtMicros: t.u64(),
  answeredAtMicros: t.u64(),
  source: t.string(),
});

const escalation = table({ public: true }, {
  householdId: t.u32().primaryKey(),
  /** 0 = not started, 1 check-in, 2 emergency contact, 3 neighbor knock, 4 responder dispatch */
  step: t.u8(),
  stepAtMicros: t.u64(),
  nextAtMicros: t.u64(),
  done: t.bool(),
});

const priority = table({ public: true }, {
  householdId: t.u32().primaryKey(),
  scored: t.bool(),
  hpi: t.f64(),
  band: t.string(),
  /** 1 = most urgent. 0 = not in the queue (resolved or unknown). */
  rank: t.u32(),
  E: t.f64(),
  S: t.f64(),
  C: t.f64(),
  V: t.f64(),
  K: t.f64(),
  L: t.f64(),
  M: t.f64(),
  A: t.f64(),
  override: t.f64(),
  minutesSilent: t.f64(),
  /** Minutes of backup power left, or -1 when the power-loss clock does not apply. */
  tthMin: t.f64(),
  commsOutage: t.bool(),
  reason: t.string(),
  updatedAtMicros: t.u64(),
});

const overrideLog = table({ name: 'override_log', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  householdId: t.u32(),
  delta: t.f64(),
  reason: t.string(),
  by: t.string(),
  atMicros: t.u64(),
});

const timeline = table({ public: true }, {
  id: t.u64().primaryKey().autoInc(),
  atMicros: t.u64(),
  kind: t.string(),
  /** info | warn | critical | good */
  severity: t.string(),
  householdId: t.u32(),
  message: t.string(),
});

const tickSchedule = table({ name: 'tick_schedule' }, {
  scheduledId: t.u64().primaryKey().autoInc(),
  scheduledAt: t.scheduleAt(),
});

const spacetimedb = schema({
  clock,
  building,
  household,
  node,
  readingEvent,
  disaster,
  checkin,
  escalation,
  priority,
  overrideLog,
  timeline,
  tickSchedule,
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type Household = ReturnType<Ctx['db']['household']['insert']>;
type Node = ReturnType<Ctx['db']['node']['insert']>;

// ---------- Constants ----------

const MIN = 60_000_000n;
const TICK_MICROS = 5_000_000n;
const HEARTBEAT_GRACE_MIN = 0.5;
const SUSTAINED_SHAKE_S = 3;
const CONFIRM_WINDOW_MICROS = 10_000_000n;
const CONFIRM_RADIUS = 260;
const CHECKIN_WINDOW_MIN = 3;
const DISPATCH_MIN = 10;
const MOTION_WINDOW_MIN = 5;
const OUTAGE_RADIUS = 220;
const OUTAGE_SHARE = 0.6;
const FLAME_CONFIRM_TEMP_C = 5;
const FINAL = { unresolved: 'unresolved', ok: 'found_ok', help: 'found_needs_help', assisted: 'assisted' } as const;

// ---------- Helpers ----------

function now(ctx: Ctx): bigint {
  const c = ctx.db.clock.id.find(0);
  return ctx.timestamp.microsSinceUnixEpoch + (c ? c.offsetMicros : 0n);
}
const minutesBetween = (later: bigint, earlier: bigint) => Number(later - earlier) / 60_000_000;
const micros = (minutes: number) => BigInt(Math.round(minutes * 60_000_000));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function log(ctx: Ctx, kind: string, severity: string, householdId: number, message: string) {
  ctx.db.timeline.insert({ id: 0n, atMicros: now(ctx), kind, severity, householdId, message });
}

function activeDisasters(ctx: Ctx) {
  return [...ctx.db.disaster.iter()].filter((d) => d.active);
}

const isResolved = (h: Household) => h.finalState === FINAL.ok || h.finalState === FINAL.assisted;

function setFinal(ctx: Ctx, h: Household, state: string, note: string) {
  if (h.finalState === state) return;
  const at = now(ctx);
  ctx.db.household.id.update({ ...h, finalState: state, finalAtMicros: at, finalNote: note });
  const sev = state === FINAL.help ? 'critical' : state === FINAL.unresolved ? 'warn' : 'good';
  const label = { found_ok: 'Found, OK', found_needs_help: 'Found, needs help', assisted: 'Assisted', unresolved: 'Unresolved' }[state] ?? state;
  log(ctx, 'final_state', sev, h.id, `${h.name} (${h.unit}): ${label}. ${note}`);
  const esc = ctx.db.escalation.householdId.find(h.id);
  if (esc && (state === FINAL.ok || state === FINAL.assisted)) {
    ctx.db.escalation.householdId.update({ ...esc, done: true });
  }
}

function enterStep(ctx: Ctx, h: Household, step: number) {
  const esc = ctx.db.escalation.householdId.find(h.id);
  if (!esc) return;
  const at = now(ctx);
  ctx.db.escalation.householdId.update({ ...esc, step, stepAtMicros: at, nextAtMicros: at, done: false });
  const who = `${h.name} (${h.unit})`;
  if (step === 2) log(ctx, 'ladder', 'warn', h.id, `Step 2: notifying ${who}'s emergency contact (simulated text and call).`);
  if (step === 3) log(ctx, 'ladder', 'warn', h.id, `Step 3: asking a nearby volunteer to knock on ${who}'s door (simulated).`);
  if (step === 4) log(ctx, 'dispatch', 'critical', h.id, `Step 4: responder dispatched to ${who}. Hand-off packet sent to the SIMULATED 911 feed.`);
}

/** Send "Are you OK?" to every sensored, unresolved household in the affected area. */
function startCheckins(ctx: Ctx, affected: Household[], why: string) {
  const at = now(ctx);
  let n = 0;
  for (const h of affected) {
    if (!h.hasSensor || isResolved(h)) continue;
    const ci = ctx.db.checkin.householdId.find(h.id);
    if (ci && (ci.state === 'pending' || ci.state === 'no_response' || ci.state === 'help')) continue;
    if (ci) ctx.db.checkin.householdId.update({ ...ci, state: 'pending', promptedAtMicros: at, answeredAtMicros: 0n, source: '' });
    if (h.finalState !== FINAL.help) ctx.db.household.id.update({ ...h, finalState: FINAL.unresolved, finalAtMicros: 0n, finalNote: '' });
    const esc = ctx.db.escalation.householdId.find(h.id);
    if (esc) ctx.db.escalation.householdId.update({ ...esc, step: 1, stepAtMicros: at, nextAtMicros: at, done: false });
    n++;
  }
  if (n > 0) log(ctx, 'checkin', 'info', 0, `Step 1: "Are you OK?" sent to ${n} households (${why}).`);
}

function answerCheckin(ctx: Ctx, householdId: number, answer: 'ok' | 'help', source: string) {
  const h = ctx.db.household.id.find(householdId);
  const ci = ctx.db.checkin.householdId.find(householdId);
  const n = ctx.db.node.householdId.find(householdId);
  if (!h || !ci) throw new SenderError(`Unknown household ${householdId}`);
  // First answer wins: a second device answering the same prompt is ignored.
  if (ci.state === 'ok' || ci.state === 'help') {
    if (ci.state === answer) return;
    if (ci.state === 'help' && answer === 'ok') return;
  }
  const at = now(ctx);
  ctx.db.checkin.householdId.update({ ...ci, state: answer, answeredAtMicros: at, source });
  if (n) ctx.db.node.householdId.update({ ...n, lastSignalMicros: at });
  if (answer === 'ok') {
    log(ctx, 'checkin', 'good', h.id, `${h.name} (${h.unit}) answered "I'm OK" from the ${source}.`);
    setFinal(ctx, h, FINAL.ok, `Answered OK (${source}).`);
  } else {
    log(ctx, 'checkin', 'critical', h.id, `${h.name} (${h.unit}) pressed "I need help" on the ${source}.`);
    setFinal(ctx, h, FINAL.help, `Pressed I need help (${source}).`);
    enterStep(ctx, ctx.db.household.id.find(h.id)!, 4);
  }
}

// ---------- recompute_hpi: the only place HPI is computed ----------

function recompute(ctx: Ctx) {
  const at = now(ctx);
  const households = [...ctx.db.household.iter()];
  const nodes = new Map<number, Node>();
  for (const n of ctx.db.node.iter()) nodes.set(n.householdId, n);
  const buildings = new Map<number, { risk: number }>();
  for (const b of ctx.db.building.iter()) buildings.set(b.id, b);
  const firstEvent = activeDisasters(ctx).reduce<bigint>((m, d) => (m === 0n || d.confirmedAtMicros < m ? d.confirmedAtMicros : m), 0n);

  const flameUnits = households.filter((h) => nodes.get(h.id)?.flame && (nodes.get(h.id)?.tempRiseC ?? 0) >= FLAME_CONFIRM_TEMP_C);
  const results: { id: number; hpi: number; queued: boolean }[] = [];

  for (const h of households) {
    const n = nodes.get(h.id);
    const prev = ctx.db.priority.householdId.find(h.id);
    const override = prev?.override ?? 0;
    if (!h.hasSensor || !n) {
      // Override rule 3: no sensor means "unknown", never "safe", and is not scored.
      const row = {
        householdId: h.id, scored: false, hpi: 0, band: 'unknown', rank: 0, E: 0, S: 0, C: 0, V: 0, K: 1, L: 0, M: 0, A: 0,
        override, minutesSilent: 0, tthMin: -1, commsOutage: false, reason: 'No sensor here: status unknown, not safe.', updatedAtMicros: at,
      };
      if (prev) ctx.db.priority.householdId.update(row);
      else ctx.db.priority.insert(row);
      continue;
    }

    const flame = flameUnits.some((f) => f.id === h.id);
    const neighborFire = !flame && flameUnits.some((f) => f.buildingId === h.buildingId && Math.abs(f.floor - h.floor) <= 1);
    const I = H.shakingIntensity(n.shakePeakG, n.shakeDurationS, n.shakeConfirmed);
    const E = H.exposure({ shaking: I, buildingRisk: buildings.get(h.buildingId)?.risk ?? 0.5, flame, tempRiseC: n.tempRiseC, neighborFire });

    const minutesSilent = n.online ? 0 : Math.max(0, minutesBetween(at, n.lastSignalMicros) - HEARTBEAT_GRACE_MIN);
    const recentMotion = n.lastMotionMicros > 0n && minutesBetween(at, n.lastMotionMicros) <= MOTION_WINDOW_MIN;
    // Lambda: the whole area went quiet together with no shaking here.
    let commsOutage = false;
    if (!n.online && I === 0) {
      const near = households.filter((o) => o.hasSensor && dist(o, h) <= OUTAGE_RADIUS);
      const quiet = near.filter((o) => !nodes.get(o.id)?.online).length;
      commsOutage = near.length >= 3 && quiet / near.length >= OUTAGE_SHARE;
    }
    const S = H.silence({ minutesSilent, abrupt: n.abrupt, recentMotion, commsOutage });

    const ci = ctx.db.checkin.householdId.find(h.id);
    const ciState = (ci?.state ?? 'none') as H.CheckinState;
    const C = ciState === 'none' ? 0 : H.CHECKIN_C[ciState];

    const V = H.vulnerability({
      poweredMedical: h.medicalDevice !== '', age: h.age, mobilityLimited: h.mobilityLimited, livesAlone: h.livesAlone,
      languageBarrier: h.language !== 'English', infant: h.infant,
    });
    const clockIn = {
      poweredMedical: h.medicalDevice !== '',
      minutesSincePowerLoss: n.onBattery && n.powerLostAtMicros > 0n ? minutesBetween(at, n.powerLostAtMicros) : null,
      backupRuntimeMin: h.backupRuntimeMin,
      flame,
    };
    const K = H.clockK(clockIn);
    const tth = H.timeToHarm(clockIn);
    const waitingSince = ci && ci.promptedAtMicros > 0n ? ci.promptedAtMicros : firstEvent;
    const A = !isResolved(h) && waitingSince > 0n ? H.aging(minutesBetween(at, waitingSince)) : 0;

    const { hpi, L, M } = H.score({ E, S, C, V, K, A, override, flame });
    const reason = H.reason({
      age: h.age, medicalDevice: h.medicalDevice, mobilityLimited: h.mobilityLimited, livesAlone: h.livesAlone,
      languageBarrier: h.language !== 'English', language: h.language, infant: h.infant, shaking: I, flame, neighborFire,
      tempRiseC: n.tempRiseC, checkin: ciState, minutesSilent: n.online ? null : minutesSilent, recentMotion, commsOutage, tth, override,
    });
    const row = {
      householdId: h.id, scored: true, hpi, band: H.band(hpi), rank: 0, E, S, C, V, K, L, M, A, override,
      minutesSilent, tthMin: tth ?? -1, commsOutage, reason, updatedAtMicros: at,
    };
    if (prev) ctx.db.priority.householdId.update({ ...row, rank: prev.rank });
    else ctx.db.priority.insert(row);
    // Override rule 2: resolved households leave the queue.
    results.push({ id: h.id, hpi, queued: !isResolved(h) });
  }

  const queue = results.filter((r) => r.queued).sort((a, b) => b.hpi - a.hpi || a.id - b.id);
  const rankOf = new Map(queue.map((r, i) => [r.id, i + 1]));
  for (const r of results) {
    const p = ctx.db.priority.householdId.find(r.id)!;
    const rank = rankOf.get(r.id) ?? 0;
    if (p.rank !== rank) ctx.db.priority.householdId.update({ ...p, rank });
  }

  // Keep the displayed "next step at" time in sync with the current score.
  for (const esc of ctx.db.escalation.iter()) {
    if (esc.step === 0 || esc.done) continue;
    const p = ctx.db.priority.householdId.find(esc.householdId);
    const wait = esc.step === 4 ? DISPATCH_MIN : H.ladderWaitMinutes(p?.hpi ?? 0);
    const nextAt = esc.stepAtMicros + micros(wait);
    if (nextAt !== esc.nextAtMicros) ctx.db.escalation.householdId.update({ ...esc, nextAtMicros: nextAt });
  }
}

// ---------- Escalation ladder, check-in windows, simulated residents ----------

function advance(ctx: Ctx) {
  const at = now(ctx);

  for (const ci of ctx.db.checkin.iter()) {
    if (ci.state === 'pending' && minutesBetween(at, ci.promptedAtMicros) >= CHECKIN_WINDOW_MIN) {
      ctx.db.checkin.householdId.update({ ...ci, state: 'no_response' });
      const h = ctx.db.household.id.find(ci.householdId);
      if (h) log(ctx, 'checkin', 'warn', h.id, `No answer from ${h.name} (${h.unit}) after ${CHECKIN_WINDOW_MIN} min.`);
    }
  }

  // Simulated residents answer like a real person pressing a button.
  for (const h of ctx.db.household.iter()) {
    if (!h.simulated || !h.hasSensor) continue;
    const ci = ctx.db.checkin.householdId.find(h.id);
    const n = ctx.db.node.householdId.find(h.id);
    if (!ci || !n || !n.online) continue;
    if (ci.state !== 'pending' && ci.state !== 'no_response') continue;
    if (minutesBetween(at, ci.promptedAtMicros) < h.simDelayMin) continue;
    if (h.simBehavior === 'ok' || h.simBehavior === 'late_ok') answerCheckin(ctx, h.id, 'ok', 'wall screen');
    else if (h.simBehavior === 'help') answerCheckin(ctx, h.id, 'help', 'wall screen');
  }

  recompute(ctx);

  for (const esc of [...ctx.db.escalation.iter()]) {
    if (esc.step === 0 || esc.done || esc.nextAtMicros > at) continue;
    const h = ctx.db.household.id.find(esc.householdId);
    if (!h || isResolved(h)) continue;
    const p = ctx.db.priority.householdId.find(h.id);
    const hpi = p?.hpi ?? 0;
    if (esc.step === 1) {
      enterStep(ctx, h, hpi >= H.SKIP_TO_DISPATCH_HPI ? 4 : 2);
    } else if (esc.step === 2) {
      if (h.simulated && h.simContact === 'reaches_ok') setFinal(ctx, h, FINAL.ok, 'Emergency contact confirmed they are OK (simulated).');
      else enterStep(ctx, h, 3);
    } else if (esc.step === 3) {
      if (h.simulated && h.simKnock === 'found_ok') setFinal(ctx, h, FINAL.ok, 'Volunteer knocked and found them OK (simulated).');
      else {
        if (h.simulated && h.simKnock === 'found_needs_help') setFinal(ctx, h, FINAL.help, 'Volunteer found them and they need help (simulated).');
        enterStep(ctx, ctx.db.household.id.find(h.id)!, 4);
      }
    } else if (esc.step === 4) {
      if (h.simulated) setFinal(ctx, h, FINAL.assisted, 'Responders arrived and assisted (simulated).');
      else ctx.db.escalation.householdId.update({ ...esc, done: true });
    }
  }

  recompute(ctx);
}

// ---------- Sensor events (real and simulated nodes use the same path) ----------

function reportEvent(ctx: Ctx, householdId: number, kind: string, value: number, durationS: number) {
  const h = ctx.db.household.id.find(householdId);
  const n = ctx.db.node.householdId.find(householdId);
  if (!h || !n) throw new SenderError(`Unknown household ${householdId}`);
  const at = now(ctx);
  ctx.db.readingEvent.insert({ id: 0n, householdId, kind, value, durationS, atMicros: at });
  let node = { ...n, lastSignalMicros: n.online ? at : n.lastSignalMicros };

  if (kind === 'shake') {
    if (durationS < SUSTAINED_SHAKE_S) {
      ctx.db.node.householdId.update(node);
      log(ctx, 'false_alarm', 'info', h.id, `Short ${durationS.toFixed(1)} s spike at ${h.name} (${h.unit}) ignored.`);
      return;
    }
    node = { ...node, shakePeakG: Math.max(node.shakePeakG, value), shakeDurationS: Math.max(node.shakeDurationS, durationS), shakeAtMicros: at };
    ctx.db.node.householdId.update(node);
    confirmShaking(ctx, h);
  } else if (kind === 'flame' || kind === 'temp') {
    if (kind === 'flame') node.flame = value > 0;
    else node.tempRiseC = value;
    ctx.db.node.householdId.update(node);
    if (node.flame && node.tempRiseC >= FLAME_CONFIRM_TEMP_C) confirmFire(ctx, h);
  } else if (kind === 'motion') {
    ctx.db.node.householdId.update({ ...node, lastMotionMicros: at });
  } else if (kind === 'power_lost') {
    ctx.db.node.householdId.update({ ...node, onBattery: true, powerLostAtMicros: node.powerLostAtMicros || at });
  } else if (kind === 'power_restored') {
    ctx.db.node.householdId.update({ ...node, onBattery: false, powerLostAtMicros: 0n });
  } else {
    throw new SenderError(`Unknown event kind ${kind}`);
  }
}

/** False-alarm filter: shaking counts only when 2+ nearby nodes agree within ~10 s. */
function confirmShaking(ctx: Ctx, h: Household) {
  const n = ctx.db.node.householdId.find(h.id)!;
  const agreeing = [...ctx.db.household.iter()].filter((o) => {
    const on = ctx.db.node.householdId.find(o.id);
    if (!on || on.shakeDurationS < SUSTAINED_SHAKE_S || on.shakeAtMicros === 0n) return false;
    const dt = on.shakeAtMicros > n.shakeAtMicros ? on.shakeAtMicros - n.shakeAtMicros : n.shakeAtMicros - on.shakeAtMicros;
    return dt <= CONFIRM_WINDOW_MICROS && dist(o, h) <= CONFIRM_RADIUS;
  });
  if (agreeing.length < 2) return;
  for (const o of agreeing) {
    const on = ctx.db.node.householdId.find(o.id)!;
    if (!on.shakeConfirmed) ctx.db.node.householdId.update({ ...on, shakeConfirmed: true });
  }
  let quake = activeDisasters(ctx).find((d) => d.kind === 'quake');
  if (!quake) {
    quake = ctx.db.disaster.insert({ id: 0, kind: 'quake', x: h.x, y: h.y, radius: 0, buildingId: 0, confirmedAtMicros: now(ctx), active: true });
    log(ctx, 'disaster', 'critical', 0, `Earthquake CONFIRMED: ${agreeing.length} nearby nodes agree on sustained shaking.`);
  }
  startCheckins(ctx, agreeing.map((o) => ctx.db.household.id.find(o.id)!), 'shaking confirmed');
}

function confirmFire(ctx: Ctx, h: Household) {
  const existing = activeDisasters(ctx).find((d) => d.kind === 'fire' && d.buildingId === h.buildingId);
  if (!existing) {
    ctx.db.disaster.insert({ id: 0, kind: 'fire', x: h.x, y: h.y, radius: 0, buildingId: h.buildingId, confirmedAtMicros: now(ctx), active: true });
    log(ctx, 'disaster', 'critical', h.id, `FIRE confirmed in ${h.unit} (${h.name}): flame sensor plus temperature rise.`);
  }
  startCheckins(ctx, [...ctx.db.household.buildingId.filter(h.buildingId)], 'fire in the building');
}

// ---------- Seeding ----------

function seed(ctx: Ctx) {
  for (const b of BUILDINGS) ctx.db.building.insert(b);
  const at = now(ctx);
  for (const s of seedHouseholds()) {
    const { simBehavior, simDelayMin, simContact, simKnock, ...profile } = s;
    ctx.db.household.insert({
      ...profile, finalState: FINAL.unresolved, finalAtMicros: 0n, finalNote: '', simulated: true, simBehavior, simDelayMin, simContact, simKnock,
    });
    if (s.hasSensor) {
      ctx.db.node.insert({
        householdId: s.id, online: true, lastSignalMicros: at, abrupt: false, onBattery: false, powerLostAtMicros: 0n, flame: false,
        tempRiseC: 0, lastMotionMicros: 0n, shakePeakG: 0, shakeDurationS: 0, shakeAtMicros: 0n, shakeConfirmed: false,
      });
      ctx.db.checkin.insert({ householdId: s.id, state: 'none', promptedAtMicros: 0n, answeredAtMicros: 0n, source: '' });
      ctx.db.escalation.insert({ householdId: s.id, step: 0, stepAtMicros: 0n, nextAtMicros: 0n, done: false });
    }
  }
  log(ctx, 'system', 'info', 0, 'Simulation ready: synthetic households in Cedar Hollow (fictional). All clear.');
  recompute(ctx);
}

function clearAll(ctx: Ctx) {
  ctx.db.building.clear();
  ctx.db.household.clear();
  ctx.db.node.clear();
  ctx.db.readingEvent.clear();
  ctx.db.disaster.clear();
  ctx.db.checkin.clear();
  ctx.db.escalation.clear();
  ctx.db.priority.clear();
  ctx.db.overrideLog.clear();
  ctx.db.timeline.clear();
}

// ---------- Lifecycle and tick ----------

export const init = spacetimedb.init((ctx) => {
  ctx.db.clock.insert({ id: 0, offsetMicros: 0n });
  ctx.db.tickSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS) });
  seed(ctx);
});

export const tick = spacetimedb.reducer({ onSchedule: tickSchedule }, { arg: tickSchedule.rowType }, (ctx) => {
  // Simulated nodes heartbeat while they are online. Real nodes call `heartbeat`.
  const at = now(ctx);
  for (const h of ctx.db.household.iter()) {
    if (!h.simulated) continue;
    const n = ctx.db.node.householdId.find(h.id);
    if (n && n.online) ctx.db.node.householdId.update({ ...n, lastSignalMicros: at });
  }
  advance(ctx);
});

// ---------- Node reducers (real hardware and the simulator) ----------

/** Claim a household for a real hardware node. Simulated behavior turns off for it. */
export const register_node = spacetimedb.reducer({ householdId: t.u32() }, (ctx, { householdId }) => {
  const h = ctx.db.household.id.find(householdId);
  if (!h || !h.hasSensor) throw new SenderError(`Unknown or unsensored household ${householdId}`);
  ctx.db.household.id.update({ ...h, simulated: false });
  const n = ctx.db.node.householdId.find(householdId)!;
  ctx.db.node.householdId.update({ ...n, online: true, lastSignalMicros: now(ctx), abrupt: false });
  log(ctx, 'system', 'info', h.id, `Hardware node registered for ${h.name} (${h.unit}).`);
  recompute(ctx);
});

export const heartbeat = spacetimedb.reducer({ householdId: t.u32(), onBattery: t.bool() }, (ctx, { householdId, onBattery }) => {
  const n = ctx.db.node.householdId.find(householdId);
  if (!n) throw new SenderError(`Unknown household ${householdId}`);
  const at = now(ctx);
  ctx.db.node.householdId.update({ ...n, online: true, abrupt: false, lastSignalMicros: at });
  if (onBattery && !n.onBattery) reportEvent(ctx, householdId, 'power_lost', 1, 0);
  if (!onBattery && n.onBattery) reportEvent(ctx, householdId, 'power_restored', 0, 0);
});

/** kind: shake (value = peak g) | flame (1/0) | temp (rise in C) | motion | power_lost | power_restored */
export const report_event = spacetimedb.reducer(
  { householdId: t.u32(), kind: t.string(), value: t.f64(), durationS: t.f64() },
  (ctx, { householdId, kind, value, durationS }) => {
    reportEvent(ctx, householdId, kind, value, durationS);
    recompute(ctx);
  },
);

/** answer: ok | help. source: wall screen | phone | dispatcher */
export const submit_checkin = spacetimedb.reducer(
  { householdId: t.u32(), answer: t.string(), source: t.string() },
  (ctx, { householdId, answer, source }) => {
    if (answer !== 'ok' && answer !== 'help') throw new SenderError('answer must be ok or help');
    answerCheckin(ctx, householdId, answer, source || 'phone');
    recompute(ctx);
  },
);

export const recompute_hpi = spacetimedb.reducer((ctx) => recompute(ctx));

// ---------- Dispatcher reducers ----------

export const override_priority = spacetimedb.reducer(
  { householdId: t.u32(), delta: t.f64(), reason: t.string() },
  (ctx, { householdId, delta, reason }) => {
    if (!reason.trim()) throw new SenderError('An override needs a reason.');
    if (delta < -30 || delta > 30) throw new SenderError('Override must be between -30 and +30.');
    const p = ctx.db.priority.householdId.find(householdId);
    const h = ctx.db.household.id.find(householdId);
    if (!p || !h) throw new SenderError(`Unknown household ${householdId}`);
    ctx.db.priority.householdId.update({ ...p, override: delta });
    ctx.db.overrideLog.insert({ id: 0n, householdId, delta, reason: reason.trim(), by: ctx.sender.toHexString().slice(0, 12), atMicros: now(ctx) });
    log(ctx, 'override', 'warn', h.id, `Dispatcher override ${delta > 0 ? '+' : ''}${delta} on ${h.name} (${h.unit}): ${reason.trim()}`);
    recompute(ctx);
  },
);

export const set_final_state = spacetimedb.reducer(
  { householdId: t.u32(), state: t.string(), note: t.string() },
  (ctx, { householdId, state, note }) => {
    if (!Object.values(FINAL).includes(state as never)) throw new SenderError(`Bad state ${state}`);
    const h = ctx.db.household.id.find(householdId);
    if (!h) throw new SenderError(`Unknown household ${householdId}`);
    setFinal(ctx, h, state, note.trim() || 'Set by dispatcher.');
    recompute(ctx);
  },
);

// ---------- Demo-only simulation reducers (sim_*) ----------

export const sim_quake = spacetimedb.reducer({ x: t.f64(), y: t.f64(), magnitude: t.f64() }, (ctx, { x, y, magnitude }) => {
  log(ctx, 'sim', 'info', 0, `SIMULATION: earthquake triggered (strength ${magnitude.toFixed(1)}).`);
  for (const h of [...ctx.db.household.iter()]) {
    if (!h.hasSensor || !h.simulated) continue;
    const d = dist(h, { x, y });
    const peak = magnitude * Math.exp(-d / 450);
    const duration = 28 * Math.exp(-d / 700);
    if (peak < 0.05) continue;
    reportEvent(ctx, h.id, 'shake', peak, duration);
  }
  // Residents who will not answer: some nodes die at the moment of shaking.
  const at = now(ctx);
  for (const h of ctx.db.household.iter()) {
    if (!h.simulated || h.simBehavior !== 'silent') continue;
    const n = ctx.db.node.householdId.find(h.id);
    if (n?.online && n.shakeConfirmed) ctx.db.node.householdId.update({ ...n, online: false, abrupt: true, lastSignalMicros: at });
  }
  // Mr. Tran's node keeps seeing movement, but nobody presses a button.
  for (const h of ctx.db.household.iter()) {
    if (h.simulated && h.simBehavior === 'no_answer') reportEvent(ctx, h.id, 'motion', 1, 0);
  }
  recompute(ctx);
});

export const sim_fire = spacetimedb.reducer({ householdId: t.u32() }, (ctx, { householdId }) => {
  const h = ctx.db.household.id.find(householdId);
  if (!h) throw new SenderError(`Unknown household ${householdId}`);
  log(ctx, 'sim', 'info', h.id, `SIMULATION: fire started in ${h.unit}.`);
  reportEvent(ctx, householdId, 'temp', 24, 0);
  reportEvent(ctx, householdId, 'flame', 1, 0);
  for (const o of ctx.db.household.buildingId.filter(h.buildingId)) {
    const n = ctx.db.node.householdId.find(o.id);
    if (o.id !== h.id && n && Math.abs(o.floor - h.floor) <= 1) ctx.db.node.householdId.update({ ...n, tempRiseC: Math.max(n.tempRiseC, 8) });
  }
  recompute(ctx);
});

export const sim_power_loss = spacetimedb.reducer({ x: t.f64(), y: t.f64(), radius: t.f64() }, (ctx, { x, y, radius }) => {
  let n = 0;
  for (const h of [...ctx.db.household.iter()]) {
    if (!h.hasSensor || !h.simulated || dist(h, { x, y }) > radius) continue;
    reportEvent(ctx, h.id, 'power_lost', 1, 0);
    n++;
  }
  log(ctx, 'power', 'warn', 0, `SIMULATION: mains power lost for ${n} homes. Nodes are on battery.`);
  recompute(ctx);
});

export const sim_comms_outage = spacetimedb.reducer({ x: t.f64(), y: t.f64(), radius: t.f64() }, (ctx, { x, y, radius }) => {
  const at = now(ctx);
  let n = 0;
  for (const h of ctx.db.household.iter()) {
    const node = ctx.db.node.householdId.find(h.id);
    if (!node || !h.simulated || dist(h, { x, y }) > radius) continue;
    ctx.db.node.householdId.update({ ...node, online: false, abrupt: false, lastSignalMicros: at });
    n++;
  }
  log(ctx, 'sim', 'warn', 0, `SIMULATION: cell/Wi-Fi outage. ${n} nodes went quiet together.`);
  recompute(ctx);
});

export const sim_fast_forward = spacetimedb.reducer({ minutes: t.f64() }, (ctx, { minutes }) => {
  if (minutes <= 0 || minutes > 240) throw new SenderError('minutes must be in (0, 240]');
  // Step one minute at a time so the ladder and simulated residents play out in order.
  for (let i = 0; i < Math.ceil(minutes); i++) {
    const c = ctx.db.clock.id.find(0)!;
    const step = Math.min(1, minutes - i);
    ctx.db.clock.id.update({ ...c, offsetMicros: c.offsetMicros + micros(step) });
    const at = now(ctx);
    for (const h of ctx.db.household.iter()) {
      const n = ctx.db.node.householdId.find(h.id);
      if (h.simulated && n?.online) ctx.db.node.householdId.update({ ...n, lastSignalMicros: at });
    }
    advance(ctx);
  }
  log(ctx, 'sim', 'info', 0, `SIMULATION: fast-forwarded ${minutes} min.`);
});

export const sim_reset = spacetimedb.reducer((ctx) => {
  clearAll(ctx);
  const c = ctx.db.clock.id.find(0);
  if (c) ctx.db.clock.id.update({ ...c, offsetMicros: 0n });
  seed(ctx);
});
