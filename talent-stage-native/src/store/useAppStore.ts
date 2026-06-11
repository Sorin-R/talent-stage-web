import { create } from 'zustand';
import type { User, Video } from '../types';
import { apiFetch, getVideoThumbnailUrl, normalizeMediaUrl } from '../services/api';
import { storage } from '../services/storage';

const STORAGE_USER_KEY = 'ts_user';
const STORAGE_TOKEN_KEY = 'ts_token';
const STORAGE_FEED_MUTED_KEY = 'ts_feed_muted';

interface CreatorContext {
  userId: string;
  creatorName: string;
}

interface AppStoreState {
  loggedIn: boolean;
  user: User | null;
  token: string;

  feedVideos: Video[];
  feedIndex: number;
  currentVideo: Video | null;
  feedMuted: boolean;
  feedCategory: string;
  feedSearchText: string;
  feedCreatorContext: CreatorContext | null;
  feedSavedContext: boolean;

  commentsOpen: boolean;
  drawerOpen: boolean;
  shareSheetOpen: boolean;
  uploadInProgress: boolean;
  uploadProgressValue: number;

  setUser: (nextUser: User) => Promise<void>;
  setSession: (nextUser: User, authToken: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;

  setFeedVideos: (nextVideos: Video[]) => void;
  setCurrentVideo: (nextVideo: Video | null) => void;
  setFeedIndex: (nextIndex: number) => void;
  setFeedCategory: (nextCategoryName: string) => void;
  setFeedSearchText: (nextSearchText: string) => void;
  setFeedCreatorContext: (nextContext: CreatorContext | null) => void;
  setFeedSavedContext: (nextState: boolean) => void;
  toggleFeedMute: () => Promise<void>;

  setCommentsOpen: (nextState: boolean) => void;
  setDrawerOpen: (nextState: boolean) => void;
  setShareSheetOpen: (nextState: boolean) => void;
  setUploadStatus: (isActive: boolean, progressValue: number) => void;
}

const normalizeUserObject = (userObject: User): User => ({
  ...userObject,
  avatar_url: normalizeMediaUrl(userObject.avatar_url) || null,
});

const normalizeVideoObject = (videoObject: Video): Video => ({
  ...videoObject,
  file_url: normalizeMediaUrl(videoObject.file_url) || '',
  thumbnail_url: getVideoThumbnailUrl(videoObject.thumbnail_url, videoObject.file_url) || null,
  avatar_url: normalizeMediaUrl(videoObject.avatar_url) || null,
});

const syncUserAvatarInVideos = (videos: Video[], userId: string, avatarUrl: string | null) => (
  videos.map((videoItem) => (
    String(videoItem.user_id) === String(userId)
      ? { ...videoItem, avatar_url: avatarUrl }
      : videoItem
  ))
);

export const useAppStore = create<AppStoreState>((set, get) => ({
  loggedIn: false,
  user: null,
  token: '',

  feedVideos: [],
  feedIndex: 0,
  currentVideo: null,
  feedMuted: false,
  feedCategory: '',
  feedSearchText: '',
  feedCreatorContext: null,
  feedSavedContext: false,

  commentsOpen: false,
  drawerOpen: false,
  shareSheetOpen: false,
  uploadInProgress: false,
  uploadProgressValue: 0,

  setUser: async (nextUser) => {
    const normalizedUser = normalizeUserObject(nextUser);
    const normalizedUserId = String(normalizedUser.id);
    await storage.setItem(STORAGE_USER_KEY, JSON.stringify(normalizedUser));
    set((state) => ({
      user: normalizedUser,
      loggedIn: true,
      feedVideos: syncUserAvatarInVideos(state.feedVideos, normalizedUserId, normalizedUser.avatar_url),
      currentVideo: state.currentVideo && String(state.currentVideo.user_id) === normalizedUserId
        ? { ...state.currentVideo, avatar_url: normalizedUser.avatar_url }
        : state.currentVideo,
    }));
  },

  setSession: async (nextUser, authToken) => {
    const normalizedUser = normalizeUserObject(nextUser);
    const normalizedUserId = String(normalizedUser.id);
    await storage.setItem(STORAGE_USER_KEY, JSON.stringify(normalizedUser));
    await storage.setItem(STORAGE_TOKEN_KEY, authToken);
    set((state) => ({
      user: normalizedUser,
      token: authToken,
      loggedIn: true,
      feedVideos: syncUserAvatarInVideos(state.feedVideos, normalizedUserId, normalizedUser.avatar_url),
      currentVideo: state.currentVideo && String(state.currentVideo.user_id) === normalizedUserId
        ? { ...state.currentVideo, avatar_url: normalizedUser.avatar_url }
        : state.currentVideo,
    }));
  },

  restoreSession: async () => {
    const [savedToken, savedUserRaw, savedFeedMuted] = await Promise.all([
      storage.getItem(STORAGE_TOKEN_KEY),
      storage.getItem(STORAGE_USER_KEY),
      storage.getItem(STORAGE_FEED_MUTED_KEY),
    ]);

    if (savedFeedMuted !== null) {
      set({ feedMuted: savedFeedMuted === '1' });
    }

    if (!savedToken || !savedUserRaw) {
      set({ loggedIn: false, user: null, token: '' });
      return;
    }

    try {
      const parsedUser = JSON.parse(savedUserRaw) as User;
      set({ loggedIn: true, user: normalizeUserObject(parsedUser), token: savedToken });

      const profileResponse = await apiFetch<User>('/auth/me');
      if (profileResponse.success && profileResponse.data) {
        const normalizedUser = normalizeUserObject(profileResponse.data);
        await storage.setItem(STORAGE_USER_KEY, JSON.stringify(normalizedUser));
        set({ user: normalizedUser, loggedIn: true, token: savedToken });
      }
    } catch {
      await storage.removeItem(STORAGE_TOKEN_KEY);
      await storage.removeItem(STORAGE_USER_KEY);
      set({ loggedIn: false, user: null, token: '' });
    }
  },

  logout: async () => {
    await storage.removeItem(STORAGE_TOKEN_KEY);
    await storage.removeItem(STORAGE_USER_KEY);
    set({
      loggedIn: false,
      user: null,
      token: '',
      commentsOpen: false,
      shareSheetOpen: false,
      feedCreatorContext: null,
      feedSavedContext: false,
    });
  },

  setFeedVideos: (nextVideos) => {
    const normalizedVideos = nextVideos.map(normalizeVideoObject);
    set({ feedVideos: normalizedVideos });
  },
  setCurrentVideo: (nextVideo) => {
    set({ currentVideo: nextVideo ? normalizeVideoObject(nextVideo) : null });
  },
  setFeedIndex: (nextIndex) => set({ feedIndex: nextIndex }),
  setFeedCategory: (nextCategoryName) => set({ feedCategory: nextCategoryName }),
  setFeedSearchText: (nextSearchText) => set({ feedSearchText: nextSearchText }),
  setFeedCreatorContext: (nextContext) => set({ feedCreatorContext: nextContext }),
  setFeedSavedContext: (nextState) => set({ feedSavedContext: nextState }),

  toggleFeedMute: async () => {
    const nextMutedState = !get().feedMuted;
    await storage.setItem(STORAGE_FEED_MUTED_KEY, nextMutedState ? '1' : '0');
    set({ feedMuted: nextMutedState });
  },

  setCommentsOpen: (nextState) => set({ commentsOpen: nextState }),
  setDrawerOpen: (nextState) => set({ drawerOpen: nextState }),
  setShareSheetOpen: (nextState) => set({ shareSheetOpen: nextState }),
  setUploadStatus: (isActive, progressValue) => set({
    uploadInProgress: isActive,
    uploadProgressValue: Math.max(0, Math.min(100, Math.floor(progressValue))),
  }),
}));
