// Content script for Zepto order extraction
(function () {
  if (window.__zeptoExtraction) return;
  window.__zeptoExtraction = true;

  const PLATFORM = 'zepto';
  const MAX_ATTEMPTS = 90;
  const STABLE_THRESHOLD = 4;
  const EXTRACTION_INITIAL_DELAY = 1500;
  const EXTRACTION_STEP_DELAY = 800;
  const LOAD_MORE_THROTTLE = 1500;

  let scrollAttempts = 0;
  let lastOrderCount = 0;
  let stableCount = 0;
  let isExtracting = false;
  let extractionStartedForUrl = null;
  let lastLoadMoreClickAt = 0;

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

  function clickElement(el) {
    if (!el) return false;
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      el.click();
      return true;
    } catch (e) {
      try { el.click(); return true; } catch (err) { return false; }
    }
  }

  function isOrdersPage() {
    return window.location.href.includes('/account/orders');
  }

  function isLoggedIn() {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.state && parsed.state.user && parsed.state.user.mobileNumber) return true;
      }
    } catch (e) {}
    // Check for profile link
    const profileLink = document.querySelector('a[aria-label="profile"][href="/account"]');
    return profileLink && isVisible(profileLink);
  }

  function findLoadMoreButton() {
    const btn = document.querySelector('button[aria-label="Load More"]');
    if (btn && isVisible(btn)) return btn;
    const allBtns = document.querySelectorAll('button');
    for (const b of allBtns) {
      if (normalize(b.textContent) === 'load more' && isVisible(b)) return b;
    }
    return null;
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
    const orderLinks = document.querySelectorAll('a[href^="/order/"]');

    for (const link of orderLinks) {
      if (!isVisible(link)) continue;

      const href = link.getAttribute('href') || '';
      const orderId = href.replace('/order/', '').split('?')[0].split('/')[0];
      if (!orderId || seen[orderId]) continue;
      seen[orderId] = true;

      // Check status
      const statusEls = link.querySelectorAll('p[class*="text-heading6"]');
      let status = '';
      for (const s of statusEls) {
        const st = normalize(s.textContent);
        if (st.includes('order')) { status = st; break; }
      }
      if (!status.includes('order delivered')) continue;

      // Amount
      const amountEls = link.querySelectorAll('p[class*="text-heading5"]');
      let rawAmount = '';
      for (const a of amountEls) {
        const t = a.textContent.trim();
        if (t.includes('\u20b9') || t.includes('₹')) { rawAmount = t; break; }
      }
      if (!rawAmount) continue;

      // Date
      const dateEls = link.querySelectorAll('p[class*="text-body2"]');
      let rawDate = '';
      for (const d of dateEls) {
        const t = d.textContent.trim();
        if (t.includes('Placed at')) {
          rawDate = t.replace(/^Placed at\s*/i, '').trim();
          break;
        }
      }
      if (!rawDate) continue;

      orders.push({ rawAmount, rawDate, orderId: 'zepto:' + orderId });
    }
    return orders;
  }

  function extractAccountIdentity() {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.state && parsed.state.user) {
          const user = parsed.state.user;
          if (user.mobileNumber) return String(user.mobileNumber).replace(/\D/g, '').slice(-10);
          if (user.id) return String(user.id);
        }
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

    // Try Load More button
    const now = Date.now();
    const loadMore = findLoadMoreButton();
    if (loadMore && now - lastLoadMoreClickAt > LOAD_MORE_THROTTLE) {
      lastLoadMoreClickAt = now;
      clickElement(loadMore);
      setTimeout(continueExtraction, EXTRACTION_STEP_DELAY + 500);
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
    lastLoadMoreClickAt = 0;
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
      box-shadow: 0 2px 12px rgba(0,0,0,0.3); border-bottom: 2px solid #7b2ff2;
    `;
    banner.innerHTML = `
      <div style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite;"></div>
      <span id="qcsa-status">Initializing...</span>
      <style>@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }</style>
    `;
    document.body.appendChild(banner);
  }

  function updateBanner(phase, detail) {
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
      dot.style.background = '#7b2ff2';
      statusEl.textContent = detail || 'Extracting orders...';
    } else if (phase === 'awaiting_login') {
      dot.style.background = '#7b2ff2';
      statusEl.textContent = 'Please log in to Zepto, then navigate to order history';
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
      emitState('awaiting_login', 'Please log in to Zepto');
    } else {
      createBanner();
      emitState('navigating_to_orders', 'Navigating to order history...');
      window.location.assign('https://www.zeptonow.com/account/orders');
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TRIGGER_SYNC' && msg.platform === PLATFORM) {
      extractionStartedForUrl = null;
      isExtracting = false;
      run();
    }
  });

  if (isOrdersPage()) {
    setTimeout(run, 500);
  }
})();
