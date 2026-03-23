# Insights Page — Design Spec

## Overview

A new **Insights** tab added to the bottom navigation (positioned 2nd, after Dashboard and before Sync) that computes and displays 11 analytics cards from existing order data (time + amount + frequency + platform). Each insight has a fun personality label paired with its underlying data visualization. All insights are computed on-the-fly with `useMemo` — no storage changes required. Adding this tab brings the total to 5 tabs.

## Decisions

| Decision | Choice |
|----------|--------|
| Navigation | New tab, positioned 2nd (after Dashboard, before Sync). Total: 5 tabs. |
| Vibe | Mix — data-driven insights with personality labels |
| Time range | User-selectable (3M / 6M / 1Y / 2Y / Lifetime), global — same 5 options as dashboard |
| Layout | Single scrollable page, sections stacked vertically |
| Shareability | Deferred — analytics-first |
| Architecture | Lazy compute with `useMemo`, keyed on orders + time range |

## Section Order

1. **Your Personality** — Ordering Persona, Day-of-Week Pattern
2. **Platform Split** — Platform Loyalty
3. **Trends & Forecast** — Month-over-Month Change, Monthly Projection
4. **Spending Behavior** — Avg Order Trend, Spend Distribution, Records & Extremes
5. **Frequency & Streaks** — Order Frequency Trend, Streaks & Gaps, Multi-Order Days

## Design System Constraints

All UI must use the existing design tokens from `@/src/theme/colors`. No new color constants — use what exists. **Exception:** The Records & Extremes card and personality label colors may use inline accent colors (amber `#f59e0b`, cyan `#06b6d4`, purple `#a855f7`, orange `#f97316`) for visual variety, since the existing palette lacks enough distinct accents for this purpose.

| Token | Value | Usage |
|-------|-------|-------|
| `Colors.bgBase` | `#080808` | ScrollView background |
| `Colors.bgCard` | `#111111` | Card backgrounds |
| `Colors.borderSubtle` | `#1e1e1e` | Card borders |
| `Colors.textPrimary` | `#f0f0f0` | Primary values |
| `Colors.textHeading` | `#e5e5e5` | Heading text |
| `Colors.textMuted` | `#888888` | Section titles, secondary text |
| `Colors.textDisabled` | `#444444` | Labels (uppercase, monospace) |
| `Colors.green` | `#22c55e` | Primary accent, positive indicators |
| `Colors.red` | `#ef4444` | Negative indicators (spend increase) |
| `Colors.bgOverlay` | `#1a1a1a` | Nested containers within cards |
| `Colors.bgElevated` | `#141414` | Sub-elements within cards |

### Card Pattern (must match dashboard)

```
backgroundColor: Colors.bgCard (#111111)
borderWidth: 1
borderColor: Colors.borderSubtle (#1e1e1e)
borderRadius: 20
padding: 20
```

### Typography Pattern

- **Page title:** fontSize 26, fontWeight 600, `Colors.textPrimary`, letterSpacing -0.5
- **Section headers:** fontSize 13, fontWeight 500, `Colors.textMuted`
- **Card labels:** fontSize 9-11, monospace font, uppercase, letterSpacing 1-1.4, `Colors.textDisabled`
- **Big values:** fontSize 22-44, fontWeight 700, letterSpacing -0.5 to -1.5
- **Personality labels:** fontSize 18-22, fontWeight 700, accent color per insight
- **Supporting text:** fontSize 12, `Colors.textMuted`

### Page Layout

- `padding: 20` horizontal
- `paddingTop: 60`
- `gap: 12` between cards
- Section headers have `marginBottom: 12`

## Insight Cards — Detailed Specifications

### 1. Ordering Persona

**Section:** Your Personality
**Data:** Count orders by hour-of-day (0-23). Find peak cluster.

**Personality labels:**
- "Night Owl" — peak hour >= 20:00 or <= 04:00
- "Early Bird" — peak hour between 05:00-09:00
- "Lunch Rusher" — peak hour between 11:00-14:00
- "Afternoon Snacker" — peak hour between 14:00-17:00
- "Evening Planner" — peak hour between 17:00-20:00

**Visualization:** 24 vertical bars (one per hour), colored with gradient intensity based on order count. Peak hours use `Colors.green` at full opacity, lower counts fade toward `Colors.bgOverlay`.

**Metrics shown:**
- Persona label (large, colored)
- Percentage of orders in peak period
- 24-bar hour distribution chart
- X-axis labels: 12 AM, 6 AM, 12 PM, 6 PM, 11 PM

