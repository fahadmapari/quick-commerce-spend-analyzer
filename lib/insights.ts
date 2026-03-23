import { TimeRangeOption } from '@/constants/ranges';
import { Order } from '@/types/order';
import { PlatformId } from '@/types/platform';
import {
  AverageOrderTrendInsight,
  ChangeMetric,
  DayOfWeekPatternInsight,
  FrequencyTrendInsight,
  InsightsData,
  MonthOverMonthInsight,
  MultiOrderDaysInsight,
  OrderingPersonaInsight,
  PlatformSplitInsight,
  ProjectionInsight,
  RecordCardItem,
  RecordsExtremesInsight,
  SpendBucket,
  SpendDistributionInsight,
  StreaksGapsInsight,
} from '@/types/insights';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HOUR_AXIS_LABELS = ['12 AM', '6 AM', '12 PM', '6 PM', '11 PM'];
const PLATFORM_COLORS: Record<PlatformId, string> = {
  blinkit: '#fbbf24',
  zepto: '#7c3aed',
};

const PERSONALITY_COLORS = {
  amber: '#f59e0b',
  cyan: '#06b6d4',
  purple: '#a855f7',
  orange: '#f97316',
};

export function computeInsights(
  orders: Order[],
  range: TimeRangeOption,
  budget: number | null,
  platformFilter: PlatformId | 'all',
  now = new Date()
): InsightsData {
  const filteredOrders = filterOrdersByRange(orders, range, now);

  return {
    filteredOrderCount: filteredOrders.length,
    orderingPersona: computeHourDistribution(filteredOrders),
    dayOfWeekPattern: computeDayOfWeekDistribution(filteredOrders),
    platformSplit: computePlatformSplit(filteredOrders, platformFilter),
    monthOverMonth: computeMoMChange(filteredOrders, now),
    monthlyProjection: computeProjection(filteredOrders, budget, now),
    averageOrderTrend: computeAvgTrend(filteredOrders),
    spendDistribution: computeSpendDistribution(filteredOrders),
    recordsAndExtremes: computeRecords(filteredOrders),
    frequencyTrend: computeFrequencyTrend(orders, filteredOrders, range, now),
    streaksAndGaps: computeStreaks(filteredOrders),
    multiOrderDays: computeMultiOrderDays(filteredOrders),
  };
}

