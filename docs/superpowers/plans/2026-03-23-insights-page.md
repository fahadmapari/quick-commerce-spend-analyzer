# Insights Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5th "Insights" tab that computes and displays 11 analytics cards with personality labels from existing order data.

**Architecture:** Pure computation layer (`lib/insights.ts`) takes `Order[]` and returns all 11 insight results. Screen uses `useMemo` for memoization. Each insight card is a self-contained component in `components/insights/`. No storage changes.

**Tech Stack:** React Native, Expo Router, react-native-svg, TypeScript, AsyncStorage (read-only)

**Spec:** `docs/superpowers/specs/2026-03-23-insights-page-design.md`

---

### Task 1: Extract shared range constants

**Files:**
- Create: `constants/ranges.ts`
- Modify: `app/(tabs)/index.tsx:20-27`

- [ ] **Step 1: Create `constants/ranges.ts`**

```typescript
export type BarRange = '3M' | '6M' | '1Y' | '2Y' | 'lifetime';

export const BAR_RANGES: { label: string; key: BarRange; months: number | null }[] = [
  { label: '3M',       key: '3M',       months: 3  },
  { label: '6M',       key: '6M',       months: 6  },
  { label: '1Y',       key: '1Y',       months: 12 },
  { label: '2Y',       key: '2Y',       months: 24 },
  { label: 'Lifetime', key: 'lifetime', months: null },
];
```

- [ ] **Step 2: Update dashboard to import from shared module**

In `app/(tabs)/index.tsx`, replace lines 20-27:

```typescript
// REMOVE these lines:
// type BarRange = '3M' | '6M' | '1Y' | '2Y' | 'lifetime';
// const BAR_RANGES: { label: string; key: BarRange; months: number | null }[] = [
//   ...
// ];

// ADD this import at top:
import { BarRange, BAR_RANGES } from '@/constants/ranges';
```

- [ ] **Step 3: Verify dashboard still works**

Run: `npx expo start` and confirm Dashboard tab renders correctly with range pills working.

- [ ] **Step 4: Commit**

```bash
git add constants/ranges.ts app/\(tabs\)/index.tsx
git commit -m "refactor: extract BarRange and BAR_RANGES to shared constants"
```

---

### Task 2: Create insight types

**Files:**
- Create: `types/insights.ts`

- [ ] **Step 1: Create `types/insights.ts`**

```typescript
import { PlatformId } from './platform';

export interface HourDistribution {
  /** Order count per hour (index 0 = midnight, 23 = 11 PM) */
  hours: number[];
  peakHour: number;
  peakPeriodPercent: number;
  persona: 'Night Owl' | 'Early Bird' | 'Lunch Rusher' | 'Afternoon Snacker' | 'Evening Planner';
}

export interface DayOfWeekDistribution {
  /** Order count per day (index 0 = Monday, 6 = Sunday) */
  days: number[];
  peakDay: number;
  pattern: 'Weekend Warrior' | 'Weekday Regular' | 'Friday Fiend' | 'Spread Out';
}

export interface PlatformSplitData {
  platforms: {
    id: PlatformId;
    spend: number;
    orderCount: number;
    avgOrder: number;
    spendPercent: number;
  }[];
  loyalty: string; // e.g. "Blinkit Loyalist" or "Platform Switcher"
  visible: boolean; // false when single platform or filtered
}

export interface MoMChange {
  spendChange: number | null; // percentage, null if < 2 months
  orderChange: number | null;
  avgChange: number | null;
  currentSpend: number;
  previousSpend: number;
  currentOrders: number;
  previousOrders: number;
  currentAvg: number;
  previousAvg: number;
  hasData: boolean;
}

export interface MonthlyProjection {
  projectedTotal: number;
  spentSoFar: number;
  daysElapsed: number;
  daysInMonth: number;
  monthElapsedPercent: number;
  hasEnoughData: boolean; // false on day 1
  budget: number | null; // user's monthly budget, if set
}

export interface AvgOrderTrend {
  currentAvg: number;
  changePercent: number;
  label: 'Lifestyle Creep' | 'Inflation Fighter' | 'Steady Spender';
  direction: 'up' | 'down' | 'flat';
}

export interface SpendDistribution {
  /** Buckets: [0-200, 200-500, 500-800, 800-1000, 1000+] */
  buckets: number[];
  bucketLabels: string[];
  dominantBucketPercent: number;
  label: 'Quick Runner' | 'Bulk Buyer' | 'Mixed Basket';
}

export interface RecordItem {
  amount: number;
  date: Date;
  dateLabel: string;
}

export interface Records {
  biggestOrder: RecordItem | null;
  smallestOrder: RecordItem | null;
  priciestDay: RecordItem | null;
  priciestWeek: { amount: number; startDate: Date; label: string } | null;
}

export interface FrequencyTrend {
  currentPace: number; // orders per week
  previousPace: number;
  direction: 'Accelerating' | 'Decelerating' | 'Steady';
}

export interface StreaksData {
  longestStreak: number; // consecutive days with orders
  longestGap: number; // consecutive days without orders
}

export interface MultiOrderDays {
  count: number;
  totalOrderingDays: number;
  percent: number;
  label: 'Forgot Something Again' | 'One-Trip Wonder' | 'Occasional Double';
}

export interface InsightsData {
  hourDistribution: HourDistribution;
  dayOfWeek: DayOfWeekDistribution;
  platformSplit: PlatformSplitData;
  momChange: MoMChange;
  projection: MonthlyProjection;
  avgTrend: AvgOrderTrend;
  spendDistribution: SpendDistribution;
  records: Records;
  frequency: FrequencyTrend;
  streaks: StreaksData;
  multiOrderDays: MultiOrderDays;
}
```

- [ ] **Step 2: Commit**

```bash
git add types/insights.ts
git commit -m "feat: add TypeScript interfaces for insights data"
```

---

### Task 3: Implement insights computation — time & personality

**Files:**
- Create: `lib/insights.ts`

This task implements the first 2 computation functions. Remaining functions are added in Tasks 4-6.

- [ ] **Step 1: Create `lib/insights.ts` with hour distribution and day-of-week**

