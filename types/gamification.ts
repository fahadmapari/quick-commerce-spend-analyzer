export type XpReason =
  | 'first_sync_success'
  | 'daily_sync_success'
  | 'sync_with_new_orders'
  | 'set_first_budget'
  | 'badge_unlock'
  | 'monthly_quest_complete'
  | 'monthly_quest_perfect_month'
  | 'month_under_budget'
  | 'month_under_90_budget'
  | 'month_spend_lower_than_previous'
  | 'budget_streak';

export interface XpEvent {
  id: string;
  reason: XpReason;
  xp: number;
  createdAt: string; // ISO string
  metadata?: Record<string, string | number | boolean>;
}

export type QuestDifficulty = 'normal' | 'hard';
export type QuestType =
  | 'sync_days'
  | 'under_budget'
  | 'reduce_vs_last_month'
  | 'unlock_badges'
  | 'limit_order_count';

export interface MonthlyQuest {
  id: string; // quest:YYYY-MM:<slug>
  monthKey: string; // YYYY-MM
  type: QuestType;
  title: string;
  description: string;
  difficulty: QuestDifficulty;
  target: number;
  progress: number;
  completed: boolean;
  completedAt?: string;
  xp: number;
}

export interface GamificationState {
  version: 1;
  totalXp: number;
  xpEvents: XpEvent[];
  activeQuests: MonthlyQuest[];
  syncHistory: string[]; // YYYY-MM-DD successful sync dates
  lastLevelUpSeen?: number;
}
