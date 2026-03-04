import type { ApiResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
export const MAINTENANCE_EVENT = 'ts:maintenance-mode';
const LOCALHOST_URL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i;
const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;
const MEDIA_URL_KEYS = new Set(['file_url', 'thumbnail_url', 'avatar_url']);

const getMediaBase = (): string => {
  if (ABSOLUTE_HTTP_URL_RE.test(API_BASE)) {
    return API_BASE.replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

export const normalizeMediaUrl = (url: string | null | undefined): string | null | undefined => {
  if (!url || !ABSOLUTE_HTTP_URL_RE.test(url)) return url;
  if (!LOCALHOST_URL_RE.test(url)) return url;
  const mediaBase = getMediaBase();
  if (!mediaBase) return url;
  return url.replace(LOCALHOST_URL_RE, mediaBase);
};

const normalizeMediaUrlsInPayload = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeMediaUrlsInPayload);

  const record = value as Record<string, unknown>;
  for (const [key, fieldValue] of Object.entries(record)) {
    if (MEDIA_URL_KEYS.has(key) && typeof fieldValue === 'string') {
      record[key] = normalizeMediaUrl(fieldValue);
      continue;
    }
    if (fieldValue && typeof fieldValue === 'object') {
      record[key] = normalizeMediaUrlsInPayload(fieldValue);
    }
  }
  return record;
};

const emitMaintenanceMode = (active: boolean, message = ''): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MAINTENANCE_EVENT, { detail: { active, message } }));
};

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit & { body?: BodyInit | Record<string, unknown> | null } = {},
): Promise<ApiResponse<T>> {
  const isForm = opts.body instanceof FormData;
  const headers: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('ts_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const fetchOpts: RequestInit = {
    ...opts,
    headers: { ...headers, ...(opts.headers as Record<string, string> || {}) },
  };

  if (opts.body && !isForm && typeof opts.body === 'object' && !(opts.body instanceof Blob)) {
    fetchOpts.body = JSON.stringify(opts.body);
  }

  try {
    const res = await fetch(API_BASE + path, fetchOpts);
    const text = await res.text();
    if (!text || text.trim() === '') return { success: false, error: 'Empty response' };
    try {
      const parsed = JSON.parse(text) as ApiResponse<T>;
      if (res.status === 503) {
        emitMaintenanceMode(true, parsed.error || 'We are currently doing maintenance. Please try again later.');
      }
      return normalizeMediaUrlsInPayload(parsed) as ApiResponse<T>;
    } catch {
      console.error('Non-JSON response from', path, ':', text.slice(0, 200));
      if (res.status === 503) {
        emitMaintenanceMode(true, 'We are currently doing maintenance. Please try again later.');
      }
      return { success: false, error: 'Server error: ' + res.status };
    }
  } catch (e) {
    console.error('Network error:', (e as Error).message);
    return { success: false, error: 'Cannot reach server' };
  }
}
