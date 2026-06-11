import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppPressable from '../../components/AppPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { toast } from '../../components/Toast';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { User } from '../../types';
import LoginScreen from '../auth/LoginScreen';
import { TRANSPARENT_AVATAR_SOURCE } from '../../constants/avatar';

const DEFAULT_AVATAR_SOURCE = TRANSPARENT_AVATAR_SOURCE;

interface Strike {
  id: string;
  reason: string;
  strike_type: 'warning' | 'strike' | 'temp_ban' | 'permanent_ban' | 'shadow_ban';
  expires_at: string | null;
  created_at: string;
  is_active: number;
}

interface CreatorOverview30d {
  videos_count: number;
  total_views: number;
  total_unique_views: number;
  unique_viewers_30d: number;
  impressions_30d: number;
  avg_watch_seconds_30d: number;
  completion_rate_30d: number;
  skip_rate_30d: number;
  engagement_rate_30d: number;
  follow_conversion_30d: number;
  save_rate_30d: number;
  share_rate_30d: number;
  like_dislike_ratio: number;
  report_rate_30d: number;
  reports_30d: number;
}

interface CreatorVideoLite {
  likes: number;
  dislikes: number;
}

interface CreatorAnalyticsPayload {
  overview_30d: CreatorOverview30d;
  videos?: CreatorVideoLite[];
}

interface ProfileUserCounts {
  follower_count?: number;
  following_count?: number;
}

