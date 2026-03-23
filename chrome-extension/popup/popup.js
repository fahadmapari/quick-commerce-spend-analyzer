// === Constants ===
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BADGE_TIER_XP = { bronze: 20, silver: 35, gold: 50, platinum: 75 };

const BADGE_ICONS = {
  spending: '\u{1F6D2}', orders: '\u{1F4E6}', single_order: '\u{1F6CD}',
  monthly_spend: '\u{1F4B8}', streak: '\u{1F525}', frequency: '\u{26A1}',
};

const CATEGORY_LABELS = {
  spending: 'Lifetime Spending', orders: 'Order Count', single_order: 'Biggest Single Order',
  monthly_spend: 'Monthly Spending', streak: 'Ordering Streak', frequency: 'Monthly Frequency',
};

const BADGE_DEFINITIONS = [
  { id: 'spend_1k', title: 'First Bite', description: 'Spent your first \u20b91,000', category: 'spending', threshold: 1000, tier: 'bronze' },
  { id: 'spend_5k', title: 'Cart Warmer', description: 'Crossed \u20b95,000 in total spending', category: 'spending', threshold: 5000, tier: 'bronze' },
  { id: 'spend_10k', title: 'Pantry Stacker', description: '\u20b910,000 and counting', category: 'spending', threshold: 10000, tier: 'silver' },
  { id: 'spend_25k', title: 'Grocery Guru', description: 'A quarter lakh, all groceries', category: 'spending', threshold: 25000, tier: 'silver' },
  { id: 'spend_50k', title: 'Half-Lakh Hero', description: '\u20b950,000 fueling your kitchen', category: 'spending', threshold: 50000, tier: 'gold' },
  { id: 'spend_1l', title: 'Lakhpati', description: 'Welcome to the \u20b91 Lakh club', category: 'spending', threshold: 100000, tier: 'gold' },
  { id: 'spend_2_5l', title: 'Quarter Million', description: '\u20b92.5L spent, zero regrets', category: 'spending', threshold: 250000, tier: 'platinum' },
  { id: 'spend_5l', title: 'QC Whale', description: 'Half a million on groceries', category: 'spending', threshold: 500000, tier: 'platinum' },
  { id: 'orders_1', title: 'The First Drop', description: 'Placed your very first order', category: 'orders', threshold: 1, tier: 'bronze' },
  { id: 'orders_10', title: 'Double Digits', description: '10 orders deep', category: 'orders', threshold: 10, tier: 'bronze' },
  { id: 'orders_50', title: 'Frequent Shopper', description: '50 orders!', category: 'orders', threshold: 50, tier: 'silver' },
  { id: 'orders_100', title: 'Century Club', description: '100 orders. That\'s commitment.', category: 'orders', threshold: 100, tier: 'gold' },
  { id: 'orders_250', title: 'Unstoppable', description: '250 orders and still going', category: 'orders', threshold: 250, tier: 'platinum' },
  { id: 'orders_500', title: 'Legend', description: '500 orders. Bow down.', category: 'orders', threshold: 500, tier: 'platinum' },
  { id: 'single_1k', title: 'Big Basket Energy', description: 'A single order over \u20b91,000', category: 'single_order', threshold: 1000, tier: 'bronze' },
  { id: 'single_2_5k', title: 'Cart Overflow', description: '\u20b92,500 in one shot', category: 'single_order', threshold: 2500, tier: 'silver' },
  { id: 'single_5k', title: 'Mega Haul', description: '\u20b95,000 single order', category: 'single_order', threshold: 5000, tier: 'gold' },
  { id: 'month_10k', title: 'Monthly Muncher', description: '\u20b910K gone in a single month', category: 'monthly_spend', threshold: 10000, tier: 'bronze' },
  { id: 'month_25k', title: 'Monthly Mogul', description: '\u20b925K in one month', category: 'monthly_spend', threshold: 25000, tier: 'silver' },
  { id: 'month_50k', title: 'Month of Madness', description: '\u20b950K vanished in 30 days', category: 'monthly_spend', threshold: 50000, tier: 'gold' },
  { id: 'streak_3', title: 'Three-Peat', description: 'Ordered 3 months in a row', category: 'streak', threshold: 3, tier: 'bronze' },
  { id: 'streak_6', title: 'Creature of Habit', description: '6 consecutive months', category: 'streak', threshold: 6, tier: 'silver' },
  { id: 'streak_12', title: 'Year-Round Shopper', description: 'Every month for a year', category: 'streak', threshold: 12, tier: 'gold' },
  { id: 'freq_10', title: 'Power User', description: '10 orders in a single month', category: 'frequency', threshold: 10, tier: 'silver' },
  { id: 'freq_20', title: 'QC Addict', description: '20 orders in one month', category: 'frequency', threshold: 20, tier: 'gold' },
];

