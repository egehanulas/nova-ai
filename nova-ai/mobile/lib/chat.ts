import { apiRequest, apiStreamRequest } from './api';
import { createChatService, learnBestEffort, readChatStream, type ChatMessage, type ChatStore, type ChatRequestOptions, type Conversation } from './chat-domain';
import { supabase } from './supabase';

const columns = 'id,user_id,title,messages,created_at,updated_at';
const store: ChatStore = {
  async list(userId) {
    const { data, error } = await supabase.from('conversations').select(columns).eq('user_id', userId).order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(normalizeConversation);
  },
  async get(userId, id) {
    const { data, error } = await supabase.from('conversations').select(columns).eq('user_id', userId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? normalizeConversation(data) : null;
  },
  async create(userId) {
    const { data, error } = await supabase.from('conversations').insert({ user_id: userId, title: 'Yeni sohbet', messages: [] }).select(columns).single();
    if (error) throw error;
    return normalizeConversation(data);
  },
  async save(userId, conversation) {
    const { data, error } = await supabase.from('conversations').update({ title: conversation.title, messages: conversation.messages, updated_at: conversation.updated_at }).eq('id', conversation.id).eq('user_id', userId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Sohbet kaydı bulunamadı veya erişim izni yok.');
  },
  async delete(userId, id) {
    const { data, error } = await supabase.from('conversations').delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Sohbet bulunamadı veya silme izni yok.');
  },
};

function normalizeConversation(row: Record<string, unknown>): Conversation {
  const messages = Array.isArray(row.messages) ? row.messages.flatMap((entry): ChatMessage[] => {
    if (!entry || typeof entry !== 'object') return [];
    const message = entry as Record<string, unknown>;
    return (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' ? [{ role: message.role, content: message.content, ...(message.mode === 'research' ? { mode: 'research' as const } : {}) }] : [];
  }) : [];
  return { id: String(row.id), user_id: String(row.user_id), title: typeof row.title === 'string' ? row.title : 'Yeni sohbet', messages,
    created_at: String(row.created_at), updated_at: String(row.updated_at) };
}

function appendSources(answer: string, sources: unknown) {
  if (!Array.isArray(sources)) return answer;
  const valid = sources.flatMap((source) => {
    if (!source || typeof source !== 'object') return [];
    const item = source as Record<string, unknown>;
    if (typeof item.url !== 'string' || typeof item.title !== 'string') return [];
    try {
      const url = new URL(item.url);
      return url.protocol === 'https:' ? [`- [${item.title.replace(/[\[\]]/g, '')}](${url.toString()})`] : [];
    } catch { return []; }
  }).slice(0, 8);
  return valid.length ? `${answer.trim()}\n\n**Kaynaklar**\n${valid.join('\n')}` : answer;
}

async function requestAnswer(messages: ChatMessage[], signal: AbortSignal, onChunk: (answer: string) => void, options: ChatRequestOptions) {
  if (options.mode === 'research') {
    const result = await apiRequest<{ answer?: unknown; sources?: unknown; partial?: unknown }>('/api/research', {
      method: 'POST', signal, body: JSON.stringify({ messages, contextTruncated: options.contextTruncated }),
    });
    if (result.partial === true) throw Object.assign(new Error('Araştırma yanıtı kaynak alıntılarıyla sınırlı kaldı.'), { code: 'AI_INCOMPLETE' });
    if (typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('Araştırmadan tamamlanmış bir yanıt alınamadı.');
    const answer = appendSources(result.answer, result.sources);
    onChunk(answer);
    return { answer, truncated: false };
  }
  const response = await apiStreamRequest('/api/chat/stream', { messages, contextTruncated: options.contextTruncated }, signal);
  return readChatStream(response, onChunk);
}

export const chatService = createChatService(store, requestAnswer);

export async function learnFromMessage(message: string) {
  await learnBestEffort(() => apiRequest<{ saved?: boolean }>('/api/memories/learn', { method: 'POST', body: JSON.stringify({ message }) }));
}
