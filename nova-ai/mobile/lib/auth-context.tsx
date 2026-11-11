import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Linking } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { createAuthLinkQueue } from './auth-deep-link';
import { createAuthSessionSync } from './auth-session-sync';

type AuthState = { session: Session | null; ready: boolean; configured: boolean };
const Context = createContext<AuthState>({ session: null, ready: false, configured: false });
export const useAuth = () => useContext(Context);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    let sessionHydrated = false;
    const sessionSync = createAuthSessionSync<Session | null>((nextSession) => { if (alive) setSession(nextSession); });
    const linkQueue = createAuthLinkQueue(async (code) => {
      if (!sessionHydrated) throw new Error('Stored auth session could not be restored.');
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    });
    const subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      sessionSync.fromAuthEvent(nextSession);
    }).data.subscription;
    const processUrl = (url: string | null) => {
      if (url) void linkQueue.enqueue(url).catch((error) => console.warn('Auth deep link rejected:', error));
    };
    const listener = Linking.addEventListener('url', ({ url }) => processUrl(url));
    void (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const revisionAtReadStart = sessionSync.revision;
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        sessionSync.applySnapshotIfCurrent(revisionAtReadStart, data.session);
        processUrl(initialUrl ?? null);
        sessionHydrated = true;
        linkQueue.sessionLoaded();
        await linkQueue.flush();
        const finalRevision = sessionSync.revision;
        const { data: finalData, error: finalError } = await supabase.auth.getSession();
        if (finalError) throw finalError;
        sessionSync.applySnapshotIfCurrent(finalRevision, finalData.session);
      } catch (error) {
        console.warn('Auth session initialization failed:', error);
      } finally {
        linkQueue.sessionLoaded();
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
      subscription.unsubscribe();
      listener.remove();
    };
  }, []);

  const value = useMemo(() => ({ session, ready, configured: isSupabaseConfigured }), [session, ready]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
