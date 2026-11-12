import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomNav } from '../../components/BottomNav';
import { BrandMark } from '../../components/BrandMark';
import { ConfigurationNotice } from '../../components/ConfigurationNotice';
import { useAuth } from '../../lib/auth-context';
import { chatService, learnFromMessage } from '../../lib/chat';
import { AssistantSaveError, type ChatMessage, type ChatMode, type Conversation } from '../../lib/chat-domain';
import { apiConfigurationIssues, formatConfigurationIssues, isApiConfigured } from '../../lib/app-config';
import { usePreferences } from '../../lib/preferences-context';
import { colors } from '../../theme';

export default function ChatScreen() {
  const { session, ready } = useAuth();
  const { preferences } = usePreferences();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const netInfo = useNetInfo();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<ChatMode>(preferences.researchByDefault ? 'research' : 'chat');
  const [speaking, setSpeaking] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const sendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const conversationRef = useRef<Conversation | null>(null);
  const preparedRef = useRef<Conversation | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!conversationRef.current?.messages.length) setMode(preferences.researchByDefault ? 'research' : 'chat');
  }, [preferences.researchByDefault]);

  const loadConversation = useCallback(async () => {
    if (!userId || !id) { conversationRef.current = null; preparedRef.current = null; setConversation(null); setMessages([]); setLoading(false); return; }
    setLoading(true); setLoadError(''); setError('');
    try {
      const loaded = await chatService.loadConversation(userId, id);
      if (!loaded) { conversationRef.current = null; setLoadError('Bu sohbet bulunamadı veya hesabına ait değil.'); setConversation(null); setMessages([]); }
      else {
        conversationRef.current = loaded;
        setConversation(loaded);
        setMessages(loaded.messages);
        const pending = chatService.isPending(loaded.id);
        setSending(pending);
        if (!pending && loaded.messages.at(-1)?.role === 'user') setError('Bu sohbette son yanıt tamamlanmamış. Yeni mesaj göndererek devam edebilirsin.');
      }
    } catch { setLoadError('Sohbet yüklenemedi. Bağlantını kontrol edip tekrar dene.'); }
    finally { setLoading(false); }
  }, [userId, id]);
  useFocusEffect(useCallback(() => { void loadConversation(); }, [loadConversation]));
  useEffect(() => { if (ready && !session) router.replace('/login'); }, [ready, session]);
  useEffect(() => { if (messages.length || streaming) listRef.current?.scrollToEnd({ animated: true }); }, [messages, streaming]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => () => { void Speech.stop(); }, []);
  useEffect(() => {
    const subscription = chatService.subscribe((update) => {
      const targetId = conversationRef.current?.id ?? id;
      if (update.userId !== userId || update.conversation.id !== targetId) return;
      conversationRef.current = update.conversation;
      setConversation(update.conversation);
      setMessages(update.conversation.messages);
      setSending(update.status === 'pending');
      if (update.status === 'answer-save-failed') setError('EYRION yanıtı oluşturdu ancak sohbet kaydedilemedi. Kullanıcı mesajın ve önceki sohbet geçmişin korundu.');
      else if (update.status === 'interrupted') setError('Yanıt durduruldu. Mesajın sohbetinde kayıtlı.');
      else if (update.status === 'pending' || update.status === 'complete') setError('');
      setStreaming('');
    });
    return () => subscription.remove();
  }, [id, userId]);

  const stop = () => {
    if (controllerRef.current) controllerRef.current.abort();
    else if (conversationRef.current?.id ?? id) chatService.cancel((conversationRef.current?.id ?? id) as string);
  };
  const send = async () => {
    const text = draft.trim();
    if (!text || !userId || sendingRef.current) return;
    if (!isApiConfigured) { setError(formatConfigurationIssues(apiConfigurationIssues)); return; }
    if (netInfo.isConnected === false) { setError('Çevrimdışısın. Bağlantı geldiğinde mesajını yeniden gönderebilirsin.'); return; }
    sendingRef.current = true; setSending(true); setDraft(''); setError(''); setStreaming('');
    setMessages((old) => [...old, { role: 'user', content: text }]);
    const controller = new AbortController(); controllerRef.current = controller;
    let userTurnSaved = false;
    try {
      const saved = await chatService.send(userId, conversationRef.current ?? conversation, text, controller.signal, (answer) => { if (mountedRef.current) setStreaming(answer); }, (prepared) => {
        userTurnSaved = true;
        preparedRef.current = prepared;
        conversationRef.current = prepared;
        if (mountedRef.current) setConversation(prepared);
      }, mode);
      conversationRef.current = saved;
      if (mountedRef.current) { setConversation(saved); setMessages(saved.messages); setStreaming(''); }
      if (preferences.autoLearnMemories) void learnFromMessage(text);
      const assistantReply = saved.messages.at(-1);
      if (preferences.speakResponses && assistantReply?.role === 'assistant') speak(assistantReply.content);
    } catch (caught) {
      const aborted = caught instanceof Error && caught.name === 'AbortError';
      const assistantSaveFailed = caught instanceof AssistantSaveError;
      if (mountedRef.current) {
        setStreaming('');
        setError(assistantSaveFailed ? caught.message : aborted ? 'Yanıt durduruldu. Mesajın sohbetinde kayıtlı.' : caught instanceof Error ? caught.message : 'Mesaj gönderilemedi.');
      }
      if (!userTurnSaved && !aborted) {
        if (mountedRef.current) {
          setDraft(text);
          setMessages((old) => old.at(-1)?.role === 'user' && old.at(-1)?.content === text ? old.slice(0, -1) : old);
        }
      }
      // Reload after success, cancellation, or a failed answer save so persisted turns stay authoritative.
      const savedConversation = caught instanceof AssistantSaveError ? caught.conversation : preparedRef.current ?? conversationRef.current ?? conversation;
      if (userTurnSaved && savedConversation) {
        try {
          const latest = await chatService.loadConversation(userId, savedConversation.id);
          const consistent = latest ?? savedConversation;
          conversationRef.current = consistent;
          if (mountedRef.current) { setConversation(consistent); setMessages(consistent.messages); }
        } catch { /* keep the local optimistic turn visible */ }
      }
    } finally {
      controllerRef.current = null; sendingRef.current = false;
      if (mountedRef.current) setSending(chatService.isPending(conversationRef.current?.id ?? id ?? ''));
    }
  };

  const retryLast = async () => {
    if (!userId || !conversationRef.current || sendingRef.current || netInfo.isConnected === false) return;
    sendingRef.current = true; setSending(true); setError(''); setStreaming('');
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const saved = await chatService.retryLast(userId, conversationRef.current.id, controller.signal, (answer) => { if (mountedRef.current) setStreaming(answer); });
      conversationRef.current = saved;
      if (mountedRef.current) { setConversation(saved); setMessages(saved.messages); setStreaming(''); }
    } catch (caught) {
      if (mountedRef.current) setError(caught instanceof Error ? caught.message : 'Yanıt yeniden alınamadı.');
      if (caught instanceof AssistantSaveError && mountedRef.current) { setConversation(caught.conversation); setMessages(caught.conversation.messages); }
    } finally {
      controllerRef.current = null; sendingRef.current = false;
      if (mountedRef.current) setSending(chatService.isPending(conversationRef.current?.id ?? ''));
      if (conversationRef.current && userId) void chatService.loadConversation(userId, conversationRef.current.id).then((latest) => { if (latest && mountedRef.current) { conversationRef.current = latest; setConversation(latest); setMessages(latest.messages); } }).catch(() => undefined);
      const last = conversationRef.current?.messages.at(-1);
      if (preferences.speakResponses && last?.role === 'assistant') speak(last.content);
    }
  };

  const speak = (text: string) => {
    void Speech.stop();
    setSpeaking(true);
    Speech.speak(text, { language: 'tr-TR', onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => { setSpeaking(false); Alert.alert('Ses başlatılamadı', 'Cihazında Türkçe ses bulunamayabilir.'); } });
  };

  if (!ready || !session) return <View style={styles.center}><ActivityIndicator color={colors.purple} /></View>;
  return <SafeAreaView style={styles.safe} edges={['top']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}>
    <View style={styles.header}><Pressable accessibilityLabel="Sohbet geçmişi" onPress={() => router.push('/history')} style={styles.headerButton}><Text style={styles.headerButtonText}>☰</Text></Pressable><View style={styles.heading}><Text numberOfLines={1} style={styles.title}>{conversation?.title ?? 'Yeni sohbet'}</Text><View style={styles.statusLine}><View style={[styles.dot, netInfo.isConnected === false && styles.offlineDot]} /><Text style={styles.status}>{netInfo.isConnected === false ? 'Çevrimdışı' : sending ? (mode === 'research' ? 'Kaynaklar araştırılıyor' : 'Yanıt hazırlanıyor') : mode === 'research' ? 'Araştırma modu' : 'EYRION yanında'}</Text></View></View><BrandMark size={36} /></View>
    <ConfigurationNotice scope="api" />
    {netInfo.isConnected === false && <View style={styles.offline}><Text style={styles.offlineText}>İnternet bağlantısı yok. Önceki sohbetlerin görüntülenebilir.</Text></View>}
    {loadError ? <View style={styles.loadError}><Text style={styles.errorTitle}>Sohbet açılamadı</Text><Text style={styles.errorText}>{loadError}</Text><Pressable onPress={() => void loadConversation()} style={styles.retry}><Text style={styles.retryText}>Tekrar dene</Text></Pressable></View> : loading ? <View style={styles.center}><ActivityIndicator color={colors.purple} /><Text style={styles.loadingText}>Sohbet yükleniyor…</Text></View> : <FlatList ref={listRef} data={messages} keyExtractor={(_, index) => `${conversation?.id ?? 'new'}-${index}`} contentContainerStyle={[styles.messageList, messages.length === 0 && styles.messageListEmpty]} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<View style={styles.welcome}><View style={styles.halo}><BrandMark size={72} /></View><Text style={styles.welcomeTitle}>Her şey bir merakla başlar.</Text><Text style={styles.welcomeCopy}>Bir soru, fikir ya da keşfetmek istediğin bir konu…</Text><View style={styles.suggestion}><Text style={styles.suggestionGlyph}>✦</Text><Text style={styles.suggestionText}>Bugün aklında ne var?</Text></View></View>}
      renderItem={({ item, index }) => <View style={[styles.messageRow, item.role === 'user' && styles.userRow]}>{item.role === 'assistant' && <View style={styles.miniBrand}><BrandMark size={25} /></View>}<View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>{item.role === 'assistant' ? <><MarkdownText text={item.content} />{preferences.speakResponses && <Pressable accessibilityRole="button" accessibilityLabel={speaking ? 'Sesi durdur' : 'Yanıtı sesli oku'} onPress={() => speak(item.content)} style={styles.speakButton}><Text style={styles.speakText}>{speaking ? '■ Durdur' : '🔊 Sesli oku'}</Text></Pressable>}</> : <Text style={styles.userText}>{item.content}</Text>}{index === messages.length - 1 && item.role === 'user' && !sending && <Pressable accessibilityRole="button" onPress={() => void retryLast()} style={styles.retryInline}><Text style={styles.retryText}>Yanıtı yeniden dene</Text></Pressable>}</View></View>}
      ListFooterComponent={sending ? <View style={styles.streamingRow}><View style={styles.miniBrand}><BrandMark size={25} /></View><View style={[styles.bubble, styles.assistantBubble]}>{streaming ? <MarkdownText text={streaming} /> : <View style={styles.thinking}><ActivityIndicator size="small" color={colors.purple} /><Text style={styles.thinkingText}>Düşünüyorum…</Text></View>}</View></View> : undefined} />}
    {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
    <View style={styles.composerWrap}><Pressable accessibilityRole="button" accessibilityLabel="Araştırma modunu değiştir" onPress={() => setMode(mode === 'chat' ? 'research' : 'chat')} style={[styles.modeChip, mode === 'research' && styles.modeChipActive]}><Text style={[styles.modeText, mode === 'research' && styles.modeTextActive]}>{mode === 'research' ? '⌕ Araştırma açık · kaynaklı yanıt' : '✦ Araştırma modunu aç'}</Text></Pressable><View style={styles.composer}><TextInput accessibilityLabel="Mesaj yaz" value={draft} onChangeText={setDraft} editable={!sending} multiline maxLength={12000} placeholder="EYRION'a bir şey sor…" placeholderTextColor="#747792" style={styles.input} onSubmitEditing={() => { if (Platform.OS === 'ios') void send(); }} returnKeyType="send" blurOnSubmit={false} />
      <Pressable accessibilityLabel={sending ? 'Yanıtı durdur' : 'Mesajı gönder'} disabled={!sending && !draft.trim()} onPress={sending ? stop : () => void send()} style={[styles.sendButton, !sending && !draft.trim() && styles.sendDisabled, sending && styles.stopButton]}><Text style={styles.sendGlyph}>{sending ? '■' : '↑'}</Text></Pressable></View><Text style={styles.disclaimer}>Yanıtlar yapay zekâ tarafından oluşturulur.</Text></View>
  </KeyboardAvoidingView><BottomNav active="chat" /></SafeAreaView>;
}