```typescript
import { Order } from '@/types/order';
import {
  HourDistribution,
  DayOfWeekDistribution,
  PlatformSplitData,
  MoMChange,
  MonthlyProjection,
  AvgOrderTrend,
  SpendDistribution,
  Records,
  RecordItem,
  FrequencyTrend,
  StreaksData,
  MultiOrderDays,
  InsightsData,
} from '@/types/insights';
import { PlatformId } from '@/types/platform';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function computeHourDistribution(orders: Order[]): HourDistribution {
  const hours = new Array(24).fill(0);
  for (const o of orders) {
    hours[o.date.getHours()]++;
  }

  const peakHour = hours.indexOf(Math.max(...hours));
  const total = orders.length || 1;

  let persona: HourDistribution['persona'];
  if (peakHour >= 20 || peakHour <= 4) {
    const nightCount = hours.filter((_, i) => i >= 20 || i <= 4).reduce((a, b) => a + b, 0);
    persona = 'Night Owl';
    return { hours, peakHour, peakPeriodPercent: Math.round((nightCount / total) * 100), persona };
  } else if (peakHour >= 5 && peakHour <= 9) {
    const morningCount = hours.slice(5, 10).reduce((a, b) => a + b, 0);
    persona = 'Early Bird';
    return { hours, peakHour, peakPeriodPercent: Math.round((morningCount / total) * 100), persona };
  } else if (peakHour >= 11 && peakHour <= 14) {
    const lunchCount = hours.slice(11, 15).reduce((a, b) => a + b, 0);
    persona = 'Lunch Rusher';
    return { hours, peakHour, peakPeriodPercent: Math.round((lunchCount / total) * 100), persona };
  } else if (peakHour >= 14 && peakHour <= 17) {
    const afternoonCount = hours.slice(14, 18).reduce((a, b) => a + b, 0);
    persona = 'Afternoon Snacker';
    return { hours, peakHour, peakPeriodPercent: Math.round((afternoonCount / total) * 100), persona };
  } else {
    const eveningCount = hours.slice(17, 20).reduce((a, b) => a + b, 0);
    persona = 'Evening Planner';
    return { hours, peakHour, peakPeriodPercent: Math.round((eveningCount / total) * 100), persona };
  }
}

function computeDayOfWeekDistribution(orders: Order[]): DayOfWeekDistribution {
  // index 0 = Monday, 6 = Sunday
  const days = new Array(7).fill(0);
  for (const o of orders) {
    // JS getDay: 0=Sun,1=Mon...6=Sat → convert to Mon=0..Sun=6
    const jsDay = o.date.getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    days[idx]++;
  }

  const total = orders.length || 1;
  const peakDay = days.indexOf(Math.max(...days));
  const weekendCount = days[5] + days[6]; // Sat + Sun
  const weekdayCount = days.slice(0, 5).reduce((a, b) => a + b, 0);

  let pattern: DayOfWeekDistribution['pattern'];
  if ((weekendCount / total) > 0.40) {
    pattern = 'Weekend Warrior';
  } else if ((weekdayCount / total) > 0.75) {
    pattern = 'Weekday Regular';
  } else if (peakDay === 4) { // Friday
    pattern = 'Friday Fiend';
  } else if (Math.max(...days) / total <= 0.20) {
    pattern = 'Spread Out';
  } else {
    pattern = 'Weekday Regular'; // fallback
  }

  return { days, peakDay, pattern };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/insights.ts
git commit -m "feat: add hour and day-of-week insight computations"
```

---

### Task 4: Implement insights computation — spending & platform

**Files:**
- Modify: `lib/insights.ts`

- [ ] **Step 1: Add platform split, avg trend, spend distribution, and records functions**

Append to `lib/insights.ts` before the closing (before `computeInsights` export which will be added in Task 6):

