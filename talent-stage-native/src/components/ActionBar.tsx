import { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Modal, TextInput, ScrollView } from 'react-native';
import AppPressable from './AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { apiFetch } from '../services/api';
import { toast } from './Toast';
import { AppColors } from '../theme/colors';
import { REPORT_REASONS } from './ShareSheet';

interface Props {
  onLike: () => void;
  onDislike: () => void;
  onOpenComments: () => void;
  onNav: (page: string, data?: unknown) => void;
  videoVoted: boolean;
  showActions?: boolean;
  showReport?: boolean;
}

const DEFAULT_AVATAR = require('../../assets/icon.png');

export default function ActionBar({
  onLike,
  onDislike,
  onOpenComments,
  onNav,
  videoVoted,
  showActions = true,
  showReport = true,
}: Props) {
  const { currentVideo, feedVideos, setFeedVideos, setCurrentVideo, loggedIn, setShareSheetOpen, user } = useAppStore();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const followCacheRef = useRef<Record<string, boolean>>({});
  const saveCacheRef = useRef<Record<string, boolean>>({});
  const creatorAvatarSource = currentVideo
    ? (
      currentVideo.user_id === user?.id
        ? ((user?.avatar_url || currentVideo.avatar_url) ? { uri: user?.avatar_url || currentVideo.avatar_url || '' } : DEFAULT_AVATAR)
        : (currentVideo.avatar_url ? { uri: currentVideo.avatar_url } : DEFAULT_AVATAR)
    )
    : DEFAULT_AVATAR;

  useEffect(() => {
    if (!currentVideo) {
      setIsFollowing(false);
      setIsSaved(false);
      return;
    }
    setIsFollowing(!!currentVideo.is_following_author);
    setIsSaved(!!currentVideo.is_saved);

    if (!loggedIn) return;

    const cachedFollow = followCacheRef.current[currentVideo.user_id];
    if (typeof cachedFollow === 'boolean') {
      setIsFollowing(cachedFollow);
    }
    const cachedSaved = saveCacheRef.current[currentVideo.id];
    if (typeof cachedSaved === 'boolean') {
      setIsSaved(cachedSaved);
    }
  }, [currentVideo, loggedIn]);

  useEffect(() => {
    if (!loggedIn) {
      followCacheRef.current = {};
      saveCacheRef.current = {};
    }
  }, [loggedIn]);

  const doFollow = async () => {
    if (!loggedIn) { toast('Sign in to follow'); onNav('Login'); return; }
    if (!currentVideo) return;
    const data = await apiFetch<{ following: boolean }>('/users/' + currentVideo.user_id + '/follow', { method: 'POST' });
    if (!data.success) { toast('Error: ' + data.error); return; }
    const following = !!data.data?.following;
    followCacheRef.current[currentVideo.user_id] = following;
    setIsFollowing(following);
    const nextFollowValue = following ? 1 : 0;
    const nextVideos = feedVideos.map((v) =>
      v.user_id === currentVideo.user_id ? { ...v, is_following_author: nextFollowValue } : v,
    );
    setFeedVideos(nextVideos);
    setCurrentVideo({ ...currentVideo, is_following_author: nextFollowValue });
    toast(following ? 'Now following!' : 'Unfollowed');
  };

  const doSave = async () => {
    if (!loggedIn) { toast('Sign in to save'); onNav('Login'); return; }
    if (!currentVideo) return;
    const data = await apiFetch<{ saved: boolean }>('/videos/' + currentVideo.id + '/save', { method: 'POST' });
    if (!data.success) { toast('Error: ' + data.error); return; }
    const saved = !!data.data?.saved;
    saveCacheRef.current[currentVideo.id] = saved;
    setIsSaved(saved);
    const nextSavedValue = saved ? 1 : 0;
    const nextVideos = feedVideos.map((v) =>
      v.id === currentVideo.id ? { ...v, is_saved: nextSavedValue } : v,
    );
    setFeedVideos(nextVideos);
    setCurrentVideo({ ...currentVideo, is_saved: nextSavedValue });
    toast(saved ? 'Saved!' : 'Removed from saved');
  };

  const doReport = async () => {
    if (!loggedIn) { toast('Sign in to report'); onNav('Login'); return; }
    if (!currentVideo) return;
    if (!reportReason) { toast('Please select a reason'); return; }
    setReportSubmitting(true);
    const data = await apiFetch('/videos/' + currentVideo.id + '/report', {
      method: 'POST',
      body: { reason: reportReason, description: reportDesc } as unknown as BodyInit,
    });
    setReportSubmitting(false);
    if (!data.success) { toast('Error: ' + data.error); return; }
    toast('Video reported successfully. Thank you!');
    setReportModal(false);
    setReportReason('');
    setReportDesc('');
  };

  const openCreator = () => {
    if (!currentVideo) return;
    const resolvedAvatarUrl = currentVideo.user_id === user?.id
      ? (user?.avatar_url || currentVideo.avatar_url || null)
      : (currentVideo.avatar_url || null);
    onNav('CreatorProfile', {
      userId: currentVideo.user_id,
      username: currentVideo.username,
      fullName: currentVideo.full_name,
      avatarUrl: resolvedAvatarUrl,
    });
  };

  return (
    <>
      {showActions && (
        <View style={styles.actions}>
          {/* Like / Dislike arrows */}
          <View style={styles.arrows}>
            <AppPressable style={styles.arrowBtn} onPress={onLike}>
              <Ionicons name="chevron-up" size={36} color="#fff" />
            </AppPressable>
            <AppPressable style={styles.arrowBtn} onPress={onDislike}>
              <Ionicons name="chevron-down" size={36} color="#fff" />
            </AppPressable>
          </View>

          {/* Social buttons */}
          <View style={styles.social}>
            {/* Creator avatar */}
            <AppPressable style={styles.creatorRow} onPress={openCreator}>
              <Image source={creatorAvatarSource} style={styles.creatorAvatar} />
              <Text style={styles.creatorName} numberOfLines={1}>
                {currentVideo?.username ? '@' + currentVideo.username : 'YOU'}
              </Text>
            </AppPressable>

            {/* Follow */}
            <AppPressable style={styles.actionBtn} onPress={doFollow}>
              <Ionicons
                name={isFollowing ? 'person-remove' : 'person-add'}
                size={24}
                color={isFollowing ? AppColors.accentPrimary : '#fff'}
              />
              <Text style={styles.actionLabel}>Follow</Text>
            </AppPressable>

            {/* Save */}
            <AppPressable style={styles.actionBtn} onPress={doSave}>
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={isSaved ? AppColors.accentPrimary : '#fff'}
              />
              <Text style={styles.actionLabel}>Save</Text>
            </AppPressable>

            {/* Comments */}
            <AppPressable style={styles.actionBtn} onPress={onOpenComments}>
              <Ionicons name="chatbubble-outline" size={24} color="#fff" />
              <Text style={styles.actionLabel}>Comments</Text>
            </AppPressable>

            {/* Share */}
            <AppPressable style={styles.actionBtn} onPress={() => setShareSheetOpen(true)}>
              <Ionicons name="share-social-outline" size={24} color="#fff" />
              <Text style={styles.actionLabel}>Share</Text>
            </AppPressable>
          </View>
        </View>
      )}

      {showReport && (
        <AppPressable style={styles.reportBtn} onPress={() => setReportModal(true)}>
          <Ionicons name="flag-outline" size={20} color="#888" />
          <Text style={styles.reportLabel}>Report</Text>
        </AppPressable>
      )}

      {/* Report modal */}
      <Modal visible={reportModal} transparent animationType="fade" onRequestClose={() => setReportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report This Video</Text>

            <Text style={styles.fieldLabel}>Reason</Text>
            <ScrollView horizontal={false} style={styles.reasonList}>
              {REPORT_REASONS.map((r) => (
                <AppPressable
                  key={r}
                  style={[styles.reasonItem, reportReason === r && styles.reasonItemActive]}
                  onPress={() => setReportReason(r)}
                >
                  <Text style={[styles.reasonText, reportReason === r && styles.reasonTextActive]}>{r}</Text>
                </AppPressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Details (optional)</Text>
            <TextInput
              style={styles.detailInput}
              placeholder="Provide additional details..."
              placeholderTextColor="#666"
              value={reportDesc}
              onChangeText={setReportDesc}
              multiline
            />

            <View style={styles.modalButtons}>
              <AppPressable
                style={styles.cancelBtn}
                onPress={() => setReportModal(false)}
                disabled={reportSubmitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </AppPressable>
              <AppPressable
                style={[styles.submitBtn, (!reportReason || reportSubmitting) && styles.submitBtnDisabled]}
                onPress={doReport}
                disabled={reportSubmitting || !reportReason}
              >
                <Text style={styles.submitBtnText}>
                  {reportSubmitting ? 'Reporting...' : 'Report Video'}
                </Text>
              </AppPressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actions: {
    position: 'absolute',
    right: 8,
    bottom: 80,
    alignItems: 'center',
    gap: 12,
  },
  arrows: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  arrowBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  social: {
    alignItems: 'center',
    gap: 14,
  },
  creatorRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  creatorName: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    maxWidth: 60,
    textAlign: 'center',
  },
  actionBtn: {
    alignItems: 'center',
    gap: 2,
  },
  actionLabel: {
    color: '#ccc',
    fontSize: 10,
    fontWeight: '500',
  },
  reportBtn: {
    position: 'absolute',
    left: 12,
    bottom: 80,
    alignItems: 'center',
    gap: 2,
  },
  reportLabel: {
    color: '#888',
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: AppColors.backgroundModal,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
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
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
  },
  reasonList: {
    maxHeight: 200,
    marginBottom: 12,
  },
  reasonItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  reasonItemActive: {
    backgroundColor: AppColors.accentPrimary,
  },
  reasonText: {
    color: '#ccc',
    fontSize: 14,
  },
  reasonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  detailInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    padding: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,0,0,0.6)',
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
