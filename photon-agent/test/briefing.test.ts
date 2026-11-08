import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Briefing, draftAnnouncement, facts, rulesBriefing, templateAnnouncement } from '../src/briefing.ts';
import type { Household, Snapshot } from '../src/types.ts';

const home = (id: number, name: string, over: Partial<Household> = {}): Household => ({
  id, buildingId: 1, unit: `${id}A`, name, x: 0, y: 0, age: 30, medicalDevice: '', mobilityLimited: false,
  language: 'en', infant: false, simBehavior: '', ...over,
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  households: [home(1, 'Mrs. Alvarez', { age: 82, medicalDevice: 'oxygen concentrator' }), home(2, 'J. Brooks'), home(3, 'Mr. Chen')],
  buildings: [{ id: 1, name: 'Alder Court' }],
  disasters: [{ id: 1, kind: 'quake', active: true, confirmedAtMicros: 0 }],
  checkins: [],
  accounts: [
    { householdId: 1, status: 'reported', sources: 1, note: 'Reported OK, unconfirmed.' },
    { householdId: 2, status: 'accounted', sources: 1, note: 'Confirmed by the person.' },
    { householdId: 3, status: 'needs_help', sources: 1, note: 'Asked for help.' },
  ],
  tasks: [],
  summary: { total: 3, accounted: 1, reported: 1, needsHelp: 1, conflict: 0, unaccounted: 0, eventActive: true },
  ...over,
});

test('facts leave out accounted households and put help requests first', () => {
  const f = facts(snap());
  assert.deepEqual(f.attention.map((a) => a.name), ['Mr. Chen', 'Mrs. Alvarez']);
  assert.deepEqual(f.attention[1]?.risk, ['age 82', 'oxygen concentrator']);
});

test('facts never carry phone numbers or message text', () => {
  const text = JSON.stringify(facts(snap()));
  assert.doesNotMatch(text, /\+\d{7,}/);
});

test('no emergency means an empty briefing', () => {
  const b = rulesBriefing(facts(snap({ disasters: [] })));
  assert.equal(b.headline, 'No active emergency.');
  assert.deepEqual(b.next, []);
});

test('rules name the person who asked for help and the high-risk unconfirmed one', () => {
  const b = rulesBriefing(facts(snap()));
  assert.match(b.next[0] ?? '', /Mr\. Chen/);
  assert.match(b.next[1] ?? '', /Mrs\. Alvarez.*high-risk/);
});

test('a proposed check is listed as waiting for the dispatcher', () => {
  const s = snap({ tasks: [{ id: 1, householdId: 1, state: 'proposed', helperLabel: 'A neighbor', reason: 'x' }] });
  assert.match(rulesBriefing(facts(s)).next[0] ?? '', /Approve the neighbor check for Mrs\. Alvarez/);
});

test('without a model the briefing is the rules version straight away', () => {
  const b = new Briefing(null).get(snap());
  assert.equal(b.source, 'rules');
  assert.equal(b.updating, false);
});

test('a model briefing replaces the rules one once it arrives', async () => {
  const llm = async () => JSON.stringify({ headline: 'Two people need a person to check.', next: ['Check Mr. Chen in 3A first.'] });
  const briefing = new Briefing(llm);
  const first = briefing.get(snap());
  assert.equal(first.updating, true);
  await new Promise((r) => setTimeout(r, 10));
  const second = briefing.get(snap());
  assert.equal(second.source, 'model');
  assert.equal(second.headline, 'Two people need a person to check.');
});

test('a model that returns junk falls back to rules', async () => {
  const briefing = new Briefing(async () => 'not json');
  briefing.get(snap());
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(briefing.get(snap()).source, 'rules');
});

const quake = () => snap({ checkins: [{ householdId: 1, state: 'pending', promptedAtMicros: 1 }] });

test('the template draft is bilingual, names the place, and asks for OK or HELP', async () => {
  const d = await draftAnnouncement(null, quake());
  assert.equal(d.source, 'template');
  assert.match(d.text, /earthquake.*Alder Court/i);
  assert.match(d.text, /Reply OK.*HELP/);
  assert.match(d.text, /Responde OK.*AYUDA/);
});

test('a fire event changes the wording', () => {
  assert.match(templateAnnouncement('fire', ['Alder Court']), /A fire was reported/);
});

test('a model draft is used when it is safe', async () => {
  const text = 'An earthquake was detected near Alder Court. Reply OK or HELP.\n\nSe detectó un terremoto. Responde OK o AYUDA.';
  const d = await draftAnnouncement(async () => text, quake());
  assert.equal(d.source, 'model');
  assert.equal(d.text, text);
});

test('a model draft that promises help is replaced by the template', async () => {
  const d = await draftAnnouncement(async () => 'Stay calm, help is on the way.', quake());
  assert.equal(d.source, 'template');
});

test('a failed model call falls back to the template', async () => {
  assert.equal((await draftAnnouncement(async () => null, quake())).source, 'template');
});
