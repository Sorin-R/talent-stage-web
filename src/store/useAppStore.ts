import { create } from 'zustand';
import type { User, Video } from '../types';
import { apiFetch, normalizeMediaUrl } from '../services/api';

const DEFAULT_AVATAR = '/icons/account.png';

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

  setUser: (u: User) => {
    // Keep legacy avatar values compatible across localhost/LAN setups
    u.avatar_url = normalizeMediaUrl(u.avatar_url) || null;
    set({ user: u, loggedIn: true });
    localStorage.setItem('ts_user', JSON.stringify(u));
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
