import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { toast } from '../../components/Toast';
import type { PaginatedResponse, Video } from '../../types';

const GRID_COLUMN_COUNT = 3;
const GRID_GAP = 8;
const HORIZONTAL_PADDING = 12;

export default function SharedVideosScreen() {
  const navigation = useNavigation();
  const loggedIn = useAppStore((s) => s.loggedIn);
  const setFeedVideos = useAppStore((s) => s.setFeedVideos);
  const setFeedIndex = useAppStore((s) => s.setFeedIndex);
  const setCurrentVideo = useAppStore((s) => s.setCurrentVideo);
  const setFeedSavedContext = useAppStore((s) => s.setFeedSavedContext);
  const setFeedCreatorContext = useAppStore((s) => s.setFeedCreatorContext);

  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [loadErrorText, setLoadErrorText] = useState('');
  const [sharedVideos, setSharedVideos] = useState<Video[]>([]);

  const tileWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    return Math.floor((screenWidth - (HORIZONTAL_PADDING * 2) - (GRID_GAP * (GRID_COLUMN_COUNT - 1))) / GRID_COLUMN_COUNT);
  }, []);

  const loadSharedVideos = useCallback(async () => {
    setIsLoadingVideos(true);
    setLoadErrorText('');
    const response = await apiFetch<PaginatedResponse<Video>>('/videos/shared?page=1&limit=120');
    if (!response.success || !response.data) {
      setLoadErrorText(response.error || 'Could not load shared videos.');
      setSharedVideos([]);
      setIsLoadingVideos(false);
      return;
    }
    setSharedVideos(response.data.items || []);
    setIsLoadingVideos(false);
  }, []);

  useEffect(() => {
    void loadSharedVideos();
  }, [loadSharedVideos]);

  const onOpenVideoInFeed = (index: number) => {
    const target = sharedVideos[index];
    if (!target) return;
    setFeedVideos(sharedVideos);
    setFeedIndex(index);
    setCurrentVideo(target);
    setFeedCreatorContext(null);
    setFeedSavedContext(false);
    navigation.navigate('MainTabs' as never);
  };

  const onRemoveShared = async (index: number, videoId: string, shareId?: string) => {
    const endpoint = shareId
      ? '/videos/shared/' + shareId
      : '/videos/' + videoId + '/share';
    const data = await apiFetch<{ removed: boolean }>(endpoint, { method: 'DELETE' });
    if (!data.success) {
      toast('Error: ' + (data.error || 'Could not remove'));
      return;
    }
    setSharedVideos((prev) => prev.filter((_, i) => i !== index));
    toast('Removed from shared');
  };

  return (
    <View style={styles.screenContainer}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitleText}>Videos you shared</Text>
        <Text style={styles.headerSubtitleText}>{sharedVideos.length} items</Text>
      </View>

      {isLoadingVideos ? (
        <View style={styles.centerStateContainer}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
        </View>
      ) : loadErrorText ? (
        <View style={styles.centerStateContainer}>
          <Text style={styles.errorText}>{loadErrorText}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadSharedVideos()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sharedVideos}
          keyExtractor={(v, i) => `${v.id}-${i}`}
          numColumns={GRID_COLUMN_COUNT}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.gridContentContainer}
          columnWrapperStyle={styles.gridColumnWrapper}
          renderItem={({ item: videoItem, index }) => (
            <Pressable
              onPress={() => onOpenVideoInFeed(index)}
              style={[styles.videoTileContainer, { width: tileWidth, height: tileWidth * 1.45 }]}
            >
              {videoItem.thumbnail_url ? (
                <Image source={{ uri: videoItem.thumbnail_url }} style={styles.videoTileImage} />
              ) : (
                <View style={styles.videoTileFallback} />
              )}
              <View style={styles.videoTileOverlayBg} />

              {/* Play icon */}
              <View style={styles.playIconContainer}>
                <Ionicons name="play" size={22} color="rgba(255,255,255,0.95)" />
              </View>

              {/* Remove button */}
              <Pressable
                onPress={() => void onRemoveShared(index, videoItem.id, videoItem.share_id)}
                style={styles.removeButton}
              >
                <Ionicons name="trash-outline" size={14} color={AppColors.textPrimary} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={(
            <View style={styles.centerStateContainer}>
              <Text style={styles.emptyText}>Nothing here yet</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: AppColors.backgroundPrimary,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.borderPrimary,
  },
  headerTitleText: {
    color: AppColors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitleText: {
    color: AppColors.textSecondary,
    marginTop: 3,
    fontSize: 13,
  },
  gridContentContainer: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 10,
    gap: GRID_GAP,
  },
  gridColumnWrapper: {
    gap: GRID_GAP,
  },
  videoTileContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1c1c1c',
  },
  videoTileImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  videoTileFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#181818',
  },
  videoTileOverlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  playIconContainer: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
  },
  removeButton: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  errorText: {
    color: '#ffb4b4',
    textAlign: 'center',
    fontSize: 13,
  },
  emptyText: {
    color: AppColors.textSecondary,
    textAlign: 'center',
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: AppColors.accentPrimary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: AppColors.textPrimary,
    fontWeight: '700',
  },
});
