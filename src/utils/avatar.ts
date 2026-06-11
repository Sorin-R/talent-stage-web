import { DEFAULT_AVATAR } from '../store/useAppStore';

const AVATAR_CACHE_VERSION = new Date().toISOString().slice(0, 10).replace(/-/g, '');

const getStoredAvatar = (userId: string | number | null | undefined): string | null => {
  if (userId === null || userId === undefined) return null;
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ts_avatar_' + String(userId));
};

const appendAvatarCacheVersion = (url: string): string => {
  if (!url) return url;
  if (/^(?:data|blob):/i.test(url)) return url;
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) return url;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://web-demo.space');
    parsed.searchParams.set('v', AVATAR_CACHE_VERSION);
    return parsed.toString();
  } catch {
    return url.includes('?') ? `${url}&v=${AVATAR_CACHE_VERSION}` : `${url}?v=${AVATAR_CACHE_VERSION}`;
  }
};

export const resolveProfileAvatarSrc = (
  userId: string | number | null | undefined,
  avatarUrl: string | null | undefined,
  fallback: string | null = DEFAULT_AVATAR,
): string => {
  const stored = getStoredAvatar(userId);
  if (stored) return stored;
  const url = avatarUrl || fallback || DEFAULT_AVATAR;
  return appendAvatarCacheVersion(url);
};

export const resolveVideoAvatarSrc = (
  videoUserId: string | number | null | undefined,
  videoAvatarUrl: string | null | undefined,
  currentUserId: string | number | null | undefined,
  currentUserAvatarUrl: string | null | undefined,
  fallback: string | null = DEFAULT_AVATAR,
): string => {
  if (
    videoUserId !== null
    && videoUserId !== undefined
    && currentUserId !== null
    && currentUserId !== undefined
    && String(videoUserId) === String(currentUserId)
  ) {
    const stored = getStoredAvatar(currentUserId);
    if (stored) return stored;
    return appendAvatarCacheVersion(currentUserAvatarUrl || videoAvatarUrl || fallback || DEFAULT_AVATAR);
  }

  return appendAvatarCacheVersion(videoAvatarUrl || fallback || DEFAULT_AVATAR);
};