### 2. Day-of-Week Pattern

**Section:** Your Personality
**Data:** Count orders by day-of-week (Mon-Sun).

**Personality labels:**
- "Weekend Warrior" — Sat+Sun combined > 40% of orders
- "Weekday Regular" — Mon-Fri combined > 75%
- "Friday Fiend" — Friday is the single peak day
- "Spread Out" — no day exceeds 20% (relatively even)

**Visualization:** 7 vertical bars (Mon→Sun), heights proportional to order count. Peak day bar uses full `Colors.green`, others scaled proportionally.

**Metrics shown:**
- Pattern label (large, colored)
- Bar chart with M/T/W/T/F/S/S labels

### 3. Platform Loyalty

**Section:** Platform Split
**Data:** Group orders by platform. Compute spend share, order count share, and average order value per platform.

**Personality labels:**
- "{Platform} Loyalist" — one platform > 70%
- "Platform Switcher" — no platform > 70%
- Show only when 2+ platforms have data; hide entire section if single-platform user
- Also hide when platform filter is set to a specific platform (section is meaningless for single-platform view)

**Visualization:** Donut chart via `react-native-svg` using `<Circle>` with `strokeDasharray` for segments. Platform colors: Blinkit `#fbbf24`, Zepto `#7c3aed`.

**Metrics shown:**
- Loyalty label
- Donut chart with percentage
- Per-platform breakdown: spend total, order count, average order value

### 4. Month-over-Month Change

**Section:** Trends & Forecast
**Data:** Compare current month's spend, order count, and average order value to previous month. Compute percentage change for each.

**Visualization:** Three side-by-side metric boxes inside one card. Each box shows: metric name, % change (green for decrease = good, red for increase = bad in spend context), and absolute values (e.g., "₹8.2k → ₹9.7k").

**Color logic:**
- Spend/Avg increase → `Colors.red` (spending more)
- Spend/Avg decrease → `Colors.green` (spending less)
- Order count is neutral — show `Colors.textMuted`

### 5. Monthly Projection

**Section:** Trends & Forecast
**Data:** Current month spend so far. Compute daily average from days elapsed. Project to month end (daily avg * days in month).

**Visualization:**
- Projected total (large value)
- Progress bar showing spend-so-far as percentage of projected total
- "₹X spent so far" and "Y% of month elapsed" labels

**Edge cases:**
- First day of month: show "Not enough data" instead of projection
- If budget is set, also show projected vs budget comparison

### 6. Average Order Trend

**Section:** Spending Behavior
**Data:** Compute average order value for the selected time range. Compare to the first half of the range to determine trend direction and % change.

**Personality labels:**
- "Lifestyle Creep" — avg trending up > 10%
- "Inflation Fighter" — avg trending down > 10%
- "Steady Spender" — within ±10%

**Visualization:**
- Current average (large value)
- Trend direction arrow + % change
- Personality label as subtitle
- Mini gradient bar suggesting trend direction (green→red for increase, green→green for decrease)

### 7. Spend Distribution

**Section:** Spending Behavior
**Data:** Bucket orders by amount into ranges: ₹0-200, ₹200-500, ₹500-800, ₹800-1000, ₹1000+. Count orders per bucket.

**Personality labels:**
- "Quick Runner" — majority (>50%) in ₹0-500 range
- "Bulk Buyer" — majority in ₹800+ range
- "Mixed Basket" — no bucket dominates

**Visualization:** Histogram — 5 vertical bars, heights proportional to count. Labels show bucket ranges.

**Metrics shown:**
- Persona label
- Percentage in dominant bucket
- Histogram bars with range labels

### 8. Records & Extremes

**Section:** Spending Behavior
**Data:** Find max/min single order, max spend in a single day (sum all orders that day), max spend in a single week (Mon-Sun).

**Visualization:** 2×2 grid of mini stat boxes:
- Biggest Order — amount + date
- Smallest Order — amount + date
- Priciest Day — total + date
- Priciest Week — total + date range

**Styling:** Each box uses `Colors.bgOverlay` background, centered text, different accent color per record (amber, cyan, red, purple — using inline colors).

### 9. Order Frequency Trend

**Section:** Frequency & Streaks
**Data:** Count orders in selected range, divide by weeks elapsed. Compare to previous equivalent period for acceleration/deceleration.

