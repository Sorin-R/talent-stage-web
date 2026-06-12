import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppPressable from './AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { AppColors } from '../theme/colors';

const DRAWER_WIDTH = 280;
const ANIM_DURATION = 280;

interface Props {
  onNav: (screen: string) => void;
}

export default function SideDrawer({ onNav }: Props) {
  const { drawerOpen, setDrawerOpen, loggedIn } = useAppStore();

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const isVisibleRef = useRef(false);
  const mountedRef = useRef(drawerOpen);
  const [shouldRender, setShouldRender] = useState(drawerOpen);

  useEffect(() => {
    if (drawerOpen) {
      setShouldRender(true);
      isVisibleRef.current = true;
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      if (!isVisibleRef.current && !mountedRef.current) {
        // First mount with drawer closed — don't animate
        mountedRef.current = true;
        return;
      }
      mountedRef.current = true;
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isVisibleRef.current = false;
        setShouldRender(false);
      });
    }
  }, [drawerOpen]);

  const close = () => setDrawerOpen(false);
  const go = (screen: string) => {
    close();
    onNav(screen);
  };

  if (!shouldRender) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Overlay backdrop */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <AppPressable style={StyleSheet.absoluteFillObject} onPress={close} />
      </Animated.View>

      {/* Sliding drawer */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <AppPressable onPress={close} hitSlop={8}>
            <Ionicons name="close" size={28} color="#fff" />
          </AppPressable>
        </View>
        <View style={styles.sep} />

        <AppPressable style={styles.item} onPress={() => go('Home')}>
          <Ionicons name="home-outline" size={20} color="#fff" />
          <Text style={styles.itemText}>Home</Text>
        </AppPressable>

        {loggedIn && (
          <>
            <AppPressable style={styles.item} onPress={() => go('Followers')}>
              <Ionicons name="people-outline" size={20} color="#fff" />
              <Text style={styles.itemText}>Followers</Text>
            </AppPressable>
            <AppPressable style={styles.item} onPress={() => go('Following')}>
              <Ionicons name="person-outline" size={20} color="#fff" />
              <Text style={styles.itemText}>Following</Text>
            </AppPressable>
            <AppPressable style={styles.item} onPress={() => go('Saved')}>
              <Ionicons name="bookmark-outline" size={20} color="#fff" />
              <Text style={styles.itemText}>Saved Videos</Text>
            </AppPressable>
            <AppPressable style={styles.item} onPress={() => go('SharedVideos')}>
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={styles.itemText}>Shared Videos</Text>
            </AppPressable>
            <AppPressable style={styles.item} onPress={() => go('Account')}>
              <Ionicons name="settings-outline" size={20} color="#fff" />
              <Text style={styles.itemText}>Account</Text>
            </AppPressable>
          </>
        )}
        {!loggedIn && (
          <AppPressable style={styles.item} onPress={() => go('Login')}>
            <Ionicons name="log-in-outline" size={20} color="#fff" />
            <Text style={styles.itemText}>Sign In</Text>
          </AppPressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 9998,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: AppColors.backgroundSecondary,
    paddingTop: 60,
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  sep: {
    height: 1,
    backgroundColor: AppColors.borderPrimary,
    marginBottom: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  itemText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
});
