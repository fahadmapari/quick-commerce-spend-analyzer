import { PlatformId } from './platform';

export interface Order {
  id: string; // `${platform}:${rawDate}-${rawAmount}` used for deduplication
  amount: number; // parsed integer rupees
  date: Date;
  rawDate: string; // e.g. "16 Mar, 8:07 pm"
  rawAmount: string; // e.g. "₹1,678"
  platform: PlatformId;
}

export interface MonthlySpend {
  month: string; // e.g. "Mar 2025"
  year: number;
  monthIndex: number; // 0-11
  total: number;
  orderCount: number;
}

export interface StoredOrderData {
  orders: SerializedOrder[];
  lastSyncedAt: string; // ISO string
  version: number; // schema version, currently 1
  monthlyBudget?: number | null;
  accountIdentity?: string | null; // phone number (10 digits) or numeric user ID of the logged-in Blinkit account
}

// Orders are serialized with date as ISO string for JSON storage
export interface SerializedOrder {
  id: string;
  amount: number;
  dateIso: string;
  rawDate: string;
  rawAmount: string;
  platform: PlatformId;
}

export interface AnalyticsSummary {
  lifetimeSpend: number;
  totalOrders: number;
  monthlyBreakdown: MonthlySpend[];
  lastSyncedAt: string | null;
  mostSpentMonth: MonthlySpend | null;
  leastSpentMonth: MonthlySpend | null;
}
