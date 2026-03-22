import AsyncStorage from '@react-native-async-storage/async-storage';
import { deserializeOrder, makeOrderId, parseAmount, serializeOrder } from './analytics';
import { Order, SerializedOrder, StoredOrderData } from '@/types/order';
import { GamificationState } from '@/types/gamification';
import { PlatformId, ALL_PLATFORMS } from '@/types/platform';

// ── Per-platform order storage ──────────────────────────────────────────

function orderKey(platform: PlatformId): string {
  return `orders_v2_${platform}`;
}

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

export async function loadOrders(platform: PlatformId): Promise<StoredOrderData | null> {
  try {
    const raw = await AsyncStorage.getItem(orderKey(platform));
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

export async function loadAllOrders(): Promise<{
  orders: SerializedOrder[];
  lastSyncedAt: string | null;
}> {
  const allOrders: SerializedOrder[] = [];
  let latestSync: string | null = null;

  for (const platform of ALL_PLATFORMS) {
    const data = await loadOrders(platform);
    if (!data) continue;
    allOrders.push(...data.orders);
    if (data.lastSyncedAt && (!latestSync || data.lastSyncedAt > latestSync)) {
      latestSync = data.lastSyncedAt;
    }
  }

  return { orders: dedupeSerializedOrders(allOrders), lastSyncedAt: latestSync };
}

export async function saveOrderData(platform: PlatformId, data: StoredOrderData): Promise<void> {
  await AsyncStorage.setItem(orderKey(platform), JSON.stringify(data));
}

export async function mergeOrders(
  platform: PlatformId,
  newRaw: Array<{ rawAmount: string; rawDate: string; orderId?: string }>,
  parseDateFn: (raw: string) => Date
): Promise<{ added: number; total: number }> {
  const stored = await loadOrders(platform);
  const existing: SerializedOrder[] = dedupeSerializedOrders(stored?.orders ?? []);

  const existingIds = new Set(existing.map((o) => o.id));

  const toAdd: SerializedOrder[] = [];
  for (const raw of newRaw) {
    const amount = parseAmount(raw.rawAmount);
    if (amount === 0) continue;

    const date = parseDateFn(raw.rawDate);
    const id = raw.orderId || makeOrderId(platform, raw.rawDate, raw.rawAmount);
    if (existingIds.has(id)) continue;

    const order: Order = { id, amount, date, rawDate: raw.rawDate, rawAmount: raw.rawAmount, platform };
    toAdd.push(serializeOrder(order));
    existingIds.add(id);
  }

  const merged = dedupeSerializedOrders([...existing, ...toAdd]);
  const data: StoredOrderData = {
    orders: merged,
    lastSyncedAt: new Date().toISOString(),
    version: 2,
    accountIdentity: stored?.accountIdentity ?? null,
  };

  await saveOrderData(platform, data);
  return { added: toAdd.length, total: merged.length };
}

export async function getOrdersAsObjects(platform: PlatformId): Promise<{ orders: Order[]; lastSyncedAt: string | null }> {
  const stored = await loadOrders(platform);
  if (!stored) return { orders: [], lastSyncedAt: null };
  return {
    orders: stored.orders.map(deserializeOrder),
    lastSyncedAt: stored.lastSyncedAt,
  };
}

export async function getAllOrdersAsObjects(): Promise<{ orders: Order[]; lastSyncedAt: string | null }> {
  const { orders, lastSyncedAt } = await loadAllOrders();
  return {
    orders: orders.map(deserializeOrder),
    lastSyncedAt,
  };
}

// ── Per-platform account identity ───────────────────────────────────────

export async function getStoredAccountIdentity(platform: PlatformId): Promise<string | null> {
  const stored = await loadOrders(platform);
  return stored?.accountIdentity ?? null;
}

export async function saveAccountIdentity(platform: PlatformId, identity: string): Promise<void> {
  const stored = await loadOrders(platform);
  await saveOrderData(platform, {
    orders: stored?.orders ?? [],
    lastSyncedAt: stored?.lastSyncedAt ?? new Date().toISOString(),
    version: stored?.version ?? 2,
    accountIdentity: identity,
  });
}

// ── Clear data ──────────────────────────────────────────────────────────

export async function clearOrdersOnly(platform: PlatformId): Promise<void> {
  await AsyncStorage.removeItem(orderKey(platform));
}

export async function clearAllOrders(): Promise<void> {
  for (const platform of ALL_PLATFORMS) {
    await AsyncStorage.removeItem(orderKey(platform));
  }
  await AsyncStorage.removeItem(GAMIFICATION_KEY);
  await AsyncStorage.removeItem(NOTIFICATION_SETTINGS_KEY);
  await AsyncStorage.removeItem(NOTIFICATION_PROMPT_SHOWN_KEY);
}

// ── Budget (shared across platforms) ────────────────────────────────────

const BUDGET_KEY = 'app_budget_v1';

export async function getMonthlyBudget(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(BUDGET_KEY);
    if (!raw) return null;
    const value = parseInt(raw, 10);
    return isNaN(value) ? null : value;
  } catch {
    return null;
  }
}

export async function setMonthlyBudget(monthlyBudget: number | null): Promise<void> {
  if (monthlyBudget == null) {
    await AsyncStorage.removeItem(BUDGET_KEY);
  } else {
    await AsyncStorage.setItem(BUDGET_KEY, String(monthlyBudget));
  }
}

// ── Gamification Storage ────────────────────────────────────────────────

const GAMIFICATION_KEY = 'app_gamification_v1';

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

// ── Notification Settings ───────────────────────────────────────────────

const NOTIFICATION_SETTINGS_KEY = 'notification_settings_v1';
const NOTIFICATION_PROMPT_SHOWN_KEY = 'notification_prompt_shown_v1';

export interface NotificationSettings {
  enabled: boolean;
  hour: number;   // 0-23, default 21
  minute: number; // 0-59, default 0
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  hour: 21,
  minute: 0,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return JSON.parse(raw) as NotificationSettings;
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function setNotificationSettings(settings: NotificationSettings): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
}

export async function getNotificationPromptShown(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PROMPT_SHOWN_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function setNotificationPromptShown(shown: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_PROMPT_SHOWN_KEY, String(shown));
}