```typescript
function computePlatformSplit(orders: Order[], platformFilter: PlatformId | 'all'): PlatformSplitData {
  if (platformFilter !== 'all') {
    return { platforms: [], loyalty: '', visible: false };
  }

  const byPlatform = new Map<PlatformId, { spend: number; count: number }>();
  for (const o of orders) {
    const entry = byPlatform.get(o.platform) ?? { spend: 0, count: 0 };
    entry.spend += o.amount;
    entry.count++;
    byPlatform.set(o.platform, entry);
  }

  if (byPlatform.size < 2) {
    return { platforms: [], loyalty: '', visible: false };
  }

  const totalSpend = orders.reduce((s, o) => s + o.amount, 0) || 1;
  const platforms = Array.from(byPlatform.entries()).map(([id, data]) => ({
    id,
    spend: data.spend,
    orderCount: data.count,
    avgOrder: data.count > 0 ? Math.round(data.spend / data.count) : 0,
    spendPercent: Math.round((data.spend / totalSpend) * 100),
  }));
  platforms.sort((a, b) => b.spend - a.spend);

  const top = platforms[0];
  const loyalty = top.spendPercent > 70
    ? `${top.id === 'blinkit' ? 'Blinkit' : 'Zepto'} Loyalist`
    : 'Platform Switcher';

  return { platforms, loyalty, visible: true };
}

function computeAvgTrend(orders: Order[]): AvgOrderTrend {
  if (orders.length === 0) {
    return { currentAvg: 0, changePercent: 0, label: 'Steady Spender', direction: 'flat' };
  }

  const sorted = [...orders].sort((a, b) => a.date.getTime() - b.date.getTime());
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const firstAvg = firstHalf.length > 0
    ? firstHalf.reduce((s, o) => s + o.amount, 0) / firstHalf.length
    : 0;
  const secondAvg = secondHalf.length > 0
    ? secondHalf.reduce((s, o) => s + o.amount, 0) / secondHalf.length
    : 0;
  const currentAvg = Math.round(orders.reduce((s, o) => s + o.amount, 0) / orders.length);

  const changePercent = firstAvg > 0
    ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100)
    : 0;

  let label: AvgOrderTrend['label'];
  let direction: AvgOrderTrend['direction'];
  if (changePercent > 10) {
    label = 'Lifestyle Creep';
    direction = 'up';
  } else if (changePercent < -10) {
    label = 'Inflation Fighter';
    direction = 'down';
  } else {
    label = 'Steady Spender';
    direction = 'flat';
  }

  return { currentAvg, changePercent, label, direction };
}

function computeSpendDistribution(orders: Order[]): SpendDistribution {
  const bucketLabels = ['0-200', '200-500', '500-800', '800-1k', '1k+'];
  const buckets = [0, 0, 0, 0, 0];

  for (const o of orders) {
    if (o.amount < 200) buckets[0]++;
    else if (o.amount < 500) buckets[1]++;
    else if (o.amount < 800) buckets[2]++;
    else if (o.amount < 1000) buckets[3]++;
    else buckets[4]++;
  }

  const total = orders.length || 1;
  const lowCount = buckets[0] + buckets[1];
  const highCount = buckets[3] + buckets[4];

  let label: SpendDistribution['label'];
  if (lowCount / total > 0.50) label = 'Quick Runner';
  else if (highCount / total > 0.50) label = 'Bulk Buyer';
  else label = 'Mixed Basket';

  const maxBucket = Math.max(...buckets);
  const dominantBucketPercent = Math.round((maxBucket / total) * 100);

  return { buckets, bucketLabels, dominantBucketPercent, label };
}

function formatRecordDate(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function computeRecords(orders: Order[]): Records {
  if (orders.length === 0) {
    return { biggestOrder: null, smallestOrder: null, priciestDay: null, priciestWeek: null };
  }

  // Biggest / smallest single order
  let biggest = orders[0];
  let smallest = orders[0];
  for (const o of orders) {
    if (o.amount > biggest.amount) biggest = o;
    if (o.amount < smallest.amount) smallest = o;
  }
  const biggestOrder: RecordItem = { amount: biggest.amount, date: biggest.date, dateLabel: formatRecordDate(biggest.date) };
  const smallestOrder: RecordItem = { amount: smallest.amount, date: smallest.date, dateLabel: formatRecordDate(smallest.date) };

  // Priciest day
  const byDay = new Map<string, { total: number; date: Date }>();
  for (const o of orders) {
    const key = o.date.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { total: 0, date: o.date };
    entry.total += o.amount;
    byDay.set(key, entry);
  }
  const priciestDayEntry = Array.from(byDay.values()).reduce((a, b) => b.total > a.total ? b : a);
  const priciestDay: RecordItem = {
    amount: priciestDayEntry.total,
    date: priciestDayEntry.date,
    dateLabel: formatRecordDate(priciestDayEntry.date),
  };

  // Priciest week (Mon-Sun)
  const getWeekKey = (d: Date) => {
    const copy = new Date(d);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    copy.setDate(copy.getDate() + diff);
    return copy.toISOString().slice(0, 10);
  };
  const byWeek = new Map<string, { total: number; startDate: Date }>();
  for (const o of orders) {
    const key = getWeekKey(o.date);
    const entry = byWeek.get(key) ?? { total: 0, startDate: new Date(key) };
    entry.total += o.amount;
    byWeek.set(key, entry);
  }
  const priciestWeekEntry = Array.from(byWeek.values()).reduce((a, b) => b.total > a.total ? b : a);
  const weekEnd = new Date(priciestWeekEntry.startDate);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const priciestWeek = {
    amount: priciestWeekEntry.total,
    startDate: priciestWeekEntry.startDate,
    label: `${MONTH_NAMES[priciestWeekEntry.startDate.getMonth()]} ${priciestWeekEntry.startDate.getDate()}-${weekEnd.getDate()}`,
  };

  return { biggestOrder, smallestOrder, priciestDay, priciestWeek };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/insights.ts
git commit -m "feat: add platform, spending, and records insight computations"
```

---

### Task 5: Implement insights computation — trends & frequency

**Files:**
- Modify: `lib/insights.ts`

- [ ] **Step 1: Add MoM, projection, frequency, streaks, and multi-order day functions**

Append to `lib/insights.ts`:

