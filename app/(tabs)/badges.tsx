import { BadgeCard } from '@/components/badge-card';
import { BadgeShareModal } from '@/components/badge-share-modal';
import { computeBadges, getNewlyUnlockedBadges } from '@/lib/badges';
import { awardXpBatch, makeXpEvent } from '@/lib/gamification';
import { getGamificationState, getAllOrdersAsObjects } from '@/lib/storage';
import { Colors } from '@/src/theme/colors';
import { BadgeCategory, BadgeProgress, CATEGORY_LABELS } from '@/types/badge';
import { XpEvent } from '@/types/gamification';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

const CATEGORY_ORDER: BadgeCategory[] = [
  'spending', 'orders', 'single_order', 'monthly_spend', 'streak', 'frequency',
];

export default function BadgesScreen() {
  const [badges, setBadges] = useState<BadgeProgress[]>([]);
  const [shareBadge, setShareBadge] = useState<BadgeProgress | null>(null);
  const [xpGains, setXpGains] = useState<XpEvent[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { orders } = await getAllOrdersAsObjects();
        if (!active) return;
        const computed = computeBadges(orders);
        setBadges(computed);

        // Award XP for newly unlocked badges
        const gamState = await getGamificationState();
        const newBadges = getNewlyUnlockedBadges(computed, gamState);
        if (newBadges.length > 0) {
          const events = newBadges.map((b) =>
            makeXpEvent(
              `badge:unlock:${b.badge.id}`,
              'badge_unlock',
              b.badge.xp,
              { badgeId: b.badge.id, tier: b.badge.tier }
            )
          );
          const { awarded } = await awardXpBatch(events);
          if (active && awarded.length > 0) setXpGains(awarded);
        }
      })();
      return () => { active = false; };
    }, [])
  );

  const unlocked = badges.filter((b) => b.unlocked);
  const locked = badges.filter((b) => !b.unlocked);
  const totalCount = badges.length;

  // Group locked badges by category
  const groupedLocked = new Map<BadgeCategory, BadgeProgress[]>();
  for (const b of locked) {
    const list = groupedLocked.get(b.badge.category) ?? [];
    list.push(b);
    groupedLocked.set(b.badge.category, list);
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>ACHIEVEMENTS</Text>
          <Text style={styles.headerTitle}>Badges</Text>
        </View>
        <View style={styles.counterPill}>
          <Text style={styles.counterText}>
            {unlocked.length} / {totalCount}
          </Text>
        </View>
      </View>

      {/* Overall progress */}
      <View style={styles.overallBar}>
        <View
          style={[
            styles.overallFill,
            { width: totalCount > 0 ? `${(unlocked.length / totalCount) * 100}%` : '0%' },
          ]}
        />
      </View>

      {/* Unlocked badges section */}
      {unlocked.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Unlocked</Text>
            <Text style={styles.sectionCount}>{unlocked.length}</Text>
          </View>
          <View style={styles.grid}>
            {unlocked.map((item) => (
              <View key={item.badge.id} style={styles.gridItem}>
                <BadgeCard progress={item} onShare={setShareBadge} />
              </View>
            ))}
            {unlocked.length % 2 !== 0 && <View style={styles.gridItem} />}
          </View>
        </View>
      )}

      {/* Locked badges grouped by category */}
      {locked.length > 0 && (
        <>
          {unlocked.length > 0 && <View style={styles.divider} />}
          {CATEGORY_ORDER.map((cat) => {
            const items = groupedLocked.get(cat);
            if (!items || items.length === 0) return null;

            return (
              <View key={cat} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{CATEGORY_LABELS[cat]}</Text>
                  <Text style={styles.sectionCount}>{items.length} locked</Text>
                </View>
                <View style={styles.grid}>
                  {items.map((item) => (
                    <View key={item.badge.id} style={styles.gridItem}>
                      <BadgeCard progress={item} onShare={setShareBadge} />
                    </View>
                  ))}
                  {items.length % 2 !== 0 && <View style={styles.gridItem} />}
                </View>
              </View>
            );
          })}
        </>
      )}

      {xpGains.length > 0 && (
        <View style={styles.xpBanner}>
          <Text style={styles.xpBannerAmount}>
            +{xpGains.reduce((s, e) => s + e.xp, 0)} XP
          </Text>
          <Text style={styles.xpBannerDetail}>
            {xpGains.length} badge{xpGains.length > 1 ? 's' : ''} unlocked
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Sync more orders to unlock badges</Text>
      </View>

      {shareBadge && (
        <BadgeShareModal
          visible={!!shareBadge}
          onClose={() => setShareBadge(null)}
          progress={shareBadge}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 50,
    marginBottom: 16,
  },
  headerLabel: {
    fontSize: 10,
    fontFamily: mono,
    color: Colors.textDisabled,
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textHeading,
    letterSpacing: -0.5,
  },
  counterPill: {
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  counterText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: mono,
    color: Colors.green,
  },
  overallBar: {
    height: 4,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 28,
  },
  overallFill: {
    height: '100%',
    backgroundColor: Colors.green,
    borderRadius: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: mono,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: mono,
    color: Colors.textDisabled,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginBottom: 24,
  },
  xpBanner: {
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    alignItems: 'center',
    gap: 2,
  },
  xpBannerAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.green,
    letterSpacing: -0.3,
  },
  xpBannerDetail: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 11,
    fontFamily: mono,
    color: Colors.textDisabled,
    letterSpacing: 0.5,
  },
});
