<DOCUMENT filename="Home.tsx">
import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { useAppStore, DEFAULT_AVATAR } from '../store/useAppStore';
import { apiFetch } from '../services/api';
import { toast } from '../components/Toast';
import { useSwipe } from '../hooks/useSwipe';
import ActionBar from '../components/ActionBar';
import Comments from '../components/Comments';
import ReactionOverlay from '../components/ReactionOverlay';
import { TALENT_TYPES } from '../types';
import type { Video, PaginatedResponse, UserWithStats } from '../types';

const COMMENT_ICON = '/icons/comment.png';
const SEARCH_ICON = '/icons/search.png';
const MENU_ICON = '/icons/menu.png';
const PLAY_OVERLAY_ICON = '/icons/play.png';
const PAUSE_OVERLAY_ICON = '/icons/pause.png';
const SLIDE_MS = 240;
const SLIDE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const TITLE_PREVIEW_CHARS = 35;
const CREATOR_HANDLE_MAX = 20;
const CREATOR_HANDLE_TRUNCATED = 17;
const WHEEL_THRESHOLD = 30;
const WHEEL_DEBOUNCE_MS = 400;
const SWIPE_COOLDOWN_MS = 320;
const VELOCITY_SCALE = 30; // Tune: higher = more sensitive to speed

interface Props {
  onNav: (page: string, data?: unknown) => void;
}

interface PendingSwipe {
  txn: number;
  nextIdx: number;
  nextVideo: Video;
  direction: 'up' | 'down';
  animationStarted: boolean;
}

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

