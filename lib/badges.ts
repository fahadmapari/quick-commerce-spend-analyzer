import { Order } from '@/types/order';
import { BadgeCategory, BadgeDefinition, BadgeProgress, BadgeTier, BADGE_TIER_XP } from '@/types/badge';
import { GamificationState } from '@/types/gamification';

function t(tier: BadgeTier): { tier: BadgeTier; xp: number } {
  return { tier, xp: BADGE_TIER_XP[tier] };
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Category 1: Lifetime Spending
  { id: 'spend_1k',   title: 'First Bite',       description: 'Spent your first ₹1,000 on quick commerce',           icon: 'cart-outline',             category: 'spending', threshold: 1000,   ...t('bronze') },
  { id: 'spend_5k',   title: 'Cart Warmer',       description: 'Crossed ₹5,000 in total spending',             icon: 'flame-outline',            category: 'spending', threshold: 5000,   ...t('bronze') },
  { id: 'spend_10k',  title: 'Pantry Stacker',    description: '₹10,000 and counting',                         icon: 'cube-outline',             category: 'spending', threshold: 10000,  ...t('silver') },
  { id: 'spend_25k',  title: 'Grocery Guru',      description: 'A quarter lakh, all groceries',                 icon: 'school-outline',           category: 'spending', threshold: 25000,  ...t('silver') },
  { id: 'spend_50k',  title: 'Half-Lakh Hero',    description: '₹50,000 fueling your kitchen',                  icon: 'shield-checkmark-outline', category: 'spending', threshold: 50000,  ...t('gold') },
  { id: 'spend_1l',   title: 'Lakhpati',          description: 'Welcome to the ₹1 Lakh club',                   icon: 'diamond-outline',          category: 'spending', threshold: 100000, ...t('gold') },
  { id: 'spend_2_5l', title: 'Quarter Million',   description: '₹2.5L spent, zero regrets',                     icon: 'trophy-outline',           category: 'spending', threshold: 250000, ...t('platinum') },
  { id: 'spend_5l',   title: 'QC Whale',     description: 'Half a million on groceries. Respect.',          icon: 'fish-outline',             category: 'spending', threshold: 500000, ...t('platinum') },

  // Category 2: Order Count
  { id: 'orders_1',   title: 'The First Drop',    description: 'Placed your very first order',                   icon: 'water-outline',       category: 'orders', threshold: 1,   ...t('bronze') },
  { id: 'orders_10',  title: 'Double Digits',     description: '10 orders deep',                                 icon: 'layers-outline',      category: 'orders', threshold: 10,  ...t('bronze') },
  { id: 'orders_50',  title: 'Frequent Shopper',  description: '50 orders! You blink, it\'s delivered',           icon: 'flash-outline',       category: 'orders', threshold: 50,  ...t('silver') },
  { id: 'orders_100', title: 'Century Club',      description: '100 orders. That\'s commitment.',                 icon: 'ribbon-outline',      category: 'orders', threshold: 100, ...t('gold') },
  { id: 'orders_250', title: 'Unstoppable',       description: '250 orders and still going',                     icon: 'rocket-outline',      category: 'orders', threshold: 250, ...t('platinum') },
  { id: 'orders_500', title: 'Legend',             description: '500 orders. Bow down.',                          icon: 'star-outline',        category: 'orders', threshold: 500, ...t('platinum') },

  // Category 3: Biggest Single Order
  { id: 'single_1k',   title: 'Big Basket Energy', description: 'A single order over ₹1,000',                    icon: 'basket-outline',      category: 'single_order', threshold: 1000, ...t('bronze') },
  { id: 'single_2_5k', title: 'Cart Overflow',     description: '₹2,500 in one shot',                            icon: 'bag-handle-outline',  category: 'single_order', threshold: 2500, ...t('silver') },
  { id: 'single_5k',   title: 'Mega Haul',         description: '₹5,000 single order. Party shopping?',           icon: 'airplane-outline',    category: 'single_order', threshold: 5000, ...t('gold') },

  // Category 4: Monthly Spending
  { id: 'month_10k',  title: 'Monthly Muncher',   description: '₹10K gone in a single month',                    icon: 'restaurant-outline',  category: 'monthly_spend', threshold: 10000, ...t('bronze') },
  { id: 'month_25k',  title: 'Monthly Mogul',     description: '₹25K in one month, big spender',                 icon: 'briefcase-outline',   category: 'monthly_spend', threshold: 25000, ...t('silver') },
  { id: 'month_50k',  title: 'Month of Madness',  description: '₹50K vanished in 30 days',                       icon: 'skull-outline',       category: 'monthly_spend', threshold: 50000, ...t('gold') },

  // Category 5: Streak
  { id: 'streak_3',   title: 'Three-Peat',        description: 'Ordered 3 months in a row',                      icon: 'repeat-outline',      category: 'streak', threshold: 3,  ...t('bronze') },
  { id: 'streak_6',   title: 'Creature of Habit', description: '6 consecutive months. It\'s a lifestyle.',        icon: 'calendar-outline',    category: 'streak', threshold: 6,  ...t('silver') },
  { id: 'streak_12',  title: 'Year-Round Shopper', description: 'Every single month for a year',                  icon: 'earth-outline',       category: 'streak', threshold: 12, ...t('gold') },

  // Category 6: Monthly Frequency
  { id: 'freq_10',    title: 'Power User',        description: '10 orders in a single month',                     icon: 'speedometer-outline', category: 'frequency', threshold: 10, ...t('silver') },
  { id: 'freq_20',    title: 'QC Addict',    description: '20 orders in one month. Seek help.',              icon: 'pulse-outline',       category: 'frequency', threshold: 20, ...t('gold') },
];

