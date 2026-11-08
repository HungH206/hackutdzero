import { describe, expect, it } from 'vitest';
import { accountFor, type Claim } from '../src/accounting';
import * as mod from '../src/index';
import { setup } from './helpers';

let t = 0n;
const c = (sourceKey: string, relation: Claim['relation'], kind: Claim['kind'], firsthand = false): Claim => ({ sourceKey, relation, kind, firsthand, atMicros: ++t });
const run = (claims: Claim[], highRisk = false, finalState = 'unresolved') => accountFor({ claims, highRisk, finalState }).status;

describe('accountFor', () => {
  it('starts unaccounted', () => expect(run([])).toBe('unaccounted'));
  it('the person themselves closes it, even when high risk', () => expect(run([c('a', 'self', 'safe', true)], true)).toBe('accounted'));
  it('one hearsay report never closes a high-risk person', () => expect(run([c('d', 'family', 'away')], true)).toBe('reported'));
  it('one witness does not close a high-risk person', () => expect(run([c('n', 'neighbor', 'safe', true)], true)).toBe('reported'));
  it('two witnesses close a high-risk person', () => expect(run([c('n', 'neighbor', 'safe', true), c('m', 'neighbor', 'safe', true)], true)).toBe('accounted'));
  it('the same witness twice is still one witness', () => expect(run([c('n', 'neighbor', 'safe', true), c('n', 'neighbor', 'safe', true)], true)).toBe('reported'));
  it('one witness closes a person who is not high risk', () => expect(run([c('n', 'neighbor', 'safe', true)])).toBe('accounted'));
  it('hearsay does not close a person who is not high risk', () => expect(run([c('n', 'neighbor', 'safe')])).toBe('reported'));
  it('disagreement is flagged, not averaged', () => expect(run([c('n', 'neighbor', 'safe', true), c('d', 'family', 'needs_help')])).toBe('conflict'));
  it('a source can correct itself', () => expect(run([c('n', 'neighbor', 'needs_help', true), c('n', 'neighbor', 'safe', true)])).toBe('accounted'));
  it('an in-person visit closes a high-risk person', () => expect(run([c('v', 'visit', 'safe', true)], true)).toBe('accounted'));
  it('the person overrides hearsay', () => expect(run([c('d', 'family', 'needs_help'), c('a', 'self', 'safe', true)], true)).toBe('accounted'));
  it('asking for help beats an older OK from the same person', () => expect(run([c('a', 'self', 'safe'), c('a', 'self', 'needs_help')], true)).toBe('needs_help'));
  it('unknown says nothing', () => expect(run([c('n', 'neighbor', 'unknown')])).toBe('unaccounted'));
});

describe('agent reducers', () => {
  const s = setup('owner');
  const owner = s.as('owner');
  const stranger = s.as('stranger');
  const alvarez = s.byName('Mrs. Alvarez');
  const claim = (over: object) => ({ householdId: alvarez.id, sourceKey: 'k', relation: 'family', firsthand: false, kind: 'away', detail: 'dialysis', ...over });
  const status = () => s.h.db.accounting.householdId.find(alvarez.id)!.status;
  const summary = () => s.h.db.headcountSummary.id.find(0)!;

  it('refuses clients that are not operators', () => {
    expect(() => s.run(stranger, mod.record_claim, claim({}))).toThrow(/dispatchers/);
    expect(() => s.run(stranger, mod.approve_help_task, { id: 1n, by: 'x' })).toThrow(/dispatchers/);
  });

  it('keeps claims out of client view and counts every household', () => {
    s.run(owner, mod.link_agent_household, { householdId: alvarez.id });
    s.run(owner, mod.record_claim, claim({}));
    expect(status()).toBe('reported');
    expect(s.fin(alvarez.id)).toBe('unresolved');
    expect(summary().total).toBe(s.hh().length);
    expect(summary().reported).toBe(1);
    expect((mod as any).person_claim).toBeUndefined();
  });

  it('needs a human before anyone is asked', () => {
    s.run(owner, mod.propose_help_task, { householdId: alvarez.id, helperLabel: 'Neighbor', reason: 'No answer' });
    s.run(owner, mod.propose_help_task, { householdId: alvarez.id, helperLabel: 'Neighbor', reason: 'No answer' });
    const tasks = [...s.h.db.helpTask.iter()];
    expect(tasks.length).toBe(1);
    expect(() => s.run(owner, mod.update_help_task, { id: tasks[0]!.id, state: 'asked', helperLabel: '' })).toThrow(/dispatcher first/);
    s.run(owner, mod.approve_help_task, { id: tasks[0]!.id, by: 'Dana' });
    s.run(owner, mod.update_help_task, { id: tasks[0]!.id, state: 'accepted', helperLabel: 'Neighbor, 2 min away' });
    expect(s.h.db.helpTask.id.find(tasks[0]!.id)!.state).toBe('accepted');
  });

  it('an in-person visit marks the household found and takes it out of the queue', () => {
    s.run(owner, mod.record_claim, claim({ sourceKey: 'v', relation: 'visit', firsthand: true, kind: 'safe', detail: '' }));
    expect(status()).toBe('accounted');
    expect(s.fin(alvarez.id)).toBe('found_ok');
    expect(s.prio(alvarez.id).rank).toBe(0);
  });

  it('a linked household is not answered by the simulator', () => {
    const fresh = setup('owner');
    const tran = fresh.byName('The Patel family');
    fresh.run(fresh.as('owner'), mod.link_agent_household, { householdId: tran.id });
    expect(fresh.h.db.household.id.find(tran.id)!.simBehavior).toBe('agent');
  });

  it('a reset clears claims and tasks', () => {
    s.run(owner, mod.sim_reset, {});
    expect([...s.h.db.helpTask.iter()].length).toBe(0);
    expect(status()).toBe('unaccounted');
  });
});
