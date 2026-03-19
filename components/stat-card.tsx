import { StyleSheet, Text, View } from 'react-native';

interface StatCardProps {
  label: string;
  value: string;
  highlight?: boolean;
}

export function StatCard({ label, value, highlight = false }: StatCardProps) {
  return (
    <View style={[styles.card, highlight && styles.cardHighlight]}>
      <Text style={[styles.value, highlight && styles.valueHighlight]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.label, highlight && styles.labelHighlight]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#f0faf2',
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
    gap: 4,
  },
  cardHighlight: {
    backgroundColor: '#0C831F',
  },
  value: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0C831F',
    letterSpacing: -0.5,
  },
  valueHighlight: {
    color: '#fff',
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  labelHighlight: {
    color: 'rgba(255,255,255,0.85)',
  },
});
