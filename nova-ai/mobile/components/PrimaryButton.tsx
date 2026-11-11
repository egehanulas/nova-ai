import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

export function PrimaryButton({ title, onPress, busy, disabled }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy} style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dim]}>
    {busy ? <ActivityIndicator color="#151126" /> : <Text style={styles.label}>{title}</Text>}
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.purple, shadowColor: colors.purple, shadowOpacity: 0.22, shadowRadius: 16, elevation: 4 }, label: { color: '#171126', fontSize: 15, fontWeight: '700' }, dim: { opacity: 0.55 } });
