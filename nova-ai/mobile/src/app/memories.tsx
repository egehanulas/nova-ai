import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomNav } from '../../components/BottomNav';
import { useAuth } from '../../lib/auth-context';
import { memoryService } from '../../lib/memories';
import type { UserMemory } from '../../lib/memory-domain';
import { colors } from '../../theme';

export default function MemoriesScreen() {
  const { session, ready } = useAuth();
  const [items, setItems] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<UserMemory | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try { setItems(await memoryService.list()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Hafıza yüklenemedi.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { if (session) void load(); }, [load, session]));
  const openEditor = (item?: UserMemory) => { setEditing(item ?? null); setContent(item?.content ?? ''); setCategory(item?.category ?? 'general'); setEditorOpen(true); };
  const save = async () => {
    setSaving(true);
    try {
      if (editing) await memoryService.update(editing.id, content, category);
      else await memoryService.create(content, category);
      setEditorOpen(false); setEditing(null);
      await load(true);
    } catch (caught) { Alert.alert('Hafıza kaydedilemedi', caught instanceof Error ? caught.message : 'Biraz sonra yeniden dene.'); }
    finally { setSaving(false); }
  };
  const remove = (item: UserMemory) => Alert.alert('Hafıza notunu sil?', 'Bu not EYRION’un sana özel bağlamından kaldırılır.', [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sil', style: 'destructive', onPress: () => { void memoryService.delete(item.id).then(() => load(true)).catch((caught) => Alert.alert('Silinemedi', caught instanceof Error ? caught.message : 'Tekrar dene.')); } },
  ]);
  if (!ready || !session) return <View style={styles.center}><ActivityIndicator color={colors.purple} /></View>;
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.page}>
      <View style={styles.header}><Pressable accessibilityLabel="Geri" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><View style={styles.heading}><Text style={styles.kicker}>KİŞİSEL BAĞLAM</Text><Text style={styles.title}>Hafızam</Text></View><Pressable accessibilityLabel="Hafıza ekle" onPress={() => openEditor()} style={styles.add}><Text style={styles.addText}>＋</Text></Pressable></View>
      <Text style={styles.subtitle}>Bu notlar yalnızca hesabınla ilişkilendirilir ve sohbet yanıtlarında bağlam olarak kullanılabilir.</Text>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.purple} /></View> : error ? <View style={styles.empty}><Text style={styles.emptyTitle}>Hafızaya ulaşılamadı</Text><Text style={styles.copy}>{error}</Text><Pressable style={styles.action} onPress={() => void load()}><Text style={styles.actionText}>Yeniden dene</Text></Pressable></View> : <FlatList data={items} keyExtractor={(item) => item.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.purple} />} contentContainerStyle={items.length ? styles.list : styles.listEmpty} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyGlyph}>✧</Text><Text style={styles.emptyTitle}>Henüz kayıtlı not yok</Text><Text style={styles.copy}>Bir tercihi veya senin için önemli bir bilgiyi ekleyebilirsin.</Text><Pressable style={styles.action} onPress={() => openEditor()}><Text style={styles.actionText}>İlk notu ekle</Text></Pressable></View>} renderItem={({ item }) => <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.category}>{item.category}</Text><Text style={styles.memory}>{item.content}</Text><Text style={styles.meta}>{item.source === 'user' ? 'Sen ekledin' : 'Sohbetten öğrenildi'}</Text></View><View style={styles.actions}><Pressable accessibilityLabel="Notu düzenle" onPress={() => openEditor(item)} style={styles.iconButton}><Text style={styles.iconText}>✎</Text></Pressable><Pressable accessibilityLabel="Notu sil" onPress={() => remove(item)} style={styles.iconButton}><Text style={styles.deleteText}>×</Text></Pressable></View></View>} />}
    </View>
    <BottomNav active="settings" />
    <Modal transparent visible={editorOpen} animationType="fade" onRequestClose={() => { if (!saving) setEditorOpen(false); }}>
      <View style={styles.modalBackdrop}><View style={styles.modal}><Text style={styles.modalTitle}>{editing ? 'Notu düzenle' : 'Hafızaya not ekle'}</Text><TextInput value={content} onChangeText={setContent} maxLength={1000} multiline placeholder="Örneğin: Yanıtları Türkçe tercih ediyorum." placeholderTextColor="#747792" style={styles.field} /><TextInput value={category} onChangeText={setCategory} maxLength={40} placeholder="Kategori (isteğe bağlı)" placeholderTextColor="#747792" style={styles.categoryField} /><Text style={styles.count}>{content.length}/1000</Text><View style={styles.modalButtons}><Pressable disabled={saving} onPress={() => setEditorOpen(false)} style={styles.cancel}><Text style={styles.cancelText}>Vazgeç</Text></Pressable><Pressable disabled={saving || !content.trim()} onPress={() => void save()} style={styles.save}><Text style={styles.saveText}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text></Pressable></View></View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flex: 1, paddingHorizontal: 20 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingBottom: 16 }, back: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }, backText: { color: colors.lavender, fontSize: 27, lineHeight: 30 }, heading: { flex: 1 }, kicker: { color: colors.cyan, fontWeight: '800', letterSpacing: 2, fontSize: 9 }, title: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 3 }, add: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#272340', alignItems: 'center', justifyContent: 'center' }, addText: { color: colors.lavender, fontSize: 24 }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 14 }, list: { paddingBottom: 16 }, listEmpty: { flexGrow: 1, justifyContent: 'center' }, row: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 17 }, category: { color: colors.cyan, textTransform: 'uppercase', fontSize: 9, letterSpacing: 1.5, fontWeight: '800' }, memory: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 5 }, meta: { color: '#747792', fontSize: 10, marginTop: 7 }, actions: { flexDirection: 'row', gap: 5 }, iconButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }, iconText: { color: colors.lavender, fontSize: 17 }, deleteText: { color: '#E6A8B6', fontSize: 22 }, empty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 }, emptyGlyph: { fontSize: 42, color: colors.purple }, emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }, copy: { color: colors.muted, textAlign: 'center', lineHeight: 19, fontSize: 12 }, action: { marginTop: 7, backgroundColor: '#30294B', borderWidth: 1, borderColor: '#544879', borderRadius: 13, paddingHorizontal: 15, paddingVertical: 11 }, actionText: { color: colors.lavender, fontWeight: '700', fontSize: 12 }, modalBackdrop: { flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 20 }, modal: { backgroundColor: '#171A30', borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 18 }, modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 15 }, field: { minHeight: 110, maxHeight: 180, color: colors.text, backgroundColor: '#0F1222', borderColor: colors.line, borderWidth: 1, borderRadius: 13, padding: 12, textAlignVertical: 'top' }, categoryField: { color: colors.text, backgroundColor: '#0F1222', borderColor: colors.line, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 }, count: { color: colors.muted, textAlign: 'right', fontSize: 10, marginTop: 6 }, modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 16 }, cancel: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11 }, cancelText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, save: { backgroundColor: '#7966DF', borderRadius: 12, paddingHorizontal: 17, paddingVertical: 11 }, saveText: { color: '#FFF', fontWeight: '700', fontSize: 12 } });
