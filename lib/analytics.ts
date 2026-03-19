import { AnalyticsSummary, MonthlySpend, Order, SerializedOrder } from '@/types/order';

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseAmount(raw: string): number {
  const cleaned = raw.replace('₹', '').replace(/,/g, '').trim();
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? 0 : value;
}

export function parseDate(raw: string): Date {
  // Pattern: "DD Mon, H:MM am/pm" e.g. "16 Mar, 8:07 pm"
  const match = raw.match(/(\d{1,2})\s+(\w{3}),\s+(\d{1,2}):(\d{2})\s+(am|pm)/i);
  if (!match) return new Date();

  const [, day, mon, hours, minutes, ampm] = match;
  const month = MONTH_MAP[mon];
  if (month === undefined) return new Date();

  const year = new Date().getFullYear();
  let hour = parseInt(hours, 10);
  if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;

  const parsed = new Date(year, month, parseInt(day, 10), hour, parseInt(minutes, 10));

  // If the parsed date is in the future (e.g. December orders viewed in January), subtract 1 year
  if (parsed > new Date()) {
    parsed.setFullYear(parsed.getFullYear() - 1);
  }

  return parsed;
}

export function makeOrderId(rawDate: string, rawAmount: string): string {
  return `${rawDate.replace(/\s+/g, '')}-${rawAmount.replace(/\s+/g, '')}`;
}

export function deserializeOrder(s: SerializedOrder): Order {
  return {
    id: s.id,
    amount: s.amount,
    date: new Date(s.dateIso),
    rawDate: s.rawDate,
    rawAmount: s.rawAmount,
  };
}

export function serializeOrder(o: Order): SerializedOrder {
  return {
    id: o.id,
    amount: o.amount,
    dateIso: o.date.toISOString(),
    rawDate: o.rawDate,
    rawAmount: o.rawAmount,
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
