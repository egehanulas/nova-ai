import { Text, View, StyleSheet } from 'react-native';
import { colors } from '../theme';

export function BrandMark({ size = 52 }: { size?: number }) {
  return <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.32 }]}>
    <Text style={[styles.glyph, { fontSize: size * 0.55 }]}>△</Text>
    <View style={styles.glint} />
  </View>;
}
const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#7161D9', borderWidth: 1, borderColor: '#BDB0FF', overflow: 'hidden', shadowColor: colors.purple, shadowOpacity: 0.4, shadowRadius: 18, elevation: 8 },
  glyph: { color: '#FFF', fontWeight: '500', lineHeight: 38, marginTop: -3 },
  glint: { position: 'absolute', width: 34, height: 1, backgroundColor: '#D9D0FF', transform: [{ rotate: '-35deg' }], opacity: 0.7 },
});