export default function AccountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const loggedIn = useAppStore((s) => s.loggedIn);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const logout = useAppStore((s) => s.logout);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');

  const [pwdModal, setPwdModal] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [strikesLoading, setStrikesLoading] = useState(false);

  const [creatorAnalytics, setCreatorAnalytics] = useState<CreatorAnalyticsPayload | null>(null);
  const [creatorAnalyticsLoading, setCreatorAnalyticsLoading] = useState(false);

  const [profileStats, setProfileStats] = useState({
    followingCount: 0,
    followerCount: 0,
    likesCount: 0,
    dislikesCount: 0,
  });

  const [avatarUploading, setAvatarUploading] = useState(false);

  // Sync fields from user
  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setWebsite(user.website || '');
    }
  }, [user]);

  // Fetch profile counts
  useEffect(() => {
    const fetchProfileCounts = async () => {
      if (!user?.id) return;
      const data = await apiFetch<ProfileUserCounts>('/users/' + user.id);
      const profileData = data.data;
      if (!data.success || !profileData) return;
      setProfileStats((prev) => ({
        ...prev,
        followerCount: Number(profileData.follower_count || 0),
        followingCount: Number(profileData.following_count || 0),
      }));
    };
    if (user?.id) {
      void fetchProfileCounts();
    } else {
      setProfileStats({ followingCount: 0, followerCount: 0, likesCount: 0, dislikesCount: 0 });
    }
  }, [user?.id]);

  // Fetch creator analytics
  useEffect(() => {
    const fetchCreatorAnalytics = async () => {
      if (!user?.id) return;
      setCreatorAnalyticsLoading(true);
      const data = await apiFetch<CreatorAnalyticsPayload>('/users/' + user.id + '/creator-analytics');
      setCreatorAnalyticsLoading(false);
      if (!data.success || !data.data) {
        setCreatorAnalytics(null);
        setProfileStats((prev) => ({ ...prev, likesCount: 0, dislikesCount: 0 }));
        return;
      }
      setCreatorAnalytics(data.data);
      const videos = data.data.videos || [];
      const likesCount = videos.reduce((sum, v) => sum + Number(v.likes || 0), 0);
      const dislikesCount = videos.reduce((sum, v) => sum + Number(v.dislikes || 0), 0);
      setProfileStats((prev) => ({ ...prev, likesCount, dislikesCount }));
    };
    if (user?.id) {
      void fetchCreatorAnalytics();
    } else {
      setCreatorAnalytics(null);
      setProfileStats((prev) => ({ ...prev, likesCount: 0, dislikesCount: 0 }));
    }
  }, [user?.id]);

  // Fetch strikes
  useEffect(() => {
    const fetchStrikes = async () => {
      setStrikesLoading(true);
      try {
        const data = await apiFetch<{ strikes: Strike[] }>('/videos/me/strikes');
        if (data.success && data.data?.strikes) {
          setStrikes(data.data.strikes);
        }
      } catch (err) {
        console.error('Failed to fetch strikes:', err);
      } finally {
        setStrikesLoading(false);
      }
    };
    if (user) {
      void fetchStrikes();
    }
  }, [user]);

  const getAvatarUri = () => user?.avatar_url || '';

  const isRealAvatar = !!user?.avatar_url;

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!user) return;

    setAvatarUploading(true);
    const form = new FormData();
    form.append('avatar', {
      uri: asset.uri,
      type: asset.mimeType || 'image/jpeg',
      name: `avatar-${user.id}.jpg`,
    } as unknown as Blob);

    const data = await apiFetch<User>('/auth/me/avatar', { method: 'POST', body: form });
    setAvatarUploading(false);
    if (!data.success) {
      toast('Error: ' + (data.error || 'Could not update photo'));
      return;
    }
    const nextUser = data.data || { ...user };
    await setUser(nextUser);
    toast('Avatar updated!');
  };

  const deleteAvatar = async () => {
    if (!user) return;
    const data = await apiFetch<User>('/auth/me/avatar', { method: 'DELETE' });
    if (!data.success) {
      toast('Error: ' + (data.error || 'Could not remove photo'));
      return;
    }
    if (data.data) await setUser(data.data);
    else await setUser({ ...user, avatar_url: null });
    toast('Photo removed');
  };

  const saveProfile = async () => {
    if (!user) return;
    const uname = username.trim().toLowerCase();
    const mail = email.trim().toLowerCase();
    const site = website.trim();

    if (!uname) { toast('Username cannot be empty'); return; }
    if (!mail) { toast('Email cannot be empty'); return; }
    if (site.length > 500) { toast('Website link is too long (max 500 chars)'); return; }

    const data = await apiFetch<User>('/auth/me', {
      method: 'PUT',
      body: {
        full_name: user.full_name || '',
        username: uname,
        email: mail,
        phone: phone || null,
        website: site || null,
        bio: user.bio || null,
        talent_type: user.talent_type || 'Viewer',
      },
    });

    if (!data.success || !data.data) {
      if (data.error) toast('Error: ' + data.error);
      return;
    }

    await setUser(data.data);
    setUsername(data.data.username || '');
    setEmail(data.data.email || '');
    setPhone(data.data.phone || '');
    setWebsite(data.data.website || '');
    toast('Profile updated!');
  };

  const doLogout = async () => {
    await logout();
    toast('Logged out');
  };

  const delAcct = () => {
    Alert.alert('Delete Account', 'Delete your account? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await apiFetch('/auth/me', { method: 'DELETE' });
          await logout();
          toast('Account deleted');
        },
      },
    ]);
  };

  const changePassword = async () => {
    if (!curPwd || !newPwd || !confirmPwd) { toast('Please fill all fields'); return; }
    if (newPwd.length < 8) { toast('Min 8 characters'); return; }
    if (newPwd !== confirmPwd) { toast('Passwords do not match'); return; }
    const data = await apiFetch('/auth/me/password', {
      method: 'PUT',
      body: { current_password: curPwd, new_password: newPwd },
    });
    if (!data.success) { toast('Error: ' + data.error); return; }
    setPwdModal(false);
    toast('Password updated!');
  };

  const formatStrikeType = (type: string) => {
    const types: Record<string, { label: string; color: string }> = {
      warning: { label: 'Warning', color: '#ffa500' },
      strike: { label: 'Strike', color: '#ff6b6b' },
      temp_ban: { label: 'Temporary Ban', color: '#ff4444' },
      permanent_ban: { label: 'Permanent Ban', color: '#cc0000' },
      shadow_ban: { label: 'Shadow Ban', color: '#ff9999' },
    };
    return types[type] || { label: type, color: '#999' };
  };

  const formatExpiryDate = (expiresAt: string | null) => {
    if (!expiresAt) return 'Permanent';
    const date = new Date(expiresAt);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const fmt = (n: number) => new Intl.NumberFormat().format(Number(n || 0));
  const pct = (n: number) => `${(Number(n || 0) * 100).toFixed(1)}%`;
  const sec = (n: number) => `${Number(n || 0).toFixed(2)}s`;

  const activeStrikes = strikes.filter((s) => (s.is_active ?? 1) && !isExpired(s.expires_at));
  const ca = creatorAnalytics?.overview_30d || null;

  if (!loggedIn) return <LoginScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: AppColors.backgroundPrimary }} edges={['top']}>
    <View style={styles.backRow}>
      <AppPressable onPress={() => navigation.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color={AppColors.textPrimary} />
        <Text style={styles.backText}>Back</Text>
      </AppPressable>
    </View>
    <ScrollView contentContainerStyle={styles.container}>
      {/* Avatar + name */}
      <View style={styles.headerSection}>
        <View style={styles.avatarWrapper}>
          <View style={styles.avatarOuter}>
            {avatarUploading ? (
              <View style={styles.avatarLoadingContainer}>
                <ActivityIndicator size="small" color={AppColors.textPrimary} />
              </View>
            ) : (
              <Image
                source={getAvatarUri() ? { uri: getAvatarUri() } : DEFAULT_AVATAR_SOURCE}
                style={styles.avatarImage}
                defaultSource={DEFAULT_AVATAR_SOURCE}
              />
            )}
          </View>
          <AppPressable onPress={() => void pickAvatar()} style={styles.avatarEditBtn}>
            <Ionicons name="pencil" size={12} color="#fff" />
          </AppPressable>
          {isRealAvatar && (
            <AppPressable onPress={() => void deleteAvatar()} style={styles.avatarDeleteBtn}>
              <Ionicons name="close" size={14} color="#fff" />
            </AppPressable>
          )}
        </View>

        <Text style={styles.displayName}>{user?.full_name || user?.username || '-'}</Text>
        <Text style={styles.handle}>@{user?.username || '-'}</Text>

        <View style={styles.statsRow}>
          <Text style={styles.statText}>Following {fmt(profileStats.followingCount)}</Text>
          <Text style={styles.statDot}>{'\u2022'}</Text>
          <Text style={styles.statText}>Followers {fmt(profileStats.followerCount)}</Text>
          <Text style={styles.statDot}>{'\u2022'}</Text>
          <Text style={styles.statText}>Likes {fmt(profileStats.likesCount)}</Text>
          <Text style={styles.statDot}>{'\u2022'}</Text>
          <Text style={styles.statText}>Dislikes {fmt(profileStats.dislikesCount)}</Text>
        </View>
      </View>

      {/* Edit Profile */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>EDIT PROFILE</Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Full name</Text>
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyText}>{user?.full_name || '-'}</Text>
          </View>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="@username..."
            placeholderTextColor={AppColors.textMuted}
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* Account Details */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACCOUNT DETAILS</Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor={AppColors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. +44 7911 123456"
            placeholderTextColor={AppColors.textMuted}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Website</Text>
          <TextInput
            style={styles.input}
            value={website}
            onChangeText={setWebsite}
            placeholder="https://your-site.com"
            placeholderTextColor={AppColors.textMuted}
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* Save button */}
      <AppPressable onPress={() => void saveProfile()} style={styles.saveBtn}>
        <Text style={styles.saveBtnText}>Save</Text>
      </AppPressable>

      {/* Creator Analytics */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MY CREATOR ANALYTICS</Text>

        {creatorAnalyticsLoading && (
          <Text style={styles.mutedText}>Loading analytics...</Text>
        )}

        {!creatorAnalyticsLoading && !ca && (
          <View style={styles.analyticsEmptyCard}>
            <Text style={styles.analyticsEmptyText}>Analytics unavailable right now.</Text>
          </View>
        )}

        {!creatorAnalyticsLoading && ca && (
          <View style={{ gap: 8 }}>
            <View style={styles.analyticsGrid}>
              <AnalyticsTile label="Videos" value={fmt(ca.videos_count)} />
              <AnalyticsTile label="Impressions (30d)" value={fmt(ca.impressions_30d)} />
              <AnalyticsTile label="Unique Viewers (30d)" value={fmt(ca.unique_viewers_30d)} />
              <AnalyticsTile label="Avg Watch (30d)" value={sec(ca.avg_watch_seconds_30d)} />
              <AnalyticsTile label="Completion" value={pct(ca.completion_rate_30d)} valueColor={AppColors.success} />
              <AnalyticsTile label="Skip" value={pct(ca.skip_rate_30d)} valueColor="#ff6b6b" />
              <AnalyticsTile label="Engagement" value={pct(ca.engagement_rate_30d)} />
              <AnalyticsTile label="Follow Conversion" value={pct(ca.follow_conversion_30d)} />
            </View>

            <AppPressable
              onPress={() => navigation.navigate('VideoAnalytics')}
              style={styles.fullAnalyticsBtn}
            >
              <Text style={styles.fullAnalyticsBtnText}>Open full video analytics</Text>
            </AppPressable>
          </View>
        )}
      </View>

      {/* Strikes */}
      {strikes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MY ACCOUNT STATUS</Text>

          {activeStrikes.length > 0 ? (
            <View style={styles.strikesActiveCard}>
              <Text style={styles.strikesActiveTitle}>You have active strikes</Text>
              {activeStrikes.map((strike) => {
                const info = formatStrikeType(strike.strike_type);
                return (
                  <View key={strike.id} style={[styles.strikeItem, { borderLeftColor: info.color }]}>
                    <View style={styles.strikeHeader}>
                      <Text style={[styles.strikeType, { color: info.color }]}>{info.label}</Text>
                      <Text style={styles.strikeExpiry}>
                        {strike.expires_at ? `Expires: ${formatExpiryDate(strike.expires_at)}` : 'Permanent'}
                      </Text>
                    </View>
                    <Text style={styles.strikeReason}>{strike.reason || 'No reason provided'}</Text>
                  </View>
                );
              })}
              <Text style={styles.strikeWarning}>
                Accumulating strikes may result in temporary or permanent suspension. If you believe this is in error, please contact support.
              </Text>
            </View>
          ) : strikesLoading ? (
            <Text style={styles.mutedText}>Loading...</Text>
          ) : (
            <View style={styles.strikesGoodCard}>
              <Text style={styles.strikesGoodTitle}>You're in good standing</Text>
              <Text style={styles.strikesGoodSub}>No active strikes on your account.</Text>
            </View>
          )}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActionsGrid}>
        <QuickActionButton iconName="people-outline" label="Followers" onPress={() => navigation.navigate('Followers')} />
        <QuickActionButton iconName="person-add-outline" label="Following" onPress={() => navigation.navigate('FollowingUsers')} />
        <QuickActionButton iconName="share-social-outline" label="Shared videos" onPress={() => navigation.navigate('SharedVideos')} />
        <QuickActionButton iconName="stats-chart-outline" label="Video analytics" onPress={() => navigation.navigate('VideoAnalytics')} />
      </View>

      {/* Danger zone */}
      <View style={styles.dangerSection}>
        <AppPressable
          onPress={() => { setCurPwd(''); setNewPwd(''); setConfirmPwd(''); setPwdModal(true); }}
          style={styles.dangerRow}
        >
          <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.dangerRowText}>Change Password</Text>
        </AppPressable>

        <AppPressable onPress={() => void doLogout()} style={styles.dangerRow}>
          <Ionicons name="log-out-outline" size={18} color="rgba(255,100,100,0.85)" />
          <Text style={[styles.dangerRowText, { color: 'rgba(255,100,100,0.85)' }]}>Log out</Text>
        </AppPressable>

        <AppPressable onPress={delAcct} style={[styles.dangerRow, { borderBottomWidth: 0 }]}>
          <Ionicons name="trash-outline" size={18} color="rgba(255,50,50,0.6)" />
          <Text style={[styles.dangerRowText, { color: 'rgba(255,50,50,0.6)' }]}>Delete Account</Text>
        </AppPressable>
      </View>

      {/* Change Password Modal */}
      <Modal visible={pwdModal} transparent animationType="fade" onRequestClose={() => setPwdModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Current password</Text>
              <TextInput
                style={styles.input}
                value={curPwd}
                onChangeText={setCurPwd}
                placeholder="Enter current password..."
                placeholderTextColor={AppColors.textMuted}
                secureTextEntry
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>New password</Text>
              <TextInput
                style={styles.input}
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="Min. 8 characters..."
                placeholderTextColor={AppColors.textMuted}
                secureTextEntry
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Confirm new password</Text>
              <TextInput
                style={styles.input}
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                placeholder="Repeat new password..."
                placeholderTextColor={AppColors.textMuted}
                secureTextEntry
              />
            </View>

            <View style={styles.modalBtnRow}>
              <AppPressable onPress={() => setPwdModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </AppPressable>
              <AppPressable onPress={() => void changePassword()} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmBtnText}>Update Password</Text>
              </AppPressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SafeAreaView>
  );
}

