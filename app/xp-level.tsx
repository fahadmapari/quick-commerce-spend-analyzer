import { getLevelProgress, xpReasonLabel } from '@/lib/gamification';
import { getGamificationState } from '@/lib/storage';
import { Colors } from '@/src/theme/colors';
import { GamificationState, XpEvent } from '@/types/gamification';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function getDateKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

type EarnRow = { label: string; xp: string; note?: string };
type EarnGroup = { title: string; rows: EarnRow[]; highlight?: boolean };

const EARN_GROUPS: EarnGroup[] = [
  {
    title: 'Syncing',
    highlight: true,
    rows: [
      { label: 'Sync on a new day', xp: '+10 XP' },
      { label: 'Sync finds new orders', xp: '+15 XP' },
      { label: 'First ever sync', xp: '+50 XP', note: 'once' },
    ],
  },
  {
    title: 'Budgeting & Spending',
    rows: [
      { label: 'Month under budget', xp: '+60 XP' },
      { label: 'Month under 90% of budget', xp: '+30 XP', note: 'bonus' },
      { label: 'Spend less than last month', xp: '+40 XP' },
      { label: 'Budget streak — 3 months', xp: '+50 XP' },
      { label: 'Budget streak — 6 months', xp: '+100 XP' },
      { label: 'Budget streak — 12 months', xp: '+200 XP' },
      { label: 'Set your first budget', xp: '+20 XP', note: 'once' },
    ],
  },
  {
    title: 'Quests & Badges',
    rows: [
      { label: 'Complete a monthly quest', xp: '+40–60 XP' },
      { label: 'Complete all 3 quests (perfect month)', xp: '+75 XP', note: 'bonus' },
      { label: 'Unlock a Bronze badge', xp: '+20 XP' },
      { label: 'Unlock a Silver badge', xp: '+35 XP' },
      { label: 'Unlock a Gold badge', xp: '+50 XP' },
      { label: 'Unlock a Platinum badge', xp: '+75 XP' },
    ],
  },
];

export default function XpLevelScreen() {
  const [gamState, setGamState] = useState<GamificationState | null>(null);

  useFocusEffect(
    useCallback(() => {
      getGamificationState().then(setGamState);
    }, [])
  );

  const progress = gamState ? getLevelProgress(gamState.totalXp) : null;

  // Build history grouped by day
  const groupedEvents: { dateKey: string; events: XpEvent[] }[] = [];
  if (gamState && gamState.xpEvents.length > 0) {
    const sorted = [...gamState.xpEvents].reverse();
    for (const event of sorted) {
      const dk = getDateKey(event.createdAt);
      const last = groupedEvents[groupedEvents.length - 1];
      if (last && last.dateKey === dk) {
        last.events.push(event);
      } else {
        groupedEvents.push({ dateKey: dk, events: [event] });
      }
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      {progress && (
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeNum}>{progress.level}</Text>
          </View>
          <Text style={styles.heroLevelName}>{progress.name}</Text>
          <Text style={styles.heroTotalXp}>{gamState!.totalXp} XP total</Text>

          <View style={styles.heroProgressTrack}>
            <View
              style={[
                styles.heroProgressFill,
                { width: `${Math.max(progress.ratio * 100, 2)}%` as any },
              ]}
            />
          </View>
          <Text style={styles.heroProgressLabel}>
            {progress.current} / {progress.needed} XP to Level {progress.level + 1}
          </Text>
        </View>
      )}

      {/* ── XP History ───────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>XP HISTORY</Text>

      <ScrollView
        style={styles.historyScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {groupedEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="flash-outline" size={28} color={Colors.textDisabled} />
            <Text style={styles.emptyText}>No XP earned yet</Text>
            <Text style={styles.emptyHint}>Sync your accounts to get started!</Text>
          </View>
        ) : (
          groupedEvents.map(({ dateKey, events }) => (
            <View key={dateKey}>
              <Text style={styles.dateHeader}>{dateKey}</Text>
              {events.map((e) => (
                <View key={e.id} style={styles.historyRow}>
                  <View style={styles.historyDot} />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyLabel}>{xpReasonLabel(e.reason)}</Text>
                    <Text style={styles.historyTime}>{formatRelativeDate(e.createdAt)}</Text>
                  </View>
                  <Text style={styles.historyXp}>+{e.xp}</Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* ── How to Earn ──────────────────────────────────────── */}
      <Text style={[styles.sectionHeader, { marginTop: 28 }]}>HOW TO EARN XP</Text>

      <View style={styles.calloutBox}>
        <Ionicons name="flash" size={14} color={Colors.green} />
        <Text style={styles.calloutText}>
          Sync daily to keep earning XP — each new day you sync adds +10 XP, and new orders found add another +15.
        </Text>
      </View>

      {EARN_GROUPS.map((group) => (
        <View key={group.title} style={[styles.earnGroup, group.highlight && styles.earnGroupHighlight]}>
          <Text style={[styles.earnGroupTitle, group.highlight && styles.earnGroupTitleHighlight]}>
            {group.title}
          </Text>
          {group.rows.map((row, i) => (
            <View
              key={row.label}
              style={[styles.earnRow, i < group.rows.length - 1 && styles.earnRowBorder]}
            >
              <Text style={styles.earnLabel}>{row.label}</Text>
              <View style={styles.earnRight}>
                {row.note && <Text style={styles.earnNote}>{row.note}</Text>}
                <Text style={styles.earnXp}>{row.xp}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  content: {
    padding: 16,
  },

  // Hero
  heroCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.greenBg,
    borderWidth: 2,
    borderColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroBadgeNum: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.green,
    fontFamily: mono,
  },
  heroLevelName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textHeading,
    marginBottom: 4,
  },
  heroTotalXp: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: mono,
    marginBottom: 14,
  },
  heroProgressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: Colors.green,
    borderRadius: 3,
  },
  heroProgressLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: mono,
  },

  // Section header
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
    marginBottom: 10,
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  emptyHint: {
    fontSize: 13,
    color: Colors.textDisabled,
    textAlign: 'center',
  },

  // History
  dateHeader: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontFamily: mono,
    marginBottom: 4,
    marginTop: 10,
    letterSpacing: 0.5,
  },
  historyScroll: {
    maxHeight: 220,
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  historyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.green,
  },
  historyInfo: {
    flex: 1,
  },
  historyLabel: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  historyTime: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  historyXp: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.green,
    fontFamily: mono,
  },

  // Callout box
  calloutBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.green,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  calloutText: {
    flex: 1,
    fontSize: 13,
    color: Colors.green,
    lineHeight: 18,
  },

  // Earn groups
  earnGroup: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  earnGroupHighlight: {
    borderColor: Colors.green,
    backgroundColor: Colors.bgCard,
  },
  earnGroupTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textDisabled,
    letterSpacing: 1,
    fontFamily: mono,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  earnGroupTitleHighlight: {
    color: Colors.green,
  },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  earnRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  earnLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    paddingRight: 8,
  },
  earnRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  earnNote: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontFamily: mono,
    backgroundColor: Colors.bgOverlay,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  earnXp: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.green,
    fontFamily: mono,
  },
});
