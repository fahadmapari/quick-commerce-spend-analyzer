import AsyncStorage from '@react-native-async-storage/async-storage';
import { deserializeOrder, makeOrderId, parseAmount, parseDate, serializeOrder } from './analytics';
import { Order, SerializedOrder, StoredOrderData } from '@/types/order';
import { GamificationState } from '@/types/gamification';

const STORAGE_KEY = 'blinkit_orders_v1';

function dedupeSerializedOrders(orders: SerializedOrder[]): SerializedOrder[] {
  const seen = new Set<string>();
  const deduped: SerializedOrder[] = [];

  for (const order of orders) {
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    deduped.push(order);
  }

  return deduped;
}

export async function loadOrders(): Promise<StoredOrderData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOrderData;
    return {
      ...parsed,
      orders: dedupeSerializedOrders(parsed.orders ?? []),
    };
  } catch {
    return null;
  }
}

export async function saveOrderData(data: StoredOrderData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function getMonthlyBudget(): Promise<number | null> {
  const stored = await loadOrders();
  return stored?.monthlyBudget ?? null;
}

export async function setMonthlyBudget(monthlyBudget: number | null): Promise<void> {
  const stored = await loadOrders();
  const data: StoredOrderData = {
    orders: stored?.orders ?? [],
    lastSyncedAt: stored?.lastSyncedAt ?? new Date().toISOString(),
    version: stored?.version ?? 1,
    monthlyBudget,
  };

  await saveOrderData(data);
}

export async function mergeOrders(
  newRaw: Array<{ rawAmount: string; rawDate: string }>
): Promise<{ added: number; total: number }> {
  const stored = await loadOrders();
  const existing: SerializedOrder[] = dedupeSerializedOrders(stored?.orders ?? []);

  const existingIds = new Set(existing.map((o) => o.id));

  const toAdd: SerializedOrder[] = [];
  for (const raw of newRaw) {
    const amount = parseAmount(raw.rawAmount);
    if (amount === 0) continue; // skip parse failures

    const date = parseDate(raw.rawDate);
    const id = makeOrderId(raw.rawDate, raw.rawAmount);
    if (existingIds.has(id)) continue;

    const order: Order = { id, amount, date, rawDate: raw.rawDate, rawAmount: raw.rawAmount };
    toAdd.push(serializeOrder(order));
    existingIds.add(id);
  }

  const merged = dedupeSerializedOrders([...existing, ...toAdd]);
  const data: StoredOrderData = {
    orders: merged,
    lastSyncedAt: new Date().toISOString(),
    version: 1,
    monthlyBudget: stored?.monthlyBudget ?? null,
    accountIdentity: stored?.accountIdentity ?? null,
  };

  await saveOrderData(data);
  return { added: toAdd.length, total: merged.length };
}

export async function getOrdersAsObjects(): Promise<{ orders: Order[]; lastSyncedAt: string | null }> {
  const stored = await loadOrders();
  if (!stored) return { orders: [], lastSyncedAt: null };
  return {
    orders: stored.orders.map(deserializeOrder),
    lastSyncedAt: stored.lastSyncedAt,
  };
}

export async function getStoredAccountIdentity(): Promise<string | null> {
  const stored = await loadOrders();
  return stored?.accountIdentity ?? null;
}

export async function saveAccountIdentity(identity: string): Promise<void> {
  const stored = await loadOrders();
  await saveOrderData({
    orders: stored?.orders ?? [],
    lastSyncedAt: stored?.lastSyncedAt ?? new Date().toISOString(),
    version: stored?.version ?? 1,
    monthlyBudget: stored?.monthlyBudget ?? null,
    accountIdentity: identity,
  });
}

// Clears orders only — preserves gamification (XP, quests, sync history).
// Use this for force-fetch so the user doesn't lose their progress.
export async function clearOrdersOnly(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// Full wipe: orders + gamification. Use when switching accounts.
export async function clearOrders(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  await AsyncStorage.removeItem(GAMIFICATION_KEY);
}

// ── Gamification Storage ──────────────────────────────────────────────

const GAMIFICATION_KEY = 'blinkit_gamification_v1';

function defaultGamificationState(): GamificationState {
  return {
    version: 1,
    totalXp: 0,
    xpEvents: [],
    activeQuests: [],
    syncHistory: [],
  };
}

export async function getGamificationState(): Promise<GamificationState> {
  try {
    const raw = await AsyncStorage.getItem(GAMIFICATION_KEY);
    if (!raw) return defaultGamificationState();
    return JSON.parse(raw) as GamificationState;
  } catch {
    return defaultGamificationState();
  }
}

export async function saveGamificationState(state: GamificationState): Promise<void> {
  await AsyncStorage.setItem(GAMIFICATION_KEY, JSON.stringify(state));
}

export async function updateGamificationState(
  updater: (state: GamificationState) => GamificationState
): Promise<GamificationState> {
  const current = await getGamificationState();
  const next = updater(current);
  await saveGamificationState(next);
  return next;
}
