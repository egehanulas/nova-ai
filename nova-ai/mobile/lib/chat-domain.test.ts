import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantSaveError, createChatService, learnBestEffort, normalizeMessagesForBackend, parseSseEvent, readChatStream, type ChatMessage, type ChatStore, type Conversation } from './chat-domain';

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
  const initial = makeConversation();
  const { store } = makeStore([initial]);
  store.save = async () => { throw new Error('database unavailable'); };
  let requested = false;
  const service = createChatService(store, async () => { requested = true; return { answer: 'no', truncated: false }; });
  await assert.rejects(service.send('u1', initial, 'Merhaba', new AbortController().signal, () => {}), /database unavailable/);
  assert.equal(requested, false);
});

test('serializes concurrent sends and reloads the latest conversation before appending', async () => {
  const initial = makeConversation([{ role: 'user', content: 'Önceki soru' }, { role: 'assistant', content: 'Önceki yanıt' }]);
  const { rows, store } = makeStore([initial]);
  const service = createChatService(store, async (messages) => {
    await new Promise((resolve) => setTimeout(resolve, 8));
    return { answer: `${messages.at(-1)?.content} yanıtı`, truncated: false };
  });
  await Promise.all([
    service.send('u1', initial, 'İlk yeni mesaj', new AbortController().signal, () => {}),
    service.send('u1', initial, 'İkinci yeni mesaj', new AbortController().signal, () => {}),
  ]);
  assert.deepEqual(rows.get(initial.id)?.messages, [
    { role: 'user', content: 'Önceki soru' }, { role: 'assistant', content: 'Önceki yanıt' },
    { role: 'user', content: 'İlk yeni mesaj' }, { role: 'assistant', content: 'İlk yeni mesaj yanıtı' },
    { role: 'user', content: 'İkinci yeni mesaj' }, { role: 'assistant', content: 'İkinci yeni mesaj yanıtı' },
  ]);
});

test('keeps the user turn and earlier history when saving the completed answer fails', async () => {
  const initial = makeConversation([{ role: 'user', content: 'Önceki soru' }, { role: 'assistant', content: 'Önceki yanıt' }]);
  const { rows, store } = makeStore([initial]);
  let saveCount = 0;
  const save = store.save;
  store.save = async (userId, row) => { saveCount += 1; if (saveCount === 2) throw new Error('write failed'); await save(userId, row); };
  const service = createChatService(store, async () => ({ answer: 'Yanıt hazır', truncated: false }));
  await assert.rejects(service.send('u1', initial, 'Yeni soru', new AbortController().signal, () => {}), (error) => error instanceof AssistantSaveError);
  assert.deepEqual(rows.get(initial.id)?.messages, [
    { role: 'user', content: 'Önceki soru' }, { role: 'assistant', content: 'Önceki yanıt' }, { role: 'user', content: 'Yeni soru' },
  ]);
});

test('cancel marks the request interrupted while preserving its saved user turn', async () => {
  const initial = makeConversation();
  const { rows, store } = makeStore([initial]);
  const service = createChatService(store, (_messages, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
  }));
  const updates: string[] = [];
  service.subscribe((event) => updates.push(event.status));
  const request = service.send('u1', initial, 'Kaydedilecek soru', new AbortController().signal, () => {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  service.cancel(initial.id);
  await assert.rejects(request, { name: 'AbortError' });
  assert.deepEqual(rows.get(initial.id)?.messages, [{ role: 'user', content: 'Kaydedilecek soru' }]);
  assert.deepEqual(updates, ['pending', 'interrupted']);
});

test('a pending reply survives leaving chat and notifies the history listener when saved', async () => {
  const initial = makeConversation();
  const { rows, store } = makeStore([initial]);
  let finishReply!: (result: { answer: string; truncated: boolean }) => void;
  const service = createChatService(store, () => new Promise((resolve) => { finishReply = resolve; }));
  let pendingSeen!: () => void;
  const pending = new Promise<void>((resolve) => { pendingSeen = resolve; });
  const chatSubscription = service.subscribe((update) => { if (update.status === 'pending') pendingSeen(); });
  const request = service.send('u1', initial, 'Sohbete döneceğim', new AbortController().signal, () => {});
  await pending;
  chatSubscription.remove(); // The chat screen unmounted while the user opened history.
  const historyUpdates: string[] = [];
  const historySubscription = service.subscribe((update) => historyUpdates.push(update.status));
  assert.equal(service.isPending(initial.id), true);
  finishReply({ answer: 'Yanıt tamamlandı', truncated: false });
  await request;
  historySubscription.remove();
  assert.deepEqual(historyUpdates, ['complete']);
  assert.deepEqual(rows.get(initial.id)?.messages, [
    { role: 'user', content: 'Sohbete döneceğim' }, { role: 'assistant', content: 'Yanıt tamamlandı' },
  ]);
});

test('keeps mobile request batches inside the backend message and character limits', () => {
  const fourteen = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `m${index}` }));
  const lastTen = normalizeMessagesForBackend(fourteen);
  assert.equal(lastTen.length, 10);
  assert.equal(lastTen[0].content, 'm4');
  const long = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `${index}`.repeat(8000) }));
  const bounded = normalizeMessagesForBackend(long);
  assert.ok(bounded.length <= 10);
  assert.ok(bounded.every((message) => message.content.length <= 8000));
  assert.ok(bounded.reduce((sum, message) => sum + message.content.length, 0) <= 20000);
});

test('memory learning failures are swallowed after a successful chat', async () => {
  await assert.doesNotReject(learnBestEffort(async () => { throw new Error('memory unavailable'); }));
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
  await assert.rejects(readChatStream(new Response('data: {"type":"done"'), () => {}), /tamamlanmamış/);
  await assert.rejects(readChatStream(new Response('data: {"type":"chunk","text":"ok"}\n\ndata: {"type":"chunk","text":"unfinished"\n\ndata: {"type":"done"}\n\n'), () => {}), /geçersiz bir yanıt olayı/);
});

test('decodes UTF-8 split inside a character and buffers JSON split across network chunks', async () => {
  const bytes = new TextEncoder().encode('data: {"type":"chunk","text":"Türkçe ı/😀"}\n\ndata: {"type":"done"}\n\n');
  const chunks = Array.from(bytes, (byte) => Uint8Array.of(byte));
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { chunks.forEach((chunk) => controller.enqueue(chunk)); controller.close(); } }));
  const updates: string[] = [];
  const result = await readChatStream(response, (answer) => updates.push(answer));
  assert.deepEqual(updates, ['Türkçe ı/😀']);
  assert.equal(result.answer, 'Türkçe ı/😀');
});

test('propagates stream cancellation and abrupt connection failure', async () => {
  const cancelled = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new DOMException('Request aborted', 'AbortError')); } }));
  await assert.rejects(readChatStream(cancelled, () => {}), { name: 'AbortError' });
  const disconnected = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('connection reset')); } }));
  await assert.rejects(readChatStream(disconnected, () => {}), /connection reset/);
});
