import { StyleSheet, Text, View } from 'react-native';
import { mobileConfiguration, type ConfigIssue } from '../lib/app-config';

type ConfigurationNoticeProps = { scope?: 'api' | 'supabase' | 'all' };

export function ConfigurationNotice({ scope = 'all' }: ConfigurationNoticeProps) {
  const issues: ConfigIssue[] = mobileConfiguration.issues.filter((issue) => scope === 'all' || issue.scope === scope);
  if (!issues.length) return null;
  return <View accessibilityRole="alert" style={styles.notice}>
    <Text style={styles.title}>Uygulama yapılandırması eksik</Text>
    <Text style={styles.body}>mobile/.env.example yalnızca şablondur. mobile klasöründe .env oluşturup aşağıdaki alanları gerçek değerlerle doldurun; örnek adres ve anahtarlar çalışmaz.</Text>
    {issues.map((issue) => <Text key={issue.field} style={styles.issue}><Text style={styles.field}>{issue.field}</Text>{'\n'}{issue.message}</Text>)}
    <Text style={styles.footnote}>Gizli anahtar girmeyin. Supabase için yalnızca publishable key kullanılır.</Text>
  </View>;
}

const styles = StyleSheet.create({
  notice: { borderColor: '#715E37', borderWidth: 1, borderRadius: 16, padding: 14, backgroundColor: '#242015', marginTop: 18, gap: 8 },
  title: { color: '#F1D795', fontWeight: '700', fontSize: 13 },
  body: { color: '#C3B78F', lineHeight: 19, fontSize: 11 },
  issue: { color: '#E7D7A6', lineHeight: 17, fontSize: 10, borderTopColor: '#50462D', borderTopWidth: 1, paddingTop: 8 },
  field: { color: '#F7E6B5', fontWeight: '800' },
  footnote: { color: '#AFA27C', lineHeight: 16, fontSize: 10 },
});
