import { MonthlyBar } from '@/components/monthly-bar';
import { MonthlyLineChart } from '@/components/monthly-line-chart';
import { computeAnalytics, formatCurrency, formatSyncDate } from '@/lib/analytics';
import { requestBlinkitSessionReset } from '@/lib/sessionReset';
import { clearOrders, getOrdersAsObjects } from '@/lib/storage';
import { Colors } from '@/src/theme/colors';
import { AnalyticsSummary } from '@/types/order';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

export default function DashboardScreen() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar');
  const [barRange, setBarRange] = useState<BarRange>('1Y');
  const [lifetimeChunk, setLifetimeChunk] = useState(LIFETIME_PAGE);
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { orders, lastSyncedAt } = await getOrdersAsObjects();
        if (!active) return;
        setSummary(computeAnalytics(orders, lastSyncedAt));
      })();
      return () => { active = false; };
    }, [])
  );

  const hasData = summary && summary.totalOrders > 0;
  const avgOrder = hasData
    ? Math.round(summary.lifetimeSpend / summary.totalOrders)
    : 0;

  const handleClearData = async () => {
    await clearOrders();
    await requestBlinkitSessionReset();
    setSummary(null);
    setConfirmVisible(false);
  };

  // Slice monthlyBreakdown (newest-first) for the bar chart
  const barSliceCount = (() => {
    if (!hasData) return 0;
    const range = BAR_RANGES.find((r) => r.key === barRange);
    if (!range || range.months === null) return lifetimeChunk;
    return range.months;
  })();
  const barData = hasData ? summary.monthlyBreakdown.slice(0, barSliceCount) : [];
  const hasMoreLifetime =
    hasData && barRange === 'lifetime' && lifetimeChunk < summary.monthlyBreakdown.length;
  const maxMonthly = barData.length > 0 ? Math.max(...barData.map((m) => m.total)) : 0;

  // Line chart always shows last 12 months
  const lineData = hasData ? summary.monthlyBreakdown.slice(0, 12) : [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        {/* Left: title */}
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>BLINKIT SPEND</Text>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </View>

        {/* Right: account icon */}
        <TouchableOpacity
          style={styles.accountBtn}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="person" size={17} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Dropdown menu */}
      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
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
              This will erase all synced orders and reset the Blinkit web session so the current account is logged out.
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

      {hasData ? (
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
            <Text style={styles.heroAmount}>{formatCurrency(summary.lifetimeSpend)}</Text>
            {summary.lastSyncedAt && (
              <View style={{ alignSelf: 'flex-start', gap: 6 }}>
                <View style={styles.syncRow}>
                  <Text style={styles.syncLabel}>Last sync at</Text>
                  <Text style={styles.syncDate}>{formatSyncDate(summary.lastSyncedAt)}</Text>
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
                <Text style={styles.heroStatValue}>{summary.totalOrders}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>AVG ORDER</Text>
                <Text style={styles.heroStatValue}>{formatCurrency(avgOrder)}</Text>
              </View>
            </View>
          </View>

          {/* Most / Least spent month */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Last 12 months</Text>
              <Text style={styles.cardSubtitle}>HIGHLIGHTS</Text>
            </View>
            <View style={styles.highlightRow}>
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>MOST SPENT</Text>
                <Text style={styles.highlightMonth}>{summary.mostSpentMonth?.month ?? '—'}</Text>
                <Text style={styles.highlightAmount}>{summary.mostSpentMonth ? formatCurrency(summary.mostSpentMonth.total) : '—'}</Text>
                <Text style={styles.highlightOrders}>{summary.mostSpentMonth ? `${summary.mostSpentMonth.orderCount} orders` : ''}</Text>
              </View>
              <View style={styles.highlightDivider} />
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>LEAST SPENT</Text>
                <Text style={styles.highlightMonth}>{summary.leastSpentMonth?.month ?? '—'}</Text>
                <Text style={styles.highlightAmount}>{summary.leastSpentMonth ? formatCurrency(summary.leastSpentMonth.total) : '—'}</Text>
                <Text style={styles.highlightOrders}>{summary.leastSpentMonth ? `${summary.leastSpentMonth.orderCount} orders` : ''}</Text>
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
            Go to the <Text style={styles.emptyAccent}>Sync</Text> tab, log into Blinkit if needed,
            and we will open order history and extract your data automatically.
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
  accountBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
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
});
