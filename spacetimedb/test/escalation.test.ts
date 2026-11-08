import { describe, expect, it } from 'vitest';
import { SKIP_TO_DISPATCH_HPI, ladderWaitMinutes } from '../src/hpi';
import { mod, setup } from './helpers';
import { micros } from './time';

const ALDER = { x: 225, y: 175 };
const DISPATCH_MIN = 10; // wait at step 4 before the simulated responders arrive (src/index.ts)
const CHECKIN_WINDOW_MIN = 3;

function quake(s: ReturnType<typeof setup>, power = true) {
  s.call(mod.sim_quake, { ...ALDER, magnitude: 1.0 });
  if (power) s.call(mod.sim_power_loss, { ...ALDER, radius: 160 });
}

describe('check-in window', () => {
  it('a prompt is pending until exactly 3 minutes, then becomes no_response', () => {
    const s = setup();
    const chen = s.byName('Mr. Chen'); // node stays online, nobody presses a button
    quake(s);
    expect(s.ci(chen.id).state).toBe('pending');
    s.ff(CHECKIN_WINDOW_MIN - 1);
    expect(s.ci(chen.id).state).toBe('pending');
    s.ff(1);
    expect(s.ci(chen.id).state).toBe('no_response');
    // The node is still sending heartbeats, so this is escalated through C = 0.7, not through silence.
    expect(s.prio(chen.id).S).toBe(0);
    expect(s.prio(chen.id).C).toBe(0.7);
  });
});

describe('ladder timing', () => {
  it('every step waits ladderWaitMinutes(HPI) (10 min at step 4), and nothing moves early or backwards', () => {
    const s = setup();
    quake(s);
    const ids = s.hh().filter((h) => h.hasSensor).map((h) => h.id);
    let prev = new Map(ids.map((id) => [id, { ...s.esc(id) }]));
    let transitions = 0;
    for (let m = 1; m <= 30; m++) {
      s.ff(1);
      const now = s.nowMicros();
      for (const id of ids) {
        const e = s.esc(id);
        const was = prev.get(id)!;
        expect(e.step).toBeGreaterThanOrEqual(was.step);
        if (e.step > was.step && was.step >= 1 && s.ci(id).state !== 'help') {
          transitions++;
          // It only advanced once the wait for the CURRENT score had elapsed. (A rising score shortens the
          // wait, so this can be earlier than the "next at" shown at the end of the previous minute.)
          const wait = was.step === 4 ? DISPATCH_MIN : ladderWaitMinutes(s.prio(id).hpi);
          expect(was.stepAtMicros + micros(wait)).toBeLessThanOrEqual(now);
        }
        if (e.step >= 1 && e.step <= 3 && !e.done) {
          expect(e.nextAtMicros).toBe(e.stepAtMicros + micros(ladderWaitMinutes(s.prio(id).hpi)));
        }
        if (e.step === 4 && !e.done) expect(e.nextAtMicros).toBe(e.stepAtMicros + micros(DISPATCH_MIN));
      }
      prev = new Map(ids.map((id) => [id, { ...s.esc(id) }]));
    }
    expect(transitions).toBeGreaterThan(20); // the loop really did exercise the ladder
  });

  it('Mrs. Alvarez walks 1 -> 2 -> 3 -> 4 on the documented clock (trace from the Alder Court scenario)', () => {
    const s = setup();
    const alvarez = s.byName('Mrs. Alvarez');
    quake(s);
    const stepAt: number[] = [s.esc(alvarez.id).step];
    for (let m = 1; m <= 10; m++) {
      s.ff(1);
      stepAt.push(s.esc(alvarez.id).step);
    }
    expect(stepAt).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]);
  });

  it('"I need help" goes straight to responders; responders arrive after 10 minutes', () => {
    const s = setup();
    const patel = s.byName('The Patel family'); // simulated resident who presses HELP after 2 minutes
    quake(s);
    s.ff(1);
    expect(s.fin(patel.id)).toBe('unresolved');
    s.ff(1);
    expect(s.ci(patel.id).state).toBe('help');
    expect(s.fin(patel.id)).toBe('found_needs_help');
    expect(s.esc(patel.id).step).toBe(4);
    expect(s.timeline().some((m) => m.includes('responder dispatched to The Patel family') && m.includes('SIMULATED 911'))).toBe(true);
    s.ff(DISPATCH_MIN - 1);
    expect(s.esc(patel.id).done).toBe(false);
    expect(s.fin(patel.id)).toBe('found_needs_help');
    s.ff(1);
    expect(s.esc(patel.id).done).toBe(true);
    expect(s.fin(patel.id)).toBe('assisted');
  });

  it(`HPI >= ${SKIP_TO_DISPATCH_HPI} skips the emergency-contact and neighbor steps`, () => {
    const run = (boost: number) => {
      const s = setup();
      const alvarez = s.byName('Mrs. Alvarez');
      quake(s);
      if (boost) s.call(mod.override_priority, { householdId: alvarez.id, delta: boost, reason: 'Known to be alone and on oxygen' });
      const steps: number[] = [];
      for (let m = 0; m <= 4; m++) {
        if (m) s.ff(1);
        steps.push(s.esc(alvarez.id).step);
      }
      const said = (n: number) => s.timeline().some((x) => x.includes(`Step ${n}:`) && x.includes('Mrs. Alvarez'));
      return { steps, said, hpi: s.prio(alvarez.id).hpi };
    };
    const normal = run(0);
    expect(normal.steps).toEqual([1, 1, 1, 2, 2]);
    expect(normal.said(2)).toBe(true);

    const urgent = run(30);
    expect(urgent.hpi).toBeGreaterThanOrEqual(SKIP_TO_DISPATCH_HPI);
    // Higher score, shorter wait (about 2 min instead of 3), then straight to responders.
    expect(urgent.steps).toEqual([1, 1, 4, 4, 4]);
    expect(urgent.said(2)).toBe(false);
    expect(urgent.said(3)).toBe(false);
    expect(urgent.said(4)).toBe(true);
  });

  it('an OK answer at any step ends the escalation', () => {
    const s = setup();
    const chen = s.byName('Mr. Chen');
    quake(s);
    s.ff(6); // past step 2
    expect(s.esc(chen.id).step).toBeGreaterThanOrEqual(2);
    s.call(mod.submit_checkin, { householdId: chen.id, answer: 'ok', source: 'phone' });
    expect(s.fin(chen.id)).toBe('found_ok');
    expect(s.esc(chen.id).done).toBe(true);
    expect(s.prio(chen.id).rank).toBe(0); // resolved households leave the queue
    s.ff(30);
    expect(s.fin(chen.id)).toBe('found_ok'); // and nothing later reopens or reassigns them
  });
});

