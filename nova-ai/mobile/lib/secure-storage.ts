type SecureStoreAdapter = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

const CHUNK_SIZE = 500;

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
  return {
    async getItem(key: string) {
      const count = Number(await secureStore.getItemAsync(`${key}.count`));
      if (!Number.isInteger(count) || count < 1 || count > 100) return null;
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, index) => secureStore.getItemAsync(`${key}.${index}`)),
      );
      if (chunks.some((chunk) => chunk === null)) return null;
      return chunks.join('');
    },
    async setItem(key: string, value: string) {
      const chunks = splitValue(value);
      await secureStore.deleteItemAsync(`${key}.count`);
      for (let index = 0; index < chunks.length; index += 1) {
        await secureStore.setItemAsync(`${key}.${index}`, chunks[index]);
      }
      await secureStore.setItemAsync(`${key}.count`, String(chunks.length));
      for (let index = chunks.length; index < 100; index += 1) {
        const stale = await secureStore.getItemAsync(`${key}.${index}`);
        if (stale === null) break;
        await secureStore.deleteItemAsync(`${key}.${index}`);
      }
    },
    async removeItem(key: string) {
      for (let index = 0; index < 100; index += 1) {
        const chunk = await secureStore.getItemAsync(`${key}.${index}`);
        if (chunk === null && index > 0) break;
        if (chunk !== null) await secureStore.deleteItemAsync(`${key}.${index}`);
      }
      await secureStore.deleteItemAsync(`${key}.count`);
    },
  };
}