function filterOrdersByRange(orders: Order[], range: TimeRangeOption, now: Date): Order[] {
  if (range.months === null) {
    return [...orders].sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - range.months);

  return orders
    .filter((order) => order.date >= cutoff)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function emptyOrderingPersona(message = 'No orders in this period'): OrderingPersonaInsight {
  return {
    hasData: false,
    message,
    label: 'No Pattern Yet',
    accentColor: PERSONALITY_COLORS.purple,
    peakShare: 0,
    counts: new Array(24).fill(0),
    axisLabels: HOUR_AXIS_LABELS,
  };
}

function computeHourDistribution(orders: Order[]): OrderingPersonaInsight {
  if (orders.length === 0) {
    return emptyOrderingPersona();
  }

  const counts = new Array(24).fill(0);
  for (const order of orders) {
    counts[order.date.getHours()] += 1;
  }

  const peakHour = counts.reduce((best, count, hour) => (count > counts[best] ? hour : best), 0);
  const persona = getHourPersona(peakHour);
  const clusterTotal = persona.hours.reduce((sum, hour) => sum + counts[hour], 0);

  return {
    hasData: true,
    label: persona.label,
    accentColor: persona.accentColor,
    peakShare: clusterTotal / orders.length,
    counts,
    axisLabels: HOUR_AXIS_LABELS,
  };
}

function getHourPersona(hour: number) {
  if (hour >= 20 || hour <= 4) {
    return {
      label: 'Night Owl',
      accentColor: PERSONALITY_COLORS.purple,
      hours: [20, 21, 22, 23, 0, 1, 2, 3, 4],
    };
  }
  if (hour >= 5 && hour <= 9) {
    return {
      label: 'Early Bird',
      accentColor: PERSONALITY_COLORS.amber,
      hours: [5, 6, 7, 8, 9],
    };
  }
  if (hour >= 11 && hour <= 14) {
    return {
      label: 'Lunch Rusher',
      accentColor: PERSONALITY_COLORS.orange,
      hours: [11, 12, 13, 14],
    };
  }
  if (hour >= 14 && hour <= 17) {
    return {
      label: 'Afternoon Snacker',
      accentColor: PERSONALITY_COLORS.cyan,
      hours: [14, 15, 16, 17],
    };
  }
  return {
    label: 'Evening Planner',
    accentColor: PERSONALITY_COLORS.orange,
    hours: [17, 18, 19, 20],
  };
}

function computeDayOfWeekDistribution(orders: Order[]): DayOfWeekPatternInsight {
  if (orders.length === 0) {
    return {
      hasData: false,
      message: 'No orders in this period',
      label: 'No Pattern Yet',
      accentColor: PERSONALITY_COLORS.cyan,
      counts: new Array(7).fill(0),
      peakShare: 0,
    };
  }

  const counts = new Array(7).fill(0);
  for (const order of orders) {
    const day = order.date.getDay();
    const mondayIndex = day === 0 ? 6 : day - 1;
    counts[mondayIndex] += 1;
  }

  const weekendShare = (counts[5] + counts[6]) / orders.length;
  const weekdayShare = counts.slice(0, 5).reduce((sum, count) => sum + count, 0) / orders.length;
  const peakIndex = counts.reduce((best, count, index) => (count > counts[best] ? index : best), 0);
  const peakShare = counts[peakIndex] / orders.length;

  let label = 'Weekly Rhythm';
  let accentColor = PERSONALITY_COLORS.cyan;
  if (weekendShare > 0.4) {
    label = 'Weekend Warrior';
    accentColor = PERSONALITY_COLORS.orange;
  } else if (weekdayShare > 0.75) {
    label = 'Weekday Regular';
    accentColor = PERSONALITY_COLORS.amber;
  } else if (peakIndex === 4) {
    label = 'Friday Fiend';
    accentColor = PERSONALITY_COLORS.purple;
  } else if (peakShare <= 0.2) {
    label = 'Spread Out';
    accentColor = PERSONALITY_COLORS.cyan;
  }

  return {
    hasData: true,
    label,
    accentColor,
    counts,
    peakShare,
  };
}

function computePlatformSplit(
  orders: Order[],
  platformFilter: PlatformId | 'all'
): PlatformSplitInsight {
  if (platformFilter !== 'all') {
    return {
      visible: false,
      hasData: false,
      label: '',
      topShare: 0,
      entries: [],
    };
  }

  const totals = new Map<PlatformId, { totalSpend: number; orderCount: number }>();
  for (const order of orders) {
    const entry = totals.get(order.platform) ?? { totalSpend: 0, orderCount: 0 };
    entry.totalSpend += order.amount;
    entry.orderCount += 1;
    totals.set(order.platform, entry);
  }

  if (totals.size < 2) {
    return {
      visible: false,
      hasData: false,
      label: '',
      topShare: 0,
      entries: [],
    };
  }

  const totalSpend = Array.from(totals.values()).reduce((sum, entry) => sum + entry.totalSpend, 0);
  const entries = Array.from(totals.entries())
    .map(([platform, entry]) => ({
      platform,
      totalSpend: entry.totalSpend,
      orderCount: entry.orderCount,
      averageOrderValue: entry.orderCount > 0 ? entry.totalSpend / entry.orderCount : 0,
      spendShare: totalSpend > 0 ? entry.totalSpend / totalSpend : 0,
      color: PLATFORM_COLORS[platform],
    }))
    .sort((a, b) => b.spendShare - a.spendShare);

  const top = entries[0];

  return {
    visible: true,
    hasData: true,
    label: top.spendShare > 0.7 ? `${capitalize(top.platform)} Loyalist` : 'Platform Switcher',
    topShare: top.spendShare,
    entries,
  };
}

function computeMoMChange(orders: Order[], now: Date): MonthOverMonthInsight {
  const currentMonthOrders = orders.filter(
    (order) =>
      order.date.getFullYear() === now.getFullYear() &&
      order.date.getMonth() === now.getMonth()
  );
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthOrders = orders.filter(
    (order) =>
      order.date.getFullYear() === previousMonthDate.getFullYear() &&
      order.date.getMonth() === previousMonthDate.getMonth()
  );

  if (previousMonthOrders.length === 0) {
    return {
      hasData: false,
      message: 'Need 2+ months of data',
      metrics: [],
    };
  }

  const currentSpend = sumAmounts(currentMonthOrders);
  const previousSpend = sumAmounts(previousMonthOrders);
  const currentOrders = currentMonthOrders.length;
  const previousOrders = previousMonthOrders.length;
  const currentAvg = currentOrders > 0 ? currentSpend / currentOrders : 0;
  const previousAvg = previousOrders > 0 ? previousSpend / previousOrders : 0;

  return {
    hasData: true,
    metrics: [
      makeChangeMetric('Spend', currentSpend, previousSpend),
      makeChangeMetric('Orders', currentOrders, previousOrders),
      makeChangeMetric('Avg Order', currentAvg, previousAvg),
    ],
  };
}

function makeChangeMetric(label: string, current: number, previous: number): ChangeMetric {
  return {
    label,
    current,
    previous,
    pctChange: percentChange(current, previous),
  };
}

function computeProjection(
  orders: Order[],
  budget: number | null,
  now: Date
): ProjectionInsight {
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentMonthOrders = orders.filter(
    (order) =>
      order.date.getFullYear() === now.getFullYear() &&
      order.date.getMonth() === now.getMonth()
  );
  const spentSoFar = sumAmounts(currentMonthOrders);

  if (daysElapsed <= 1) {
    return {
      hasData: false,
      message: 'Not enough data yet',
      projectedTotal: null,
      spentSoFar,
      monthElapsedPct: daysElapsed / daysInMonth,
      daysElapsed,
      daysInMonth,
      budget,
      projectedVsBudget: null,
    };
  }

  const projectedTotal = (spentSoFar / daysElapsed) * daysInMonth;

  return {
    hasData: true,
    projectedTotal,
    spentSoFar,
    monthElapsedPct: daysElapsed / daysInMonth,
    daysElapsed,
    daysInMonth,
    budget,
    projectedVsBudget: budget !== null ? projectedTotal - budget : null,
  };
}

function computeAvgTrend(orders: Order[]): AverageOrderTrendInsight {
  if (orders.length === 0) {
    return {
      hasData: false,
      message: 'No orders in this period',
      label: 'No Trend Yet',
      accentColor: PERSONALITY_COLORS.purple,
      averageOrderValue: 0,
      pctChange: 0,
      direction: 'flat',
    };
  }

  if (orders.length < 2) {
    const average = sumAmounts(orders) / orders.length;
    return {
      hasData: true,
      label: 'Steady Spender',
      accentColor: PERSONALITY_COLORS.cyan,
      averageOrderValue: average,
      pctChange: 0,
      direction: 'flat',
    };
  }

  const midpoint = Math.floor(orders.length / 2);
  const firstHalf = orders.slice(0, midpoint);
  const secondHalf = orders.slice(midpoint);
  const firstAvg = sumAmounts(firstHalf) / Math.max(firstHalf.length, 1);
  const secondAvg = sumAmounts(secondHalf) / Math.max(secondHalf.length, 1);
  const overallAvg = sumAmounts(orders) / orders.length;
  const pctChange = percentChange(secondAvg, firstAvg) ?? 0;

  if (pctChange > 10) {
    return {
      hasData: true,
      label: 'Lifestyle Creep',
      accentColor: PERSONALITY_COLORS.orange,
      averageOrderValue: overallAvg,
      pctChange,
      direction: 'up',
    };
  }
  if (pctChange < -10) {
    return {
      hasData: true,
      label: 'Inflation Fighter',
      accentColor: PERSONALITY_COLORS.amber,
      averageOrderValue: overallAvg,
      pctChange,
      direction: 'down',
    };
  }

  return {
    hasData: true,
    label: 'Steady Spender',
    accentColor: PERSONALITY_COLORS.cyan,
    averageOrderValue: overallAvg,
    pctChange,
    direction: 'flat',
  };
}

function computeSpendDistribution(orders: Order[]): SpendDistributionInsight {
  const buckets: SpendBucket[] = [
    { label: '0-200', count: 0 },
    { label: '200-500', count: 0 },
    { label: '500-800', count: 0 },
    { label: '800-1000', count: 0 },
    { label: '1000+', count: 0 },
  ];

  for (const order of orders) {
    if (order.amount < 200) buckets[0].count += 1;
    else if (order.amount < 500) buckets[1].count += 1;
    else if (order.amount < 800) buckets[2].count += 1;
    else if (order.amount < 1000) buckets[3].count += 1;
    else buckets[4].count += 1;
  }

  if (orders.length === 0) {
    return {
      hasData: false,
      message: 'No orders in this period',
      label: 'No Basket Yet',
      accentColor: PERSONALITY_COLORS.purple,
      dominantShare: 0,
      buckets,
    };
  }

  const quickRunnerShare = (buckets[0].count + buckets[1].count) / orders.length;
  const bulkBuyerShare = (buckets[3].count + buckets[4].count) / orders.length;
  const dominantBucket = buckets.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), buckets[0]);
  const dominantShare = dominantBucket.count / orders.length;

  if (quickRunnerShare > 0.5) {
    return {
      hasData: true,
      label: 'Quick Runner',
      accentColor: PERSONALITY_COLORS.amber,
      dominantShare: quickRunnerShare,
      buckets,
    };
  }
  if (bulkBuyerShare > 0.5) {
    return {
      hasData: true,
      label: 'Bulk Buyer',
      accentColor: PERSONALITY_COLORS.orange,
      dominantShare: bulkBuyerShare,
      buckets,
    };
  }

  return {
    hasData: true,
    label: 'Mixed Basket',
    accentColor: PERSONALITY_COLORS.cyan,
    dominantShare,
    buckets,
  };
}

