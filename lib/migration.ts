import AsyncStorage from '@react-native-async-storage/async-storage';
import { SerializedOrder, StoredOrderData } from '@/types/order';

const OLD_ORDERS_KEY = 'blinkit_orders_v1';
const OLD_GAMIFICATION_KEY = 'blinkit_gamification_v1';
const NEW_ORDERS_KEY = 'orders_v2_blinkit';
const NEW_GAMIFICATION_KEY = 'app_gamification_v1';

/**
 * Migrates data from v1 (blinkit-only) to v2 (multi-platform) storage keys.
 * Idempotent — skips if v2 data already exists or v1 data is absent.
 */
export async function runMigrationIfNeeded(): Promise<void> {
  try {
    // Skip if already migrated
    const v2Exists = await AsyncStorage.getItem(NEW_ORDERS_KEY);
    if (v2Exists) return;

    // Check for v1 data
    const v1Raw = await AsyncStorage.getItem(OLD_ORDERS_KEY);
    if (!v1Raw) return;

    const v1Data = JSON.parse(v1Raw) as StoredOrderData;

    // Stamp every order with platform and prefix IDs
    const migratedOrders: SerializedOrder[] = v1Data.orders.map((order) => ({
      ...order,
      id: order.id.startsWith('blinkit:') ? order.id : `blinkit:${order.id}`,
      platform: 'blinkit' as const,
    }));

    const v2Data: StoredOrderData = {
      ...v1Data,
      orders: migratedOrders,
      version: 2,
    };

    await AsyncStorage.setItem(NEW_ORDERS_KEY, JSON.stringify(v2Data));

    // Migrate gamification key
    const gamRaw = await AsyncStorage.getItem(OLD_GAMIFICATION_KEY);
    if (gamRaw) {
      await AsyncStorage.setItem(NEW_GAMIFICATION_KEY, gamRaw);
      await AsyncStorage.removeItem(OLD_GAMIFICATION_KEY);
    }

    // Migrate budget to shared key
    if (v1Data.monthlyBudget != null) {
      await AsyncStorage.setItem('app_budget_v1', String(v1Data.monthlyBudget));
    }

    // Clean up old key
    await AsyncStorage.removeItem(OLD_ORDERS_KEY);
  } catch {
    // Migration failure is non-fatal — data stays in v1 and will retry next launch
  }
}
