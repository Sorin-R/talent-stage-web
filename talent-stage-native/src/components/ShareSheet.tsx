import { Modal, View, Text, TouchableOpacity, StyleSheet, Share, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { apiFetch } from '../services/api';
import { toast } from './Toast';
import * as Clipboard from 'expo-clipboard';

const REPORT_REASONS = [
  'Inappropriate content',
  'Harassment or bullying',
  'Spam or misleading',
  'Violates community standards',
  'Copyright violation',
  'Other',
];

export default function ShareSheet() {
  const { shareSheetOpen, setShareSheetOpen, currentVideo, token } = useAppStore();

  const videoUrl = currentVideo?.file_url || '';
  const shareText = currentVideo?.title
    ? `Check out "${currentVideo.title}" on Talents Stage!`
    : 'Check out this video on Talents Stage!';

  const trackShare = async (platform: string) => {
    if (currentVideo && token) {
      await apiFetch('/videos/' + currentVideo.id + '/share', {
        method: 'POST',
        body: { platform } as unknown as BodyInit,
      }).catch(() => {});
    }
  };

  const enc = (s: string) => encodeURIComponent(s);

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(videoUrl);
    } catch {
      // Fallback silently
    }
    await trackShare('copy_link');
    toast('Link copied!');
    setShareSheetOpen(false);
  };

  const nativeShare = async () => {
    try {
      await Share.share({ message: shareText + ' ' + videoUrl });
      await trackShare('native');
      setShareSheetOpen(false);
    } catch {
      // User cancelled
    }
  };

  const openUrl = async (platform: string, url: string) => {
    await trackShare(platform);
    toast('Opening ' + platform + '…');
    await Linking.openURL(url);
    setShareSheetOpen(false);
  };

  const platforms = [
    { name: 'WhatsApp', icon: 'logo-whatsapp' as const, action: () => openUrl('WhatsApp', `https://wa.me/?text=${enc(shareText + ' ' + videoUrl)}`) },
    { name: 'Facebook', icon: 'logo-facebook' as const, action: () => openUrl('Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(videoUrl)}`) },
    { name: 'X (Twitter)', icon: 'logo-twitter' as const, action: () => openUrl('X', `https://twitter.com/intent/tweet?url=${enc(videoUrl)}&text=${enc(shareText)}`) },
    { name: 'Telegram', icon: 'paper-plane' as const, action: () => openUrl('Telegram', `https://t.me/share/url?url=${enc(videoUrl)}&text=${enc(shareText)}`) },
    { name: 'Share…', icon: 'share-outline' as const, action: nativeShare },
    { name: 'Copy Link', icon: 'copy-outline' as const, action: copyLink },
  ];

  return (
    <Modal visible={shareSheetOpen} transparent animationType="slide" onRequestClose={() => setShareSheetOpen(false)}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShareSheetOpen(false)}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <Text style={styles.title}>Share</Text>
          <View style={styles.grid}>
            {platforms.map((p) => (
              <TouchableOpacity key={p.name} style={styles.item} onPress={p.action}>
                <View style={styles.iconCircle}>
                  <Ionicons name={p.icon} size={26} color="#fff" />
                </View>
                <Text style={styles.label}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export { REPORT_REASONS };

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 16,
    paddingHorizontal: 8,
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'center',
  },
});
