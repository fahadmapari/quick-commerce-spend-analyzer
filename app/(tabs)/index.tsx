import { MonthlyBar } from '@/components/monthly-bar';
import { StatCard } from '@/components/stat-card';
import { computeAnalytics, formatCurrency, formatSyncDate } from '@/lib/analytics';
import { getOrdersAsObjects } from '@/lib/storage';
import { AnalyticsSummary } from '@/types/order';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const BLINKIT_GREEN = '#0C831F';

export default function DashboardScreen() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

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

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Blinkit Spend</Text>
        <Text style={styles.headerSubtitle}>Your order analytics</Text>
      </View>

      {hasData ? (
        <>
          {/* Stat cards */}
          <View style={styles.statRow}>
            <StatCard
              label="Lifetime spend"
              value={formatCurrency(summary.lifetimeSpend)}
              highlight
            />
            <StatCard
              label="Total orders"
              value={summary.totalOrders.toString()}
            />
          </View>

          {/* Monthly breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
            {summary.monthlyBreakdown.map((m) => (
              <MonthlyBar
                key={`${m.year}-${m.monthIndex}`}
                month={m.month}
                amount={m.total}
                maxAmount={maxMonthly}
                orderCount={m.orderCount}
              />
            ))}
          </View>

          {/* Footer */}
          {summary.lastSyncedAt && (
            <Text style={styles.footer}>
              Last synced: {formatSyncDate(summary.lastSyncedAt)}
            </Text>
          )}
        </>
      ) : (
        /* Empty state */
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptyBody}>
            Go to the Orders tab, navigate to your Blinkit order history, and tap{' '}
            <Text style={styles.emptyBold}>Sync Orders</Text> to get started.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f8fdf9',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: BLINKIT_GREEN,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#777',
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  footer: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  emptyBody: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  emptyBold: {
    fontWeight: '700',
    color: BLINKIT_GREEN,
  },
});
