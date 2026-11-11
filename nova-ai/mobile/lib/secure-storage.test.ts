import test from 'node:test';
import assert from 'node:assert/strict';
import { createChunkedSecureStorage } from './secure-storage';

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); },
    deleteItemAsync: async (key: string) => { values.delete(key); },
  };
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

test('secure storage rejects incomplete and invalid chunk manifests', async () => {
  const storage = memoryStore();
  const adapter = createChunkedSecureStorage(storage);
  await storage.setItemAsync('auth.count', '2');
  await storage.setItemAsync('auth.0', 'partial');
  assert.equal(await adapter.getItem('auth'), null);
  await storage.setItemAsync('auth.count', '999');
  assert.equal(await adapter.getItem('auth'), null);
});

test('secure storage replaces and removes session chunks', async () => {
  const storage = memoryStore();
  const adapter = createChunkedSecureStorage(storage);
  await adapter.setItem('auth', 'x'.repeat(1200));
  await adapter.setItem('auth', 'new');
  assert.equal(await adapter.getItem('auth'), 'new');
  assert.equal(storage.values.has('auth.2'), false);
  await adapter.removeItem('auth');
  assert.equal(await adapter.getItem('auth'), null);
});
