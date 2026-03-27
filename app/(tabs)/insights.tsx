import { BAR_RANGES, BarRange } from '@/constants/ranges';
import { FrequencyTrendCard, MultiOrderDaysCard, StreaksAndGapsCard } from '@/components/insights/frequency-cards';
import { DayOfWeekPatternCard, OrderingPersonaCard, RecordsAndExtremesCard } from '@/components/insights/personality-cards';
import { MonthOverMonthCard, MonthlyProjectionCard, PlatformLoyaltyCard } from '@/components/insights/platform-trend-cards';
import { AverageOrderTrendCard, SpendDistributionCard } from '@/components/insights/spending-cards';
import { InsightSectionHeader } from '@/components/insights/shared';
import { computeInsights } from '@/lib/insights';
import { showInsightsInterstitialIfLoaded } from '@/lib/ads';
import { getSelectedPlatforms } from '@/lib/platformSettings';
import { getAllOrdersAsObjects, getMonthlyBudget, getOrdersAsObjects } from '@/lib/storage';
import { Colors } from '@/src/theme/colors';
import { ALL_PLATFORMS, PLATFORM_CONFIGS, PlatformId } from '@/types/platform';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

export default function InsightsScreen() {
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof getAllOrdersAsObjects>>['orders']>([]);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [budget, setBudget] = useState<number | null>(null);
  const [rangeKey, setRangeKey] = useState<BarRange>('1Y');
  const [platformFilter, setPlatformFilter] = useState<PlatformId | 'all'>('all');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      showInsightsInterstitialIfLoaded().catch((error) => {
        console.error('Failed to present insights interstitial:', error);
      });
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        try {
          const platforms = await getSelectedPlatforms();
          const { orders: allOrders } = await getAllOrdersAsObjects();
          const activePlatforms = platforms.length > 0 ? platforms : ALL_PLATFORMS;
          const validFilter =
            platformFilter !== 'all' && !activePlatforms.includes(platformFilter)
              ? 'all'
              : platformFilter;
          const displayOrders = validFilter === 'all'
            ? allOrders
            : (await getOrdersAsObjects(validFilter)).orders;
          const storedBudget = await getMonthlyBudget();

          if (!active) {
            return;
          }

          setSelectedPlatforms(activePlatforms);
          if (validFilter !== platformFilter) {
            setPlatformFilter(validFilter);
          }
          setOrders(displayOrders);
          setTotalOrderCount(allOrders.length);
          setBudget(storedBudget);
        } catch (error) {
          console.error('Failed to load insights data:', error);
        }
      })();

      return () => {
        active = false;
      };
    }, [platformFilter])
  );

  const selectedRange = useMemo(
    () => BAR_RANGES.find((range) => range.key === rangeKey) ?? BAR_RANGES[2],
    [rangeKey]
  );

  const insights = useMemo(
    () => computeInsights(orders, selectedRange, budget, platformFilter),
    [orders, selectedRange, budget, platformFilter]
  );

  const hasAnyOrders = totalOrderCount > 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>QC SPEND TRACKER</Text>
        <Text style={styles.headerTitle}>Insights</Text>
      </View>

      <View style={styles.platformTabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
        </ScrollView>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.rangeRow}>
          {BAR_RANGES.map((range) => (
            <Pressable
              key={range.key}
              style={[styles.rangePill, rangeKey === range.key && styles.rangePillActive]}
              onPress={() => setRangeKey(range.key)}
            >
              <Text style={[styles.rangePillText, rangeKey === range.key && styles.rangePillTextActive]}>
                {range.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {!hasAnyOrders ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Sync your orders to see insights</Text>
          <Text style={styles.emptyBody}>
            Once your order history is on-device, this tab will break down patterns, trends, and streaks automatically.
          </Text>
          <Pressable style={styles.emptyButton} onPress={() => router.push('/explore')}>
            <Text style={styles.emptyButtonText}>Go to Sync</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <InsightSectionHeader title="Ordering Patterns" />
          <OrderingPersonaCard insight={insights.orderingPersona} />
          <DayOfWeekPatternCard insight={insights.dayOfWeekPattern} />

          {insights.platformSplit.visible ? (
            <>
              <InsightSectionHeader title="Platform Split" />
              <PlatformLoyaltyCard insight={insights.platformSplit} />
            </>
          ) : null}

          <InsightSectionHeader title="Trends & Forecast" />
          <MonthOverMonthCard insight={insights.monthOverMonth} />
          <MonthlyProjectionCard insight={insights.monthlyProjection} />

          <InsightSectionHeader title="Spending Behavior" />
          <AverageOrderTrendCard insight={insights.averageOrderTrend} />
          <SpendDistributionCard insight={insights.spendDistribution} />
          <RecordsAndExtremesCard
            hasData={insights.recordsAndExtremes.hasData}
            message={insights.recordsAndExtremes.message}
            records={insights.recordsAndExtremes.records}
          />

          <InsightSectionHeader title="Frequency & Streaks" />
          <FrequencyTrendCard insight={insights.frequencyTrend} />
          <StreaksAndGapsCard insight={insights.streaksAndGaps} />
          <MultiOrderDaysCard insight={insights.multiOrderDays} />
        </>
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
  header: {
    gap: 4,
    marginBottom: 12,
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
  platformTabsContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 8,
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
  rangeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  rangePill: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
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
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.green,
  },
  emptyButtonText: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '700',
  },
});
