import test from 'node:test';
import assert from 'node:assert/strict';
import { createChunkedSecureStorage } from './secure-storage';

function memoryStore() {
  const values = new Map<string, string>();
  const store = {
    values,
    failOnKey: undefined as string | undefined,
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      if (key === store.failOnKey) throw new Error('Simulated interrupted secure write');
      values.set(key, value);
    },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
  return store;
}

test('secure storage splits large session payloads and restores them exactly', async () => {
  const storage = memoryStore();
  const adapter = createChunkedSecureStorage(storage);
  const payload = '🪐EYRION-şifreli-oturum-'.repeat(160);
  await adapter.setItem('auth', payload);
  assert.equal(storage.values.get('auth.count'), String(Math.ceil(payload.length / 500)));
  assert.ok([...storage.values.entries()].filter(([key]) => /^auth\.\d+$/.test(key)).every(([, value]) => value.length <= 500));
  assert.ok([...storage.values.entries()].filter(([key]) => /^auth\.\d+$/.test(key)).every(([, value]) => !/[\uD800-\uDBFF]$/.test(value)));
  assert.equal(await adapter.getItem('auth'), payload);
});

test('secure storage rejects incomplete and invalid chunk manifests and clears remaining fragments', async () => {
  const storage = memoryStore();
  const adapter = createChunkedSecureStorage(storage);
  await storage.setItemAsync('auth.count', '3');
  await storage.setItemAsync('auth.0', 'partial');
  await storage.setItemAsync('auth.2', 'orphan');
  assert.equal(await adapter.getItem('auth'), null);
  assert.equal(storage.values.has('auth.2'), false);
  await storage.setItemAsync('auth.count', '999');
  assert.equal(await adapter.getItem('auth'), null);
});

test('secure storage replaces and removes session chunks', async () => {
  const storage = memoryStore();
  const adapter = createChunkedSecureStorage(storage);
  await adapter.setItem('auth', 'x'.repeat(1200));
  const restartedAdapter = createChunkedSecureStorage(storage);
  assert.equal(await restartedAdapter.getItem('auth'), 'x'.repeat(1200));
  await adapter.setItem('auth', 'new');
  assert.equal(await adapter.getItem('auth'), 'new');
  assert.equal(storage.values.has('auth.2'), false);
  await adapter.removeItem('auth');
  assert.equal(await adapter.getItem('auth'), null);
});

test('secure storage recovers after an interrupted write and app restart', async () => {
  const storage = memoryStore();
  const adapter = createChunkedSecureStorage(storage);
  storage.failOnKey = 'auth.2';
  await assert.rejects(adapter.setItem('auth', 'secret-'.repeat(300)), /Simulated interrupted/);
  storage.failOnKey = undefined;
  const restartedAdapter = createChunkedSecureStorage(storage);
  assert.equal(await restartedAdapter.getItem('auth'), null);
  assert.equal([...storage.values.keys()].filter((key) => key.startsWith('auth.')).length, 0);
});

test('secure storage refuses payloads larger than the manifest can represent', async () => {
  const storage = memoryStore();
  const adapter = createChunkedSecureStorage(storage);
  await adapter.setItem('auth', 'existing-session');
  await assert.rejects(adapter.setItem('auth', 'x'.repeat(500 * 101)), /exceeds the supported storage size/);
  assert.equal(await adapter.getItem('auth'), 'existing-session');
});

test('secure storage clears a write interrupted by process termination and removes sessions', async () => {
  const storage = memoryStore();
  await storage.setItemAsync('auth.writing', '1');
  await storage.setItemAsync('auth.0', 'secret');
  await storage.setItemAsync('auth.2', 'orphan');
  const restartedAdapter = createChunkedSecureStorage(storage);
  assert.equal(await restartedAdapter.getItem('auth'), null);
  assert.equal([...storage.values.keys()].filter((key) => key.startsWith('auth.')).length, 0);
  await restartedAdapter.setItem('auth', 'signed-in');
  await restartedAdapter.removeItem('auth');
  assert.equal(await restartedAdapter.getItem('auth'), null);
  assert.equal([...storage.values.keys()].filter((key) => key.startsWith('auth.')).length, 0);

  await restartedAdapter.setItem('auth', 'session-before-interrupted-removal');
  await storage.setItemAsync('auth.writing', '1');
  await storage.deleteItemAsync('auth.count');
  const afterInterruptedRemoval = createChunkedSecureStorage(storage);
  assert.equal(await afterInterruptedRemoval.getItem('auth'), null);
  assert.equal([...storage.values.keys()].filter((key) => key.startsWith('auth.')).length, 0);
});
