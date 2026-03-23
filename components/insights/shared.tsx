import { Colors } from '@/src/theme/colors';
import { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

export function InsightSectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export function InsightCard({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      {label ? <Text style={styles.cardLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

export function EmptyInsight({
  message,
}: {
  message?: string;
}) {
  return <Text style={styles.emptyText}>{message ?? 'No orders in this period'}</Text>;
}

export const sharedStyles = StyleSheet.create({
  monoLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
    textTransform: 'uppercase',
  },
  bigValue: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  supportingText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMuted,
    marginBottom: 12,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  cardLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
    textTransform: 'uppercase',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 20,
  },
});
