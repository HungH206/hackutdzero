import { describe, expect, it } from 'vitest';
import { mod, setup } from './helpers';

const ALDER = { x: 225, y: 175 };

describe('determinism', () => {
  const script = () => {
    const s = setup();
    s.call(mod.sim_quake, { ...ALDER, magnitude: 1.0 });
    s.call(mod.sim_power_loss, { ...ALDER, radius: 160 });
    s.ff(7);
    s.call(mod.override_priority, { householdId: s.byName('Mr. Tran').id, delta: 10, reason: 'Neighbor reports he uses a walker' });
    s.ff(5);
    return s.state();
  };

  it('identical inputs produce identical priority, escalation and check-in tables', () => {
    expect(script()).toEqual(script());
  });

  it('recompute is idempotent: running it again changes nothing', () => {
    const s = setup();
    s.call(mod.sim_quake, { ...ALDER, magnitude: 1.0 });
    s.ff(4);
    const before = s.state();
    s.call(mod.recompute_hpi);
    s.call(mod.recompute_hpi);
    expect(s.state()).toEqual(before);
  });
});

describe('missing sensor data is never read as an injury', () => {
  it('a node that is offline with no event is flagged to verify, not scored as hurt', () => {
    const s = setup();
    const brooks = s.byName('J. Brooks');
    s.setOffline(brooks.id);
    s.ff(30);
    const p = s.prio(brooks.id);
    expect(p.S).toBe(0);
    expect(p.minutesSilent).toBe(0);
    expect(p.hpi).toBeLessThan(25);
    expect(p.band).toBe('low');
    expect(p.reason).toContain('verify (not assumed hurt)');
    // No prompt, no ladder, no final state: nothing escalates a person on silence alone.
    expect(s.ci(brooks.id).state).toBe('none');
    expect(s.esc(brooks.id).step).toBe(0);
    expect(s.fin(brooks.id)).toBe('unresolved');
  });

  it('even a node that dies right after an unconfirmed flame reading gets no silence score without a confirmed event', () => {
    const s = setup();
    const chen = s.byName('Mr. Chen');
    s.call(mod.report_event, { householdId: chen.id, kind: 'flame', value: 1, durationS: 0 }); // flame, but no temperature rise: not confirmed
    expect([...s.h.db.disaster.iter()].length).toBe(0);
    s.edit((db) => db.node.householdId.update({ ...db.node.householdId.find(chen.id), online: false, abrupt: true }));
    s.ff(10);
    expect(s.prio(chen.id).S).toBe(0);
    expect(s.fin(chen.id)).toBe('unresolved');
  });

  it('a household with no sensor stays "unknown", never safe and never scored', () => {
    const s = setup();
    const none = s.hh().find((x) => !x.hasSensor)!;
    s.call(mod.sim_quake, { ...ALDER, magnitude: 1.0 });
    s.ff(30);
    const p = s.prio(none.id);
    expect(p.scored).toBe(false);
    expect(p.band).toBe('unknown');
    expect(p.rank).toBe(0);
    expect(p.reason).toContain('not safe');
    expect(s.fin(none.id)).toBe('unresolved');
  });

  it('silence counts from the event, not from a signal lost long before it', () => {
    const s = setup();
    const brooks = s.byName('J. Brooks');
    s.setOffline(brooks.id);
    s.ff(30); // offline for half an hour with nothing happening
    s.call(mod.sim_quake, { ...ALDER, magnitude: 1.0 });
    // Offline BEFORE the quake: no abrupt-loss bonus and no backdated silence.
    expect(s.prio(brooks.id).S).toBe(0);
    expect(s.prio(brooks.id).reason).toContain('already offline before the event');
    s.ff(10);
    expect(s.prio(brooks.id).S).toBeCloseTo((10 - 0.5) / 20, 2);
  });

  it('abrupt loss at the moment of the quake does raise S (the signal we do trust)', () => {
    const s = setup();
    const alvarez = s.byName('Mrs. Alvarez');
    s.call(mod.sim_quake, { ...ALDER, magnitude: 1.0 });
    expect(s.node(alvarez.id).abrupt).toBe(true);
    expect(s.prio(alvarez.id).S).toBeCloseTo(0.2, 5);
  });

  it('real nodes that stop sending are marked offline, flagged to verify, and never auto-labelled injured', () => {
    const s = setup();
    const alvarez = s.byName('Mrs. Alvarez');
    const brooks = s.byName('J. Brooks');
    s.call(mod.register_node, { householdId: alvarez.id, device: s.identityOf('dev-alvarez') });
    s.call(mod.register_node, { householdId: brooks.id, device: s.identityOf('dev-brooks') });
    s.run(s.as('dev-alvarez'), mod.report_event, { householdId: alvarez.id, kind: 'shake', value: 0.9, durationS: 20 });
    s.run(s.as('dev-brooks'), mod.report_event, { householdId: brooks.id, kind: 'shake', value: 0.9, durationS: 20 });
    expect([...s.h.db.disaster.iter()].filter((d) => d.kind === 'quake').length).toBe(1);
    expect(s.ci(alvarez.id).state).toBe('pending');
    expect(s.node(alvarez.id).online).toBe(true);

    s.ff(1); // no heartbeats arrive
    expect(s.node(alvarez.id).online).toBe(false);
    expect(s.node(alvarez.id).abrupt).toBe(true);
    expect(s.timeline().some((m) => m.includes('stopped sending at the moment of the event') && m.includes('verify'))).toBe(true);

    s.ff(60);
    for (const h of [alvarez, brooks]) {
      expect(s.esc(h.id).step).toBe(4); // the ladder ran all the way to the (simulated) responder step
      expect(s.esc(h.id).done).toBe(true);
      expect(s.fin(h.id)).toBe('unresolved'); // ...but silence alone never marks anyone found, OK, or injured
      expect(s.prio(h.id).rank).toBeGreaterThan(0); // and they stay in the queue until a human or a check-in resolves them
    }
  });
});

