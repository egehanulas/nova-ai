export type MobilePreferences = {
  autoLearnMemories: boolean;
  speakResponses: boolean;
  researchByDefault: boolean;
};

export const defaultPreferences: MobilePreferences = {
  autoLearnMemories: true,
  speakResponses: false,
  researchByDefault: false,
};

export type PreferenceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

function preferenceKey(userId: string) { return `eyrion.mobile.preferences.v1.${userId}`; }

export function createPreferenceRepository(storage: PreferenceStorage) {
  return {
    async load(userId: string): Promise<MobilePreferences> {
      const raw = await storage.getItem(preferenceKey(userId));
      if (!raw) return { ...defaultPreferences };
      try {
        const parsed = JSON.parse(raw) as Partial<MobilePreferences>;
        return {
          autoLearnMemories: typeof parsed.autoLearnMemories === 'boolean' ? parsed.autoLearnMemories : defaultPreferences.autoLearnMemories,
          speakResponses: typeof parsed.speakResponses === 'boolean' ? parsed.speakResponses : defaultPreferences.speakResponses,
          researchByDefault: typeof parsed.researchByDefault === 'boolean' ? parsed.researchByDefault : defaultPreferences.researchByDefault,
        };
      } catch { return { ...defaultPreferences }; }
    },
    async save(userId: string, preferences: MobilePreferences) {
      await storage.setItem(preferenceKey(userId), JSON.stringify(preferences));
    },
  };
}
