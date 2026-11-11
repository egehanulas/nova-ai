import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSessionSync } from './auth-session-sync';

test('late initial-session reads cannot overwrite newer auth-state events', () => {
  let session = 'logged-out';
  const sync = createAuthSessionSync<string>((next) => { session = next; });
  const readRevision = sync.revision;
  sync.fromAuthEvent('deep-link-session');
  assert.equal(sync.applySnapshotIfCurrent(readRevision, 'stale-session'), false);
  assert.equal(session, 'deep-link-session');
});

test('session snapshots apply when no newer auth-state event arrived', () => {
  let session = 'logged-out';
  const sync = createAuthSessionSync<string>((next) => { session = next; });
  const readRevision = sync.revision;
  assert.equal(sync.applySnapshotIfCurrent(readRevision, 'stored-session'), true);
  assert.equal(session, 'stored-session');
});
