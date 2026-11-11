import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Linking } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';

type AuthState = { session: Session | null; ready: boolean; configured: boolean };
const Context = createContext<AuthState>({ session: null, ready: false, configured: false });
export const useAuth = () => useContext(Context);

async function handleAuthUrl(url: string) {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return;
  }
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    const subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) setSession(nextSession);
    }).data.subscription;
    const processUrl = (url: string | null) => {
      if (url) void handleAuthUrl(url).catch((error) => console.warn('Auth deep link failed:', error));
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
      setReady(true);
    });
    void Linking.getInitialURL().then((url) => processUrl(url ?? null));
    const listener = Linking.addEventListener('url', ({ url }) => processUrl(url));
    return () => {
      alive = false;
      subscription.unsubscribe();
      listener.remove();
    };
  }, []);

  const value = useMemo(() => ({ session, ready, configured: isSupabaseConfigured }), [session, ready]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
