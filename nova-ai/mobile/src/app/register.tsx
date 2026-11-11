import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthField } from '../../components/AuthField';
import { BrandMark } from '../../components/BrandMark';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ConfigurationNotice } from '../../components/ConfigurationNotice';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatConfigurationIssues, supabaseConfigurationIssues } from '../../lib/app-config';
import { colors } from '../../theme';

export default function RegisterScreen() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!isSupabaseConfigured) { Alert.alert('Kurulum tamamlanmadı', formatConfigurationIssues(supabaseConfigurationIssues)); return; }
    if (!email.trim() || password.length < 8) { Alert.alert('Bilgileri kontrol et', 'E-posta girin; şifre en az 8 karakter olmalı.'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() || undefined }, emailRedirectTo: 'eyrionai://auth/callback' } });
      if (error) Alert.alert('Hesap oluşturulamadı', error.message);
      else if (!data.session) Alert.alert('E-postanı doğrula', 'Hesabını etkinleştirmek için gelen kutundaki bağlantıyı aç.');
      else router.replace('/');
    } catch {
      Alert.alert('Bağlantı kurulamadı', 'Hesap isteği tamamlanamadı. İnternet bağlantını kontrol edip yeniden dene.');
    } finally {
      setBusy(false);
    }
  };
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.brand}><BrandMark size={54} /><Text style={styles.wordmark}>EYRION AI</Text><Text style={styles.tagline}>Kendi keşif yolculuğunu başlat.</Text></View>
    <Text style={styles.eyebrow}>YENİ BİR BAŞLANGIÇ</Text><Text style={styles.title}>Hesabını oluştur.</Text><Text style={styles.subtitle}>Mevcut EYRION hesabın varsa giriş ekranını kullan.</Text>
    <ConfigurationNotice scope="supabase" />
    <View style={styles.fields}><AuthField label="Ad (isteğe bağlı)" value={name} onChangeText={setName} placeholder="Nasıl hitap edelim?" autoComplete="name" /><AuthField label="E-posta" value={email} onChangeText={setEmail} placeholder="ornek@email.com" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" /><AuthField label="Şifre" value={password} onChangeText={setPassword} placeholder="En az 8 karakter" secureTextEntry autoComplete="new-password" textContentType="newPassword" /></View>
    <PrimaryButton title="Hesap oluştur  →" onPress={() => void submit()} busy={busy} />
    <View style={styles.footer}><Text style={styles.footerText}>Zaten hesabın var mı?</Text><Link href="/login" style={styles.link}> Giriş yap</Link></View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flexGrow: 1, paddingHorizontal: 26, paddingBottom: 28 }, brand: { alignItems: 'center', marginTop: 34, marginBottom: 42 }, wordmark: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: 1.2, marginTop: 12 }, tagline: { color: colors.muted, marginTop: 5, fontSize: 12 }, eyebrow: { color: colors.purple, fontSize: 10, letterSpacing: 2.4, fontWeight: '800' }, title: { color: colors.text, fontSize: 29, fontWeight: '700', marginTop: 10, letterSpacing: -0.6 }, subtitle: { color: colors.muted, fontSize: 14, marginTop: 8, lineHeight: 21 }, config: { color: '#E8CD8A', backgroundColor: '#242015', borderColor: '#65552E', borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 20, fontSize: 12, lineHeight: 18 }, fields: { gap: 17, marginTop: 26, marginBottom: 22 }, footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 23 }, footerText: { color: colors.muted, fontSize: 13 }, link: { color: colors.lavender, fontSize: 13, fontWeight: '700' } });
