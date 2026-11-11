export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type Conversation = { id: string; user_id: string; title: string; messages: ChatMessage[]; created_at: string; updated_at: string };
export type StreamResult = { answer: string; truncated: boolean };

export function conversationTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 60 ? `${normalized.slice(0, 57).trimEnd()}…` : normalized || 'Yeni sohbet';
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
    // Native fetch implementations without ReadableStream still return the existing JSON chat contract.
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
    if (!event) return;
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
  } finally { reader.releaseLock(); }
  if (streamError) throw new Error(streamError);
  if (!doneEvent || !answer.trim()) throw new Error(answer ? 'Yanıt akışı beklenmedik şekilde kesildi.' : 'Sunucudan tamamlanmış bir yanıt alınamadı.');
  return { answer, truncated };
}

export type ChatStore = {
  list(userId: string): Promise<Conversation[]>;
  get(userId: string, id: string): Promise<Conversation | null>;
  create(userId: string): Promise<Conversation>;
  save(userId: string, conversation: Conversation): Promise<void>;
};
export type ChatTransport = (messages: ChatMessage[], signal: AbortSignal, onChunk: (answer: string) => void) => Promise<StreamResult>;

export function createChatService(store: ChatStore, transport: ChatTransport) {
  return {
    loadHistory: (userId: string) => store.list(userId),
    loadConversation: (userId: string, id: string) => store.get(userId, id),
    async send(userId: string, current: Conversation | null, text: string, signal: AbortSignal, onChunk: (answer: string) => void, onPrepared?: (conversation: Conversation) => void) {
      const content = text.trim();
      if (!content) throw new Error('Mesaj boş olamaz.');
      const conversation = current ?? await store.create(userId);
      const messages = [...conversation.messages, { role: 'user' as const, content }];
      const now = new Date().toISOString();
      const pending = { ...conversation, title: conversation.messages.length ? conversation.title : conversationTitle(content), messages, updated_at: now };
      await store.save(userId, pending);
      onPrepared?.(pending);
      const result = await transport(messages.slice(-14), signal, onChunk);
      const complete = { ...pending, messages: [...messages, { role: 'assistant' as const, content: result.answer }], updated_at: new Date().toISOString() };
      await store.save(userId, complete);
      return complete;
    },
  };
}
