import { ConnectionId, Timestamp } from 'spacetimedb';
import { TestAuth, TestClock, createModuleTestHarness } from 'spacetimedb/server/test-utils';
import spacetimedb, * as mod from '../src/index';
import { micros } from './time';

export const START = new Date('2026-11-08T09:00:00Z');

/**
 * A fresh in-memory module with a fixed clock. `internal` is the scheduler / local bridge
 * (always allowed). `as(name)` is an ordinary client with its own identity, like a browser tab.
 */
export function setup(initAs?: string) {
  const clock = new TestClock(Timestamp.fromDate(START));
  const h = createModuleTestHarness(spacetimedb, mod, { clock });
  const internal = TestAuth.internal();
  const clients = new Map<string, ReturnType<typeof TestAuth.fromJwtPayload>>();
  const as = (name: string) => {
    let a = clients.get(name);
    if (!a) {
      a = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: name }), ConnectionId.random());
      clients.set(name, a);
    }
    return a;
  };
  const run = (auth: ReturnType<typeof as> | typeof internal, fn: (ctx: any, args: any) => void, args: object = {}) =>
    h.withReducerTx(auth, (ctx) => fn(ctx, args));
  const call = (fn: (ctx: any, args: any) => void, args: object = {}) => run(internal, fn, args);
  const identityOf = (name: string) => h.withReducerTx(as(name), (ctx: any) => ctx.sender);
  // On a real server `init` runs as the publisher; by default the tests run it as internal (no operator row).
  if (initAs) h.withReducerTx(as(initAs), (ctx) => (mod.init as any)(ctx, {}));
  else call(mod.init);

  const hh = () => [...h.db.household.iter()];
  const byName = (name: string) => hh().find((x) => x.name === name)!;
  const prio = (id: number) => h.db.priority.householdId.find(id)!;
  const esc = (id: number) => h.db.escalation.householdId.find(id)!;
  const ci = (id: number) => h.db.checkin.householdId.find(id)!;
  const fin = (id: number) => h.db.household.id.find(id)!.finalState;
  const node = (id: number) => h.db.node.householdId.find(id)!;
  const ff = (minutes: number) => call(mod.sim_fast_forward, { minutes });
  /** Scenario "now" in microseconds: real (fixed) clock plus the fast-forward offset. */
  const nowMicros = () => BigInt(START.getTime()) * 1000n + h.db.clock.id.find(0)!.offsetMicros;
  /** Mutate rows directly, as a reducer would (for setting up states the sim reducers do not reach). */
  const edit = (fn: (db: any) => void) => h.withReducerTx(internal, (ctx: any) => fn(ctx.db));
  // Read the clock BEFORE opening the transaction: reading h.db inside one traps the harness.
  const setOffline = (id: number) => {
    const at = nowMicros();
    edit((db) => db.node.householdId.update({ ...db.node.householdId.find(id), online: false, lastSignalMicros: at }));
  };
  const timeline = () => [...h.db.timeline.iter()].map((t) => t.message);
  /** Every table that is part of the shared operational state, as plain JSON, for equality checks. */
  // Table iteration order is not stable across updates, so rows are compared in key order.
  const byKey = <T extends object>(rows: T[], key: string) => rows.sort((a: any, b: any) => a[key] - b[key]);
  const state = () =>
    JSON.parse(
      JSON.stringify(
        {
          clock: [...h.db.clock.iter()],
          household: byKey(hh(), 'id'),
          node: byKey([...h.db.node.iter()], 'householdId'),
          disaster: byKey([...h.db.disaster.iter()], 'id'),
          checkin: byKey([...h.db.checkin.iter()], 'householdId'),
          escalation: byKey([...h.db.escalation.iter()], 'householdId'),
          priority: byKey([...h.db.priority.iter()], 'householdId'),
        },
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      ),
    );
  return { h, clock, internal, as, run, call, identityOf, hh, byName, prio, esc, ci, fin, node, ff, nowMicros, edit, setOffline, timeline, state, micros };
}

export { mod };
