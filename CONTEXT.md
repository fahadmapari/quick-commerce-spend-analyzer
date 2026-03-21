# Project Context: Blinkit Order Analyzer

## Overview

A React Native / Expo mobile app that automates login to [Blinkit](https://blinkit.com) (Indian quick-commerce platform) via a WebView, extracts order history, and provides rich spending analytics with a gamification layer (XP, levels, badges, quests).

The repo slug is `blinkit-analyser`; the workspace folder is named `quick-commerce-spend-analyzer`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81.5 + Expo SDK 54 |
| Routing | Expo Router 6 (file-based, like Next.js) |
| Language | TypeScript 5.9 (strict mode) |
| Navigation | React Navigation 7 (bottom tabs) |
| Storage | AsyncStorage (local, no backend) |
| Charts | React Native SVG (custom components) |
| Animations | React Native Reanimated 4 |
| Gestures | React Native Gesture Handler |
| WebView | React Native WebView 13 |
| Icons | @expo/vector-icons (Ionicons) |
| Sharing | Expo Sharing + React Native View Shot |
| Haptics | Expo Haptics |

**No backend. No REST API. No auth tokens.** All data is scraped from Blinkit's website inside a WebView and stored locally.

---

## Directory Structure

```
app/                        Expo Router screens
  (tabs)/
    _layout.tsx             Bottom tab navigator (Dashboard, Sync, Badges)
    index.tsx               Dashboard — analytics, charts, XP level card
    explore.tsx             Sync — WebView automation screen
    badges.tsx              Badges — achievements grid
  _layout.tsx               Root layout (ThemeProvider, dark theme)
  modal.tsx                 Generic modal screen

components/                 Reusable UI components
  stat-card.tsx             Single stat display (label + value)
  badge-card.tsx            Badge tile with progress bar and share button
  monthly-bar.tsx           Horizontal bar chart row
  monthly-line-chart.tsx    Interactive SVG line chart with touch scrubber
  badge-share-modal.tsx     Screenshot + share sheet for a badge
  parallax-scroll-view.tsx  Parallax header scroll
  themed-text.tsx           Dark-theme-aware <Text>
  themed-view.tsx           Dark-theme-aware <View>
  haptic-tab.tsx            Tab button with haptic feedback
  ui/icon-symbol.tsx        Cross-platform icon wrapper

lib/                        Business logic
  storage.ts                AsyncStorage CRUD + all key names
  analytics.ts              Parse orders, compute monthly/lifetime stats
  badges.ts                 28 badge definitions + unlock computation
  gamification.ts           XP ledger, level table, XP award helpers
  quests.ts                 Monthly quest generation + progress tracking
  injectedScript.ts         1000+ line JS injected into WebView for scraping
  sessionReset.ts           Nonce-based session reset for forced re-login

types/                      Shared TypeScript interfaces
  order.ts                  Order, SerializedOrder, StoredOrderData, MonthlySpend
  badge.ts                  BadgeDefinition, BadgeProgress, BadgeTier, BadgeCategory
  gamification.ts           GamificationState, XpEvent, XpReason, MonthlyQuest, QuestType
  automation.ts             AutomationPhase, WebViewMessage union type

src/theme/colors.ts         Dark color palette (greens, grays, red)
constants/theme.ts          Shared theme constants
hooks/                      useColorScheme, useThemeColor
assets/                     Images, icons
```

---

## Core Features

### 1. Order Syncing (WebView Automation)

`app/(tabs)/explore.tsx` + `lib/injectedScript.ts`

- Loads `https://blinkit.com` inside a React Native WebView
- Injected JavaScript drives the full login flow:
  - Detects and handles location permission prompts
  - Inputs the user's phone number
  - Waits for OTP (user types it manually)
  - Navigates to order history page
  - Extracts all order rows (date + amount)
- Messages are sent from the page to RN via `window.ReactNativeWebView.postMessage()`
- Message types: `AUTOMATION_STATE`, `ORDERS_EXTRACTED`, `AUTOMATION_ERROR`, `ACCOUNT_IDENTITY`
- Account identity (phone/user ID) is stored alongside orders for multi-account support
- Session can be force-reset via a nonce stored in AsyncStorage (`lib/sessionReset.ts`)

### 2. Analytics Dashboard

`app/(tabs)/index.tsx` + `lib/analytics.ts`

- Lifetime spend and total order count
- Monthly breakdown bar chart with range selector: 3M / 6M / 1Y / 2Y / Lifetime
- Interactive line chart with drag scrubber showing exact month/amount
- Highest and lowest spend months (last 12)
- Monthly budget: set target, track current month's spend vs. target
- Last synced timestamp
- Account identity dropdown in header with account-switch / clear-data options

### 3. Badges (Achievements)

`app/(tabs)/badges.tsx` + `lib/badges.ts` + `types/badge.ts`

28 badges across 6 categories, 4 tiers each (bronze → silver → gold → platinum):

| Category | What it tracks |
|---|---|
| Lifetime Spending | ₹1K → ₹5L cumulative |
| Order Count | 1 → 500 total orders |
| Single Biggest Order | ₹1K → ₹5K in one order |
| Monthly Spending | ₹10K → ₹50K in one month |
| Ordering Streak | 3 → 12 consecutive months with orders |
| Monthly Frequency | 10 → 20 orders in one month |

- Badges auto-unlock when thresholds are crossed; XP is awarded idempotently
- Locked badges show progress toward next tier
- Any badge can be screenshotted and shared via `BadgeShareModal`

### 4. Gamification System

`lib/gamification.ts` + `lib/quests.ts` + `types/gamification.ts`

#### XP & Levels
- 15 levels: "Cart Curious" → "Quick-Commerce Kingpin"
- Level n requires `100 + (n-1) × 50` XP to unlock
- XP is awarded for: syncing, unlocking badges, completing quests, hitting budget goals, budget streaks
- Every XP event has a unique `id` — idempotent, cannot double-award

#### Monthly Quests
- 3 quests per month (2 normal, 1 hard) generated deterministically from the month key (YYYY-MM)
- Quest types: sync N days, stay under budget, reduce vs. last month, unlock badges, limit order count
- XP rewards: 40 (normal) / 60 (hard)
- Progress computed dynamically on each render (not persisted separately)

#### Budget Streaks
- Consecutive under-budget months tracked
- Milestones (3 / 6 / 12 months) award escalating bonus XP
- Resets on any over-budget month

---

## Data Models

### Order

```typescript
interface Order {
  id: string;          // "${rawDate.trim()}-${rawAmount.trim()}" — dedup key
  amount: number;      // Parsed integer rupees
  date: Date;
  rawDate: string;     // e.g. "16 Mar, 8:07 pm"
  rawAmount: string;   // e.g. "₹1,678"
}
```

### StoredOrderData (AsyncStorage value)

```typescript
interface StoredOrderData {
  orders: SerializedOrder[];   // date serialized to ISO string
  lastSyncedAt: string;        // ISO timestamp
  version: number;             // schema version (currently 1)
  monthlyBudget?: number | null;
  accountIdentity?: string | null;
}
```

### GamificationState (AsyncStorage value)

```typescript
interface GamificationState {
  version: 1;
  totalXp: number;
  xpEvents: XpEvent[];         // immutable ledger
  activeQuests: MonthlyQuest[];
  syncHistory: string[];       // YYYY-MM-DD of successful syncs
  lastLevelUpSeen?: number;
}
```

### MonthlyQuest

```typescript
interface MonthlyQuest {
  id: string;           // "quest:YYYY-MM:<slug>"
  monthKey: string;     // "YYYY-MM"
  type: QuestType;
  title: string;
  description: string;
  difficulty: 'normal' | 'hard';
  target: number;
  progress: number;
  completed: boolean;
  completedAt?: string;
  xp: number;
}
```

---

## Storage Keys (AsyncStorage)

| Key | Contents |
|---|---|
| `blinkit_orders_v1` | `StoredOrderData` (orders + budget + account) |
| `blinkit_gamification_v1` | `GamificationState` (XP ledger + quests + sync history) |
| `blinkit_session_reset_nonce_v1` | Integer nonce to trigger WebView session reset |

---

## State Management

No Redux or MobX. Pattern used throughout:
- `useState` for local UI state
- `useFocusEffect` (Expo Router) to reload AsyncStorage data whenever a screen comes into focus
- Analytics and badge unlock status are **recomputed on every focus** (lazy, no cache)
- XP events and quests are updated via `lib/gamification.ts` helpers which write directly to AsyncStorage

---

## Theme

Dark-only UI.
Primary accent: **green `#22c55e`**
Background: `#080808`
Surface: `#111111` → `#1a1a1a`
Text: `#f0f0f0` (primary), `#a0a0a0` (muted)
Error/negative: `#ef4444`

All theme colors live in `src/theme/colors.ts`.

---

## Key Architectural Patterns

### Idempotent XP Awards
Every XP grant is keyed by a unique event ID (e.g. `badge:lifetime_1k`, `quest:2025-03:sync-days`). Before awarding, the system checks `xpEvents` for a matching ID — no double awards on re-sync or retry.

### Deterministic Quest Generation
`lib/quests.ts` seeds a shuffle from the month string `YYYY-MM` using a simple hash. The same month always produces the same 3 quests — no surprises on app restart.

### Order Deduplication
Orders are keyed by `rawDate + rawAmount` (whitespace stripped). Re-syncing merges new orders with existing ones — no duplicates, no full wipe.

### Lazy Analytics Computation
`lib/analytics.ts` runs fresh on every `useFocusEffect`. This avoids stale derived state and complex invalidation. Acceptable perf given typical order counts (<500).

### WebView ↔ RN Communication
The injected script is the only "API client". It pushes typed JSON messages via `window.ReactNativeWebView.postMessage()`. The RN side (`explore.tsx`) routes messages by `type` field and updates phase/result state accordingly.

---

## Build & Run

```bash
npm install

npm start          # Expo dev server (scan QR with Expo Go)
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Web (limited — WebView features won't work)
npm run lint       # ESLint
```

**No environment variables required.** The only external URL used is `https://blinkit.com`, hardcoded in `explore.tsx`.

---

## Expo Config Summary (`app.json`)

- `orientation: portrait`
- `userInterfaceStyle: automatic` (but app is dark-only in practice)
- `newArchEnabled: true` — React Native New Architecture enabled
- Experiments: `typedRoutes: true`, `reactCompiler: true`
- iOS bundle ID: `com.anonymous.blinkitanalyser`
- Android package: `com.anonymous.blinkitanalyser`
- Permissions: location (for Blinkit store detection)
