export type BadgeCategory = 'spending' | 'orders' | 'single_order' | 'monthly_spend' | 'streak' | 'frequency';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export const BADGE_TIER_XP: Record<BadgeTier, number> = {
  bronze: 20,
  silver: 35,
  gold: 50,
  platinum: 75,
};

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  icon: string; // Ionicons name
  category: BadgeCategory;
  threshold: number;
  tier: BadgeTier;
  xp: number;
}

export interface BadgeProgress {
  badge: BadgeDefinition;
  unlocked: boolean;
  current: number; // current value towards threshold
}

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  spending: 'Lifetime Spending',
  orders: 'Order Count',
  single_order: 'Biggest Single Order',
  monthly_spend: 'Monthly Spending',
  streak: 'Ordering Streak',
  frequency: 'Monthly Frequency',
};