function AnalyticsTile({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.analyticsTile}>
      <Text style={styles.analyticsTileLabel}>{label}</Text>
      <Text style={[styles.analyticsTileValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

interface QuickActionButtonProps {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

function QuickActionButton({ iconName, label, onPress }: QuickActionButtonProps) {
  return (
    <AppPressable onPress={onPress} style={styles.quickActionBtn}>
      <Ionicons name={iconName} size={18} color={AppColors.textPrimary} />
      <Text style={styles.quickActionBtnText}>{label}</Text>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
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
  container: {
    paddingHorizontal: 16,
    paddingVertical: 25,
    backgroundColor: AppColors.backgroundPrimary,
    alignItems: 'center',
  },

  // Header / avatar
  headerSection: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    top: 20
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: AppColors.borderSecondary,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarLoadingContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  avatarEditBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AppColors.accentPrimary,
    borderWidth: 2,
    borderColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDeleteBtn: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e53935',
    borderWidth: 2,
    borderColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  handle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  statText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '600',
  },
  statDot: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },

  // Sections
  section: {
    width: '100%',
    maxWidth: 500,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // Fields
  fieldRow: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 5,
  },
  readonlyField: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  readonlyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },

  // Save
  saveBtn: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: AppColors.accentPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Analytics
  mutedText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    paddingVertical: 12,
  },
  analyticsEmptyCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 14,
  },
  analyticsEmptyText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  analyticsTile: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 10,
  },
  analyticsTileLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 5,
  },
  analyticsTileValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  fullAnalyticsBtn: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fullAnalyticsBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Strikes
  strikesActiveCard: {
    backgroundColor: 'rgba(255,100,100,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,100,100,0.2)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  strikesActiveTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff6b6b',
    marginBottom: 12,
  },
  strikeItem: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    marginBottom: 8,
  },
  strikeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  strikeType: {
    fontSize: 13,
    fontWeight: '600',
  },
  strikeExpiry: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  strikeReason: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 17,
  },
  strikeWarning: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 12,
    lineHeight: 16,
  },
  strikesGoodCard: {
    backgroundColor: 'rgba(100,255,100,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(100,255,100,0.2)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  strikesGoodTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4caf50',
  },
  strikesGoodSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },

  // Quick actions
  quickActionsGrid: {
    width: '100%',
    maxWidth: 500,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  quickActionBtn: {
    width: '48%',
    borderWidth: 1,
    borderColor: AppColors.borderPrimary,
    borderRadius: 12,
    backgroundColor: AppColors.backgroundCard,
    paddingHorizontal: 10,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickActionBtnText: {
    color: AppColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },

  // Danger zone
  dangerSection: {
    width: '100%',
    maxWidth: 500,
    marginTop: 12,
    paddingTop: 8,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dangerRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
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
  modalField: {
    marginBottom: 12,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: AppColors.accentPrimary,
    alignItems: 'center',
  },
  modalConfirmBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
