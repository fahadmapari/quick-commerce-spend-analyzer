import { Colors } from '@/src/theme/colors';
import { FrequencyTrendInsight, MultiOrderDaysInsight, StreaksGapsInsight } from '@/types/insights';
import { StyleSheet, Text, View } from 'react-native';
import { EmptyInsight, InsightCard, sharedStyles } from './shared';

export function FrequencyTrendCard({ insight }: { insight: FrequencyTrendInsight }) {
  return (
    <InsightCard label="Order Frequency Trend">
      {insight.hasData ? (
        <>
          <Text style={sharedStyles.bigValue}>{insight.currentPace.toFixed(1)} orders/week</Text>
          <Text style={[styles.status, { color: insight.trendColor }]}>{insight.trendLabel}</Text>
          <Text style={sharedStyles.supportingText}>
            Previous pace: {insight.previousPace.toFixed(1)} orders/week
          </Text>
        </>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

export function StreaksAndGapsCard({ insight }: { insight: StreaksGapsInsight }) {
  return (
    <InsightCard label="Streaks & Gaps">
      {insight.hasData ? (
        <View style={styles.twoCol}>
          <View style={styles.metricPane}>
            <Text style={styles.metricValue}>{insight.longestStreak}</Text>
            <Text style={[styles.metricCaption, { color: Colors.green }]}>Longest streak</Text>
            <Text style={sharedStyles.supportingText}>consecutive days ordering</Text>
          </View>
          <View style={styles.metricPane}>
            <Text style={styles.metricValue}>{insight.longestGap}</Text>
            <Text style={[styles.metricCaption, { color: Colors.textMuted }]}>Longest gap</Text>
            <Text style={sharedStyles.supportingText}>days between orders</Text>
          </View>
        </View>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

export function MultiOrderDaysCard({ insight }: { insight: MultiOrderDaysInsight }) {
  return (
    <InsightCard label="Multi-Order Days">
      {insight.hasData ? (
        <>
          <Text style={[styles.status, { color: insight.accentColor }]}>{insight.label}</Text>
          <Text style={sharedStyles.bigValue}>{insight.multiOrderDays}</Text>
          <Text style={sharedStyles.supportingText}>
            {Math.round(insight.percentage * 100)}% of your {insight.totalOrderingDays} ordering days had 2+ orders.
          </Text>
        </>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  status: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 12,
  },
  metricPane: {
    flex: 1,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  metricValue: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  metricCaption: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
