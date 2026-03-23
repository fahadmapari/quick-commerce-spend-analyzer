import { Colors } from '@/src/theme/colors';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export function VerticalBarChart({
  values,
  labels,
  height = 110,
}: {
  values: number[];
  labels: string[];
  height?: number;
}) {
  const max = Math.max(...values, 0);

  return (
    <View style={styles.chartBlock}>
      <View style={[styles.barRow, { height }]}>
        {values.map((value, index) => {
          const ratio = max > 0 ? value / max : 0;
          const fillHeight = Math.max(ratio * height, value > 0 ? 10 : 4);
          return (
            <View key={`${labels[index]}-${index}`} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: fillHeight,
                      opacity: 0.25 + ratio * 0.75,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.labelRow}>
        {labels.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.chartLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function DonutChart({
  segments,
  size = 132,
  strokeWidth = 14,
  centerLabel,
  centerCaption,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
  centerLabel: string;
  centerCaption: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;

  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Colors.bgOverlay}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {segments.map((segment, index) => {
          const ratio = total > 0 ? segment.value / total : 0;
          const dash = circumference * ratio;
          const circle = (
            <Circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          );
          offset += dash;
          return circle;
        })}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutCenterLabel}>{centerLabel}</Text>
        <Text style={styles.donutCenterCaption}>{centerCaption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartBlock: {
    gap: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  barColumn: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    borderRadius: 999,
    backgroundColor: Colors.green,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  chartLabel: {
    flex: 1,
    fontSize: 9,
    color: Colors.textDisabled,
    textAlign: 'center',
  },
  donutWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    gap: 2,
  },
  donutCenterLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.8,
  },
  donutCenterCaption: {
    fontSize: 10,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
});
