import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { createChunkedSecureStorage } from './secure-storage';
import { isSupabaseConfigured, mobileConfiguration } from './app-config';

export const supabase = createClient(
  mobileConfiguration.supabaseUrl ?? 'https://configuration-missing.invalid',
  mobileConfiguration.supabasePublishableKey ?? 'configuration-missing',
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

export { isSupabaseConfigured };

if (Platform.OS !== 'web') {
  supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
