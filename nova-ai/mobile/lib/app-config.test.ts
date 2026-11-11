import assert from 'node:assert/strict';
import test from 'node:test';
import { readMobileConfiguration, formatConfigurationIssues } from './app-config';

const validEnvironment = {
  apiUrl: 'https://api.eyrion.ai/',
  supabaseUrl: 'https://project-ref.supabase.co',
  supabasePublishableKey: `sb_publishable_${'a'.repeat(32)}`,
};

test('reports each missing mobile configuration variable', () => {
  const config = readMobileConfiguration({});
  assert.deepEqual(config.issues.map((issue) => issue.field), [
    'EXPO_PUBLIC_EYRION_API_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);
  assert.equal(config.apiBaseUrl, null);
  assert.equal(config.supabaseUrl, null);
  assert.equal(config.supabasePublishableKey, null);
});

test('rejects template values from .env.example instead of treating them as live configuration', () => {
  const config = readMobileConfiguration({
    apiUrl: 'https://your-eyrion-api.invalid',
    supabaseUrl: 'https://your-project.invalid',
    supabasePublishableKey: 'sb_publishable_REPLACE_ME_WITH_A_REAL_KEY',
  });
  assert.equal(config.apiBaseUrl, null);
  assert.equal(config.supabaseUrl, null);
  assert.equal(config.supabasePublishableKey, null);
  assert.equal(config.issues.length, 3);
  assert.match(formatConfigurationIssues(config.issues), /örnek değer|örnek anahtar/i);
});

test('accepts HTTPS service URLs and an sb_publishable key without exposing values in diagnostics', () => {
  const config = readMobileConfiguration(validEnvironment);
  assert.equal(config.issues.length, 0);
  assert.equal(config.apiBaseUrl, 'https://api.eyrion.ai');
  assert.equal(config.supabaseUrl, 'https://project-ref.supabase.co');
  assert.equal(config.supabasePublishableKey, validEnvironment.supabasePublishableKey);
  assert.ok(!formatConfigurationIssues(config.issues).includes(validEnvironment.supabasePublishableKey));
});

test('rejects insecure, malformed, and URL-credential configuration', () => {
  const config = readMobileConfiguration({
    ...validEnvironment,
    apiUrl: 'http://api.eyrion.ai',
    supabaseUrl: 'https://user:password@project-ref.supabase.co',
  });
  assert.equal(config.apiBaseUrl, null);
  assert.equal(config.supabaseUrl, null);
  assert.equal(config.issues.length, 2);
});

test('rejects Supabase secret and legacy JWT keys in the mobile publishable-key field', () => {
  for (const key of ['sb_secret_' + 's'.repeat(32), 'eyJhbGciOiJIUzI1NiJ9.' + 'c2VydmljZV9yb2xl'.repeat(2) + '.signature']) {
    const config = readMobileConfiguration({ ...validEnvironment, supabasePublishableKey: key });
    assert.equal(config.supabasePublishableKey, null);
    assert.match(config.issues.find((issue) => issue.field === 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')?.message ?? '', /service_role|secret|publishable/i);
  }
});
