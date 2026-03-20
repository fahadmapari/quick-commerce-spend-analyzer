import { Colors } from '@/src/theme/colors';
import { BadgeProgress } from '@/types/badge';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { formatCurrency } from '@/lib/analytics';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface BadgeCardProps {
  progress: BadgeProgress;
}

function formatProgress(current: number, threshold: number, category: string): string {
  if (category === 'spending' || category === 'single_order' || category === 'monthly_spend') {
    return `${formatCurrency(current)} / ${formatCurrency(threshold)}`;
  }
  return `${current} / ${threshold}`;
}

export function BadgeCard({ progress }: BadgeCardProps) {
  const { badge, unlocked, current } = progress;
  const ratio = Math.min(current / badge.threshold, 1);

  return (
    <View style={[styles.card, unlocked && styles.cardUnlocked]}>
      <View style={[styles.iconContainer, unlocked && styles.iconContainerUnlocked]}>
        <Ionicons
          name={badge.icon as any}
          size={28}
          color={unlocked ? Colors.green : Colors.textDisabled}
        />
        {!unlocked && (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={10} color={Colors.textDisabled} />
          </View>
        )}
      </View>

      <Text style={[styles.title, unlocked && styles.titleUnlocked]} numberOfLines={1}>
        {badge.title}
      </Text>

      {unlocked ? (
        <Text style={styles.description} numberOfLines={2}>
          {badge.description}
        </Text>
      ) : (
        <>
          <Text style={styles.progressText} numberOfLines={1}>
            {formatProgress(current, badge.threshold, badge.category)}
          </Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.max(ratio * 100, 2)}%` }]} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.bgBase,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    alignItems: 'center',
    minHeight: 150,
  },
  cardUnlocked: {
    backgroundColor: Colors.bgCard,
    borderColor: Colors.greenDark,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerUnlocked: {
    backgroundColor: Colors.greenBg,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: mono,
    color: Colors.textDisabled,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  titleUnlocked: {
    color: Colors.textHeading,
  },
  description: {
    fontSize: 10,
    fontFamily: mono,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 14,
  },
  progressText: {
    fontSize: 9,
    fontFamily: mono,
    color: Colors.textDisabled,
    letterSpacing: 0.5,
  },
  progressBarBg: {
    width: '100%',
    height: 3,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.greenDark,
    borderRadius: 2,
  },
});
