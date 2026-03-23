import { MonthlyBar } from '@/components/monthly-bar';
import { MonthlyLineChart } from '@/components/monthly-line-chart';
import { computeAnalytics, formatCurrency, formatSyncDate } from '@/lib/analytics';
import { computeBadges, getNewlyUnlockedBadges } from '@/lib/badges';
import { awardXpBatch, evaluateClosedMonths, getLevelName, getLevelProgress, makeXpEvent, xpReasonLabel } from '@/lib/gamification';
import { ensureMonthlyQuests, refreshQuestProgress, awardCompletedQuestXp, QuestProgressInputs } from '@/lib/quests';
import { requestSessionReset } from '@/lib/sessionReset';
import { clearAllOrders, clearOrdersOnly, getGamificationState, getMonthlyBudget, getAllOrdersAsObjects, getOrdersAsObjects, getStoredAccountIdentity, setMonthlyBudget as saveMonthlyBudget } from '@/lib/storage';
import { getSelectedPlatforms } from '@/lib/platformSettings';
import { Colors } from '@/src/theme/colors';
import { PlatformId, ALL_PLATFORMS, PLATFORM_CONFIGS } from '@/types/platform';
import { AnalyticsSummary } from '@/types/order';
import { GamificationState, MonthlyQuest, XpEvent } from '@/types/gamification';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

type BarRange = '3M' | '6M' | '1Y' | '2Y' | 'lifetime';
const BAR_RANGES: { label: string; key: BarRange; months: number | null }[] = [
  { label: '3M',       key: '3M',       months: 3  },
  { label: '6M',       key: '6M',       months: 6  },
  { label: '1Y',       key: '1Y',       months: 12 },
  { label: '2Y',       key: '2Y',       months: 24 },
  { label: 'Lifetime', key: 'lifetime', months: null },
];
const LIFETIME_PAGE = 12;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });


