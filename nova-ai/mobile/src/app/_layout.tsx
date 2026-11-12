import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../../lib/auth-context';
import { PreferencesProvider } from '../../lib/preferences-context';
import { colors } from '../../theme';

export default function RootLayout() {
  return <AuthProvider><PreferencesProvider><StatusBar style="light" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
    <Stack.Screen name="index" /><Stack.Screen name="login" /><Stack.Screen name="register" /><Stack.Screen name="reset-password" /><Stack.Screen name="chat" /><Stack.Screen name="history" /><Stack.Screen name="settings" /><Stack.Screen name="memories" />
  </Stack></PreferencesProvider></AuthProvider>;
}
