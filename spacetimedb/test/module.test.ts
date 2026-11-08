import { describe, expect, it } from 'vitest';
import { Timestamp } from 'spacetimedb';
import { TestAuth, TestClock, createModuleTestHarness } from 'spacetimedb/server/test-utils';
import spacetimedb, * as mod from '../src/index';

function setup() {
  const clock = new TestClock(Timestamp.fromDate(new Date('2026-11-08T09:00:00Z')));
  const h = createModuleTestHarness(spacetimedb, mod, { clock });
  const auth = TestAuth.internal();
  const call = (fn: (ctx: any, args: any) => void, args: object = {}) => h.withReducerTx(auth, (ctx) => fn(ctx, args));
  call(mod.init);
  const byName = (name: string) => [...h.db.household.iter()].find((x) => x.name === name)!;
  const prio = (id: number) => h.db.priority.householdId.find(id)!;
  return { h, call, byName, prio };
}

describe('Headcount module scenario', () => {
  it('seeds an all-clear neighborhood', () => {
    const { h } = setup();
    const hs = [...h.db.household.iter()];
    expect(hs.length).toBe(40);
    expect(hs.filter((x) => !x.hasSensor).length).toBe(2);
    expect([...h.db.disaster.iter()].length).toBe(0);
    const unknown = hs.find((x) => !x.hasSensor)!;
    expect(h.db.priority.householdId.find(unknown.id)!.band).toBe('unknown');
  });

  it('ignores a short spike from one node', () => {
    const { h, call, byName } = setup();
    call(mod.report_event, { householdId: byName('J. Brooks').id, kind: 'shake', value: 0.9, durationS: 1 });
    expect([...h.db.disaster.iter()].length).toBe(0);
  });

  it('confirms a quake, escalates, and ranks Mrs. Alvarez at the top', () => {
    const { h, call, byName, prio } = setup();
    const alvarez = byName('Mrs. Alvarez');
    call(mod.sim_quake, { x: 200, y: 160, magnitude: 1.0 });
    call(mod.sim_power_loss, { x: 200, y: 160, radius: 400 });
    expect([...h.db.disaster.iter()].filter((d) => d.kind === 'quake').length).toBe(1);
    expect(h.db.checkin.householdId.find(alvarez.id)!.state).toBe('pending');

    call(mod.sim_fast_forward, { minutes: 4 });
    const p = prio(alvarez.id);
    expect(p.rank).toBe(1);
    expect(p.band).toBe('high');
    expect(p.reason).toContain('oxygen concentrator');
    // Her node died abruptly, so she is silent with no answer.
    expect(h.db.checkin.householdId.find(alvarez.id)!.state).toBe('no_response');

    // Patel family pressed help: found, needs help, sent straight to responders.
    const patel = byName('The Patel family');
    expect(h.db.household.id.find(patel.id)!.finalState).toBe('found_needs_help');
    expect(h.db.escalation.householdId.find(patel.id)!.step).toBe(4);

    // As silence grows and backup power runs down she becomes critical.
    call(mod.sim_fast_forward, { minutes: 4 });
    expect(prio(alvarez.id).band).toBe('critical');

    call(mod.sim_fast_forward, { minutes: 60 });
    const hs = [...h.db.household.iter()];
    const accounted = hs.filter((x) => x.finalState !== 'unresolved').length;
    expect(accounted).toBe(38);
    // Everyone with a sensor is accounted for. The two unknown homes never are.
    expect(hs.filter((x) => x.hasSensor && x.finalState === 'unresolved').length).toBe(0);
    expect(h.db.household.id.find(alvarez.id)!.finalState).toBe('assisted');
  });

  it('fire floor lifts a fire unit and warns neighbors', () => {
    const { h, call, byName, prio } = setup();
    const chen = byName('Mr. Chen');
    call(mod.sim_fire, { householdId: chen.id });
    const p = prio(chen.id);
    expect(p.L).toBeCloseTo(0.9);
    expect(p.K).toBe(1.5);
    expect(p.reason).toContain('flame in unit');
    expect([...h.db.disaster.iter()].some((d) => d.kind === 'fire')).toBe(true);
  });

  it('logs dispatcher overrides and requires a reason', () => {
    const { h, call, byName, prio } = setup();
    const tran = byName('Mr. Tran');
    expect(() => call(mod.override_priority, { householdId: tran.id, delta: 10, reason: ' ' })).toThrow();
    call(mod.override_priority, { householdId: tran.id, delta: 10, reason: 'Neighbor reports he uses a walker' });
    expect(prio(tran.id).override).toBe(10);
    expect([...h.db.overrideLog.iter()].length).toBe(1);
  });

  it('first check-in answer wins', () => {
    const { h, call, byName } = setup();
    call(mod.sim_quake, { x: 200, y: 160, magnitude: 1.0 });
    const brooks = byName('J. Brooks');
    call(mod.submit_checkin, { householdId: brooks.id, answer: 'help', source: 'phone' });
    call(mod.submit_checkin, { householdId: brooks.id, answer: 'ok', source: 'wall screen' });
    expect(h.db.checkin.householdId.find(brooks.id)!.state).toBe('help');
  });
});
