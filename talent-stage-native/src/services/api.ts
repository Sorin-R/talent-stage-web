import type { ApiResponse } from '../types';
import { storage } from './storage';

const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;
const DATA_OR_BLOB_URL_RE = /^(?:data|blob):/i;
const MEDIA_URL_KEYS = new Set(['file_url', 'thumbnail_url', 'avatar_url']);
const STREAM_MANIFEST_RE = /^https?:\/\/(?:iframe\.)?videodelivery\.net\/[^?#]+\/manifest\/video\.m3u8(?:[?#].*)?$/i;
const CFSTREAM_REL_RE = /^\/?uploads\/videos\/cfstream:([a-z0-9_-]+)(?:[?#].*)?$/i;
const CFSTREAM_ABS_RE = /^https?:\/\/[^/]+\/uploads\/videos\/cfstream:([a-z0-9_-]+)(?:[?#].*)?$/i;
const CFSTREAM_DIRECT_RE = /^cfstream:([a-z0-9_-]+)$/i;

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || 'https://api.web-demo.space/api').replace(/\/+$/, '');

const getMediaBase = (): string => API_BASE.replace(/\/api\/?$/, '');

const applyStreamBandwidthHint = (url: string | null | undefined): string | null | undefined => {
  if (!url || !STREAM_MANIFEST_RE.test(url)) return url;

  // Keep stream quality balanced for mobile usage and data.
  // We use one stable hint here because RN does not expose the same network info
  // on all devices by default without extra native dependency.
  const clientBandwidthHint = '1.0';

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('clientBandwidthHint', clientBandwidthHint);
    return parsed.toString();
  } catch {
    return url;
  }
};

const normalizeCfstreamUrl = (url: string | null | undefined): string | null | undefined => {
  if (!url) return url;
  const clean = String(url).trim();
  const direct = clean.match(CFSTREAM_DIRECT_RE)?.[1];
  if (direct) return `https://videodelivery.net/${direct}/manifest/video.m3u8`;
  const rel = clean.match(CFSTREAM_REL_RE)?.[1];
  if (rel) return `https://videodelivery.net/${rel}/manifest/video.m3u8`;
  const abs = clean.match(CFSTREAM_ABS_RE)?.[1];
  if (abs) return `https://videodelivery.net/${abs}/manifest/video.m3u8`;
  return url;
};

export const normalizeMediaUrl = (url: string | null | undefined): string | null | undefined => {
  if (!url) return url;
  if (DATA_OR_BLOB_URL_RE.test(url)) return url;

  const normalizedCloudflareStream = normalizeCfstreamUrl(url);
  if (normalizedCloudflareStream !== url) return applyStreamBandwidthHint(normalizedCloudflareStream);

  if (!ABSOLUTE_HTTP_URL_RE.test(url)) {
    const mediaBase = getMediaBase();
    const relativeUrl = url.startsWith('/') ? url : `/${url}`;
    return `${mediaBase}${relativeUrl}`;
  }

  return applyStreamBandwidthHint(url);
};

const normalizeMediaUrlsInPayload = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeMediaUrlsInPayload);

  const record = value as Record<string, unknown>;

  for (const [key, fieldValue] of Object.entries(record)) {
    if (MEDIA_URL_KEYS.has(key) && typeof fieldValue === 'string') {
      let valueToNormalize = fieldValue.trim();

      if (
        key === 'avatar_url'
        && valueToNormalize
        && !ABSOLUTE_HTTP_URL_RE.test(valueToNormalize)
        && !valueToNormalize.startsWith('/')
        && !valueToNormalize.includes('/')
      ) {
        valueToNormalize = `uploads/avatars/${valueToNormalize}`;
      }

      record[key] = normalizeMediaUrl(valueToNormalize);
      continue;
    }

    if (fieldValue && typeof fieldValue === 'object') {
      record[key] = normalizeMediaUrlsInPayload(fieldValue);
    }
  }

  return record;
};

export async function apiFetch<T = unknown>(
  path: string,
  opts: Omit<RequestInit, 'body'> & { body?: BodyInit | Record<string, unknown> | null } = {},
): Promise<ApiResponse<T>> {
  const { body, ...restOptions } = opts;
  const isFormData = body instanceof FormData;
  const requestHeaders: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };

  const token = await storage.getItem('ts_token');
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  const requestOptions: RequestInit = {
    ...restOptions,
    headers: {
      ...requestHeaders,
      ...((opts.headers as Record<string, string> | undefined) || {}),
    },
  };

  const isJsonRecordBody =
    body !== null
    && typeof body === 'object'
    && !isFormData
    && !(body instanceof Blob)
    && !(body instanceof URLSearchParams)
    && !(body instanceof ArrayBuffer)
    && !ArrayBuffer.isView(body);

  if (body !== undefined) {
    requestOptions.body = isJsonRecordBody ? JSON.stringify(body) : (body as BodyInit);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, requestOptions);
    const responseText = await response.text();

    if (!responseText || !responseText.trim()) {
      return { success: false, error: `Empty response (${response.status})` };
    }

    try {
      const parsedResponse = JSON.parse(responseText) as ApiResponse<T>;
      return normalizeMediaUrlsInPayload(parsedResponse) as ApiResponse<T>;
    } catch {
      return { success: false, error: `Server error: ${response.status}` };
    }
  } catch (error) {
    return { success: false, error: (error as Error).message || 'Cannot reach server' };
  }
}