const LEVEL_NAMES = [
  'Cart Curious', 'Snack Scout', 'Basket Bandit', 'Pantry Pilgrim', 'Checkout Champion',
  'Delivery Devotee', 'Aisle Assassin', 'Grocery Gladiator', 'Cart Connoisseur', 'Quick-Commerce Beast',
  'Stockpile Specialist', 'Pantry Prince', 'Speed Order Sage', 'Household Overlord', 'Quick-Commerce Kingpin',
];

// === Helpers ===
function formatCurrency(amount) {
  return '\u20b9' + amount.toLocaleString('en-IN');
}

function getLevelFromXp(totalXp) {
  let level = 1, threshold = 0;
  while (true) {
    const needed = 100 + (level - 1) * 50;
    if (totalXp < threshold + needed) return level;
    threshold += needed;
    level++;
  }
}

function getCurrentLevelFloorXp(totalXp) {
  let level = 1, threshold = 0;
  while (true) {
    const needed = 100 + (level - 1) * 50;
    if (totalXp < threshold + needed) return threshold;
    threshold += needed;
    level++;
  }
}

function getLevelProgress(totalXp) {
  const level = getLevelFromXp(totalXp);
  const floor = getCurrentLevelFloorXp(totalXp);
  const needed = 100 + (level - 1) * 50;
  const current = totalXp - floor;
  const name = level <= LEVEL_NAMES.length ? LEVEL_NAMES[level - 1] : LEVEL_NAMES[LEVEL_NAMES.length - 1];
  return { level, name, current, needed, ratio: needed > 0 ? current / needed : 0 };
}

function computeMetrics(orders) {
  const lifetimeSpend = orders.reduce((sum, o) => sum + o.amount, 0);
  const totalOrders = orders.length;
  const maxSingleOrder = orders.length > 0 ? Math.max(...orders.map(o => o.amount)) : 0;

  const byMonth = new Map();
  for (const order of orders) {
    const d = new Date(order.dateIso);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const entry = byMonth.get(key) || { total: 0, count: 0 };
    entry.total += order.amount;
    entry.count += 1;
    byMonth.set(key, entry);
  }

  let maxMonthlySpend = 0, maxMonthlyFrequency = 0;
  for (const { total, count } of byMonth.values()) {
    if (total > maxMonthlySpend) maxMonthlySpend = total;
    if (count > maxMonthlyFrequency) maxMonthlyFrequency = count;
  }

  const monthKeys = Array.from(byMonth.keys()).sort();
  let maxStreak = 0, currentStreak = 0;
  for (let i = 0; i < monthKeys.length; i++) {
    if (i === 0) { currentStreak = 1; }
    else {
      const [prevY, prevM] = monthKeys[i - 1].split('-').map(Number);
      const [curY, curM] = monthKeys[i].split('-').map(Number);
      currentStreak = (curY * 12 + curM) - (prevY * 12 + prevM) === 1 ? currentStreak + 1 : 1;
    }
    if (currentStreak > maxStreak) maxStreak = currentStreak;
  }

  return { lifetimeSpend, totalOrders, maxSingleOrder, maxMonthlySpend, maxMonthlyFrequency, maxStreak };
}

const CATEGORY_METRIC = {
  spending: 'lifetimeSpend', orders: 'totalOrders', single_order: 'maxSingleOrder',
  monthly_spend: 'maxMonthlySpend', streak: 'maxStreak', frequency: 'maxMonthlyFrequency',
};

function computeBadges(orders) {
  const metrics = computeMetrics(orders);
  return BADGE_DEFINITIONS.map(badge => ({
    badge,
    unlocked: metrics[CATEGORY_METRIC[badge.category]] >= badge.threshold,
    current: metrics[CATEGORY_METRIC[badge.category]],
  }));
}

