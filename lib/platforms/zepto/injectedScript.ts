/**
 * JavaScript injected into the Zepto WebView to automate the login/order-history
 * flow and extract order data.
 *
 * Zepto flow is simpler than Blinkit:
 * - No location modal to handle
 * - No download app banner
 * - Visit site → check login → phone/OTP if needed → navigate to orders → extract
 *
 * DOM selectors derived from Zepto's zeptonow.com production DOM (Feb 2026).
 */
export const AUTOMATION_BRIDGE_SCRIPT = `
(function() {
  if (window.__zeptoAutomation && typeof window.__zeptoAutomation.receiveCommand === 'function') {
    window.__zeptoAutomation.receiveCommand({ type: 'RECHECK' });
    true;
    return;
  }

  var automation = {
    lastAccountClickAt: 0,
    lastDirectOrdersNavAt: 0,
    lastLoadMoreClickAt: 0,
    extractionStartedForUrl: null,
    scrollAttempts: 0,
    lastOrderCount: 0,
    stableCount: 0,
    currentExtractionTimeout: null,
    currentMutationTimeout: null,
    lastStateKey: '',
    lastStateAt: 0,
    observer: null,
    tickInterval: null,
    isExtracting: false,
  };

  var MAX_ATTEMPTS = 90;
  var STABLE_THRESHOLD = 4;
  var EXTRACTION_INITIAL_DELAY = 1500;
  var EXTRACTION_STEP_DELAY = 800;
  var ACCOUNT_CLICK_THROTTLE = 2500;
  var DIRECT_ORDERS_NAV_THROTTLE = 2500;
  var LOAD_MORE_THROTTLE = 1500;

  function post(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (error) {}
  }

  function emitState(phase, detail) {
    var key = phase + '::' + (detail || '');
    var now = Date.now();
    if (automation.lastStateKey === key && now - automation.lastStateAt < 2000) return;
    automation.lastStateKey = key;
    automation.lastStateAt = now;
    post({
      type: 'AUTOMATION_STATE',
      phase: phase,
      detail: detail,
      url: window.location.href,
    });
  }

  function emitError(message, requiresUserAction) {
    post({
      type: 'AUTOMATION_ERROR',
      message: message,
      recoverable: true,
      requiresUserAction: !!requiresUserAction,
    });
  }

  function normalize(text) {
    return (text || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  }

  function isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clickElement(el) {
    if (!el) return false;
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      el.click();
      return true;
    } catch (error) {
      try { el.click(); return true; } catch (e) { return false; }
    }
  }

  function findByText(matcher, selectors) {
    var selector = selectors || 'button, a, div, span';
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!isVisible(node)) continue;
      var text = normalize(node.textContent);
      if (!text) continue;
      if (typeof matcher === 'string') {
        if (text === normalize(matcher)) return node;
      } else if (matcher.test(text)) {
        return node;
      }
    }
    return null;
  }

  function closestClickable(node) {
    if (!node) return null;
    return node.closest('button, a, [role="button"], [tabindex], div') || node;
  }

  function isOrdersPage() {
    var url = window.location.href;
    return url.indexOf('/account/orders') !== -1;
  }

  function findLoginButton() {
    // Not-logged-in state: button[aria-label="login"] on the homepage
    var btn = document.querySelector('button[aria-label="login"]');
    if (btn && isVisible(btn)) return btn;
    // Fallback: text-based match
    return findByText(/^login$/, 'button');
  }

  function findPhoneInput() {
    // Login popup: input[type="tel"] for phone number entry
    var input = document.querySelector('input[type="tel"]');
    if (input && isVisible(input)) return input;
    return null;
  }

  function findOtpInput() {
    // OTP verification: 6 individual numeric inputs inside .gN7Pp container
    var container = document.querySelector('.gN7Pp');
    if (container && isVisible(container)) {
      var inputs = container.querySelectorAll('input[inputmode="numeric"]');
      if (inputs.length > 0) return inputs[0];
    }
    // Fallback: any visible numeric input with maxlength=6 (single OTP field)
    var singleOtp = document.querySelector('input[inputmode="numeric"][maxlength="6"]');
    if (singleOtp && isVisible(singleOtp)) return singleOtp;
    // Fallback: multiple numeric inputs (individual digit fields)
    var allNumeric = document.querySelectorAll('input[inputmode="numeric"]');
    if (allNumeric.length >= 4) {
      for (var i = 0; i < allNumeric.length; i++) {
        if (isVisible(allNumeric[i])) return allNumeric[i];
      }
    }
    return null;
  }

  function findProfileButton() {
    // Logged-in state: a[aria-label="profile"][href="/account"]
    var profileLink = document.querySelector('a[aria-label="profile"][href="/account"]');
    if (profileLink && isVisible(profileLink)) return profileLink;
    // Fallback: any link to /account
    var accountLinks = document.querySelectorAll('a[href="/account"]');
    for (var i = 0; i < accountLinks.length; i++) {
      if (isVisible(accountLinks[i])) return accountLinks[i];
    }
    return null;
  }

  function hasLoggedInSignals() {
    // Profile button present = logged in
    if (findProfileButton()) return true;
    // Check localStorage for user data
    try {
      var raw = localStorage.getItem('user');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.state && parsed.state.user && parsed.state.user.mobileNumber) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function findLoadMoreButton() {
    // "Load More" button at the bottom of orders page
    var btn = document.querySelector('button[aria-label="Load More"]');
    if (btn && isVisible(btn)) return btn;
    // Fallback: text-based match
    return findByText(/^load more$/, 'button');
  }

  function findScrollContainer() {
    var allDivs = document.querySelectorAll('div');
    var best = null;
    var bestScrollHeight = 0;
    for (var i = 0; i < allDivs.length; i++) {
      var div = allDivs[i];
      var style = window.getComputedStyle(div);
      var overflowY = style.overflow === 'scroll' || style.overflowY === 'scroll' ||
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
    var orders = [];
    var seen = {};

    // Each order is an <a> tag with href starting with /order/
    var orderLinks = document.querySelectorAll('a[href^="/order/"]');

    for (var i = 0; i < orderLinks.length; i++) {
      var link = orderLinks[i];
      if (!isVisible(link)) continue;

      // Extract order ID from href: /order/<id>
      var href = link.getAttribute('href') || '';
      var orderId = href.replace('/order/', '').split('?')[0].split('/')[0];
      if (!orderId) continue;

      // Skip duplicates
      if (seen[orderId]) continue;
      seen[orderId] = true;

      // Find status text — p with class containing "text-heading6"
      var statusEls = link.querySelectorAll('p[class*="text-heading6"]');
      var status = '';
      for (var s = 0; s < statusEls.length; s++) {
        var statusText = normalize(statusEls[s].textContent);
        if (statusText.indexOf('order') !== -1) {
          status = statusText;
          break;
        }
      }

      // Only scrape delivered orders
      if (status.indexOf('order delivered') === -1) continue;

      // Find amount — p with class containing "text-heading5" that starts with ₹
      var amountEls = link.querySelectorAll('p[class*="text-heading5"]');
      var rawAmount = '';
      for (var a = 0; a < amountEls.length; a++) {
        var amountText = amountEls[a].textContent.trim();
        if (amountText.indexOf('\\u20b9') !== -1 || amountText.indexOf('₹') !== -1) {
          rawAmount = amountText;
          break;
        }
      }
      if (!rawAmount) continue;

      // Find date — p with class containing "text-body2" that contains "Placed at"
      var dateEls = link.querySelectorAll('p[class*="text-body2"]');
      var rawDate = '';
      for (var d = 0; d < dateEls.length; d++) {
        var dateText = dateEls[d].textContent.trim();
        if (dateText.indexOf('Placed at') !== -1) {
          // Strip "Placed at " prefix
          rawDate = dateText.replace(/^Placed at\\s*/i, '').trim();
          break;
        }
      }
      if (!rawDate) continue;

      orders.push({ rawAmount: rawAmount, rawDate: rawDate, orderId: 'zepto:' + orderId });
    }

    return orders;
  }

  function extractAccountIdentity() {
    try {
      var raw = localStorage.getItem('user');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.state && parsed.state.user) {
          var user = parsed.state.user;
          if (user.mobileNumber) return String(user.mobileNumber).replace(/\\D/g, '').slice(-10);
          if (user.id) return String(user.id);
        }
      }
    } catch (e) {}
    return null;
  }

  function finishExtraction(orders) {
    automation.isExtracting = false;
    automation.scrollAttempts = 0;
    automation.lastOrderCount = 0;
    automation.stableCount = 0;
    automation.currentExtractionTimeout = null;
    var identity = extractAccountIdentity();
    post({ type: 'ACCOUNT_IDENTITY', identity: identity });
    post({ type: 'ORDERS_EXTRACTED', orders: orders });
  }

  function continueExtraction() {
    if (!isOrdersPage()) {
      automation.isExtracting = false;
      return;
    }

    // Try clicking "Load More" button if available
    var now = Date.now();
    var loadMore = findLoadMoreButton();
    if (loadMore && now - automation.lastLoadMoreClickAt > LOAD_MORE_THROTTLE) {
      automation.lastLoadMoreClickAt = now;
      clickElement(loadMore);
      // Wait longer after clicking Load More for new orders to render
      automation.currentExtractionTimeout = window.setTimeout(continueExtraction, EXTRACTION_STEP_DELAY + 500);
      return;
    }

    // Scroll to load more content
    var container = findScrollContainer();
    if (container) {
      var step = Math.max(container.clientHeight * 0.9, 420);
      container.scrollTop = Math.min(container.scrollTop + step, container.scrollHeight);
    } else {
      window.scrollTo(0, window.scrollY + Math.max(window.innerHeight * 0.9, 520));
    }

    automation.scrollAttempts += 1;
    var currentOrders = extractOrders();

    if (currentOrders.length === automation.lastOrderCount) {
      automation.stableCount += 1;
    } else {
      automation.stableCount = 0;
      automation.lastOrderCount = currentOrders.length;
    }

    emitState('extracting', 'Scanning ' + currentOrders.length + ' orders');
    post({ type: 'SCROLL_PROGRESS', count: currentOrders.length });

    if (automation.stableCount >= STABLE_THRESHOLD || automation.scrollAttempts >= MAX_ATTEMPTS) {
      finishExtraction(currentOrders);
      return;
    }

    automation.currentExtractionTimeout = window.setTimeout(continueExtraction, EXTRACTION_STEP_DELAY);
  }

  function startExtraction() {
    if (automation.isExtracting) return;
    automation.isExtracting = true;
    automation.extractionStartedForUrl = window.location.href;
    automation.scrollAttempts = 0;
    automation.lastOrderCount = 0;
    automation.stableCount = 0;
    automation.lastLoadMoreClickAt = 0;
    emitState('extracting', 'Opening order history');
    automation.currentExtractionTimeout = window.setTimeout(continueExtraction, EXTRACTION_INITIAL_DELAY);
  }

  function navigateToOrders(reason) {
    var now = Date.now();
    if (now - automation.lastDirectOrdersNavAt < DIRECT_ORDERS_NAV_THROTTLE) {
      emitState('navigating_to_orders', reason || 'Opening order history');
      return true;
    }
    automation.lastDirectOrdersNavAt = now;
    emitState('navigating_to_orders', reason || 'Opening order history');
    try {
      window.location.assign('https://www.zeptonow.com/account/orders');
    } catch (error) {
      window.location.href = 'https://www.zeptonow.com/account/orders';
    }
    return true;
  }

  function handleKnownStates() {
    if (findOtpInput()) {
      emitState('awaiting_otp', 'Enter OTP to continue');
      return true;
    }

    if (findPhoneInput()) {
      emitState('awaiting_phone', 'Enter mobile number to continue');
      return true;
    }

    if (isOrdersPage()) {
      if (automation.extractionStartedForUrl !== window.location.href) {
        startExtraction();
      }
      return true;
    }

    if (hasLoggedInSignals()) {
      return navigateToOrders('Opening order history');
    }

    // If login button is visible, click it to open the login popup
    var loginBtn = findLoginButton();
    if (loginBtn) {
      emitState('awaiting_phone', 'Opening login');
      clickElement(loginBtn);
      return true;
    }

    emitState('checking_session', 'Waiting for Zepto');
    return false;
  }

  function scheduleAutomation() {
    if (automation.currentMutationTimeout) {
      window.clearTimeout(automation.currentMutationTimeout);
    }
    automation.currentMutationTimeout = window.setTimeout(runAutomation, 60);
  }

  function runAutomation() {
    try {
      handleKnownStates();
    } catch (error) {
      emitError(error && error.message ? error.message : 'Automation failed', false);
    }
  }

  function patchHistoryMethod(name) {
    var original = history[name];
    history[name] = function() {
      var result = original.apply(this, arguments);
      window.setTimeout(runAutomation, 50);
      return result;
    };
  }

  function receiveCommand(command) {
    if (!command || !command.type) return;

    if (command.type === 'RESTART_AUTOMATION') {
      automation.lastDirectOrdersNavAt = 0;
      automation.lastStateKey = '';
      automation.extractionStartedForUrl = null;
      automation.isExtracting = false;
      if (automation.currentExtractionTimeout) {
        window.clearTimeout(automation.currentExtractionTimeout);
        automation.currentExtractionTimeout = null;
      }
      runAutomation();
      return;
    }

    if (command.type === 'RECHECK') {
      runAutomation();
    }
  }

  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');
  window.addEventListener('popstate', runAutomation);
  window.addEventListener('load', runAutomation);

  automation.observer = new MutationObserver(scheduleAutomation);
  automation.observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  automation.tickInterval = window.setInterval(runAutomation, 500);
  window.__zeptoAutomation = {
    receiveCommand: receiveCommand,
  };

  emitState('booting', 'Opening Zepto');
  window.setTimeout(runAutomation, 50);
})();
true;
`;