export default function Home({ onNav }: Props) {
  const {
    feedVideos, setFeedVideos, feedIndex, setFeedIndex,
    currentVideo, setCurrentVideo, feedMuted, toggleMute,
    feedCat, setFeedCat, feedCreatorContext, setFeedCreatorContext, feedSavedContext, setFeedSavedContext, cmtsOpen, setCmtsOpen,
    setDrawerOpen, loggedIn,
  } = useAppStore();

  const [catOpen, setCatOpen] = useState(false);
  const [browseCreatorPickerOpen, setBrowseCreatorPickerOpen] = useState(false);
  const [browseCreatorCategories, setBrowseCreatorCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [creatorResults, setCreatorResults] = useState<UserWithStats[]>([]);
  const [creatorSearchOpen, setCreatorSearchOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Band (strip) animation — current + next video move as one continuous strip
  const [stripOffset, setStripOffset]   = useState(0);                        // translateY in px
  const [stripDir,    setStripDir]      = useState<'up' | 'down' | null>(null); // swipe direction
  const [stripNext,   setStripNext]     = useState<Video | null>(null);        // video peeking in
  const [stripSnap,   setStripSnap]     = useState(false);                     // true = CSS transition active
  const [slideDuration, setSlideDuration] = useState(SLIDE_MS);               // Dynamic duration for velocity

  const [containerH,  setContainerH]   = useState(844);   // feed-container height, updated by ResizeObserver
  const [, setNextVideoReady] = useState(false);
  const [reaction,    setReaction]     = useState<'like' | 'dislike' | null>(null);
  const [videoVoted,  setVideoVoted]   = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [mainCommentText, setMainCommentText] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [playbackIndicator, setPlaybackIndicator] = useState<'play' | 'pause' | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [muteBtnTop, setMuteBtnTop] = useState<number | null>(null);

  const feedContainerRef  = useRef<HTMLDivElement>(null);
  const titleRowRef       = useRef<HTMLDivElement>(null);
  const videoRefA         = useRef<HTMLVideoElement>(null);
  const videoRefB         = useRef<HTMLVideoElement>(null);
  const stripRef          = useRef<HTMLDivElement>(null);
  const activeSlot        = useRef<'A' | 'B'>('A');
  const preloadedVideoId  = useRef<string | null>(null);
  const slotJustSwapped   = useRef(false);
  const pendingSwipeRef   = useRef<PendingSwipe | null>(null);
  const isAnimatingRef    = useRef(false);
  const isTouchLikeRef    = useRef(false);
  const swipeLockUntilRef = useRef(0);
  const videoErrorCountRef = useRef<Record<string, number>>({});
  const swipeTxnRef       = useRef(0);
  const reactionKey       = useRef(0);
  const searchTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatorSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadWaitTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapBackTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupPlayWatchdog = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadFeedSeqRef    = useRef(0);
  const failedVideos      = useRef<Set<string>>(new Set());
  const watchMilestonesRef = useRef<Set<number>>(new Set());
  const lastWatchPctRef = useRef<number>(0);
  const watchStartedAtRef = useRef<number>(Date.now());
  const completionSentRef = useRef<boolean>(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const lastTouchRef = useRef<{ y: number; time: number; velocity: number }>({ y: 0, time: 0, velocity: 0 });

  const getActiveRef = useCallback(() =>
    activeSlot.current === 'A' ? videoRefA : videoRefB, []);

  const getInactiveRef = useCallback(() =>
    activeSlot.current === 'A' ? videoRefB : videoRefA, []);

  // Mobile-safe play: begin muted for autoplay policy, then restore user preference.
  const safePlay = useCallback((el: HTMLVideoElement) => {
    el.muted = true;
    el.play().then(() => { el.muted = feedMuted; }).catch(() => {
      el.muted = true;
      el.play().catch(() => {});
    });
  }, [feedMuted]);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!sentinel) return;
    try {
      await sentinel.release();
    } catch {
      // ignored
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    const wakeLockApi = (navigator as unknown as {
      wakeLock?: {
        request?: (type: 'screen') => Promise<WakeLockSentinelLike>;
      };
    }).wakeLock;
    if (typeof wakeLockApi?.request !== 'function') return;
    if (wakeLockRef.current && !wakeLockRef.current.released) return;
    try {
      const sentinel = await wakeLockApi.request('screen');
      wakeLockRef.current = sentinel;
      sentinel.addEventListener?.('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      });
    } catch {
      // ignored
    }
  }, []);

  useEffect(() => {
    const hasCoarsePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    const hasTouchPoints = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
    const hasTouchEvent = typeof window !== 'undefined' && 'ontouchstart' in window;
    isTouchLikeRef.current = hasCoarsePointer || hasTouchPoints || hasTouchEvent;
  }, []);

  // Track container height so strip slots are exactly the right size
  useEffect(() => {
    const el = feedContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerH(entries[0].contentRect.height);
    });
    ro.observe(el);
    setContainerH(el.clientHeight || 844);
    return () => ro.disconnect();
  }, []);

  // Keep mute button directly below title row, including expanded "...more" state.
  useLayoutEffect(() => {
    const row = titleRowRef.current;
    if (!row) {
      setMuteBtnTop(null);
      return;
    }

    const updateMuteTop = () => {
      const display = window.getComputedStyle(row).display;
      if (display === 'none') {
        setMuteBtnTop(null);
        return;
      }

      const rect = row.getBoundingClientRect();
      if (rect.height <= 0) {
        setMuteBtnTop(null);
        return;
      }

      const desiredTop = Math.round(rect.bottom + 8);
      const maxTop = Math.max(56, window.innerHeight - 180);
      setMuteBtnTop(Math.min(desiredTop, maxTop));
    };

    updateMuteTop();
    const ro = new ResizeObserver(updateMuteTop);
    ro.observe(row);
    window.addEventListener('resize', updateMuteTop);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateMuteTop);
    };
  }, [titleExpanded, currentVideo?.id, currentVideo?.title]);

  // ── Feed loading ─────────────────────────────────────────────────────────
  const loadFeed = useCallback(async (talentType = '', search = ''): Promise<boolean> => {
    const seq = ++loadFeedSeqRef.current;
    let q = '';
    if (talentType) q += '?talent_type=' + encodeURIComponent(talentType);
    if (search) q += (q ? '&' : '?') + 'search=' + encodeURIComponent(search);
    const data = await apiFetch<PaginatedResponse<Video>>('/videos' + q);
    // A newer loadFeed call won the race; do not trigger startup retries.
    if (seq !== loadFeedSeqRef.current) return true;
    if (!data.success || !data.data) {
      toast('Could not load feed');
      return false;
    }
    const items = data.data.items || [];
    failedVideos.current.clear();
    preloadedVideoId.current = null;
    pendingSwipeRef.current = null;
    setNextVideoReady(false);
    activeSlot.current = 'A';
    slotJustSwapped.current = false;
    const slotA = videoRefA.current;
    if (slotA) { slotA.pause(); slotA.removeAttribute('src'); slotA.load(); }
    const slotB = videoRefB.current;
    if (slotB) { slotB.pause(); slotB.removeAttribute('src'); slotB.load(); }
    setFeedVideos(items);
    setFeedIndex(0);
    if (items.length > 0) {
      const first = items[0];
      setCurrentVideo(first);
      // Prime and play first video immediately on initial app open (even for anonymous visitors).
      requestAnimationFrame(() => {
        if (seq !== loadFeedSeqRef.current) return;
        const active = getActiveRef().current;
        if (!active) return;
        const src = active.currentSrc || active.src || '';
        if (active.dataset.videoId !== first.id || !src.includes(first.file_url)) {
          active.dataset.videoId = first.id;
          active.src = first.file_url;
          active.preload = 'auto';
          active.load();
        }
        safePlay(active);
      });
      return true;
    }
    setCurrentVideo(null);
    return true;
  }, [getActiveRef, safePlay, setFeedVideos, setFeedIndex, setCurrentVideo]);

  useEffect(() => {
    let cancelled = false;

    const boot = async (attempt: number) => {
      const ok = await loadFeed(feedCat, searchTerm);
      if (cancelled || ok) return;
      if (attempt >= 3) return;
      if (startupRetryTimer.current) clearTimeout(startupRetryTimer.current);
      startupRetryTimer.current = setTimeout(() => {
        void boot(attempt + 1);
      }, 900 * (attempt + 1));
    };

    if (!currentVideo || feedVideos.length === 0) {
      void boot(0);
    }

    return () => {
      cancelled = true;
      if (startupRetryTimer.current) clearTimeout(startupRetryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If auth state changes and feed is still empty, retry loading once.
    if (currentVideo || feedVideos.length > 0) return;
    void loadFeed(feedCat, searchTerm);
  }, [loggedIn, currentVideo, feedVideos.length, feedCat, searchTerm, loadFeed]);

  useEffect(() => {
    if (!currentVideo) return;

    if (startupPlayWatchdog.current) {
      clearInterval(startupPlayWatchdog.current);
      startupPlayWatchdog.current = null;
    }

    const ensureFirstVideoPlayback = () => {
      const active = getActiveRef().current;
      if (!active) return;
      const src = active.currentSrc || active.src || '';
      if (active.dataset.videoId !== currentVideo.id || !src.includes(currentVideo.file_url)) {
        active.dataset.videoId = currentVideo.id;
        active.src = currentVideo.file_url;
        active.preload = 'auto';
        active.load();
      }
      if (active.paused) safePlay(active);
    };

    ensureFirstVideoPlayback();
    const t1 = setTimeout(ensureFirstVideoPlayback, 180);
    const t2 = setTimeout(ensureFirstVideoPlayback, 520);
    let tries = 0;
    startupPlayWatchdog.current = setInterval(() => {
      const active = getActiveRef().current;
      if (!active) return;
      if (!active.paused) {
        if (startupPlayWatchdog.current) {
          clearInterval(startupPlayWatchdog.current);
          startupPlayWatchdog.current = null;
        }
        return;
      }
      tries += 1;
      ensureFirstVideoPlayback();
      if (tries >= 12 && startupPlayWatchdog.current) {
        clearInterval(startupPlayWatchdog.current);
        startupPlayWatchdog.current = null;
      }
    }, 300);

    const onPageShow = () => ensureFirstVideoPlayback();
    window.addEventListener('pageshow', onPageShow);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (startupPlayWatchdog.current) {
        clearInterval(startupPlayWatchdog.current);
        startupPlayWatchdog.current = null;
      }
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [currentVideo?.id, currentVideo?.file_url, getActiveRef, safePlay, currentVideo]);

  useEffect(() => {
    return () => {
      if (slideTimer.current)    clearTimeout(slideTimer.current);
      if (preloadWaitTimer.current) clearTimeout(preloadWaitTimer.current);
      if (snapBackTimer.current) clearTimeout(snapBackTimer.current);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      if (playbackIndicatorTimer.current) clearTimeout(playbackIndicatorTimer.current);
      if (startupRetryTimer.current) clearTimeout(startupRetryTimer.current);
      if (startupPlayWatchdog.current) clearInterval(startupPlayWatchdog.current);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (creatorSearchTimer.current) clearTimeout(creatorSearchTimer.current);
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  useEffect(() => {
    const active = getActiveRef().current;
    const shouldHoldScreenAwake = !!currentVideo
      && !autoplayBlocked
      && !!active
      && !active.paused;

    if (shouldHoldScreenAwake) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }
  }, [currentVideo?.id, isPaused, autoplayBlocked, getActiveRef, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        void releaseWakeLock();
        return;
      }
      const active = getActiveRef().current;
      if (currentVideo && active && !active.paused && !autoplayBlocked) {
        void requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [currentVideo?.id, autoplayBlocked, getActiveRef, requestWakeLock, releaseWakeLock]);

  // ── Strip helpers ────────────────────────────────────────────────────────
  const clearStrip = useCallback(() => {
    if (slideTimer.current) clearTimeout(slideTimer.current);
    if (preloadWaitTimer.current) clearTimeout(preloadWaitTimer.current);
    if (snapBackTimer.current) clearTimeout(snapBackTimer.current);
    setStripOffset(0);
    if (stripRef.current) stripRef.current.style.transform = 'translateY(0px)';
    setStripDir(null);
    setStripNext(null);
    setStripSnap(false);
    setSlideDuration(SLIDE_MS);
  }, []);

  // ── Next-playable index ──────────────────────────────────────────────────
  const getNextPlayableIndex = useCallback((): number | null => {
    if (feedVideos.length === 0) return null;
    for (let i = 1; i <= feedVideos.length; i++) {
      const idx = (feedIndex + i) % feedVideos.length;
      if (!failedVideos.current.has(feedVideos[idx].id)) return idx;
    }
    return null;
  }, [feedVideos, feedIndex]);

  // ── Skip on error ────────────────────────────────────────────────────────
  const skipToNextPlayable = useCallback(() => {
    if (feedVideos.length === 0) return;
    preloadedVideoId.current = null;
    pendingSwipeRef.current = null;
    isAnimatingRef.current = false;
    setNextVideoReady(false);
    for (let i = 1; i <= feedVideos.length; i++) {
      const nextIdx = (feedIndex + i) % feedVideos.length;
      const nextVid = feedVideos[nextIdx];
      if (!failedVideos.current.has(nextVid.id)) {
        setFeedIndex(nextIdx);
        setCurrentVideo(nextVid);
        clearStrip();
        setIsAnimating(false);
        return;
      }
    }
    setCurrentVideo(null);
    clearStrip();
    setIsAnimating(false);
  }, [feedVideos, feedIndex, setFeedIndex, setCurrentVideo, clearStrip]);

  // ── Video lifecycle (active slot only) ───────────────────────────────────
  useLayoutEffect(() => {
    if (!currentVideo) {
      setVideoVoted(false);
      setAutoplayBlocked(false);
      return;
    }

    if (slotJustSwapped.current) {
      slotJustSwapped.current = false;
      setVideoVoted(false);
      return;
    }

    let cancelled = false;
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const ensureActivePlayback = () => {
      if (cancelled) return;
      const active = getActiveRef().current;
      if (!active) {
        if (retries < 8) {
          retries += 1;
          retryTimer = setTimeout(ensureActivePlayback, 60);
        }
        return;
      }

      const src = active.currentSrc || active.src || '';
      const hasExpectedSrc = src.includes(currentVideo.file_url);
      const hasExpectedId = active.dataset.videoId === currentVideo.id;
      if (!hasExpectedId || !hasExpectedSrc) {
        active.dataset.videoId = currentVideo.id;
        active.src = currentVideo.file_url;
        active.preload = 'auto';
        active.load();
      }

      safePlay(active);

      if (active.paused && retries < 8) {
        retries += 1;
        retryTimer = setTimeout(ensureActivePlayback, 120);
        return;
      }

      setAutoplayBlocked(active.paused);
      setVideoVoted(false);
    };

    ensureActivePlayback();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [currentVideo, getActiveRef, safePlay]);

  useEffect(() => {
    setAutoplayBlocked(false);
  }, [currentVideo?.id]);

  useEffect(() => {
    if (!currentVideo) return;
    const active = getActiveRef().current;
    if (!active) return;
    const src = active.currentSrc || active.src || '';
    if (!src.includes(currentVideo.file_url)) {
      active.dataset.videoId = currentVideo.id;
      active.src = currentVideo.file_url;
      active.preload = 'auto';
      active.load();
      safePlay(active);
    }
  }, [currentVideo?.id, currentVideo?.file_url, getActiveRef, safePlay]);

  useEffect(() => {
    if (!currentVideo) return;
    // Some browsers need a second play attempt shortly after first paint.
    const t = setTimeout(() => {
      const active = getActiveRef().current;
      if (!active || !active.paused) return;
      safePlay(active);
    }, 260);
    return () => clearTimeout(t);
  }, [currentVideo?.id, getActiveRef, safePlay]);

  useEffect(() => {
    const active = getActiveRef().current;
    if (active) active.muted = feedMuted;
  }, [feedMuted, getActiveRef]);

  useEffect(() => {
    setTitleExpanded(false);
    setMainCommentText('');
    watchMilestonesRef.current = new Set();
    lastWatchPctRef.current = 0;
    watchStartedAtRef.current = Date.now();
    completionSentRef.current = false;
    if (currentVideo?.id) {
      videoErrorCountRef.current[currentVideo.id] = 0;
    }
  }, [currentVideo?.id]);

  // Eagerly preload N+1 into inactive slot.
  useEffect(() => {
    const nextIdx = getNextPlayableIndex();
    if (nextIdx === null || nextIdx === feedIndex) return;
    const nextVid = feedVideos[nextIdx];
    if (!nextVid) return;

    const el = getInactiveRef().current;
    if (!el) return;

    if (preloadedVideoId.current === nextVid.id && el.readyState >= 2) {
      setNextVideoReady(true);
      return;
    }

    preloadedVideoId.current = nextVid.id;
    setNextVideoReady(false);
    el.dataset.videoId = nextVid.id;
    el.poster = nextVid.thumbnail_url || ''; // Assuming thumbnail_url is low-res preview
    el.src = nextVid.file_url;
    el.muted = true;
    el.preload = 'auto';
    el.load();

    const onReady = () => {
      if (el.dataset.videoId !== nextVid.id || preloadedVideoId.current !== nextVid.id) return;
      el.pause();
      el.currentTime = 0;
      setNextVideoReady(true);
    };
    const onError = () => {
      if (el.dataset.videoId !== nextVid.id || preloadedVideoId.current !== nextVid.id) return;
      preloadedVideoId.current = null;
      setNextVideoReady(false);
    };

    el.addEventListener('canplay', onReady, { once: true });
    el.addEventListener('error', onError, { once: true });
    return () => {
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('error', onError);
    };
  }, [feedIndex, feedVideos, getInactiveRef, getNextPlayableIndex]);

  const showReaction = (type: 'like' | 'dislike') => {
    reactionKey.current++;
    setReaction(type);
    setTimeout(() => setReaction(null), 800);
  };

  const hidePlaybackIndicator = useCallback(() => {
    if (playbackIndicatorTimer.current) {
      clearTimeout(playbackIndicatorTimer.current);
      playbackIndicatorTimer.current = null;
    }
    setPlaybackIndicator(null);
  }, []);

  const showPlaybackIndicator = useCallback((type: 'play' | 'pause') => {
    setPlaybackIndicator(type);
    if (playbackIndicatorTimer.current) clearTimeout(playbackIndicatorTimer.current);
    playbackIndicatorTimer.current = setTimeout(() => {
      setPlaybackIndicator(null);
      playbackIndicatorTimer.current = null;
    }, 650);
  }, []);

  const toggleVideoPlayback = useCallback(() => {
    const active = getActiveRef().current;
    if (!active || isAnimating || isAnimatingRef.current) return;
    if (active.paused) {
      hidePlaybackIndicator();
      setIsPaused(false);
      void active.play().then(() => {
        setAutoplayBlocked(false);
      }).catch(() => {
        setIsPaused(true);
        setAutoplayBlocked(true);
      });
      setAutoplayBlocked(false);
    } else {
      active.pause();
      showPlaybackIndicator('pause');
    }
  }, [getActiveRef, hidePlaybackIndicator, isAnimating, showPlaybackIndicator]);

  const handleFallbackPlay = useCallback(() => {
    const active = getActiveRef().current;
    if (!active) return;
    hidePlaybackIndicator();
    setIsPaused(false);
    safePlay(active);
    setTimeout(() => {
      if (!active.paused) setAutoplayBlocked(false);
    }, 180);
  }, [getActiveRef, hidePlaybackIndicator, safePlay]);

  const onVideoError = useCallback(() => {
    if (!currentVideo) return;
    if (isAnimatingRef.current) return;
    if (Date.now() < swipeLockUntilRef.current) return;
    const currentErrCount = (videoErrorCountRef.current[currentVideo.id] || 0) + 1;
    videoErrorCountRef.current[currentVideo.id] = currentErrCount;
    if (currentErrCount <= 1) {
      const active = getActiveRef().current;
      if (active) {
        active.load();
        safePlay(active);
      }
      return;
    }
    failedVideos.current.add(currentVideo.id);
    skipToNextPlayable();
  }, [currentVideo, getActiveRef, safePlay, skipToNextPlayable]);

  const trackVideoSignal = useCallback((eventType: string, payload: Record<string, unknown> = {}) => {
    if (!currentVideo?.id) return;
    void apiFetch('/videos/' + currentVideo.id + '/event', {
      method: 'POST',
      body: JSON.stringify({
        event_type: eventType,
        ...payload,
      }),
    });
  }, [currentVideo?.id]);

  const getPlaybackMetrics = useCallback(() => {
    const el = getActiveRef().current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) {
      return { watchPct: 0, watchSeconds: 0 };
    }
    const watchSeconds = Math.max(0, Number(el.currentTime || 0));
    const watchPct = Math.max(0, Math.min(100, (watchSeconds / Number(el.duration)) * 100));
    return { watchPct, watchSeconds };
  }, [getActiveRef]);

  const onVideoTimeUpdate = useCallback(() => {
    const { watchPct, watchSeconds } = getPlaybackMetrics();
    lastWatchPctRef.current = watchPct;

    const milestones = [25, 50, 75, 90];
    for (const ms of milestones) {
      if (watchPct >= ms && !watchMilestonesRef.current.has(ms)) {
        watchMilestonesRef.current.add(ms);
        trackVideoSignal('watch_progress', {
          event_value: ms,
          watch_seconds: Number(watchSeconds.toFixed(2)),
        });
      }
    }

    if (watchPct >= 99 && !completionSentRef.current) {
      completionSentRef.current = true;
      trackVideoSignal('completion', {
        event_value: 100,
        watch_seconds: Number(watchSeconds.toFixed(2)),
      });
    }
  }, [getPlaybackMetrics, trackVideoSignal]);

  const onVideoEnded = useCallback(() => {
    if (completionSentRef.current) return;
    const { watchSeconds } = getPlaybackMetrics();
    completionSentRef.current = true;
    trackVideoSignal('completion', {
      event_value: 100,
      watch_seconds: Number(watchSeconds.toFixed(2)),
    });
  }, [getPlaybackMetrics, trackVideoSignal]);

  // ── Drag (finger follows strip) ──────────────────────────────────────────
  const onDragMove = useCallback((dy: number) => {
    if (isAnimatingRef.current || isAnimating || !currentVideo) return;
    const nextIdx = getNextPlayableIndex();
    if (nextIdx === null || nextIdx === feedIndex) return;
    const nextVideo = feedVideos[nextIdx];

    const max = Math.floor(containerH * 0.75);
    const clamped = Math.max(-max, Math.min(max, dy));

    setStripSnap(false);
    setStripOffset(clamped);
    if (stripRef.current && !stripSnap) {
      stripRef.current.style.transform = `translateY(${clamped}px) translate3d(0,0,0)`;
    }

    if (clamped < 0) {
      setStripDir('up');
      setStripNext(nextVideo);
    } else if (clamped > 0) {
      setStripDir('down');
      setStripNext(nextVideo);
    } else {
      setStripDir(null);
      setStripNext(null);
    }
  }, [currentVideo, isAnimating, getNextPlayableIndex, feedIndex, feedVideos, containerH]);

  // ── Snap back when gesture didn't cross threshold ────────────────────────
  const onGestureEnd = useCallback((didSwipe: boolean) => {
    if (isAnimatingRef.current || isAnimating) return;
    if (didSwipe) {
      setStripSnap(false); // goNext will drive the rest
      return;
    }
    if (!stripNext && stripOffset === 0) return;
    // Animate strip back to resting position
    setSlideDuration(220); // Fixed for snap-back
    setStripSnap(true);
    setStripOffset(0);
    if (stripRef.current) {
      stripRef.current.style.transform = 'translateY(0px) translate3d(0,0,0)';
    }
    if (snapBackTimer.current) clearTimeout(snapBackTimer.current);
    snapBackTimer.current = setTimeout(() => {
      setStripDir(null);
      setStripNext(null);
      setStripSnap(false);
      setSlideDuration(SLIDE_MS);
    }, 220);
  }, [isAnimating, stripNext, stripOffset]);

  const primeInactive = useCallback((video: Video) => {
    const el = getInactiveRef().current;
    if (!el) return;
    if (preloadedVideoId.current === video.id && el.readyState >= 2) {
      setNextVideoReady(true);
      return;
    }

    preloadedVideoId.current = video.id;
    setNextVideoReady(false);
    el.dataset.videoId = video.id;
    el.poster = video.thumbnail_url || '';
    el.src = video.file_url;
    el.muted = true;
    el.preload = 'auto';
    el.load();
  }, [getInactiveRef]);

  const finalizeSwipe = useCallback((txn?: number) => {
    const pending = pendingSwipeRef.current;
    if (!pending) return;
    if (txn !== undefined && pending.txn !== txn) return;
    const { nextIdx, nextVideo, txn: pendingTxn } = pending;
    const inactive = getInactiveRef().current;
    if (!inactive) return;

    const commit = () => {
      const activePending = pendingSwipeRef.current;
      if (!activePending || activePending.txn !== pendingTxn) return;
      pendingSwipeRef.current = null;
      if (slideTimer.current) clearTimeout(slideTimer.current);
      if (preloadWaitTimer.current) clearTimeout(preloadWaitTimer.current);
      const previousActive = getActiveRef().current;
      activeSlot.current = activeSlot.current === 'A' ? 'B' : 'A';
      previousActive?.pause();
      slotJustSwapped.current = true;

      const nowActive = getActiveRef().current;
      if (nowActive) {
        nowActive.loop = true;
        nowActive.currentTime = 0;
        safePlay(nowActive);
      }

      setFeedIndex(nextIdx);
      setCurrentVideo(nextVideo);
      setStripOffset(0);
      if (stripRef.current) stripRef.current.style.transform = 'translateY(0px) translate3d(0,0,0)';
      setStripDir(null);
      setStripNext(null);
      setStripSnap(false);
      isAnimatingRef.current = false;
      swipeLockUntilRef.current = Date.now() + SWIPE_COOLDOWN_MS;
      setIsAnimating(false);
      setNextVideoReady(false);
      setSlideDuration(SLIDE_MS); // Reset duration
    };

    if (preloadedVideoId.current === nextVideo.id && inactive.readyState >= 2) {
      commit();
      return;
    }

    const onReady = () => {
      if (inactive.dataset.videoId !== nextVideo.id || preloadedVideoId.current !== nextVideo.id) return;
      inactive.pause();
      inactive.currentTime = 0;
      setNextVideoReady(true);
      commit();
    };
    const onError = () => {
      if (preloadWaitTimer.current) { clearTimeout(preloadWaitTimer.current); preloadWaitTimer.current = null; }
      const activePending = pendingSwipeRef.current;
      if (!activePending || activePending.txn !== pendingTxn) return;
      pendingSwipeRef.current = null;
      clearStrip();
      isAnimatingRef.current = false;
      swipeLockUntilRef.current = Date.now() + SWIPE_COOLDOWN_MS;
      setIsAnimating(false);
      setNextVideoReady(false);
      failedVideos.current.add(nextVideo.id);
      const active = getActiveRef().current;
      if (active && active.paused) safePlay(active);
    };
    inactive.addEventListener('canplay', onReady, { once: true });
    inactive.addEventListener('error', onError, { once: true });

    // Safety timeout — force commit if video never finishes loading
    if (preloadWaitTimer.current) clearTimeout(preloadWaitTimer.current);
    preloadWaitTimer.current = setTimeout(() => {
      inactive.removeEventListener('canplay', onReady);
      inactive.removeEventListener('error', onError);
      const ap = pendingSwipeRef.current;
      if (!ap || ap.txn !== pendingTxn) return;
      commit();
    }, 3000);
  }, [clearStrip, getActiveRef, getInactiveRef, safePlay, setFeedIndex, setCurrentVideo]);

  // ── Commit swipe ─────────────────────────────────────────────────────────
  const goNext = useCallback((type: 'like' | 'dislike') => {
    if (!currentVideo || isAnimating || isAnimatingRef.current) return;
    if (Date.now() < swipeLockUntilRef.current) return;
    if (pendingSwipeRef.current) return;
    const nextIdx = getNextPlayableIndex();
    if (nextIdx === null || nextIdx === feedIndex) return;
    const nextVideo = feedVideos[nextIdx];

    const { watchPct, watchSeconds } = getPlaybackMetrics();
    if (watchPct < 98) {
      const quick = watchSeconds <= 2 || watchPct <= 10;
      trackVideoSignal(quick ? 'quick_skip' : 'skip', {
        event_value: Number(watchPct.toFixed(2)),
        watch_seconds: Number(watchSeconds.toFixed(2)),
      });
    }

    const h = containerH;
    const dir = type === 'like' ? 'up' : 'down';
    const target = dir === 'up' ? -h : h;
    const txn = ++swipeTxnRef.current;

    // Calculate velocity-based duration
    const velocity = Math.abs(lastTouchRef.current.velocity);
    const dur = Math.max(120, SLIDE_MS - velocity * VELOCITY_SCALE);
    setSlideDuration(dur);

    isAnimatingRef.current = true;
    swipeLockUntilRef.current = Date.now() + dur + SWIPE_COOLDOWN_MS;
    setIsAnimating(true);
    setVideoVoted(true);
    if (snapBackTimer.current) clearTimeout(snapBackTimer.current);

    if (!loggedIn) {
      showReaction(type);
    } else {
      apiFetch('/videos/' + currentVideo.id + '/' + type, { method: 'POST' }).then((res) => {
        if (res.error === 'already_voted') {
          toast('Already voted on this video');
        } else if ((res.data as { removed?: boolean })?.removed) {
          showReaction(type);
          toast('Video removed - too many dislikes');
          const filtered = feedVideos.filter((v) => v.id !== currentVideo.id);
          setFeedVideos(filtered);
        } else {
          showReaction(type);
          toast(type === 'like' ? 'Liked!' : 'Disliked');
        }
      });
    }

    pendingSwipeRef.current = {
      txn,
      nextIdx,
      nextVideo,
      direction: dir,
      animationStarted: false,
    };

    const startTransition = () => {
      const pending = pendingSwipeRef.current;
      if (!pending || pending.txn !== txn || pending.animationStarted) return;
      pendingSwipeRef.current = { ...pending, animationStarted: true };
      if (preloadWaitTimer.current) {
        clearTimeout(preloadWaitTimer.current);
        preloadWaitTimer.current = null;
      }

      if (stripNext && stripDir === dir) {
        setStripSnap(true);
        setStripOffset(target);
        if (stripRef.current) {
          stripRef.current.style.transform = `translateY(${target}px) translate3d(0,0,0)`;
        }
      } else {
        setStripDir(dir);
        setStripNext(nextVideo);
        setStripOffset(0);
        requestAnimationFrame(() => {
          const activePending = pendingSwipeRef.current;
          if (!activePending || activePending.txn !== txn) return;
          setStripSnap(true);
          setStripOffset(target);
          if (stripRef.current) {
            stripRef.current.style.transform = `translateY(${target}px) translate3d(0,0,0)`;
          }
        });
      }

      if (slideTimer.current) clearTimeout(slideTimer.current);
      slideTimer.current = setTimeout(() => {
        finalizeSwipe(txn);
      }, dur + 140);
    };

    const inactive = getInactiveRef().current;
    const readyNow = !!inactive
      && preloadedVideoId.current === nextVideo.id
      && inactive.dataset.videoId === nextVideo.id
      && inactive.readyState >= 2;

    if (readyNow) {
      setNextVideoReady(true);
    } else if (!inactive || preloadedVideoId.current !== nextVideo.id || inactive.readyState < 2) {
      primeInactive(nextVideo);
    }

    // Always animate immediately — finalizeSwipe handles the load-wait
    startTransition();
  }, [
    containerH, currentVideo, feedIndex, feedVideos, finalizeSwipe, getInactiveRef,
    getNextPlayableIndex, getPlaybackMetrics, isAnimating, loggedIn,
    primeInactive, setFeedVideos, clearStrip, getActiveRef, safePlay, stripDir, stripNext, trackVideoSignal,
  ]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isTouchLikeRef.current) return;
    if (isAnimating || isAnimatingRef.current) return;
    if (Date.now() < swipeLockUntilRef.current) return;
    if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;
    if (wheelTimer.current) return;
    wheelTimer.current = setTimeout(() => { wheelTimer.current = null; }, WHEEL_DEBOUNCE_MS);
    if (e.deltaY > 0) goNext('like');
    else goNext('dislike');
  }, [goNext, isAnimating]);

  const { onTouchStart: origTouchStart, onTouchMove: origTouchMove, onTouchEnd: origTouchEnd } = useSwipe(
    () => goNext('like'),
    () => goNext('dislike'),
    isAnimating,
    onDragMove,
    onGestureEnd,
  );

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchRef.current = { y: e.touches[0].clientY, time: Date.now(), velocity: 0 };
    origTouchStart(e);
  }, [origTouchStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const { y: lastY, time: lastTime } = lastTouchRef.current;
    const y = e.touches[0].clientY;
    const time = Date.now();
    const dy = y - lastY;
    const dt = time - lastTime;
    if (dt > 0) lastTouchRef.current.velocity = dy / dt;
    lastTouchRef.current.y = y;
    lastTouchRef.current.time = time;
    origTouchMove(e);
  }, [origTouchMove]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    origTouchEnd(e);
  }, [origTouchEnd]);

  // Record view
  const currentVideoId = currentVideo?.id;
  useEffect(() => {
    if (currentVideoId) {
      apiFetch('/videos/' + currentVideoId + '/view', { method: 'POST' }).catch(() => {});
    }
  }, [currentVideoId]);

  // ── UI helpers ───────────────────────────────────────────────────────────
  const pickCat = (c: string) => {
    setCatOpen(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (creatorSearchTimer.current) clearTimeout(creatorSearchTimer.current);
    setCreatorResults([]);
    setCreatorSearchOpen(false);
    setFeedCreatorContext(null);
    setFeedSavedContext(false);
    setFeedCat(c);
    setSearchTerm('');
    loadFeed(c, '');
  };

  const doSearch = () => {
    setFeedCreatorContext(null);
    setFeedSavedContext(false);
    loadFeed(feedCat, searchTerm);
  };

  const openBrowseCreatorPicker = useCallback(() => {
    setCatOpen(false);
    setBrowseCreatorCategories(feedCat ? [feedCat] : []);
    setBrowseCreatorPickerOpen(true);
  }, [feedCat]);

  const toggleBrowseCreatorCategory = useCallback((category: string) => {
    setBrowseCreatorCategories((prev) => (
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    ));
  }, []);

  const toggleBrowseCreatorAll = useCallback(() => {
    setBrowseCreatorCategories((prev) => (
      prev.length === TALENT_TYPES.length ? [] : [...TALENT_TYPES]
    ));
  }, []);

  const browseSelectedCreators = useCallback(() => {
    setBrowseCreatorPickerOpen(false);
    onNav('talent', { categories: browseCreatorCategories });
  }, [browseCreatorCategories, onNav]);

  const resetToAllVideos = useCallback(() => {
    setCatOpen(false);
    setCreatorSearchOpen(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (creatorSearchTimer.current) clearTimeout(creatorSearchTimer.current);
    setCreatorResults([]);
    setFeedCreatorContext(null);
    setFeedSavedContext(false);
    setFeedCat('');
    setSearchTerm('');
    loadFeed('', '');
  }, [loadFeed, setFeedCat, setFeedCreatorContext, setFeedSavedContext]);

  const loadCreatorResults = useCallback(async (term: string) => {
    const needle = term.trim();
    if (!needle) {
      setCreatorResults([]);
      setCreatorSearchOpen(false);
      return;
    }
    const data = await apiFetch<PaginatedResponse<UserWithStats>>(
      '/users?search=' + encodeURIComponent(needle) + '&limit=8'
    );
    if (!data.success || !data.data) {
      setCreatorResults([]);
      setCreatorSearchOpen(false);
      return;
    }
    const items = data.data.items || [];
    setCreatorResults(items);
    setCreatorSearchOpen(items.length > 0);
  }, []);

  const openCreatorFromSearch = useCallback((u: UserWithStats) => {
    setCreatorSearchOpen(false);
    onNav('creator', {
      userId: u.id,
      username: u.username,
      fullName: u.full_name || u.username,
      avatarUrl: u.avatar_url,
      isFollowing: !!u.is_followed,
    });
  }, [onNav]);

  const onSearchInput = (val: string) => {
    setSearchTerm(val);
    if (feedCreatorContext || feedSavedContext) {
      setFeedCreatorContext(null);
      setFeedSavedContext(false);
    }
    const needle = val.trim();

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadFeed(feedCat, val), 400);

    if (creatorSearchTimer.current) clearTimeout(creatorSearchTimer.current);
    if (!needle) {
      setCreatorResults([]);
      setCreatorSearchOpen(false);
      return;
    }
    creatorSearchTimer.current = setTimeout(() => {
      void loadCreatorResults(needle);
    }, 250);
  };

  const titleText = currentVideo?.title || 'No videos yet - upload one!';
  const hasLongTitle = titleText.length > TITLE_PREVIEW_CHARS;
  const shownTitle = titleExpanded || !hasLongTitle
    ? titleText
    : titleText.slice(0, TITLE_PREVIEW_CHARS);
  const activeSearch = searchTerm.trim();
  const hasScopedFeed = !!feedCreatorContext || feedSavedContext || !!feedCat || !!activeSearch;
  const creatorHandle = (currentVideo?.username || feedCreatorContext?.creatorName || 'creator').replace(/^@/, '');
  const creatorHandleShort = creatorHandle.length > CREATOR_HANDLE_MAX
    ? `${creatorHandle.slice(0, CREATOR_HANDLE_TRUNCATED)}...`
    : creatorHandle;
  const scopedFeedText = feedCreatorContext
    ? `@${creatorHandleShort}`
    : feedSavedContext
      ? 'Saved videos'
      : feedCat && activeSearch
        ? `${feedCat} • "${activeSearch}"`
        : feedCat
          ? `${feedCat}`
          : `Search "${activeSearch}"`;
  const canQuickReset = hasScopedFeed && !activeSearch;
  const browseAllSelected = browseCreatorCategories.length === TALENT_TYPES.length;

  const openCreator = () => {
    if (!currentVideo) return;
    onNav('creator', {
      userId: currentVideo.user_id,
      username: currentVideo.username,
      fullName: currentVideo.full_name,
      avatarUrl: currentVideo.avatar_url,
      isFollowing: currentVideo.is_following_author,
    });
  };

  const toggleComments = () => setCmtsOpen(!cmtsOpen);

  const submitMainComment = useCallback(async () => {
    const body = mainCommentText.trim();

    if (!body) {
      setCmtsOpen(true);
      return;
    }

    if (!loggedIn) {
      toast('Sign in to comment');
      onNav('login');
      return;
    }

    if (!currentVideo?.id) {
      toast('No video selected');
      return;
    }

    const data = await apiFetch('/videos/' + currentVideo.id + '/comments', {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    if (!data.success) {
      toast('Error: ' + data.error);
      return;
    }

    setMainCommentText('');
    setCmtsOpen(true);
  }, [mainCommentText, loggedIn, currentVideo, onNav, setCmtsOpen]);

  // ── Strip styles ─────────────────────────────────────────────────────────
  const stripStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'visible',
    zIndex: 1,
    background: '#000',
    transform: `translateY(${stripOffset}px) translate3d(0,0,0)`,
    transition: stripSnap ? `transform ${slideDuration}ms ${SLIDE_EASE}` : 'none',
    willChange: 'transform',
    backfaceVisibility: 'hidden',
  };

  const videoStyle = (slot: 'A' | 'B'): React.CSSProperties => {
    const isActive = activeSlot.current === slot;
    if (isActive) {
      return {
        width: '100%', height: containerH, objectFit: 'cover',
        position: 'absolute', left: 0, right: 0, top: 0,
        zIndex: 2, visibility: 'visible', background: '#000',
        willChange: 'transform, opacity',
        transform: 'translate3d(0,0,0)',
        backfaceVisibility: 'hidden',
      };
    }

    const showInPeek = stripDir !== null && stripNext !== null;
    return {
      width: '100%', height: containerH, objectFit: 'cover',
      position: 'absolute', left: 0, right: 0,
      top: showInPeek ? (stripDir === 'up' ? containerH : -containerH) : 0,
      zIndex: showInPeek ? 1 : 0,
      visibility: showInPeek ? 'visible' : 'hidden',
      background: '#000',
      willChange: 'transform, opacity',
      transform: 'translate3d(0,0,0)',
      backfaceVisibility: 'hidden',
    };
  };

  const handleSwipeTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== 'transform' || !stripSnap || !isAnimating) return;
    if (slideTimer.current) clearTimeout(slideTimer.current);
    finalizeSwipe();
  }, [finalizeSwipe, isAnimating, stripSnap]);

  const isActiveEl = (e: React.SyntheticEvent<HTMLVideoElement>) =>
    e.currentTarget === getActiveRef().current;

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="topbar" onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.catdd') && !target.closest('.cat-btn'))
          setCatOpen(false);
        if (!target.closest('.creator-search-dd') && !target.closest('.search-pill'))
          setCreatorSearchOpen(false);
      }}>
        <div className="search-pill">
          <button className="cat-btn" onClick={() => setCatOpen(!catOpen)}>
            <img className="cat-icon" src={MENU_ICON} alt="Menu"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (fb) fb.style.display = 'inline';
              }}
            />
            <span className="cat-fallback" style={{ display: 'none' }} aria-hidden>&#9776;</span>
          </button>
          <input
            type="text"
            placeholder={hasScopedFeed ? scopedFeedText : 'Search...'}
            value={searchTerm}
            onChange={(e) => onSearchInput(e.target.value)}
            onFocus={() => {
              if (searchTerm.trim() && creatorResults.length > 0) setCreatorSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                doSearch();
                setCreatorSearchOpen(false);
              }
            }}
          />
          <span
            key={canQuickReset ? 'reset' : 'search'}
            className="si"
            onClick={canQuickReset ? resetToAllVideos : doSearch}
            style={{ cursor: 'pointer' }}
            aria-label={canQuickReset ? 'Back to all videos' : 'Search'}
            title={canQuickReset ? 'Back to all videos' : 'Search'}
          >
            {canQuickReset ? (
              <span className="si-reset">All Videos</span>
            ) : (
              <>
                <img className="si-icon" src={SEARCH_ICON} alt="Search"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (fb) fb.style.display = 'inline';
                  }}
                />
                <span className="si-fallback" style={{ display: 'none' }} aria-hidden>&#128269;</span>
              </>
            )}
          </span>
        </div>
        {creatorSearchOpen && (
          <div className="creator-search-dd">
            {creatorResults.map((u) => (
              <button
                key={u.id}
                type="button"
                className="creator-search-item"
                onClick={() => openCreatorFromSearch(u)}
              >
                <div className="creator-search-avatar">
                  <img
                    src={u.avatar_url || DEFAULT_AVATAR}
                    alt=""
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR; }}
                  />
                </div>
                <div className="creator-search-meta">
                  <div className="creator-search-name">{u.full_name || u.username}</div>
                  <div className="creator-search-username">@{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <button className="hbg" onClick={() => setDrawerOpen(true)}>
          <span /><span /><span />
        </button>
        {catOpen && (
          <div className="catdd open">
            <div className="co" onClick={openBrowseCreatorPicker}
              style={{ color: '#888', fontSize: 12 }}>Browse Creators</div>
            <div style={{ borderTop: '1px solid #2a2a2a', margin: '4px 0' }} />
            <div className="co" onClick={() => pickCat('')} style={{ color: 'var(--acc)', fontWeight: 700 }}>All Videos</div>
            {TALENT_TYPES.map((t) => (
              <div className={`co ${feedCat === t ? 'sel' : ''}`} key={t} onClick={() => pickCat(t)}>{t}</div>
            ))}
          </div>
        )}
      </div>

      {browseCreatorPickerOpen && (
        <div className="browse-creators-overlay" onClick={() => setBrowseCreatorPickerOpen(false)}>
          <div className="browse-creators-modal" onClick={(e) => e.stopPropagation()}>
            <div className="browse-creators-head">
              <div className="browse-creators-title">Browse Creators</div>
              <button
                type="button"
                className="browse-creators-close"
                onClick={() => setBrowseCreatorPickerOpen(false)}
                aria-label="Close creators picker"
              >
                ×
              </button>
            </div>
            <button type="button" className="browse-creators-all" onClick={toggleBrowseCreatorAll}>
              {browseAllSelected ? 'Clear All Categories' : 'Select All Categories'}
            </button>
            <div className="browse-creators-list">
              {TALENT_TYPES.map((category) => (
                <label className="browse-creators-option" key={category}>
                  <input
                    type="checkbox"
                    checked={browseCreatorCategories.includes(category)}
                    onChange={() => toggleBrowseCreatorCategory(category)}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>
            <div className="browse-creators-actions">
              <button
                type="button"
                className="browse-creators-cancel"
                onClick={() => setBrowseCreatorPickerOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="browse-creators-go" onClick={browseSelectedCreators}>
                Browse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Title row ───────────────────────────────────────────── */}
      <div className="vtrow" ref={titleRowRef}>
        <div className={`vtitle ${titleExpanded ? 'open' : ''}`}>
          <span className="vtxt">{shownTitle}</span>
          {hasLongTitle && (
            <button
              type="button"
              className="more"
              onClick={() => setTitleExpanded((v) => !v)}
            >
              {titleExpanded ? ' less' : '...more'}
            </button>
          )}
        </div>
        <div className="vtrow-user" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div className="uav-sm" onClick={openCreator} style={{ cursor: 'pointer' }}>
            <img src={currentVideo?.avatar_url || DEFAULT_AVATAR}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
              alt="" />
          </div>
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 600, maxWidth: 54, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{currentVideo?.username || 'user'}
          </span>
        </div>
      </div>

      {/* ── Feed container ──────────────────────────────────────── */}
      <div
        className={`feed-container ${cmtsOpen ? 'cmts-open' : ''}`}
        ref={feedContainerRef}
        style={{ contain: 'strict', overscrollBehavior: 'none', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={onWheel}
      >
        <ReactionOverlay type={reaction} key={reactionKey.current} />

        {currentVideo ? (
          <>
            {/*
              VIDEO BAND — one strip containing:
                • above slot  (top: -h)  — next video when swiping DOWN
                • current slot (top:  0)  — always-playing video
                • below slot  (top: +h)  — next video when swiping UP
              The strip translates as one unit, clipped by feed-container overflow:hidden.
              Two video elements swap active/inactive roles to avoid src-swap flicker.
            */}
            <div
              ref={stripRef}
              style={stripStyle}
              onTransitionEnd={handleSwipeTransitionEnd}
            >
              <video
                ref={videoRefA}
                style={videoStyle('A')}
                loop
                playsInline
                muted
                autoPlay
                onCanPlay={(e) => {
                  if (!isActiveEl(e)) return;
                  const el = e.currentTarget;
                  if (!currentVideo || el.dataset.videoId !== currentVideo.id) return;
                  if (el.paused) safePlay(el);
                }}
                onLoadedData={(e) => {
                  if (!isActiveEl(e)) return;
                  const el = e.currentTarget;
                  if (!currentVideo || el.dataset.videoId !== currentVideo.id) return;
                  if (el.paused) safePlay(el);
                }}
                onLoadedMetadata={(e) => {
                  if (!isActiveEl(e)) return;
                  const el = e.currentTarget;
                  if (!currentVideo || el.dataset.videoId !== currentVideo.id) return;
                  if (el.paused) safePlay(el);
                }}
                onPlay={(e) => {
                  if (!isActiveEl(e)) return;
                  hidePlaybackIndicator();
                  setIsPaused(false);
                  setAutoplayBlocked(false);
                }}
                onPause={(e) => { if (isActiveEl(e)) setIsPaused(true); }}
                onTimeUpdate={(e) => { if (isActiveEl(e)) onVideoTimeUpdate(); }}
                onEnded={(e) => { if (isActiveEl(e)) onVideoEnded(); }}
                onError={(e) => { if (isActiveEl(e)) onVideoError(); }}
                onClick={(e) => { if (isActiveEl(e)) toggleVideoPlayback(); }}
              />
              <video
                ref={videoRefB}
                style={videoStyle('B')}
                loop
                playsInline
                muted
                autoPlay
                onCanPlay={(e) => {
                  if (!isActiveEl(e)) return;
                  const el = e.currentTarget;
                  if (!currentVideo || el.dataset.videoId !== currentVideo.id) return;
                  if (el.paused) safePlay(el);
                }}
                onLoadedData={(e) => {
                  if (!isActiveEl(e)) return;
                  const el = e.currentTarget;
                  if (!currentVideo || el.dataset.videoId !== currentVideo.id) return;
                  if (el.paused) safePlay(el);
                }}
                onLoadedMetadata={(e) => {
                  if (!isActiveEl(e)) return;
                  const el = e.currentTarget;
                  if (!currentVideo || el.dataset.videoId !== currentVideo.id) return;
                  if (el.paused) safePlay(el);
                }}
                onPlay={(e) => {
                  if (!isActiveEl(e)) return;
                  hidePlaybackIndicator();
                  setIsPaused(false);
                  setAutoplayBlocked(false);
                }}
                onPause={(e) => { if (isActiveEl(e)) setIsPaused(true); }}
                onTimeUpdate={(e) => { if (isActiveEl(e)) onVideoTimeUpdate(); }}
                onEnded={(e) => { if (isActiveEl(e)) onVideoEnded(); }}
                onError={(e) => { if (isActiveEl(e)) onVideoError(); }}
                onClick={(e) => { if (isActiveEl(e)) toggleVideoPlayback(); }}
              />
            </div>
            {autoplayBlocked && !isAnimating && (
              <div className="autoplay-fallback">
                <button
                  type="button"
                  className="autoplay-fallback-btn"
                  onClick={handleFallbackPlay}
                >
                  Tap to play
                </button>
              </div>
            )}
            <div className={`playback-indicator ${(isPaused || playbackIndicator) ? 'show' : ''}`} aria-hidden>
              {(() => {
                const isPauseState = !isPaused && playbackIndicator === 'pause';
                const iconSrc = isPauseState ? PAUSE_OVERLAY_ICON : PLAY_OVERLAY_ICON;
                const fallback = isPauseState ? '❚❚' : '▶';
                return (
                  <>
                    <img
                      key={iconSrc}
                      className="playback-indicator-icon"
                      src={iconSrc}
                      alt=""
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fb) fb.style.display = 'inline';
                      }}
                    />
                    <span className="playback-indicator-fallback" style={{ display: 'none' }}>
                      {fallback}
                    </span>
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          <div className="vbg">
            <div className="play-c">&#9654;</div>
          </div>
        )}

        {/* Mute button */}
        <div className="mute-btn" onClick={toggleMute} style={muteBtnTop !== null ? { top: `${muteBtnTop}px` } : undefined}>
          {feedMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
        </div>

        {/* Report button stays inside feed container */}
        {!cmtsOpen && (
          <ActionBar
            onLike={() => goNext('like')}
            onDislike={() => goNext('dislike')}
            onOpenComments={toggleComments}
            onNav={onNav}
            videoVoted={videoVoted}
            showActions={false}
            showReport
          />
        )}

      </div>

      {/* Action bar */}
      {!cmtsOpen && (
        <ActionBar
          onLike={() => goNext('like')}
          onDislike={() => goNext('dislike')}
          onOpenComments={toggleComments}
          onNav={onNav}
          videoVoted={videoVoted}
          showActions
          showReport={false}
        />
      )}

      {/* Comment bar */}
      <div className={`cib ${cmtsOpen ? 'hidden' : ''}`}>
        <input
          type="text"
          placeholder="Comment here..."
          value={mainCommentText}
          onChange={(e) => setMainCommentText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submitMainComment();
            }
          }}
        />
        <button onClick={() => { void submitMainComment(); }}>
          <img className="cib-icon" src={COMMENT_ICON} alt="Comments"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (fb) fb.style.display = 'inline';
            }}
          />
          <span className="cib-icon-fallback" style={{ display: 'none' }} aria-hidden>&#128172;</span>
        </button>
      </div>

      {/* Comments drawer */}
      <Comments
        videoId={currentVideo?.id || null}
        open={cmtsOpen}
        onClose={toggleComments}
      />
    </>
  );
}
</DOCUMENT>
