import type { ApiResponse } from '../types';
import { storage } from './storage';

const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;
const DATA_OR_BLOB_URL_RE = /^(?:data|blob):/i;
const MEDIA_URL_KEYS = new Set(['file_url', 'thumbnail_url', 'avatar_url']);
const STREAM_MANIFEST_RE = /^https?:\/\/(?:iframe\.)?videodelivery\.net\/[^?#]+\/manifest\/video\.m3u8(?:[?#].*)?$/i;
const STREAM_MANIFEST_CAPTURE_RE = /^https?:\/\/(?:iframe\.)?videodelivery\.net\/([^/?#]+)\/manifest\/video\.m3u8(?:[?#].*)?$/i;
const STREAM_THUMBNAIL_CAPTURE_RE = /^https?:\/\/(?:iframe\.)?videodelivery\.net\/([^/?#]+)\/thumbnails\/thumbnail\.jpg(?:[?#].*)?$/i;
const CFSTREAM_REL_RE = /^\/?uploads\/videos\/cfstream:([a-z0-9_-]+)(?:[?#].*)?$/i;
const CFSTREAM_ABS_RE = /^https?:\/\/[^/]+\/uploads\/videos\/cfstream:([a-z0-9_-]+)(?:[?#].*)?$/i;
const CFSTREAM_DIRECT_RE = /^cfstream:([a-z0-9_-]+)$/i;
const CFSTREAM_ANY_RE = /cfstream:([a-z0-9_-]+)/i;

const DEFAULT_API_BASE = 'https://api.web-demo.space/api';
const normalizeApiBase = (base: string): string => {
  const clean = String(base || '').trim().replace(/\/+$/, '');
  if (!clean) return DEFAULT_API_BASE;
  if (/\/api$/i.test(clean)) return clean;
  return `${clean}/api`;
};

export const API_BASE = normalizeApiBase(process.env.EXPO_PUBLIC_API_BASE || DEFAULT_API_BASE);

const getMediaBase = (): string => API_BASE.replace(/\/api\/?$/, '');
const toCloudflareStreamManifest = (uid: string) => `https://videodelivery.net/${uid}/manifest/video.m3u8`;
const toCloudflareStreamThumbnail = (uid: string) => `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg`;
const toCloudflareStreamThumbnailAtSecond = (uid: string, second: number) => (
  `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=${Math.max(0, Math.floor(second))}s`
);

const cleanMediaValue = (value: string | null | undefined): string => String(value || '').trim();
const isMissingMediaValue = (value: string | null | undefined): boolean => {
  const clean = cleanMediaValue(value).toLowerCase();
  return clean === '' || clean === 'null' || clean === 'undefined' || clean === 'none' || clean === 'n/a';
};

const getCloudflareStreamUid = (url: string): string | null => {
  const clean = String(url || '').trim();
  if (!clean) return null;

  const direct = clean.match(CFSTREAM_DIRECT_RE)?.[1];
  if (direct) return direct;

  const rel = clean.match(CFSTREAM_REL_RE)?.[1];
  if (rel) return rel;

  const abs = clean.match(CFSTREAM_ABS_RE)?.[1];
  if (abs) return abs;

  const anyMatch = clean.match(CFSTREAM_ANY_RE)?.[1];
  if (anyMatch) return anyMatch;

  const manifest = clean.match(STREAM_MANIFEST_CAPTURE_RE)?.[1];
  if (manifest) return manifest;

  const thumbnail = clean.match(STREAM_THUMBNAIL_CAPTURE_RE)?.[1];
  if (thumbnail) return thumbnail;

  return null;
};

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
  const streamUid = getCloudflareStreamUid(String(url));
  if (streamUid) return toCloudflareStreamManifest(streamUid);
  return url;
};

const normalizeThumbnailUrl = (url: string | null | undefined): string | null | undefined => {
  if (isMissingMediaValue(url)) return null;
  if (DATA_OR_BLOB_URL_RE.test(url as string)) return url;

  const streamUid = getCloudflareStreamUid(String(url));
  if (streamUid) return toCloudflareStreamThumbnail(streamUid);

  if (!ABSOLUTE_HTTP_URL_RE.test(url as string)) {
    const mediaBase = getMediaBase();
    const relativeUrl = String(url).startsWith('/') ? String(url) : `/${String(url)}`;
    return `${mediaBase}${relativeUrl}`;
  }

  return url;
};

export const getVideoThumbnailCandidates = (
  thumbnailUrl?: string | null,
  fileUrl?: string | null,
): string[] => {
  const candidateValues: Array<string | null | undefined> = [];
  const normalizedThumbnail = normalizeThumbnailUrl(thumbnailUrl || null);
  const normalizedFromFile = normalizeThumbnailUrl(fileUrl || null);

  candidateValues.push(normalizedThumbnail);
  candidateValues.push(normalizedFromFile);

  const streamUid = getCloudflareStreamUid(cleanMediaValue(thumbnailUrl)) || getCloudflareStreamUid(cleanMediaValue(fileUrl));
  if (streamUid) {
    candidateValues.push(toCloudflareStreamThumbnail(streamUid));
    candidateValues.push(toCloudflareStreamThumbnailAtSecond(streamUid, 1));
    candidateValues.push(toCloudflareStreamThumbnailAtSecond(streamUid, 2));
  }

  const uniqueCandidates = new Set<string>();
  for (const value of candidateValues) {
    if (typeof value !== 'string') continue;
    const clean = value.trim();
    if (!clean || isMissingMediaValue(clean)) continue;
    uniqueCandidates.add(clean);
  }
  return Array.from(uniqueCandidates);
};

export const getVideoThumbnailUrl = (
  thumbnailUrl?: string | null,
  fileUrl?: string | null,
): string | null => {
  return getVideoThumbnailCandidates(thumbnailUrl, fileUrl)[0] || null;
};

export const normalizeMediaUrl = (url: string | null | undefined): string | null | undefined => {
  if (isMissingMediaValue(url)) return null;
  const cleanUrl = String(url);
  if (DATA_OR_BLOB_URL_RE.test(cleanUrl)) return cleanUrl;

  const normalizedCloudflareStream = normalizeCfstreamUrl(cleanUrl);
  if (normalizedCloudflareStream !== url) return applyStreamBandwidthHint(normalizedCloudflareStream);

  if (!ABSOLUTE_HTTP_URL_RE.test(cleanUrl)) {
    const mediaBase = getMediaBase();
    const relativeUrl = cleanUrl.startsWith('/') ? cleanUrl : `/${cleanUrl}`;
    return `${mediaBase}${relativeUrl}`;
  }

  return applyStreamBandwidthHint(cleanUrl);
};

const normalizeMediaUrlsInPayload = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeMediaUrlsInPayload);

  const record = value as Record<string, unknown>;

  for (const [key, fieldValue] of Object.entries(record)) {
    if (MEDIA_URL_KEYS.has(key) && typeof fieldValue === 'string') {
      const valueToNormalize = fieldValue.trim();

      if (key === 'thumbnail_url') {
        record[key] = normalizeThumbnailUrl(valueToNormalize);
        continue;
      }

      if (key === 'avatar_url') {
        record[key] = normalizeMediaUrl(valueToNormalize);
        continue;
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
