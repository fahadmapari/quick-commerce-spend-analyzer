export interface Order {
  id: string; // `${rawDate}-${rawAmount}` used for deduplication
  amount: number; // parsed integer rupees
  date: Date;
  rawDate: string; // e.g. "16 Mar, 8:07 pm"
  rawAmount: string; // e.g. "₹1,678"
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
}

// Orders are serialized with date as ISO string for JSON storage
export interface SerializedOrder {
  id: string;
  amount: number;
  dateIso: string;
  rawDate: string;
  rawAmount: string;
}

export interface AnalyticsSummary {
  lifetimeSpend: number;
  totalOrders: number;
  monthlyBreakdown: MonthlySpend[];
  lastSyncedAt: string | null;
}
