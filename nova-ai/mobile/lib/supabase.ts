import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { createChunkedSecureStorage } from './secure-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
const isConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = createClient(
  isConfigured ? supabaseUrl : 'https://configuration-missing.invalid',
  isConfigured ? supabaseKey : 'configuration-missing',
  {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: createChunkedSecureStorage(SecureStore) } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);

export { isConfigured as isSupabaseConfigured };

if (Platform.OS !== 'web') {
  supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
