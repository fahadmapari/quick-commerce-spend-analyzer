import { Colors } from '@/src/theme/colors';
import { BadgeProgress } from '@/types/badge';
import { CATEGORY_LABELS } from '@/types/badge';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface BadgeShareModalProps {
  visible: boolean;
  onClose: () => void;
  progress: BadgeProgress;
}

const SHARE_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram' as const, color: '#E1306C' },
  { id: 'x', label: 'X', icon: 'logo-twitter' as const, color: '#ffffff' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp' as const, color: '#25D366' },
  { id: 'more', label: 'More', icon: 'share-outline' as const, color: Colors.green },
] as const;

type PlatformId = typeof SHARE_PLATFORMS[number]['id'];

export function BadgeShareModal({ visible, onClose, progress }: BadgeShareModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  const { badge } = progress;

  const shareText = `I unlocked the "${badge.title}" badge on Blinkit Spend Analyzer! ${badge.description}`;

  async function captureImage(): Promise<string | null> {
    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) return null;
      // Copy to a shareable location with .png extension
      const dest = `${cacheDirectory}badge_${badge.id}.png`;
      await copyAsync({ from: uri, to: dest });
      return dest;
    } catch {
      return null;
    }
  }

  async function handleShare(platformId: PlatformId) {
    if (sharing) return;
    setSharing(true);

    try {
      const imageUri = await captureImage();

      if (platformId === 'more') {
        if (imageUri) {
          await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            dialogTitle: 'Share Badge',
          });
        }
        return;
      }

      if (platformId === 'instagram') {
        // Instagram Stories deep link with background image
        if (imageUri) {
          // Try to open share sheet which will show Instagram options
          await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            UTI: 'public.png',
          });
        }
        return;
      }

      if (platformId === 'whatsapp') {
        if (imageUri) {
          await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            dialogTitle: 'Share via WhatsApp',
          });
        }
        return;
      }

      if (platformId === 'x') {
        // Try X app deep link, fallback to web intent
        const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
        const canOpen = await Linking.canOpenURL(xUrl);
        if (canOpen) {
          await Linking.openURL(xUrl);
        } else if (imageUri) {
          await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            dialogTitle: 'Share on X',
          });
        }
        return;
      }
    } catch {
      // Silently fail — user may have cancelled
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Close handle */}
          <View style={styles.handle} />

          {/* Shareable badge card */}
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1, result: 'tmpfile' }}
            style={styles.shareCard}
          >
            <View style={styles.shareCardInner}>
              {/* Badge icon */}
              <View style={styles.shareIconContainer}>
                <Ionicons name={badge.icon as any} size={48} color={Colors.green} />
              </View>

              {/* Badge info */}
              <Text style={styles.shareTitle}>{badge.title}</Text>
              <Text style={styles.shareDescription}>{badge.description}</Text>

              {/* Category tag */}
              <View style={styles.categoryTag}>
                <Text style={styles.categoryTagText}>
                  {CATEGORY_LABELS[badge.category]}
                </Text>
              </View>

              {/* Branding */}
              <View style={styles.branding}>
                <Ionicons name="flash" size={12} color={Colors.green} />
                <Text style={styles.brandingText}>Blinkit Spend Analyzer</Text>
              </View>
            </View>
          </ViewShot>

          {/* Share options */}
          <Text style={styles.shareLabel}>SHARE TO</Text>
          <View style={styles.platformRow}>
            {SHARE_PLATFORMS.map((p) => (
              <Pressable
                key={p.id}
                style={styles.platformButton}
                onPress={() => handleShare(p.id)}
                disabled={sharing}
              >
                <View style={[styles.platformIcon, { borderColor: p.color + '33' }]}>
                  {sharing ? (
                    <ActivityIndicator size="small" color={p.color} />
                  ) : (
                    <Ionicons name={p.icon} size={24} color={p.color} />
                  )}
                </View>
                <Text style={styles.platformLabel}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Cancel */}
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    marginTop: 12,
    marginBottom: 20,
  },

  // Shareable card
  shareCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  shareCardInner: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  shareIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.greenBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  shareTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: mono,
    color: Colors.textHeading,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  shareDescription: {
    fontSize: 13,
    fontFamily: mono,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  categoryTag: {
    backgroundColor: Colors.greenBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  categoryTagText: {
    fontSize: 10,
    fontFamily: mono,
    fontWeight: '600',
    color: Colors.green,
    letterSpacing: 0.5,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    opacity: 0.5,
  },
  brandingText: {
    fontSize: 10,
    fontFamily: mono,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },

  // Share platforms
  shareLabel: {
    fontSize: 10,
    fontFamily: mono,
    color: Colors.textDisabled,
    letterSpacing: 1.6,
    marginTop: 24,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  platformRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  platformButton: {
    alignItems: 'center',
    gap: 8,
  },
  platformIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformLabel: {
    fontSize: 10,
    fontFamily: mono,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },

  // Cancel
  cancelButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.bgOverlay,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: mono,
    color: Colors.textMuted,
  },
});
