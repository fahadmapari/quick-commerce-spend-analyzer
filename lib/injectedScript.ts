/**
 * JavaScript injected into the Blinkit WebView to automate the login/order-history
 * flow and extract order data once the orders page is available.
 */
export const AUTOMATION_BRIDGE_SCRIPT = `
(function() {
  if (window.__blinkitAutomation && typeof window.__blinkitAutomation.receiveCommand === 'function') {
    window.__blinkitAutomation.receiveCommand({ type: 'RECHECK' });
    true;
    return;
  }

  var automation = {
    locationPermissionRequested: false,
    manualLocationMode: false,
    lastAccountClickAt: 0,
    lastDirectOrdersNavAt: 0,
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
  var EXTRACTION_INITIAL_DELAY = 1200;
  var EXTRACTION_STEP_DELAY = 700;
  var ACCOUNT_CLICK_THROTTLE = 2500;
  var DIRECT_ORDERS_NAV_THROTTLE = 2500;

  function post(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (error) {
      // Ignore bridge errors inside the page.
    }
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
      try {
        el.click();
        return true;
      } catch (innerError) {
        return false;
      }
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

  function findVisibleSelector(selector) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      if (isVisible(nodes[i])) {
        return nodes[i];
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
    return url.indexOf('/account/orders') !== -1 || url.indexOf('/past-orders') !== -1 || url.indexOf('/orders') !== -1;
  }

  function findDownloadContinueButton() {
    return document.querySelector('[class*="DownloadAppModal__ContinueLink"]') ||
      closestClickable(findByText(/continue on web/));
  }

  function findDownloadCloseButton() {
    return document.querySelector('[class*="DownloadAppModal__BackButtonIcon"]') ||
      document.querySelector('img[alt="Close Slider"]') ||
      document.querySelector('[class*="DownloadAppModal"] [class*="BackButton"]');
  }

  function findLocationModal() {
    var modalRoot = findVisibleSelector(
      '[class*="GetLocationModal__GetLocationContainer"], [class*="GetLocationModal__LocationContainer"], [aria-modal="true"]'
    );
    var useMyLocation = findUseMyLocationButton();
    var selectManually = closestClickable(findByText(/select manually/));
    if (modalRoot && (useMyLocation || selectManually)) {
      return modalRoot;
    }

    var heading = findByText(/select your location/);
    if (heading && (useMyLocation || selectManually)) {
      return heading;
    }

    return null;
  }

  function findUseMyLocationButton() {
    return closestClickable(findByText(/use my location/));
  }

  function findPhoneInput() {
    var input = document.querySelector('[data-test-id="phone-no-text-box"]');
    return isVisible(input) ? input : null;
  }

  function findOtpInput() {
    var input = document.querySelector('[data-test-id="otp-text-box"]');
    return isVisible(input) ? input : null;
  }

  function findOrderHistoryOption() {
    return closestClickable(findByText(/order history/));
  }

  function hasLoggedInMenuSignals() {
    return !!(
      document.querySelector('[class*="UserAccountLogin__HeaderStrip"]') ||
      findByText(/logout/) ||
      findByText(/your information/)
    );
  }

  function findAccountButton() {
    return document.querySelector('[class*="ProfileButton__Container"]') ||
      document.querySelector('div[class*="ProfileButton"]') ||
      null;
  }

  function navigateDirectlyToOrders(reason) {
    var now = Date.now();
    if (now - automation.lastDirectOrdersNavAt < DIRECT_ORDERS_NAV_THROTTLE) {
      emitState('navigating_to_orders', reason || 'Opening order history');
      return true;
    }

    automation.lastDirectOrdersNavAt = now;
    emitState('navigating_to_orders', reason || 'Opening order history');
    try {
      window.location.assign('https://blinkit.com/account/orders');
    } catch (error) {
      window.location.href = 'https://blinkit.com/account/orders';
    }
    return true;
  }

  function notifyLocationPermissionRequired() {
    emitState('requesting_location_permission', 'Use Blinkit location or select manually');
    if (automation.locationPermissionRequested) return;
    automation.locationPermissionRequested = true;
    post({ type: 'LOCATION_PERMISSION_REQUIRED' });
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
    var failedBanner = document.querySelector('[class*="tw-rounded-md"]');
    var containers = document.querySelectorAll('[data-pf="reset"]');

    for (var i = 0; i < containers.length; i++) {
      var container = containers[i];

      if (!container.classList.contains('tw-flex') || !container.classList.contains('tw-gap-1')) {
        continue;
      }

      if (failedBanner && failedBanner.contains(container)) continue;

      var priceEls = container.querySelectorAll('.tw-text-200.tw-font-regular');
      if (priceEls.length < 2) continue;

      var amountText = priceEls[0].textContent.trim();
      var dateText = priceEls[priceEls.length - 1].textContent.trim();

      if (!amountText.startsWith('\\u20b9')) continue;
      if (!dateText.includes(':')) continue;

      var orderKey = amountText + '::' + dateText;
      if (seen[orderKey]) continue;
      seen[orderKey] = true;

      orders.push({ rawAmount: amountText, rawDate: dateText });
    }

    return orders;
  }

  function finishExtraction(orders) {
    automation.isExtracting = false;
    automation.scrollAttempts = 0;
    automation.lastOrderCount = 0;
    automation.stableCount = 0;
    automation.currentExtractionTimeout = null;
    post({ type: 'ORDERS_EXTRACTED', orders: orders });
  }

  function continueExtraction() {
    if (!isOrdersPage()) {
      automation.isExtracting = false;
      return;
    }

    var container = findScrollContainer();
    if (container) {
      var step = Math.max(container.clientHeight * 0.9, 420);
      var nextScrollTop = Math.min(
        container.scrollTop + step,
        container.scrollHeight
      );
      container.scrollTop = nextScrollTop;
    } else {
      var pageStep = Math.max(window.innerHeight * 0.9, 520);
      window.scrollTo(0, window.scrollY + pageStep);
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
    emitState('extracting', 'Opening order history');
    automation.currentExtractionTimeout = window.setTimeout(continueExtraction, EXTRACTION_INITIAL_DELAY);
  }

  function handleDownloadModal() {
    var continueOnWeb = findDownloadContinueButton();
    if (continueOnWeb) {
      emitState('checking_session', 'Continuing on web');
      clickElement(continueOnWeb);
      return true;
    }

    var closeButton = findDownloadCloseButton();
    if (closeButton && isVisible(closeButton)) {
      emitState('checking_session', 'Closing download prompt');
      clickElement(closeButton);
      return true;
    }

    return false;
  }

  function handleLocationModal() {
    if (!findLocationModal()) return false;

    if (automation.manualLocationMode) {
      emitState('awaiting_manual_location', 'Select location manually');
      return true;
    }

    var useMyLocation = findUseMyLocationButton();
    if (useMyLocation) {
      notifyLocationPermissionRequired();
      return true;
    }

    post({
      type: 'LOCATION_MANUAL_REQUIRED',
      reason: 'location_button_missing',
    });
    emitState('awaiting_manual_location', 'Select location manually');
    return true;
  }

  function handleKnownStates() {
    if (handleDownloadModal()) return true;

    if (findOtpInput()) {
      emitState('awaiting_otp', 'Enter OTP to continue');
      return true;
    }

    if (findPhoneInput()) {
      emitState('awaiting_phone', 'Enter mobile number to continue');
      return true;
    }

    if (handleLocationModal()) return true;

    if (isOrdersPage()) {
      if (automation.extractionStartedForUrl !== window.location.href) {
        startExtraction();
      }
      return true;
    }

    if (hasLoggedInMenuSignals()) {
      return navigateDirectlyToOrders('Opening order history');
    }

    var orderHistoryOption = findOrderHistoryOption();
    if (orderHistoryOption) {
      clickElement(orderHistoryOption);
      window.setTimeout(function() {
        if (!isOrdersPage()) {
          navigateDirectlyToOrders('Opening order history');
        }
      }, 900);
      return true;
    }

    var accountButton = findAccountButton();
    if (accountButton && Date.now() - automation.lastAccountClickAt > ACCOUNT_CLICK_THROTTLE) {
      automation.lastAccountClickAt = Date.now();
      emitState('checking_session', 'Checking your account');
      clickElement(accountButton);
      return true;
    }

    emitState('checking_session', 'Waiting for Blinkit');
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

    if (command.type === 'ENTER_MANUAL_LOCATION_MODE') {
      automation.manualLocationMode = true;
      emitState('awaiting_manual_location', 'Select location manually');
      return;
    }

    if (command.type === 'EXIT_MANUAL_LOCATION_MODE') {
      automation.manualLocationMode = false;
      window.setTimeout(runAutomation, 50);
      return;
    }

    if (command.type === 'RESTART_AUTOMATION') {
      automation.locationPermissionRequested = false;
      automation.manualLocationMode = false;
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
  window.__blinkitAutomation = {
    receiveCommand: receiveCommand,
  };

  emitState('booting', 'Opening Blinkit');
  window.setTimeout(runAutomation, 50);
})();
true;
`;