describe('communications outage discount', () => {
  it('an area that goes quiet together is discounted versus one node that goes quiet alone', () => {
    const s = setup();
    // A fire elsewhere makes this an active event; no shaking reaches Alder Court.
    s.call(mod.sim_fire, { householdId: s.hh().find((x) => x.buildingId === 5)!.id });
    s.call(mod.sim_comms_outage, { ...ALDER, radius: 160 });
    const lone = s.hh().find((x) => x.buildingId === 2 && x.hasSensor)!;
    s.setOffline(lone.id);
    s.ff(20);

    const alder = s.hh().filter((x) => x.buildingId === 1 && x.hasSensor);
    expect(alder.length).toBeGreaterThanOrEqual(3);
    for (const h of alder) {
      const p = s.prio(h.id);
      expect(p.commsOutage).toBe(true);
      expect(p.S).toBeCloseTo(0.5 * ((20 - 0.5) / 20), 3); // lambda = 0.5
      expect(p.hpi).toBeLessThan(50);
      expect(p.reason).toContain('area comms outage');
      expect(s.ci(h.id).state).toBe('none'); // the outage never prompts or escalates anyone
      expect(s.fin(h.id)).toBe('unresolved');
    }
    const p = s.prio(lone.id);
    expect(p.commsOutage).toBe(false);
    expect(p.S).toBeCloseTo((20 - 0.5) / 20, 3); // no discount for a lone silent node
  });

  it('shaking at the node rules out the outage explanation', () => {
    const s = setup();
    s.call(mod.sim_quake, { ...ALDER, magnitude: 1.0 });
    s.call(mod.sim_comms_outage, { ...ALDER, radius: 400 });
    s.ff(10);
    for (const h of s.hh().filter((x) => x.buildingId === 1 && x.hasSensor)) expect(s.prio(h.id).commsOutage).toBe(false);
  });
});

describe('backup-power countdown', () => {
  it('time-to-harm falls one minute per minute and K rises from 1.125 to 1.5', () => {
    const s = setup();
    const alvarez = s.byName('Mrs. Alvarez'); // oxygen concentrator, 180 min of backup
    expect(s.prio(alvarez.id).tthMin).toBe(-1); // clock does not apply on mains power
    expect(s.prio(alvarez.id).K).toBe(1);

    s.call(mod.sim_power_loss, { ...ALDER, radius: 160 });
    expect(s.prio(alvarez.id).tthMin).toBe(180);
    expect(s.prio(alvarez.id).K).toBeCloseTo(1.125, 5);

    let last = s.prio(alvarez.id).hpi;
    s.ff(60);
    expect(s.prio(alvarez.id).tthMin).toBeCloseTo(120, 5);
    expect(s.prio(alvarez.id).K).toBeCloseTo(1.25, 5);
    expect(s.prio(alvarez.id).hpi).toBeGreaterThanOrEqual(last);
    last = s.prio(alvarez.id).hpi;

    s.ff(120);
    expect(s.prio(alvarez.id).tthMin).toBe(0);
    expect(s.prio(alvarez.id).K).toBe(1.5);
    expect(s.prio(alvarez.id).hpi).toBeGreaterThan(last);

    s.ff(10); // clamped at zero, never negative
    expect(s.prio(alvarez.id).tthMin).toBe(0);
  });

  it('only households with powered medical equipment get the clock', () => {
    const s = setup();
    s.call(mod.sim_power_loss, { ...ALDER, radius: 160 });
    s.ff(30);
    for (const h of s.hh().filter((x) => x.hasSensor && x.medicalDevice === '')) {
      expect(s.prio(h.id).tthMin).toBe(-1);
      expect(s.prio(h.id).K).toBe(1);
    }
  });

  it('restoring mains power stops the clock', () => {
    const s = setup();
    const alvarez = s.byName('Mrs. Alvarez');
    s.call(mod.sim_power_loss, { ...ALDER, radius: 160 });
    s.ff(60);
    s.call(mod.report_event, { householdId: alvarez.id, kind: 'power_restored', value: 0, durationS: 0 });
    expect(s.prio(alvarez.id).tthMin).toBe(-1);
    expect(s.prio(alvarez.id).K).toBe(1);
  });
});

