import { Colors } from '@/src/theme/colors';
import { enableNotifications } from '@/lib/notifications';
import { setNotificationPromptShown } from '@/lib/storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
} from 'react-native-reanimated';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

const SPARKLES = [
  { left: '15%', top: 20, delay: 0 },
  { left: '40%', top: 8, delay: 200 },
  { left: '65%', top: 24, delay: 100 },
  { left: '85%', top: 12, delay: 300 },
  { left: '25%', top: 36, delay: 150 },
  { left: '75%', top: 32, delay: 250 },
];

function Sparkle({ left, top, delay }: { left: string; top: number; delay: number }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
          withTiming(0.2, { duration: 600, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      )
    );
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.2, { duration: 600 }),
          withTiming(0.8, { duration: 600 })
        ),
        -1,
        true
      )
    );
  }, [delay, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.sparkle, { left: left as any, top }, style]}>
      <Ionicons name="sparkles" size={18} color={Colors.green} />
    </Animated.View>
  );
}

export default function FirstSyncModal({ visible, onDismiss }: Props) {
  const [permissionDenied, setPermissionDenied] = useState(false);

  const handleEnable = useCallback(async () => {
    const granted = await enableNotifications();
    await setNotificationPromptShown(true);
    if (!granted) {
      setPermissionDenied(true);
      return;
    }
    onDismiss();
  }, [onDismiss]);

  const handleMaybeLater = useCallback(async () => {
    await setNotificationPromptShown(true);
    onDismiss();
  }, [onDismiss]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.sparkleContainer}>
            {SPARKLES.map((s, i) => (
              <Sparkle key={i} {...s} />
            ))}
            <View style={styles.trophyCircle}>
              <Ionicons name="trophy" size={36} color={Colors.green} />
            </View>
          </View>

          <Text style={styles.headline}>Your first sync is done!</Text>

          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>+50 XP</Text>
            <Text style={styles.xpLabel}>First Sync Bonus</Text>
          </View>

          <Text style={styles.pitch}>
            We can remind you each evening to sync — tracking your spends daily helps you stay on budget and unlock badges faster.
          </Text>

          {permissionDenied && (
            <View style={styles.deniedBanner}>
              <Ionicons name="information-circle" size={16} color={Colors.textMuted} />
              <Text style={styles.deniedText}>
                Notifications are blocked. Enable them in your device's Settings app to receive reminders.
              </Text>
            </View>
          )}

          <Pressable style={styles.enableButton} onPress={handleEnable}>
            <Ionicons name="notifications" size={18} color={Colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.enableButtonText}>Enable Reminders</Text>
          </Pressable>

          <Pressable style={styles.laterButton} onPress={handleMaybeLater}>
            <Text style={styles.laterButtonText}>Maybe Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 8, 0.96)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 28,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  sparkleContainer: {
    width: '100%',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sparkle: {
    position: 'absolute',
  },
  trophyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.greenBg,
    borderWidth: 2,
    borderColor: Colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textHeading,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  xpBadge: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    alignItems: 'center',
    marginBottom: 16,
  },
  xpText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.green,
  },
  xpLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  pitch: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  deniedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  deniedText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: Colors.greenDark,
  },
  enableButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  laterButton: {
    marginTop: 10,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  laterButtonText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});
