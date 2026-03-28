import { formatCurrency } from '@/lib/analytics';
import { Colors } from '@/src/theme/colors';
import { MonthlySpend } from '@/types/order';
import { useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

const CHART_H = 170;
const Y_AXIS_W = 52;
const H_PAD_R = 8;
const V_PAD_T = 16;
const V_PAD_B = 8;
const DOT_R = 4;
const LABEL_H = 36;
const GRID_LINES = 4;
const TOOLTIP_W = 130;
const TOOLTIP_H = 52;

interface Props {
  data: MonthlySpend[]; // newest-first; reversed internally
}

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const ceil = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return ceil * mag;
}

function formatY(v: number): string {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
  return `₹${v}`;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const T = 0.35;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) * T;
    const cp1y = p1.y + (p2.y - p0.y) * T;
    const cp2x = p2.x - (p3.x - p1.x) * T;
    const cp2y = p2.y - (p3.y - p1.y) * T;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function closestIndex(coords: { x: number }[], touchX: number): number {
  let best = 0;
  let bestDist = Infinity;
  coords.forEach((c, i) => {
    const d = Math.abs(c.x - touchX);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}

export function MonthlyLineChart({ data }: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  // Keep a ref so PanResponder callbacks always see the latest coords
  const coordsRef = useRef<{ x: number; y: number; point: MonthlySpend }[]>([]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const idx = closestIndex(coordsRef.current, evt.nativeEvent.locationX);
        setSelected(idx);
      },
      onPanResponderMove: (evt) => {
        const idx = closestIndex(coordsRef.current, evt.nativeEvent.locationX);
        setSelected(idx);
      },
      onPanResponderRelease: () => setSelected(null),
      onPanResponderTerminate: () => setSelected(null),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const points = [...data].reverse(); // oldest → newest, left → right
  if (points.length === 0) return null;

  const chartW = Math.max(0, width - Y_AXIS_W - H_PAD_R);
  const plotH = CHART_H - V_PAD_T - V_PAD_B;

  const maxAmt = Math.max(...points.map((p) => p.total));
  const yMax = niceMax(maxAmt * 1.05);
  const yRange = yMax;

  const gridValues = Array.from(
    { length: GRID_LINES + 1 },
    (_, i) => (yRange / GRID_LINES) * i,
  );

  const n = points.length;
  const coords =
    width > 0
      ? points.map((p, i) => {
          const x = Y_AXIS_W + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
          const y = V_PAD_T + (1 - p.total / yRange) * plotH;
          return { x, y, point: p };
        })
      : [];

  // Keep ref in sync (runs during render, safe since it's a ref)
  coordsRef.current = coords;

  const path = smoothPath(coords.map((c) => ({ x: c.x, y: c.y })));
  const labelStep = n <= 6 ? 1 : n <= 12 ? 2 : 3;

  const sel = selected !== null ? coords[selected] : null;

  // Tooltip x: follow scrubber, clamped inside chart area
  const tooltipLeft = sel
    ? Math.min(
        Math.max(sel.x - TOOLTIP_W / 2, Y_AXIS_W),
        width - TOOLTIP_W - H_PAD_R,
      )
    : 0;
  // Tooltip y: above the dot if dot is in lower half, else below
  const tooltipTop = sel
    ? sel.y > CHART_H / 2
      ? sel.y - TOOLTIP_H - DOT_R - 8
      : sel.y + DOT_R + 8
    : 0;

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        // PanResponder attached to the whole chart+label block
        <View {...panResponder.panHandlers}>
          <Svg width={width} height={CHART_H}>
            {/* Gridlines + Y-axis labels */}
            {gridValues.map((v, i) => {
              const y = V_PAD_T + (1 - v / yRange) * plotH;
              return (
                <G key={`grid-${i}`}>
                  <Line
                    x1={Y_AXIS_W}
                    y1={y}
                    x2={width - H_PAD_R}
                    y2={y}
                    stroke={Colors.borderSubtle}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={Y_AXIS_W - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize={9}
                    fill={Colors.textDisabled}
                    fontFamily={mono ?? undefined}
                  >
                    {formatY(v)}
                  </SvgText>
                </G>
              );
            })}

            {/* Smooth line */}
            <Path
              d={path}
              stroke={Colors.textHeading}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Scrubber: vertical dashed line */}
            {sel && (
              <Line
                x1={sel.x}
                y1={V_PAD_T}
                x2={sel.x}
                y2={CHART_H - V_PAD_B}
                stroke={Colors.green}
                strokeWidth={1}
                strokeDasharray="4 3"
                strokeOpacity={0.6}
              />
            )}

            {/* Dots — all rendered, active one is larger + green */}
            {coords.map((c, i) => {
              const isActive = selected === i;
              return (
                <G key={`dot-${i}`}>
                  {isActive && (
                    <Circle cx={c.x} cy={c.y} r={DOT_R + 6} fill={Colors.green} opacity={0.15} />
                  )}
                  <Circle
                    cx={c.x}
                    cy={c.y}
                    r={isActive ? DOT_R + 2 : DOT_R}
                    fill={isActive ? Colors.green : Colors.textHeading}
                  />
                </G>
              );
            })}

            {/* Tooltip rendered inside SVG so it can overlap the chart cleanly */}
            {sel && (
              <G>
                <Rect
                  x={tooltipLeft}
                  y={tooltipTop}
                  width={TOOLTIP_W}
                  height={TOOLTIP_H}
                  rx={8}
                  fill={Colors.bgElevated}
                  stroke={Colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={tooltipLeft + 10}
                  y={tooltipTop + 16}
                  fontSize={9}
                  fill={Colors.textDisabled}
                  fontFamily={mono ?? undefined}
                  letterSpacing={1}
                >
                  {sel.point.month.toUpperCase()}
                </SvgText>
                <SvgText
                  x={tooltipLeft + 10}
                  y={tooltipTop + 32}
                  fontSize={15}
                  fontWeight="700"
                  fill={Colors.textHeading}
                  letterSpacing={-0.5}
                >
                  {formatCurrency(sel.point.total)}
                </SvgText>
                <SvgText
                  x={tooltipLeft + 10}
                  y={tooltipTop + 46}
                  fontSize={10}
                  fill={Colors.textMuted}
                  fontFamily={mono ?? undefined}
                >
                  {sel.point.orderCount} orders
                </SvgText>
              </G>
            )}
          </Svg>

          {/* X-axis month labels */}
          <View style={{ height: LABEL_H }}>
            {coords.map((c, i) => {
              if (i % labelStep !== 0 && i !== n - 1) return null;
              const [mon, yr] = c.point.month.split(' ');
              return (
                <View key={`lbl-${i}`} style={[styles.xLabel, { left: c.x - 18 }]}>
                  <Text style={[styles.xLabelMon, selected === i && styles.xLabelActive]}>
                    {mon}
                  </Text>
                  <Text style={[styles.xLabelYr, selected === i && styles.xLabelActive]}>
                    {yr}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  xLabel: {
    position: 'absolute',
    width: 36,
    alignItems: 'center',
    gap: 1,
    paddingTop: 6,
  },
  xLabelMon: {
    fontSize: 9,
    color: Colors.textMuted,
    fontFamily: mono,
  },
  xLabelYr: {
    fontSize: 8,
    color: Colors.textDisabled,
    fontFamily: mono,
  },
  xLabelActive: {
    color: Colors.green,
  },
});
