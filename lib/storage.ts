import AsyncStorage from '@react-native-async-storage/async-storage';
import { deserializeOrder, makeOrderId, parseAmount, parseDate, serializeOrder } from './analytics';
import { Order, SerializedOrder, StoredOrderData } from '@/types/order';

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

export async function clearOrders(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
