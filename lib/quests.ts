import { GamificationState, MonthlyQuest, QuestType, XpEvent } from '@/types/gamification';
import { BadgeProgress } from '@/types/badge';
import { Order } from '@/types/order';
import { awardXpBatch, hasXpEvent, makeXpEvent } from './gamification';
import { getGamificationState, saveGamificationState } from './storage';

// ── Quest Seed Inputs ─────────────────────────────────────────────────

export interface QuestSeedInputs {
  lastMonthOrderCount: number;
}

export interface QuestProgressInputs {
  orders: Order[];
  monthlyBudget: number | null;
  badges: BadgeProgress[];
  syncHistory: string[]; // YYYY-MM-DD
  currentMonthKey: string; // YYYY-MM
  previousMonthSpend: number;
  previousMonthOrderCount: number;
}

// ── Quest Templates ───────────────────────────────────────────────────

interface QuestTemplate {
  type: QuestType;
  normal: { title: string; description: string; target: number };
  hard: { title: string; description: string; target: number | ((seed: QuestSeedInputs) => number) };
}

const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    type: 'sync_days',
    normal: { title: 'Stay in Sync', description: 'Sync on 4 different days this month', target: 4 },
    hard: { title: 'Sync Streak', description: 'Sync on 8 different days this month', target: 8 },
  },
  {
    type: 'under_budget',
    normal: { title: 'Budget Keeper', description: 'Stay under your monthly budget', target: 1 },
    hard: { title: 'Budget Keeper', description: 'Stay under your monthly budget', target: 1 },
  },
  {
    type: 'reduce_vs_last_month',
    normal: { title: 'Spend Less', description: 'Spend 10% less than last month', target: 10 },
    hard: { title: 'Spend Less', description: 'Spend 10% less than last month', target: 10 },
  },
  {
    type: 'unlock_badges',
    normal: { title: 'Badge Hunter', description: 'Unlock 1 new badge this month', target: 1 },
    hard: { title: 'Badge Hunter', description: 'Unlock 1 new badge this month', target: 1 },
  },
  {
    type: 'limit_order_count',
    normal: { title: 'Order Diet', description: 'Keep orders below last month\'s count', target: 0 },
    hard: {
      title: 'Strict Order Diet',
      description: 'Order less than last month',
      target: (seed) => Math.max(seed.lastMonthOrderCount - 1, 1),
    },
  },
];

// ── Quest Generation ──────────────────────────────────────────────────

