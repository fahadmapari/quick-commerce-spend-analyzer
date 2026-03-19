import { formatCurrency } from '@/lib/analytics';
import { Colors } from '@/src/theme/colors';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface MonthlyBarProps {
  month: string;
  amount: number;
  maxAmount: number;
  orderCount: number;
}

export function MonthlyBar({ month, amount, maxAmount, orderCount }: MonthlyBarProps) {
  const barPercent = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;

  return (
    <View style={styles.row}>
      <Text style={styles.month}>{month}</Text>
      <View style={styles.barContainer}>
        <View style={[styles.bar, { width: `${barPercent}%` as any }]} />
      </View>
      <View style={styles.rightCol}>
        <Text style={styles.amount}>{formatCurrency(amount)}</Text>
        <Text style={styles.count}>{orderCount}×</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  month: {
    width: 40,
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: mono,
  },
  barContainer: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.borderSubtle,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: Colors.textHeading,
    borderRadius: 2,
  },
  rightCol: {
    width: 86,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  amount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontFamily: mono,
  },
  count: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontFamily: mono,
    width: 20,
    textAlign: 'right',
  },
});
