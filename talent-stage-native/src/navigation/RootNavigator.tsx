import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

function MainTabNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: AppColors.backgroundPrimary,
          borderTopColor: AppColors.borderPrimary,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarActiveTintColor: AppColors.textPrimary,
        tabBarInactiveTintColor: AppColors.textSecondary,
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: React.ComponentProps<typeof Ionicons>['name'] = 'home-outline';

          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          if (route.name === 'Following') iconName = focused ? 'people' : 'people-outline';
          if (route.name === 'Upload') iconName = focused ? 'add-circle' : 'add-circle-outline';
          if (route.name === 'Saved') iconName = focused ? 'bookmark' : 'bookmark-outline';
          if (route.name === 'Account') iconName = focused ? 'person' : 'person-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <MainTab.Screen name="Home" component={HomeScreen} />
      <MainTab.Screen name="Following" component={FollowingScreen} />
      <MainTab.Screen name="Upload" component={UploadScreen} />
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
      <RootStack.Screen name="CreatorProfile" component={CreatorProfileScreen} options={{ title: 'Creator' }} />
      <RootStack.Screen name="TalentCategory" component={TalentCategoryScreen} options={{ title: 'Talent' }} />
    </RootStack.Navigator>
  );
}