describe('scenario-time fast-forward', () => {
  const prepared = () => {
    const s = setup();
    quake(s);
    return s;
  };

  it('one big jump equals the same time in one-minute steps', () => {
    const a = prepared();
    a.ff(12);
    const b = prepared();
    for (let i = 0; i < 12; i++) b.ff(1);
    expect(a.state()).toEqual(b.state());
  });

  it('fractional minutes add up exactly', () => {
    const a = prepared();
    a.ff(2.5);
    const b = prepared();
    b.ff(1);
    b.ff(1);
    b.ff(0.5);
    expect(a.state()).toEqual(b.state());
  });

  it('moves the clock, every score timestamp, and every online simulated node together', () => {
    const s = prepared();
    s.ff(7);
    const now = s.nowMicros();
    expect(s.h.db.clock.id.find(0)!.offsetMicros).toBe(micros(7));
    for (const p of s.h.db.priority.iter()) expect(p.updatedAtMicros).toBe(now);
    for (const n of s.h.db.node.iter()) if (n.online) expect(n.lastSignalMicros).toBe(now);
    // Offline nodes did NOT get a fresh signal: silence really accumulates.
    const alvarez = s.byName('Mrs. Alvarez');
    expect(s.node(alvarez.id).online).toBe(false);
    expect(s.node(alvarez.id).lastSignalMicros).toBeLessThan(now);
  });

  it('rejects zero, negative, non-finite and over-long jumps without moving the clock', () => {
    const s = setup();
    for (const minutes of [0, -1, NaN, Infinity, 241]) expect(() => s.ff(minutes)).toThrow();
    expect(s.h.db.clock.id.find(0)!.offsetMicros).toBe(0n);
  });
});
