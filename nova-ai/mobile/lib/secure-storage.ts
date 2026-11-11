type SecureStoreAdapter = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

const CHUNK_SIZE = 500;
const MAX_CHUNKS = 100;

function validCount(value: string | null) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_CHUNKS ? count : null;
}

async function clearChunks(store: SecureStoreAdapter, key: string, limit = MAX_CHUNKS) {
  for (let index = 0; index < Math.min(limit, MAX_CHUNKS); index += 1) {
    const item = await store.getItemAsync(`${key}.${index}`);
    if (item !== null) await store.deleteItemAsync(`${key}.${index}`);
  }
}

async function clearInvalidSession(store: SecureStoreAdapter, key: string, limit = MAX_CHUNKS) {
  await store.setItemAsync(`${key}.writing`, '1');
  await store.deleteItemAsync(`${key}.count`);
  await clearChunks(store, key, limit);
  await store.deleteItemAsync(`${key}.writing`);
}

function splitValue(value: string) {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + CHUNK_SIZE, value.length);
    if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end -= 1;
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks.length ? chunks : [''];
}

export function createChunkedSecureStorage(secureStore: SecureStoreAdapter) {
  let operation = Promise.resolve();
  const serialize = <T,>(run: () => Promise<T>) => {
    const result = operation.then(run);
    operation = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    getItem(key: string) {
      return serialize(async () => {
        if (await secureStore.getItemAsync(`${key}.writing`)) {
          await secureStore.deleteItemAsync(`${key}.count`);
          await clearChunks(secureStore, key);
          await secureStore.deleteItemAsync(`${key}.writing`);
          return null;
        }
        const countRaw = await secureStore.getItemAsync(`${key}.count`);
        const count = validCount(countRaw);
        if (countRaw !== null && count === null) {
          await clearInvalidSession(secureStore, key);
          return null;
        }
        if (count === null) return null;
        const chunks: string[] = [];
        for (let index = 0; index < count; index += 1) {
          const chunk = await secureStore.getItemAsync(`${key}.${index}`);
          if (chunk === null) {
            await clearInvalidSession(secureStore, key, count);
            return null;
          }
          chunks.push(chunk);
        }
        return chunks.join('');
      });
    },
    setItem(key: string, value: string) {
      return serialize(async () => {
        const chunks = splitValue(value);
        if (chunks.length > MAX_CHUNKS) throw new Error('Secure session exceeds the supported storage size.');
        const oldCount = validCount(await secureStore.getItemAsync(`${key}.count`)) ?? 0;
        await secureStore.setItemAsync(`${key}.writing`, '1');
        try {
          await secureStore.deleteItemAsync(`${key}.count`);
          for (let index = 0; index < chunks.length; index += 1) {
            await secureStore.setItemAsync(`${key}.${index}`, chunks[index]);
          }
          await secureStore.setItemAsync(`${key}.count`, String(chunks.length));
          for (let index = chunks.length; index < oldCount; index += 1) {
            await secureStore.deleteItemAsync(`${key}.${index}`);
          }
          await secureStore.deleteItemAsync(`${key}.writing`);
        } catch (error) {
          await secureStore.deleteItemAsync(`${key}.count`).catch(() => undefined);
          try {
            await clearChunks(secureStore, key, Math.max(oldCount, chunks.length));
            await secureStore.deleteItemAsync(`${key}.writing`);
          } catch {
            // Keep the write marker so the next app launch retries cleanup.
          }
          throw error;
        }
      });
    },
    removeItem(key: string) {
      return serialize(async () => {
        const count = validCount(await secureStore.getItemAsync(`${key}.count`)) ?? MAX_CHUNKS;
        await secureStore.setItemAsync(`${key}.writing`, '1');
        await secureStore.deleteItemAsync(`${key}.count`);
        await clearChunks(secureStore, key, count);
        await secureStore.deleteItemAsync(`${key}.writing`);
      });
    },
  };
}
