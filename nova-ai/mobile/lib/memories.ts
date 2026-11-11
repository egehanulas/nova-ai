import { apiRequest } from './api';
import { createMemoryService, type UserMemory } from './memory-domain';

type MemoryResponse = { success?: boolean; memories?: UserMemory[]; memory?: UserMemory };

export const memoryService = createMemoryService({
  async list() {
    const response = await apiRequest<MemoryResponse>('/api/memories');
    return Array.isArray(response.memories) ? response.memories : [];
  },
  async create(content, category) {
    const response = await apiRequest<MemoryResponse>('/api/memories', { method: 'POST', body: JSON.stringify({ content, category }) });
    if (!response.memory) throw new Error('Sunucu kaydedilen hafızayı döndürmedi.');
    return response.memory;
  },
  async update(id, content, category) {
    const response = await apiRequest<MemoryResponse>(`/api/memories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ content, category }) });
    if (!response.memory) throw new Error('Sunucu güncellenen hafızayı döndürmedi.');
    return response.memory;
  },
  async delete(id) {
    await apiRequest<{ success?: boolean }>(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
});
