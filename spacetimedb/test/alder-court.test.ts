// End-to-end demonstration scenario: "Earthquake at Alder Court".
// One disaster, played minute by minute as a dispatcher client would, from the first shake to
// every household accounted for. docs/DEMO_SCENARIO.md walks through the same sequence for a live
// demo; the numbers below are the module's actual output, so the doc and this test cannot drift apart.
// SIMULATION: every household here is fictional and every responder step is simulated.
import { beforeAll, describe, expect, it } from 'vitest';
import { mod, setup } from './helpers';

const ALDER = { x: 225, y: 175 }; // centre of Alder Court (building 1, built 1962, highest risk)
const s = setup('owner');
const dispatcher = s.as('dispatcher');
const act = (fn: any, args: object = {}) => s.run(dispatcher, fn, args);

interface Frame {
  alvarez: { hpi: number; rank: number; band: string; step: number; checkin: string; final: string; tth: number; reason: string };
  patel: { final: string; step: number; checkin: string };
  accounted: number;
  openQueue: number;
}
const frames: Frame[] = [];
const frame = (): Frame => {
  const a = s.byName('Mrs. Alvarez');
  const p = s.prio(a.id);
  const patel = s.byName('The Patel family');
  const hs = s.hh();
  return {
    alvarez: { hpi: p.hpi, rank: p.rank, band: p.band, step: s.esc(a.id).step, checkin: s.ci(a.id).state, final: s.fin(a.id), tth: p.tthMin, reason: p.reason },
    patel: { final: s.fin(patel.id), step: s.esc(patel.id).step, checkin: s.ci(patel.id).state },
    accounted: hs.filter((h) => h.finalState !== 'unresolved').length,
    openQueue: [...s.h.db.priority.iter()].filter((x) => x.rank > 0).length,
  };
};

let beforeQuake: { disasters: number; prompted: number; accounted: number; sensored: number };

beforeAll(() => {
  s.run(s.as('owner'), mod.add_operator, { identity: s.identityOf('dispatcher') });
  beforeQuake = {
    disasters: [...s.h.db.disaster.iter()].length,
    prompted: [...s.h.db.checkin.iter()].filter((c) => c.state !== 'none').length,
    accounted: s.hh().filter((h) => h.finalState !== 'unresolved').length,
    sensored: s.hh().filter((h) => h.hasSensor).length,
  };
  act(mod.sim_quake, { ...ALDER, magnitude: 1.0 }); // t+0: the earthquake
  act(mod.sim_power_loss, { ...ALDER, radius: 160 }); //     and mains power fails around Alder Court
  frames.push(frame());
  for (let m = 1; m <= 60; m++) {
    act(mod.sim_fast_forward, { minutes: 1 });
    frames.push(frame());
  }
});

