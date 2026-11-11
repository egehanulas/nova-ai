import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryService, type UserMemory } from './memory-domain';

const record: UserMemory = { id: 'm1', content: 'Türkçe yanıtları severim', category: 'preference', source: 'user', created_at: '2026-01-01', updated_at: '2026-01-01' };

test('creates, updates, lists and deletes through the authenticated memory transport', async () => {
  const rows = new Map([[record.id, record]]);
  const service = createMemoryService({
    async list() { return [...rows.values()]; },
    async create(content, category) { const next = { ...record, id: 'm2', content, category }; rows.set(next.id, next); return next; },
    async update(id, content, category) { const next = { ...record, id, content, category }; rows.set(id, next); return next; },
    async delete(id) { rows.delete(id); },
  });
  const created = await service.create(' Yeni tercih ', ' ');
  assert.equal(created.content, 'Yeni tercih');
  assert.equal(created.category, 'general');
  const updated = await service.update(created.id, 'Güncellenmiş tercih', 'profile');
  assert.equal(updated.content, 'Güncellenmiş tercih');
  assert.equal((await service.list()).length, 2);
  await service.delete(created.id);
  assert.equal((await service.list()).length, 1);
});

test('rejects empty or oversized memory before a request is made', async () => {
  let calls = 0;
  const service = createMemoryService({ list: async () => [], create: async () => { calls++; return record; }, update: async () => record, delete: async () => {} });
  await assert.rejects(service.create('   '), /1–1000/);
  await assert.rejects(service.create('x'.repeat(1001)), /1–1000/);
  assert.equal(calls, 0);
});
