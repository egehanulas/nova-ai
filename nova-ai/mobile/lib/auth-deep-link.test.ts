import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthLinkQueue, parseAuthCallback } from './auth-deep-link';

const validUrl = 'eyrionai://auth/callback?code=pkce-code-123';

test('auth callback accepts only one PKCE code on the registered callback URL', () => {
  assert.deepEqual(parseAuthCallback(validUrl), { code: 'pkce-code-123' });
});

test('auth callback rejects unexpected URLs, credentials, and malformed parameters', () => {
  for (const url of [
    'https://auth/callback?code=x',
    'eyrionai://other/callback?code=x',
    'eyrionai://auth/other?code=x',
    'eyrionai://attacker@auth/callback?code=x',
    'eyrionai://auth:1234/callback?code=x',
    'eyrionai://auth/callback',
    'eyrionai://auth/callback?code=',
    'eyrionai://auth/callback?code=x&code=y',
    'eyrionai://auth/callback?code=x&next=https://attacker.test',
    'eyrionai://auth/callback?access_token=x&refresh_token=y',
    'eyrionai://auth/callback?code=x#fragment',
    'eyrionai://auth/callback?code=%20bad%20',
  ]) assert.throws(() => parseAuthCallback(url));
});

test('auth callback queue waits for session hydration and deduplicates initial and live links', async () => {
  const exchanged: string[] = [];
  const queue = createAuthLinkQueue(async (code) => { exchanged.push(code); });
  const first = queue.enqueue(validUrl);
  const duplicate = queue.enqueue(validUrl);
  await Promise.resolve();
  assert.deepEqual(exchanged, []);
  queue.sessionLoaded();
  await Promise.all([first, duplicate, queue.flush()]);
  assert.deepEqual(exchanged, ['pkce-code-123']);
});

test('a rejected auth link does not block later callback processing', async () => {
  const exchanged: string[] = [];
  const queue = createAuthLinkQueue(async (code) => { exchanged.push(code); });
  queue.sessionLoaded();
  await assert.rejects(queue.enqueue('https://attacker.test/?code=bad'));
  await queue.enqueue('eyrionai://auth/callback?code=good');
  assert.deepEqual(exchanged, ['good']);
});
