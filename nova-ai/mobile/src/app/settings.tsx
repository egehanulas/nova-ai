import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomNav } from '../../components/BottomNav';
import { ConfigurationNotice } from '../../components/ConfigurationNotice';
import { useAuth } from '../../lib/auth-context';
import { apiRequest } from '../../lib/api';
import { signOutSafely } from '../../lib/auth-actions';
import { supabase } from '../../lib/supabase';
import { usePreferences } from '../../lib/preferences-context';
import { colors } from '../../theme';

type Health = { status?: string; version?: string; releaseChannel?: string; providers?: Record<string, boolean> };

export default function SettingsScreen() {
  const { session, ready } = useAuth();
  const { preferences, ready: preferencesReady, updatePreferences } = usePreferences();
  const [name, setName] = useState(String(session?.user.user_metadata?.name ?? ''));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [serviceError, setServiceError] = useState('');
  const toggle = (key: 'autoLearnMemories' | 'speakResponses' | 'researchByDefault', value: boolean) => {
    void updatePreferences({ [key]: value }).catch(() => Alert.alert('Tercih kaydedilemedi', 'Cihazındaki güvenli ayar deposuna yazılamadı.'));
  };
  const saveProfile = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { name: name.trim() } });
      if (error) throw error;
      Alert.alert('Profil güncellendi', 'Görünen adın hesabına kaydedildi.');
    } catch (error) { Alert.alert('Profil güncellenemedi', error instanceof Error ? error.message : 'Biraz sonra yeniden dene.'); }
    finally { setBusy(false); }
  };
  const updatePassword = async () => {
    if (password.length < 8) { Alert.alert('Şifre çok kısa', 'Yeni şifre en az 8 karakter olmalı.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      Alert.alert('Şifre güncellendi', 'Hesabının yeni şifresi kaydedildi.');
    } catch (error) { Alert.alert('Şifre güncellenemedi', error instanceof Error ? error.message : 'Biraz sonra yeniden dene.'); }
    finally { setBusy(false); }
  };
  const checkService = async () => {
    setServiceLoading(true); setServiceError('');
    try { setHealth(await apiRequest<Health>('/health')); }
    catch (error) { setHealth(null); setServiceError(error instanceof Error ? error.message : 'Servis kontrol edilemedi.'); }
    finally { setServiceLoading(false); }
  };
  const signOut = () => void signOutSafely(() => supabase.auth.signOut()).then((ok) => { if (!ok) Alert.alert('Çıkış yapılamadı', 'Oturum kapatılamadı. Bağlantını kontrol edip tekrar dene.'); });
  if (!ready || !session) return <View style={styles.center}><ActivityIndicator color={colors.purple} /></View>;
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><View><Text style={styles.kicker}>KİŞİSEL ALANIN</Text><Text style={styles.title}>Ayarlar</Text></View><Pressable accessibilityLabel="Çıkış yap" onPress={signOut} style={styles.avatar}><Text style={styles.avatarText}>{session.user.email?.[0]?.toUpperCase() ?? 'E'}</Text></Pressable></View>
      <ConfigurationNotice />
      <View style={styles.card}><Text style={styles.sectionTitle}>Hesap ve profil</Text><Text style={styles.email}>{session.user.email}</Text><Text style={styles.label}>Görünen ad</Text><TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Adın" placeholderTextColor="#747792" style={styles.input} /><Pressable disabled={busy} onPress={() => void saveProfile()} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Kaydediliyor…' : 'Profili kaydet'}</Text></Pressable></View>

      <View style={styles.card}><Text style={styles.sectionTitle}>Kişiselleştirme</Text>
        <SettingSwitch title="Sohbetlerden hafıza öğren" detail="Kapatırsan yeni mesajlar otomatik hafızaya gönderilmez." value={preferences.autoLearnMemories} disabled={!preferencesReady} onChange={(value) => toggle('autoLearnMemories', value)} />
        <SettingSwitch title="Araştırma modunu varsayılan yap" detail="Seçili sohbetlerde mevcut web araştırma API'si ve kaynak listesi kullanılır." value={preferences.researchByDefault} disabled={!preferencesReady} onChange={(value) => toggle('researchByDefault', value)} />
        <Pressable style={styles.linkRow} onPress={() => router.push('/memories')}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Hafızamı yönet</Text><Text style={styles.rowDetail}>Notları gör, ekle, düzenle veya sil</Text></View><Text style={styles.chevron}>›</Text></Pressable>
      </View>

      <View style={styles.card}><Text style={styles.sectionTitle}>Ses</Text><SettingSwitch title="Yanıtları sesli oku" detail="Cihazın Türkçe metin-ses motorunu kullanır; ayrı ses servisi çağrısı veya ücret oluşturmaz." value={preferences.speakResponses} disabled={!preferencesReady} onChange={(value) => toggle('speakResponses', value)} /><View style={styles.info}><Text style={styles.infoTitle}>Sesle mesaj yazma</Text><Text style={styles.rowDetail}>Bu sunucuda konuşmayı metne çeviren uç nokta bulunmadı; mikrofon izni istenmiyor.</Text></View></View>

      <View style={styles.card}><Text style={styles.sectionTitle}>Görünüm ve dil</Text><View style={styles.info}><Text style={styles.rowTitle}>Koyu tema</Text><Text style={styles.rowDetail}>Bu sürümde uygulamanın etkin temasıdır. Açık ve sistem teması henüz desteklenmiyor.</Text></View><View style={styles.info}><Text style={styles.rowTitle}>Türkçe</Text><Text style={styles.rowDetail}>Mobil arayüz şu anda Türkçe; başka dil seçeneği sunulmuyor.</Text></View></View>

      <View style={styles.card}><Text style={styles.sectionTitle}>Gizlilik ve güvenlik</Text><Text style={styles.rowDetail}>Oturum iOS Keychain / Android Keystore destekli güvenli depoda tutulur. Sohbet ve hafıza istekleri oturum belirteciyle gönderilir ve kullanıcı RLS politikalarıyla sınırlandırılır.</Text><Text style={[styles.label, { marginTop: 18 }]}>Yeni şifre</Text><TextInput value={password} onChangeText={setPassword} placeholder="En az 8 karakter" placeholderTextColor="#747792" secureTextEntry autoComplete="new-password" style={styles.input} /><Pressable disabled={busy} onPress={() => void updatePassword()} style={styles.secondary}><Text style={styles.secondaryText}>Şifreyi güncelle</Text></Pressable><View style={styles.info}><Text style={styles.infoTitle}>Hesabı silme</Text><Text style={styles.rowDetail}>Güvenli bir hesap silme API&apos;si mevcut değil. Bu nedenle uygulama kullanıcı kaydını silmeye çalışmaz. Bu işlem için EYRION destek kanalına başvur.</Text></View></View>

      <View style={styles.card}><Text style={styles.sectionTitle}>Bağlantılar ve uygulama</Text><Pressable disabled={serviceLoading} onPress={() => void checkService()} style={styles.secondary}><Text style={styles.secondaryText}>{serviceLoading ? 'Kontrol ediliyor…' : 'EYRION servisini kontrol et'}</Text></Pressable>{health && <Text style={styles.health}>API: {health.status === 'ok' ? 'çalışıyor' : 'yanıt alındı'} · Sürüm {health.version ?? 'bilinmiyor'} · {health.releaseChannel ?? 'kanal bilgisi yok'}</Text>}{serviceError ? <Text style={styles.serviceError}>{serviceError}</Text> : null}<Text style={styles.rowDetail}>Uygulama sürümü {Constants.expoConfig?.version ?? 'bilinmiyor'} · Güncelleme kanalı bu sürümde yapılandırılmadı.</Text></View>
      <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut}><Text style={styles.signOutText}>Oturumu kapat</Text></Pressable>
    </ScrollView>
    <BottomNav active="settings" />
  </SafeAreaView>;
}