describe('manual overrides', () => {
  const rejects = (s: ReturnType<typeof setup>, args: object, msg: RegExp) =>
    expect(() => s.call(mod.override_priority, args)).toThrow(msg);

  it('require a reason, a finite delta in [-30, +30], and leave no audit row when refused', () => {
    const s = setup();
    const id = s.byName('Mr. Tran').id;
    rejects(s, { householdId: id, delta: 10, reason: '' }, /reason/i);
    rejects(s, { householdId: id, delta: 10, reason: '   ' }, /reason/i);
    rejects(s, { householdId: id, delta: 10, reason: 'x'.repeat(281) }, /at most 280/);
    rejects(s, { householdId: id, delta: NaN, reason: 'because' }, /finite/);
    rejects(s, { householdId: id, delta: Infinity, reason: 'because' }, /finite/);
    rejects(s, { householdId: id, delta: 31, reason: 'because' }, /between -30 and \+30/);
    rejects(s, { householdId: id, delta: -31, reason: 'because' }, /between -30 and \+30/);
    rejects(s, { householdId: 9999, delta: 5, reason: 'because' }, /Unknown household/);
    expect([...s.h.db.overrideLog.iter()].length).toBe(0);
    expect(s.prio(id).override).toBe(0);
  });

  it('write an audit record with who, why, how much and when, and a timeline entry', () => {
    const s = setup();
    s.call(mod.add_operator, { identity: s.identityOf('dispatcher-1') });
    const tran = s.byName('Mr. Tran');
    s.run(s.as('dispatcher-1'), mod.override_priority, { householdId: tran.id, delta: 10, reason: '  Neighbor reports he uses a walker  ' });
    const rows = [...s.h.db.overrideLog.iter()];
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ householdId: tran.id, delta: 10, reason: 'Neighbor reports he uses a walker' });
    expect(rows[0]!.by).toBe(s.identityOf('dispatcher-1').toHexString().slice(0, 12));
    expect(rows[0]!.atMicros).toBe(s.nowMicros());
    expect(s.timeline().some((m) => m.includes('Dispatcher override +10') && m.includes('walker'))).toBe(true);
  });

  it('move the score by exactly the delta, persist through time and recompute, and are replaceable', () => {
    const s = setup();
    const id = s.byName('Mr. Tran').id;
    const base = s.prio(id).hpi;
    s.call(mod.override_priority, { householdId: id, delta: 10, reason: 'walker' });
    expect(s.prio(id).hpi).toBeCloseTo(base + 10, 1);
    expect(s.prio(id).reason).toContain('dispatcher +10');
    s.ff(5);
    s.call(mod.recompute_hpi);
    expect(s.prio(id).override).toBe(10);
    s.call(mod.override_priority, { householdId: id, delta: -20, reason: 'neighbor confirmed he is fine' });
    expect(s.prio(id).override).toBe(-20);
    expect([...s.h.db.overrideLog.iter()].map((r) => r.delta)).toEqual([10, -20]); // history kept, not overwritten
  });

  it('can raise a household in the ranking, and the audit log survives a demo reset', () => {
    const s = setup();
    const id = s.byName('Mr. Tran').id;
    const before = s.prio(id).rank;
    s.call(mod.override_priority, { householdId: id, delta: 30, reason: 'Known to rely on a ventilator not on file' });
    expect(s.prio(id).rank).toBeLessThan(before);
    s.call(mod.sim_reset);
    expect([...s.h.db.overrideLog.iter()].length).toBe(1);
    expect(s.prio(id).override).toBe(0); // the score itself resets with the simulation
  });
});
