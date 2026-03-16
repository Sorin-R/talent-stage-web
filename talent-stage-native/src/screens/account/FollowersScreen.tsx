import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { toast } from '../../components/Toast';
import { useAppStore } from '../../store/useAppStore';
import type { PaginatedResponse, UserWithStats } from '../../types';

const DEFAULT_AVATAR_SOURCE = 'https://web-demo.space/icons/account.png';

export default function FollowersScreen() {
  const navigation = useNavigation<any>();
  const user = useAppStore((s) => s.user);
  const loggedIn = useAppStore((s) => s.loggedIn);

  const [isLoading, setIsLoading] = useState(false);
  const [followers, setFollowers] = useState<UserWithStats[]>([]);
  const [total, setTotal] = useState(0);

  const loadFollowers = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    const data = await apiFetch<PaginatedResponse<UserWithStats>>('/users/' + user.id + '/followers');
    if (data.success && data.data) {
      setFollowers(data.data.items || []);
      setTotal(data.data.total || 0);
    }
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (loggedIn) {
      void loadFollowers();
    }
  }, [loadFollowers, loggedIn]);

  const removeFollower = async (userId: string) => {
    await apiFetch('/users/' + userId + '/follow', { method: 'POST' });
    toast('Removed');
    void loadFollowers();
  };

  const goToUser = (u: UserWithStats) => {
    navigation.navigate('CreatorProfile', { userId: u.id });
  };

  return (
    <View style={styles.screenContainer}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={AppColors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.countContainer}>
        <Text style={styles.countText}>{total} - Followers</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
        </View>
      ) : (
        <FlatList
          data={followers}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: u }) => (
            <View style={styles.userRow}>
              <Pressable onPress={() => goToUser(u)}>
                <Image
                  source={{ uri: u.avatar_url || DEFAULT_AVATAR_SOURCE }}
                  style={styles.userAvatar}
                />
              </Pressable>
              <Pressable onPress={() => goToUser(u)} style={styles.userNameContainer}>
                <Text style={styles.userName} numberOfLines={1}>
                  {u.full_name || u.username}
                </Text>
              </Pressable>
              <Pressable onPress={() => removeFollower(u.id)} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No followers yet</Text>
            </View>
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
  countContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  countText: {
    color: AppColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: AppColors.borderPrimary,
    borderRadius: 12,
    backgroundColor: AppColors.backgroundCard,
    padding: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#202020',
  },
  userNameContainer: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  cancelButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
  },
});
