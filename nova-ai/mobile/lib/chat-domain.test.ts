import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatService, parseSseEvent, readChatStream, type ChatMessage, type ChatStore, type Conversation } from './chat-domain';

const makeConversation = (messages: ChatMessage[] = []): Conversation => ({ id: 'c1', user_id: 'u1', title: 'Yeni sohbet', messages, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' });

function makeStore(initial: Conversation[] = []) {
  const rows = new Map(initial.map((row) => [row.id, row]));
  let next = 0;
  const store: ChatStore = {
    async list(userId) { return [...rows.values()].filter((row) => row.user_id === userId).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); },
    async get(userId, id) { const row = rows.get(id); return row?.user_id === userId ? row : null; },
    async create(userId) { const row = { ...makeConversation(), id: `c${++next}`, user_id: userId }; rows.set(row.id, row); return row; },
    async save(userId, row) { if (row.user_id !== userId) throw new Error('RLS'); rows.set(row.id, row); },
  };
  return { rows, store };
}

test('creates a conversation, stores user and assistant turns, and titles it from the first message', async () => {
  const { rows, store } = makeStore();
  const service = createChatService(store, async (_messages, _signal, onChunk) => { onChunk('Merhaba'); return { answer: 'Merhaba', truncated: false }; });
  const prepared: Conversation[] = [];
  const saved = await service.send('u1', null, '  Merhaba EYRION  ', new AbortController().signal, () => {}, (row) => prepared.push(row));
  assert.equal(prepared.length, 1);
  assert.equal(saved.title, 'Merhaba EYRION');
  assert.deepEqual(saved.messages, [{ role: 'user', content: 'Merhaba EYRION' }, { role: 'assistant', content: 'Merhaba' }]);
  assert.equal(rows.get(saved.id)?.messages.length, 2);
});

test('loads only the requested user history and hides foreign conversations', async () => {
  const first = makeConversation([{ role: 'user', content: 'Selam' }]);
  const foreign = { ...makeConversation(), id: 'c2', user_id: 'other' };
  const { store } = makeStore([first, foreign]);
  const service = createChatService(store, async () => ({ answer: 'ok', truncated: false }));
  assert.deepEqual(await service.loadHistory('u1'), [first]);
  assert.equal(await service.loadConversation('u1', 'c2'), null);
});

test('keeps the saved user turn when the model request fails', async () => {
  const { rows, store } = makeStore();
  const service = createChatService(store, async () => { throw new Error('offline'); });
  await assert.rejects(service.send('u1', null, 'Kaydet beni', new AbortController().signal, () => {}), /offline/);
  const row = [...rows.values()][0];
  assert.deepEqual(row.messages, [{ role: 'user', content: 'Kaydet beni' }]);
});

test('does not persist a model answer if saving the user turn fails', async () => {
  const { store } = makeStore();
  store.save = async () => { throw new Error('database unavailable'); };
  let requested = false;
  const service = createChatService(store, async () => { requested = true; return { answer: 'no', truncated: false }; });
  await assert.rejects(service.send('u1', makeConversation(), 'Merhaba', new AbortController().signal, () => {}), /database unavailable/);
  assert.equal(requested, false);
});

test('parses SSE chunks and emits Turkish text progressively', async () => {
  assert.deepEqual(parseSseEvent('data: {"type":"chunk","text":"ı"}'), { type: 'chunk', text: 'ı' });
  const response = new Response('data: {"type":"chunk","text":"Merha"}\n\ndata: {"type":"chunk","text":"ba, dünya!"}\n\ndata: {"type":"done"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  const updates: string[] = [];
  const result = await readChatStream(response, (value) => updates.push(value));
  assert.deepEqual(updates, ['Merha', 'Merhaba, dünya!']);
  assert.deepEqual(result, { answer: 'Merhaba, dünya!', truncated: false });
});

test('reports SSE server errors and interrupted streams', async () => {
  await assert.rejects(readChatStream(new Response('data: {"type":"error","error":"Model unavailable"}\n\n'), () => {}), /Model unavailable/);
  await assert.rejects(readChatStream(new Response('data: {"type":"chunk","text":"partial"}\n\n'), () => {}), /beklenmedik/);
});