```typescript
function computeMoMChange(orders: Order[]): MoMChange {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const current = orders.filter(o => o.date.getMonth() === currentMonth && o.date.getFullYear() === currentYear);
  const previous = orders.filter(o => o.date.getMonth() === prevMonth && o.date.getFullYear() === prevYear);

  if (previous.length === 0) {
    return {
      spendChange: null, orderChange: null, avgChange: null,
      currentSpend: current.reduce((s, o) => s + o.amount, 0),
      previousSpend: 0, currentOrders: current.length, previousOrders: 0,
      currentAvg: current.length > 0 ? Math.round(current.reduce((s, o) => s + o.amount, 0) / current.length) : 0,
      previousAvg: 0, hasData: false,
    };
  }

  const currentSpend = current.reduce((s, o) => s + o.amount, 0);
  const previousSpend = previous.reduce((s, o) => s + o.amount, 0);
  const currentAvg = current.length > 0 ? Math.round(currentSpend / current.length) : 0;
  const previousAvg = Math.round(previousSpend / previous.length);

  const pctChange = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

  return {
    spendChange: pctChange(currentSpend, previousSpend),
    orderChange: pctChange(current.length, previous.length),
    avgChange: pctChange(currentAvg, previousAvg),
    currentSpend, previousSpend,
    currentOrders: current.length, previousOrders: previous.length,
    currentAvg, previousAvg,
    hasData: true,
  };
}

function computeProjection(orders: Order[], budget: number | null): MonthlyProjection {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();

  const currentMonth = orders.filter(
    o => o.date.getMonth() === now.getMonth() && o.date.getFullYear() === now.getFullYear()
  );
  const spentSoFar = currentMonth.reduce((s, o) => s + o.amount, 0);

  if (daysElapsed <= 1) {
    return { projectedTotal: 0, spentSoFar, daysElapsed, daysInMonth, monthElapsedPercent: 0, hasEnoughData: false, budget };
  }

  const dailyAvg = spentSoFar / daysElapsed;
  const projectedTotal = Math.round(dailyAvg * daysInMonth);
  const monthElapsedPercent = Math.round((daysElapsed / daysInMonth) * 100);

  return { projectedTotal, spentSoFar, daysElapsed, daysInMonth, monthElapsedPercent, hasEnoughData: true, budget };
}

function computeFrequencyTrend(orders: Order[]): FrequencyTrend {
  if (orders.length === 0) {
    return { currentPace: 0, previousPace: 0, direction: 'Steady' };
  }

  const sorted = [...orders].sort((a, b) => a.date.getTime() - b.date.getTime());
  const totalMs = sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime();
  const totalWeeks = Math.max(totalMs / (7 * 24 * 60 * 60 * 1000), 1);
  const currentPace = Math.round((orders.length / totalWeeks) * 10) / 10;

  // Compare first half vs second half pace
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const firstMs = firstHalf.length > 1
    ? firstHalf[firstHalf.length - 1].date.getTime() - firstHalf[0].date.getTime()
    : 1;
  const secondMs = secondHalf.length > 1
    ? secondHalf[secondHalf.length - 1].date.getTime() - secondHalf[0].date.getTime()
    : 1;

  const firstWeeks = Math.max(firstMs / (7 * 24 * 60 * 60 * 1000), 1);
  const secondWeeks = Math.max(secondMs / (7 * 24 * 60 * 60 * 1000), 1);
  const firstPace = firstHalf.length / firstWeeks;
  const secondPace = secondHalf.length / secondWeeks;
  const previousPace = Math.round(firstPace * 10) / 10;

  let direction: FrequencyTrend['direction'];
  if (secondPace > firstPace * 1.1) direction = 'Accelerating';
  else if (secondPace < firstPace * 0.9) direction = 'Decelerating';
  else direction = 'Steady';

  return { currentPace, previousPace, direction };
}

function computeStreaks(orders: Order[]): StreaksData {
  if (orders.length === 0) {
    return { longestStreak: 0, longestGap: 0 };
  }

  // Get unique dates as YYYY-MM-DD strings
  const dateSet = new Set<string>();
  for (const o of orders) {
    dateSet.add(o.date.toISOString().slice(0, 10));
  }
  const sortedDates = Array.from(dateSet).sort();

  if (sortedDates.length === 0) return { longestStreak: 0, longestGap: 0 };

  let longestStreak = 1;
  let currentStreak = 1;
  let longestGap = 0;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
      longestGap = Math.max(longestGap, diffDays - 1);
    }
  }

  return { longestStreak, longestGap };
}

function computeMultiOrderDays(orders: Order[]): MultiOrderDays {
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const key = o.date.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const totalOrderingDays = byDay.size;
  const multiDays = Array.from(byDay.values()).filter(c => c >= 2).length;
  const percent = totalOrderingDays > 0 ? Math.round((multiDays / totalOrderingDays) * 100) : 0;

  let label: MultiOrderDays['label'];
  if (percent > 15) label = 'Forgot Something Again';
  else if (percent < 5) label = 'One-Trip Wonder';
  else label = 'Occasional Double';

  return { count: multiDays, totalOrderingDays, percent, label };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/insights.ts
git commit -m "feat: add trends, frequency, streaks, and multi-order insight computations"
```

---

### Task 6: Add `computeInsights` orchestrator

**Files:**
- Modify: `lib/insights.ts`

- [ ] **Step 1: Add the main exported function at the bottom of `lib/insights.ts`**

```typescript
export function computeInsights(orders: Order[], platformFilter: PlatformId | 'all', budget: number | null = null): InsightsData {
  return {
    hourDistribution: computeHourDistribution(orders),
    dayOfWeek: computeDayOfWeekDistribution(orders),
    platformSplit: computePlatformSplit(orders, platformFilter),
    momChange: computeMoMChange(orders),
    projection: computeProjection(orders, budget),
    avgTrend: computeAvgTrend(orders),
    spendDistribution: computeSpendDistribution(orders),
    records: computeRecords(orders),
    frequency: computeFrequencyTrend(orders),
    streaks: computeStreaks(orders),
    multiOrderDays: computeMultiOrderDays(orders),
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add lib/insights.ts
git commit -m "feat: add computeInsights orchestrator function"
```

---

### Task 7: Build insight card components — personality section

**Files:**
- Create: `components/insights/ordering-persona-card.tsx`
- Create: `components/insights/day-of-week-card.tsx`

- [ ] **Step 1: Create `components/insights/ordering-persona-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { HourDistribution } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

const PERSONA_COLORS: Record<HourDistribution['persona'], string> = {
  'Night Owl': '#f59e0b',
  'Early Bird': '#06b6d4',
  'Lunch Rusher': Colors.green,
  'Afternoon Snacker': '#a855f7',
  'Evening Planner': '#f97316',
};

const PERSONA_ICONS: Record<HourDistribution['persona'], string> = {
  'Night Owl': '🌙',
  'Early Bird': '🌅',
  'Lunch Rusher': '🍽️',
  'Afternoon Snacker': '☕',
  'Evening Planner': '🛒',
};

interface Props {
  data: HourDistribution;
}

export function OrderingPersonaCard({ data }: Props) {
  const maxCount = Math.max(...data.hours, 1);
  const color = PERSONA_COLORS[data.persona];
  const chartHeight = 40;
  const barWidth = 100 / 24; // percentage per bar

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.label}>YOU'RE A</Text>
          <Text style={[styles.persona, { color }]}>
            {PERSONA_ICONS[data.persona]} {data.persona}
          </Text>
        </View>
        <Text style={styles.stat}>{data.peakPeriodPercent}% in peak hours</Text>
      </View>

      <Svg width="100%" height={chartHeight} style={styles.chart}>
        {data.hours.map((count, i) => {
          const h = (count / maxCount) * chartHeight;
          const opacity = count / maxCount;
          const barColor = opacity > 0.3 ? color : Colors.bgOverlay;
          return (
            <Rect
              key={i}
              x={`${i * barWidth}%`}
              y={chartHeight - h}
              width={`${barWidth - 0.5}%`}
              height={h}
              rx={1.5}
              fill={barColor}
              opacity={Math.max(opacity, 0.15)}
            />
          );
        })}
      </Svg>

      <View style={styles.xLabels}>
        <Text style={styles.xLabel}>12 AM</Text>
        <Text style={styles.xLabel}>6 AM</Text>
        <Text style={styles.xLabel}>12 PM</Text>
        <Text style={styles.xLabel}>6 PM</Text>
        <Text style={styles.xLabel}>11 PM</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  label: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
  },
  persona: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  stat: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  chart: {
    marginBottom: 4,
  },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontFamily: mono,
  },
});
```

