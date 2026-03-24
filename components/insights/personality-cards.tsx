import { DAY_LABELS } from '@/lib/insights';
import { formatCurrency } from '@/lib/analytics';
import { Colors } from '@/src/theme/colors';
import { DayOfWeekPatternInsight, OrderingPersonaInsight } from '@/types/insights';
import { StyleSheet, Text, View } from 'react-native';
import { VerticalBarChart } from './charts';
import { EmptyInsight, InsightCard, sharedStyles } from './shared';

export function OrderingPersonaCard({ insight }: { insight: OrderingPersonaInsight }) {
  return (
    <InsightCard label="Ordering Persona">
      {insight.hasData ? (
        <>
          <View style={styles.topRow}>
            <Text style={[styles.persona, { color: insight.accentColor }]}>{insight.label}</Text>
            <Text style={sharedStyles.supportingText}>
              {(insight.peakShare * 100).toFixed(0)}% of orders land in your busiest window
            </Text>
          </View>
          <VerticalBarChart
            values={insight.counts}
            labels={['12', '', '', '', '', '', '6', '', '', '', '', '', '12', '', '', '', '', '', '6', '', '', '', '', '12']}
            height={110}
          />
          <View style={styles.axisLegend}>
            {insight.axisLabels.map((label) => (
              <Text key={label} style={styles.axisLegendText}>
                {label}
              </Text>
            ))}
          </View>
        </>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

export function DayOfWeekPatternCard({ insight }: { insight: DayOfWeekPatternInsight }) {
  return (
    <InsightCard label="Day-of-Week Pattern">
      {insight.hasData ? (
        <>
          <Text style={[styles.persona, { color: insight.accentColor }]}>{insight.label}</Text>
          <Text style={sharedStyles.supportingText}>
            Your top day accounts for {(insight.peakShare * 100).toFixed(0)}% of all orders.
          </Text>
          <VerticalBarChart values={insight.counts} labels={DAY_LABELS} height={100} />
        </>
      ) : (
        <EmptyInsight message={insight.message} />
      )}
    </InsightCard>
  );
}

export function RecordsAndExtremesCard({
  records,
  hasData,
  message,
}: {
  records: { label: string; amount: number; subtitle: string; accentColor: string }[];
  hasData: boolean;
  message?: string;
}) {
  return (
    <InsightCard label="Records & Extremes">
      {hasData ? (
        <View style={styles.recordGrid}>
          {records.map((record) => (
            <View key={record.label} style={[styles.recordBox, { borderColor: record.accentColor }]}>
              <Text style={[styles.recordLabel, { color: record.accentColor }]}>{record.label}</Text>
              <Text style={styles.recordValue}>{formatCurrency(record.amount)}</Text>
              <Text style={styles.recordSubtitle}>{record.subtitle}</Text>
            </View>
          ))}
        </View>
      ) : (
        <EmptyInsight message={message} />
      )}
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  topRow: {
    gap: 6,
  },
  persona: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  axisLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  axisLegendText: {
    fontSize: 9,
    color: Colors.textDisabled,
  },
  recordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  recordBox: {
    width: '48%',
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  recordLabel: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    textAlign: 'center',
  },
  recordValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  recordSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
