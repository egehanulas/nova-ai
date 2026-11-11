import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './auth-context';
import { createPreferenceRepository, defaultPreferences, type MobilePreferences, type PreferenceStorage } from './preferences';

type PreferencesContextValue = {
  preferences: MobilePreferences;
  ready: boolean;
  updatePreferences(patch: Partial<MobilePreferences>): Promise<void>;
};

const Context = createContext<PreferencesContextValue>({ preferences: defaultPreferences, ready: false, updatePreferences: async () => {} });
export const usePreferences = () => useContext(Context);

function getPreferenceStorage(): PreferenceStorage {
  if (Platform.OS === 'web') {
    const browser = globalThis as typeof globalThis & { localStorage?: Storage };
    return {
      async getItem(key) { return browser.localStorage?.getItem(key) ?? null; },
      async setItem(key, value) { browser.localStorage?.setItem(key, value); },
    };
  }
  return { getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync };
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const repository = useMemo(() => createPreferenceRepository(getPreferenceStorage()), []);
  const [preferences, setPreferences] = useState<MobilePreferences>({ ...defaultPreferences });
  const [ready, setReady] = useState(false);
  const preferencesRef = useRef(preferences);
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    let alive = true;
    if (!userId) {
      preferencesRef.current = { ...defaultPreferences };
      setPreferences(preferencesRef.current);
      setReady(true);
      return () => { alive = false; };
    }
    setReady(false);
    void repository.load(userId).then((loaded) => {
      if (!alive) return;
      preferencesRef.current = loaded;
      setPreferences(loaded);
    }).catch(() => {
      if (!alive) return;
      preferencesRef.current = { ...defaultPreferences };
      setPreferences(preferencesRef.current);
    }).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [repository, userId]);

  const updatePreferences = useCallback(async (patch: Partial<MobilePreferences>) => {
    if (!userId) throw new Error('Tercihleri kaydetmek için oturum açmalısın.');
    const previous = preferencesRef.current;
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    setPreferences(next);
    const save = writeQueue.current.catch(() => undefined).then(() => repository.save(userId, next));
    writeQueue.current = save;
    try { await save; }
    catch (error) {
      if (preferencesRef.current === next) {
        preferencesRef.current = previous;
        setPreferences(preferencesRef.current);
      }
      throw error;
    }
  }, [repository, userId]);

  const value = useMemo(() => ({ preferences, ready, updatePreferences }), [preferences, ready, updatePreferences]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
