import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import AppPressable from '../components/AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import { BlurView } from 'expo-blur';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors } from '../theme/colors';
import { TALENT_TYPES, type Comment, type PaginatedResponse, type Video } from '../types';
import { apiFetch, getVideoThumbnailUrl } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { storage } from '../services/storage';
import SideDrawer from '../components/SideDrawer';

const FEED_PAGE_SIZE = 50;
const FEED_MAX_PAGES = 20;
const REACTION_OVERLAY_SHOW_MS = 850;
const FEED_SEEN_STORAGE_PREFIX = 'ts_feed_seen_v1';
const TITLE_PREVIEW_CHARS = 35;
const INPUT_PLACEHOLDER_COLOR = 'rgba(255,255,255,0.72)';
const WEB_ICON_SOURCES = {
  account: require('../../assets/icons/account.png'),
  search: require('../../assets/icons/search.png'),
  menu: require('../../assets/icons/menu.png'),
  swipeUp: require('../../assets/icons/swipe-up.png'),
  swipeDown: require('../../assets/icons/swipe-down.png'),
  follow: require('../../assets/icons/follow.png'),
  followActive: require('../../assets/icons/follow-active.png'),
  save: require('../../assets/icons/save.png'),
  saveActive: require('../../assets/icons/save-active.png'),
  share: require('../../assets/icons/share.png'),
  report: require('../../assets/icons/report.png'),
  comment: require('../../assets/icons/comment.png'),
};

interface ReactionOverlayState {
  id: number;
  text: string;
  iconName: keyof typeof Ionicons.glyphMap;
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const isScreenFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();

  const feedVideos = useAppStore((state) => state.feedVideos);
  const feedIndex = useAppStore((state) => state.feedIndex);
  const currentVideo = useAppStore((state) => state.currentVideo);
  const feedMuted = useAppStore((state) => state.feedMuted);
  const feedCategory = useAppStore((state) => state.feedCategory);
  const feedSearchText = useAppStore((state) => state.feedSearchText);
  const loggedIn = useAppStore((state) => state.loggedIn);
  const user = useAppStore((state) => state.user);
  const feedCreatorContext = useAppStore((state) => state.feedCreatorContext);
  const feedSavedContext = useAppStore((state) => state.feedSavedContext);
  const commentsOpen = useAppStore((state) => state.commentsOpen);
  const setFeedVideos = useAppStore((state) => state.setFeedVideos);
  const setFeedIndex = useAppStore((state) => state.setFeedIndex);
  const setCurrentVideo = useAppStore((state) => state.setCurrentVideo);
  const setFeedCategory = useAppStore((state) => state.setFeedCategory);
  const setFeedSearchText = useAppStore((state) => state.setFeedSearchText);
  const setFeedCreatorContext = useAppStore((state) => state.setFeedCreatorContext);
  const setFeedSavedContext = useAppStore((state) => state.setFeedSavedContext);
  const toggleFeedMute = useAppStore((state) => state.toggleFeedMute);
  const setCommentsOpen = useAppStore((state) => state.setCommentsOpen);
  const setDrawerOpen = useAppStore((state) => state.setDrawerOpen);

