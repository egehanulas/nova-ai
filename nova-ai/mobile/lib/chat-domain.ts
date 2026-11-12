export type ChatMode = 'chat' | 'research';
export type ChatMessage = { role: 'user' | 'assistant'; content: string; mode?: ChatMode };
export type ChatRequestOptions = { mode: ChatMode };
export type Conversation = { id: string; user_id: string; title: string; messages: ChatMessage[]; created_at: string; updated_at: string };
export type StreamResult = { answer: string; truncated: boolean };
export type ChatUpdate = { userId: string; conversation: Conversation; status: 'pending' | 'complete' | 'interrupted' | 'answer-save-failed' };

export class AssistantSaveError extends Error {
  conversation: Conversation;
  constructor(conversation: Conversation) {
    super('EYRION yanıtı oluşturdu ancak sohbet kaydedilemedi. Kullanıcı mesajın ve önceki sohbet geçmişin korundu.');
    this.name = 'AssistantSaveError';
    this.conversation = conversation;
  }
}

export function conversationTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 60 ? `${normalized.slice(0, 57).trimEnd()}…` : normalized || 'Yeni sohbet';
}

// Keep requests within the existing Express normalizeMessages limits.
export function normalizeMessagesForBackend(messages: ChatMessage[]): ChatMessage[] {
  const valid = messages
    .filter((message) => message && typeof message.content === 'string' && (message.role === 'user' || message.role === 'assistant'))
    .slice(-10);
  const selected: ChatMessage[] = [];
  let totalChars = 0;
  for (let index = valid.length - 1; index >= 0; index -= 1) {
    const message = valid[index];
    const content = message.content.slice(0, 8000);
    if (totalChars + content.length > 20000) {
      const remaining = 20000 - totalChars;
      if (remaining > 0) selected.push({ role: message.role, content: content.slice(-remaining) });
      break;
    }
    selected.push({ role: message.role, content });
    totalChars += content.length;
  }
  return selected.reverse().map(({ role, content }) => ({ role, content }));
}

export async function learnBestEffort(learn: () => Promise<unknown>): Promise<void> {
  try { await learn(); } catch { /* Memory learning must never fail an otherwise successful chat. */ }
}