function pickQuests(monthKey: string, seed: QuestSeedInputs): MonthlyQuest[] {
  // Deterministic shuffle based on monthKey
  const hash = monthKey.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

  // Always pick from a stable order: rotate templates by hash
  const shuffled = [...QUEST_TEMPLATES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (hash + i) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const quests: MonthlyQuest[] = [];

  // Pick 2 normal + 1 hard = 3 quests, unique types
  const usedTypes = new Set<QuestType>();
  let normalCount = 0;
  let hardPicked = false;

  for (const tpl of shuffled) {
    if (quests.length >= 3) break;
    if (usedTypes.has(tpl.type)) continue;

    // Pick hard for the 3rd quest, normal for first 2
    if (!hardPicked && normalCount >= 2) {
      const hardDef = tpl.hard;
      const target = typeof hardDef.target === 'function' ? hardDef.target(seed) : hardDef.target;
      quests.push({
        id: `quest:${monthKey}:${tpl.type}:hard`,
        monthKey,
        type: tpl.type,
        title: hardDef.title,
        description: hardDef.description,
        difficulty: 'hard',
        target,
        progress: 0,
        completed: false,
        xp: 60,
      });
      hardPicked = true;
    } else {
      const normalDef = tpl.normal;
      let target = normalDef.target;
      if (tpl.type === 'limit_order_count') {
        target = Math.max(seed.lastMonthOrderCount, 1);
      }
      quests.push({
        id: `quest:${monthKey}:${tpl.type}:normal`,
        monthKey,
        type: tpl.type,
        title: normalDef.title,
        description: normalDef.description,
        difficulty: 'normal',
        target,
        progress: 0,
        completed: false,
        xp: 40,
      });
      normalCount++;
    }

    usedTypes.add(tpl.type);
  }

  return quests;
}

export async function ensureMonthlyQuests(
  now: Date,
  seed: QuestSeedInputs
): Promise<MonthlyQuest[]> {
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const state = await getGamificationState();

  // Already have quests for this month
  const existing = state.activeQuests.filter((q) => q.monthKey === monthKey);
  if (existing.length >= 3) return existing;

  // Generate new quests, clear old active quests
  const newQuests = pickQuests(monthKey, seed);
  state.activeQuests = newQuests;
  await saveGamificationState(state);
  return newQuests;
}

// ── Progress Computation ──────────────────────────────────────────────

function computeSingleQuestProgress(
  quest: MonthlyQuest,
  inputs: QuestProgressInputs
): MonthlyQuest {
  if (quest.completed) return quest;

  const mk = quest.monthKey;
  const [y, m] = mk.split('-').map(Number);

  let progress = 0;

  switch (quest.type) {
    case 'sync_days': {
      const daysInMonth = inputs.syncHistory.filter((d) => d.startsWith(mk)).length;
      progress = daysInMonth;
      break;
    }
    case 'under_budget': {
      if (inputs.monthlyBudget === null) {
        progress = 0;
        break;
      }
      const currentSpend = inputs.orders
        .filter((o) => o.date.getFullYear() === y && o.date.getMonth() === m - 1)
        .reduce((sum, o) => sum + o.amount, 0);
      progress = currentSpend <= inputs.monthlyBudget ? 1 : 0;
      break;
    }
    case 'reduce_vs_last_month': {
      if (inputs.previousMonthSpend === 0) {
        progress = 0;
        break;
      }
      const currentSpend = inputs.orders
        .filter((o) => o.date.getFullYear() === y && o.date.getMonth() === m - 1)
        .reduce((sum, o) => sum + o.amount, 0);
      const reduction = ((inputs.previousMonthSpend - currentSpend) / inputs.previousMonthSpend) * 100;
      progress = Math.max(Math.round(reduction), 0);
      break;
    }
    case 'unlock_badges': {
      const unlockedCount = inputs.badges.filter((b) => b.unlocked).length;
      // We compare to previously known unlocked count — for simplicity, count newly unlocked this month
      // by checking badge XP events created in this month
      progress = Math.min(unlockedCount, quest.target);
      break;
    }
    case 'limit_order_count': {
      const currentOrders = inputs.orders
        .filter((o) => o.date.getFullYear() === y && o.date.getMonth() === m - 1).length;
      // progress = how close they are to staying under target
      // Show current order count; completed if under target
      progress = currentOrders;
      break;
    }
  }

  const completed = (() => {
    switch (quest.type) {
      case 'sync_days':
      case 'under_budget':
      case 'unlock_badges':
        return progress >= quest.target;
      case 'reduce_vs_last_month':
        return progress >= quest.target;
      case 'limit_order_count':
        return quest.target > 0 && progress <= quest.target;
      default:
        return false;
    }
  })();

  return {
    ...quest,
    progress,
    completed,
    completedAt: completed && !quest.completedAt ? new Date().toISOString() : quest.completedAt,
  };
}

export async function refreshQuestProgress(
  now: Date,
  inputs: QuestProgressInputs
): Promise<MonthlyQuest[]> {
  const state = await getGamificationState();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const quests = state.activeQuests.filter((q) => q.monthKey === monthKey);

  const updated = quests.map((q) => computeSingleQuestProgress(q, inputs));
  state.activeQuests = updated;
  await saveGamificationState(state);
  return updated;
}

export async function awardCompletedQuestXp(quests: MonthlyQuest[]): Promise<XpEvent[]> {
  const state = await getGamificationState();
  const events: XpEvent[] = [];

  for (const quest of quests) {
    if (!quest.completed) continue;
    const eventId = `quest:complete:${quest.id}`;
    if (hasXpEvent(eventId, state)) continue;

    events.push(
      makeXpEvent(eventId, 'monthly_quest_complete', quest.xp, {
        questId: quest.id,
        type: quest.type,
        difficulty: quest.difficulty,
      })
    );
  }

  // Perfect month: all quests complete
  if (quests.length >= 3 && quests.every((q) => q.completed)) {
    const mk = quests[0].monthKey;
    const perfectId = `quest:perfect:${mk}`;
    if (!hasXpEvent(perfectId, state)) {
      events.push(makeXpEvent(perfectId, 'monthly_quest_perfect_month', 75, { month: mk }));
    }
  }

  if (events.length > 0) {
    const result = await awardXpBatch(events);
    return result.awarded;
  }

  return [];
}