- [ ] **Step 2: Create `components/insights/day-of-week-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { DayOfWeekDistribution } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const PATTERN_COLORS: Record<DayOfWeekDistribution['pattern'], string> = {
  'Weekend Warrior': '#8b5cf6',
  'Weekday Regular': Colors.green,
  'Friday Fiend': '#f59e0b',
  'Spread Out': '#06b6d4',
};

const PATTERN_ICONS: Record<DayOfWeekDistribution['pattern'], string> = {
  'Weekend Warrior': '📅',
  'Weekday Regular': '💼',
  'Friday Fiend': '🎉',
  'Spread Out': '⚖️',
};

interface Props {
  data: DayOfWeekDistribution;
}

export function DayOfWeekCard({ data }: Props) {
  const maxCount = Math.max(...data.days, 1);
  const color = PATTERN_COLORS[data.pattern];
  const maxBarHeight = 50;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>PATTERN</Text>
        <Text style={[styles.persona, { color }]}>
          {PATTERN_ICONS[data.pattern]} {data.pattern}
        </Text>
      </View>

      <View style={styles.bars}>
        {data.days.map((count, i) => {
          const h = (count / maxCount) * maxBarHeight;
          const isPeak = i === data.peakDay;
          return (
            <View key={i} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(h, 3),
                    backgroundColor: isPeak ? Colors.green : `${Colors.green}${Math.round((count / maxCount) * 200 + 55).toString(16).padStart(2, '0')}`,
                  },
                ]}
              />
              <Text style={[styles.dayLabel, isPeak && styles.dayLabelActive]}>
                {DAY_LABELS[i]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  headerRow: {
    marginBottom: 14,
  },
  label: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
  },
  persona: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 65,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  dayLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 4,
    fontFamily: mono,
  },
  dayLabelActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add components/insights/
git commit -m "feat: add personality section insight cards"
```

---

### Task 8: Build insight card components — platform split & trends

**Files:**
- Create: `components/insights/platform-split-card.tsx`
- Create: `components/insights/mom-change-card.tsx`
- Create: `components/insights/projection-card.tsx`

- [ ] **Step 1: Create `components/insights/platform-split-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { PlatformSplitData } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

const PLATFORM_COLORS: Record<string, string> = {
  blinkit: '#fbbf24',
  zepto: '#7c3aed',
};

const PLATFORM_NAMES: Record<string, string> = {
  blinkit: 'Blinkit',
  zepto: 'Zepto',
};

interface Props {
  data: PlatformSplitData;
}

export function PlatformSplitCard({ data }: Props) {
  if (!data.visible) return null;

  const size = 80;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>YOU'RE A</Text>
      <Text style={[styles.loyalty, { color: PLATFORM_COLORS[data.platforms[0]?.id] ?? Colors.green }]}>
        💛 {data.loyalty}
      </Text>

      <View style={styles.body}>
        <Svg width={size} height={size}>
          {data.platforms.map((p, i) => {
            const offset = data.platforms
              .slice(0, i)
              .reduce((sum, pp) => sum + (pp.spendPercent / 100) * circumference, 0);
            return (
              <Circle
                key={p.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={PLATFORM_COLORS[p.id] ?? Colors.green}
                strokeWidth={strokeWidth}
                strokeDasharray={`${(p.spendPercent / 100) * circumference} ${circumference}`}
                strokeDashoffset={-offset}
                fill="none"
                strokeLinecap="round"
              />
            );
          })}
        </Svg>

        <View style={styles.legend}>
          {data.platforms.map((p) => (
            <View key={p.id} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: PLATFORM_COLORS[p.id] }]} />
              <Text style={styles.legendText}>
                {PLATFORM_NAMES[p.id]} — {p.spendPercent}% (₹{(p.spend / 1000).toFixed(1)}k)
              </Text>
            </View>
          ))}
          <Text style={styles.avgText}>
            Avg: {data.platforms.map(p => `${PLATFORM_NAMES[p.id]} ₹${p.avgOrder}`).join(' · ')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  label: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
  },
  loyalty: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 14,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  avgText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
```

- [ ] **Step 2: Create `components/insights/mom-change-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { formatCurrency } from '@/lib/analytics';
import { MoMChange } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

function formatK(n: number): string {
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

interface Props {
  data: MoMChange;
}

export function MoMChangeCard({ data }: Props) {
  if (!data.hasData) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>VS LAST MONTH</Text>
        <Text style={styles.noData}>Need 2+ months of data</Text>
      </View>
    );
  }

  const metrics = [
    {
      name: 'Spend',
      change: data.spendChange,
      from: formatK(data.previousSpend),
      to: formatK(data.currentSpend),
      // Spend increase = bad (red), decrease = good (green)
      color: (data.spendChange ?? 0) > 0 ? Colors.red : (data.spendChange ?? 0) < 0 ? Colors.green : Colors.textMuted,
    },
    {
      name: 'Orders',
      change: data.orderChange,
      from: String(data.previousOrders),
      to: String(data.currentOrders),
      color: Colors.textMuted, // neutral
    },
    {
      name: 'Avg',
      change: data.avgChange,
      from: formatK(data.previousAvg),
      to: formatK(data.currentAvg),
      color: (data.avgChange ?? 0) > 0 ? Colors.red : (data.avgChange ?? 0) < 0 ? Colors.green : Colors.textMuted,
    },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>VS LAST MONTH</Text>
      <View style={styles.metricsRow}>
        {metrics.map((m) => (
          <View key={m.name} style={styles.metricBox}>
            <Text style={styles.metricName}>{m.name}</Text>
            <Text style={[styles.metricChange, { color: m.color }]}>
              {m.change !== null ? `${m.change > 0 ? '+' : ''}${m.change}%` : '—'}
            </Text>
            <Text style={styles.metricRange}>{m.from} → {m.to}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  sectionLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
    marginBottom: 10,
  },
  noData: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  metricName: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  metricChange: {
    fontSize: 20,
    fontWeight: '700',
  },
  metricRange: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: mono,
  },
});
```