export function buildAutomationCommandScript(command: object): string {
  return `
    (function() {
      if (window.__zeptoAutomation && typeof window.__zeptoAutomation.receiveCommand === 'function') {
        window.__zeptoAutomation.receiveCommand(${JSON.stringify(command)});
      }
    })();
    true;
  `;
}

export function getSessionResetScript(cookieDomain: string): string {
  return `
  (function() {
    function expireCookie(name, domain) {
      var cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
      document.cookie = cookie;
      if (domain) {
        document.cookie = cookie + ' domain=' + domain + ';';
      }
    }

    try { localStorage.clear(); } catch (error) {}
    try { sessionStorage.clear(); } catch (error) {}

    try {
      if (window.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(function(databases) {
          databases.forEach(function(db) {
            if (db && db.name) indexedDB.deleteDatabase(db.name);
          });
        });
      }
    } catch (error) {}

    try {
      if (window.caches && caches.keys) {
        caches.keys().then(function(keys) {
          keys.forEach(function(key) { caches.delete(key); });
        });
      }
    } catch (error) {}

    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          registrations.forEach(function(registration) { registration.unregister(); });
        });
      }
    } catch (error) {}

    try {
      document.cookie.split(';').forEach(function(cookie) {
        var eqPos = cookie.indexOf('=');
        var name = (eqPos > -1 ? cookie.slice(0, eqPos) : cookie).trim();
        if (!name) return;
        expireCookie(name);
        expireCookie(name, window.location.hostname);
        expireCookie(name, '${cookieDomain}');
      });
    } catch (error) {}
  })();
  true;
`;
}