function computeRecords(orders: Order[]): RecordsExtremesInsight {
  if (orders.length === 0) {
    return {
      hasData: false,
      message: 'No orders in this period',
      records: [],
    };
  }

  const sortedByAmount = [...orders].sort((a, b) => a.amount - b.amount);
  const smallest = sortedByAmount[0];
  const biggest = sortedByAmount[sortedByAmount.length - 1];

  const dayTotals = new Map<string, { total: number; date: Date }>();
  const weekTotals = new Map<string, { total: number; start: Date; end: Date }>();

  for (const order of orders) {
    const dayKey = toDateKey(order.date);
    const dayEntry = dayTotals.get(dayKey) ?? { total: 0, date: startOfDay(order.date) };
    dayEntry.total += order.amount;
    dayTotals.set(dayKey, dayEntry);

    const weekStart = startOfWeek(order.date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekKey = toDateKey(weekStart);
    const weekEntry = weekTotals.get(weekKey) ?? { total: 0, start: weekStart, end: weekEnd };
    weekEntry.total += order.amount;
    weekTotals.set(weekKey, weekEntry);
  }

  const priciestDay = Array.from(dayTotals.values()).reduce((best, entry) => (entry.total > best.total ? entry : best));
  const priciestWeek = Array.from(weekTotals.values()).reduce((best, entry) => (entry.total > best.total ? entry : best));

  const records: RecordCardItem[] = [
    {
      label: 'Biggest Order',
      amount: biggest.amount,
      subtitle: formatShortDate(biggest.date),
      accentColor: PERSONALITY_COLORS.amber,
    },
    {
      label: 'Smallest Order',
      amount: smallest.amount,
      subtitle: formatShortDate(smallest.date),
      accentColor: PERSONALITY_COLORS.cyan,
    },
    {
      label: 'Priciest Day',
      amount: priciestDay.total,
      subtitle: formatShortDate(priciestDay.date),
      accentColor: '#ef4444',
    },
    {
      label: 'Priciest Week',
      amount: priciestWeek.total,
      subtitle: `${formatShortDate(priciestWeek.start)} - ${formatShortDate(priciestWeek.end)}`,
      accentColor: PERSONALITY_COLORS.purple,
    },
  ];

  return {
    hasData: true,
    records,
  };
}

function computeFrequencyTrend(
  allOrders: Order[],
  filteredOrders: Order[],
  range: TimeRangeOption,
  now: Date
): FrequencyTrendInsight {
  if (filteredOrders.length === 0) {
    return {
      hasData: false,
      message: 'No orders in this period',
      currentPace: 0,
      previousPace: 0,
      trendLabel: 'No pace yet',
      trendColor: PERSONALITY_COLORS.cyan,
    };
  }

  const currentStart =
    range.months === null ? startOfDay(filteredOrders[0].date) : startOfDay(shiftMonths(now, -range.months));
  const currentEnd = now;
  const currentDays = Math.max(daysBetween(currentStart, currentEnd), 1);
  const currentPace = filteredOrders.length / (currentDays / 7);

  let previousOrders: Order[] = [];
  let previousDays = currentDays;

  if (range.months === null) {
    const midpoint = Math.floor(filteredOrders.length / 2);
    previousOrders = filteredOrders.slice(0, midpoint);
    const firstOrderDate = filteredOrders[0].date;
    const pivotDate = filteredOrders[midpoint]?.date ?? now;
    previousDays = Math.max(daysBetween(firstOrderDate, pivotDate), 1);
  } else {
    const previousEnd = currentStart;
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - currentDays);
    previousOrders = allOrders.filter(
      (order) => order.date >= previousStart && order.date < previousEnd
    );
  }

  const previousPace = previousOrders.length / (Math.max(previousDays, 1) / 7);
  const delta = currentPace - previousPace;

  return {
    hasData: true,
    currentPace,
    previousPace,
    trendLabel: delta > 0.15 ? 'Accelerating' : delta < -0.15 ? 'Decelerating' : 'Holding Steady',
    trendColor: delta > 0.15 ? '#ef4444' : delta < -0.15 ? '#22c55e' : PERSONALITY_COLORS.cyan,
  };
}

