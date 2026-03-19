import { MonthlyBar } from '@/components/monthly-bar';
import { MonthlyLineChart } from '@/components/monthly-line-chart';
import { computeAnalytics, formatCurrency, formatSyncDate } from '@/lib/analytics';
import { getOrdersAsObjects } from '@/lib/storage';
import { Colors } from '@/src/theme/colors';
import { AnalyticsSummary } from '@/types/order';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

export default function DashboardScreen() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar');

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
  const maxMonthly = hasData
    ? Math.max(...summary.monthlyBreakdown.map((m) => m.total))
    : 0;
  const avgOrder = hasData
    ? Math.round(summary.lifetimeSpend / summary.totalOrders)
    : 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>BLINKIT SPEND</Text>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </View>
        {summary?.lastSyncedAt && (
          <View style={styles.syncPill}>
            <View style={styles.syncDot} />
            <Text style={styles.syncPillText}>
              {formatSyncDate(summary.lastSyncedAt)}
            </Text>
          </View>
        )}
      </View>

      {hasData ? (
        <>
          {/* Hero spend card */}
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>TOTAL SPENT</Text>
            <Text style={styles.heroAmount}>{formatCurrency(summary.lifetimeSpend)}</Text>
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
            {chartMode === 'bar'
              ? summary.monthlyBreakdown.map((m) => (
                  <MonthlyBar
                    key={`${m.year}-${m.monthIndex}`}
                    month={m.month}
                    amount={m.total}
                    maxAmount={maxMonthly}
                    orderCount={m.orderCount}
                  />
                ))
              : <MonthlyLineChart data={summary.monthlyBreakdown} />
            }
          </View>
        </>
      ) : (
        /* Empty state */
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptyBody}>
            Go to the <Text style={styles.emptyAccent}>Orders</Text> tab, navigate to your
            Blinkit order history, and tap <Text style={styles.emptyAccent}>Sync Orders</Text> to get started.
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
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
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.green,
  },
  syncPillText: {
    fontSize: 10,
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
  emptyIcon: {
    fontSize: 44,
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
