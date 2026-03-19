import { StyleSheet, Text, View } from 'react-native';
import { formatCurrency } from '@/lib/analytics';

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
        <View style={[styles.bar, { width: `${barPercent}%` }]} />
      </View>
      <View style={styles.rightCol}>
        <Text style={styles.amount}>{formatCurrency(amount)}</Text>
        <Text style={styles.count}>{orderCount} order{orderCount !== 1 ? 's' : ''}</Text>
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
    width: 72,
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#e8f5eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: '#0C831F',
    borderRadius: 4,
  },
  rightCol: {
    width: 90,
    alignItems: 'flex-end',
    gap: 1,
  },
  amount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  count: {
    fontSize: 11,
    color: '#888',
  },
});
