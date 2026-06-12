import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppPressable from '../components/AppPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../theme/colors';
import { apiFetch } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { toast } from '../components/Toast';
import SmartVideoThumbnail from '../components/SmartVideoThumbnail';
import { TALENT_TYPES, type PaginatedResponse, type Video } from '../types';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const GRID_COLUMN_COUNT = 3;
const GRID_GAP = 8;
const HORIZONTAL_PADDING = 12;
const STREAM_COMPLETE_MAX_ATTEMPTS = 10;
const STREAM_COMPLETE_WAIT_MS = 1500;

type PickedVideoAsset = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const uploadBinaryWithProgress = (
  method: 'PUT' | 'POST',
  targetUrl: string,
  bodyPayload: Blob,
  contentType: string,
  onProgress: (value: number) => void,
): Promise<{ success: boolean; status?: number; error?: string }> => (
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, targetUrl);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      onProgress(pct);
    };

    xhr.onerror = () => resolve({ success: false, error: 'Cannot reach Cloudflare upload endpoint' });
    xhr.onabort = () => resolve({ success: false, error: 'Upload cancelled' });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ success: true, status: xhr.status });
        return;
      }
      resolve({ success: false, status: xhr.status, error: `Direct upload failed: HTTP ${xhr.status}` });
    };

    xhr.send(bodyPayload);
  })
);

const uploadMultipartWithProgress = (
  targetUrl: string,
  asset: PickedVideoAsset,
  onProgress: (value: number) => void,
): Promise<{ success: boolean; status?: number; error?: string }> => (
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', targetUrl);
    const form = new FormData();
    form.append('file', {
      uri: asset.uri,
      type: asset.mimeType || 'application/octet-stream',
      name: asset.name || `upload-${Date.now()}.mp4`,
    } as unknown as Blob);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      onProgress(pct);
    };

    xhr.onerror = () => resolve({ success: false, error: 'Cannot reach Cloudflare upload endpoint' });
    xhr.onabort = () => resolve({ success: false, error: 'Upload cancelled' });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ success: true, status: xhr.status });
        return;
      }
      resolve({ success: false, status: xhr.status, error: `Direct upload failed: HTTP ${xhr.status}` });
    };

    xhr.send(form);
  })
);

