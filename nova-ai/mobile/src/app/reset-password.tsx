import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme';

export default function ResetPasswordScreen() {
  const { session, ready, passwordRecovery, clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (ready && (!session || !passwordRecovery)) router.replace('/login'); }, [ready, session, passwordRecovery]);
  const save = async () => {
    if (password.length < 8 || password !== confirm) { Alert.alert('Şifreyi kontrol et', password.length < 8 ? 'Şifre en az 8 karakter olmalı.' : 'Şifreler birbiriyle eşleşmiyor.'); return; }
    setBusy(true);
    try { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; clearPasswordRecovery(); Alert.alert('Şifre güncellendi', 'Yeni şifren hesabına kaydedildi.'); router.replace('/'); }
    catch (error) { Alert.alert('Şifre güncellenemedi', error instanceof Error ? error.message : 'Biraz sonra tekrar dene.'); }
    finally { setBusy(false); }
  };
  if (!ready || !session || !passwordRecovery) return <View style={styles.center}><Text style={styles.copy}>Şifre yenileme bağlantısı doğrulanıyor…</Text></View>;
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}><Text style={styles.kicker}>HESAP GÜVENLİĞİ</Text><Text style={styles.title}>Yeni şifreni belirle</Text><Text style={styles.copy}>Şifren en az 8 karakter olmalı.</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="Yeni şifre" placeholderTextColor="#747792" style={styles.input} /><TextInput value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" placeholder="Şifreyi tekrar yaz" placeholderTextColor="#747792" style={styles.input} /><Pressable disabled={busy} onPress={() => void save()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Kaydediliyor…' : 'Şifreyi güncelle'}</Text></Pressable></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, body: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }, kicker: { color: colors.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 2 }, title: { color: colors.text, fontSize: 27, fontWeight: '800' }, copy: { color: colors.muted, fontSize: 13 }, input: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, color: colors.text, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 }, button: { alignSelf: 'flex-start', backgroundColor: '#7966DF', borderRadius: 13, paddingVertical: 13, paddingHorizontal: 18 }, buttonText: { color: '#FFF', fontWeight: '700' } });