function computeStreaks(orders: Order[]): StreaksGapsInsight {
  if (orders.length === 0) {
    return {
      hasData: false,
      message: 'No orders in this period',
      longestStreak: 0,
      longestGap: 0,
    };
  }

  const uniqueDays = Array.from(new Set(orders.map((order) => toDateKey(order.date))))
    .map((key) => new Date(`${key}T00:00:00`))
    .sort((a, b) => a.getTime() - b.getTime());

  let longestStreak = 1;
  let currentStreak = 1;
  let longestGap = 0;

  for (let index = 1; index < uniqueDays.length; index += 1) {
    const diff = daysBetween(uniqueDays[index - 1], uniqueDays[index]);
    if (diff === 1) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
      longestGap = Math.max(longestGap, diff - 1);
    }
  }

  return {
    hasData: true,
    longestStreak,
    longestGap,
  };
}

function computeMultiOrderDays(orders: Order[]): MultiOrderDaysInsight {
  if (orders.length === 0) {
    return {
      hasData: false,
      message: 'No orders in this period',
      label: 'No Pattern Yet',
      accentColor: PERSONALITY_COLORS.cyan,
      multiOrderDays: 0,
      totalOrderingDays: 0,
      percentage: 0,
    };
  }

  const perDay = new Map<string, number>();
  for (const order of orders) {
    const key = toDateKey(order.date);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const totalOrderingDays = perDay.size;
  const multiOrderDays = Array.from(perDay.values()).filter((count) => count >= 2).length;
  const percentage = totalOrderingDays > 0 ? multiOrderDays / totalOrderingDays : 0;

  let label = 'Occasional Double';
  let accentColor = PERSONALITY_COLORS.cyan;
  if (percentage > 0.15) {
    label = 'Forgot Something Again';
    accentColor = PERSONALITY_COLORS.orange;
  } else if (percentage < 0.05) {
    label = 'One-Trip Wonder';
    accentColor = PERSONALITY_COLORS.amber;
  }

  return {
    hasData: true,
    label,
    accentColor,
    multiOrderDays,
    totalOrderingDays,
    percentage,
  };
}

function sumAmounts(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + order.amount, 0);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = startOfDay(date);
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function shiftMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function daysBetween(start: Date, end: Date): number {
  const diff = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.max(Math.round(diff / 86400000), 0);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(date: Date): string {
  return `${date.getDate()} ${date.toLocaleString('en-IN', { month: 'short' })}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export { DAY_LABELS, HOUR_AXIS_LABELS };
