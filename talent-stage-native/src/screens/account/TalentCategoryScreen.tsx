import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppPressable from '../../components/AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { toast } from '../../components/Toast';
import { useAppStore } from '../../store/useAppStore';
import type { PaginatedResponse, UserWithStats } from '../../types';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { TRANSPARENT_AVATAR_SOURCE } from '../../constants/avatar';

const DEFAULT_AVATAR_SOURCE = TRANSPARENT_AVATAR_SOURCE;

export default function TalentCategoryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'TalentCategory'>>();
  const categoryName = route.params.categoryName;

  const loggedIn = useAppStore((s) => s.loggedIn);

  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<UserWithStats[]>([]);

  const loadTalents = useCallback(async () => {
    setIsLoading(true);
    const query = new URLSearchParams();
    query.set('creators_only', '1');
    query.set('talent_type', categoryName);
    const data = await apiFetch<PaginatedResponse<UserWithStats>>('/users?' + query.toString());
    if (data.success && data.data) {
      setUsers(data.data.items || []);
    } else {
      setUsers([]);
    }
    setIsLoading(false);
  }, [categoryName]);

  useEffect(() => {
    void loadTalents();
  }, [loadTalents]);

  const followTalent = async (userId: string) => {
    if (!loggedIn) {
      toast('Sign in to follow');
      navigation.navigate('Login');
      return;
    }
    const data = await apiFetch<{ following: boolean }>('/users/' + userId + '/follow', { method: 'POST' });
    if (!data.success) { toast('Error: ' + data.error); return; }
    setUsers((prev) =>
      prev.map((u) => u.id === userId ? { ...u, is_followed: data.data?.following ? 1 : 0 } : u)
    );
    toast(data.data?.following ? 'Following!' : 'Unfollowed');
  };

  const goToUser = (u: UserWithStats) => {
    navigation.navigate('CreatorProfile', { userId: u.id });
  };

  return (
    <View style={styles.screenContainer}>
      {/* Back button */}
      <View style={styles.backRow}>
        <AppPressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={AppColors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </AppPressable>
      </View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.titleText}>Follow a {categoryName} Talent</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: u }) => (
            <View style={styles.userRow}>
              <AppPressable onPress={() => goToUser(u)}>
                <Image
                  source={DEFAULT_AVATAR_SOURCE}
                  style={styles.userAvatar}
                />
              </AppPressable>
              <AppPressable onPress={() => goToUser(u)} style={styles.userNameContainer}>
                <Text style={styles.userName} numberOfLines={1}>
                  {u.full_name || u.username}
                </Text>
              </AppPressable>
              <AppPressable
                onPress={() => followTalent(u.id)}
                style={[styles.followButton, u.is_followed ? styles.followingBg : null]}
              >
                <Text style={styles.followButtonText}>
                  {u.is_followed ? 'Following' : 'Follow'}
                </Text>
              </AppPressable>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No talents in this category yet</Text>
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
  titleContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  titleText: {
    color: AppColors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  followButton: {
    backgroundColor: AppColors.accentPrimary,
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  followingBg: {
    backgroundColor: '#444',
  },
  followButtonText: {
    color: AppColors.textPrimary,
    fontSize: 13,
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
