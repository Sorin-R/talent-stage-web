import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import RootNavigator from './src/navigation/RootNavigator';
import Toast from './src/components/Toast';
import { useAppStore } from './src/store/useAppStore';
import { AppColors } from './src/theme/colors';

const navigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: AppColors.accentPrimary,
    background: AppColors.backgroundPrimary,
    card: AppColors.backgroundSecondary,
    text: AppColors.textPrimary,
    border: AppColors.borderPrimary,
    notification: AppColors.accentSecondary,
  },
};

export default function App() {
  const restoreSession = useAppStore((state) => state.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: false,
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: AppColors.backgroundPrimary }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer theme={navigationTheme}>
          <RootNavigator />
        </NavigationContainer>
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
