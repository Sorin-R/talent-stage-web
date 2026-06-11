import { create } from 'zustand';
import type { User, Video } from '../types';
import { apiFetch, normalizeMediaUrl } from '../services/api';

const DEFAULT_AVATAR = '/icons/account.png';

const syncUserAvatarInVideos = (videos: Video[], userId: string, avatarUrl: string | null) => (
  videos.map((videoItem) => (
    videoItem.user_id === userId
      ? { ...videoItem, avatar_url: avatarUrl }
      : videoItem
  ))
);

interface AppState {
  // Auth
  loggedIn: boolean;
  user: User | null;
  token: string;

  // Feed
  feedVideos: Video[];
  feedIndex: number;
  currentVideo: Video | null;
  feedMuted: boolean;
  feedCat: string;
  feedCreatorContext: { userId: string; creatorName: string } | null;
  feedSavedContext: boolean;

  // UI
  cmtsOpen: boolean;
  drawerOpen: boolean;
  shareOpen: boolean;
  uploadInProgress: boolean;
  uploadProgress: number;

  // Actions
  setUser: (u: User) => void;
  logout: () => void;
  setFeedVideos: (videos: Video[]) => void;
  setCurrentVideo: (v: Video | null) => void;
  setFeedIndex: (i: number) => void;
  toggleMute: () => void;
  setFeedCat: (cat: string) => void;
  setFeedCreatorContext: (ctx: { userId: string; creatorName: string } | null) => void;
  setFeedSavedContext: (active: boolean) => void;
  setCmtsOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;
  setUploadStatus: (active: boolean, progress: number) => void;
  restoreSession: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  loggedIn: false,
  user: null,
  token: localStorage.getItem('ts_token') || '',
  feedVideos: [],
  feedIndex: 0,
  currentVideo: null,
  feedMuted: true,
  feedCat: '',
  feedCreatorContext: null,
  feedSavedContext: false,
  cmtsOpen: false,
  drawerOpen: false,
  shareOpen: false,
  uploadInProgress: false,
  uploadProgress: 0,

  setUser: (u: User) => {
    const normalizedUser = {
      ...u,
      avatar_url: normalizeMediaUrl(u.avatar_url) || null,
    };
    set((state) => ({
      user: normalizedUser,
      loggedIn: true,
      feedVideos: syncUserAvatarInVideos(state.feedVideos, normalizedUser.id, normalizedUser.avatar_url),
      currentVideo: state.currentVideo && state.currentVideo.user_id === normalizedUser.id
        ? { ...state.currentVideo, avatar_url: normalizedUser.avatar_url }
        : state.currentVideo,
    }));
    localStorage.setItem('ts_user', JSON.stringify(normalizedUser));
  },

  logout: () => {
    localStorage.removeItem('ts_token');
    localStorage.removeItem('ts_user');
    set({ loggedIn: false, user: null, token: '' });
  },

  setFeedVideos: (videos) => set({ feedVideos: videos }),
  setCurrentVideo: (v) => set({ currentVideo: v }),
  setFeedIndex: (i) => set({ feedIndex: i }),
  toggleMute: () => set((s) => ({ feedMuted: !s.feedMuted })),
  setFeedCat: (cat) => set({ feedCat: cat }),
  setFeedCreatorContext: (ctx) => set({ feedCreatorContext: ctx }),
  setFeedSavedContext: (active) => set({ feedSavedContext: active }),
  setCmtsOpen: (open) => set({ cmtsOpen: open }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setShareOpen: (open) => set({ shareOpen: open }),
  setUploadStatus: (active, progress) => set({
    uploadInProgress: active,
    uploadProgress: Math.max(0, Math.min(100, Math.floor(progress))),
  }),

  restoreSession: async () => {
    const token = localStorage.getItem('ts_token');
    if (!token) return;
    set({ token });
    const data = await apiFetch<User>('/auth/me');
    if (data.success && data.data) {
      get().setUser(data.data);
    } else {
      localStorage.removeItem('ts_token');
      localStorage.removeItem('ts_user');
    }
  },
}));

export { DEFAULT_AVATAR };
