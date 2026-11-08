import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSafeNumber } from '../src/voice.ts';

for (const n of ['911', '+1911', '1-911', '112', '+1 999', 'abc', '5551234']) test(`refuses ${n}`, () => assert.throws(() => assertSafeNumber(n), /Refusing/));
test('allows an ordinary number', () => assert.doesNotThrow(() => assertSafeNumber('+14155550123')));