- [ ] **Step 3: Create `components/insights/projection-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { formatCurrency } from '@/lib/analytics';
import { MonthlyProjection } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface Props {
  data: MonthlyProjection;
}

export function ProjectionCard({ data }: Props) {
  if (!data.hasEnoughData) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>THIS MONTH'S FORECAST</Text>
        <Text style={styles.noData}>Not enough data yet</Text>
      </View>
    );
  }

  const progressPercent = data.projectedTotal > 0
    ? Math.min((data.spentSoFar / data.projectedTotal) * 100, 100)
    : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>THIS MONTH'S FORECAST</Text>
      <View style={styles.valueRow}>
        <Text style={styles.projected}>{formatCurrency(data.projectedTotal)}</Text>
        <Text style={styles.projectedSub}>projected by month end</Text>
      </View>

      <View style={styles.progressBg}>
        <Svg width={`${progressPercent}%`} height={8} style={styles.progressFill}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={Colors.green} />
              <Stop offset="1" stopColor="#f59e0b" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height={8} rx={4} fill="url(#grad)" />
        </Svg>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{formatCurrency(data.spentSoFar)} spent so far</Text>
        <Text style={styles.footerText}>{data.monthElapsedPercent}% of month</Text>
      </View>

      {data.budget !== null && (
        <View style={styles.budgetRow}>
          <Text style={styles.budgetText}>
            vs budget: {formatCurrency(data.budget)}
            {data.projectedTotal > data.budget
              ? ` — projected to exceed by ${formatCurrency(data.projectedTotal - data.budget)}`
              : ` — on track (${formatCurrency(data.budget - data.projectedTotal)} under)`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  label: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
  },
  noData: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  projected: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  projectedSub: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  progressBg: {
    height: 8,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  footerText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: mono,
  },
  budgetRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  budgetText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: mono,
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add components/insights/
git commit -m "feat: add platform split, MoM change, and projection insight cards"
```

---

### Task 9: Build insight card components — spending section

**Files:**
- Create: `components/insights/avg-trend-card.tsx`
- Create: `components/insights/spend-distribution-card.tsx`
- Create: `components/insights/records-card.tsx`

- [ ] **Step 1: Create `components/insights/avg-trend-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { formatCurrency } from '@/lib/analytics';
import { AvgOrderTrend } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface Props {
  data: AvgOrderTrend;
}

export function AvgTrendCard({ data }: Props) {
  const changeColor = data.direction === 'up' ? Colors.red
    : data.direction === 'down' ? Colors.green
    : Colors.textMuted;
  const arrow = data.direction === 'up' ? '↑' : data.direction === 'down' ? '↓' : '→';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View>
          <Text style={styles.label}>AVG ORDER VALUE</Text>
          <Text style={styles.value}>{formatCurrency(data.currentAvg)}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.change, { color: changeColor }]}>
            {arrow} {Math.abs(data.changePercent)}%
          </Text>
          <Text style={styles.sublabel}>{data.label} {data.direction === 'up' ? '😬' : data.direction === 'down' ? '💪' : '😌'}</Text>
        </View>
      </View>
      <View style={[styles.trendBar, {
        backgroundColor: data.direction === 'up'
          ? Colors.red + '33'
          : data.direction === 'down'
          ? Colors.green + '33'
          : Colors.textMuted + '22',
      }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
  },
  change: {
    fontSize: 14,
    fontWeight: '600',
  },
  sublabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  trendBar: {
    height: 6,
    borderRadius: 3,
    marginTop: 12,
  },
});
```

- [ ] **Step 2: Create `components/insights/spend-distribution-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { SpendDistribution } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

const LABEL_COLORS: Record<SpendDistribution['label'], string> = {
  'Quick Runner': '#06b6d4',
  'Bulk Buyer': '#f59e0b',
  'Mixed Basket': '#a855f7',
};

const LABEL_ICONS: Record<SpendDistribution['label'], string> = {
  'Quick Runner': '🏃',
  'Bulk Buyer': '🛒',
  'Mixed Basket': '🧺',
};

interface Props {
  data: SpendDistribution;
}

export function SpendDistributionCard({ data }: Props) {
  const maxBucket = Math.max(...data.buckets, 1);
  const maxBarHeight = 45;
  const color = LABEL_COLORS[data.label];

  return (
    <View style={styles.card}>
      <Text style={styles.label}>YOU'RE A</Text>
      <Text style={[styles.persona, { color }]}>
        {LABEL_ICONS[data.label]} {data.label}
      </Text>
      <Text style={styles.sub}>{data.dominantBucketPercent}% in top bucket</Text>

      <View style={styles.bars}>
        {data.buckets.map((count, i) => {
          const h = (count / maxBucket) * maxBarHeight;
          const opacity = count / maxBucket;
          return (
            <View key={i} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(h, 3),
                    backgroundColor: `${Colors.green}${Math.round(Math.max(opacity, 0.2) * 255).toString(16).padStart(2, '0')}`,
                  },
                ]}
              />
              <Text style={styles.bucketLabel}>{data.bucketLabels[i]}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.axisLabel}>Order amount (₹)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  label: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
  },
  persona: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  sub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 14,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 60,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  bar: {
    width: '100%',
    borderRadius: 3,
  },
  bucketLabel: {
    fontSize: 9,
    color: Colors.textDisabled,
    fontFamily: mono,
    marginTop: 4,
  },
  axisLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    textAlign: 'center',
    marginTop: 4,
  },
});
```

- [ ] **Step 3: Create `components/insights/records-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { formatCurrency } from '@/lib/analytics';
import { Records } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface Props {
  data: Records;
}

interface RecordBox {
  icon: string;
  title: string;
  amount: string;
  date: string;
  color: string;
}

export function RecordsCard({ data }: Props) {
  if (!data.biggestOrder) return null;

  const boxes: RecordBox[] = [
    {
      icon: '🏆', title: 'Biggest Order',
      amount: formatCurrency(data.biggestOrder!.amount),
      date: data.biggestOrder!.dateLabel,
      color: '#f59e0b',
    },
    {
      icon: '🤏', title: 'Smallest Order',
      amount: formatCurrency(data.smallestOrder!.amount),
      date: data.smallestOrder!.dateLabel,
      color: '#06b6d4',
    },
    {
      icon: '🔥', title: 'Priciest Day',
      amount: formatCurrency(data.priciestDay!.amount),
      date: data.priciestDay!.dateLabel,
      color: Colors.red,
    },
    {
      icon: '📦', title: 'Priciest Week',
      amount: data.priciestWeek ? formatCurrency(data.priciestWeek.amount) : '—',
      date: data.priciestWeek?.label ?? '',
      color: '#a855f7',
    },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>RECORDS & EXTREMES</Text>
      <View style={styles.grid}>
        {boxes.map((b) => (
          <View key={b.title} style={styles.box}>
            <Text style={styles.boxTitle}>{b.icon} {b.title}</Text>
            <Text style={[styles.boxValue, { color: b.color }]}>{b.amount}</Text>
            <Text style={styles.boxDate}>{b.date}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  sectionLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  box: {
    width: '47%',
    backgroundColor: Colors.bgOverlay,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  boxTitle: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  boxValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  boxDate: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontFamily: mono,
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add components/insights/
git commit -m "feat: add spending section insight cards"
```

