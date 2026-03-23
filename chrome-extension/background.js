// Background service worker for Quick Commerce Spend Analyzer

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ORDERS_EXTRACTED') {
    handleOrdersExtracted(message.platform, message.orders, message.identity)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.type === 'AUTOMATION_STATE') {
    // Forward to popup if open
    chrome.runtime.sendMessage({
      type: 'SYNC_STATUS',
      platform: message.platform,
      phase: message.phase,
      detail: message.detail,
      count: message.count || 0,
    }).catch(() => {}); // popup may not be open
    return false;
  }

  if (message.type === 'GET_ALL_DATA') {
    getAllData().then(data => sendResponse(data)).catch(() => sendResponse(null));
    return true;
  }

  if (message.type === 'SAVE_BUDGET') {
    chrome.storage.local.set({ budget: message.budget }, () => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'CLEAR_ALL_DATA') {
    chrome.storage.local.clear(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'SAVE_GAMIFICATION') {
    chrome.storage.local.set({ gamification: message.state }, () => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'START_SYNC') {
    const platform = message.platform;
    const url = platform === 'blinkit'
      ? 'https://blinkit.com/account/orders'
      : 'https://www.zeptonow.com/account/orders';
    chrome.tabs.create({ url }, () => sendResponse({ success: true }));
    return true;
  }
});

function parseAmount(raw) {
  const cleaned = raw.replace('₹', '').replace(/,/g, '').trim();
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? 0 : value;
}

function makeOrderId(platform, rawDate, rawAmount) {
  return `${platform}:${rawDate.replace(/\s+/g, '')}-${rawAmount.replace(/\s+/g, '')}`;
}

const BLINKIT_MONTH_MAP = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDateBlinkit(raw) {
  const match = raw.match(/(\d{1,2})\s+(\w{3}),\s+(\d{1,2}):(\d{2})\s+(am|pm)/i);
  if (!match) return new Date().toISOString();
  const [, day, mon, hours, minutes, ampm] = match;
  const month = BLINKIT_MONTH_MAP[mon];
  if (month === undefined) return new Date().toISOString();
  const year = new Date().getFullYear();
  let hour = parseInt(hours, 10);
  if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
  const parsed = new Date(year, month, parseInt(day, 10), hour, parseInt(minutes, 10));
  if (parsed > new Date()) parsed.setFullYear(parsed.getFullYear() - 1);
  return parsed.toISOString();
}

function parseDateZepto(raw) {
  const match = raw.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w{3})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return new Date().toISOString();
  const [, day, mon, year, hours, minutes, ampm] = match;
  const month = BLINKIT_MONTH_MAP[mon];
  if (month === undefined) return new Date().toISOString();
  let hour = parseInt(hours, 10);
  if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
  return new Date(parseInt(year, 10), month, parseInt(day, 10), hour, parseInt(minutes, 10)).toISOString();
}

async function handleOrdersExtracted(platform, rawOrders, identity) {
  const data = await new Promise(resolve => {
    chrome.storage.local.get([`orders_${platform}`, 'gamification'], resolve);
  });

  const stored = data[`orders_${platform}`] || { orders: [], lastSyncedAt: null, version: 2 };
  const existingIds = new Set(stored.orders.map(o => o.id));
  const parseDateFn = platform === 'blinkit' ? parseDateBlinkit : parseDateZepto;

  const newOrders = [];
  for (const raw of rawOrders) {
    const amount = parseAmount(raw.rawAmount);
    if (amount === 0) continue;

    const dateIso = parseDateFn(raw.rawDate);
    const id = raw.orderId || makeOrderId(platform, raw.rawDate, raw.rawAmount);
    if (existingIds.has(id)) continue;

    newOrders.push({
      id, amount, dateIso,
      rawDate: raw.rawDate,
      rawAmount: raw.rawAmount,
      platform,
    });
    existingIds.add(id);
  }

  const merged = [...stored.orders, ...newOrders];
  const updatedData = {
    orders: merged,
    lastSyncedAt: new Date().toISOString(),
    version: 2,
    accountIdentity: identity || stored.accountIdentity || null,
  };

  // Award XP for sync
  const gamification = data.gamification || defaultGamificationState();
  const today = new Date().toISOString().slice(0, 10);

  if (!gamification.syncHistory.includes(today)) {
    gamification.syncHistory.push(today);
  }

  // First sync XP
  if (!gamification.xpEvents.some(e => e.id === 'first_sync')) {
    gamification.xpEvents.push({
      id: 'first_sync', reason: 'first_sync_success', xp: 50,
      createdAt: new Date().toISOString(),
    });
    gamification.totalXp += 50;
  }

  // Daily sync XP
  const dailySyncId = `daily_sync:${today}`;
  if (!gamification.xpEvents.some(e => e.id === dailySyncId)) {
    gamification.xpEvents.push({
      id: dailySyncId, reason: 'daily_sync_success', xp: 20,
      createdAt: new Date().toISOString(),
    });
    gamification.totalXp += 20;
  }

  // New orders XP
  if (newOrders.length > 0) {
    const newOrdersId = `new_orders:${today}:${platform}`;
    if (!gamification.xpEvents.some(e => e.id === newOrdersId)) {
      const xp = Math.min(newOrders.length * 5, 50);
      gamification.xpEvents.push({
        id: newOrdersId, reason: 'sync_with_new_orders', xp,
        createdAt: new Date().toISOString(),
      });
      gamification.totalXp += xp;
    }
  }

  await new Promise(resolve => {
    chrome.storage.local.set({
      [`orders_${platform}`]: updatedData,
      gamification,
    }, resolve);
  });

  return { added: newOrders.length, total: merged.length };
}

function defaultGamificationState() {
  return {
    version: 1,
    totalXp: 0,
    xpEvents: [],
    activeQuests: [],
    syncHistory: [],
  };
}