function computeAnalytics(orders) {
  const lifetimeSpend = orders.reduce((sum, o) => sum + o.amount, 0);
  const byMonth = new Map();

  for (const order of orders) {
    const d = new Date(order.dateIso);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!byMonth.has(key)) {
      byMonth.set(key, {
        month: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
        year: d.getFullYear(),
        monthIndex: d.getMonth(),
        total: 0,
        orderCount: 0,
      });
    }
    const entry = byMonth.get(key);
    entry.total += order.amount;
    entry.orderCount += 1;
  }

  const monthlyBreakdown = Array.from(byMonth.values()).sort(
    (a, b) => b.year - a.year || b.monthIndex - a.monthIndex
  );

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const last12 = monthlyBreakdown.filter(
    m => new Date(m.year, m.monthIndex, 1) >= cutoff
  );

  let mostSpentMonth = null, leastSpentMonth = null;
  if (last12.length > 0) {
    mostSpentMonth = last12.reduce((a, b) => b.total > a.total ? b : a);
    leastSpentMonth = last12.reduce((a, b) => b.total < a.total ? b : a);
  }

  return { lifetimeSpend, totalOrders: orders.length, monthlyBreakdown, mostSpentMonth, leastSpentMonth };
}

// === State ===
let currentRange = 6;
let allOrders = [];
let budget = null;
let gamificationState = null;

// === Data Loading ===
async function loadAllData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => {
      const orders = [];
      let lastSyncedAt = null;

      for (const platform of ['blinkit', 'zepto']) {
        const key = `orders_${platform}`;
        if (data[key]) {
          orders.push(...(data[key].orders || []));
          if (data[key].lastSyncedAt && (!lastSyncedAt || data[key].lastSyncedAt > lastSyncedAt)) {
            lastSyncedAt = data[key].lastSyncedAt;
          }
        }
      }

      resolve({
        orders,
        lastSyncedAt,
        budget: data.budget || null,
        gamification: data.gamification || {
          version: 1, totalXp: 0, xpEvents: [], activeQuests: [], syncHistory: [],
        },
        blinkitData: data.orders_blinkit || null,
        zeptoData: data.orders_zepto || null,
      });
    });
  });
}

// === Tab Switching ===
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// === Render Dashboard ===
function renderDashboard(data) {
  allOrders = data.orders;
  budget = data.budget;
  gamificationState = data.gamification;

  // XP
  const lp = getLevelProgress(gamificationState.totalXp);
  document.getElementById('xp-level-num').textContent = lp.level;
  document.getElementById('xp-level-name').textContent = lp.name;
  document.getElementById('xp-bar').style.width = `${Math.round(lp.ratio * 100)}%`;
  document.getElementById('xp-text').textContent = `${lp.current} / ${lp.needed} XP`;

  // Stats
  const analytics = computeAnalytics(allOrders);
  document.getElementById('lifetime-spend').textContent = analytics.totalOrders > 0 ? formatCurrency(analytics.lifetimeSpend) : '-';
  document.getElementById('total-orders').textContent = analytics.totalOrders > 0 ? analytics.totalOrders : '-';

  // Budget
  renderBudget(analytics);

  // Chart
  renderChart(analytics.monthlyBreakdown);

  // Extremes
  if (analytics.mostSpentMonth && analytics.leastSpentMonth) {
    document.getElementById('extremes-section').style.display = '';
    document.getElementById('highest-month').textContent =
      `${formatCurrency(analytics.mostSpentMonth.total)} (${analytics.mostSpentMonth.month})`;
    document.getElementById('lowest-month').textContent =
      `${formatCurrency(analytics.leastSpentMonth.total)} (${analytics.leastSpentMonth.month})`;
  }

  // Last synced
  if (data.lastSyncedAt) {
    const d = new Date(data.lastSyncedAt);
    document.getElementById('last-synced').textContent = `Last synced: ${formatSyncDate(d)}`;
  }
}

function formatSyncDate(d) {
  const day = d.getDate().toString().padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const h = hours % 12 || 12;
  return `${day} ${month}, ${h}:${minutes} ${ampm}`;
}