---

### Task 10: Build insight card components — frequency section

**Files:**
- Create: `components/insights/frequency-card.tsx`
- Create: `components/insights/streaks-card.tsx`
- Create: `components/insights/multi-order-card.tsx`

- [ ] **Step 1: Create `components/insights/frequency-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { FrequencyTrend } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface Props {
  data: FrequencyTrend;
}

export function FrequencyCard({ data }: Props) {
  const dirColor = data.direction === 'Accelerating' ? Colors.red
    : data.direction === 'Decelerating' ? Colors.green
    : Colors.textMuted;
  const arrow = data.direction === 'Accelerating' ? '↑' : data.direction === 'Decelerating' ? '↓' : '→';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View>
          <Text style={styles.label}>ORDERING PACE</Text>
          <Text style={styles.value}>{data.currentPace} orders/week</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.direction, { color: dirColor }]}>{arrow} {data.direction}</Text>
          <Text style={styles.prev}>was {data.previousPace}/wk</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
  },
  direction: {
    fontSize: 14,
    fontWeight: '600',
  },
  prev: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Create `components/insights/streaks-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { StreaksData } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

interface Props {
  data: StreaksData;
}

export function StreaksCard({ data }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.grid}>
        <View style={styles.col}>
          <Text style={styles.colLabel}>🔥 LONGEST STREAK</Text>
          <Text style={[styles.bigNum, { color: '#f59e0b' }]}>{data.longestStreak}</Text>
          <Text style={styles.unit}>consecutive days</Text>
          <Text style={styles.sub}>Marathon Orderer</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.colLabel}>🧘 LONGEST BREAK</Text>
          <Text style={[styles.bigNum, { color: Colors.green }]}>{data.longestGap}</Text>
          <Text style={styles.unit}>days off</Text>
          <Text style={styles.sub}>Detox Champion</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  colLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontFamily: mono,
    textTransform: 'uppercase',
  },
  bigNum: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },
  unit: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  sub: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
});
```

- [ ] **Step 3: Create `components/insights/multi-order-card.tsx`**

```typescript
import { Colors } from '@/src/theme/colors';
import { MultiOrderDays } from '@/types/insights';
import { Platform, StyleSheet, Text, View } from 'react-native';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

const LABEL_COLORS: Record<MultiOrderDays['label'], string> = {
  'Forgot Something Again': '#f97316',
  'One-Trip Wonder': Colors.green,
  'Occasional Double': '#06b6d4',
};

const LABEL_ICONS: Record<MultiOrderDays['label'], string> = {
  'Forgot Something Again': '😅',
  'One-Trip Wonder': '👌',
  'Occasional Double': '✌️',
};

interface Props {
  data: MultiOrderDays;
}

export function MultiOrderCard({ data }: Props) {
  const color = LABEL_COLORS[data.label];

  return (
    <View style={styles.card}>
      <Text style={styles.label}>MULTI-ORDER DAYS</Text>
      <Text style={[styles.persona, { color }]}>
        {LABEL_ICONS[data.label]} {data.label}
      </Text>
      <View style={styles.statRow}>
        <Text style={styles.bigNum}>{data.count}</Text>
        <Text style={styles.statText}>
          days with 2+ orders ({data.percent}% of ordering days)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
  },
  label: {
    fontSize: 10,
    color: Colors.textDisabled,
    letterSpacing: 1.2,
    fontFamily: mono,
  },
  persona: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 10,
  },
  bigNum: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statText: {
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add components/insights/
git commit -m "feat: add frequency section insight cards"
```

---

### Task 11: Build the Insights screen

**Files:**
- Create: `app/(tabs)/insights.tsx`

- [ ] **Step 1: Create `app/(tabs)/insights.tsx`**

```typescript
import { computeInsights } from '@/lib/insights';
import { getAllOrdersAsObjects, getOrdersAsObjects, getMonthlyBudget } from '@/lib/storage';
import { getSelectedPlatforms } from '@/lib/platformSettings';
import { BarRange, BAR_RANGES } from '@/constants/ranges';
import { Colors } from '@/src/theme/colors';
import { PlatformId, ALL_PLATFORMS, PLATFORM_CONFIGS } from '@/types/platform';
import { Order } from '@/types/order';
import { InsightsData } from '@/types/insights';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OrderingPersonaCard } from '@/components/insights/ordering-persona-card';
import { DayOfWeekCard } from '@/components/insights/day-of-week-card';
import { PlatformSplitCard } from '@/components/insights/platform-split-card';
import { MoMChangeCard } from '@/components/insights/mom-change-card';
import { ProjectionCard } from '@/components/insights/projection-card';
import { AvgTrendCard } from '@/components/insights/avg-trend-card';
import { SpendDistributionCard } from '@/components/insights/spend-distribution-card';
import { RecordsCard } from '@/components/insights/records-card';
import { FrequencyCard } from '@/components/insights/frequency-card';
import { StreaksCard } from '@/components/insights/streaks-card';
import { MultiOrderCard } from '@/components/insights/multi-order-card';

const mono = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

