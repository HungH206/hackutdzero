import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized } from '../src/admin-auth.ts';
test('protected admin rejects missing and incorrect credentials', () => {
  assert.equal(authorized(undefined, 'test-token'), false);
  assert.equal(authorized('Bearer wrong', 'test-token'), false);
  assert.equal(authorized('Basic '+Buffer.from('other:test-token').toString('base64'), 'test-token'), false);
});
test('protected admin accepts dispatcher Basic and Bearer credentials', () => {
  assert.equal(authorized('Bearer test-token', 'test-token'), true);
  assert.equal(authorized('Basic '+Buffer.from('dispatcher:test-token').toString('base64'), 'test-token'), true);
});
