import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../theme/colors';
import HomeScreen from '../screens/HomeScreen';
import FollowingScreen from '../screens/FollowingScreen';
import UploadScreen from '../screens/UploadScreen';
import SavedScreen from '../screens/SavedScreen';
import AccountScreen from '../screens/account/AccountScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import FollowersScreen from '../screens/account/FollowersScreen';
import FollowingUsersScreen from '../screens/account/FollowingUsersScreen';
import SharedVideosScreen from '../screens/account/SharedVideosScreen';
import VideoAnalyticsScreen from '../screens/account/VideoAnalyticsScreen';
import CreatorProfileScreen from '../screens/account/CreatorProfileScreen';
import TalentCategoryScreen from '../screens/account/TalentCategoryScreen';
import { useAppStore } from '../store/useAppStore';

export type RootStackParamList = {
  MainTabs: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  Followers: undefined;
  FollowingUsers: undefined;
  SharedVideos: undefined;
  VideoAnalytics: undefined;
  CreatorProfile: { userId: string };
  TalentCategory: { categoryName: string };
};

export type MainTabParamList = {
  Home: undefined;
  Following: undefined;
  Upload: undefined;
  Saved: undefined;
  Account: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }> = {
  Home: { outline: 'home-outline', filled: 'home' },
  Following: { outline: 'people-outline', filled: 'people' },
  Upload: { outline: 'add-circle-outline', filled: 'add-circle' },
  Saved: { outline: 'bookmark-outline', filled: 'bookmark' },
  Account: { outline: 'person-outline', filled: 'person' },
};

const defaultTabBarStyle = {
  backgroundColor: '#1a1a1a',
  borderTopWidth: 1,
  borderTopColor: '#333333',
  overflow: 'visible',
  height: 86,
  paddingTop: 6,
  paddingBottom: 14,
} as const;

const homeTabBarStyle = {
  ...defaultTabBarStyle,
  backgroundColor: '#1a1a1a',
  borderTopWidth: 0,
} as const;

function MainTabNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: AppColors.textPrimary,
        tabBarInactiveTintColor: '#888888',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
        tabBarStyle: route.name === 'Home' ? homeTabBarStyle : defaultTabBarStyle,
        tabBarItemStyle: styles.tabItemButton,
        tabBarIcon: ({ focused }) => {
          if (route.name === 'Upload') {
            if (!focused) {
              return (
                <View style={styles.uploadIconCircleInactiveContainer}>
                  <Ionicons name="add" size={30} color="#666666" />
                </View>
              );
            }

            return (
              <View style={styles.uploadIconCircleContainer}>
                <Ionicons name="add" size={30} color="#0a0a0a" />
              </View>
            );
          }

          const icons = TAB_ICONS[route.name] || TAB_ICONS.Home;
          const iconName = focused ? icons.filled : icons.outline;
          const iconColor = focused ? AppColors.textPrimary : '#666666';
          const iconSize = 26;

          return <Ionicons name={iconName} size={iconSize} color={iconColor} />;
        },
      })}
    >
      <MainTab.Screen name="Home" component={HomeScreen} />
      <MainTab.Screen name="Following" component={FollowingScreen} />
      <MainTab.Screen
        name="Upload"
        component={UploadScreen}
        options={{
          tabBarLabel: 'Upload',
          tabBarLabelStyle: styles.uploadHiddenLabelText,
          tabBarItemStyle: styles.tabItemButton,
        }}
      />
      <MainTab.Screen name="Saved" component={SavedScreen} />
      <MainTab.Screen
        name="Account"
        component={AccountTabScreenGate}
        options={{ title: 'Account' }}
      />
    </MainTab.Navigator>
  );
}

function AccountTabScreenGate() {
  const loggedIn = useAppStore((state) => state.loggedIn);
  if (loggedIn) return <AccountScreen />;
  return <LoginScreen />;
}

export default function RootNavigator() {
  return (
    <RootStack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{
        headerStyle: { backgroundColor: AppColors.backgroundPrimary },
        headerTintColor: AppColors.textPrimary,
        headerTitleStyle: { fontSize: 16, fontWeight: '700' },
        contentStyle: { backgroundColor: AppColors.backgroundPrimary },
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: '',
      }}
    >
      <RootStack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
      <RootStack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />
      <RootStack.Screen name="Signup" component={SignupScreen} options={{ title: 'Sign Up' }} />
      <RootStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset Password' }} />
      <RootStack.Screen name="Followers" component={FollowersScreen} options={{ title: 'Followers' }} />
      <RootStack.Screen name="FollowingUsers" component={FollowingUsersScreen} options={{ title: 'Following' }} />
      <RootStack.Screen name="SharedVideos" component={SharedVideosScreen} options={{ title: 'Shared Videos' }} />
      <RootStack.Screen name="VideoAnalytics" component={VideoAnalyticsScreen} options={{ title: 'Video Analytics' }} />
      <RootStack.Screen
        name="CreatorProfile"
        component={CreatorProfileScreen}
        options={{ title: 'Creator', headerBackButtonDisplayMode: 'minimal' }}
      />
      <RootStack.Screen name="TalentCategory" component={TalentCategoryScreen} options={{ title: 'Talent' }} />
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItemButton: {
    paddingTop: 15,
    paddingBottom: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadHiddenLabelText: {
    opacity: 0,
  },
  uploadIconCircleContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadIconCircleInactiveContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