export default function InsightsScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [range, setRange] = useState<BarRange>('1Y');
  const [platformFilter, setPlatformFilter] = useState<PlatformId | 'all'>('all');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([]);
  const [hasData, setHasData] = useState(false);
  const [budget, setBudget] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const platforms = await getSelectedPlatforms();
        if (!active) return;
        setSelectedPlatforms(platforms.length > 0 ? platforms : ALL_PLATFORMS);

        const [{ orders: fetchedOrders }, storedBudget] = await Promise.all([
          platformFilter === 'all'
            ? getAllOrdersAsObjects()
            : getOrdersAsObjects(platformFilter),
          getMonthlyBudget(),
        ]);

        if (!active) return;
        setOrders(fetchedOrders);
        setHasData(fetchedOrders.length > 0);
        setBudget(storedBudget);
      })();
      return () => { active = false; };
    }, [platformFilter])
  );

  const filteredOrders = useMemo(() => {
    const rangeConfig = BAR_RANGES.find(r => r.key === range);
    if (!rangeConfig || rangeConfig.months === null) return orders;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - rangeConfig.months);
    return orders.filter(o => o.date >= cutoff);
  }, [orders, range]);

  const insights: InsightsData | null = useMemo(() => {
    if (filteredOrders.length === 0) return null;
    return computeInsights(filteredOrders, platformFilter, budget);
  }, [filteredOrders, platformFilter, budget]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>QC SPEND TRACKER</Text>
        <Text style={styles.headerTitle}>Insights</Text>
      </View>

      {/* Range pills */}
      <View style={styles.pills}>
        {BAR_RANGES.map((r) => (
          <Pressable
            key={r.key}
            style={[styles.pill, range === r.key && styles.pillActive]}
            onPress={() => setRange(r.key)}
          >
            <Text style={[styles.pillText, range === r.key && styles.pillTextActive]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Platform filter */}
      <View style={styles.platformTabs}>
        {(['all', ...ALL_PLATFORMS] as const).map((id) => {
          const isAll = id === 'all';
          const isActive = platformFilter === id;
          const isEnabled = isAll || selectedPlatforms.includes(id as PlatformId);
          return (
            <Pressable
              key={id}
              style={[styles.platformTab, isActive && styles.platformTabActive, !isEnabled && styles.platformTabDisabled]}
              onPress={() => isEnabled && setPlatformFilter(id)}
              disabled={!isEnabled}
            >
              <Text style={[styles.platformTabText, isActive && styles.platformTabTextActive, !isEnabled && styles.platformTabTextDisabled]}>
                {isAll ? 'All' : PLATFORM_CONFIGS[id as PlatformId].displayName}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!hasData ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Sync your orders to see insights</Text>
        </View>
      ) : insights ? (
        <>
          {/* Section 1: Your Personality */}
          <Text style={styles.sectionHeader}>YOUR PERSONALITY</Text>
          <OrderingPersonaCard data={insights.hourDistribution} />
          <DayOfWeekCard data={insights.dayOfWeek} />

          {/* Section 2: Platform Split */}
          {insights.platformSplit.visible && (
            <>
              <Text style={styles.sectionHeader}>PLATFORM SPLIT</Text>
              <PlatformSplitCard data={insights.platformSplit} />
            </>
          )}

          {/* Section 3: Trends & Forecast */}
          <Text style={styles.sectionHeader}>TRENDS & FORECAST</Text>
          <MoMChangeCard data={insights.momChange} />
          <ProjectionCard data={insights.projection} />

          {/* Section 4: Spending Behavior */}
          <Text style={styles.sectionHeader}>SPENDING BEHAVIOR</Text>
          <AvgTrendCard data={insights.avgTrend} />
          <SpendDistributionCard data={insights.spendDistribution} />
          <RecordsCard data={insights.records} />

          {/* Section 5: Frequency & Streaks */}
          <Text style={styles.sectionHeader}>FREQUENCY & STREAKS</Text>
          <FrequencyCard data={insights.frequency} />
          <StreaksCard data={insights.streaks} />
          <MultiOrderCard data={insights.multiOrderDays} />
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No orders in this period</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 48,
    gap: 12,
  },
  header: {
    gap: 4,
    marginBottom: 12,
  },
  headerLabel: {
    fontSize: 11,
    color: Colors.textDisabled,
    letterSpacing: 1.4,
    fontFamily: mono,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },

  // Range pills
  pills: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.bgOverlay,
  },
  pillActive: {
    backgroundColor: Colors.green,
  },
  pillText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  pillTextActive: {
    color: Colors.bgBase,
    fontWeight: '600',
  },

  // Platform filter
  platformTabs: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 12,
  },
  platformTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: Colors.bgOverlay,
  },
  platformTabActive: {
    backgroundColor: Colors.green + '33',
  },
  platformTabText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  platformTabTextActive: {
    color: Colors.green,
    fontWeight: '600',
  },
  platformTabDisabled: {
    opacity: 0.3,
  },
  platformTabTextDisabled: {
    color: Colors.textDisabled,
  },

  // Section headers
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.green,
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 0,
    fontFamily: mono,
  },

  // Empty state
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/\(tabs\)/insights.tsx
git commit -m "feat: add Insights screen with all 11 insight cards"
```

---

### Task 12: Register the Insights tab in navigation

**Files:**
- Modify: `app/(tabs)/_layout.tsx:26-33`

- [ ] **Step 1: Add Insights tab between Dashboard and Sync**

In `app/(tabs)/_layout.tsx`, insert a new `<Tabs.Screen>` block after the Dashboard tab (line 31) and before the Sync tab (line 33):

```typescript
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <Ionicons name="analytics-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Sync',
          tabBarIcon: ({ color }) => <Ionicons name="sync" size={24} color={color} />,
        }}
      />
```

- [ ] **Step 2: Verify the app loads with the new tab**

Run: `npx expo start` and confirm all 5 tabs appear in order: Dashboard, Insights, Sync, Badges, Settings.

- [ ] **Step 3: Commit**

```bash
git add app/\(tabs\)/_layout.tsx
git commit -m "feat: register Insights as 2nd tab in navigation"
```

---

### Task 13: Verify TypeScript compilation and visual check

- [ ] **Step 1: Run TypeScript compiler check**

Run: `npx tsc --noEmit`

Fix any type errors that arise.

- [ ] **Step 2: Visual smoke test**

Run the app with `npx expo start`. Navigate to the Insights tab and verify:
- Range pills toggle correctly and update all cards
- Platform filter tabs work
- Section headers appear in correct order
- All 11 insight cards render with sample data
- Platform Split section hides when a single platform is selected
- Empty state shows when no orders are synced
- Scrolling is smooth

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve any TypeScript or rendering issues in insights page"
```
