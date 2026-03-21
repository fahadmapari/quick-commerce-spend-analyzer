import { Colors } from '@/src/theme/colors';
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

export interface XpLevelShareData {
  level: number;
  name: string;
  totalXp: number;
  current: number;
  needed: number;
  ratio: number;
}

interface XpLevelShareModalProps {
  visible: boolean;
  onClose: () => void;
  data: XpLevelShareData;
}

const SHARE_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram' as const, color: '#E1306C' },
  { id: 'x', label: 'X', icon: 'logo-twitter' as const, color: '#ffffff' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp' as const, color: '#25D366' },
  { id: 'more', label: 'More', icon: 'share-outline' as const, color: Colors.green },
] as const;

type SharePlatformId = typeof SHARE_PLATFORMS[number]['id'];

export function XpLevelShareModal({ visible, onClose, data }: XpLevelShareModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const shareText = `I'm Level ${data.level} "${data.name}" with ${data.totalXp} XP on QC Spend Tracker!`;

  async function captureImage(): Promise<string | null> {
    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) return null;
      const dest = `${cacheDirectory}xp_level_${data.level}.png`;
      await copyAsync({ from: uri, to: dest });
      return dest;
    } catch {
      return null;
    }
  }

  async function handleShare(platformId: SharePlatformId) {
    if (sharing) return;
    setSharing(true);

    try {
      const imageUri = await captureImage();

      if (platformId === 'more') {
        if (imageUri) {
          await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            dialogTitle: 'Share Level',
          });
        }
        return;
      }

      if (platformId === 'instagram') {
        if (imageUri) {
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

          {/* Shareable level card */}
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1, result: 'tmpfile' }}
            style={styles.shareCard}
          >
            <View style={styles.shareCardInner}>
              {/* Level circle */}
              <View style={styles.levelCircle}>
                <Text style={styles.levelNum}>{data.level}</Text>
              </View>

              {/* Level name */}
              <Text style={styles.shareLevelName}>{data.name}</Text>
              <Text style={styles.shareTotalXp}>{data.totalXp} XP</Text>

              {/* Progress bar */}
              <View style={styles.shareProgressTrack}>
                <View
                  style={[
                    styles.shareProgressFill,
                    { width: `${Math.max(data.ratio * 100, 2)}%` as any },
                  ]}
                />
              </View>
              <Text style={styles.shareProgressLabel}>
                {data.current} / {data.needed} XP to Level {data.level + 1}
              </Text>

              {/* Branding */}
              <View style={styles.branding}>
                <Ionicons name="flash" size={12} color={Colors.green} />
                <Text style={styles.brandingText}>QC Spend Tracker</Text>
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
    gap: 8,
  },
  levelCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.greenBg,
    borderWidth: 2,
    borderColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  levelNum: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.green,
    fontFamily: mono,
  },
  shareLevelName: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: mono,
    color: Colors.textHeading,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  shareTotalXp: {
    fontSize: 14,
    fontFamily: mono,
    color: Colors.textMuted,
  },
  shareProgressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  shareProgressFill: {
    height: '100%',
    backgroundColor: Colors.green,
    borderRadius: 3,
  },
  shareProgressLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: mono,
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
