import { GamificationState, XpEvent, XpReason } from '@/types/gamification';
import { Order } from '@/types/order';
import { getGamificationState, saveGamificationState } from './storage';

// ── Level Names & Math ────────────────────────────────────────────────

const LEVEL_NAMES: string[] = [
  'Cart Curious',          // 1
  'Snack Scout',           // 2
  'Basket Bandit',         // 3
  'Pantry Pilgrim',        // 4
  'Checkout Champion',     // 5
  'Delivery Devotee',      // 6
  'Aisle Assassin',        // 7
  'Grocery Gladiator',     // 8
  'Cart Connoisseur',      // 9
  'Blinkit Beast',         // 10
  'Stockpile Specialist',  // 11
  'Pantry Prince',         // 12
  'Speed Order Sage',      // 13
  'Household Overlord',    // 14
  'Quick-Commerce Kingpin',// 15
];

export function getLevelName(level: number): string {
  if (level < 1) return LEVEL_NAMES[0];
  if (level > LEVEL_NAMES.length) return LEVEL_NAMES[LEVEL_NAMES.length - 1];
  return LEVEL_NAMES[level - 1];
}

export function getLevelFromXp(totalXp: number): number {
  let level = 1;
  let threshold = 0;
  while (true) {
    const needed = 100 + (level - 1) * 50;
    if (totalXp < threshold + needed) return level;
    threshold += needed;
    level++;
  }
}

export function getCurrentLevelFloorXp(totalXp: number): number {
  let level = 1;
  let threshold = 0;
  while (true) {
    const needed = 100 + (level - 1) * 50;
    if (totalXp < threshold + needed) return threshold;
    threshold += needed;
    level++;
  }
}

export function getNextLevelXp(totalXp: number): number {
  const level = getLevelFromXp(totalXp);
  return getCurrentLevelFloorXp(totalXp) + 100 + (level - 1) * 50;
}

export function getLevelProgress(totalXp: number): {
  level: number;
  name: string;
  current: number;
  needed: number;
  ratio: number;
} {
  const level = getLevelFromXp(totalXp);
  const floor = getCurrentLevelFloorXp(totalXp);
  const needed = 100 + (level - 1) * 50;
  const current = totalXp - floor;
  return { level, name: getLevelName(level), current, needed, ratio: needed > 0 ? current / needed : 0 };
}

// ── XP Reason Labels ──────────────────────────────────────────────────

export function xpReasonLabel(reason: string): string {
  switch (reason) {
    case 'first_sync_success': return 'First Sync';
    case 'daily_sync_success': return 'Daily Sync';
    case 'sync_with_new_orders': return 'New Orders';
    case 'set_first_budget': return 'Budget Set';
    case 'badge_unlock': return 'Badge';
    case 'monthly_quest_complete': return 'Quest';
    case 'monthly_quest_perfect_month': return 'Perfect Month';
    case 'month_under_budget': return 'Under Budget';
    case 'month_under_90_budget': return 'Budget Bonus';
    case 'month_spend_lower_than_previous': return 'Spent Less';
    case 'budget_streak': return 'Budget Streak';
    default: return 'XP';
  }
}

// ── Idempotent XP Ledger ──────────────────────────────────────────────

export function hasXpEvent(eventId: string, state: GamificationState): boolean {
  return state.xpEvents.some((e) => e.id === eventId);
}

export async function awardXp(
  event: XpEvent
): Promise<{ awarded: boolean; state: GamificationState }> {
  const state = await getGamificationState();
  if (hasXpEvent(event.id, state)) {
    return { awarded: false, state };
  }

  state.xpEvents.push(event);
  state.totalXp += event.xp;
  await saveGamificationState(state);
  return { awarded: true, state };
}

export async function awardXpBatch(
  events: XpEvent[]
): Promise<{ awarded: XpEvent[]; state: GamificationState }> {
  const state = await getGamificationState();
  const awarded: XpEvent[] = [];

  for (const event of events) {
    if (hasXpEvent(event.id, state)) continue;
    state.xpEvents.push(event);
    state.totalXp += event.xp;
    awarded.push(event);
  }

  if (awarded.length > 0) {
    await saveGamificationState(state);
  }
  return { awarded, state };
}

