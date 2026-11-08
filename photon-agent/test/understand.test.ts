import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guardMessage, promisesHelp } from '../src/guard.ts';
import { keywordUnderstand } from '../src/understand.ts';
import { copy } from '../src/copy.ts';
import type { UnderstandContext } from '../src/types.ts';

const ctx = (text: string, over: Partial<UnderstandContext> = {}): UnderstandContext => ({
  text, selfHouseholdId: 7, careFor: [], roster: [{ id: 1, name: 'Mrs. Alvarez', unit: '1A' }, { id: 7, name: 'Sam Lee', unit: '2B' }],
  pendingHelperFor: null, eventActive: true, ...over,
});
const kind = (text: string, over?: Partial<UnderstandContext>) => keywordUnderstand(ctx(text, over)).claims[0]?.kind;

const SELF: [string, string | undefined][] = [
  ["I'm ok", 'safe'], ['k', 'safe'], ['fine', 'safe'], ['estoy bien', 'safe'],
  ['lol help', 'needs_help'], ['fine but my leg is stuck', 'needs_help'], ['not ok', 'needs_help'], ['no puedo salir, mi pierna', 'needs_help'],
  ['what', undefined],
];
for (const [text, want] of SELF) test(`reads "${text}"`, () => assert.equal(kind(text), want));

test('detects Spanish', () => assert.equal(keywordUnderstand(ctx('no puedo salir, mi pierna')).language, 'es'));

test('a daughter reporting dialysis is secondhand and about her mother', () => {
  const u = keywordUnderstand(ctx("she's at dialysis today", { selfHouseholdId: null, careFor: [{ id: 1, name: 'Mrs. Alvarez' }] }));
  assert.deepEqual([u.claims[0]?.subjectHouseholdId, u.claims[0]?.kind, u.claims[0]?.firsthand], [1, 'away', false]);
});

test('seeing someone is firsthand', () => {
  const u = keywordUnderstand(ctx('I saw Mrs. Alvarez walk out, she is ok'));
  assert.deepEqual([u.claims[0]?.subjectHouseholdId, u.claims[0]?.kind, u.claims[0]?.firsthand], [1, 'safe', true]);
});

for (const [text, want] of [['yes', 'accept'], ['on my way', 'accept'], ['voy', 'accept'], ['no sorry', 'decline'], ['she is fine', 'found_ok'], ['he is hurt', 'found_needs_help']] as const) {
  test(`helper reply "${text}" is ${want}`, () => assert.equal(keywordUnderstand(ctx(text, { pendingHelperFor: 'Mrs. Alvarez' })).helper, want));
}

for (const text of ['Help is on the way', 'Someone is coming to you', "We'll send help", 'Paramedics will arrive soon', 'La ayuda va en camino', 'Alguien viene a ayudarte', 'A neighbor has agreed to come check on you']) {
  test(`blocks: ${text}`, () => assert.ok(promisesHelp(text)));
}
for (const text of [copy.selfHelp('en'), copy.selfHelp('es'), copy.noPromiseFallback('en'), copy.noPromiseFallback('es'), copy.reportHelp('en', 'Ana'), copy.checkin('en', 'quake'), copy.ask('en', 2, 'Elm')]) {
  test(`allows: ${text.slice(0, 40)}`, () => assert.ok(!promisesHelp(text), text));
}

test('a promise only passes when a neighbor accepted', () => {
  assert.equal(guardMessage('Help is on the way', false, 'nope').text, 'nope');
  assert.equal(guardMessage('Help is on the way', true, 'nope').text, 'Help is on the way');
});
