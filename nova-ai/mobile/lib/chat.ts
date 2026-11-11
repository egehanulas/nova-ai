import { apiRequest, apiStreamRequest } from './api';
import { createChatService, readChatStream, type ChatMessage, type ChatStore, type Conversation } from './chat-domain';
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
};

function normalizeConversation(row: Record<string, unknown>): Conversation {
  const messages = Array.isArray(row.messages) ? row.messages.flatMap((entry): ChatMessage[] => {
    if (!entry || typeof entry !== 'object') return [];
    const message = entry as Record<string, unknown>;
    return (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' ? [{ role: message.role, content: message.content }] : [];
  }) : [];
  return { id: String(row.id), user_id: String(row.user_id), title: typeof row.title === 'string' ? row.title : 'Yeni sohbet', messages,
    created_at: String(row.created_at), updated_at: String(row.updated_at) };
}

async function requestAnswer(messages: ChatMessage[], signal: AbortSignal, onChunk: (answer: string) => void) {
  const response = await apiStreamRequest('/api/chat/stream', { messages }, signal);
  return readChatStream(response, onChunk);
}

export const chatService = createChatService(store, requestAnswer);

export async function learnFromMessage(message: string) {
  try {
    await apiRequest<{ saved?: boolean }>('/api/memories/learn', { method: 'POST', body: JSON.stringify({ message }) });
  } catch {
    // The existing API intentionally treats learning as best-effort; a memory failure must not fail a saved chat.
  }
}