export function makeXpEvent(
  id: string,
  reason: XpReason,
  xp: number,
  metadata?: Record<string, string | number | boolean>
): XpEvent {
  return { id, reason, xp, createdAt: new Date().toISOString(), metadata };
}

export async function recordSuccessfulSync(dateKey: string): Promise<void> {
  const state = await getGamificationState();
  if (!state.syncHistory.includes(dateKey)) {
    state.syncHistory.push(dateKey);
    await saveGamificationState(state);
  }
}

export async function getRecentXpEvents(limit = 10): Promise<XpEvent[]> {
  const state = await getGamificationState();
  return state.xpEvents.slice(-limit).reverse();
}

// ── Month-End Evaluation ──────────────────────────────────────────────

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthSpend(orders: Order[], monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  return orders
    .filter((o) => o.date.getFullYear() === y && o.date.getMonth() === m - 1)
    .reduce((sum, o) => sum + o.amount, 0);
}

function getOrderedMonthKeys(orders: Order[]): string[] {
  const keys = new Set<string>();
  for (const o of orders) {
    keys.add(getMonthKey(o.date));
  }
  return Array.from(keys).sort();
}

export async function evaluateClosedMonths(
  now: Date,
  orders: Order[],
  monthlyBudget: number | null
): Promise<XpEvent[]> {
  const state = await getGamificationState();
  const currentMonthKey = getMonthKey(now);
  const allMonthKeys = getOrderedMonthKeys(orders);
  const closedMonths = allMonthKeys.filter((k) => k < currentMonthKey);
  const events: XpEvent[] = [];

  // Track consecutive under-budget months for streak
  let consecutiveUnderBudget = 0;
  let lastStreakMonth = '';

  for (const mk of closedMonths) {
    const spend = getMonthSpend(orders, mk);

    // Under budget
    if (monthlyBudget !== null && spend <= monthlyBudget && spend > 0) {
      const eventId = `month:under_budget:${mk}`;
      if (!hasXpEvent(eventId, state) && !events.some((e) => e.id === eventId)) {
        events.push(makeXpEvent(eventId, 'month_under_budget', 60, { month: mk, spend, budget: monthlyBudget }));
      }

      // Under 90% of budget bonus
      if (spend <= monthlyBudget * 0.9) {
        const bonusId = `month:under_90_budget:${mk}`;
        if (!hasXpEvent(bonusId, state) && !events.some((e) => e.id === bonusId)) {
          events.push(makeXpEvent(bonusId, 'month_under_90_budget', 30, { month: mk, spend, budget: monthlyBudget }));
        }
      }

      consecutiveUnderBudget++;
      lastStreakMonth = mk;
    } else {
      consecutiveUnderBudget = 0;
    }

    // Budget streak milestones
    for (const [milestone, xp] of [[3, 50], [6, 100], [12, 200]] as const) {
      if (consecutiveUnderBudget >= milestone) {
        const streakId = `streak:budget:${milestone}:${lastStreakMonth}`;
        if (!hasXpEvent(streakId, state) && !events.some((e) => e.id === streakId)) {
          events.push(makeXpEvent(streakId, 'budget_streak', xp, { months: milestone }));
        }
      }
    }

    // Spend less than previous month
    const mkIdx = closedMonths.indexOf(mk);
    if (mkIdx > 0) {
      const prevMk = closedMonths[mkIdx - 1];
      const prevSpend = getMonthSpend(orders, prevMk);
      if (spend > 0 && prevSpend > 0 && spend < prevSpend) {
        const lowerId = `month:lower_than_previous:${mk}`;
        if (!hasXpEvent(lowerId, state) && !events.some((e) => e.id === lowerId)) {
          events.push(makeXpEvent(lowerId, 'month_spend_lower_than_previous', 40, { month: mk, spend, prevSpend }));
        }
      }
    }
  }

  // Award all at once
  if (events.length > 0) {
    for (const event of events) {
      if (!hasXpEvent(event.id, state)) {
        state.xpEvents.push(event);
        state.totalXp += event.xp;
      }
    }
    await saveGamificationState(state);
  }

  return events;
}
