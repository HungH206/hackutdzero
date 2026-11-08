import { describe, expect, it } from 'vitest';
import { mod, setup } from './helpers';

const ALDER = { x: 225, y: 175 };
const DISPATCHERS_ONLY = /limited to dispatchers/;

describe('who becomes an operator', () => {
  it('the publisher is the first operator and nobody else is', () => {
    const s = setup('owner');
    expect(() => s.run(s.as('owner'), mod.recompute_hpi)).not.toThrow();
    expect(() => s.run(s.as('stranger'), mod.recompute_hpi)).toThrow(DISPATCHERS_ONLY);
  });

  it('an operator can add another, who can then act, and can be removed again', () => {
    const s = setup('owner');
    s.run(s.as('owner'), mod.add_operator, { identity: s.identityOf('dispatcher') });
    expect(() => s.run(s.as('dispatcher'), mod.recompute_hpi)).not.toThrow();
    s.run(s.as('owner'), mod.remove_operator, { identity: s.identityOf('dispatcher') });
    expect(() => s.run(s.as('dispatcher'), mod.recompute_hpi)).toThrow(DISPATCHERS_ONLY);
  });

  it('the last operator cannot be removed, so the database is never locked out', () => {
    const s = setup('owner');
    expect(() => s.run(s.as('owner'), mod.remove_operator, { identity: s.identityOf('owner') })).toThrow(/last operator/);
  });
});

describe('dispatcher-only reducers refuse ordinary clients and change nothing', () => {
  const tran = (s: ReturnType<typeof setup>) => s.byName('Mr. Tran').id;
  const cases: [string, (s: ReturnType<typeof setup>) => void][] = [
    ['override_priority', (s) => s.run(s.as('stranger'), mod.override_priority, { householdId: tran(s), delta: 30, reason: 'x' })],
    ['set_final_state', (s) => s.run(s.as('stranger'), mod.set_final_state, { householdId: tran(s), state: 'found_ok', note: 'x' })],
    ['recompute_hpi', (s) => s.run(s.as('stranger'), mod.recompute_hpi)],
    ['sim_quake', (s) => s.run(s.as('stranger'), mod.sim_quake, { ...ALDER, magnitude: 1 })],
    ['sim_fire', (s) => s.run(s.as('stranger'), mod.sim_fire, { householdId: tran(s) })],
    ['sim_power_loss', (s) => s.run(s.as('stranger'), mod.sim_power_loss, { ...ALDER, radius: 100 })],
    ['sim_comms_outage', (s) => s.run(s.as('stranger'), mod.sim_comms_outage, { ...ALDER, radius: 100 })],
    ['sim_fast_forward', (s) => s.run(s.as('stranger'), mod.sim_fast_forward, { minutes: 5 })],
    ['sim_reset', (s) => s.run(s.as('stranger'), mod.sim_reset)],
    ['add_operator', (s) => s.run(s.as('stranger'), mod.add_operator, { identity: s.identityOf('stranger') })],
    ['remove_operator', (s) => s.run(s.as('stranger'), mod.remove_operator, { identity: s.identityOf('owner') })],
    ['register_node', (s) => s.run(s.as('stranger'), mod.register_node, { householdId: tran(s), device: s.identityOf('stranger') })],
  ];
  for (const [name, attempt] of cases) {
    it(name, () => {
      const s = setup('owner');
      const before = s.state();
      const audit = [...s.h.db.overrideLog.iter()].length;
      expect(() => attempt(s)).toThrow(DISPATCHERS_ONLY);
      expect(s.state()).toEqual(before);
      expect([...s.h.db.overrideLog.iter()].length).toBe(audit);
    });
  }

  it('tick is for the scheduler: a client cannot call it, and the scheduler still can', () => {
    const s = setup('owner');
    expect(() => s.run(s.as('owner'), mod.tick, {})).toThrow(/scheduler/);
    expect(() => s.call(mod.tick, {})).not.toThrow();
  });
});