const uploadToCloudflareStreamWithProgress = async (
  uploadUrl: string,
  asset: PickedVideoAsset,
  onProgress: (value: number) => void,
): Promise<{ success: boolean; error?: string }> => {
  let blobPayload: Blob | null = null;
  try {
    const response = await fetch(asset.uri);
    blobPayload = await response.blob();
  } catch {
    blobPayload = null;
  }

  if (blobPayload) {
    const putResult = await uploadBinaryWithProgress(
      'PUT',
      uploadUrl,
      blobPayload,
      asset.mimeType || 'application/octet-stream',
      onProgress,
    );
    if (putResult.success) return { success: true };

    const postResult = await uploadBinaryWithProgress(
      'POST',
      uploadUrl,
      blobPayload,
      asset.mimeType || 'application/octet-stream',
      onProgress,
    );
    if (postResult.success) return { success: true };
  }

  const multipartResult = await uploadMultipartWithProgress(uploadUrl, asset, onProgress);
  if (multipartResult.success) return { success: true };
  return { success: false, error: multipartResult.error || 'Cloudflare direct upload failed' };
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
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const streamThumbnailRefreshAttemptsById = useRef<Map<string, number>>(new Map());
  const streamThumbnailRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (streamThumbnailRetryTimerRef.current) {
      clearTimeout(streamThumbnailRetryTimerRef.current);
      streamThumbnailRetryTimerRef.current = null;
    }
    setIsLoadingMyVideos(true);
    setLoadErrorText('');
    const response = await apiFetch<PaginatedResponse<Video>>(`/videos/user/${user.id}?page=1&limit=120`);
    if (!response.success || !response.data) {
      setMyVideos([]);
      setLoadErrorText(response.error || 'Could not load your videos.');
      setIsLoadingMyVideos(false);
      return;
    }
    const loadedVideos = response.data.items || [];
    setMyVideos(loadedVideos);
    setIsLoadingMyVideos(false);

    loadedVideos.forEach((videoItem) => {
      const maybeStream = /videodelivery\.net|cfstream:/i.test(String(videoItem.file_url || ''));
      const shouldKeepRetryState = maybeStream && (!Boolean(videoItem.is_public) || !String(videoItem.thumbnail_url || '').trim());
      if (!shouldKeepRetryState) {
        streamThumbnailRefreshAttemptsById.current.delete(videoItem.id);
      }
    });

    const videosMissingStreamThumbnail = loadedVideos
      .filter((videoItem) => {
        const maybeStream = /videodelivery\.net|cfstream:/i.test(String(videoItem.file_url || ''));
        const missingThumb = !String(videoItem.thumbnail_url || '').trim();
        const hiddenVideo = !Boolean(videoItem.is_public);
        const attempts = streamThumbnailRefreshAttemptsById.current.get(videoItem.id) || 0;
        return maybeStream && attempts < 6 && (missingThumb || hiddenVideo);
      })
      .slice(0, 8);

    if (!videosMissingStreamThumbnail.length) return;

    videosMissingStreamThumbnail.forEach((videoItem) => {
      const attempts = streamThumbnailRefreshAttemptsById.current.get(videoItem.id) || 0;
      streamThumbnailRefreshAttemptsById.current.set(videoItem.id, attempts + 1);
    });

    if (streamThumbnailRetryTimerRef.current) {
      clearTimeout(streamThumbnailRetryTimerRef.current);
    }
    void (async () => {
      let didUpdateAtLeastOne = false;
      for (const videoItem of videosMissingStreamThumbnail) {
        const completeResponse = await apiFetch<{ ready_to_stream?: boolean }>('/videos/stream/complete', {
          method: 'POST',
          body: { video_id: videoItem.id, publish: true },
        });
        if (completeResponse.success) didUpdateAtLeastOne = true;
        await wait(250);
      }

      const shouldRetry = videosMissingStreamThumbnail.some((videoItem) => {
        const attempts = streamThumbnailRefreshAttemptsById.current.get(videoItem.id) || 0;
        return attempts < 6;
      });

      if (didUpdateAtLeastOne || shouldRetry) {
        streamThumbnailRetryTimerRef.current = setTimeout(() => {
          void loadMyVideos();
        }, didUpdateAtLeastOne ? 1200 : 2200);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (streamThumbnailRetryTimerRef.current) {
        clearTimeout(streamThumbnailRetryTimerRef.current);
        streamThumbnailRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (loggedIn) {
      void loadMyVideos();
    } else {
      setMyVideos([]);
    }
  }, [loadMyVideos, loggedIn]);

  const handlePickedAsset = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    const fileName = asset.fileName || asset.uri.split('/').pop() || `video-${Date.now()}.mp4`;
    const nextFile: PickedVideoAsset = {
      uri: asset.uri,
      name: fileName,
      mimeType: asset.mimeType || 'video/mp4',
      size: asset.fileSize || 0,
    };
    setSelectedVideoFile(nextFile);
    setTitleText(
      fileName
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim()
        .slice(0, TITLE_MAX),
    );
    setShowPostForm(true);
  }, []);

  const onPickVideoFromGallery = async () => {
    if (!loggedIn) { toast('Sign in to upload'); return; }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library to upload videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      quality: 0.5,
      videoMaxDuration: 300,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    });
    if (result.canceled || !result.assets?.length) return;
    handlePickedAsset(result.assets[0]);
  };

  const onRecordVideoFromCamera = async () => {
    if (!loggedIn) { toast('Sign in to upload'); return; }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow camera access to record videos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      quality: 0.5,
      videoMaxDuration: 300,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    });
    if (result.canceled || !result.assets?.length) return;
    handlePickedAsset(result.assets[0]);
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
      setUploadStatus(true, 0);

      const prepResponse = await apiFetch<{
        video_id: string;
        upload_url: string;
      }>('/videos/stream/direct-upload-url', {
        method: 'POST',
        body: {
          title: cleanTitle,
          description: cleanDescription,
          talent_type: selectedCategoryName,
          original_name: selectedVideoFile.name,
          file_size: Math.max(0, Number(selectedVideoFile.size || 0)),
        },
      });

      if (!prepResponse.success || !prepResponse.data?.video_id || !prepResponse.data?.upload_url) {
        const prepError = prepResponse.error || 'Could not create Cloudflare upload URL';
        if (/route not found/i.test(prepError)) {
          throw new Error('Stream upload route missing on API. Deploy latest backend with /api/videos/stream/* routes.');
        }
        throw new Error(prepError);
      }

      const directUploadResult = await uploadToCloudflareStreamWithProgress(
        prepResponse.data.upload_url,
        selectedVideoFile,
        (progressValue) => setUploadStatus(true, Math.min(progressValue, 99)),
      );

      if (!directUploadResult.success) {
        throw new Error(directUploadResult.error || 'Cloudflare direct upload failed');
      }

      let readyToStream = false;
      for (let attemptIndex = 0; attemptIndex < STREAM_COMPLETE_MAX_ATTEMPTS; attemptIndex += 1) {
        const completeResponse = await apiFetch<{ ready_to_stream?: boolean }>('/videos/stream/complete', {
          method: 'POST',
          body: {
            video_id: prepResponse.data.video_id,
            publish: true,
          },
        });

        if (!completeResponse.success) {
          if (/route not found/i.test(completeResponse.error || '')) {
            throw new Error('Stream complete route missing on API. Deploy latest backend with /api/videos/stream/* routes.');
          }
          break;
        }
        if (completeResponse.data?.ready_to_stream) {
          readyToStream = true;
          break;
        }
        await wait(STREAM_COMPLETE_WAIT_MS);
      }

      setUploadStatus(true, 100);
      setTimeout(() => setUploadStatus(false, 0), 300);

      resetPostForm();
      setShowPostForm(false);
      toast(readyToStream ? 'Video posted!' : 'Uploaded. Video is processing...');
      await loadMyVideos();

      if (!readyToStream) {
        setTimeout(() => { void loadMyVideos(); }, 6000);
      }
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
      <SafeAreaView style={styles.screenContainer} edges={['top']}>
        <View style={styles.headerContainer}>
          <AppPressable onPress={() => { setShowPostForm(false); resetPostForm(); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={AppColors.textPrimary} />
            <Text style={styles.backBtnText}>Back</Text>
          </AppPressable>
          <Text style={styles.headerTitleText}>New Post</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.formContainer}>
          {/* Pick buttons */}
          <View style={styles.pickRow}>
            <AppPressable onPress={() => void onPickVideoFromGallery()} style={styles.pickBtn}>
              <Ionicons name="images-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.pickBtnText}>Gallery</Text>
            </AppPressable>
            <AppPressable onPress={() => void onRecordVideoFromCamera()} style={styles.pickBtn}>
              <Ionicons name="videocam-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.pickBtnText}>Camera</Text>
            </AppPressable>
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
          <AppPressable onPress={() => setCategoryPickerOpen(true)} style={styles.dropdownButton}>
            <Text style={[styles.dropdownButtonText, !selectedCategoryName && { color: AppColors.textMuted }]}>
              {selectedCategoryName || 'Select a category...'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={AppColors.textSecondary} />
          </AppPressable>

          <View style={styles.fileNameRow}>
            <Ionicons name="document-outline" size={14} color={AppColors.textSecondary} />
            <Text style={styles.fileNameText} numberOfLines={1}>
              {selectedVideoFile?.name || 'No file selected'}
            </Text>
          </View>

          <AppPressable onPress={() => void onPostVideo()} disabled={uploadInProgress} style={styles.submitButton}>
            {uploadInProgress ? (
              <View style={styles.uploadProgressRowContainer}>
                <ActivityIndicator size="small" color={AppColors.textPrimary} />
                <Text style={styles.submitButtonText}>Uploading {uploadProgressValue}%</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>Post Video</Text>
            )}
          </AppPressable>
        </ScrollView>

        <Modal visible={categoryPickerOpen} transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)}>
          <AppPressable style={styles.dropdownBackdrop} onPress={() => setCategoryPickerOpen(false)}>
            <View style={styles.dropdownSheet}>
              <Text style={styles.dropdownSheetTitle}>Select Category</Text>
              <ScrollView style={{ maxHeight: 350 }}>
                {TALENT_TYPES.map((name) => (
                  <AppPressable
                    key={name}
                    onPress={() => { setSelectedCategoryName(name); setCategoryPickerOpen(false); }}
                    style={[styles.dropdownItem, selectedCategoryName === name && styles.dropdownItemActive]}
                  >
                    <Text style={[styles.dropdownItemText, selectedCategoryName === name && styles.dropdownItemTextActive]}>{name}</Text>
                    {selectedCategoryName === name && <Ionicons name="checkmark" size={18} color={AppColors.accentPrimary} />}
                  </AppPressable>
                ))}
              </ScrollView>
            </View>
          </AppPressable>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screenContainer} edges={['top']}>
      {/* Back + Upload actions header */}
      <View style={styles.backRow}>
        <AppPressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={AppColors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </AppPressable>
      </View>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitleText}>Upload</Text>
        <AppPressable onPress={() => { resetPostForm(); setShowPostForm(true); }} style={styles.newPostButton}>
          <Ionicons name="add" size={16} color={AppColors.textPrimary} />
          <Text style={styles.newPostButtonText}>New post</Text>
        </AppPressable>
      </View>

      {/* Upload action buttons */}
      <View style={styles.uploadActionsRow}>
        <AppPressable onPress={() => void onPickVideoFromGallery()} style={styles.uploadActionBtn}>
          <View style={styles.uploadActionIcon}>
            <Ionicons name="images-outline" size={24} color={AppColors.textPrimary} />
          </View>
          <Text style={styles.uploadActionLabel}>Gallery</Text>
        </AppPressable>
        <AppPressable onPress={() => void onRecordVideoFromCamera()} style={styles.uploadActionBtn}>
          <View style={styles.uploadActionIcon}>
            <Ionicons name="videocam-outline" size={24} color={AppColors.textPrimary} />
          </View>
          <Text style={styles.uploadActionLabel}>Camera</Text>
        </AppPressable>
        <AppPressable onPress={() => { resetPostForm(); setShowPostForm(true); }} style={styles.uploadActionBtn}>
          <View style={styles.uploadActionIcon}>
            <Ionicons name="add" size={28} color={AppColors.textPrimary} />
          </View>
          <Text style={styles.uploadActionLabel}>Post</Text>
        </AppPressable>
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
          <AppPressable style={styles.retryButton} onPress={() => void loadMyVideos()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </AppPressable>
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
            <AppPressable
              onPress={() => onOpenVideoInFeed(index)}
              style={[styles.videoTileContainer, { width: tileWidth, height: tileWidth * 1.45 }]}
            >
              <SmartVideoThumbnail
                thumbnailUrl={videoItem.thumbnail_url}
                fileUrl={videoItem.file_url}
                imageStyle={styles.videoTileImage}
                fallbackStyle={styles.videoTileFallback}
              />
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
              <AppPressable onPress={() => onDeleteVideo(videoItem.id)} style={styles.deleteTileButton}>
                <Ionicons name="trash-outline" size={14} color={AppColors.textPrimary} />
              </AppPressable>
            </AppPressable>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: AppColors.backgroundPrimary,
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
    paddingHorizontal: 16,
    paddingTop: 4,
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
    alignItems: 'center',
    justifyContent: 'center',
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
});
