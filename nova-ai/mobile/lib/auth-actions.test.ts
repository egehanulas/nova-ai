import assert from 'node:assert/strict';
import test from 'node:test';
import { signOutSafely } from './auth-actions';

test('reports successful sign out', async () => {
  assert.equal(await signOutSafely(async () => ({ error: null })), true);
});

test('reports Supabase sign out errors and rejected requests', async () => {
  assert.equal(await signOutSafely(async () => ({ error: new Error('offline') })), false);
  assert.equal(await signOutSafely(async () => { throw new Error('offline'); }), false);
});
