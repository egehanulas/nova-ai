import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '../theme';

export function AuthField({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.wrap}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor="#747791" selectionColor={colors.purple} autoCapitalize="none" style={styles.input} {...props} /></View>;
}
const styles = StyleSheet.create({ wrap: { gap: 8 }, label: { color: '#D7D5E7', fontSize: 13, fontWeight: '600' }, input: { minHeight: 54, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: '#0E1120', paddingHorizontal: 16, color: colors.text, fontSize: 15 } });
