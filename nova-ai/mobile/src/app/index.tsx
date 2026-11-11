import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme';
import { BrandMark } from '../../components/BrandMark';
import { BottomNav } from '../../components/BottomNav';
import { ConfigurationNotice } from '../../components/ConfigurationNotice';
import { signOutSafely } from '../../lib/auth-actions';

export default function HomeScreen() {
  const { session, ready } = useAuth();
  useEffect(() => { if (ready && !session) router.replace('/login'); }, [ready, session]);
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.purple} /></View>;
  if (!session) return null;
  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.top}><View style={styles.brand}><BrandMark size={42} /><View><Text style={styles.brandName}>EYRION</Text><Text style={styles.brandSub}>AI COMPANION</Text></View></View>
        <Pressable accessibilityLabel="Çıkış yap" onPress={() => void signOutSafely(() => supabase.auth.signOut()).then((ok) => { if (!ok) Alert.alert('Çıkış yapılamadı', 'Oturum kapatılamadı. Bağlantını kontrol edip tekrar dene.'); })} style={styles.avatar}><Text style={styles.avatarText}>{session.user.email?.[0]?.toUpperCase() ?? 'E'}</Text></Pressable>
      </View>
      <Text style={styles.eyebrow}>KİŞİSEL YAPAY ZEKÂN</Text>
      <Text style={styles.title}>Merhaba, <Text style={styles.name}>{session.user.user_metadata?.name || 'yeniden hoş geldin'}</Text></Text>
      <Text style={styles.subtitle}>Bugün aklında ne var? Birlikte keşfedelim.</Text>
      <ConfigurationNotice />
      <View style={styles.hero}><View style={styles.orbitOne} /><View style={styles.orbitTwo} /><BrandMark size={92} /><View style={styles.heroText}><Text style={styles.heroKicker}>YENİ BİR FİKİR</Text><Text style={styles.heroTitle}>Merakını takip et.</Text><Text style={styles.heroBody}>Sorular, düşünceler ve yeni keşifler için buradayım.</Text></View></View>
      <Text style={styles.section}>Nasıl yardımcı olayım?</Text>
      <Pressable style={styles.startCard} onPress={() => router.push('/chat')}><View style={styles.spark}><Text style={styles.sparkText}>✳</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Yeni bir sohbet başlat</Text><Text style={styles.cardSub}>Aklındaki konuyu birlikte açalım</Text></View><Text style={styles.arrow}>↗</Text></Pressable>
      <Text style={styles.smallNote}>Yeni fikirler için EYRION yanında.</Text>
    </ScrollView>
    <BottomNav active="home" />
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, page: { padding: 24, paddingBottom: 50 }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 52 }, brand: { flexDirection: 'row', gap: 12, alignItems: 'center' }, brandName: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: 1.3 }, brandSub: { color: colors.muted, fontSize: 9, letterSpacing: 2.1, marginTop: 3 }, avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.lavender, fontWeight: '700' }, eyebrow: { color: colors.purple, fontSize: 10, letterSpacing: 2.3, fontWeight: '800', marginBottom: 12 }, title: { color: colors.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.8 }, name: { color: colors.lavender }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10 }, notice: { borderColor: '#715E37', borderWidth: 1, borderRadius: 16, padding: 14, backgroundColor: '#242015', marginTop: 24, gap: 4 }, noticeTitle: { color: '#F1D795', fontWeight: '700' }, noticeBody: { color: '#C3B78F', lineHeight: 20, fontSize: 12 }, hero: { minHeight: 240, alignItems: 'center', justifyContent: 'center', borderRadius: 28, marginTop: 34, overflow: 'hidden', backgroundColor: '#17152C', borderWidth: 1, borderColor: '#353052' }, orbitOne: { position: 'absolute', width: 236, height: 236, borderRadius: 118, borderColor: '#423768', borderWidth: 1, top: -104, right: -68 }, orbitTwo: { position: 'absolute', width: 188, height: 188, borderRadius: 94, borderColor: '#304052', borderWidth: 1, bottom: -105, left: -48 }, heroText: { alignItems: 'center', marginTop: 18, paddingHorizontal: 20 }, heroKicker: { color: colors.cyan, fontSize: 9, letterSpacing: 2.2, fontWeight: '800' }, heroTitle: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 7 }, heroBody: { color: colors.muted, fontSize: 12, marginTop: 6, textAlign: 'center' }, section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 34, marginBottom: 14 }, startCard: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }, spark: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#262341', alignItems: 'center', justifyContent: 'center' }, sparkText: { color: colors.lavender, fontSize: 22 }, cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, cardSub: { color: colors.muted, fontSize: 12, marginTop: 5 }, arrow: { color: colors.purple, fontSize: 21, paddingHorizontal: 4 }, smallNote: { color: '#6F718D', fontSize: 11, textAlign: 'center', marginTop: 18 } });
