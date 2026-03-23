// Content script for Blinkit order extraction
(function () {
  if (window.__blinkitExtraction) return;
  window.__blinkitExtraction = true;

  const PLATFORM = 'blinkit';
  const MAX_ATTEMPTS = 90;
  const STABLE_THRESHOLD = 4;
  const EXTRACTION_INITIAL_DELAY = 1200;
  const EXTRACTION_STEP_DELAY = 700;

  let scrollAttempts = 0;
  let lastOrderCount = 0;
  let stableCount = 0;
  let isExtracting = false;
  let extractionStartedForUrl = null;

  function post(payload) {
    chrome.runtime.sendMessage({ ...payload, platform: PLATFORM });
  }

  function emitState(phase, detail, count) {
    post({ type: 'AUTOMATION_STATE', phase, detail, count });
    updateBanner(phase, detail, count);
  }

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isOrdersPage() {
    const url = window.location.href;
    return url.includes('/account/orders') || url.includes('/past-orders');
  }

  function isLoggedIn() {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u.phone || u.id) return true;
      }
    } catch (e) {}
    return false;
  }

  function findScrollContainer() {
    const allDivs = document.querySelectorAll('div');
    let best = null;
    let bestScrollHeight = 0;
    for (const div of allDivs) {
      const style = window.getComputedStyle(div);
      const overflowY = style.overflow === 'scroll' || style.overflowY === 'scroll' ||
                        style.overflow === 'auto' || style.overflowY === 'auto';
      if (overflowY && div.scrollHeight > div.clientHeight + 10) {
        if (div.scrollHeight > bestScrollHeight) {
          bestScrollHeight = div.scrollHeight;
          best = div;
        }
      }
    }
    return best;
  }

  function extractOrders() {
    const orders = [];
    const seen = {};
    const failedBanner = document.querySelector('[class*="tw-rounded-md"]');
    const containers = document.querySelectorAll('[data-pf="reset"]');

    for (const container of containers) {
      if (!container.classList.contains('tw-flex') || !container.classList.contains('tw-gap-1')) continue;
      if (failedBanner && failedBanner.contains(container)) continue;

      const priceEls = container.querySelectorAll('.tw-text-200.tw-font-regular');
      if (priceEls.length < 2) continue;

      const amountText = priceEls[0].textContent.trim();
      const dateText = priceEls[priceEls.length - 1].textContent.trim();

      if (!amountText.startsWith('\u20b9')) continue;
      if (!dateText.includes(':')) continue;

      const orderKey = amountText + '::' + dateText;
      if (seen[orderKey]) continue;
      seen[orderKey] = true;

      orders.push({ rawAmount: amountText, rawDate: dateText });
    }
    return orders;
  }

  function extractAccountIdentity() {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u.phone) return String(u.phone).replace(/\D/g, '').slice(-10);
        if (u.id) return String(u.id);
      }
    } catch (e) {}
    return null;
  }

  function finishExtraction(orders) {
    isExtracting = false;
    scrollAttempts = 0;
    lastOrderCount = 0;
    stableCount = 0;

    const identity = extractAccountIdentity();
    post({ type: 'ORDERS_EXTRACTED', orders, identity });
    emitState('success', `Synced ${orders.length} orders`);
  }

  function continueExtraction() {
    if (!isOrdersPage()) {
      isExtracting = false;
      return;
    }

    const container = findScrollContainer();
    if (container) {
      const step = Math.max(container.clientHeight * 0.9, 420);
      container.scrollTop = Math.min(container.scrollTop + step, container.scrollHeight);
    } else {
      window.scrollTo(0, window.scrollY + Math.max(window.innerHeight * 0.9, 520));
    }

    scrollAttempts++;
    const currentOrders = extractOrders();

    if (currentOrders.length === lastOrderCount) {
      stableCount++;
    } else {
      stableCount = 0;
      lastOrderCount = currentOrders.length;
    }

    emitState('extracting', `Found ${currentOrders.length} orders`, currentOrders.length);

    if (stableCount >= STABLE_THRESHOLD || scrollAttempts >= MAX_ATTEMPTS) {
      finishExtraction(currentOrders);
      return;
    }

    setTimeout(continueExtraction, EXTRACTION_STEP_DELAY);
  }

  function startExtraction() {
    if (isExtracting) return;
    isExtracting = true;
    extractionStartedForUrl = window.location.href;
    scrollAttempts = 0;
    lastOrderCount = 0;
    stableCount = 0;
    emitState('extracting', 'Scanning orders...');
    setTimeout(continueExtraction, EXTRACTION_INITIAL_DELAY);
  }

  // --- Banner UI ---
  let banner = null;

  function createBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.id = 'qcsa-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #f0f0f0; padding: 12px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px; display: flex; align-items: center; gap: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3); border-bottom: 2px solid #f8c724;
    `;
    banner.innerHTML = `
      <div style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite;"></div>
      <span id="qcsa-status">Initializing...</span>
      <style>@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }</style>
    `;
    document.body.appendChild(banner);
  }

  function updateBanner(phase, detail, count) {
    createBanner();
    const statusEl = document.getElementById('qcsa-status');
    if (!statusEl) return;

    const dot = banner.querySelector('div');
    if (phase === 'success') {
      dot.style.background = '#22c55e';
      dot.style.animation = 'none';
      statusEl.textContent = detail || 'Sync complete!';
      setTimeout(() => { if (banner) banner.remove(); banner = null; }, 4000);
    } else if (phase === 'error') {
      dot.style.background = '#ef4444';
      dot.style.animation = 'none';
      statusEl.textContent = detail || 'Sync failed';
    } else if (phase === 'extracting') {
      dot.style.background = '#f8c724';
      statusEl.textContent = detail || 'Extracting orders...';
    } else if (phase === 'awaiting_login') {
      dot.style.background = '#f8c724';
      statusEl.textContent = 'Please log in to Blinkit, then navigate to order history';
    } else {
      statusEl.textContent = detail || 'Working...';
    }
  }

  // --- Main logic ---
  function run() {
    if (isOrdersPage()) {
      if (!isExtracting && extractionStartedForUrl !== window.location.href) {
        createBanner();
        emitState('extracting', 'Found orders page, starting extraction...');
        startExtraction();
      }
    } else if (!isLoggedIn()) {
      createBanner();
      emitState('awaiting_login', 'Please log in to Blinkit');
    } else {
      createBanner();
      emitState('navigating_to_orders', 'Navigating to order history...');
      window.location.assign('https://blinkit.com/account/orders');
    }
  }

  // Listen for commands from popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TRIGGER_SYNC' && msg.platform === PLATFORM) {
      extractionStartedForUrl = null;
      isExtracting = false;
      run();
    }
  });

  // Auto-run on orders page
  if (isOrdersPage()) {
    setTimeout(run, 500);
  }
})();
