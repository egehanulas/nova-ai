import { supabase } from './supabase';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const apiBaseUrl = process.env.EXPO_PUBLIC_EYRION_API_URL?.trim().replace(/\/+$/, '');

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) throw new Error('EXPO_PUBLIC_EYRION_API_URL yapılandırılmamış.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Bu işlem için oturum açmalısınız.');
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  const response = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof body?.error === 'string' ? body.error : 'Sunucu isteği tamamlanamadı.', response.status);
  }
  return body as T;
}

export const isApiConfigured = Boolean(apiBaseUrl);