function SettingSwitch({ title, detail, value, disabled, onChange }: { title: string; detail: string; value: boolean; disabled: boolean; onChange(value: boolean): void }) {
  return <View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View><Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: '#343751', true: '#6954BD' }} thumbColor={value ? '#DED4FF' : '#A5A6BD'} accessibilityLabel={title} /></View>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, page: { paddingHorizontal: 19, paddingTop: 12, paddingBottom: 32, gap: 12 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6 }, kicker: { color: colors.cyan, fontSize: 9, fontWeight: '800', letterSpacing: 2 }, title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 4 }, avatar: { width: 40, height: 40, borderRadius: 15, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', borderColor: colors.line, borderWidth: 1 }, avatarText: { color: colors.lavender, fontWeight: '800' }, card: { borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 15, gap: 12 }, sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 1 }, email: { color: colors.muted, fontSize: 12 }, label: { color: '#B8B9CE', fontSize: 11, fontWeight: '700' }, input: { backgroundColor: '#0D1020', borderColor: '#343751', borderWidth: 1, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 }, primary: { alignSelf: 'flex-start', backgroundColor: '#7966DF', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 }, primaryText: { color: '#FFF', fontWeight: '700', fontSize: 12 }, secondary: { alignSelf: 'flex-start', borderColor: '#48415F', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#1A1930' }, secondaryText: { color: colors.lavender, fontWeight: '700', fontSize: 12 }, switchRow: { flexDirection: 'row', gap: 12, alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: 1, paddingBottom: 12 }, rowTitle: { color: colors.text, fontSize: 12, fontWeight: '700' }, rowDetail: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4 }, linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }, chevron: { color: colors.lavender, fontSize: 23, paddingHorizontal: 4 }, info: { borderRadius: 13, backgroundColor: '#0E1120', borderWidth: 1, borderColor: '#242840', padding: 11 }, infoTitle: { color: '#CFC3F6', fontSize: 11, fontWeight: '700', marginBottom: 4 }, health: { color: '#83D5BA', fontSize: 11, lineHeight: 16 }, serviceError: { color: '#EDB5C3', fontSize: 11, lineHeight: 16 }, signOut: { borderColor: '#69404D', borderWidth: 1, backgroundColor: '#2C1D27', borderRadius: 15, alignItems: 'center', padding: 14, marginBottom: 12 }, signOutText: { color: '#EDB5C3', fontWeight: '700', fontSize: 12 } });