function inlineMarkdown(line: string) {
  const matcher = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  return line.split(matcher).filter(Boolean).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\([^)]+\)$/);
    if (link) { const href = part.match(/^\[[^\]]+\]\(([^)]+)\)$/)?.[1] ?? ''; let safeUrl = ''; try { const parsed = new URL(href); if (parsed.protocol === 'https:') safeUrl = parsed.toString(); } catch { /* Invalid or non-HTTPS links remain plain text. */ } return <Text key={index} accessibilityRole={safeUrl ? 'link' : undefined} onPress={() => safeUrl && void Linking.openURL(safeUrl)} style={styles.mdLink}>{link[1]}</Text>; }
    if (part.startsWith('**') || part.startsWith('__')) return <Text key={index} style={styles.mdStrong}>{part.slice(2, -2)}</Text>;
    if (part.startsWith('~~')) return <Text key={index} style={styles.mdStrike}>{part.slice(2, -2)}</Text>;
    if (part.startsWith('`')) return <Text key={index} style={styles.mdCode}>{part.slice(1, -1)}</Text>;
    if (part.startsWith('*') || part.startsWith('_')) return <Text key={index} style={styles.mdEm}>{part.slice(1, -1)}</Text>;
    return part;
  });
}

type MarkdownBlock = { type: 'code' | 'spacer' | 'heading' | 'list' | 'quote' | 'paragraph'; value: string; ordered?: boolean };

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  let insideCode = false;
  let codeLines: string[] = [];
  const blocks: MarkdownBlock[] = [];
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      insideCode = !insideCode;
      if (!insideCode) {
        blocks.push({ type: 'code', value: codeLines.join('\n') });
        codeLines = [];
      }
      continue;
    }
    if (insideCode) { codeLines.push(line); continue; }
    if (!line.trim()) { blocks.push({ type: 'spacer', value: '' }); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { blocks.push({ type: 'heading', value: heading[2] }); continue; }
    const list = line.match(/^\s*(?:[-*+]\s+|(\d+)\.\s+)(.+)$/);
    if (list) { blocks.push({ type: 'list', value: list[2], ordered: Boolean(list[1]) }); continue; }
    if (line.startsWith('> ')) { blocks.push({ type: 'quote', value: line.slice(2) }); continue; }
    blocks.push({ type: 'paragraph', value: line });
  }
  if (insideCode && codeLines.length) blocks.push({ type: 'code', value: codeLines.join('\n') });
  return blocks;
}

