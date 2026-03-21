import { AnalyticsSummary, MonthlySpend, Order, SerializedOrder } from '@/types/order';
import { PlatformId } from '@/types/platform';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseAmount(raw: string): number {
  const cleaned = raw.replace('₹', '').replace(/,/g, '').trim();
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? 0 : value;
}

export function makeOrderId(platform: PlatformId, rawDate: string, rawAmount: string): string {
  return `${platform}:${rawDate.replace(/\s+/g, '')}-${rawAmount.replace(/\s+/g, '')}`;
}

export function deserializeOrder(s: SerializedOrder): Order {
  return {
    id: s.id,
    amount: s.amount,
    date: new Date(s.dateIso),
    rawDate: s.rawDate,
    rawAmount: s.rawAmount,
    platform: s.platform,
  };
}

export function serializeOrder(o: Order): SerializedOrder {
  return {
    id: o.id,
    amount: o.amount,
    dateIso: o.date.toISOString(),
    rawDate: o.rawDate,
    rawAmount: o.rawAmount,
    platform: o.platform,
  };
}

export function computeAnalytics(orders: Order[], lastSyncedAt: string | null): AnalyticsSummary {
  const lifetimeSpend = orders.reduce((sum, o) => sum + o.amount, 0);

  const byMonth = new Map<string, MonthlySpend>();
  for (const order of orders) {
    const key = `${order.date.getFullYear()}-${order.date.getMonth()}`;
    if (!byMonth.has(key)) {
      const mi = order.date.getMonth();
      byMonth.set(key, {
        month: `${MONTH_NAMES[mi]} ${order.date.getFullYear()}`,
        year: order.date.getFullYear(),
        monthIndex: mi,
        total: 0,
        orderCount: 0,
      });
    }
    const entry = byMonth.get(key)!;
    entry.total += order.amount;
    entry.orderCount += 1;
  }

  const monthlyBreakdown = Array.from(byMonth.values()).sort(
    (a, b) => b.year - a.year || b.monthIndex - a.monthIndex
  );

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const last12 = monthlyBreakdown.filter(
    (m) => new Date(m.year, m.monthIndex, 1) >= cutoff
  );

  let mostSpentMonth: MonthlySpend | null = null;
  let leastSpentMonth: MonthlySpend | null = null;
  if (last12.length > 0) {
    mostSpentMonth = last12.reduce((a, b) => (b.total > a.total ? b : a));
    leastSpentMonth = last12.reduce((a, b) => (b.total < a.total ? b : a));
  }

  return { lifetimeSpend, totalOrders: orders.length, monthlyBreakdown, lastSyncedAt, mostSpentMonth, leastSpentMonth };
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatSyncDate(isoString: string): string {
  const d = new Date(isoString);
  const day = d.getDate().toString().padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const h = hours % 12 || 12;
  return `${day} ${month}, ${h}:${minutes} ${ampm}`;
}