export function buildAutomationCommandScript(command: object): string {
  return `
    (function() {
      if (window.__blinkitAutomation && typeof window.__blinkitAutomation.receiveCommand === 'function') {
        window.__blinkitAutomation.receiveCommand(${JSON.stringify(command)});
      }
    })();
    true;
  `;
}

export const RESET_WEBVIEW_SESSION_SCRIPT = `
  (function() {
    function expireCookie(name, domain) {
      var cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;';
      document.cookie = cookie;
      if (domain) {
        document.cookie = cookie + ' domain=' + domain + ';';
      }
    }

    try {
      localStorage.clear();
    } catch (error) {}

    try {
      sessionStorage.clear();
    } catch (error) {}

    try {
      if (window.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(function(databases) {
          databases.forEach(function(db) {
            if (db && db.name) {
              indexedDB.deleteDatabase(db.name);
            }
          });
        });
      }
    } catch (error) {}

    try {
      if (window.caches && caches.keys) {
        caches.keys().then(function(keys) {
          keys.forEach(function(key) {
            caches.delete(key);
          });
        });
      }
    } catch (error) {}

    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          registrations.forEach(function(registration) {
            registration.unregister();
          });
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
        expireCookie(name, '.blinkit.com');
      });
    } catch (error) {}
  })();
  true;
`;
