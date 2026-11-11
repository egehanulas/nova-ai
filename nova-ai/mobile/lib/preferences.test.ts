import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreferenceRepository, defaultPreferences } from './preferences';

function makeStorage() {
  const values = new Map<string, string>();
  return { values, storage: {
    async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); },
  } };
}

test('loads defaults and persists preferences separately for each user', async () => {
  const { storage } = makeStorage();
  const repository = createPreferenceRepository(storage);
  assert.deepEqual(await repository.load('u1'), defaultPreferences);
  const changed = { ...defaultPreferences, autoLearnMemories: false, speakResponses: true };
  await repository.save('u1', changed);
  assert.deepEqual(await repository.load('u1'), changed);
  assert.deepEqual(await repository.load('u2'), defaultPreferences);
});

test('recovers safely from malformed and incomplete preference records', async () => {
  const { values, storage } = makeStorage();
  const repository = createPreferenceRepository(storage);
  values.set('eyrion.mobile.preferences.v1.u1', '{bad');
  assert.deepEqual(await repository.load('u1'), defaultPreferences);
  values.set('eyrion.mobile.preferences.v1.u2', JSON.stringify({ speakResponses: true }));
  assert.deepEqual(await repository.load('u2'), { ...defaultPreferences, speakResponses: true });
});
