import { supabase } from './supabase';
import { fetch as expoFetch } from 'expo/fetch';
import { formatConfigurationIssues, isApiConfigured, mobileConfiguration, apiConfigurationIssues } from './app-config';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const apiBaseUrl = mobileConfiguration.apiBaseUrl;

function requireApiUrl() {
  if (!isApiConfigured || !apiBaseUrl) {
    throw new Error(formatConfigurationIssues(apiConfigurationIssues) || 'EXPO_PUBLIC_EYRION_API_URL yapılandırılmamış.');
  }
  return apiBaseUrl;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = requireApiUrl();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Bu işlem için oturum açmalısınız.');
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  const response = await expoFetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof body?.error === 'string' ? body.error : 'Sunucu isteği tamamlanamadı.', response.status);
  }
  return body as T;
}

export async function apiStreamRequest(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
  const baseUrl = requireApiUrl();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Bu işlem için oturum açmalısınız.');
  const response = await expoFetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'POST', signal,
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(typeof payload?.error === 'string' ? payload.error : 'Sunucu isteği tamamlanamadı.', response.status);
  }
  return response;
}

export { isApiConfigured };
