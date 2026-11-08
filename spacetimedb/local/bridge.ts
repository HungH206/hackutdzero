// Local fallback for development and demo backup. It runs THIS module's real
// reducers (including recompute_hpi) inside SpacetimeDB's official in-memory
// test datastore, so the dashboard can run without a SpacetimeDB server.
// The real demo path is a published module; see README "Running it".

import { Timestamp } from 'spacetimedb';
import { TestAuth, TestClock, createModuleTestHarness } from 'spacetimedb/server/test-utils';
import spacetimedb, * as mod from '../src/index';

const TABLES = [
  ['clock', 'clock'],
  ['buildings', 'building'],
  ['households', 'household'],
  ['nodes', 'node'],
  ['disasters', 'disaster'],
  ['checkins', 'checkin'],
  ['escalations', 'escalation'],
  ['priorities', 'priority'],
  ['overrides', 'overrideLog'],
  ['timeline', 'timeline'],
] as const;

const REDUCERS: Record<string, (ctx: any, args: any) => void> = {
  override_priority: mod.override_priority,
  set_final_state: mod.set_final_state,
  submit_checkin: mod.submit_checkin,
  report_event: mod.report_event,
  heartbeat: mod.heartbeat,
  register_node: mod.register_node,
  recompute_hpi: mod.recompute_hpi,
  sim_quake: mod.sim_quake,
  sim_fire: mod.sim_fire,
  sim_power_loss: mod.sim_power_loss,
  sim_comms_outage: mod.sim_comms_outage,
  sim_fast_forward: mod.sim_fast_forward,
  sim_reset: mod.sim_reset,
};

const toPlain = (row: object) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]));

export function createLocalBridge() {
  const clock = new TestClock(Timestamp.now());
  const h = createModuleTestHarness(spacetimedb, mod, { clock });
  const auth = TestAuth.internal();
  const run = (fn: (ctx: any, args: any) => void, args: object = {}) => {
    clock.set(Timestamp.now());
    h.withReducerTx(auth, (ctx) => fn(ctx, args));
  };
  run(mod.init);
  // Stand-in for the module's scheduled 5 s tick.
  const timer = setInterval(() => run(mod.tick, {}), 5000);

  return {
    call(name: string, args: object) {
      const fn = REDUCERS[name];
      if (!fn) throw new Error(`Unknown reducer ${name}`);
      run(fn, args);
    },
    snapshot() {
      const db = h.db as any;
      const out: Record<string, unknown> = {};
      for (const [key, table] of TABLES) out[key] = [...db[table].iter()].map(toPlain);
      const c = (out.clock as { offsetMicros: number }[])[0];
      out.clockOffsetMicros = c ? c.offsetMicros : 0;
      delete out.clock;
      return out;
    },
    stop() {
      clearInterval(timer);
    },
  };
}