  const feedListReference = useRef<FlatList<Video>>(null);
  const reactionOverlayTimerReference = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentBarSendTimerReference = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousViewRecordedVideoIdReference = useRef<string>('');
  const previousCommentsOpenReference = useRef(commentsOpen);
  const seenScopeKeyReference = useRef('');
  const seenVideoIdsReference = useRef<Set<string>>(new Set());
  const loadFeedSequenceReference = useRef(0);
  const arrowNavigationLockReference = useRef(0);

  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [feedErrorText, setFeedErrorText] = useState('');
  const [closedFeedViewportHeight, setClosedFeedViewportHeight] = useState(Math.max(420, Math.round(screenHeight)));
  const [commentItems, setCommentItems] = useState<Comment[]>([]);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [mainCommentText, setMainCommentText] = useState('');
  const [replyToComment, setReplyToComment] = useState<Comment | null>(null);
  const [likeLoadingMap, setLikeLoadingMap] = useState<Record<string, boolean>>({});
  const [deleteLoadingMap, setDeleteLoadingMap] = useState<Record<string, boolean>>({});
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reactionOverlayState, setReactionOverlayState] = useState<ReactionOverlayState | null>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [browseCategoriesOpen, setBrowseCategoriesOpen] = useState(false);
  const [browseCategorySelections, setBrowseCategorySelections] = useState<string[]>([]);
  const [multiCategoryFilter, setMultiCategoryFilter] = useState<string[]>([]);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [feedContainMode, setFeedContainMode] = useState(false);
  const [feedPaused, setFeedPaused] = useState(false);

  const activeVideo = feedVideos[feedIndex] || currentVideo || null;
  const activeVideoAvatarUrl = activeVideo
    ? (String(activeVideo.user_id) === String(user?.id)
      ? (user?.avatar_url || activeVideo.avatar_url || null)
      : (activeVideo.avatar_url || null))
    : null;
  const commentBarBottom = 10;
  const topHeaderOffset = insets.top + 8;
  const titleRowOffset = insets.top + 75;
  const actionBottomOffset = 75;
  const muteTopOffset = 240;
  const categoryMenuTopOffset = insets.top + 48;
  const commentsVideoPeekHeight = Math.round(closedFeedViewportHeight * 0.35);
  const commentsSheetHeight = Math.max(220, closedFeedViewportHeight - commentsVideoPeekHeight);
  const feedViewportHeight = commentsOpen ? commentsVideoPeekHeight : closedFeedViewportHeight;
  const hasScopedFeed = !!(
    feedCategory
    || multiCategoryFilter.length
    || feedCreatorContext?.userId
    || feedSavedContext
    || feedSearchText.trim()
  );

  const scopedFeedText = useMemo(() => {
    if (feedSavedContext) return 'Saved videos';
    if (feedCreatorContext?.creatorName) return feedCreatorContext.creatorName;
    if (multiCategoryFilter.length > 1) return `${multiCategoryFilter.length} categories`;
    if (multiCategoryFilter.length === 1) return multiCategoryFilter[0];
    if (feedCategory) return feedCategory;
    if (feedSearchText.trim()) return feedSearchText.trim();
    return 'All videos';
  }, [feedCategory, feedCreatorContext?.creatorName, feedSavedContext, feedSearchText, multiCategoryFilter]);

  const resetFeedContext = useCallback(() => {
    if (feedCreatorContext) setFeedCreatorContext(null);
    if (feedSavedContext) setFeedSavedContext(false);
  }, [feedCreatorContext, feedSavedContext, setFeedCreatorContext, setFeedSavedContext]);

  const buildFeedScopeKey = useCallback(() => {
    const viewerId = (user?.id || 'anon').trim() || 'anon';
    const categoryScope = multiCategoryFilter.length
      ? multiCategoryFilter.map((value) => value.trim().toLowerCase()).sort().join(',')
      : ((feedCategory || '').trim().toLowerCase() || 'all');
    const searchScope = (feedSearchText || '').trim().toLowerCase() || '-';
    return `${FEED_SEEN_STORAGE_PREFIX}:${viewerId}:${categoryScope}:${searchScope}`;
  }, [feedCategory, feedSearchText, multiCategoryFilter, user?.id]);

  const loadSeenVideoIds = useCallback(async (scopeKey: string, allowedIds: Set<string>) => {
    try {
      const raw = await storage.getItem(scopeKey);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();
      const seenIds = new Set<string>();
      for (const item of parsed) {
        if (typeof item !== 'string') continue;
        if (allowedIds.has(item)) seenIds.add(item);
      }
      return seenIds;
    } catch {
      return new Set<string>();
    }
  }, []);

  const persistSeenVideoIds = useCallback(async (scopeKey: string, seenIds: Set<string>) => {
    try {
      await storage.setItem(scopeKey, JSON.stringify(Array.from(seenIds)));
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const normalizeFeedItems = useCallback((sourceItems: Video[]) => {
    const uniqueMap = new Map<string, Video>();
    for (const item of sourceItems) {
      if (!item?.id) continue;
      if (!uniqueMap.has(item.id)) uniqueMap.set(item.id, item);
    }

    const uniqueItems = Array.from(uniqueMap.values());
    const normalizedMultiCategoryFilters = new Set(
      multiCategoryFilter.map((value) => value.trim().toLowerCase()).filter(Boolean),
    );

    return normalizedMultiCategoryFilters.size
      ? uniqueItems.filter((videoItem) => normalizedMultiCategoryFilters.has((videoItem.talent_type || '').trim().toLowerCase()))
      : uniqueItems;
  }, [multiCategoryFilter]);

  const resolveFeedStartIndex = useCallback((items: Video[], seenInScope: Set<string>, scopeKey: string) => {
    const followedUnseenItems = items
      .map((videoItem, index) => ({ videoItem, index }))
      .filter(({ videoItem }) => Number(videoItem.is_following_author) === 1 && !seenInScope.has(videoItem.id))
      .sort((first, second) => {
        const firstTime = new Date(first.videoItem.created_at || '').getTime() || 0;
        const secondTime = new Date(second.videoItem.created_at || '').getTime() || 0;
        return secondTime - firstTime;
      });

    let startIndex = followedUnseenItems.length > 0
      ? followedUnseenItems[0].index
      : items.findIndex((videoItem) => !seenInScope.has(videoItem.id));

    if (startIndex < 0) {
      seenInScope.clear();
      void persistSeenVideoIds(scopeKey, seenInScope);
      startIndex = 0;
    }

    return startIndex;
  }, [persistSeenVideoIds]);

  const openCategoryMenu = useCallback(() => {
    setBrowseCategorySelections(multiCategoryFilter.length ? multiCategoryFilter : (feedCategory ? [feedCategory] : []));
    setCategoryMenuOpen(true);
  }, [feedCategory, multiCategoryFilter]);

  const resetToAllVideos = useCallback(() => {
    resetFeedContext();
    setMultiCategoryFilter([]);
    setFeedCategory('');
    setFeedSearchText('');
    setBrowseCategoriesOpen(false);
    setCategoryMenuOpen(false);
  }, [resetFeedContext, setFeedCategory, setFeedSearchText]);

  const showReactionOverlay = useCallback((nextText: string, nextIconName: keyof typeof Ionicons.glyphMap) => {
    setReactionOverlayState({
      id: Date.now(),
      text: nextText,
      iconName: nextIconName,
    });
    if (reactionOverlayTimerReference.current) clearTimeout(reactionOverlayTimerReference.current);
    reactionOverlayTimerReference.current = setTimeout(() => {
      setReactionOverlayState(null);
    }, REACTION_OVERLAY_SHOW_MS);
  }, []);

  const patchVideoInStore = useCallback((videoId: string, patcher: (videoItem: Video) => Partial<Video>) => {
    const sourceVideos = useAppStore.getState().feedVideos;
    const nextVideos = sourceVideos.map((videoItem) => (
      videoItem.id === videoId ? { ...videoItem, ...patcher(videoItem) } : videoItem
    ));
    setFeedVideos(nextVideos);
    const activeItem = nextVideos[useAppStore.getState().feedIndex];
    if (activeItem) setCurrentVideo(activeItem);
  }, [setCurrentVideo, setFeedVideos]);

  const loadCommentsForVideo = useCallback(async (videoId: string) => {
    setIsCommentsLoading(true);
    const commentsResponse = await apiFetch<PaginatedResponse<Comment>>(`/videos/${videoId}/comments?page=1&limit=60`);
    if (commentsResponse.success && commentsResponse.data) {
      setCommentItems(commentsResponse.data.items || []);
    } else {
      setCommentItems([]);
    }
    setIsCommentsLoading(false);
  }, []);

  const loadFeedVideos = useCallback(async () => {
    const loadSequence = ++loadFeedSequenceReference.current;
    setIsFeedLoading(true);
    setFeedErrorText('');

    if (feedSavedContext || feedCreatorContext?.userId) {
      const endpointPath = feedSavedContext ? '/videos/saved' : `/videos/user/${feedCreatorContext?.userId}`;
      const feedResponse = await apiFetch<PaginatedResponse<Video>>(endpointPath);

      if (loadSequence !== loadFeedSequenceReference.current) return;

      if (!feedResponse.success || !feedResponse.data) {
        setFeedVideos([]);
        setCurrentVideo(null);
        setFeedIndex(0);
        setFeedErrorText(feedResponse.error || 'Could not load videos now.');
        setIsFeedLoading(false);
        return;
      }

      const contextItems = feedResponse.data.items || [];
      seenScopeKeyReference.current = '';
      seenVideoIdsReference.current = new Set();
      setFeedVideos(contextItems);
      setFeedIndex(0);
      setCurrentVideo(contextItems[0] || null);
      setIsFeedLoading(false);
      return;
    }

    const baseQueryParams = new URLSearchParams();
    if (feedCategory && multiCategoryFilter.length === 0) {
      baseQueryParams.set('talent_type', feedCategory);
    }
    if (feedSearchText.trim()) baseQueryParams.set('search', feedSearchText.trim());

    const scopeKey = buildFeedScopeKey();
    seenScopeKeyReference.current = scopeKey;

    const allItems: Video[] = [];
    let page = 2;
    let totalPages = 1;

    const firstPageQueryParams = new URLSearchParams(baseQueryParams);
    firstPageQueryParams.set('page', '1');
    firstPageQueryParams.set('limit', String(FEED_PAGE_SIZE));
    const firstPageResponse = await apiFetch<PaginatedResponse<Video>>(`/videos?${firstPageQueryParams.toString()}`);

    if (loadSequence !== loadFeedSequenceReference.current) return;

    if (!firstPageResponse.success || !firstPageResponse.data) {
      setFeedVideos([]);
      setCurrentVideo(null);
      setFeedIndex(0);
      setFeedErrorText(firstPageResponse.error || 'Could not load videos now.');
      setIsFeedLoading(false);
      return;
    }

    const firstPageItems = firstPageResponse.data.items || [];
    allItems.push(...firstPageItems);
    const parsedTotalPages = Number(firstPageResponse.data.totalPages || 1);
    totalPages = Number.isFinite(parsedTotalPages)
      ? Math.max(1, Math.floor(parsedTotalPages))
      : 1;

    const initialItems = normalizeFeedItems(allItems);
    if (initialItems.length) {
      const initialAllowedIds = new Set(initialItems.map((videoItem) => videoItem.id));
      const initialSeenInScope = await loadSeenVideoIds(scopeKey, initialAllowedIds);

      if (loadSequence !== loadFeedSequenceReference.current) return;

      seenVideoIdsReference.current = initialSeenInScope;
      void persistSeenVideoIds(scopeKey, initialSeenInScope);

      const initialStartIndex = resolveFeedStartIndex(initialItems, initialSeenInScope, scopeKey);
      const initialActiveVideo = initialItems[initialStartIndex] || null;
      setFeedVideos(initialItems);
      setFeedIndex(initialStartIndex);
      setCurrentVideo(initialActiveVideo);
      setIsFeedLoading(false);

      requestAnimationFrame(() => {
        try {
          feedListReference.current?.scrollToIndex({ index: initialStartIndex, animated: false });
        } catch {
          // No-op.
        }
      });
    } else if (totalPages <= 1) {
      seenVideoIdsReference.current = new Set();
      setFeedVideos([]);
      setCurrentVideo(null);
      setFeedIndex(0);
      setIsFeedLoading(false);
      return;
    }

    while (page <= totalPages && page <= FEED_MAX_PAGES) {
      const pageQueryParams = new URLSearchParams(baseQueryParams);
      pageQueryParams.set('page', String(page));
      pageQueryParams.set('limit', String(FEED_PAGE_SIZE));
      const pageResponse = await apiFetch<PaginatedResponse<Video>>(`/videos?${pageQueryParams.toString()}`);

      if (loadSequence !== loadFeedSequenceReference.current) return;

      if (!pageResponse.success || !pageResponse.data) {
        setFeedVideos([]);
        setCurrentVideo(null);
        setFeedIndex(0);
        setFeedErrorText(pageResponse.error || 'Could not load videos now.');
        setIsFeedLoading(false);
        return;
      }

      const pageItems = pageResponse.data.items || [];
      allItems.push(...pageItems);
      const parsedPageTotalPages = Number(pageResponse.data.totalPages || 1);
      totalPages = Number.isFinite(parsedPageTotalPages)
        ? Math.max(1, Math.floor(parsedPageTotalPages))
        : 1;
      if (pageItems.length === 0) break;
      page += 1;
    }

    const filteredItems = normalizeFeedItems(allItems);
    const allowedIds = new Set(filteredItems.map((videoItem) => videoItem.id));
    const seenInScope = await loadSeenVideoIds(scopeKey, allowedIds);

    if (loadSequence !== loadFeedSequenceReference.current) return;

    seenScopeKeyReference.current = scopeKey;
    seenVideoIdsReference.current = seenInScope;
    void persistSeenVideoIds(scopeKey, seenInScope);

    if (!filteredItems.length) {
      setFeedVideos([]);
      setCurrentVideo(null);
      setFeedIndex(0);
      setIsFeedLoading(false);
      return;
    }

    const state = useAppStore.getState();
    const activeId = state.currentVideo?.id || state.feedVideos[state.feedIndex]?.id || '';
    let startIndex = activeId ? filteredItems.findIndex((videoItem) => videoItem.id === activeId) : -1;
    if (startIndex < 0) startIndex = resolveFeedStartIndex(filteredItems, seenInScope, scopeKey);

    const firstVideo = filteredItems[startIndex] || null;
    setFeedVideos(filteredItems);
    setFeedIndex(startIndex);
    setCurrentVideo(firstVideo);
    setIsFeedLoading(false);

    requestAnimationFrame(() => {
      try {
        feedListReference.current?.scrollToIndex({ index: startIndex, animated: false });
      } catch {
        // No-op.
      }
    });
  }, [
    buildFeedScopeKey,
    feedCategory,
    feedCreatorContext?.userId,
    feedSavedContext,
    feedSearchText,
    loadSeenVideoIds,
    multiCategoryFilter,
    normalizeFeedItems,
    persistSeenVideoIds,
    resolveFeedStartIndex,
    setCurrentVideo,
    setFeedIndex,
    setFeedVideos,
  ]);

  useEffect(() => {
    const searchDebounceTimer = setTimeout(() => {
      void loadFeedVideos();
    }, 280);
    return () => clearTimeout(searchDebounceTimer);
  }, [loadFeedVideos]);

  useEffect(() => {
    if (!feedVideos.length) return;
    const nextIndex = Math.min(feedIndex, feedVideos.length - 1);
    if (nextIndex !== feedIndex) setFeedIndex(nextIndex);
    setCurrentVideo(feedVideos[nextIndex]);
  }, [feedIndex, feedVideos, setCurrentVideo, setFeedIndex]);

  useEffect(() => {
    if (!feedVideos.length) return;

    const wasCommentsOpen = previousCommentsOpenReference.current;
    if (wasCommentsOpen === commentsOpen) return;
    previousCommentsOpenReference.current = commentsOpen;

    const normalizedIndex = Math.max(0, Math.min(feedVideos.length - 1, feedIndex));
    const realignTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        try {
          feedListReference.current?.scrollToIndex({ index: normalizedIndex, animated: false });
        } catch {
          // Ignore realignment errors while FlatList recalculates item sizes.
        }
      });
    }, commentsOpen ? 0 : 120);

    return () => clearTimeout(realignTimer);
  }, [commentsOpen, feedVideos.length, feedIndex]);

  useEffect(() => {
    if (commentsOpen) {
      setFeedContainMode(true);
      return;
    }
    const closeStabilizeTimer = setTimeout(() => {
      setFeedContainMode(false);
    }, 160);
    return () => clearTimeout(closeStabilizeTimer);
  }, [commentsOpen]);

  useEffect(() => {
    if (!activeVideo?.id) return;
    if (previousViewRecordedVideoIdReference.current === activeVideo.id) return;
    previousViewRecordedVideoIdReference.current = activeVideo.id;
    void apiFetch(`/videos/${activeVideo.id}/view`, { method: 'POST' });
  }, [activeVideo?.id]);

  useEffect(() => {
    if (!activeVideo?.id) return;
    const scopeKey = seenScopeKeyReference.current;
    if (!scopeKey) return;
    const seenIds = seenVideoIdsReference.current;
    if (seenIds.has(activeVideo.id)) return;
    seenIds.add(activeVideo.id);
    void persistSeenVideoIds(scopeKey, seenIds);
  }, [activeVideo?.id, persistSeenVideoIds]);

  useEffect(() => {
    setTitleExpanded(false);
  }, [activeVideo?.id]);

  useEffect(() => {
    setFeedPaused(false);
  }, [activeVideo?.id]);

  useEffect(() => {
    if (!commentsOpen || !activeVideo?.id) return;
    setCommentItems([]);
    void loadCommentsForVideo(activeVideo.id);
  }, [commentsOpen, activeVideo?.id, loadCommentsForVideo]);

  useEffect(() => {
    return () => {
      if (reactionOverlayTimerReference.current) clearTimeout(reactionOverlayTimerReference.current);
      if (commentBarSendTimerReference.current) clearTimeout(commentBarSendTimerReference.current);
    };
  }, []);

  useEffect(() => {
    const showEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = Keyboard.addListener(showEventName, (event) => {
      setKeyboardHeight(Math.max(0, event.endCoordinates?.height || 0));
    });
    const onKeyboardHide = Keyboard.addListener(hideEventName, () => {
      setKeyboardHeight(0);
    });

    return () => {
      onKeyboardShow.remove();
      onKeyboardHide.remove();
    };
  }, []);

  const goToVideoIndex = useCallback((nextIndex: number, animated = true) => {
    if (!feedVideos.length) return;
    const normalizedIndex = ((nextIndex % feedVideos.length) + feedVideos.length) % feedVideos.length;
    feedListReference.current?.scrollToIndex({ index: normalizedIndex, animated });
    setFeedIndex(normalizedIndex);
    setCurrentVideo(feedVideos[normalizedIndex] || null);
  }, [feedVideos, setCurrentVideo, setFeedIndex]);

  const getNextPlayableIndex = useCallback(() => {
    if (!feedVideos.length) return null;

    const seenIds = seenVideoIdsReference.current;
    let fallbackIndex: number | null = null;

    for (let offset = 1; offset <= feedVideos.length; offset += 1) {
      const candidateIndex = (feedIndex + offset) % feedVideos.length;
      const candidateVideo = feedVideos[candidateIndex];
      if (!candidateVideo) continue;
      if (fallbackIndex === null) fallbackIndex = candidateIndex;
      if (!seenIds.has(candidateVideo.id)) return candidateIndex;
    }

    if (fallbackIndex === null) return null;

    seenIds.clear();
    if (activeVideo?.id) seenIds.add(activeVideo.id);
    const scopeKey = seenScopeKeyReference.current;
    if (scopeKey) void persistSeenVideoIds(scopeKey, seenIds);

    for (let offset = 1; offset <= feedVideos.length; offset += 1) {
      const candidateIndex = (feedIndex + offset) % feedVideos.length;
      const candidateVideo = feedVideos[candidateIndex];
      if (!candidateVideo) continue;
      if (!seenIds.has(candidateVideo.id)) return candidateIndex;
    }

    return fallbackIndex;
  }, [activeVideo?.id, feedIndex, feedVideos, persistSeenVideoIds]);

  const removeVideoAndKeepCurrent = useCallback((videoId: string) => {
    const state = useAppStore.getState();
    const sourceVideos = state.feedVideos;
    const removedIndex = sourceVideos.findIndex((item) => item.id === videoId);
    if (removedIndex < 0) return;

    const remainingVideos = sourceVideos.filter((item) => item.id !== videoId);
    setFeedVideos(remainingVideos);

    if (!remainingVideos.length) {
      setCurrentVideo(null);
      setFeedIndex(0);
      return;
    }

    let nextIndex = state.feedIndex;
    if (removedIndex < state.feedIndex) nextIndex = state.feedIndex - 1;
    if (nextIndex >= remainingVideos.length) nextIndex = remainingVideos.length - 1;
    if (nextIndex < 0) nextIndex = 0;

    setFeedIndex(nextIndex);
    setCurrentVideo(remainingVideos[nextIndex] || null);

    requestAnimationFrame(() => {
      try {
        feedListReference.current?.scrollToIndex({ index: nextIndex, animated: false });
      } catch {
        // FlatList might still be recalculating; ignore this frame.
      }
    });
  }, [setCurrentVideo, setFeedIndex, setFeedVideos]);

  const onListMomentumEnd = useCallback((offsetY: number) => {
    if (feedViewportHeight <= 0 || !feedVideos.length) return;
    const nextIndex = Math.round(offsetY / feedViewportHeight);
    const boundedIndex = Math.max(0, Math.min(feedVideos.length - 1, nextIndex));
    setFeedIndex(boundedIndex);
    setCurrentVideo(feedVideos[boundedIndex] || null);
  }, [feedVideos, feedViewportHeight, setCurrentVideo, setFeedIndex]);

  const onVoteVideo = useCallback(async (videoItem: Video, voteType: 'like' | 'dislike') => {
    if (!videoItem?.id) return;
    if (!loggedIn) {
      showReactionOverlay(voteType === 'like' ? 'Liked' : 'Disliked', voteType === 'like' ? 'thumbs-up' : 'thumbs-down');
      return;
    }

    const endpointPath = voteType === 'like'
      ? `/videos/${videoItem.id}/like`
      : `/videos/${videoItem.id}/dislike`;
    const voteResponse = await apiFetch<{ removed?: boolean }>(endpointPath, { method: 'POST' });

    if (!voteResponse.success) {
      if (voteResponse.error === 'already_voted') {
        showReactionOverlay(voteType === 'like' ? 'Liked' : 'Disliked', voteType === 'like' ? 'thumbs-up' : 'thumbs-down');
        return;
      }
      showReactionOverlay(voteResponse.error || 'Vote failed', 'alert-circle');
      return;
    }

    if (voteResponse.data?.removed) {
      removeVideoAndKeepCurrent(videoItem.id);
      showReactionOverlay('Removed', 'trash');
      return;
    }

    patchVideoInStore(videoItem.id, (targetVideo) => {
      let nextLikes = Number(targetVideo.likes || 0);
      let nextDislikes = Number(targetVideo.dislikes || 0);

      if (targetVideo.is_liked === 'like') nextLikes = Math.max(0, nextLikes - 1);
      if (targetVideo.is_liked === 'dislike') nextDislikes = Math.max(0, nextDislikes - 1);

      if (voteType === 'like') nextLikes += 1;
      if (voteType === 'dislike') nextDislikes += 1;

      return {
        likes: nextLikes,
        dislikes: nextDislikes,
        is_liked: voteType,
      };
    });

    showReactionOverlay(voteType === 'like' ? 'Liked' : 'Disliked', voteType === 'like' ? 'thumbs-up' : 'thumbs-down');
  }, [loggedIn, patchVideoInStore, removeVideoAndKeepCurrent, showReactionOverlay]);

  const moveToRecommendedVideoByDirection = useCallback((direction: 'up' | 'down') => {
    const state = useAppStore.getState();
    const sourceVideos = state.feedVideos;
    const currentIndex = state.feedIndex;
    const currentItem = sourceVideos[currentIndex];

    if (!currentItem || sourceVideos.length <= 1) return false;

    const recommendedIndex = getNextPlayableIndex();
    if (recommendedIndex === null) return false;

    const recommendedVideo = sourceVideos[recommendedIndex];
    if (!recommendedVideo || recommendedVideo.id === currentItem.id) return false;

    // Force arrow direction to control visible movement:
    // up -> move to next row, down -> move to previous row.
    const destinationIndex = direction === 'up'
      ? Math.min(sourceVideos.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);

    const videosWithoutRecommended = sourceVideos.filter((videoItem) => videoItem.id !== recommendedVideo.id);

    const arrangedVideos = [...videosWithoutRecommended];
    arrangedVideos.splice(destinationIndex, 0, recommendedVideo);

    setFeedVideos(arrangedVideos);
    setFeedIndex(destinationIndex);
    setCurrentVideo(arrangedVideos[destinationIndex] || null);

    requestAnimationFrame(() => {
      try {
        feedListReference.current?.scrollToIndex({ index: destinationIndex, animated: true });
      } catch {
        // FlatList may still be reconciling rows on this frame.
      }
    });

    return true;
  }, [getNextPlayableIndex, setCurrentVideo, setFeedIndex, setFeedVideos]);

  const onArrowVoteAndAdvance = useCallback((voteType: 'like' | 'dislike') => {
    if (!activeVideo) return;

    // Keep button behavior close to web: avoid double-trigger while transition starts.
    const now = Date.now();
    if (now - arrowNavigationLockReference.current < 220) return;
    arrowNavigationLockReference.current = now;

    const targetVideo = activeVideo;
    const didMove = moveToRecommendedVideoByDirection(voteType === 'like' ? 'up' : 'down');
    if (!didMove) return;
    void onVoteVideo(targetVideo, voteType);
  }, [activeVideo, moveToRecommendedVideoByDirection, onVoteVideo]);

  const onToggleFollowCreator = useCallback(async (videoItem: Video) => {
    if (!loggedIn) {
      setFeedErrorText('Sign in required for follow action.');
      return;
    }

    const followResponse = await apiFetch<{ following: boolean }>(`/users/${videoItem.user_id}/follow`, { method: 'POST' });

    if (!followResponse.success || !followResponse.data) {
      setFeedErrorText(followResponse.error || 'Follow update failed');
      return;
    }

    const nextFollowingState = followResponse.data.following ? 1 : 0;
    const sourceVideos = useAppStore.getState().feedVideos;
    const nextVideos = sourceVideos.map((item) => (
      item.user_id === videoItem.user_id ? { ...item, is_following_author: nextFollowingState } : item
    ));
    setFeedVideos(nextVideos);
    const nextActiveItem = nextVideos[useAppStore.getState().feedIndex];
    if (nextActiveItem) setCurrentVideo(nextActiveItem);
  }, [loggedIn, setCurrentVideo, setFeedVideos]);

  const onToggleSaveVideo = useCallback(async (videoItem: Video) => {
    if (!loggedIn) {
      setFeedErrorText('Sign in required for save action.');
      return;
    }

    const saveResponse = await apiFetch<{ saved: boolean }>(`/videos/${videoItem.id}/save`, { method: 'POST' });

    if (!saveResponse.success || !saveResponse.data) {
      setFeedErrorText(saveResponse.error || 'Save update failed');
      return;
    }

    patchVideoInStore(videoItem.id, () => ({
      is_saved: saveResponse.data?.saved ? 1 : 0,
    }));
  }, [loggedIn, patchVideoInStore]);

  const onOpenComments = useCallback(() => {
    setCommentsOpen(true);
    setCommentItems([]);
  }, [setCommentsOpen]);

  const commentThread = useMemo(() => {
    const byId = new Map<string, Comment>();
    const repliesByParent: Record<string, Comment[]> = {};
    const roots: Comment[] = [];
    commentItems.forEach((c) => { byId.set(c.id, c); });
    commentItems.forEach((c) => {
      const parentId = c.parent_comment_id;
      if (parentId && byId.has(parentId)) {
        if (!repliesByParent[parentId]) repliesByParent[parentId] = [];
        repliesByParent[parentId].push(c);
      } else {
        roots.push(c);
      }
    });
    roots.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    Object.values(repliesByParent).forEach((list) => {
      list.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    });
    return { roots, repliesByParent };
  }, [commentItems]);

  const isOwnComment = useCallback((c: Comment) => {
    if (!user) return false;
    return String(c.user_id) === String(user.id) || c.username === user.username;
  }, [user]);

  const onSubmitComment = useCallback(async () => {
    if (!activeVideo?.id) return;
    if (!loggedIn) {
      setFeedErrorText('Sign in required for comments.');
      return;
    }
    if (!mainCommentText.trim()) return;

    const parentCommentId = replyToComment?.id || null;
    const createResponse = await apiFetch<Comment>(`/videos/${activeVideo.id}/comments`, {
      method: 'POST',
      body: { body: mainCommentText.trim(), parent_comment_id: parentCommentId },
    });

    if (!createResponse.success || !createResponse.data) {
      setFeedErrorText(createResponse.error || 'Comment failed');
      return;
    }

    setReplyToComment(null);
    void loadCommentsForVideo(activeVideo.id);
    setMainCommentText('');
    showReactionOverlay('Comment sent', 'chatbubble');
  }, [activeVideo?.id, loggedIn, mainCommentText, replyToComment, showReactionOverlay, loadCommentsForVideo]);

  const toggleCommentLike = useCallback(async (commentId: string) => {
    if (!loggedIn) { setFeedErrorText('Sign in to like comments'); return; }
    if (!activeVideo?.id) return;
    if (likeLoadingMap[commentId]) return;

    setLikeLoadingMap((prev) => ({ ...prev, [commentId]: true }));
    const data = await apiFetch<{ liked: boolean; likes_count: number }>(
      `/videos/${activeVideo.id}/comments/${commentId}/like`,
      { method: 'POST' },
    );
    setLikeLoadingMap((prev) => ({ ...prev, [commentId]: false }));

    if (!data.success || !data.data) {
      setFeedErrorText(data.error || 'Could not like comment');
      return;
    }

    setCommentItems((prev) => prev.map((c) => (
      c.id === commentId
        ? { ...c, likes_count: Number(data.data?.likes_count || 0), is_liked: data.data?.liked ? 1 : 0 }
        : c
    )));
  }, [activeVideo?.id, loggedIn, likeLoadingMap]);

  const deleteOwnComment = useCallback(async (commentId: string) => {
    if (!activeVideo?.id) return;
    if (!loggedIn) { setFeedErrorText('Sign in first'); return; }
    if (deleteLoadingMap[commentId]) return;

    Alert.alert('Delete Comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeleteLoadingMap((prev) => ({ ...prev, [commentId]: true }));
          const data = await apiFetch(`/videos/${activeVideo.id}/comments/${commentId}`, { method: 'DELETE' });
          setDeleteLoadingMap((prev) => ({ ...prev, [commentId]: false }));
          if (!data.success) {
            setFeedErrorText(data.error || 'Could not delete comment');
            return;
          }
          if (replyToComment && replyToComment.id === commentId) setReplyToComment(null);
          void loadCommentsForVideo(activeVideo.id);
          showReactionOverlay('Comment deleted', 'trash');
        },
      },
    ]);
  }, [activeVideo?.id, loggedIn, deleteLoadingMap, replyToComment, loadCommentsForVideo, showReactionOverlay]);

  const submitReportComment = useCallback(async () => {
    if (!activeVideo?.id || !reportCommentId) return;
    if (!reportReason) { setFeedErrorText('Please select a reason'); return; }
    setReportSubmitting(true);
    const data = await apiFetch(`/videos/${activeVideo.id}/comments/${reportCommentId}/report`, {
      method: 'POST',
      body: { reason: reportReason, description: reportDesc },
    });
    setReportSubmitting(false);
    if (!data.success) { setFeedErrorText(data.error || 'Report failed'); return; }
    setReportModalVisible(false);
    setReportCommentId(null);
    setReportReason('');
    setReportDesc('');
    showReactionOverlay('Comment reported', 'flag');
  }, [activeVideo?.id, reportCommentId, reportReason, reportDesc, showReactionOverlay]);

  const onCommentBarAction = useCallback(() => {
    if (!activeVideo) return;
    const hasDraftComment = !!mainCommentText.trim();

    if (!hasDraftComment) {
      void onOpenComments();
      return;
    }

    if (commentBarSendTimerReference.current) {
      clearTimeout(commentBarSendTimerReference.current);
      commentBarSendTimerReference.current = null;
    }

    if (!commentsOpen) {
      setCommentsOpen(true);
      commentBarSendTimerReference.current = setTimeout(() => {
        void onSubmitComment();
      }, 220);
      return;
    }

    void onSubmitComment();
  }, [activeVideo, commentsOpen, mainCommentText, onOpenComments, onSubmitComment, setCommentsOpen]);

  const onShareVideo = useCallback(async (videoItem: Video) => {
    if (!videoItem?.id) return;
    void apiFetch(`/videos/${videoItem.id}/share`, { method: 'POST' });
    try {
      await Share.share({
        title: videoItem.title || 'Talents Stage Video',
        message: `${videoItem.title || 'Talents Stage Video'}\n${videoItem.file_url}`,
      });
    } catch {
      // ignore cancel
    }
  }, []);

  const onReportVideo = useCallback((videoItem: Video) => {
    if (!videoItem?.id) return;
    if (!loggedIn) {
      setFeedErrorText('Sign in required for report.');
      return;
    }

    Alert.alert(
      'Report video',
      'Do you want to report this video for inappropriate content?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            void apiFetch(`/videos/${videoItem.id}/report`, {
              method: 'POST',
              body: {
                reason: 'Inappropriate content',
                description: '',
              },
            });
            showReactionOverlay('Reported', 'flag');
          },
        },
      ],
    );
  }, [loggedIn, showReactionOverlay]);

  const toggleBrowseCategory = useCallback((categoryName: string) => {
    setBrowseCategorySelections((previousValues) => (
      previousValues.includes(categoryName)
        ? previousValues.filter((value) => value !== categoryName)
        : [...previousValues, categoryName]
    ));
  }, []);

  const toggleBrowseAllCategories = useCallback(() => {
    setBrowseCategorySelections((previousValues) => (
      previousValues.length === TALENT_TYPES.length ? [] : [...TALENT_TYPES]
    ));
  }, []);

  const applyBrowseCategories = useCallback(() => {
    const normalizedCategories = Array.from(new Set(
      browseCategorySelections.map((value) => value.trim()).filter(Boolean),
    ));

    resetFeedContext();
    if (normalizedCategories.length === 0) {
      setMultiCategoryFilter([]);
      setFeedCategory('');
    } else if (normalizedCategories.length === 1) {
      setMultiCategoryFilter([]);
      setFeedCategory(normalizedCategories[0]);
    } else {
      setMultiCategoryFilter(normalizedCategories);
      setFeedCategory('');
    }

    setBrowseCategoriesOpen(false);
    setCategoryMenuOpen(false);
  }, [browseCategorySelections, resetFeedContext, setFeedCategory]);

  const browseAllSelected = browseCategorySelections.length === TALENT_TYPES.length;
  const keyboardOpen = keyboardHeight > 0;
  const mainCommentBarBottom = keyboardOpen
    ? keyboardHeight - tabBarHeight
    : commentBarBottom;
  const commentsInputKeyboardOffset = keyboardOpen
    ? keyboardHeight - tabBarHeight
    : 0;

  const handleDrawerNav = useCallback((targetScreen: string) => {
    if (targetScreen === 'Home' || targetScreen === 'Following' || targetScreen === 'Upload' || targetScreen === 'Saved' || targetScreen === 'Account') {
      navigation.navigate('MainTabs', { screen: targetScreen });
      return;
    }
    if (targetScreen === 'Login' || targetScreen === 'Signup' || targetScreen === 'ForgotPassword' || targetScreen === 'Followers' || targetScreen === 'FollowingUsers' || targetScreen === 'SharedVideos' || targetScreen === 'VideoAnalytics') {
      navigation.navigate(targetScreen);
      return;
    }
    navigation.navigate('MainTabs');
  }, [navigation]);

  const fullTitleText = useMemo(() => (activeVideo?.title || '').trim() || 'No title', [activeVideo?.title]);
  const hasLongTitle = fullTitleText.length > TITLE_PREVIEW_CHARS;
  const collapsedTitleText = useMemo(
    () => fullTitleText.slice(0, TITLE_PREVIEW_CHARS).trimEnd(),
    [fullTitleText],
  );

  return (
      <View style={styles.screenContainer}>
      <View style={[styles.topHeaderContainer, { top: topHeaderOffset }]}>
        <View style={styles.searchInputWrapper}>
          <BlurView pointerEvents="none" intensity={15} tint="dark" style={styles.barBlurLayer} />
          <AppPressable
            onPress={openCategoryMenu}
            style={styles.searchCategoryButton}
            hitSlop={14}
            pressRetentionOffset={14}
          >
            <Image source={WEB_ICON_SOURCES.menu} style={styles.searchCategoryIcon} />
          </AppPressable>
          <TextInput
            value={feedSearchText}
            onChangeText={(nextValue) => {
              resetFeedContext();
              setFeedSearchText(nextValue);
            }}
            placeholder={hasScopedFeed ? scopedFeedText : 'Search...'}
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            style={styles.searchInputField}
          />
          {hasScopedFeed ? (
            <AppPressable
              onPress={resetToAllVideos}
              style={styles.searchEndButton}
            >
              <Text style={styles.searchResetText}>All Videos</Text>
            </AppPressable>
          ) : (
            <AppPressable style={styles.searchEndButton}>
              <Image source={WEB_ICON_SOURCES.search} style={styles.searchIcon} />
            </AppPressable>
          )}
        </View>
        <AppPressable onPress={() => setDrawerOpen(true)} style={styles.hamburgerButton} hitSlop={12}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </AppPressable>
      </View>

      <View style={[styles.titleRowContainer, { top: titleRowOffset }]}>
        <View style={styles.titleTextContainer}>
          {!hasLongTitle && (
            <Text style={styles.titleText} numberOfLines={1}>{fullTitleText}</Text>
          )}

          {hasLongTitle && !titleExpanded && (
            <View style={styles.titleCollapsedRow}>
              <Text style={[styles.titleText, styles.titleCollapsedMainText]} numberOfLines={1} ellipsizeMode="clip">
                {collapsedTitleText}
              </Text>
              <Text style={styles.titleMoreText}>...</Text>
              <AppPressable onPress={() => setTitleExpanded(true)} hitSlop={12}>
                <Text style={styles.titleMoreText}> more</Text>
              </AppPressable>
            </View>
          )}

          {hasLongTitle && titleExpanded && (
            <>
              <Text style={styles.titleText} numberOfLines={3}>{fullTitleText}</Text>
              <AppPressable onPress={() => setTitleExpanded(false)} hitSlop={12}>
                <Text style={styles.titleMoreText}>less</Text>
              </AppPressable>
            </>
          )}
        </View>
        <AppPressable
          style={styles.titleUserContainer}
          onPress={() => {
            if (activeVideo?.user_id) {
              navigation.navigate('CreatorProfile', { userId: activeVideo.user_id });
            }
          }}
        >
          <View style={styles.titleUserAvatarWrap}>
            <Image source={activeVideoAvatarUrl ? { uri: activeVideoAvatarUrl } : WEB_ICON_SOURCES.account} style={styles.titleUserAvatar} />
          </View>
          <Text style={styles.titleUserName} numberOfLines={1}>@{activeVideo?.username || 'user'}</Text>
        </AppPressable>
      </View>

      <View
        style={[
          styles.feedViewportContainer,
          commentsOpen && styles.feedViewportCommentsOpen,
          commentsOpen && {
            flexBasis: commentsVideoPeekHeight,
            minHeight: commentsVideoPeekHeight,
            maxHeight: commentsVideoPeekHeight,
          },
        ]}
        onLayout={(event) => {
          if (commentsOpen) return;
          const nextHeight = event.nativeEvent.layout.height;
          if (nextHeight > 200 && Math.abs(nextHeight - closedFeedViewportHeight) > 8) {
            setClosedFeedViewportHeight(nextHeight);
          }
        }}
      >
        {isFeedLoading ? (
          <View style={styles.centerStateContainer}>
            <ActivityIndicator size="large" color={AppColors.textPrimary} />
          </View>
        ) : feedErrorText ? (
          <View style={styles.centerStateContainer}>
            <Text style={styles.errorStateText}>{feedErrorText}</Text>
            <AppPressable onPress={() => void loadFeedVideos()} style={styles.retryActionButton}>
              <Text style={styles.retryActionButtonText}>Retry</Text>
            </AppPressable>
          </View>
        ) : !feedVideos.length ? (
          <View style={styles.centerStateContainer}>
            <Text style={styles.emptyStateTitleText}>No videos available</Text>
            <AppPressable onPress={() => void loadFeedVideos()} style={styles.retryActionButton}>
              <Text style={styles.retryActionButtonText}>Reload feed</Text>
            </AppPressable>
          </View>
        ) : (
          <FlatList
            ref={feedListReference}
            data={feedVideos}
            extraData={`${feedIndex}-${feedContainMode}-${feedMuted}-${feedPaused}`}
            keyExtractor={(videoItem) => videoItem.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            getItemLayout={(_, index) => ({
              length: feedViewportHeight,
              offset: feedViewportHeight * index,
              index,
            })}
            onMomentumScrollEnd={(event) => onListMomentumEnd(event.nativeEvent.contentOffset.y)}
            renderItem={({ item: videoItem, index }) => {
              const videoPosterUrl = getVideoThumbnailUrl(videoItem.thumbnail_url, videoItem.file_url);
              return (
                <View style={[styles.videoPageContainer, { height: feedViewportHeight }]}>
                  <ExpoVideo
                    source={{ uri: videoItem.file_url }}
                    resizeMode={feedContainMode ? ResizeMode.CONTAIN : ResizeMode.COVER}
                    shouldPlay={index === feedIndex && isScreenFocused && !feedPaused}
                    isLooping
                    isMuted={feedMuted}
                    volume={feedMuted ? 0 : 1}
                    usePoster={!!videoPosterUrl}
                    posterSource={videoPosterUrl ? { uri: videoPosterUrl } : undefined}
                    posterStyle={styles.videoPlayerElement}
                    style={styles.videoPlayerElement}
                  />
                  {index === feedIndex && (
                    <AppPressable
                      style={styles.videoTapOverlayButton}
                      onPress={() => setFeedPaused((previousValue) => !previousValue)}
                    />
                  )}
                </View>
              );
            }}
          />
        )}

        {activeVideo && (
          <AppPressable style={[styles.leftMuteButton, { top: muteTopOffset }]} onPress={() => void toggleFeedMute()}>
            <Text style={styles.muteEmojiText}>{feedMuted ? '🔇' : '🔊'}</Text>
          </AppPressable>
        )}

        {activeVideo && feedPaused && (
          <AppPressable
            style={[
              styles.centerPlayPauseButton,
              {
                top: Math.max(20, (feedViewportHeight / 2) - 39),
                left: Math.max(12, (screenWidth / 2) - 39),
              },
            ]}
            onPress={() => setFeedPaused(false)}
          >
            <Ionicons
              name="play"
              size={34}
              color={AppColors.textPrimary}
            />
          </AppPressable>
        )}

        {activeVideo && !commentsOpen && (
          <>
            <AppPressable style={[styles.leftReportButton, { bottom: actionBottomOffset }]} onPress={() => onReportVideo(activeVideo)}>
              <View style={styles.reportIconWrap}>
                <Image source={WEB_ICON_SOURCES.report} style={styles.reportIconImage} />
              </View>
              <Text style={styles.leftReportButtonText}>Report</Text>
            </AppPressable>

            <View style={[styles.rightActionBarContainer, { bottom: actionBottomOffset }]}>
              <View style={styles.rightArrowGroup}>
              <AppPressable
                style={styles.arrowActionButton}
                onPress={() => onArrowVoteAndAdvance('like')}
              >
                <Image source={WEB_ICON_SOURCES.swipeUp} style={styles.arrowActionImage} />
              </AppPressable>

              <AppPressable
                style={styles.arrowActionButton}
                onPress={() => onArrowVoteAndAdvance('dislike')}
              >
                <Image source={WEB_ICON_SOURCES.swipeDown} style={styles.arrowActionImage} />
              </AppPressable>
              </View>

              <View style={styles.rightSocialGroup}>
              <AppPressable style={styles.socialActionButton} onPress={() => void onToggleFollowCreator(activeVideo)}>
                <Image
                  source={activeVideo.is_following_author ? WEB_ICON_SOURCES.followActive : WEB_ICON_SOURCES.follow}
                  style={[styles.socialActionImage, !activeVideo.is_following_author && styles.socialActionImageTintWhite]}
                />
                <Text style={styles.socialActionLabel}>Follow</Text>
              </AppPressable>

              <AppPressable style={styles.socialActionButton} onPress={() => void onToggleSaveVideo(activeVideo)}>
                <Image
                  source={activeVideo.is_saved ? WEB_ICON_SOURCES.saveActive : WEB_ICON_SOURCES.save}
                  style={[styles.socialActionImage, !activeVideo.is_saved && styles.socialActionImageTintWhite]}
                />
                <Text style={styles.socialActionLabel}>Save</Text>
              </AppPressable>

              <AppPressable style={styles.socialActionButton} onPress={() => void onShareVideo(activeVideo)}>
                <Image source={WEB_ICON_SOURCES.share} style={[styles.socialActionImage, styles.socialActionImageTintWhite]} />
                <Text style={styles.socialActionLabel}>Share</Text>
              </AppPressable>
              </View>
            </View>
          </>
        )}
      </View>

      {!commentsOpen && (
        <View style={[styles.commentBarContainer, { bottom: mainCommentBarBottom }]}>
          <BlurView pointerEvents="none" intensity={15} tint="dark" style={styles.barBlurLayer} />
          <TextInput
            value={mainCommentText}
            onChangeText={setMainCommentText}
            placeholder="Comment here..."
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            style={styles.commentBarInput}
            editable
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={onCommentBarAction}
          />
          <AppPressable
            style={styles.commentBarButton}
            onPress={onCommentBarAction}
          >
            <Image source={WEB_ICON_SOURCES.comment} style={[styles.commentBarIcon, styles.socialActionImageTintWhite]} />
          </AppPressable>
        </View>
      )}

      {reactionOverlayState && (
        <View key={reactionOverlayState.id} style={styles.reactionOverlayContainer} pointerEvents="none">
          <View style={styles.reactionOverlayPill}>
            <Ionicons name={reactionOverlayState.iconName} size={18} color={AppColors.textPrimary} />
            <Text style={styles.reactionOverlayText}>{reactionOverlayState.text}</Text>
          </View>
        </View>
      )}

      {commentsOpen && (
        <View
          style={[
            styles.commentInlineSheetRoot,
            {
              flexBasis: commentsSheetHeight,
              minHeight: commentsSheetHeight,
              maxHeight: commentsSheetHeight,
            },
          ]}
        >
          <View style={[styles.commentModalSheetContainer, styles.commentInlineSheetContainer]}>
            <View style={styles.commentModalHeaderContainer}>
              <Text style={styles.commentModalTitleText}>Comments</Text>
              <AppPressable
                onPress={() => {
                  Keyboard.dismiss();
                  setReplyToComment(null);
                  setCommentsOpen(false);
                }}
                hitSlop={20}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close-circle" size={28} color={AppColors.textPrimary} />
              </AppPressable>
            </View>

            {isCommentsLoading ? (
              <View style={styles.commentLoadingContainer}>
                <ActivityIndicator size="small" color={AppColors.textPrimary} />
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={[
                  styles.commentListContentContainer,
                  { paddingBottom: 92 + insets.bottom },
                ]}
              >
                {commentThread.roots.length === 0 ? (
                  <Text style={styles.commentEmptyText}>No comments yet.</Text>
                ) : commentThread.roots.map((rootComment) => {
                  const renderComment = (c: Comment, depth: number): React.ReactNode => {
                    const replies = commentThread.repliesByParent[c.id] || [];
                    const liked = Number(c.is_liked) > 0;
                    const level = Math.min(depth, 3);
                    const ownComment = isOwnComment(c);
                    return (
                      <View key={c.id}>
                        <View style={[styles.commentItemContainer, level > 0 && { marginLeft: level * 18 }]}>
                          <View style={styles.commentItemHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.commentAuthorText}>@{c.username}</Text>
                              <Text style={styles.commentBodyText}>{c.body}</Text>
                            </View>
                            {ownComment ? (
                              <AppPressable
                                onPress={() => { void deleteOwnComment(c.id); }}
                                disabled={!!deleteLoadingMap[c.id]}
                                style={styles.commentActionBtn}
                                hitSlop={8}
                              >
                                <Ionicons name="trash-outline" size={16} color={deleteLoadingMap[c.id] ? '#555' : '#8d8d8d'} />
                              </AppPressable>
                            ) : (
                              <AppPressable
                                onPress={() => {
                                  setReportCommentId(c.id);
                                  setReportReason('');
                                  setReportDesc('');
                                  setReportModalVisible(true);
                                }}
                                style={styles.commentActionBtn}
                                hitSlop={8}
                              >
                                <Ionicons name="flag-outline" size={14} color="#8d8d8d" />
                              </AppPressable>
                            )}
                          </View>
                          <View style={styles.commentMetaRow}>
                            <AppPressable
                              onPress={() => { void toggleCommentLike(c.id); }}
                              disabled={!!likeLoadingMap[c.id]}
                              style={styles.commentMetaBtn}
                            >
                              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? '#e0245e' : '#888'} />
                              <Text style={[styles.commentMetaText, liked && { color: '#e0245e' }]}>{Number(c.likes_count || 0)}</Text>
                            </AppPressable>
                            <AppPressable
                              onPress={() => setReplyToComment(c)}
                              style={styles.commentMetaBtn}
                            >
                              <Ionicons name="chatbubble-outline" size={13} color="#888" />
                              <Text style={styles.commentMetaText}>Reply</Text>
                            </AppPressable>
                            {replies.length > 0 && (
                              <Text style={styles.commentMetaCount}>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</Text>
                            )}
                          </View>
                        </View>
                        {replies.map((reply) => renderComment(reply, depth + 1))}
                      </View>
                    );
                  };
                  return renderComment(rootComment, 0);
                })}
              </ScrollView>
            )}

            <View
              style={[
                styles.commentInputRowContainer,
                {
                  bottom: commentsInputKeyboardOffset,
                  paddingBottom: keyboardOpen ? 8 : insets.bottom + 8,
                },
              ]}
            >
              <TextInput
                value={mainCommentText}
                onChangeText={setMainCommentText}
                placeholder={replyToComment ? `Reply to @${replyToComment.username}...` : (loggedIn ? 'Add a comment...' : 'Sign in to comment')}
                placeholderTextColor={AppColors.textMuted}
                editable={loggedIn}
                style={styles.commentInputField}
              />
              <AppPressable onPress={() => { void onSubmitComment(); }} disabled={!loggedIn || !mainCommentText.trim()} style={styles.commentSendButton}>
                <Ionicons name="send" size={16} color={AppColors.textPrimary} />
              </AppPressable>
            </View>
          </View>
        </View>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={reportModalVisible}
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.reportModalBackdrop}>
          <View style={styles.reportModalContainer}>
            <Text style={styles.reportModalTitle}>Report Comment</Text>

            <Text style={styles.reportModalLabel}>Reason</Text>
            {['Harassment or bullying', 'Spam or misleading', 'Hate speech', 'Inappropriate content', 'Violates community standards', 'Other'].map((reason) => (
              <AppPressable
                key={reason}
                onPress={() => setReportReason(reason)}
                style={[styles.reportReasonOption, reportReason === reason && styles.reportReasonSelected]}
              >
                <Text style={[styles.reportReasonText, reportReason === reason && styles.reportReasonTextSelected]}>{reason}</Text>
              </AppPressable>
            ))}

            <Text style={[styles.reportModalLabel, { marginTop: 12 }]}>Details (optional)</Text>
            <TextInput
              placeholder="Provide additional details..."
              placeholderTextColor={AppColors.textMuted}
              value={reportDesc}
              onChangeText={setReportDesc}
              multiline
              style={styles.reportDescInput}
            />

            <View style={styles.reportModalButtons}>
              <AppPressable
                onPress={() => setReportModalVisible(false)}
                disabled={reportSubmitting}
                style={styles.reportCancelBtn}
              >
                <Text style={styles.reportCancelText}>Cancel</Text>
              </AppPressable>
              <AppPressable
                onPress={() => { void submitReportComment(); }}
                disabled={reportSubmitting || !reportReason}
                style={[styles.reportSubmitBtn, (reportSubmitting || !reportReason) && { opacity: 0.5 }]}
              >
                <Text style={styles.reportSubmitText}>{reportSubmitting ? 'Reporting...' : 'Report'}</Text>
              </AppPressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={categoryMenuOpen}
        onRequestClose={() => setCategoryMenuOpen(false)}
      >
        <View
          style={[
            styles.categoryMenuBackdrop,
            { paddingTop: categoryMenuTopOffset, paddingLeft: 30, paddingRight: 80 },
          ]}
        >
          <AppPressable style={StyleSheet.absoluteFillObject} onPress={() => setCategoryMenuOpen(false)} />
          <AppPressable style={styles.categoryMenuContainer} onPress={() => {}}>
            <ScrollView>
              <AppPressable
                onPress={() => {
                  setBrowseCategoriesOpen(true);
                  setCategoryMenuOpen(false);
                }}
                style={styles.categoryBrowseItem}
              >
                <Text style={styles.categoryBrowseItemText}>Browse Categories</Text>
                <Ionicons name="checkbox-outline" size={18} color={AppColors.textPrimary} />
              </AppPressable>

              <AppPressable
                onPress={() => {
                  resetToAllVideos();
                }}
                style={[styles.categoryMenuItem, !feedCategory && multiCategoryFilter.length === 0 && styles.categoryMenuItemActive]}
              >
                <Text style={[styles.categoryMenuItemText, !feedCategory && multiCategoryFilter.length === 0 && styles.categoryMenuItemTextActive]}>All Videos</Text>
              </AppPressable>

              {TALENT_TYPES.map((categoryName) => {
                const isActive = feedCategory === categoryName || multiCategoryFilter.includes(categoryName);
                return (
                  <AppPressable
                    key={categoryName}
                    onPress={() => {
                      resetFeedContext();
                      setMultiCategoryFilter([]);
                      setFeedCategory(categoryName);
                      setCategoryMenuOpen(false);
                    }}
                    style={[styles.categoryMenuItem, isActive && styles.categoryMenuItemActive]}
                  >
                    <Text style={[styles.categoryMenuItemText, isActive && styles.categoryMenuItemTextActive]}>{categoryName}</Text>
                  </AppPressable>
                );
              })}
            </ScrollView>
          </AppPressable>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={browseCategoriesOpen}
        onRequestClose={() => setBrowseCategoriesOpen(false)}
      >
        <View style={styles.browseCategoriesBackdrop}>
          <AppPressable style={StyleSheet.absoluteFillObject} onPress={() => setBrowseCategoriesOpen(false)} />
          <AppPressable style={styles.browseCategoriesSheet} onPress={() => {}}>
            <View style={styles.browseCategoriesHeader}>
              <Text style={styles.browseCategoriesTitle}>Browse Categories</Text>
              <AppPressable onPress={() => setBrowseCategoriesOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={AppColors.textPrimary} />
              </AppPressable>
            </View>

            <AppPressable style={styles.browseAllButton} onPress={toggleBrowseAllCategories}>
              <Text style={styles.browseAllButtonText}>
                {browseAllSelected ? 'Clear All Categories' : 'Select All Categories'}
              </Text>
            </AppPressable>

            <ScrollView style={styles.browseCategoriesList} contentContainerStyle={styles.browseCategoriesListContent}>
              {TALENT_TYPES.map((categoryName) => {
                const selected = browseCategorySelections.includes(categoryName);
                return (
                  <AppPressable key={categoryName} style={styles.browseCategoryRow} onPress={() => toggleBrowseCategory(categoryName)}>
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={selected ? AppColors.accentPrimary : AppColors.textSecondary}
                    />
                    <Text style={[styles.browseCategoryRowText, selected && styles.browseCategoryRowTextSelected]}>{categoryName}</Text>
                  </AppPressable>
                );
              })}
            </ScrollView>

            <View style={styles.browseCategoriesActions}>
              <AppPressable style={styles.browseCancelButton} onPress={() => setBrowseCategoriesOpen(false)}>
                <Text style={styles.browseCancelButtonText}>Cancel</Text>
              </AppPressable>
              <AppPressable style={styles.browseApplyButton} onPress={applyBrowseCategories}>
                <Text style={styles.browseApplyButtonText}>Browse</Text>
              </AppPressable>
            </View>
          </AppPressable>
        </View>
      </Modal>

      <SideDrawer onNav={handleDrawerNav} />
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: AppColors.backgroundPrimary,
  },
  topHeaderContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1200,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInputWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: '#1010101a',
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  searchCategoryButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCategoryIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    tintColor: AppColors.textPrimary,
  },
  searchInputField: {
    flex: 1,
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: '400',
    paddingVertical: 0,
  },
  searchEndButton: {
    minWidth: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    tintColor: AppColors.textPrimary,
  },
  searchResetText: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hamburgerButton: {
    width: 44,
    height: 44,
    padding: 7,
    justifyContent: 'center',
    gap: 8,
  },
  hamburgerLine: {
    width: 30,
    height: 3,
    borderRadius: 3,
    backgroundColor: AppColors.textPrimary,
  },
  titleRowContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1190,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  titleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  titleCollapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  titleCollapsedMainText: {
    flexShrink: 1,
  },
  titleText: {
    color: AppColors.textPrimary,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  titleMoreText: {
    color: '#a6a6a6',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  titleUserContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    width: 56,
  },
  titleUserAvatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: '#2a2a2a',
  },
  titleUserAvatar: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  titleUserName: {
    color: AppColors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
    width: 54,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedViewportContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  feedViewportCommentsOpen: {
    flexGrow: 0,
    flexShrink: 0,
  },
  videoPageContainer: {
    width: '100%',
    backgroundColor: '#000',
  },
  videoPlayerElement: {
    ...StyleSheet.absoluteFillObject,
  },
  videoTapOverlayButton: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  centerStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  errorStateText: {
    color: '#ffb4b4',
    textAlign: 'center',
    fontSize: 14,
  },
  emptyStateTitleText: {
    color: AppColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  retryActionButton: {
    backgroundColor: AppColors.accentPrimary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryActionButtonText: {
    color: AppColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  leftReportButton: {
    position: 'absolute',
    left: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 121,
  },
  reportIconWrap: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportIconImage: {
    width: 46,
    height: 46,
    resizeMode: 'contain',
  },
  leftReportButtonText: {
    color: AppColors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  leftMuteButton: {
    position: 'absolute',
    left: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(16,16,16,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 121,
  },
  centerPlayPauseButton: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 121,
  },
  muteEmojiText: {
    fontSize: 19,
    lineHeight: 22,
  },
  rightActionBarContainer: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 18,
    zIndex: 121,
  },
  rightArrowGroup: {
    alignItems: 'center',
    gap: 30,
    marginBottom: 50,
  },
  arrowActionButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowActionImage: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
    tintColor: AppColors.textPrimary,
  },
  rightSocialGroup: {
    alignItems: 'center',
    gap: 12,
  },
  socialActionButton: {
    alignItems: 'center',
    gap: 4,
  },
  socialActionImage: {
    width: 46,
    height: 46,
    resizeMode: 'contain',
  },
  socialActionImageTintWhite: {
    tintColor: AppColors.textPrimary,
  },
  socialActionLabel: {
    color: AppColors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  commentBarContainer: {
    position: 'absolute',
    left: 15,
    right: 15,
    bottom: 0,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: '#1010101a',
    zIndex: 1300,
    elevation: 1300,
  },
  commentBarInput: {
    flex: 1,
    height: 40,
    borderWidth: 0,
    borderRadius: 22,
    backgroundColor: 'transparent',
    color: AppColors.textPrimary,
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: '400',
  },
  barBlurLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  commentBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentBarIcon: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  reactionOverlayContainer: {
    position: 'absolute',
    top: '46%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  reactionOverlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reactionOverlayText: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  commentModalAbsoluteLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1300,
    justifyContent: 'flex-end',
  },
  commentInlineSheetRoot: {
    flex: 1,
    minHeight: 0,
  },
  commentInlineSheetContainer: {
    flex: 1,
    minHeight: 0,
    maxHeight: '100%',
  },
  commentModalRootContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  commentModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  commentModalSheetContainer: {
    backgroundColor: AppColors.backgroundSecondary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '72%',
    minHeight: 260,
    borderTopWidth: 1,
    borderColor: AppColors.borderPrimary,
  },
  commentModalHeaderContainer: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.borderPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentModalTitleText: {
    color: AppColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  commentLoadingContainer: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentListContentContainer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  commentItemContainer: {
    borderWidth: 1,
    borderColor: AppColors.borderPrimary,
    borderRadius: 10,
    backgroundColor: AppColors.backgroundCard,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  commentAuthorText: {
    color: AppColors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 4,
  },
  commentBodyText: {
    color: '#d1d1d1',
    fontSize: 13,
    lineHeight: 18,
  },
  commentEmptyText: {
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginVertical: 22,
    fontSize: 13,
  },
  commentInputRowContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: AppColors.borderPrimary,
    backgroundColor: AppColors.backgroundSecondary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  commentInputField: {
    flex: 1,
    minHeight: 38,
    maxHeight: 84,
    borderWidth: 1,
    borderColor: AppColors.borderSecondary,
    borderRadius: 10,
    color: AppColors.textPrimary,
    backgroundColor: AppColors.backgroundCard,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  commentSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.accentPrimary,
  },
  categoryMenuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-start',
  },
  categoryMenuContainer: {
    maxHeight: '80%',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#222222',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  categoryBrowseItem: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBrowseItemText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '400',
  },
  categoryMenuItem: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  categoryMenuItemActive: {
    backgroundColor: '#1e1e1e',
  },
  categoryMenuItemText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '400',
  },
  categoryMenuItemTextActive: {
    color: AppColors.accentPrimary,
    fontWeight: '400',
  },
  browseCategoriesBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  browseCategoriesSheet: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '86%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#111111',
    overflow: 'hidden',
  },
  browseCategoriesHeader: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  browseCategoriesTitle: {
    color: AppColors.textPrimary,
    fontSize: 16,
    fontWeight: '400',
  },
  browseAllButton: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseAllButtonText: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: '400',
  },
  browseCategoriesList: {
    maxHeight: 340,
  },
  browseCategoriesListContent: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  browseCategoryRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  browseCategoryRowText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '400',
  },
  browseCategoryRowTextSelected: {
    color: AppColors.textPrimary,
    fontWeight: '400',
  },
  browseCategoriesActions: {
    borderTopWidth: 1,
    borderTopColor: '#222222',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10,
  },
  browseCancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseCancelButtonText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: '400',
  },
  browseApplyButton: {
    flex: 2,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: AppColors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseApplyButtonText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '400',
  },
  commentItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  commentActionBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
  },
  commentMetaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentMetaText: {
    color: '#888',
    fontSize: 12,
  },
  commentMetaCount: {
    color: '#666',
    fontSize: 11,
  },
  replyBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 60,
    backgroundColor: '#2a2a2a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 10,
  },
  replyBannerText: {
    color: '#aaa',
    fontSize: 12,
    flex: 1,
  },
  reportModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  reportModalContainer: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
  },
  reportModalLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 6,
  },
  reportReasonOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  reportReasonSelected: {
    borderColor: AppColors.accentPrimary,
    backgroundColor: 'rgba(123,63,228,0.15)',
  },
  reportReasonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  reportReasonTextSelected: {
    color: AppColors.accentPrimary,
    fontWeight: '600',
  },
  reportDescInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  reportModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  reportCancelBtn: {
    flex: 1,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  reportCancelText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  reportSubmitBtn: {
    flex: 2,
    padding: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,0,0,0.6)',
    alignItems: 'center',
  },
  reportSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
