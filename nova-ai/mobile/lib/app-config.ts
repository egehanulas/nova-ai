export type ConfigField =
  | 'EXPO_PUBLIC_EYRION_API_URL'
  | 'EXPO_PUBLIC_SUPABASE_URL'
  | 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

export type ConfigIssue = { field: ConfigField; scope: 'api' | 'supabase'; message: string };

export type MobileEnvironment = {
  apiUrl?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

export type MobileConfiguration = {
  apiBaseUrl: string | null;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  issues: ConfigIssue[];
};

function parseHttpsUrl(value: string | undefined, field: ConfigField, label: string) {
  const raw = value?.trim();
  if (!raw) return { url: null, issue: { field, scope: field === 'EXPO_PUBLIC_EYRION_API_URL' ? 'api' as const : 'supabase' as const, message: `${field} eksik. ${label} adresini mobile/.env dosyasına ekleyin.` } };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { url: null, issue: { field, scope: field === 'EXPO_PUBLIC_EYRION_API_URL' ? 'api' as const : 'supabase' as const, message: `${field} geçerli bir URL değil. Örneği değil, gerçek HTTPS adresini girin.` } };
  }

  const host = parsed.hostname.toLowerCase();
  const looksLikeTemplate = /your-|replace.?me|example|\.invalid$/.test(`${raw} ${host}`.toLowerCase());
  if (looksLikeTemplate) {
    return { url: null, issue: { field, scope: field === 'EXPO_PUBLIC_EYRION_API_URL' ? 'api' as const : 'supabase' as const, message: `${field} hâlâ örnek değer içeriyor. .env.example içindeki adresler çalışmaz; gerçek proje adresinizle değiştirin.` } };
  }
  if (parsed.protocol !== 'https:' || !host || parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { url: null, issue: { field, scope: field === 'EXPO_PUBLIC_EYRION_API_URL' ? 'api' as const : 'supabase' as const, message: `${field} HTTPS adresi olmalı; kullanıcı bilgisi, sorgu veya # parçası içermemeli.` } };
  }
  return { url: parsed.toString().replace(/\/+$/, ''), issue: null };
}

export function readMobileConfiguration(env: MobileEnvironment): MobileConfiguration {
  const api = parseHttpsUrl(env.apiUrl, 'EXPO_PUBLIC_EYRION_API_URL', 'EYRION API');
  const supabase = parseHttpsUrl(env.supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL', 'Supabase');
  const key = env.supabasePublishableKey?.trim() ?? '';
  let keyIssue: ConfigIssue | null = null;
  if (!key) {
    keyIssue = { field: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', scope: 'supabase', message: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY eksik. Supabase panelindeki publishable key değerini ekleyin.' };
  } else if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key) || /(replace.?me|placeholder|your[_-]?key)/i.test(key)) {
    keyIssue = { field: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', scope: 'supabase', message: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY geçersiz. Yalnızca sb_publishable_ ile başlayan publishable key kullanın; service_role, secret veya örnek anahtar kullanmayın.' };
  }
  const issues = [api.issue, supabase.issue, keyIssue].filter((issue): issue is ConfigIssue => issue !== null);
  return {
    apiBaseUrl: api.url,
    supabaseUrl: supabase.url,
    supabasePublishableKey: keyIssue ? null : key,
    issues,
  };
}

// Expo statically inlines these direct process.env references into the public mobile bundle.
export const mobileConfiguration = readMobileConfiguration({
  apiUrl: process.env.EXPO_PUBLIC_EYRION_API_URL,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const isSupabaseConfigured = Boolean(mobileConfiguration.supabaseUrl && mobileConfiguration.supabasePublishableKey);
export const isApiConfigured = Boolean(mobileConfiguration.apiBaseUrl);
export const supabaseConfigurationIssues = mobileConfiguration.issues.filter((issue) => issue.scope === 'supabase');
export const apiConfigurationIssues = mobileConfiguration.issues.filter((issue) => issue.scope === 'api');

export function formatConfigurationIssues(issues: ConfigIssue[]) {
  return issues.map((issue) => `${issue.field}: ${issue.message}`).join('\n');
}
