import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../theme/colors';
import { apiFetch } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { toast } from '../components/Toast';
import { TALENT_TYPES, type PaginatedResponse, type Video } from '../types';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const GRID_COLUMN_COUNT = 3;
const GRID_GAP = 8;
const HORIZONTAL_PADDING = 12;

type PickedVideoAsset = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

export default function UploadScreen() {
  const navigation = useNavigation();
  const loggedIn = useAppStore((s) => s.loggedIn);
  const user = useAppStore((s) => s.user);
  const uploadInProgress = useAppStore((s) => s.uploadInProgress);
  const uploadProgressValue = useAppStore((s) => s.uploadProgressValue);
  const setUploadStatus = useAppStore((s) => s.setUploadStatus);
  const setFeedVideos = useAppStore((s) => s.setFeedVideos);
  const setFeedIndex = useAppStore((s) => s.setFeedIndex);
  const setCurrentVideo = useAppStore((s) => s.setCurrentVideo);
  const setFeedCreatorContext = useAppStore((s) => s.setFeedCreatorContext);
  const setFeedSavedContext = useAppStore((s) => s.setFeedSavedContext);

  const [myVideos, setMyVideos] = useState<Video[]>([]);
  const [isLoadingMyVideos, setIsLoadingMyVideos] = useState(false);
  const [loadErrorText, setLoadErrorText] = useState('');
  const [showPostForm, setShowPostForm] = useState(false);
  const [selectedVideoFile, setSelectedVideoFile] = useState<PickedVideoAsset | null>(null);
  const [titleText, setTitleText] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const tileWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    return Math.floor((screenWidth - (HORIZONTAL_PADDING * 2) - (GRID_GAP * (GRID_COLUMN_COUNT - 1))) / GRID_COLUMN_COUNT);
  }, []);

  const resetPostForm = useCallback(() => {
    setSelectedVideoFile(null);
    setTitleText('');
    setDescriptionText('');
    setSelectedCategoryName('');
  }, []);

  const loadMyVideos = useCallback(async () => {
    if (!user?.id) return;
    setIsLoadingMyVideos(true);
    setLoadErrorText('');
    const response = await apiFetch<PaginatedResponse<Video>>(`/videos/user/${user.id}?page=1&limit=120`);
    if (!response.success || !response.data) {
      setMyVideos([]);
      setLoadErrorText(response.error || 'Could not load your videos.');
      setIsLoadingMyVideos(false);
      return;
    }
    setMyVideos(response.data.items || []);
    setIsLoadingMyVideos(false);
  }, [user?.id]);

  useEffect(() => {
    if (loggedIn) {
      void loadMyVideos();
    } else {
      setMyVideos([]);
    }
  }, [loadMyVideos, loggedIn]);

  const onPickVideoFile = async () => {
    if (!loggedIn) { toast('Sign in to upload'); return; }
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const picked = result.assets[0];
    const nextFile: PickedVideoAsset = {
      uri: picked.uri,
      name: picked.name || `video-${Date.now()}.mp4`,
      mimeType: picked.mimeType || 'video/mp4',
      size: picked.size || 0,
    };

    setSelectedVideoFile(nextFile);
    setTitleText(
      nextFile.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim()
        .slice(0, TITLE_MAX),
    );
    setShowPostForm(true);
  };

  const onPostVideo = async () => {
    if (!loggedIn) { toast('Sign in first'); return; }

    const cleanTitle = titleText.trim();
    const cleanDescription = descriptionText.trim();

    if (!cleanTitle) { toast('Add a title first'); return; }
    if (cleanTitle.length > TITLE_MAX) { toast(`Title max ${TITLE_MAX} characters`); return; }
    if (cleanDescription.length > DESCRIPTION_MAX) { toast(`Description max ${DESCRIPTION_MAX} characters`); return; }
    if (!selectedCategoryName) { toast('Select a category first'); return; }
    if (!selectedVideoFile) { toast('Pick a video first'); return; }
    if (uploadInProgress) return;

    try {
      toast('Uploading...');
      setUploadStatus(true, 15);

      const uploadFormData = new FormData();
      uploadFormData.append('video', {
        uri: selectedVideoFile.uri,
        type: selectedVideoFile.mimeType,
        name: selectedVideoFile.name,
      } as unknown as Blob);
      uploadFormData.append('title', cleanTitle);
      uploadFormData.append('description', cleanDescription);
      uploadFormData.append('talent_type', selectedCategoryName);
      uploadFormData.append('is_public', '1');

      const response = await apiFetch<Video>('/videos', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!response.success) {
        setUploadStatus(false, 0);
        toast('Error: ' + (response.error || 'Upload failed'));
        return;
      }

      setUploadStatus(true, 100);
      setTimeout(() => setUploadStatus(false, 0), 300);

      resetPostForm();
      setShowPostForm(false);
      toast('Video posted!');
      await loadMyVideos();
    } catch (error) {
      setUploadStatus(false, 0);
      toast('Error: ' + ((error as Error).message || 'Upload failed'));
    }
  };

  const onDeleteVideo = (videoId: string) => {
    Alert.alert('Delete Video', 'Delete this video?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const response = await apiFetch(`/videos/${videoId}`, { method: 'DELETE' });
          if (!response.success) {
            toast('Error: ' + (response.error || 'Could not delete video'));
            return;
          }
          setMyVideos((prev) => prev.filter((v) => v.id !== videoId));
          toast('Video deleted');
        },
      },
    ]);
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleVideos = normalizedSearch
    ? myVideos.filter((v) => {
        const haystack = [
          v.title || '',
          v.description || '',
          Array.isArray(v.tags) ? v.tags.join(' ') : '',
          v.talent_type || '',
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : myVideos;

  const onOpenVideoInFeed = (index: number) => {
    const target = visibleVideos[index];
    if (!target) return;
    setFeedVideos(visibleVideos);
    setFeedIndex(index);
    setCurrentVideo(target);
    setFeedCreatorContext(null);
    setFeedSavedContext(false);
    navigation.navigate('Home' as never);
  };

  if (!loggedIn) {
    return (
      <View style={styles.centerStateContainer}>
        <Text style={styles.centerStateTitleText}>Upload</Text>
        <Text style={styles.centerStateSubtitleText}>Sign in to upload and manage your videos.</Text>
      </View>
    );
  }

  if (showPostForm) {
    return (
      <View style={styles.screenContainer}>
        <View style={styles.headerContainer}>
          <Pressable onPress={() => { setShowPostForm(false); resetPostForm(); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={AppColors.textPrimary} />
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitleText}>New Post</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.formContainer}>
          {/* Pick buttons */}
          <View style={styles.pickRow}>
            <Pressable onPress={() => void onPickVideoFile()} style={styles.pickBtn}>
              <Ionicons name="cloud-upload-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.pickBtnText}>Pick from Gallery</Text>
            </Pressable>
          </View>

          <TextInput
            value={titleText}
            onChangeText={(t) => setTitleText(t.slice(0, TITLE_MAX))}
            placeholder="Title..."
            placeholderTextColor={AppColors.textMuted}
            style={styles.formInputField}
            maxLength={TITLE_MAX}
          />

          <TextInput
            value={descriptionText}
            onChangeText={(t) => setDescriptionText(t.slice(0, DESCRIPTION_MAX))}
            placeholder="Description..."
            placeholderTextColor={AppColors.textMuted}
            multiline
            style={[styles.formInputField, styles.formInputFieldMultiline]}
            maxLength={DESCRIPTION_MAX}
          />

          <Text style={styles.formLabelText}>Category</Text>
          <View style={styles.categoryChipsContainer}>
            {TALENT_TYPES.map((categoryName) => {
              const isActive = selectedCategoryName === categoryName;
              return (
                <Pressable
                  key={categoryName}
                  onPress={() => setSelectedCategoryName(categoryName)}
                  style={[styles.categoryChipButton, isActive && styles.categoryChipButtonActive]}
                >
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>{categoryName}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.fileNameRow}>
            <Ionicons name="document-outline" size={14} color={AppColors.textSecondary} />
            <Text style={styles.fileNameText} numberOfLines={1}>
              {selectedVideoFile?.name || 'No file selected'}
            </Text>
          </View>

          <Pressable onPress={() => void onPostVideo()} disabled={uploadInProgress} style={styles.submitButton}>
            {uploadInProgress ? (
              <View style={styles.uploadProgressRowContainer}>
                <ActivityIndicator size="small" color={AppColors.textPrimary} />
                <Text style={styles.submitButtonText}>Uploading {uploadProgressValue}%</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>Post Video</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      {/* Upload actions header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitleText}>Upload</Text>
        <Pressable onPress={() => { resetPostForm(); setShowPostForm(true); }} style={styles.newPostButton}>
          <Ionicons name="add" size={16} color={AppColors.textPrimary} />
          <Text style={styles.newPostButtonText}>New post</Text>
        </Pressable>
      </View>

      {/* Upload action buttons */}
      <View style={styles.uploadActionsRow}>
        <Pressable onPress={() => void onPickVideoFile()} style={styles.uploadActionBtn}>
          <View style={styles.uploadActionIcon}>
            <Ionicons name="images-outline" size={24} color={AppColors.textPrimary} />
          </View>
          <Text style={styles.uploadActionLabel}>Gallery</Text>
        </Pressable>
        <Pressable onPress={() => { resetPostForm(); setShowPostForm(true); }} style={styles.uploadActionBtn}>
          <View style={styles.uploadActionIcon}>
            <Ionicons name="add" size={28} color={AppColors.textPrimary} />
          </View>
          <Text style={styles.uploadActionLabel}>Post</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={16} color={AppColors.textMuted} />
        <TextInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search your videos..."
          placeholderTextColor={AppColors.textMuted}
          style={styles.searchInput}
        />
      </View>

      <Text style={styles.sectionTitle}>Your videos</Text>

      {isLoadingMyVideos ? (
        <View style={styles.centerStateContainer}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
        </View>
      ) : loadErrorText ? (
        <View style={styles.centerStateContainer}>
          <Text style={styles.errorText}>{loadErrorText}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadMyVideos()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visibleVideos}
          keyExtractor={(v) => v.id}
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
              <View style={styles.videoTileOverlay}>
                <View style={styles.videoStatsOverlay}>
                  <View style={styles.videoStatRow}>
                    <Ionicons name="thumbs-up-outline" size={12} color="#fff" />
                    <Text style={styles.videoStatText}>{videoItem.likes || 0}</Text>
                  </View>
                  <View style={styles.videoStatRow}>
                    <Ionicons name="thumbs-down-outline" size={12} color="#fff" />
                    <Text style={styles.videoStatText}>{videoItem.dislikes || 0}</Text>
                  </View>
                  <View style={styles.videoStatRow}>
                    <Ionicons name="eye-outline" size={12} color="#fff" />
                    <Text style={styles.videoStatText}>{videoItem.views || 0}</Text>
                  </View>
                </View>
              </View>
              <Pressable onPress={() => onDeleteVideo(videoItem.id)} style={styles.deleteTileButton}>
                <Ionicons name="trash-outline" size={14} color={AppColors.textPrimary} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={
            myVideos.length === 0 ? (
              <View style={styles.centerStateContainer}>
                <Text style={styles.centerStateSubtitleText}>Nothing here yet</Text>
              </View>
            ) : (
              <View style={styles.centerStateContainer}>
                <Text style={styles.centerStateSubtitleText}>No videos found</Text>
              </View>
            )
          }
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleText: {
    color: AppColors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backBtnText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  newPostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppColors.borderSecondary,
    backgroundColor: AppColors.backgroundCard,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  newPostButtonText: {
    color: AppColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },

  // Upload actions
  uploadActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.borderPrimary,
  },
  uploadActionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  uploadActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadActionLabel: {
    color: AppColors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },

  // Form
  formContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  pickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: AppColors.borderSecondary,
    backgroundColor: AppColors.backgroundCard,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickBtnText: {
    color: AppColors.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  formInputField: {
    borderWidth: 1,
    borderColor: AppColors.borderSecondary,
    backgroundColor: AppColors.backgroundCard,
    borderRadius: 12,
    color: AppColors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  formInputFieldMultiline: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  formLabelText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  categoryChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChipButton: {
    borderWidth: 1,
    borderColor: AppColors.borderSecondary,
    borderRadius: 999,
    backgroundColor: '#141414',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  categoryChipButtonActive: {
    borderColor: AppColors.accentPrimary,
    backgroundColor: AppColors.accentChip,
  },
  categoryChipText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: AppColors.textPrimary,
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  fileNameText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  submitButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: AppColors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  uploadProgressRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Grid
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
  videoTileOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoStatsOverlay: {
    minWidth: 80,
    borderRadius: 10,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(16,16,16,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  videoStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoStatText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteTileButton: {
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

  // Center states
  centerStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
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