function renderBudget(analytics) {
  const display = document.getElementById('budget-display');
  const editBtn = document.getElementById('edit-budget-btn');

  if (budget) {
    display.classList.remove('hidden');
    editBtn.textContent = 'Edit';

    const now = new Date();
    const currentMonthOrders = allOrders.filter(o => {
      const d = new Date(o.dateIso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const currentSpend = currentMonthOrders.reduce((sum, o) => sum + o.amount, 0);
    const ratio = Math.min(currentSpend / budget, 1);
    const bar = document.getElementById('budget-bar');
    bar.style.width = `${Math.round(ratio * 100)}%`;
    bar.style.background = currentSpend > budget ? 'var(--red)' : 'var(--green)';

    document.getElementById('budget-text').textContent =
      `${formatCurrency(currentSpend)} / ${formatCurrency(budget)} this month`;
  } else {
    display.classList.add('hidden');
    editBtn.textContent = 'Set Budget';
  }
}

function renderChart(monthlyBreakdown) {
  const container = document.getElementById('chart-container');
  const emptyEl = document.getElementById('chart-empty');

  if (monthlyBreakdown.length === 0) {
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';

  let data = monthlyBreakdown;
  if (currentRange > 0) {
    data = data.slice(0, currentRange);
  }

  // Reverse so oldest is at top
  data = [...data].reverse();

  const maxTotal = Math.max(...data.map(m => m.total), 1);
  let html = '';

  for (const m of data) {
    const width = Math.round((m.total / maxTotal) * 100);
    html += `
      <div class="chart-bar-row">
        <div class="chart-month">${m.month}</div>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill" style="width: ${width}%"></div>
          <div class="chart-bar-amount">${formatCurrency(m.total)}</div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// === Render Badges ===
function renderBadges(data) {
  const badges = computeBadges(data.orders);
  const grid = document.getElementById('badges-grid');

  const unlocked = badges.filter(b => b.unlocked);
  const locked = badges.filter(b => !b.unlocked);

  document.getElementById('badge-progress-bar').style.width =
    `${Math.round((unlocked.length / badges.length) * 100)}%`;
  document.getElementById('badge-progress-text').textContent =
    `${unlocked.length} / ${badges.length} unlocked`;

  // Group by category
  const categories = ['spending', 'orders', 'single_order', 'monthly_spend', 'streak', 'frequency'];
  let html = '';

  for (const cat of categories) {
    const catBadges = badges.filter(b => b.badge.category === cat);
    html += `<div class="badge-category-header">${CATEGORY_LABELS[cat]}</div>`;

    for (const bp of catBadges) {
      const icon = BADGE_ICONS[bp.badge.category];
      const progressPct = bp.unlocked ? 100 : Math.min((bp.current / bp.badge.threshold) * 100, 100);

      html += `
        <div class="badge-card ${bp.unlocked ? 'unlocked' : 'locked'}">
          <div class="badge-icon">${icon}</div>
          <div class="badge-title">${bp.badge.title}</div>
          <div class="badge-desc">${bp.badge.description}</div>
          <span class="badge-tier ${bp.badge.tier}">${bp.badge.tier}</span>
          ${!bp.unlocked ? `
            <div class="badge-progress-mini">
              <div class="badge-progress-mini-fill" style="width: ${progressPct}%"></div>
            </div>
            <div class="badge-progress-label">${formatBadgeProgress(bp)}</div>
          ` : ''}
        </div>
      `;
    }
  }

  grid.innerHTML = html;
}

function formatBadgeProgress(bp) {
  const cat = bp.badge.category;
  if (cat === 'spending' || cat === 'single_order' || cat === 'monthly_spend') {
    return `${formatCurrency(bp.current)} / ${formatCurrency(bp.badge.threshold)}`;
  }
  return `${bp.current} / ${bp.badge.threshold}`;
}

// === Render Sync ===
function renderSync(data) {
  if (data.blinkitData) {
    const count = data.blinkitData.orders?.length || 0;
    const identity = data.blinkitData.accountIdentity;
    let text = `${count} orders synced`;
    if (identity) text += ` (${identity})`;
    document.getElementById('blinkit-status').textContent = text;
  }

  if (data.zeptoData) {
    const count = data.zeptoData.orders?.length || 0;
    const identity = data.zeptoData.accountIdentity;
    let text = `${count} orders synced`;
    if (identity) text += ` (${identity})`;
    document.getElementById('zepto-status').textContent = text;
  }
}

// === Render Settings ===
function renderSettings(data) {
  if (data.budget) {
    document.getElementById('budget-input').value = data.budget;
  }

  const accountInfo = document.getElementById('account-info');
  const accounts = [];
  if (data.blinkitData?.accountIdentity) {
    accounts.push(`Blinkit: ${data.blinkitData.accountIdentity}`);
  }
  if (data.zeptoData?.accountIdentity) {
    accounts.push(`Zepto: ${data.zeptoData.accountIdentity}`);
  }
  if (accounts.length > 0) {
    accountInfo.innerHTML = accounts.map(a => `<span class="muted">${a}</span>`).join('<br>');
  }
}

// === Event Handlers ===

// Sync buttons
document.getElementById('sync-blinkit').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'START_SYNC', platform: 'blinkit' });
});

document.getElementById('sync-zepto').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'START_SYNC', platform: 'zepto' });
});

// Range filters
document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = parseInt(btn.dataset.range) || 0;
    loadAllData().then(data => {
      const analytics = computeAnalytics(data.orders);
      renderChart(analytics.monthlyBreakdown);
    });
  });
});

// Budget from dashboard
document.getElementById('edit-budget-btn').addEventListener('click', () => {
  const modal = document.getElementById('budget-modal');
  const input = document.getElementById('modal-budget-input');
  input.value = budget || '';
  modal.classList.remove('hidden');
  input.focus();
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('budget-modal').classList.add('hidden');
});

document.getElementById('modal-save').addEventListener('click', () => {
  const value = parseInt(document.getElementById('modal-budget-input').value);
  if (value > 0) {
    budget = value;
    chrome.storage.local.set({ budget: value }, () => {
      document.getElementById('budget-modal').classList.add('hidden');
      // Award XP for first budget
      awardFirstBudgetXp();
      refresh();
    });
  }
});

// Budget from settings
document.getElementById('save-budget-btn').addEventListener('click', () => {
  const value = parseInt(document.getElementById('budget-input').value);
  if (value > 0) {
    budget = value;
    chrome.storage.local.set({ budget: value }, () => {
      awardFirstBudgetXp();
      refresh();
    });
  }
});

document.getElementById('remove-budget-btn').addEventListener('click', () => {
  budget = null;
  chrome.storage.local.remove('budget', () => {
    document.getElementById('budget-input').value = '';
    refresh();
  });
});

function awardFirstBudgetXp() {
  chrome.storage.local.get('gamification', (data) => {
    const state = data.gamification || {
      version: 1, totalXp: 0, xpEvents: [], activeQuests: [], syncHistory: [],
    };
    if (!state.xpEvents.some(e => e.id === 'set_first_budget')) {
      state.xpEvents.push({
        id: 'set_first_budget', reason: 'set_first_budget', xp: 20,
        createdAt: new Date().toISOString(),
      });
      state.totalXp += 20;
      chrome.storage.local.set({ gamification: state });
    }
  });
}

// Clear data
document.getElementById('clear-data-btn').addEventListener('click', () => {
  if (confirm('Are you sure? This will remove all synced orders, badges progress, and XP.')) {
    chrome.storage.local.clear(() => refresh());
  }
});

// Badge XP awards after data load
function awardBadgeXp(data) {
  const badges = computeBadges(data.orders);
  const unlocked = badges.filter(b => b.unlocked);
  const state = data.gamification;
  let changed = false;

  for (const bp of unlocked) {
    const eventId = `badge:unlock:${bp.badge.id}`;
    if (!state.xpEvents.some(e => e.id === eventId)) {
      const xp = BADGE_TIER_XP[bp.badge.tier];
      state.xpEvents.push({
        id: eventId, reason: 'badge_unlock', xp,
        createdAt: new Date().toISOString(),
        metadata: { badge: bp.badge.id },
      });
      state.totalXp += xp;
      changed = true;
    }
  }

  if (changed) {
    chrome.storage.local.set({ gamification: state });
  }
}

// Listen for sync status updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SYNC_STATUS') {
    const statusEl = document.getElementById(`${msg.platform}-status`);
    if (statusEl) {
      if (msg.phase === 'extracting') {
        statusEl.textContent = msg.detail || 'Extracting...';
        statusEl.style.color = msg.platform === 'blinkit' ? 'var(--blinkit)' : 'var(--zepto)';
      } else if (msg.phase === 'success') {
        statusEl.style.color = 'var(--green)';
        statusEl.textContent = msg.detail || 'Sync complete!';
        setTimeout(refresh, 500);
      } else {
        statusEl.textContent = msg.detail || msg.phase;
      }
    }
  }
});

// === Init ===
async function refresh() {
  const data = await loadAllData();
  renderDashboard(data);
  renderBadges(data);
  renderSync(data);
  renderSettings(data);
  awardBadgeXp(data);
}

refresh();

// Refresh when storage changes (e.g., content script saves orders)
chrome.storage.onChanged.addListener(() => {
  refresh();
});
