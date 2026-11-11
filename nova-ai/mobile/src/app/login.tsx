import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthField } from '../../components/AuthField';
import { BrandMark } from '../../components/BrandMark';
import { PrimaryButton } from '../../components/PrimaryButton';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { colors } from '../../theme';

export default function LoginScreen() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!isSupabaseConfigured) { Alert.alert('Kurulum tamamlanmadı', 'mobile/.env dosyasına Supabase URL ve publishable key değerlerini ekleyin.'); return; }
    if (!email.trim() || !password) { Alert.alert('Bilgileri kontrol et', 'E-posta ve şifre alanlarını doldurun.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) Alert.alert('Giriş yapılamadı', error.message);
    else router.replace('/');
  };
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.replace('/')} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
    <View style={styles.brand}><BrandMark size={58} /><Text style={styles.wordmark}>EYRION<Text style={styles.ai}> AI</Text></Text><Text style={styles.tagline}>Yeni bir bakış açısı.</Text></View>
    <Text style={styles.eyebrow}>YENİDEN MERHABA</Text><Text style={styles.title}>Sohbete devam et.</Text><Text style={styles.subtitle}>Hesabına giriş yap, kaldığın yerden keşfet.</Text>
    {!isSupabaseConfigured && <Text style={styles.config}>Bu uygulama henüz Supabase bağlantı bilgileriyle yapılandırılmadı.</Text>}
    <View style={styles.fields}><AuthField label="E-posta" value={email} onChangeText={setEmail} placeholder="ornek@email.com" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" /><AuthField label="Şifre" value={password} onChangeText={setPassword} placeholder="Şifren" secureTextEntry autoComplete="password" textContentType="password" /></View>
    <PrimaryButton title="Giriş yap  →" onPress={() => void submit()} busy={busy} />
    <View style={styles.footer}><Text style={styles.footerText}>Henüz hesabın yok mu?</Text><Link href="/register" style={styles.link}> Hesap oluştur</Link></View>
    <Text style={styles.legal}>Hesabın mevcut EYRION kimlik doğrulama servisiyle korunur.</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { flexGrow: 1, paddingHorizontal: 26, paddingBottom: 28 }, back: { marginTop: 6, width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }, backText: { color: colors.text, fontSize: 28, lineHeight: 30 }, brand: { alignItems: 'center', marginTop: 18, marginBottom: 42 }, wordmark: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: 1.2, marginTop: 12 }, ai: { color: colors.purple }, tagline: { color: colors.muted, marginTop: 4, fontSize: 12 }, eyebrow: { color: colors.purple, fontSize: 10, letterSpacing: 2.4, fontWeight: '800' }, title: { color: colors.text, fontSize: 29, fontWeight: '700', marginTop: 10, letterSpacing: -0.6 }, subtitle: { color: colors.muted, fontSize: 14, marginTop: 8, lineHeight: 21 }, config: { color: '#E8CD8A', backgroundColor: '#242015', borderColor: '#65552E', borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 20, fontSize: 12, lineHeight: 18 }, fields: { gap: 18, marginTop: 28, marginBottom: 24 }, footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 23 }, footerText: { color: colors.muted, fontSize: 13 }, link: { color: colors.lavender, fontSize: 13, fontWeight: '700' }, legal: { color: '#676982', fontSize: 10, textAlign: 'center', marginTop: 'auto', paddingTop: 28 } });