describe('Earthquake at Alder Court (simulation)', () => {
  it('starts calm: 40 synthetic households, 38 with sensors, nobody prompted, no disaster', () => {
    expect(beforeQuake).toEqual({ disasters: 0, prompted: 0, accounted: 0, sensored: 38 });
  });

  it('t+0  a confirmed quake prompts every sensored household and starts the clock for Mrs. Alvarez', () => {
    const a = s.byName('Mrs. Alvarez');
    expect([...s.h.db.disaster.iter()].filter((d) => d.kind === 'quake' && d.active).length).toBe(1);
    expect(frames[0]!.alvarez).toMatchObject({ step: 1, checkin: 'pending', tth: 180 });
    expect(frames[0]!.alvarez.reason).toContain('oxygen concentrator');
    expect(s.timeline().some((m) => m.startsWith('Earthquake CONFIRMED'))).toBe(true);
    expect(s.node(a.id).onBattery).toBe(true);
    // The two quiet-node households (abrupt loss) are the ones the system has no news from.
    expect(s.node(a.id).online).toBe(false);
  });

  it('t+2  the Patel family presses HELP: found, needs help, straight to the simulated responders', () => {
    expect(frames[1]!.patel.final).toBe('unresolved');
    expect(frames[2]!.patel).toEqual({ final: 'found_needs_help', step: 4, checkin: 'help' });
  });

  it('t+3  Mrs. Alvarez never answers: check-in expires, she is #1, and the emergency contact is notified', () => {
    expect(frames[2]!.alvarez.rank).toBe(1);
    expect(frames[3]!.alvarez).toMatchObject({ rank: 1, checkin: 'no_response', step: 2, band: 'high' });
    expect(frames[3]!.alvarez.hpi).toBeGreaterThan(frames[2]!.alvarez.hpi + 5); // the C term kicks in
  });

  it('t+4..8  she stays #1 and climbs as silence grows and backup power drains', () => {
    for (let m = 4; m <= 8; m++) {
      expect(frames[m]!.alvarez.rank).toBe(1);
      expect(frames[m]!.alvarez.hpi).toBeGreaterThan(frames[m - 1]!.alvarez.hpi);
      expect(frames[m]!.alvarez.tth).toBe(180 - m);
    }
    expect(frames[6]!.alvarez.step).toBe(3); // neighbor/volunteer knock
  });

  it('t+9  the volunteer finds her and she needs help (simulated); she is critical and at responder dispatch', () => {
    expect(frames[9]!.alvarez).toMatchObject({ final: 'found_needs_help', step: 4, band: 'critical', rank: 1 });
    expect(frames[9]!.alvarez.hpi).toBeGreaterThanOrEqual(75);
  });

  it('t+19  responders arrive (simulated): she is assisted and leaves the queue', () => {
    expect(frames[18]!.alvarez.final).toBe('found_needs_help');
    expect(frames[19]!.alvarez).toMatchObject({ final: 'assisted', rank: 0 });
  });

  it('the accounted-for counter only ever goes up, and ends at 38 of 40', () => {
    for (let m = 1; m < frames.length; m++) expect(frames[m]!.accounted).toBeGreaterThanOrEqual(frames[m - 1]!.accounted);
    expect(frames[0]!.accounted).toBe(0);
    expect(frames[60]!.accounted).toBe(38);
    expect(frames[60]!.openQueue).toBe(0);
  });

  it('the two homes without sensors stay "unknown": never safe, never counted as found', () => {
    for (const h of s.hh().filter((x) => !x.hasSensor)) {
      expect(s.prio(h.id).band).toBe('unknown');
      expect(s.fin(h.id)).toBe('unresolved');
    }
  });

  it('the timeline tells the story in order, with every ladder step for Mrs. Alvarez', () => {
    const rows = [...s.h.db.timeline.iter()];
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.id).toBeGreaterThan(rows[i - 1]!.id);
      expect(rows[i]!.atMicros).toBeGreaterThanOrEqual(rows[i - 1]!.atMicros);
    }
    const msgs = rows.map((r) => r.message);
    const at = (needle: string) => msgs.findIndex((m) => m.includes(needle));
    const order = ['Earthquake CONFIRMED', 'Step 2: notifying Mrs. Alvarez', 'Step 3: asking a nearby volunteer to knock on Mrs. Alvarez', 'Step 4: responder dispatched to Mrs. Alvarez', 'Mrs. Alvarez (1A): Assisted'];
    const idx = order.map(at);
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(msgs.some((m) => m.includes('SIMULATION: earthquake triggered'))).toBe(true);
  });

  it('a dispatcher override during the event is logged and visible', () => {
    const tran = s.byName('Mr. Tran');
    act(mod.override_priority, { householdId: tran.id, delta: 15, reason: 'Neighbor says he cannot leave his unit without a walker' });
    const log = [...s.h.db.overrideLog.iter()];
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ householdId: tran.id, delta: 15 });
    expect(s.prio(tran.id).reason).toContain('dispatcher +15');
  });
});
