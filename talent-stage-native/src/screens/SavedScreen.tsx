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
import { AppColors } from '../theme/colors';
import { apiFetch } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { toast } from '../components/Toast';
import type { PaginatedResponse, Video } from '../types';

const GRID_COLUMN_COUNT = 3;
const GRID_GAP = 8;
const HORIZONTAL_PADDING = 12;

export default function SavedScreen() {
  const navigation = useNavigation();
  const loggedIn = useAppStore((s) => s.loggedIn);
  const setFeedVideos = useAppStore((s) => s.setFeedVideos);
  const setFeedIndex = useAppStore((s) => s.setFeedIndex);
  const setCurrentVideo = useAppStore((s) => s.setCurrentVideo);
  const setFeedSavedContext = useAppStore((s) => s.setFeedSavedContext);
  const setFeedCreatorContext = useAppStore((s) => s.setFeedCreatorContext);

  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [loadErrorText, setLoadErrorText] = useState('');
  const [savedVideos, setSavedVideos] = useState<Video[]>([]);

  const tileWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    return Math.floor((screenWidth - (HORIZONTAL_PADDING * 2) - (GRID_GAP * (GRID_COLUMN_COUNT - 1))) / GRID_COLUMN_COUNT);
  }, []);

  const loadSavedVideos = useCallback(async () => {
    if (!loggedIn) return;
    setIsLoadingSaved(true);
    setLoadErrorText('');
    const response = await apiFetch<PaginatedResponse<Video>>('/videos/saved?page=1&limit=120');
    if (!response.success || !response.data) {
      setSavedVideos([]);
      setLoadErrorText(response.error || 'Could not load saved videos.');
      setIsLoadingSaved(false);
      return;
    }
    setSavedVideos(response.data.items || []);
    setIsLoadingSaved(false);
  }, [loggedIn]);

  useEffect(() => {
    if (loggedIn) {
      void loadSavedVideos();
    }
  }, [loadSavedVideos, loggedIn]);

  const onRemoveSavedVideo = async (videoId: string) => {
    const response = await apiFetch<{ saved: boolean }>(`/videos/${videoId}/save`, { method: 'POST' });
    if (!response.success) {
      toast('Error: ' + (response.error || 'Could not remove saved video'));
      return;
    }
    setSavedVideos((prev) => prev.filter((v) => v.id !== videoId));
    toast('Removed from saved');
  };

  const onOpenSavedInFeed = (index: number) => {
    const target = savedVideos[index];
    if (!target) return;
    setFeedVideos(savedVideos);
    setFeedIndex(index);
    setCurrentVideo(target);
    setFeedCreatorContext(null);
    setFeedSavedContext(true);
    navigation.navigate('Home' as never);
  };

  if (!loggedIn) {
    return (
      <View style={styles.centerStateContainer}>
        <Text style={styles.centerStateTitleText}>Saved videos</Text>
        <Text style={styles.centerStateSubtitleText}>Sign in to keep and review your saved videos.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitleText}>Saved videos</Text>
        <Text style={styles.headerSubtitleText}>{savedVideos.length} items</Text>
      </View>

      {isLoadingSaved ? (
        <View style={styles.centerStateContainer}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
        </View>
      ) : loadErrorText ? (
        <View style={styles.centerStateContainer}>
          <Text style={styles.errorText}>{loadErrorText}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadSavedVideos()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={savedVideos}
          keyExtractor={(v) => v.id}
          numColumns={GRID_COLUMN_COUNT}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.gridContentContainer}
          columnWrapperStyle={styles.gridColumnWrapper}
          renderItem={({ item: videoItem, index }) => (
            <Pressable
              onPress={() => onOpenSavedInFeed(index)}
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
              <Pressable onPress={() => void onRemoveSavedVideo(videoItem.id)} style={styles.removeSavedButton}>
                <Ionicons name="trash-outline" size={14} color={AppColors.textPrimary} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={(
            <View style={styles.centerStateContainer}>
              <Text style={styles.centerStateSubtitleText}>Nothing here yet</Text>
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
  removeSavedButton: {
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
    paddingHorizontal: 24,
    gap: 12,
    paddingVertical: 40,
  },
  centerStateTitleText: {
    color: AppColors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  centerStateSubtitleText: {
    color: AppColors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
  },
  errorText: {
    color: '#ffb4b4',
    textAlign: 'center',
    fontSize: 13,
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