**Visualization:** Single metric card with:
- Current pace (e.g., "4.2 orders/week")
- Trend indicator: "Accelerating" (red — ordering more) or "Decelerating" (green — ordering less)
- Previous pace comparison

### 10. Streaks & Gaps

**Section:** Frequency & Streaks
**Data:** Walk through orders chronologically. Track consecutive days with at least one order (streak). Track consecutive days without any order (gap).

**Personality labels:**
- Longest streak → "Marathon Orderer"
- Longest gap → "Detox Champion"

**Visualization:** Two-column layout:
- Left: streak days (large number) + label
- Right: gap days (large number) + label

### 11. Multi-Order Days

**Section:** Frequency & Streaks
**Data:** Count distinct dates with 2+ orders. Calculate as percentage of total ordering days.

**Personality labels:**
- "Forgot Something Again" — >15% multi-order days
- "One-Trip Wonder" — <5% multi-order days
- "Occasional Double" — 5-15%

**Visualization:**
- Personality label (large, colored)
- Count of multi-order days
- Percentage of total ordering days

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `constants/ranges.ts` | Shared `BarRange` type and `BAR_RANGES` constant (extracted from dashboard) |
| `lib/insights.ts` | Pure computation functions — takes `Order[]` + time range, returns all insight data |
| `types/insights.ts` | TypeScript interfaces for all insight results |
| `app/(tabs)/insights.tsx` | Insights tab screen component |
| `components/insights/` | Directory for insight card components (one per card type) |

### Computation Layer (`lib/insights.ts`)

Single exported function:

```typescript
function computeInsights(orders: Order[], range: TimeRange): InsightsData
```

This returns a flat object with all 11 computed insights. The screen component calls this inside `useMemo` keyed on `[orders, range, platformFilter]`.

Sub-functions (not exported, internal):
- `computeHourDistribution(orders)` → Ordering Persona
- `computeDayOfWeekDistribution(orders)` → Day-of-Week Pattern
- `computePlatformSplit(orders)` → Platform Loyalty
- `computeMoMChange(orders)` → Month-over-Month
- `computeProjection(orders)` → Monthly Projection
- `computeAvgTrend(orders)` → Average Order Trend
- `computeSpendDistribution(orders)` → Spend Distribution
- `computeRecords(orders)` → Records & Extremes
- `computeFrequencyTrend(orders)` → Order Frequency
- `computeStreaks(orders)` → Streaks & Gaps
- `computeMultiOrderDays(orders)` → Multi-Order Days

### Time Range Filtering

Extract the `BarRange` type and `BAR_RANGES` constant from `app/(tabs)/index.tsx` into a shared module (e.g., `constants/ranges.ts`) so both Dashboard and Insights can import them. Then filter orders before passing to `computeInsights`:

```typescript
const filtered = useMemo(() => {
  if (range.months === null) return orders; // lifetime
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - range.months);
  return orders.filter(o => o.date >= cutoff);
}, [orders, range]);
```

### Platform Filter

Reuse the same platform filter tab pattern from the dashboard. When a platform is selected, only that platform's orders are passed to `computeInsights`.

### Data Flow

```
AsyncStorage (orders_v2_*)
  → getOrdersAsObjects() / getAllOrdersAsObjects()
  → useFocusEffect loads orders into state
  → useMemo filters by time range
  → useMemo calls computeInsights(filtered)
  → Render insight cards
```

### Tab Registration

Add "Insights" as a new tab in `app/(tabs)/_layout.tsx`:
- Icon: `analytics-outline` (Ionicons)
- Label: "Insights"
- Position: 2nd tab (after Dashboard, before Sync)
- Color: `Colors.green` when active

### Empty State

When no orders are synced, show a centered message: "Sync your orders to see insights" with a button linking to the Sync tab. Same pattern as dashboard's empty state.

## SVG Charts

All visualizations use `react-native-svg` (already installed). No new chart libraries.

- **Bar charts** (hour distribution, day-of-week, histogram): `<Rect>` elements positioned with computed heights
- **Donut chart** (platform split): `<Circle>` with `strokeDasharray` for segments
- **Progress bar** (projection): `<Rect>` with gradient fill

## Edge Cases

- **Single platform user:** Hide Platform Split section entirely
- **First day of month:** Monthly Projection shows "Not enough data yet"
- **< 2 months of data:** MoM Change shows "Need 2+ months of data"
- **No orders in range:** Show "No orders in this period" per card
- **All orders same amount:** Spend Distribution shows single bucket highlighted
- **All orders same day of week:** Day-of-Week shows single dominant bar