function computeMetrics(orders: Order[]) {
  const lifetimeSpend = orders.reduce((sum, o) => sum + o.amount, 0);
  const totalOrders = orders.length;
  const maxSingleOrder = orders.length > 0 ? Math.max(...orders.map(o => o.amount)) : 0;

  // Group by month
  const byMonth = new Map<string, { total: number; count: number }>();
  for (const order of orders) {
    const key = `${order.date.getFullYear()}-${String(order.date.getMonth()).padStart(2, '0')}`;
    const entry = byMonth.get(key) ?? { total: 0, count: 0 };
    entry.total += order.amount;
    entry.count += 1;
    byMonth.set(key, entry);
  }

  let maxMonthlySpend = 0;
  let maxMonthlyFrequency = 0;
  for (const { total, count } of byMonth.values()) {
    if (total > maxMonthlySpend) maxMonthlySpend = total;
    if (count > maxMonthlyFrequency) maxMonthlyFrequency = count;
  }

  // Compute max consecutive month streak
  const monthKeys = Array.from(byMonth.keys()).sort();
  let maxStreak = 0;
  let currentStreak = 0;
  for (let i = 0; i < monthKeys.length; i++) {
    if (i === 0) {
      currentStreak = 1;
    } else {
      const [prevY, prevM] = monthKeys[i - 1].split('-').map(Number);
      const [curY, curM] = monthKeys[i].split('-').map(Number);
      const prevTotal = prevY * 12 + prevM;
      const curTotal = curY * 12 + curM;
      currentStreak = curTotal - prevTotal === 1 ? currentStreak + 1 : 1;
    }
    if (currentStreak > maxStreak) maxStreak = currentStreak;
  }

  return { lifetimeSpend, totalOrders, maxSingleOrder, maxMonthlySpend, maxMonthlyFrequency, maxStreak };
}

const CATEGORY_METRIC: Record<BadgeCategory, keyof ReturnType<typeof computeMetrics>> = {
  spending: 'lifetimeSpend',
  orders: 'totalOrders',
  single_order: 'maxSingleOrder',
  monthly_spend: 'maxMonthlySpend',
  streak: 'maxStreak',
  frequency: 'maxMonthlyFrequency',
};

export function computeBadges(orders: Order[]): BadgeProgress[] {
  const metrics = computeMetrics(orders);

  return BADGE_DEFINITIONS.map((badge) => {
    const current = metrics[CATEGORY_METRIC[badge.category]];
    return {
      badge,
      unlocked: current >= badge.threshold,
      current,
    };
  });
}

export function getNewlyUnlockedBadges(
  badges: BadgeProgress[],
  gamification: GamificationState
): BadgeProgress[] {
  const awardedIds = new Set(
    gamification.xpEvents
      .filter((e) => e.reason === 'badge_unlock')
      .map((e) => e.id)
  );

  return badges.filter(
    (b) => b.unlocked && !awardedIds.has(`badge:unlock:${b.badge.id}`)
  );
}
