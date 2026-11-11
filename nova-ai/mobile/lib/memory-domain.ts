export type UserMemory = { id: string; content: string; category: string; source: string; created_at: string; updated_at: string };
export type MemoryTransport = {
  list(): Promise<UserMemory[]>;
  create(content: string, category: string): Promise<UserMemory>;
  update(id: string, content: string, category: string): Promise<UserMemory>;
  delete(id: string): Promise<void>;
};

export function createMemoryService(transport: MemoryTransport) {
  const validate = (content: string, category: string) => {
    const normalized = content.trim();
    if (!normalized || normalized.length > 1000) throw new Error('Hafıza notu 1–1000 karakter arasında olmalı.');
    return { content: normalized, category: category.trim().slice(0, 40) || 'general' };
  };
  return {
    list: () => transport.list(),
    async create(content: string, category = 'general') {
      const input = validate(content, category);
      return transport.create(input.content, input.category);
    },
    async update(id: string, content: string, category = 'general') {
      const input = validate(content, category);
      return transport.update(id, input.content, input.category);
    },
    delete: (id: string) => transport.delete(id),
  };
}
