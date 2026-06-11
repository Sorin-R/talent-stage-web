import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppPressable from '../../components/AppPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { toast } from '../../components/Toast';
import { useAppStore } from '../../store/useAppStore';
import SmartVideoThumbnail from '../../components/SmartVideoThumbnail';
import type { PaginatedResponse, UserWithStats, Video } from '../../types';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { TRANSPARENT_AVATAR_SOURCE } from '../../constants/avatar';

const DEFAULT_AVATAR_SOURCE = TRANSPARENT_AVATAR_SOURCE;

type SortMode = 'most_views' | 'more_likes' | 'more_dislikes' | 'newest' | 'oldest';
const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'most_views', label: 'Most views' },
  { value: 'more_likes', label: 'More likes' },
  { value: 'more_dislikes', label: 'More dislikes' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const REPORT_REASONS = [
  'Harassment or bullying',
  'Impersonation',
  'Spam or misleading',
  'Inappropriate profile',
  'Violates community standards',
  'Other',
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 3;
const GRID_GAP = 4;
const GRID_PADDING = 8;
const TILE_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const TILE_HEIGHT = TILE_WIDTH * 1.5;

interface CreatorUserStats {
  is_followed?: number | boolean;
  follower_count?: number;
  following_count?: number;
  website?: string | null;
}

export default function CreatorProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'CreatorProfile'>>();
  const creatorUserId = route.params.userId;

  const loggedIn = useAppStore((s) => s.loggedIn);
  const feedVideos = useAppStore((s) => s.feedVideos);
  const currentVideo = useAppStore((s) => s.currentVideo);
  const setFeedVideos = useAppStore((s) => s.setFeedVideos);
  const setFeedIndex = useAppStore((s) => s.setFeedIndex);
  const setCurrentVideo = useAppStore((s) => s.setCurrentVideo);
  const setFeedCreatorContext = useAppStore((s) => s.setFeedCreatorContext);
  const setFeedSavedContext = useAppStore((s) => s.setFeedSavedContext);

  const [isLoading, setIsLoading] = useState(false);
  const [creatorUser, setCreatorUser] = useState<UserWithStats | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [creatorStats, setCreatorStats] = useState({
    followingCount: 0,
    followerCount: 0,
    likesCount: 0,
    dislikesCount: 0,
  });
  const [creatorWebsite, setCreatorWebsite] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [sortPickerOpen, setSortPickerOpen] = useState(false);

  // Report modal state
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportReasonPicker, setReportReasonPicker] = useState(false);

  const loadCreatorUserStats = useCallback(async (userId: string) => {
    const res = await apiFetch<CreatorUserStats>('/users/' + userId);
    const userData = res.data;
    if (!res.success || !userData) return;
    setIsFollowing(!!userData.is_followed);
    setCreatorStats((prev) => ({
      ...prev,
      followerCount: Number(userData.follower_count || 0),
      followingCount: Number(userData.following_count || 0),
    }));
    setCreatorWebsite((userData.website || '').trim() || null);
  }, []);

  const loadVideos = useCallback(async (userId: string) => {
    const limit = 50;
    const first = await apiFetch<PaginatedResponse<Video>>(`/videos/user/${userId}?page=1&limit=${limit}`);
    if (!first.success || !first.data) {
      setVideos([]);
      setCreatorStats((prev) => ({ ...prev, likesCount: 0, dislikesCount: 0 }));
      return;
    }

    const allItems: Video[] = [...(first.data.items || [])];
    const totalPages = Number(first.data.totalPages || 1);

    if (totalPages > 1) {
      const restPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      const rest = await Promise.all(
        restPages.map((page) => apiFetch<PaginatedResponse<Video>>(`/videos/user/${userId}?page=${page}&limit=${limit}`))
      );
      for (const chunk of rest) {
        if (chunk.success && chunk.data?.items?.length) {
          allItems.push(...chunk.data.items);
        }
      }
    }

    setVideos(allItems);
    const likesCount = allItems.reduce((sum, v) => sum + Number(v.likes || 0), 0);
    const dislikesCount = allItems.reduce((sum, v) => sum + Number(v.dislikes || 0), 0);
    setCreatorStats((prev) => ({ ...prev, likesCount, dislikesCount }));
  }, []);

  const loadCreatorData = useCallback(async () => {
    if (!creatorUserId) return;
    setIsLoading(true);
    const userRes = await apiFetch<UserWithStats>(`/users/${creatorUserId}`);
    if (userRes.success && userRes.data) {
      setCreatorUser(userRes.data);
      setIsFollowing(!!userRes.data.is_followed);
    }
    await loadCreatorUserStats(creatorUserId);
    await loadVideos(creatorUserId);
    setIsLoading(false);
  }, [creatorUserId, loadCreatorUserStats, loadVideos]);

  useEffect(() => {
    void loadCreatorData();
  }, [loadCreatorData, loggedIn]);

  const doFollow = async () => {
    if (!loggedIn) {
      toast('Sign in to follow');
      navigation.navigate('Login' as never);
      return;
    }
    if (!creatorUserId) return;
    const wasFollowing = isFollowing;
    const res = await apiFetch<{ following: boolean }>('/users/' + creatorUserId + '/follow', { method: 'POST' });
    if (!res.success) { toast('Error: ' + res.error); return; }
    const following = !!res.data?.following;
    setIsFollowing(following);
    if (following !== wasFollowing) {
      setCreatorStats((prev) => ({
        ...prev,
        followerCount: Math.max(0, prev.followerCount + (following ? 1 : -1)),
      }));
    }
    const nextFollowValue = following ? 1 : 0;
    const nextVideos = feedVideos.map((v) =>
      v.user_id === creatorUserId ? { ...v, is_following_author: nextFollowValue } : v
    );
    setFeedVideos(nextVideos);
    if (currentVideo && currentVideo.user_id === creatorUserId) {
      setCurrentVideo({ ...currentVideo, is_following_author: nextFollowValue });
    }
    toast(following ? 'Now following!' : 'Unfollowed');
  };

  const openReportModal = () => {
    if (!loggedIn) {
      toast('Sign in to report');
      navigation.navigate('Login' as never);
      return;
    }
    setReportReason('');
    setReportDesc('');
    setReportModal(true);
  };

  const doReportUser = async () => {
    if (!creatorUserId) return;
    if (!reportReason) { toast('Please select a reason'); return; }
    setReportSubmitting(true);
    const res = await apiFetch('/users/' + creatorUserId + '/report', {
      method: 'POST',
      body: JSON.stringify({ reason: reportReason, description: reportDesc }),
    });
    setReportSubmitting(false);
    if (!res.success) { toast('Error: ' + res.error); return; }
    setReportModal(false);
    setReportReason('');
    setReportDesc('');
    toast('User reported successfully. Thank you!');
  };

  const sortedVideos = useMemo(() => {
    const rows = [...videos];
    rows.sort((a, b) => {
      if (sortMode === 'most_views') return Number(b.views || 0) - Number(a.views || 0);
      if (sortMode === 'more_likes') return Number(b.likes || 0) - Number(a.likes || 0);
      if (sortMode === 'more_dislikes') return Number(b.dislikes || 0) - Number(a.dislikes || 0);
      if (sortMode === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows;
  }, [videos, sortMode]);

  const openVideo = (list: Video[], index: number) => {
    const selected = list[index];
    if (!selected) return;
    setFeedVideos(list);
    setFeedIndex(index);
    setCurrentVideo(selected);
    setFeedSavedContext(false);
    setFeedCreatorContext({
      userId: creatorUserId,
      creatorName: creatorUser?.full_name || creatorUser?.username || 'Creator',
    });
    navigation.navigate('MainTabs' as never);
  };

  const fmt = (value: number) => new Intl.NumberFormat().format(Math.max(0, Number(value || 0)));

  const websiteHref = creatorWebsite && /^https?:\/\//i.test(creatorWebsite)
    ? creatorWebsite
    : creatorWebsite
      ? `https://${creatorWebsite}`
      : null;

  const openWebsite = () => {
    if (websiteHref) {
      Linking.openURL(websiteHref).catch(() => toast('Could not open link'));
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screenContainer} edges={['top']}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  const renderHeader = () => (
    <View>
      {/* Back button */}
      <View style={styles.backRow}>
        <AppPressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={AppColors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </AppPressable>
      </View>

      {/* Creator header */}
      <View style={styles.headerContainer}>
        <View style={styles.avatarBorder}>
          <Image
            source={DEFAULT_AVATAR_SOURCE}
            style={styles.avatarImage}
          />
        </View>
        <Text style={styles.usernameText}>@{creatorUser?.username || 'user'}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>Followers {fmt(creatorStats.followerCount)}</Text>
          <Text style={styles.statDot}>{'\u2022'}</Text>
          <Text style={styles.statText}>Likes {fmt(creatorStats.likesCount)}</Text>
          <Text style={styles.statDot}>{'\u2022'}</Text>
          <Text style={styles.statText}>Dislikes {fmt(creatorStats.dislikesCount)}</Text>
        </View>

        {creatorWebsite && websiteHref && (
          <AppPressable onPress={openWebsite}>
            <Text style={styles.websiteLink}>{creatorWebsite}</Text>
          </AppPressable>
        )}

        <View style={styles.actionRow}>
          <AppPressable
            onPress={doFollow}
            style={[styles.followButton, isFollowing && styles.followingButtonBg]}
          >
            <Text style={styles.followButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </AppPressable>
          <AppPressable onPress={openReportModal} style={styles.reportButton}>
            <Ionicons name="flag-outline" size={16} color={AppColors.textPrimary} />
            <Text style={styles.reportButtonText}>Report</Text>
          </AppPressable>
        </View>
      </View>

      {/* Sort dropdown */}
      <View style={styles.sortContainer}>
        <AppPressable onPress={() => setSortPickerOpen(true)} style={styles.dropdownButton}>
          <Text style={styles.dropdownButtonText}>
            {SORT_OPTIONS.find((o) => o.value === sortMode)?.label || 'Sort by'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={AppColors.textSecondary} />
        </AppPressable>
      </View>

      {sortedVideos.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No videos found</Text>
        </View>
      )}
    </View>
  );

  const renderVideoTile = ({ item, index }: { item: Video; index: number }) => (
    <AppPressable
      onPress={() => openVideo(sortedVideos, index)}
      style={[
        styles.videoTile,
        { width: TILE_WIDTH, height: TILE_HEIGHT },
        index % NUM_COLUMNS !== NUM_COLUMNS - 1 && { marginRight: GRID_GAP },
      ]}
    >
      <SmartVideoThumbnail
        thumbnailUrl={item.thumbnail_url}
        fileUrl={item.file_url}
        imageStyle={StyleSheet.absoluteFill}
        fallbackStyle={styles.videoTileFallback}
      />
      {/* Play icon overlay */}
      <View style={styles.playOverlay}>
        <Ionicons name="play" size={22} color="rgba(255,255,255,0.6)" />
      </View>
      {/* Stats overlay at bottom */}
      <View style={styles.tileStatsContainer}>
        <View style={styles.tileStatsBubble}>
          <View style={styles.tileStatRow}>
            <Ionicons name="thumbs-up-outline" size={12} color={AppColors.textPrimary} />
            <Text style={styles.tileStatText}>{item.likes || 0}</Text>
          </View>
          <View style={styles.tileStatRow}>
            <Ionicons name="thumbs-down-outline" size={12} color={AppColors.textPrimary} />
            <Text style={styles.tileStatText}>{item.dislikes || 0}</Text>
          </View>
          <View style={styles.tileStatRow}>
            <Ionicons name="eye-outline" size={12} color={AppColors.textPrimary} />
            <Text style={styles.tileStatText}>{item.views || 0}</Text>
          </View>
        </View>
      </View>
    </AppPressable>
  );

  return (
    <SafeAreaView style={styles.screenContainer} edges={['top']}>
      <FlatList
        data={sortedVideos}
        keyExtractor={(v) => v.id}
        numColumns={NUM_COLUMNS}
        ListHeaderComponent={renderHeader}
        renderItem={renderVideoTile}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridRow}
      />

      {/* Report Modal */}
      <Modal visible={reportModal} transparent animationType="fade" onRequestClose={() => setReportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report User</Text>

            <Text style={styles.inputLabel}>Reason</Text>
            <AppPressable onPress={() => setReportReasonPicker(true)} style={styles.selectButton}>
              <Text style={[styles.selectButtonText, !reportReason && { opacity: 0.5 }]}>
                {reportReason || '-- Select a reason --'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={AppColors.textSecondary} />
            </AppPressable>

            <Text style={styles.inputLabel}>Details (optional)</Text>
            <TextInput
              placeholder="Provide additional details..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={reportDesc}
              onChangeText={setReportDesc}
              style={styles.textArea}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <AppPressable
                onPress={() => setReportModal(false)}
                disabled={reportSubmitting}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </AppPressable>
              <AppPressable
                onPress={doReportUser}
                disabled={reportSubmitting || !reportReason}
                style={[
                  styles.submitReportButton,
                  (reportSubmitting || !reportReason) && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.submitReportText}>
                  {reportSubmitting ? 'Reporting...' : 'Report User'}
                </Text>
              </AppPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reason picker modal */}
      <Modal visible={reportReasonPicker} transparent animationType="fade" onRequestClose={() => setReportReasonPicker(false)}>
        <AppPressable style={styles.modalOverlay} onPress={() => setReportReasonPicker(false)}>
          <View style={styles.reasonPickerCard}>
            <Text style={styles.modalTitle}>Select Reason</Text>
            {REPORT_REASONS.map((reason) => (
              <AppPressable
                key={reason}
                onPress={() => { setReportReason(reason); setReportReasonPicker(false); }}
                style={[styles.reasonOption, reportReason === reason && styles.reasonOptionActive]}
              >
                <Text style={styles.reasonOptionText}>{reason}</Text>
                {reportReason === reason && (
                  <Ionicons name="checkmark" size={18} color={AppColors.accentPrimary} />
                )}
              </AppPressable>
            ))}
          </View>
        </AppPressable>
      </Modal>

      {/* Sort Picker Modal */}
      <Modal visible={sortPickerOpen} transparent animationType="fade" onRequestClose={() => setSortPickerOpen(false)}>
        <AppPressable style={styles.dropdownBackdrop} onPress={() => setSortPickerOpen(false)}>
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownSheetTitle}>Sort by</Text>
            {SORT_OPTIONS.map((opt) => (
              <AppPressable
                key={opt.value}
                onPress={() => { setSortMode(opt.value); setSortPickerOpen(false); }}
                style={[styles.dropdownItem, sortMode === opt.value && styles.dropdownItemActive]}
              >
                <Text style={[styles.dropdownItemText, sortMode === opt.value && styles.dropdownItemTextActive]}>{opt.label}</Text>
                {sortMode === opt.value && <Ionicons name="checkmark" size={18} color={AppColors.accentPrimary} />}
              </AppPressable>
            ))}
          </View>
        </AppPressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: AppColors.backgroundPrimary,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  headerContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  avatarBorder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  usernameText: {
    color: AppColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '600',
  },
  statDot: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
  websiteLink: {
    color: '#a6d3ff',
    fontSize: 13,
    textDecorationLine: 'underline',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  followButton: {
    backgroundColor: AppColors.accentPrimary,
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  followingButtonBg: {
    backgroundColor: '#444',
  },
  followButtonText: {
    color: AppColors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  reportButton: {
    backgroundColor: '#444',
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportButtonText: {
    color: AppColors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  sortContainer: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  sortPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sortPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sortPillActive: {
    backgroundColor: AppColors.accentPrimary,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  sortPillText: {
    color: AppColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: AppColors.borderSecondary,
    backgroundColor: AppColors.backgroundCard,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: '100%',
  },
  dropdownButtonText: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dropdownSheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
  },
  dropdownSheetTitle: {
    color: AppColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(123,63,228,0.12)',
  },
  dropdownItemText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  dropdownItemTextActive: {
    color: AppColors.accentPrimary,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
  },
  gridContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 20,
  },
  gridRow: {
    marginBottom: GRID_GAP,
  },
  videoTile: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#181818',
  },
  videoTileFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileStatsContainer: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tileStatsBubble: {
    minWidth: 80,
    borderRadius: 10,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(16,16,16,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tileStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tileStatText: {
    color: AppColors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  // Report modal
  modalOverlay: {
    flex: 1,
    backgroundColor: AppColors.backgroundModal,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    color: AppColors.textLabel,
    marginBottom: 5,
  },
  selectButton: {
    backgroundColor: AppColors.backgroundInput,
    borderWidth: 1,
    borderColor: AppColors.borderInput,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectButtonText: {
    color: AppColors.textPrimary,
    fontSize: 14,
  },
  textArea: {
    backgroundColor: AppColors.backgroundInput,
    borderWidth: 1,
    borderColor: AppColors.borderInput,
    borderRadius: 12,
    padding: 12,
    color: AppColors.textPrimary,
    fontSize: 14,
    minHeight: 80,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  submitReportButton: {
    flex: 2,
    padding: 13,
    borderRadius: 12,
    backgroundColor: AppColors.dangerMuted,
    alignItems: 'center',
  },
  submitReportText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  reasonPickerCard: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 380,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  reasonOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  reasonOptionText: {
    color: AppColors.textPrimary,
    fontSize: 14,
  },
});
