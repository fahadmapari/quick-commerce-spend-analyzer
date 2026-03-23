import { PlatformId } from './platform';

export interface InsightState {
  hasData: boolean;
  message?: string;
}

export interface OrderingPersonaInsight extends InsightState {
  label: string;
  accentColor: string;
  peakShare: number;
  counts: number[];
  axisLabels: string[];
}

export interface DayOfWeekPatternInsight extends InsightState {
  label: string;
  accentColor: string;
  counts: number[];
  peakShare: number;
}

export interface PlatformSplitEntry {
  platform: PlatformId;
  totalSpend: number;
  orderCount: number;
  averageOrderValue: number;
  spendShare: number;
  color: string;
}

export interface PlatformSplitInsight extends InsightState {
  visible: boolean;
  label: string;
  topShare: number;
  entries: PlatformSplitEntry[];
}

export interface ChangeMetric {
  label: string;
  current: number;
  previous: number;
  pctChange: number | null;
}

export interface MonthOverMonthInsight extends InsightState {
  metrics: ChangeMetric[];
}

export interface ProjectionInsight extends InsightState {
  projectedTotal: number | null;
  spentSoFar: number;
  monthElapsedPct: number;
  daysElapsed: number;
  daysInMonth: number;
  budget: number | null;
  projectedVsBudget: number | null;
}

export interface AverageOrderTrendInsight extends InsightState {
  label: string;
  accentColor: string;
  averageOrderValue: number;
  pctChange: number;
  direction: 'up' | 'down' | 'flat';
}

export interface SpendBucket {
  label: string;
  count: number;
}

export interface SpendDistributionInsight extends InsightState {
  label: string;
  accentColor: string;
  dominantShare: number;
  buckets: SpendBucket[];
}

export interface RecordCardItem {
  label: string;
  amount: number;
  subtitle: string;
  accentColor: string;
}

export interface RecordsExtremesInsight extends InsightState {
  records: RecordCardItem[];
}

export interface FrequencyTrendInsight extends InsightState {
  currentPace: number;
  previousPace: number;
  trendLabel: string;
  trendColor: string;
}

export interface StreaksGapsInsight extends InsightState {
  longestStreak: number;
  longestGap: number;
}

export interface MultiOrderDaysInsight extends InsightState {
  label: string;
  accentColor: string;
  multiOrderDays: number;
  totalOrderingDays: number;
  percentage: number;
}

export interface InsightsData {
  filteredOrderCount: number;
  orderingPersona: OrderingPersonaInsight;
  dayOfWeekPattern: DayOfWeekPatternInsight;
  platformSplit: PlatformSplitInsight;
  monthOverMonth: MonthOverMonthInsight;
  monthlyProjection: ProjectionInsight;
  averageOrderTrend: AverageOrderTrendInsight;
  spendDistribution: SpendDistributionInsight;
  recordsAndExtremes: RecordsExtremesInsight;
  frequencyTrend: FrequencyTrendInsight;
  streaksAndGaps: StreaksGapsInsight;
  multiOrderDays: MultiOrderDaysInsight;
}
