import { DEFAULT_AVATAR } from '../store/useAppStore';

const getStoredAvatar = (userId: string | number | null | undefined): string | null => {
  if (userId === null || userId === undefined) return null;
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ts_avatar_' + String(userId));
};

export const resolveProfileAvatarSrc = (
  userId: string | number | null | undefined,
  avatarUrl: string | null | undefined,
  fallback: string | null = DEFAULT_AVATAR,
): string => {
  return getStoredAvatar(userId) || avatarUrl || fallback || DEFAULT_AVATAR;
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
    return getStoredAvatar(currentUserId) || currentUserAvatarUrl || videoAvatarUrl || fallback || DEFAULT_AVATAR;
  }

  return videoAvatarUrl || fallback || DEFAULT_AVATAR;
};
