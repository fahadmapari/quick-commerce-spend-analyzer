import { formatCurrency } from '@/lib/analytics';
import { Colors } from '@/src/theme/colors';
import { AverageOrderTrendInsight, SpendDistributionInsight } from '@/types/insights';
import { StyleSheet, Text, View } from 'react-native';
import { VerticalBarChart } from './charts';
import { EmptyInsight, InsightCard, sharedStyles } from './shared';

export function AverageOrderTrendCard({ insight }: { insight: AverageOrderTrendInsight }) {
  return (
    <InsightCard label="Average Order Trend">
      {insight.hasData ? (
        <>
          <Text style={sharedStyles.bigValue}>{formatCurrency(Math.round(insight.averageOrderValue))}</Text>
          <Text style={[styles.persona, { color: insight.accentColor }]}>{insight.label}</Text>
          <Text style={sharedStyles.supportingText}>
            {insight.direction === 'up' ? 'Rising' : insight.direction === 'down' ? 'Cooling' : 'Holding steady'} at {`${insight.pctChange > 0 ? '+' : ''}${insight.pctChange.toFixed(0)}%`}
          </Text>
          <View style={styles.trendTrack}>
            <View
              style={[
                styles.trendFill,
                {
                  width: `${Math.min(Math.abs(insight.pctChange), 100)}%`,
                  backgroundColor: insight.direction === 'up' ? Colors.red : Colors.green,
                },
              ]}
            />
          </View>
        </>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

export function SpendDistributionCard({ insight }: { insight: SpendDistributionInsight }) {
  return (
    <InsightCard label="Spend Distribution">
      {insight.hasData ? (
        <>
          <Text style={[styles.persona, { color: insight.accentColor }]}>{insight.label}</Text>
          <Text style={sharedStyles.supportingText}>
            {(insight.dominantShare * 100).toFixed(0)}% of orders land in the dominant spend band.
          </Text>
          <VerticalBarChart
            values={insight.buckets.map((bucket) => bucket.count)}
            labels={insight.buckets.map((bucket) => bucket.label)}
            height={100}
          />
        </>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  persona: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  trendTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.bgOverlay,
    overflow: 'hidden',
  },
  trendFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 8,
  },
});
