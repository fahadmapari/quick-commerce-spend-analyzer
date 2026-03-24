import { formatCurrency } from '@/lib/analytics';
import { Colors } from '@/src/theme/colors';
import { ChangeMetric, MonthOverMonthInsight, PlatformSplitInsight, ProjectionInsight } from '@/types/insights';
import { StyleSheet, Text, View } from 'react-native';
import { DonutChart } from './charts';
import { EmptyInsight, InsightCard, sharedStyles } from './shared';

export function PlatformLoyaltyCard({ insight }: { insight: PlatformSplitInsight }) {
  if (!insight.visible) {
    return null;
  }

  return (
    <InsightCard label="Platform Loyalty">
      {insight.hasData ? (
        <>
          <Text style={styles.heading}>{insight.label}</Text>
          <View style={styles.platformRow}>
            <DonutChart
              segments={insight.entries.map((entry) => ({ value: entry.totalSpend, color: entry.color }))}
              centerLabel={`${Math.round(insight.topShare * 100)}%`}
              centerCaption="Top Share"
            />
            <View style={styles.platformList}>
              {insight.entries.map((entry) => (
                <View key={entry.platform} style={styles.platformItem}>
                  <View style={styles.platformTitleRow}>
                    <View style={[styles.platformDot, { backgroundColor: entry.color }]} />
                    <Text style={styles.platformName}>{entry.platform}</Text>
                  </View>
                  <Text style={styles.platformMeta}>{formatCurrency(entry.totalSpend)} spend</Text>
                  <Text style={styles.platformMeta}>{entry.orderCount} orders</Text>
                  <Text style={styles.platformMeta}>{formatCurrency(entry.averageOrderValue)} avg</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

export function MonthOverMonthCard({ insight }: { insight: MonthOverMonthInsight }) {
  return (
    <InsightCard label="Month-over-Month Change">
      {insight.hasData ? (
        <View style={styles.metricRow}>
          {insight.metrics.map((metric) => (
            <MetricBox key={metric.label} metric={metric} />
          ))}
        </View>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

export function MonthlyProjectionCard({ insight }: { insight: ProjectionInsight }) {
  return (
    <InsightCard label="Monthly Projection">
      {insight.hasData && insight.projectedTotal !== null ? (
        <>
          <Text style={sharedStyles.bigValue}>{formatCurrency(Math.round(insight.projectedTotal))}</Text>
          <Text style={sharedStyles.supportingText}>Projected total by month end</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${insight.projectedTotal > 0 ? Math.min((insight.spentSoFar / insight.projectedTotal) * 100, 100) : 0}%`,
                },
              ]}
            />
          </View>
          <Text style={sharedStyles.supportingText}>
            {formatCurrency(insight.spentSoFar)} spent so far, {Math.round(insight.monthElapsedPct * 100)}% of month elapsed
          </Text>
          {insight.budget !== null && insight.projectedVsBudget !== null ? (
            <Text
              style={[
                sharedStyles.supportingText,
                { color: insight.projectedVsBudget === 0 ? Colors.textMuted : insight.projectedVsBudget > 0 ? Colors.red : Colors.green },
              ]}
            >
              {insight.projectedVsBudget === 0
                ? 'On budget'
                : insight.projectedVsBudget > 0
                  ? `Projected over budget by ${formatCurrency(Math.abs(Math.round(insight.projectedVsBudget)))}`
                  : `Projected under budget by ${formatCurrency(Math.abs(Math.round(insight.projectedVsBudget)))}`}
            </Text>
          ) : null}
        </>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

function MetricBox({ metric }: { metric: ChangeMetric }) {
  const color = getMetricColor(metric);
  const pctLabel = metric.pctChange === null ? 'New' : `${metric.pctChange > 0 ? '+' : ''}${metric.pctChange.toFixed(0)}%`;
  const valueLabel = metric.label === 'Orders'
    ? `${metric.previous.toFixed(0)} -> ${metric.current.toFixed(0)}`
    : `${formatCurrency(Math.round(metric.previous))} -> ${formatCurrency(Math.round(metric.current))}`;

  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{metric.label}</Text>
      <Text style={[styles.metricChange, { color }]}>{pctLabel}</Text>
      <Text style={styles.metricValue}>{valueLabel}</Text>
    </View>
  );
}

function getMetricColor(metric: ChangeMetric) {
  if (metric.label === 'Orders') {
    return Colors.textMuted;
  }
  if (metric.pctChange === null) {
    return Colors.textMuted;
  }
  const positive = metric.pctChange > 0;
  return positive ? Colors.red : Colors.green;
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  platformList: {
    flex: 1,
    gap: 12,
  },
  platformItem: {
    gap: 3,
  },
  platformTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  platformDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  platformName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    textTransform: 'capitalize',
  },
  platformMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricChange: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  metricValue: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.bgOverlay,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.green,
  },
});
