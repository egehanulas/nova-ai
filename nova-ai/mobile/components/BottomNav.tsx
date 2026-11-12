import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function BottomNav({ active }: { active: 'home' | 'chat' | 'history' | 'settings' }) {
  const items = [
    { key: 'home' as const, label: 'Ana sayfa', icon: '⌂', path: '/' as const },
    { key: 'chat' as const, label: 'Sohbet', icon: '✧', path: '/chat' as const },
    { key: 'history' as const, label: 'Geçmiş', icon: '◷', path: '/history' as const },
    { key: 'settings' as const, label: 'Ayarlar', icon: '⚙', path: '/settings' as const },
  ];
  return <View style={styles.bar}>{items.map((item) => <Pressable accessibilityRole="button" accessibilityState={{ selected: active === item.key }} key={item.key} onPress={() => router.replace(item.path)} style={styles.item}>
    <Text style={[styles.icon, active === item.key && styles.selected]}>{item.icon}</Text><Text style={[styles.label, active === item.key && styles.selected]}>{item.label}</Text>
  </Pressable>)}</View>;
}
const styles = StyleSheet.create({ bar: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderColor: colors.line, backgroundColor: '#0D1020' }, item: { flex: 1, alignItems: 'center', gap: 3 }, icon: { fontSize: 20, color: '#777A99' }, label: { color: '#777A99', fontSize: 10, fontWeight: '600' }, selected: { color: colors.lavender } });