function MarkdownText({ text }: { text: string }) {
  return <View style={styles.mdBody}>{parseMarkdownBlocks(text).map((block, index) => {
    if (block.type === 'code') return <Text key={index} style={styles.mdCodeBlock}>{block.value}</Text>;
    if (block.type === 'spacer') return <Text key={index} style={styles.mdSpacer}> </Text>;
    if (block.type === 'heading') return <Text key={index} style={[styles.mdText, styles.mdHeading]}>{inlineMarkdown(block.value)}</Text>;
    if (block.type === 'list') return <Text key={index} style={styles.mdText}>{block.ordered ? '1. ' : '• '}{inlineMarkdown(block.value)}</Text>;
    if (block.type === 'quote') return <Text key={index} style={[styles.mdText, styles.mdQuote]}>{inlineMarkdown(block.value)}</Text>;
    return <Text key={index} style={styles.mdText}>{inlineMarkdown(block.value)}</Text>;
  })}</View>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 10 }, header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12, borderBottomColor: '#20233A', borderBottomWidth: 1 }, headerButton: { width: 39, height: 39, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, headerButtonText: { color: colors.lavender, fontSize: 19 }, heading: { flex: 1 }, title: { color: colors.text, fontSize: 14, fontWeight: '700' }, statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#65D3B2' }, offlineDot: { backgroundColor: '#F2B972' }, status: { color: colors.muted, fontSize: 10 }, offline: { backgroundColor: '#282218', borderBottomWidth: 1, borderColor: '#55452C', paddingHorizontal: 16, paddingVertical: 9 }, offlineText: { color: '#EACB95', fontSize: 11 }, messageList: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18, gap: 15 }, messageListEmpty: { flexGrow: 1, justifyContent: 'center' }, welcome: { alignItems: 'center', paddingHorizontal: 24 }, halo: { width: 116, height: 116, borderRadius: 58, backgroundColor: '#151329', borderColor: '#383250', borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }, welcomeTitle: { color: colors.text, fontSize: 21, fontWeight: '700', textAlign: 'center' }, welcomeCopy: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }, suggestion: { flexDirection: 'row', gap: 9, alignItems: 'center', marginTop: 22, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12 }, suggestionGlyph: { color: colors.purple, fontSize: 15 }, suggestionText: { color: '#BCBED4', fontSize: 11 }, messageRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingRight: 34 }, userRow: { justifyContent: 'flex-end', paddingLeft: 34, paddingRight: 0 }, miniBrand: { width: 25, height: 25, marginBottom: 2 }, bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '100%' }, assistantBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6, flexShrink: 1 }, userBubble: { backgroundColor: '#30294B', borderWidth: 1, borderColor: '#544879', borderBottomRightRadius: 6 }, userText: { color: '#F2EEFF', fontSize: 14, lineHeight: 21 }, streamingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingRight: 34 }, thinking: { flexDirection: 'row', gap: 9, alignItems: 'center', minHeight: 22 }, thinkingText: { color: colors.muted, fontSize: 12 }, loadingText: { color: colors.muted, fontSize: 12 }, composerWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 7, borderTopWidth: 1, borderTopColor: '#20233A', backgroundColor: colors.background }, modeChip: { alignSelf: 'flex-start', marginBottom: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, modeChipActive: { backgroundColor: '#221D3D', borderColor: '#62539B' }, modeText: { color: colors.muted, fontSize: 10, fontWeight: '600' }, modeTextActive: { color: colors.lavender }, speakButton: { alignSelf: 'flex-start', marginTop: 9, paddingTop: 8, borderTopColor: colors.line, borderTopWidth: 1 }, speakText: { color: colors.cyan, fontSize: 10, fontWeight: '700' }, retryInline: { marginTop: 9, borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 8 }, retryText: { color: colors.lavender, fontSize: 10, fontWeight: '700' }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 20, borderWidth: 1, borderColor: '#343751', backgroundColor: '#111426', paddingHorizontal: 13, paddingVertical: 8 }, input: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20, maxHeight: 120, paddingTop: 7, paddingBottom: 7 }, sendButton: { width: 37, height: 37, borderRadius: 13, backgroundColor: '#7966DF', alignItems: 'center', justifyContent: 'center' }, sendDisabled: { backgroundColor: '#302D48' }, stopButton: { backgroundColor: '#573445' }, sendGlyph: { color: '#FFF', fontSize: 20, fontWeight: '700' }, disclaimer: { color: '#676982', fontSize: 9, textAlign: 'center', marginTop: 7 }, errorBanner: { marginHorizontal: 14, marginBottom: 7, borderWidth: 1, borderColor: '#69404D', backgroundColor: '#2C1D27', borderRadius: 12, padding: 10 }, errorText: { color: '#EDB5C3', fontSize: 11, lineHeight: 17 }, loadError: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 26, gap: 10 }, errorTitle: { color: colors.text, fontSize: 18, fontWeight: '700' }, retry: { borderRadius: 12, backgroundColor: colors.raised, paddingHorizontal: 16, paddingVertical: 10 }, mdBody: { gap: 2 }, mdText: { color: '#D7D8E8', fontSize: 14, lineHeight: 22 }, mdHeading: { color: '#F5F2FF', fontSize: 18, lineHeight: 25, fontWeight: '700', marginTop: 4 }, mdStrong: { color: '#FFFFFF', fontWeight: '700' }, mdStrike: { color: '#D7D8E8', textDecorationLine: 'line-through' }, mdCode: { color: '#D7C8FF', backgroundColor: '#24213A', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, mdCodeBlock: { color: '#D7C8FF', backgroundColor: '#0A0C17', borderColor: '#292D49', borderWidth: 1, borderRadius: 10, padding: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 19, marginVertical: 5 }, mdEm: { color: '#C8B9FF', fontStyle: 'italic' }, mdLink: { color: colors.cyan, textDecorationLine: 'underline' }, mdQuote: { borderLeftWidth: 2, borderLeftColor: colors.purple, paddingLeft: 9, color: colors.muted }, mdSpacer: { height: 5 } });
