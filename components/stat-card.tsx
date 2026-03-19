import { Colors } from '@/src/theme/colors';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface StatCardProps {
  label: string;
  value: string;
  highlight?: boolean;
  accentColor?: string;
}

export function StatCard({ label, value, highlight = false, accentColor }: StatCardProps) {
  const valueColor = accentColor ?? (highlight ? Colors.green : Colors.textHeading);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  label: {
    fontSize: 9,
    color: Colors.textDisabled,
    fontFamily: mono,
    letterSpacing: 1,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