export default function DashboardScreen() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [monthlyBudget, setMonthlyBudgetState] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar');
  const [barRange, setBarRange] = useState<BarRange>('1Y');
  const [lifetimeChunk, setLifetimeChunk] = useState(LIFETIME_PAGE);
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const [gamState, setGamState] = useState<GamificationState | null>(null);
  const [quests, setQuests] = useState<MonthlyQuest[]>([]);
  const [recentXp, setRecentXp] = useState<XpEvent[]>([]);
  const [levelCardExpanded, setLevelCardExpanded] = useState(false);
  const [levelUpVisible, setLevelUpVisible] = useState(false);
  const [newLevel, setNewLevel] = useState(0);
  const [accountIdentity, setAccountIdentity] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<PlatformId | 'all'>('all');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const platforms = await getSelectedPlatforms();
        if (!active) return;
        setSelectedPlatforms(platforms.length > 0 ? platforms : ALL_PLATFORMS);

        // Always fetch all orders for gamification (budget, XP, quests, badges)
        const { orders: allOrders, lastSyncedAt: allSyncedAt } = await getAllOrdersAsObjects();

        // Fetch display-filtered orders for analytics UI
        const { orders: displayOrders, lastSyncedAt } = platformFilter === 'all'
          ? { orders: allOrders, lastSyncedAt: allSyncedAt }
          : await getOrdersAsObjects(platformFilter);

        const [storedBudget, ...identities] = await Promise.all([
          getMonthlyBudget(),
          ...ALL_PLATFORMS.map((p) => getStoredAccountIdentity(p)),
        ]);
        if (!active) return;

        // Build combined identity string
        const identityParts = ALL_PLATFORMS
          .map((p, i) => identities[i] ? `${PLATFORM_CONFIGS[p].displayName}: ${identities[i]}` : null)
          .filter(Boolean);
        setAccountIdentity(identityParts.length > 0 ? identityParts.join('\n') : null);

        setSummary(computeAnalytics(displayOrders, lastSyncedAt));
        setMonthlyBudgetState(storedBudget);

        // ── Gamification ──
        const now = new Date();
        const gs = await getGamificationState();

        // Backfill: first sync XP if user already has data
        if (allOrders.length > 0 && !gs.xpEvents.some((e) => e.id === 'sync:first_success')) {
          const backfillEvents: XpEvent[] = [
            makeXpEvent('sync:first_success', 'first_sync_success', 50),
          ];
          // Backfill badge XP for already unlocked badges
          const badges = computeBadges(allOrders);
          const newBadges = getNewlyUnlockedBadges(badges, gs);
          for (const b of newBadges) {
            backfillEvents.push(
              makeXpEvent(`badge:unlock:${b.badge.id}`, 'badge_unlock', b.badge.xp, {
                badgeId: b.badge.id,
                tier: b.badge.tier,
              })
            );
          }
          // First budget XP
          if (storedBudget !== null && !gs.xpEvents.some((e) => e.id === 'budget:first_set')) {
            backfillEvents.push(makeXpEvent('budget:first_set', 'set_first_budget', 20));
          }
          await awardXpBatch(backfillEvents);
        }

        // Month-end evaluations
        await evaluateClosedMonths(now, allOrders, storedBudget);

        // Ensure monthly quests
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
        const prevMonthOrders = allOrders.filter(
          (o) => o.date.getFullYear() === prevMonth.getFullYear() && o.date.getMonth() === prevMonth.getMonth()
        );
        const currentQuests = await ensureMonthlyQuests(now, {
          lastMonthOrderCount: prevMonthOrders.length,
        });

        // Refresh quest progress
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const prevMonthSpend = prevMonthOrders.reduce((s, o) => s + o.amount, 0);
        const latestGs = await getGamificationState();
        const badges = computeBadges(allOrders);

        const qInputs: QuestProgressInputs = {
          orders: allOrders,
          monthlyBudget: storedBudget,
          badges,
          syncHistory: latestGs.syncHistory,
          currentMonthKey: monthKey,
          previousMonthSpend: prevMonthSpend,
          previousMonthOrderCount: prevMonthOrders.length,
        };
        const updatedQuests = await refreshQuestProgress(now, qInputs);
        await awardCompletedQuestXp(updatedQuests);

        // Reload final state + check for level-up
        const finalGs = await getGamificationState();
        if (!active) return;
        const currentLevel = getLevelProgress(finalGs.totalXp).level;
        if (finalGs.lastLevelUpSeen !== undefined && currentLevel > finalGs.lastLevelUpSeen) {
          setNewLevel(currentLevel);
          setLevelUpVisible(true);
        }
        finalGs.lastLevelUpSeen = currentLevel;
        setGamState(finalGs);
        setQuests(updatedQuests);
        setRecentXp(finalGs.xpEvents.slice(-5).reverse());
      })();
      return () => { active = false; };
    }, [platformFilter])
  );

  const populatedSummary = summary && summary.totalOrders > 0 ? summary : null;
  const hasData = populatedSummary !== null;
  const avgOrder = populatedSummary
    ? Math.round(populatedSummary.lifetimeSpend / populatedSummary.totalOrders)
    : 0;
  const now = new Date();
  const currentMonthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const currentMonthEntry = populatedSummary
    ? populatedSummary.monthlyBreakdown.find(
      (entry) => entry.year === now.getFullYear() && entry.monthIndex === now.getMonth()
    )
    : null;
  const currentMonthSpend = currentMonthEntry?.total ?? 0;
  const currentMonthOrders = currentMonthEntry?.orderCount ?? 0;
  const budgetProgress = monthlyBudget ? Math.min(currentMonthSpend / monthlyBudget, 1) : 0;
  const budgetPercent = monthlyBudget ? Math.round((currentMonthSpend / monthlyBudget) * 100) : 0;
  const isOverBudget = monthlyBudget !== null && currentMonthSpend > monthlyBudget;
  const remainingBudget = monthlyBudget !== null ? monthlyBudget - currentMonthSpend : null;

  const handleClearData = async () => {
    await clearAllOrders();
    for (const p of ALL_PLATFORMS) {
      await requestSessionReset(p);
    }
    setSummary(null);
    setMonthlyBudgetState(null);
    setConfirmVisible(false);
  };

  const openBudgetModal = () => {
    setBudgetInput(monthlyBudget ? String(monthlyBudget) : '');
    setBudgetError('');
    setBudgetModalVisible(true);
  };

  const handleSaveBudget = async () => {
    const parsed = parseInt(budgetInput.replace(/,/g, '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setBudgetError('Enter a valid monthly budget in rupees.');
      return;
    }

    const wasNull = monthlyBudget === null;
    await saveMonthlyBudget(parsed);
    setMonthlyBudgetState(parsed);
    setBudgetError('');
    setBudgetModalVisible(false);

    // Award first budget XP
    if (wasNull) {
      const { awarded, state } = await awardXpBatch([
        makeXpEvent('budget:first_set', 'set_first_budget', 20),
      ]);
      if (awarded.length > 0) setGamState(state);
    }
  };

  const handleRemoveBudget = async () => {
    await saveMonthlyBudget(null);
    setMonthlyBudgetState(null);
    setBudgetInput('');
    setBudgetError('');
    setBudgetModalVisible(false);
  };

  // Slice monthlyBreakdown (newest-first) for the bar chart
  const barSliceCount = (() => {
    if (!hasData) return 0;
    const range = BAR_RANGES.find((r) => r.key === barRange);
    if (!range || range.months === null) return lifetimeChunk;
    return range.months;
  })();
  const barData = populatedSummary ? populatedSummary.monthlyBreakdown.slice(0, barSliceCount) : [];
  const hasMoreLifetime =
    populatedSummary !== null && barRange === 'lifetime' && lifetimeChunk < populatedSummary.monthlyBreakdown.length;
  const maxMonthly = barData.length > 0 ? Math.max(...barData.map((m) => m.total)) : 0;

  // Line chart always shows last 12 months
  const lineData = populatedSummary ? populatedSummary.monthlyBreakdown.slice(0, 12) : [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        {/* Left: title */}
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>QC SPEND TRACKER</Text>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </View>

        {/* Right: XP pill + account icon */}
        <View style={styles.headerRight}>
          {gamState && (
            <TouchableOpacity onPress={() => router.push('/xp-level')} activeOpacity={0.75}>
              <View style={styles.headerXpPill}>
                <Ionicons name="flash" size={12} color={Colors.green} />
                <Text style={styles.headerXpPillText}>Lv.{getLevelProgress(gamState.totalXp).level}</Text>
                <View style={styles.headerXpDot} />
                <Text style={styles.headerXpPillText}>{gamState.totalXp} XP</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.accountBtn}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="person" size={17} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Platform filter tabs */}
      <View style={styles.platformTabsContainer}>
        <View style={styles.platformTabs}>
          {(['all', ...ALL_PLATFORMS] as const).map((id) => {
            const isAll = id === 'all';
            const isActive = platformFilter === id;
            const isEnabled = isAll || selectedPlatforms.includes(id as PlatformId);
            return (
              <Pressable
                key={id}
                style={[
                  styles.platformTab,
                  isActive && styles.platformTabActive,
                  !isEnabled && styles.platformTabDisabled,
                ]}
                onPress={() => isEnabled && setPlatformFilter(id)}
                disabled={!isEnabled}
              >
                <Text
                  style={[
                    styles.platformTabText,
                    isActive && styles.platformTabTextActive,
                    !isEnabled && styles.platformTabTextDisabled,
                  ]}
                >
                  {isAll ? 'All' : PLATFORM_CONFIGS[id as PlatformId].displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Dropdown menu */}
      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            {accountIdentity && (
              <View style={styles.menuAccountRow}>
                {accountIdentity.split('\n').map((line, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Ionicons name="person-circle-outline" size={15} color={Colors.textMuted} />
                    <Text style={styles.menuAccountText}>{line}</Text>
                  </View>
                ))}
              </View>
            )}
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setConfirmVisible(true);
              }}
            >
              <Text style={styles.menuItemText}>Clear all data</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Confirm clear dialog */}
      <Modal transparent visible={confirmVisible} animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Clear all data?</Text>
            <Text style={styles.confirmBody}>
              This will erase all synced orders and reset all web sessions so the current accounts are logged out.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancel} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmDelete} onPress={handleClearData}>
                <Text style={styles.confirmDeleteText}>Clear data</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={budgetModalVisible} animationType="fade" onRequestClose={() => setBudgetModalVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{monthlyBudget ? 'Edit monthly budget' : 'Set monthly budget'}</Text>
            <Text style={styles.confirmBody}>
              Enter the amount you want to stay within for quick commerce this month.
            </Text>
            <TextInput
              value={budgetInput}
              onChangeText={(text) => {
                setBudgetInput(text.replace(/[^\d]/g, ''));
                if (budgetError) setBudgetError('');
              }}
              placeholder="15000"
              placeholderTextColor={Colors.textPlaceholder}
              keyboardType="number-pad"
              autoFocus
              style={styles.budgetInput}
            />
            {budgetError ? <Text style={styles.budgetError}>{budgetError}</Text> : null}
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancel} onPress={() => setBudgetModalVisible(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.budgetSaveButton} onPress={handleSaveBudget}>
                <Text style={styles.confirmDeleteText}>Save budget</Text>
              </Pressable>
            </View>
            {monthlyBudget !== null ? (
              <Pressable style={styles.budgetRemoveButton} onPress={handleRemoveBudget}>
                <Text style={styles.budgetRemoveText}>Remove budget</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Level Up Modal */}
      <Modal transparent visible={levelUpVisible} animationType="fade" onRequestClose={() => setLevelUpVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.levelUpCard}>
            <View style={styles.levelUpBadge}>
              <Text style={styles.levelUpBadgeText}>{newLevel}</Text>
            </View>
            <Text style={styles.levelUpTitle}>Level Up!</Text>
            <Text style={styles.levelUpName}>{getLevelName(newLevel)}</Text>
            <Text style={styles.levelUpBody}>
              You reached Level {newLevel}. Keep syncing and completing quests to level up.
            </Text>
            <Pressable style={styles.levelUpButton} onPress={() => setLevelUpVisible(false)}>
              <Text style={styles.levelUpButtonText}>Nice!</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {populatedSummary ? (
        <>
          {/* Hero spend card */}
          <View style={styles.heroCard}>
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <Pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                  <Line x1="48" y1="0" x2="48" y2="48" stroke={Colors.borderSubtle} strokeWidth="0.5" />
                  <Line x1="0" y1="48" x2="48" y2="48" stroke={Colors.borderSubtle} strokeWidth="0.5" />
                </Pattern>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#grid)" rx="20" />
            </Svg>
            <Text style={styles.heroLabel}>TOTAL SPENT</Text>
            <Text style={styles.heroAmount}>{formatCurrency(populatedSummary.lifetimeSpend)}</Text>
            {populatedSummary.lastSyncedAt && (
              <View style={{ alignSelf: 'flex-start', gap: 6 }}>
                <View style={styles.syncRow}>
                  <Text style={styles.syncLabel}>Last sync at</Text>
                  <Text style={styles.syncDate}>{formatSyncDate(populatedSummary.lastSyncedAt)}</Text>
                </View>
                <Pressable
                  style={styles.syncButton}
                  onPress={() => router.push('/explore')}
                >
                  <Ionicons name="sync" size={12} color={Colors.textDisabled} />
                  <Text style={styles.syncButtonText}>Sync</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>ORDERS</Text>
                <Text style={styles.heroStatValue}>{populatedSummary.totalOrders}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>AVG ORDER</Text>
                <Text style={styles.heroStatValue}>{formatCurrency(avgOrder)}</Text>
              </View>
            </View>
          </View>

          {/* Level + XP Card (collapsible) — only shown for "All" filter */}
          {gamState && platformFilter === 'all' && (
            <Pressable style={styles.card} onPress={() => setLevelCardExpanded((v) => !v)}>
              <View style={styles.levelRow}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>{getLevelProgress(gamState.totalXp).level}</Text>
                </View>
                <View style={styles.levelInfo}>
                  <Text style={styles.levelName}>{getLevelProgress(gamState.totalXp).name}</Text>
                  <Text style={styles.levelXpText}>
                    Level {getLevelProgress(gamState.totalXp).level}  ·  {getLevelProgress(gamState.totalXp).current} / {getLevelProgress(gamState.totalXp).needed} XP
                  </Text>
                </View>
                <Ionicons
                  name={levelCardExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textMuted}
                />
              </View>
              <View style={styles.levelProgressTrack}>
                <View
                  style={[
                    styles.levelProgressFill,
                    { width: `${Math.max(getLevelProgress(gamState.totalXp).ratio * 100, 2)}%` },
                  ]}
                />
              </View>

              {levelCardExpanded && (
                <>
                  {/* Monthly Quests */}
                  {quests.length > 0 && (
                    <View style={styles.questSection}>
                      <Text style={styles.questSectionTitle}>MONTHLY QUESTS</Text>
                      {quests.map((q) => (
                        <View key={q.id} style={styles.questRow}>
                          <View style={[styles.questCheck, q.completed && styles.questCheckDone]}>
                            {q.completed && <Ionicons name="checkmark" size={11} color={Colors.white} />}
                          </View>
                          <View style={styles.questInfo}>
                            <Text style={[styles.questTitle, q.completed && styles.questTitleDone]}>{q.title}</Text>
                            <Text style={styles.questDesc}>{q.description}</Text>
                          </View>
                          <View style={styles.questXpPill}>
                            <Text style={styles.questXpText}>
                              {q.completed ? `+${q.xp}` : `${q.xp} XP`}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Recent XP Gains */}
                  {recentXp.length > 0 && (
                    <View style={styles.recentSection}>
                      <Text style={styles.questSectionTitle}>RECENT</Text>
                      <View style={styles.recentRow}>
                        {recentXp.slice(0, 3).map((e) => (
                          <View key={e.id} style={styles.recentChip}>
                            <Text style={styles.recentChipText}>+{e.xp} {xpReasonLabel(e.reason)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* See full history */}
                  <Pressable
                    style={styles.levelSeeMore}
                    onPress={() => router.push('/xp-level')}
                  >
                    <Text style={styles.levelSeeMoreText}>View full history & ways to earn</Text>
                    <Ionicons name="chevron-forward" size={12} color={Colors.green} />
                  </Pressable>
                </>
              )}
            </Pressable>
          )}

          {/* Current Month Spend — only shown for individual platform filter */}
          {platformFilter !== 'all' && (
            <View style={styles.card}>
              <Text style={styles.cardSubtitle}>THIS MONTH</Text>
              <Text style={styles.cardTitle}>{currentMonthLabel}</Text>
              <Text style={styles.budgetCurrentSpend}>{formatCurrency(currentMonthSpend)}</Text>
              <Text style={styles.currentMonthOrders}>{currentMonthOrders} {currentMonthOrders === 1 ? 'order' : 'orders'}</Text>
            </View>
          )}

          {/* Monthly Budget — only shown for "All" filter */}
          {platformFilter === 'all' && <View style={styles.card}>
            <View style={styles.budgetHeader}>
              <View style={styles.budgetHeaderCopy}>
                <Text style={styles.cardSubtitle}>MONTHLY BUDGET</Text>
                <Text style={styles.cardTitle}>{currentMonthLabel}</Text>
              </View>
              <Pressable style={styles.budgetEditButton} onPress={openBudgetModal}>
                <Text style={styles.budgetEditButtonText}>{monthlyBudget !== null ? 'Edit budget' : 'Set budget'}</Text>
              </Pressable>
            </View>

            <View style={styles.budgetValuesRow}>
              <View style={styles.budgetValueBlock}>
                <Text style={styles.budgetValueLabel}>Current spend</Text>
                <Text style={styles.budgetCurrentSpend}>{formatCurrency(currentMonthSpend)}</Text>
              </View>
              <View style={styles.highlightDivider} />
              <View style={styles.budgetValueBlock}>
                <Text style={styles.budgetValueLabel}>Set budget</Text>
                <Text style={[styles.budgetBudgetValue, monthlyBudget === null && styles.budgetBudgetValueEmpty]}>
                  {monthlyBudget !== null ? formatCurrency(monthlyBudget) : 'Not set'}
                </Text>
              </View>
            </View>

            {monthlyBudget !== null ? (
              <View style={styles.budgetMetaRow}>
                <Text style={[styles.budgetMetaText, isOverBudget && styles.budgetMetaTextOver]}>
                  {isOverBudget
                    ? `${formatCurrency(currentMonthSpend - monthlyBudget)} over budget`
                    : `${formatCurrency(Math.max(remainingBudget ?? 0, 0))} left this month`}
                </Text>
                <Text style={[styles.budgetMetaPercent, isOverBudget && styles.budgetMetaTextOver]}>
                  {budgetPercent}% used
                </Text>
              </View>
            ) : (
              <Text style={styles.budgetEmptyText}>
                Set a budget to track how much of this month&apos;s spending has already been used.
              </Text>
            )}

            <View style={styles.budgetProgressTrack}>
              <View
                style={[
                  styles.budgetProgressFill,
                  { width: `${budgetProgress * 100}%` },
                  monthlyBudget !== null && (isOverBudget ? styles.budgetProgressFillOver : styles.budgetProgressFillActive),
                ]}
              />
            </View>
          </View>}

          {/* Most / Least spent month */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Last 12 months</Text>
              <Text style={styles.cardSubtitle}>HIGHLIGHTS</Text>
            </View>
            <View style={styles.highlightRow}>
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>MOST SPENT</Text>
                <Text style={styles.highlightMonth}>{populatedSummary.mostSpentMonth?.month ?? '—'}</Text>
                <Text style={styles.highlightAmount}>{populatedSummary.mostSpentMonth ? formatCurrency(populatedSummary.mostSpentMonth.total) : '—'}</Text>
                <Text style={styles.highlightOrders}>{populatedSummary.mostSpentMonth ? `${populatedSummary.mostSpentMonth.orderCount} orders` : ''}</Text>
              </View>
              <View style={styles.highlightDivider} />
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>LEAST SPENT</Text>
                <Text style={styles.highlightMonth}>{populatedSummary.leastSpentMonth?.month ?? '—'}</Text>
                <Text style={styles.highlightAmount}>{populatedSummary.leastSpentMonth ? formatCurrency(populatedSummary.leastSpentMonth.total) : '—'}</Text>
                <Text style={styles.highlightOrders}>{populatedSummary.leastSpentMonth ? `${populatedSummary.leastSpentMonth.orderCount} orders` : ''}</Text>
              </View>
            </View>
          </View>

          {/* Monthly breakdown */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Monthly breakdown</Text>
              <View style={styles.chartToggle}>
                <Pressable
                  style={[styles.toggleBtn, chartMode === 'bar' && styles.toggleBtnActive]}
                  onPress={() => setChartMode('bar')}
                >
                  <Text style={[styles.toggleBtnText, chartMode === 'bar' && styles.toggleBtnTextActive]}>Bar</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, chartMode === 'line' && styles.toggleBtnActive]}
                  onPress={() => setChartMode('line')}
                >
                  <Text style={[styles.toggleBtnText, chartMode === 'line' && styles.toggleBtnTextActive]}>Line</Text>
                </Pressable>
              </View>
            </View>

            {/* Range filter — bar mode only */}
            {chartMode === 'bar' && (
              <View style={styles.rangeRow}>
                {BAR_RANGES.map((r) => (
                  <Pressable
                    key={r.key}
                    style={[styles.rangePill, barRange === r.key && styles.rangePillActive]}
                    onPress={() => {
                      setBarRange(r.key);
                      if (r.key !== 'lifetime') setLifetimeChunk(LIFETIME_PAGE);
                    }}
                  >
                    <Text style={[styles.rangePillText, barRange === r.key && styles.rangePillTextActive]}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Chart content */}
            {chartMode === 'bar' ? (
              <>
                {barData.map((m) => (
                  <MonthlyBar
                    key={`${m.year}-${m.monthIndex}`}
                    month={m.month}
                    amount={m.total}
                    maxAmount={maxMonthly}
                    orderCount={m.orderCount}
                  />
                ))}
                {hasMoreLifetime && (
                  <Pressable
                    style={styles.showMoreBtn}
                    onPress={() => setLifetimeChunk((c) => c + LIFETIME_PAGE)}
                  >
                    <Text style={styles.showMoreText}>Show more</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <MonthlyLineChart data={lineData} />
            )}
          </View>
        </>
      ) : (
        /* Empty state */
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptyBody}>
            Go to the <Text style={styles.emptyAccent}>Sync</Text> tab, select your platforms,
            and we will extract your order history automatically.
          </Text>
        </View>
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
    paddingTop: 60,
    paddingBottom: 48,
    gap: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 4,
  },
  headerLabel: {
    fontSize: 11,
    color: Colors.textDisabled,
    letterSpacing: 1.4,
    fontFamily: mono,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  syncLabel: {
    fontSize: 12,
    color: Colors.textDisabled,
  },
  syncDate: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: mono,
  },
  syncButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.bgOverlay,
  },
  syncButtonText: {
    fontSize: 11,
    fontFamily: mono,
    color: Colors.textDisabled,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerXpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerXpPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.green,
    fontFamily: mono,
  },
  headerXpDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.greenDark,
  },
  accountBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Dropdown menu
  menuOverlay: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 160,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  menuAccountRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  menuAccountText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
  },

  // Confirm dialog
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  confirmCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    gap: 12,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textHeading,
  },
  confirmBody: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 21,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  confirmCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  confirmDelete: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  confirmDeleteText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  budgetInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgBase,
    color: Colors.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  budgetError: {
    fontSize: 12,
    color: Colors.red,
    marginTop: -4,
  },
  budgetSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.green,
    alignItems: 'center',
  },
  budgetRemoveButton: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  budgetRemoveText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: mono,
  },

  // Hero card
  heroCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 24,
    overflow: 'hidden',
  },
  heroLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.4,
    fontFamily: mono,
    marginBottom: 10,
  },
  heroAmount: {
    fontSize: 44,
    fontWeight: '700',
    color: Colors.textHeading,
    letterSpacing: -1.5,
    lineHeight: 48,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 20,
  },
  heroStat: {
    gap: 4,
  },
  heroStatLabel: {
    fontSize: 9,
    color: Colors.textDisabled,
    fontFamily: mono,
    letterSpacing: 1,
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.borderSubtle,
  },

  // Section card
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  cardSubtitle: {
    fontSize: 9,
    color: Colors.textPlaceholder,
    fontFamily: mono,
    letterSpacing: 0.8,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  budgetHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  budgetEditButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgBase,
  },
  budgetEditButtonText: {
    fontSize: 11,
    color: Colors.textPrimary,
    fontFamily: mono,
  },
  budgetValuesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  budgetValueBlock: {
    flex: 1,
    gap: 6,
  },
  budgetValueLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontFamily: mono,
    letterSpacing: 1,
  },
  budgetCurrentSpend: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textHeading,
    letterSpacing: -1,
    lineHeight: 36,
  },
  currentMonthOrders: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: mono,
    marginTop: 4,
  },
  budgetBudgetValue: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  budgetBudgetValueEmpty: {
    color: Colors.textMuted,
  },
  budgetMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 12,
  },
  budgetMetaText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
  },
  budgetMetaTextOver: {
    color: Colors.red,
  },
  budgetMetaPercent: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: mono,
  },
  budgetEmptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 19,
    marginTop: 18,
    marginBottom: 12,
  },
  budgetProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.bgBase,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  budgetProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.borderStrong,
  },
  budgetProgressFillActive: {
    backgroundColor: Colors.green,
  },
  budgetProgressFillOver: {
    backgroundColor: Colors.red,
  },
  chartToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgBase,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  toggleBtnActive: {
    backgroundColor: Colors.bgElevated,
  },
  toggleBtnText: {
    fontSize: 11,
    color: Colors.textDisabled,
    fontFamily: mono,
  },
  toggleBtnTextActive: {
    color: Colors.textPrimary,
  },

  // Range filter
  rangeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  rangePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.bgBase,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rangePillActive: {
    backgroundColor: Colors.bgElevated,
    borderColor: Colors.borderStrong,
  },
  rangePillText: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontFamily: mono,
  },
  rangePillTextActive: {
    color: Colors.textPrimary,
  },
  showMoreBtn: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  showMoreText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: mono,
  },

  // Highlight row
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  highlightItem: {
    flex: 1,
    gap: 4,
  },
  highlightDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: 16,
  },
  highlightLabel: {
    fontSize: 9,
    color: Colors.textDisabled,
    fontFamily: mono,
    letterSpacing: 1.2,
  },
  highlightMonth: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  highlightAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textHeading,
    letterSpacing: -0.5,
  },
  highlightOrders: {
    fontSize: 11,
    color: Colors.textDisabled,
    fontFamily: mono,
  },

  // Level up modal
  levelUpCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  levelUpBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.greenBg,
    borderWidth: 2,
    borderColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  levelUpBadgeText: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.green,
  },
  levelUpTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textHeading,
    letterSpacing: -0.5,
  },
  levelUpName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.green,
    letterSpacing: -0.2,
    marginTop: -4,
  },
  levelUpBody: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  levelUpButton: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: Colors.greenDark,
    paddingHorizontal: 40,
    paddingVertical: 12,
  },
  levelUpButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },

  // Level card
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  levelBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.greenBg,
    borderWidth: 1.5,
    borderColor: Colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.green,
  },
  levelInfo: {
    flex: 1,
    gap: 2,
  },
  levelName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textHeading,
    letterSpacing: -0.3,
  },
  levelXpText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: mono,
  },
  levelProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.bgBase,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 4,
  },
  levelProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.green,
  },
  questSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    gap: 10,
  },
  questSectionTitle: {
    fontSize: 9,
    color: Colors.textDisabled,
    fontFamily: mono,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  questCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questCheckDone: {
    backgroundColor: Colors.greenDark,
    borderColor: Colors.greenDark,
  },
  questInfo: {
    flex: 1,
    gap: 1,
  },
  questTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  questTitleDone: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  questDesc: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
  questXpPill: {
    backgroundColor: Colors.bgBase,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  questXpText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: mono,
    color: Colors.green,
  },
  recentSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    gap: 8,
  },
  recentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recentChip: {
    backgroundColor: Colors.bgBase,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recentChipText: {
    fontSize: 10,
    fontFamily: mono,
    color: Colors.textMuted,
  },
  levelSeeMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  levelSeeMoreText: {
    fontSize: 12,
    color: Colors.green,
    fontFamily: mono,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textHeading,
  },
  emptyBody: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  emptyAccent: {
    color: Colors.green,
    fontWeight: '600',
  },

  // Platform filter tabs
  platformTabsContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  platformTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  platformTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  platformTabActive: {
    backgroundColor: Colors.greenBg,
    borderColor: Colors.greenDark,
  },
  platformTabDisabled: {
    opacity: 0.35,
  },
  platformTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  platformTabTextActive: {
    color: Colors.green,
  },
  platformTabTextDisabled: {
    color: Colors.textDisabled,
  },
});
