import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomNav } from '../../components/BottomNav';
import { BrandMark } from '../../components/BrandMark';
import { useAuth } from '../../lib/auth-context';
import { chatService } from '../../lib/chat';
import type { ChatUpdate, Conversation } from '../../lib/chat-domain';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme';

export default function HistoryScreen() {
  const { session, ready } = useAuth();
  const userId = session?.user.id;
  const [rows, setRows] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [statuses, setStatuses] = useState<Record<string, 'pending' | 'interrupted' | 'save-failed'>>({});
  const load = useCallback(async (refresh = false) => {
    if (!userId) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const loaded = await chatService.loadHistory(userId);
      setRows((current) => mergeConversations(current, loaded));
      setStatuses((current) => {
        const next = { ...current };
        for (const row of loaded) {
          if (chatService.isPending(row.id)) next[row.id] = 'pending';
          else if (next[row.id] === 'pending') delete next[row.id];
        }
        return next;
      });
    }
    catch { setError('Sohbet geçmişine ulaşılamadı. Bağlantını kontrol edip yeniden dene.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [userId]);
  const onChatUpdate = useCallback((update: ChatUpdate) => {
    if (!userId || update.userId !== userId) return;
    setRows((current) => mergeConversations(current, [update.conversation]));
    setStatuses((current) => {
      const next = { ...current };
      if (update.status === 'pending') next[update.conversation.id] = 'pending';
      else if (update.status === 'interrupted') next[update.conversation.id] = 'interrupted';
      else if (update.status === 'answer-save-failed') next[update.conversation.id] = 'save-failed';
      else delete next[update.conversation.id];
      return next;
    });
  }, [userId]);
  useFocusEffect(useCallback(() => {
    const subscription = userId ? chatService.subscribe(onChatUpdate) : null;
    void load();
    return () => subscription?.remove();
  }, [load, onChatUpdate, userId]));
  useEffect(() => { if (ready && !session) router.replace('/login'); }, [ready, session]);
  if (!ready || !session) return <View style={styles.center}><ActivityIndicator color={colors.purple} /></View>;
  return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.page}>
    <View style={styles.header}><View><Text style={styles.kicker}>KÜTÜPHANEN</Text><Text style={styles.title}>Sohbet geçmişi</Text></View><Pressable style={styles.avatar} accessibilityLabel="Çıkış yap" onPress={() => void supabase.auth.signOut()}><Text style={styles.avatarText}>{session.user.email?.[0]?.toUpperCase() ?? 'E'}</Text></Pressable></View>
    <Pressable style={styles.newChat} onPress={() => router.push('/chat')}><Text style={styles.plus}>＋</Text><View style={{ flex: 1 }}><Text style={styles.newTitle}>Yeni sohbet</Text><Text style={styles.newCopy}>Aklındaki bir şeyi sor</Text></View><Text style={styles.arrow}>↗</Text></Pressable>
    <Text style={styles.section}>SON KONUŞMALAR</Text>
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.purple} /></View> : error ? <View style={styles.empty}><Text style={styles.emptyTitle}>Bağlantı kurulamadı</Text><Text style={styles.emptyCopy}>{error}</Text><Pressable style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Tekrar dene</Text></Pressable></View> : <FlatList data={rows} keyExtractor={(item) => item.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.purple} />} contentContainerStyle={rows.length ? styles.list : styles.listEmpty}
      ListEmptyComponent={<View style={styles.empty}><BrandMark size={54} /><Text style={styles.emptyTitle}>Henüz sohbetin yok</Text><Text style={styles.emptyCopy}>İlk sorunu sor; konuşmaların burada saklansın.</Text></View>}
      renderItem={({ item }) => {
        const lastMessage = item.messages.at(-1);
        const status = statuses[item.id];
        const preview = status === 'pending' ? 'EYRION yanıtlıyor…' : status === 'interrupted' ? 'Yanıt durduruldu — devam etmek için aç' : status === 'save-failed' ? 'Yanıt oluşturuldu ancak kaydedilemedi' : lastMessage?.role === 'user' ? 'Yanıt tamamlanmadı — sohbeti açıp devam et' : lastMessage?.content || 'Boş sohbet';
        return <Pressable onPress={() => router.push({ pathname: '/chat', params: { id: item.id } })} style={styles.row}><View style={styles.rowIcon}><Text style={styles.rowGlyph}>✧</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.rowTitle}>{item.title || 'Yeni sohbet'}</Text><Text numberOfLines={1} style={styles.rowCopy}>{preview}</Text></View><Text style={styles.chevron}>›</Text></Pressable>;
      }} />}
  </View><BottomNav active="history" /></SafeAreaView>;
}
function mergeConversations(current: Conversation[], incoming: Conversation[]) {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    const previous = byId.get(row.id);
    if (!previous || (Date.parse(row.updated_at) || 0) >= (Date.parse(previous.updated_at) || 0)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0));
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flex: 1, paddingHorizontal: 20 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, header: { paddingTop: 16, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: colors.cyan, fontSize: 9, fontWeight: '800', letterSpacing: 2 }, title: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 5 }, avatar: { width: 40, height: 40, borderRadius: 16, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.lavender, fontWeight: '700' }, newChat: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 18, borderWidth: 1, borderColor: '#51477A', backgroundColor: '#19172C', padding: 15 }, plus: { color: colors.lavender, fontSize: 25, width: 36, textAlign: 'center' }, newTitle: { color: colors.text, fontWeight: '700', fontSize: 14 }, newCopy: { color: colors.muted, fontSize: 11, marginTop: 4 }, arrow: { color: colors.purple, fontSize: 20 }, section: { color: '#8587A6', fontSize: 9, fontWeight: '800', letterSpacing: 1.7, marginTop: 30, marginBottom: 12 }, list: { paddingBottom: 16 }, listEmpty: { flexGrow: 1, justifyContent: 'center', paddingBottom: 45 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomColor: '#20233A', borderBottomWidth: 1, paddingVertical: 15 }, rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }, rowGlyph: { color: colors.purple, fontSize: 20 }, rowTitle: { color: colors.text, fontSize: 13, fontWeight: '700' }, rowCopy: { color: colors.muted, fontSize: 11, marginTop: 5 }, chevron: { color: '#777A99', fontSize: 23 }, empty: { flex: 1, gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }, emptyCopy: { color: colors.muted, textAlign: 'center', lineHeight: 20, fontSize: 12 }, retry: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 6 }, retryText: { color: colors.lavender, fontWeight: '700' } });