describe('households can only be spoken for by their own device or a dispatcher', () => {
  const alvarez = (s: ReturnType<typeof setup>) => s.byName('Mrs. Alvarez').id;
  const brooks = (s: ReturnType<typeof setup>) => s.byName('J. Brooks').id;
  const provision = () => {
    const s = setup('owner');
    s.run(s.as('owner'), mod.register_node, { householdId: alvarez(s), device: s.identityOf('wall-alvarez') });
    s.run(s.as('owner'), mod.register_node, { householdId: brooks(s), device: s.identityOf('wall-brooks') });
    s.call(mod.sim_quake, { ...ALDER, magnitude: 1 });
    return s;
  };

  it('a stranger cannot answer a check-in, send a heartbeat or report an event for anyone', () => {
    const s = provision();
    const before = s.state();
    expect(() => s.run(s.as('stranger'), mod.submit_checkin, { householdId: alvarez(s), answer: 'ok', source: 'phone' })).toThrow(/registered device/);
    expect(() => s.run(s.as('stranger'), mod.heartbeat, { householdId: alvarez(s), onBattery: false })).toThrow(/registered device/);
    expect(() => s.run(s.as('stranger'), mod.report_event, { householdId: alvarez(s), kind: 'motion', value: 1, durationS: 0 })).toThrow(/registered device/);
    expect(s.state()).toEqual(before);
    expect(s.fin(alvarez(s))).toBe('unresolved');
  });

  it("one household's device cannot speak for another household", () => {
    const s = provision();
    expect(() => s.run(s.as('wall-brooks'), mod.submit_checkin, { householdId: alvarez(s), answer: 'ok', source: 'wall screen' })).toThrow(/registered device/);
    expect(s.fin(alvarez(s))).toBe('unresolved');
  });

  it("a household's own device can answer, and the source is recorded as sent", () => {
    const s = provision();
    s.run(s.as('wall-alvarez'), mod.submit_checkin, { householdId: alvarez(s), answer: 'help', source: 'wall screen' });
    expect(s.ci(alvarez(s)).state).toBe('help');
    expect(s.ci(alvarez(s)).source).toBe('wall screen');
    expect(s.fin(alvarez(s))).toBe('found_needs_help');
    expect(() => s.run(s.as('wall-alvarez'), mod.heartbeat, { householdId: alvarez(s), onBattery: false })).not.toThrow();
  });

  it('a dispatcher answering on someone\'s behalf is recorded as a dispatcher, never as the resident', () => {
    const s = provision();
    s.run(s.as('owner'), mod.submit_checkin, { householdId: brooks(s), answer: 'ok', source: 'wall screen' });
    expect(s.ci(brooks(s)).source).toMatch(/^dispatcher \(/);
    expect(s.ci(brooks(s)).source).not.toContain('wall screen');
  });

  it('rejects unknown answers and sources, and non-finite sensor values', () => {
    const s = provision();
    const dev = s.as('wall-alvarez');
    expect(() => s.run(dev, mod.submit_checkin, { householdId: alvarez(s), answer: 'maybe', source: 'phone' })).toThrow(/ok or help/);
    expect(() => s.run(dev, mod.submit_checkin, { householdId: alvarez(s), answer: 'ok', source: 'carrier pigeon' })).toThrow(/source must be/);
    expect(() => s.run(dev, mod.report_event, { householdId: alvarez(s), kind: 'shake', value: NaN, durationS: 5 })).toThrow(/finite/);
    expect(() => s.run(dev, mod.report_event, { householdId: alvarez(s), kind: 'shake', value: 1, durationS: -1 })).toThrow(/between 0 and 600/);
    expect(() => s.run(dev, mod.report_event, { householdId: alvarez(s), kind: 'explosion', value: 1, durationS: 1 })).toThrow(/Unknown event kind/);
    expect(s.fin(alvarez(s))).toBe('unresolved');
  });

  it('only a dispatcher can resolve a household or close its escalation', () => {
    const s = provision();
    s.ff(30);
    // set_final_state is how escalation is closed by hand; strangers cannot.
    expect(() => s.run(s.as('stranger'), mod.set_final_state, { householdId: brooks(s), state: 'assisted', note: 'x' })).toThrow(DISPATCHERS_ONLY);
    s.run(s.as('owner'), mod.set_final_state, { householdId: brooks(s), state: 'assisted', note: 'Neighbor confirmed' });
    expect(s.fin(brooks(s))).toBe('assisted');
    expect(s.esc(brooks(s)).done).toBe(true);
    expect(s.timeline().some((m) => m.includes('Neighbor confirmed') && m.includes('(by '))).toBe(true);
  });
});
