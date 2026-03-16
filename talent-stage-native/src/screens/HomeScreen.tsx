import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppColors } from '../theme/colors';
import { TALENT_TYPES, type Video, type PaginatedResponse } from '../types';
import { apiFetch } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import Toast, { toast } from '../components/Toast';
import Comments from '../components/Comments';
import ShareSheet from '../components/ShareSheet';
import SideDrawer from '../components/SideDrawer';
import ReactionOverlay from '../components/ReactionOverlay';

const FEED_LIMIT = 50;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const navigation = useNavigation<any>();

  const feedVideos = useAppStore((s) => s.feedVideos);
  const feedIndex = useAppStore((s) => s.feedIndex);
  const currentVideo = useAppStore((s) => s.currentVideo);
  const feedMuted = useAppStore((s) => s.feedMuted);
  const feedCategory = useAppStore((s) => s.feedCategory);
  const feedSearchText = useAppStore((s) => s.feedSearchText);
  const loggedIn = useAppStore((s) => s.loggedIn);
  const feedCreatorContext = useAppStore((s) => s.feedCreatorContext);
  const feedSavedContext = useAppStore((s) => s.feedSavedContext);
  const commentsOpen = useAppStore((s) => s.commentsOpen);
  const setFeedVideos = useAppStore((s) => s.setFeedVideos);
  const setFeedIndex = useAppStore((s) => s.setFeedIndex);
  const setCurrentVideo = useAppStore((s) => s.setCurrentVideo);
  const setFeedCategory = useAppStore((s) => s.setFeedCategory);
  const setFeedSearchText = useAppStore((s) => s.setFeedSearchText);
  const setFeedCreatorContext = useAppStore((s) => s.setFeedCreatorContext);
  const setFeedSavedContext = useAppStore((s) => s.setFeedSavedContext);
  const toggleFeedMute = useAppStore((s) => s.toggleFeedMute);
  const setCommentsOpen = useAppStore((s) => s.setCommentsOpen);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);

  const feedListRef = useRef<FlatList<Video>>(null);
  const prevViewRecordedRef = useRef<string>('');

  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [feedViewportH, setFeedViewportH] = useState(Math.max(420, Math.round(screenHeight * 0.7)));
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(null);
  const [videoVoted, setVideoVoted] = useState(false);

  const categoryOptions = useMemo(() => ['All', ...TALENT_TYPES], []);
  const activeVideo = feedVideos[feedIndex] || currentVideo || null;

  const resetFeedContext = useCallback(() => {
    if (feedCreatorContext) setFeedCreatorContext(null);
    if (feedSavedContext) setFeedSavedContext(false);
  }, [feedCreatorContext, feedSavedContext, setFeedCreatorContext, setFeedSavedContext]);

  const patchVideoInStore = useCallback((videoId: string, patcher: (v: Video) => Partial<Video>) => {
    const source = useAppStore.getState().feedVideos;
    const next = source.map((v) => (v.id === videoId ? { ...v, ...patcher(v) } : v));
    setFeedVideos(next);
    const active = next[useAppStore.getState().feedIndex];
    if (active) setCurrentVideo(active);
  }, [setCurrentVideo, setFeedVideos]);

  // ── Feed loading ───────────────────────────────────────────────────
  const loadFeedVideos = useCallback(async () => {
    setIsFeedLoading(true);
    setFeedError('');

    let endpoint = '/videos';
    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('limit', String(FEED_LIMIT));

    if (feedSavedContext) {
      endpoint = '/videos/saved';
    } else if (feedCreatorContext?.userId) {
      endpoint = `/videos/user/${feedCreatorContext.userId}`;
    } else {
      if (feedCategory) params.set('talent_type', feedCategory);
      if (feedSearchText.trim()) params.set('search', feedSearchText.trim());
    }

    const path = endpoint === '/videos' && params.toString()
      ? `${endpoint}?${params.toString()}`
      : endpoint;

    const res = await apiFetch<PaginatedResponse<Video>>(path);

    if (!res.success || !res.data) {
      setFeedVideos([]);
      setCurrentVideo(null);
      setFeedIndex(0);
      setFeedError(res.error || 'Could not load videos.');
      setIsFeedLoading(false);
      return;
    }

    const items = res.data.items || [];
    setFeedVideos(items);
    setFeedIndex(0);
    setCurrentVideo(items[0] || null);
    setIsFeedLoading(false);
  }, [feedCategory, feedCreatorContext?.userId, feedSavedContext, feedSearchText, setCurrentVideo, setFeedIndex, setFeedVideos]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadFeedVideos(); }, 280);
    return () => clearTimeout(timer);
  }, [loadFeedVideos]);

  useEffect(() => {
    if (!feedVideos.length) return;
    const idx = Math.min(feedIndex, feedVideos.length - 1);
    if (idx !== feedIndex) setFeedIndex(idx);
    setCurrentVideo(feedVideos[idx]);
  }, [feedIndex, feedVideos, setCurrentVideo, setFeedIndex]);

  // Record view
  useEffect(() => {
    if (!activeVideo?.id) return;
    if (prevViewRecordedRef.current === activeVideo.id) return;
    prevViewRecordedRef.current = activeVideo.id;
    void apiFetch(`/videos/${activeVideo.id}/view`, { method: 'POST' });
  }, [activeVideo?.id]);

  // Reset voted state when video changes
  useEffect(() => {
    setVideoVoted(!!activeVideo?.is_liked);
    setReaction(null);
  }, [activeVideo?.id]);

  const onListMomentumEnd = useCallback((offsetY: number) => {
    if (feedViewportH <= 0 || !feedVideos.length) return;
    const idx = Math.round(offsetY / feedViewportH);
    const bounded = Math.max(0, Math.min(feedVideos.length - 1, idx));
    setFeedIndex(bounded);
    setCurrentVideo(feedVideos[bounded] || null);
  }, [feedVideos, feedViewportH, setCurrentVideo, setFeedIndex]);

  const jumpToIndex = useCallback((idx: number) => {
    if (!feedVideos.length) return;
    const bounded = Math.max(0, Math.min(feedVideos.length - 1, idx));
    feedListRef.current?.scrollToIndex({ index: bounded, animated: true });
    setFeedIndex(bounded);
    setCurrentVideo(feedVideos[bounded] || null);
  }, [feedVideos, setCurrentVideo, setFeedIndex]);

  // ── Actions ────────────────────────────────────────────────────────
  const onVote = useCallback(async (type: 'like' | 'dislike') => {
    if (!activeVideo) return;
    if (!loggedIn) { toast('Sign in to vote'); return; }

    const res = await apiFetch(`/videos/${activeVideo.id}/vote`, {
      method: 'POST',
      body: { type } as unknown as BodyInit,
    });
    if (!res.success) { toast(res.error || 'Vote failed'); return; }

    patchVideoInStore(activeVideo.id, (v) => {
      let likes = Number(v.likes || 0);
      let dislikes = Number(v.dislikes || 0);
      if (v.is_liked === 'like') likes = Math.max(0, likes - 1);
      if (v.is_liked === 'dislike') dislikes = Math.max(0, dislikes - 1);
      if (type === 'like') likes += 1;
      if (type === 'dislike') dislikes += 1;
      return { likes, dislikes, is_liked: type };
    });

    setReaction(type);
    setVideoVoted(true);
    // Move to next video after vote
    setTimeout(() => jumpToIndex(feedIndex + 1), 500);
  }, [activeVideo, loggedIn, patchVideoInStore, feedIndex, jumpToIndex]);

  const onNav = useCallback((screen: string, data?: unknown) => {
    navigation.navigate(screen as never, data as never);
  }, [navigation]);

  return (
    <View style={styles.screen}>
      {/* Header with search + menu */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={AppColors.textMuted} />
          <TextInput
            value={feedSearchText}
            onChangeText={(v) => { resetFeedContext(); setFeedSearchText(v); }}
            placeholder="Search creators or videos"
            placeholderTextColor={AppColors.textMuted}
            style={styles.searchInput}
          />
          {!!feedSearchText && (
            <Pressable onPress={() => { resetFeedContext(); setFeedSearchText(''); }} style={styles.searchClear}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          )}
        </View>
        <Pressable style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Ionicons name="menu" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Context banner */}
      {(feedCreatorContext || feedSavedContext) && (
        <View style={styles.contextBanner}>
          <Text style={styles.contextText} numberOfLines={1}>
            {feedSavedContext ? 'Saved Videos' : `Videos by ${feedCreatorContext?.creatorName}`}
          </Text>
          <Pressable onPress={resetFeedContext}>
            <Ionicons name="close-circle" size={20} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Category bar */}
      <View style={styles.catRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catList}>
          {categoryOptions.map((cat) => {
            const active = (cat === 'All' && !feedCategory) || cat === feedCategory;
            return (
              <Pressable
                key={cat}
                onPress={() => { resetFeedContext(); setFeedCategory(cat === 'All' ? '' : cat); }}
                style={[styles.catBtn, active && styles.catBtnActive]}
              >
                <Text style={[styles.catText, active && styles.catTextActive]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Feed viewport */}
      <View
        style={styles.feedContainer}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 200 && Math.abs(h - feedViewportH) > 8) setFeedViewportH(h);
        }}
      >
        {isFeedLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : feedError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{feedError}</Text>
            <Pressable onPress={() => void loadFeedVideos()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : !feedVideos.length ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No videos yet</Text>
            <Text style={styles.emptySub}>Try another category or clear search.</Text>
          </View>
        ) : (
          <FlatList
            ref={feedListRef}
            data={feedVideos}
            keyExtractor={(v) => v.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            getItemLayout={(_, i) => ({ length: feedViewportH, offset: feedViewportH * i, index: i })}
            onMomentumScrollEnd={(e) => onListMomentumEnd(e.nativeEvent.contentOffset.y)}
            renderItem={({ item, index }) => (
              <FeedVideoCard
                video={item}
                height={feedViewportH}
                isActive={index === feedIndex && !commentsOpen}
                isMuted={feedMuted}
                onLike={() => void onVote('like')}
                onDislike={() => void onVote('dislike')}
                onFollow={() => {
                  if (!loggedIn) { toast('Sign in to follow'); return; }
                  void (async () => {
                    const r = await apiFetch<{ following: boolean }>(`/users/${item.user_id}/follow`, { method: 'POST' });
                    if (!r.success) { toast(r.error || 'Follow failed'); return; }
                    const val = r.data?.following ? 1 : 0;
                    const src = useAppStore.getState().feedVideos;
                    setFeedVideos(src.map((v) => v.user_id === item.user_id ? { ...v, is_following_author: val } : v));
                    const act = useAppStore.getState().feedVideos[useAppStore.getState().feedIndex];
                    if (act) setCurrentVideo(act);
                    toast(r.data?.following ? 'Following!' : 'Unfollowed');
                  })();
                }}
                onSave={() => {
                  if (!loggedIn) { toast('Sign in to save'); return; }
                  void (async () => {
                    const r = await apiFetch<{ saved: boolean }>(`/videos/${item.id}/save`, { method: 'POST' });
                    if (!r.success) { toast(r.error || 'Save failed'); return; }
                    patchVideoInStore(item.id, () => ({ is_saved: r.data?.saved ? 1 : 0 }));
                    toast(r.data?.saved ? 'Saved!' : 'Removed');
                  })();
                }}
                onShare={() => useAppStore.getState().setShareSheetOpen(true)}
                onComment={() => setCommentsOpen(true)}
                onCreator={() => navigation.navigate('CreatorProfile' as never, { userId: item.user_id } as never)}
                onNext={() => jumpToIndex(index + 1)}
                onPrev={() => jumpToIndex(index - 1)}
              />
            )}
          />
        )}
      </View>

      {/* Mute toggle */}
      <View style={[styles.muteWrap, { bottom: insets.bottom + 72 }]}>
        <Pressable onPress={() => void toggleFeedMute()} style={styles.muteBtn}>
          <Ionicons name={feedMuted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
          <Text style={styles.muteText}>{feedMuted ? 'Muted' : 'Sound On'}</Text>
        </Pressable>
      </View>

      {/* Reaction overlay */}
      <ReactionOverlay type={reaction} />

      {/* Comments drawer */}
      <Comments videoId={activeVideo?.id || null} open={commentsOpen} onClose={() => setCommentsOpen(false)} />

      {/* Share sheet */}
      <ShareSheet />

      {/* Side drawer */}
      <SideDrawer onNav={onNav} />

      {/* Toast */}
      <Toast />
    </View>
  );
}

// ── FeedVideoCard ─────────────────────────────────────────────────────
interface FeedVideoCardProps {
  video: Video;
  height: number;
  isActive: boolean;
  isMuted: boolean;
  onLike: () => void;
  onDislike: () => void;
  onFollow: () => void;
  onSave: () => void;
  onShare: () => void;
  onComment: () => void;
  onCreator: () => void;
  onNext: () => void;
  onPrev: () => void;
}

function FeedVideoCard({
  video, height, isActive, isMuted,
  onLike, onDislike, onFollow, onSave, onShare, onComment, onCreator,
  onNext, onPrev,
}: FeedVideoCardProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => { setIsReady(false); }, [video.id]);

  return (
    <View style={[styles.videoCard, { height }]}>
      <ExpoVideo
        source={{ uri: video.file_url }}
        resizeMode={ResizeMode.COVER}
        shouldPlay={isActive}
        isLooping
        isMuted={isMuted}
        onReadyForDisplay={() => setIsReady(true)}
        style={StyleSheet.absoluteFill}
      />

      {!isReady && (
        <View style={styles.videoLoading}>
          {video.thumbnail_url ? (
            <Image source={{ uri: video.thumbnail_url }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#141414' }]} />
          )}
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Bottom gradient */}
      <View style={styles.gradient} />

      {/* Video info */}
      <View style={styles.videoMeta}>
        <Pressable onPress={onCreator}>
          <Text style={styles.creatorText}>@{video.username || 'creator'}</Text>
        </Pressable>
        <Text style={styles.titleText} numberOfLines={2}>{video.title}</Text>
        {video.description ? (
          <Text style={styles.descText} numberOfLines={2}>{video.description}</Text>
        ) : null}
      </View>

      {/* Action rail */}
      <View style={styles.actionRail}>
        {/* Creator avatar */}
        <Pressable onPress={onCreator} style={styles.avatarWrap}>
          <Image
            source={video.avatar_url ? { uri: video.avatar_url } : require('../../assets/icon.png')}
            style={styles.avatar}
          />
        </Pressable>

        <RailBtn icon="chevron-up" label="" onPress={onLike} />
        <RailBtn icon="chevron-down" label="" onPress={onDislike} />
        <RailBtn
          icon={video.is_following_author ? 'person-remove' : 'person-add'}
          label="Follow"
          onPress={onFollow}
          color={video.is_following_author ? AppColors.accentPrimary : '#fff'}
        />
        <RailBtn icon="chatbubble-outline" label="Comment" onPress={onComment} />
        <RailBtn
          icon={video.is_saved ? 'bookmark' : 'bookmark-outline'}
          label="Save"
          onPress={onSave}
          color={video.is_saved ? AppColors.accentPrimary : '#fff'}
        />
        <RailBtn icon="share-social-outline" label="Share" onPress={onShare} />
      </View>
    </View>
  );
}

function RailBtn({ icon, label, onPress, color = '#fff' }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.railBtn}>
      <Ionicons name={icon} size={24} color={color} />
      {!!label && <Text style={styles.railLabel}>{label}</Text>}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.backgroundPrimary },

  // Header
  header: {
    paddingHorizontal: 14, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: AppColors.borderPrimary,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  searchWrap: {
    flex: 1, borderRadius: 22, borderWidth: 1, borderColor: AppColors.borderSecondary,
    backgroundColor: AppColors.backgroundCard, paddingHorizontal: 12, minHeight: 40,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  searchClear: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#2b2b2b',
    alignItems: 'center', justifyContent: 'center',
  },
  menuBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: AppColors.backgroundCard,
    borderWidth: 1, borderColor: AppColors.borderSecondary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Context banner
  contextBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: AppColors.accentChip, borderBottomWidth: 1, borderBottomColor: AppColors.borderPrimary,
  },
  contextText: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },

  // Category bar
  catRow: { borderBottomWidth: 1, borderBottomColor: AppColors.borderPrimary, paddingVertical: 8 },
  catList: { paddingHorizontal: 12, gap: 8 },
  catBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: AppColors.borderSecondary, backgroundColor: '#141414',
  },
  catBtnActive: { borderColor: AppColors.accentPrimary, backgroundColor: AppColors.accentChip },
  catText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '600' },
  catTextActive: { color: '#fff' },

  // Feed
  feedContainer: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  errorText: { color: '#ffb4b4', textAlign: 'center', fontSize: 14 },
  retryBtn: { backgroundColor: AppColors.accentPrimary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptySub: { color: AppColors.textSecondary, fontSize: 13, textAlign: 'center' },

  // Video card
  videoCard: { width: '100%', backgroundColor: '#000' },
  videoLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220, backgroundColor: 'rgba(0,0,0,0.38)' },
  videoMeta: { position: 'absolute', left: 16, right: 80, bottom: 24, gap: 4 },
  creatorText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  titleText: { color: '#fff', fontWeight: '700', fontSize: 15, lineHeight: 21 },
  descText: { color: '#d1d1d1', fontSize: 12, lineHeight: 18 },

  // Action rail
  actionRail: { position: 'absolute', right: 8, bottom: 18, alignItems: 'center', gap: 10 },
  avatarWrap: { marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff' },
  railBtn: { alignItems: 'center', gap: 2, width: 52, paddingVertical: 2 },
  railLabel: { color: '#fff', fontSize: 10, fontWeight: '600' },

  // Mute
  muteWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'box-none' },
  muteBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.44)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  muteText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
