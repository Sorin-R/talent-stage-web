import { Modal, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { AppColors } from '../theme/colors';

interface Props {
  onNav: (screen: string) => void;
}

export default function SideDrawer({ onNav }: Props) {
  const { drawerOpen, setDrawerOpen, loggedIn } = useAppStore();

  const close = () => setDrawerOpen(false);
  const go = (screen: string) => { close(); onNav(screen); };

  return (
    <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={close}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={close}>
        <View style={styles.drawer} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <TouchableOpacity onPress={close}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.sep} />
          <TouchableOpacity style={styles.item} onPress={() => go('Home')}>
            <Ionicons name="home-outline" size={20} color="#fff" />
            <Text style={styles.itemText}>Home</Text>
          </TouchableOpacity>
          {loggedIn && (
            <>
              <TouchableOpacity style={styles.item} onPress={() => go('Followers')}>
                <Ionicons name="people-outline" size={20} color="#fff" />
                <Text style={styles.itemText}>Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.item} onPress={() => go('Following')}>
                <Ionicons name="person-outline" size={20} color="#fff" />
                <Text style={styles.itemText}>Following</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.item} onPress={() => go('Saved')}>
                <Ionicons name="bookmark-outline" size={20} color="#fff" />
                <Text style={styles.itemText}>Saved Videos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.item} onPress={() => go('SharedVideos')}>
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.itemText}>Shared Videos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.item} onPress={() => go('Account')}>
                <Ionicons name="settings-outline" size={20} color="#fff" />
                <Text style={styles.itemText}>Account</Text>
              </TouchableOpacity>
            </>
          )}
          {!loggedIn && (
            <TouchableOpacity style={styles.item} onPress={() => go('Login')}>
              <Ionicons name="log-in-outline" size={20} color="#fff" />
              <Text style={styles.itemText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    width: 280,
    backgroundColor: AppColors.backgroundSecondary,
    paddingTop: 60,
    paddingHorizontal: 16,
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