export function parseSseEvent(eventText: string): Record<string, unknown> | null {
  const lines = eventText.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, ''));
  if (!lines.length) return null;
  try {
    const payload: unknown = JSON.parse(lines.join('\n'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  } catch { return null; }
}

export async function readChatStream(response: Response, onChunk: (answer: string) => void): Promise<StreamResult> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: unknown };
    throw new Error(typeof payload.error === 'string' ? payload.error : `Sunucu hatası (${response.status}).`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    // Keep the existing JSON response fallback for runtimes without streaming response bodies.
    const payload = await response.json().catch(() => null) as { answer?: unknown; truncated?: unknown } | null;
    if (typeof payload?.answer === 'string' && payload.answer.trim()) {
      onChunk(payload.answer);
      return { answer: payload.answer, truncated: Boolean(payload.truncated) };
    }
    throw new Error('Bu bağlantıda yanıt akışı okunamıyor.');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let doneEvent = false;
  let truncated = false;
  let streamError: string | null = null;
  const handle = (raw: string) => {
    const event = parseSseEvent(raw);
    if (!event) {
      if (raw.split(/\r?\n/).some((line) => line.startsWith('data:'))) streamError = 'Sunucudan tamamlanmamış veya geçersiz bir yanıt olayı alındı.';
      return;
    }
    if (event.type === 'chunk' && typeof event.text === 'string') {
      answer += event.text;
      onChunk(answer);
    } else if (event.type === 'done') {
      doneEvent = true;
      truncated = Boolean(event.truncated);
    } else if (event.type === 'error') streamError = typeof event.error === 'string' ? event.error : 'Yanıt akışı sırasında hata oluştu.';
  };
  try {
    while (true) {
      const part = await reader.read();
      buffer += decoder.decode(part.value ?? new Uint8Array(), { stream: !part.done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      for (const event of events) handle(event);
      if (part.done || streamError) break;
    }
    if (buffer.trim()) handle(buffer);
  } finally {
    if (streamError) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (streamError) throw new Error(streamError);
  if (!doneEvent || !answer.trim()) throw new Error(answer ? 'Yanıt akışı beklenmedik şekilde kesildi.' : 'Sunucudan tamamlanmış bir yanıt alınamadı.');
  return { answer, truncated };
}

export type ChatStore = {
  list(userId: string): Promise<Conversation[]>;
  get(userId: string, id: string): Promise<Conversation | null>;
  create(userId: string): Promise<Conversation>;
  save(userId: string, conversation: Conversation): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
};
export type ChatTransport = (messages: ChatMessage[], signal: AbortSignal, onChunk: (answer: string) => void, options: ChatRequestOptions) => Promise<StreamResult>;

export function createChatService(store: ChatStore, transport: ChatTransport) {
  const queues = new Map<string, Promise<void>>();
  const active = new Map<string, AbortController>();
  const listeners = new Set<(update: ChatUpdate) => void>();
  const notify = (update: ChatUpdate) => listeners.forEach((listener) => { try { listener(update); } catch { /* Observers cannot interrupt persistence. */ } });
  const withConversationLock = <T,>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = queues.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run.then(() => undefined, () => undefined);
    queues.set(key, tail);
    return run.finally(() => { if (queues.get(key) === tail) queues.delete(key); });
  };
  return {
    loadHistory: (userId: string) => store.list(userId),
    loadConversation: (userId: string, id: string) => store.get(userId, id),
    async renameConversation(userId: string, id: string, title: string) {
      const nextTitle = title.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!nextTitle) throw new Error('Sohbet başlığı boş olamaz.');
      return withConversationLock(`${userId}:${id}`, async () => {
        const latest = await store.get(userId, id);
        if (!latest) throw new Error('Sohbet bulunamadı veya hesabına ait değil.');
        const renamed = { ...latest, title: nextTitle, updated_at: new Date().toISOString() };
        await store.save(userId, renamed);
        notify({ userId, conversation: renamed, status: 'complete' });
        return renamed;
      });
    },
    async deleteConversation(userId: string, id: string) {
      return withConversationLock(`${userId}:${id}`, async () => {
        if (!await store.get(userId, id)) throw new Error('Sohbet bulunamadı veya hesabına ait değil.');
        await store.delete(userId, id);
      });
    },
    subscribe(listener: (update: ChatUpdate) => void) {
      listeners.add(listener);
      return { remove: () => { listeners.delete(listener); } };
    },
    isPending: (conversationId: string) => active.has(conversationId),
    cancel: (conversationId: string) => active.get(conversationId)?.abort(),
    async send(userId: string, current: Conversation | null, text: string, signal: AbortSignal, onChunk: (answer: string) => void, onPrepared?: (conversation: Conversation) => void, mode: ChatMode = 'chat') {
      const content = text.trim();
      if (!content) throw new Error('Mesaj boş olamaz.');
      const base = current ?? await store.create(userId);
      return withConversationLock(`${userId}:${base.id}`, async () => {
        const latest = await store.get(userId, base.id);
        if (!latest) throw new Error('Sohbet kaydı bulunamadı veya erişim izni yok.');
        const controller = new AbortController();
        const abortFromCaller = () => controller.abort(signal.reason);
        if (signal.aborted) abortFromCaller();
        else signal.addEventListener('abort', abortFromCaller, { once: true });
        active.set(base.id, controller);
        const userMessage: ChatMessage = { role: 'user', content, ...(mode === 'research' ? { mode } : {}) };
        const messages = [...latest.messages, userMessage];
        const pending = { ...latest, title: latest.messages.length ? latest.title : conversationTitle(content), messages, updated_at: new Date().toISOString() };
        let userTurnSaved = false;
        try {
          await store.save(userId, pending);
          userTurnSaved = true;
          onPrepared?.(pending);
          notify({ userId, conversation: pending, status: 'pending' });
          const result = await transport(normalizeMessagesForBackend(messages), controller.signal, onChunk, { mode });
          const complete = { ...pending, messages: [...messages, { role: 'assistant' as const, content: result.answer }], updated_at: new Date().toISOString() };
          try { await store.save(userId, complete); }
          catch { notify({ userId, conversation: pending, status: 'answer-save-failed' }); throw new AssistantSaveError(pending); }
          notify({ userId, conversation: complete, status: 'complete' });
          return complete;
        } catch (error) {
          if (userTurnSaved && !(error instanceof AssistantSaveError)) notify({ userId, conversation: pending, status: 'interrupted' });
          throw error;
        } finally {
          signal.removeEventListener('abort', abortFromCaller);
          active.delete(base.id);
        }
      });
    },
    async retryLast(userId: string, id: string, signal: AbortSignal, onChunk: (answer: string) => void) {
      return withConversationLock(`${userId}:${id}`, async () => {
        const latest = await store.get(userId, id);
        const last = latest?.messages.at(-1);
        if (!latest || last?.role !== 'user') throw new Error('Yeniden denenecek tamamlanmamış bir yanıt bulunamadı.');
        const mode = last.mode ?? 'chat';
        const controller = new AbortController();
        const abortFromCaller = () => controller.abort(signal.reason);
        if (signal.aborted) abortFromCaller();
        else signal.addEventListener('abort', abortFromCaller, { once: true });
        active.set(id, controller);
        notify({ userId, conversation: latest, status: 'pending' });
        try {
          const result = await transport(normalizeMessagesForBackend(latest.messages), controller.signal, onChunk, { mode });
          const complete = { ...latest, messages: [...latest.messages, { role: 'assistant' as const, content: result.answer }], updated_at: new Date().toISOString() };
          try { await store.save(userId, complete); }
          catch { notify({ userId, conversation: latest, status: 'answer-save-failed' }); throw new AssistantSaveError(latest); }
          notify({ userId, conversation: complete, status: 'complete' });
          return complete;
        } catch (error) {
          if (!(error instanceof AssistantSaveError)) notify({ userId, conversation: latest, status: 'interrupted' });
          throw error;
        } finally {
          signal.removeEventListener('abort', abortFromCaller);
          active.delete(id);
        }
      });
    },
  };
}
