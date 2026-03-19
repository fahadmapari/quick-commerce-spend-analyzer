/**
 * JavaScript injected into the Blinkit WebView to auto-scroll the orders list
 * and extract order data (amount + date) from the DOM.
 *
 * Sends two message types back to React Native:
 *   { type: 'SCROLL_PROGRESS', count: number }  — intermediate update
 *   { type: 'ORDERS_EXTRACTED', orders: Array<{rawAmount, rawDate}> }  — final result
 */
export const INJECTED_SCRIPT = `
(function() {
  // Guard: only run on the orders page
  var url = window.location.href;
  if (!url.includes('/past-orders') && !url.includes('/orders')) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'NOT_ON_ORDERS_PAGE'
    }));
    return;
  }

  var scrollAttempts = 0;
  var MAX_ATTEMPTS = 60;
  var lastOrderCount = 0;
  var stableCount = 0;

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

    // The failed-orders banner — skip any order rows inside it
    var failedBanner = document.querySelector('[class*="tw-rounded-md"]');

    // Each order's amount+date row: div.tw-flex.tw-gap-1[data-pf="reset"]
    var containers = document.querySelectorAll('[data-pf="reset"]');
    for (var i = 0; i < containers.length; i++) {
      var container = containers[i];

      // Must have both tw-flex and tw-gap-1 classes
      if (!container.classList.contains('tw-flex') || !container.classList.contains('tw-gap-1')) {
        continue;
      }

      // Skip if inside the failed orders banner
      if (failedBanner && failedBanner.contains(container)) continue;

      // Find child elements with tw-text-200 tw-font-regular
      var priceEls = container.querySelectorAll('.tw-text-200.tw-font-regular');
      if (priceEls.length < 2) continue;

      var amountText = priceEls[0].textContent.trim();
      var dateText = priceEls[priceEls.length - 1].textContent.trim();

      // Amount must start with rupee symbol
      if (!amountText.startsWith('\\u20b9')) continue;

      // Date must look like a date (contain a colon for time)
      if (!dateText.includes(':')) continue;

      orders.push({ rawAmount: amountText, rawDate: dateText });
    }
    return orders;
  }

  function scrollAndExtract() {
    var container = findScrollContainer();
    if (container) {
      container.scrollTop = container.scrollHeight;
    } else {
      window.scrollTo(0, document.body.scrollHeight);
    }

    scrollAttempts++;
    var currentOrders = extractOrders();

    if (currentOrders.length === lastOrderCount) {
      stableCount++;
    } else {
      stableCount = 0;
      lastOrderCount = currentOrders.length;
    }

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'SCROLL_PROGRESS',
      count: currentOrders.length
    }));

    if (stableCount >= 3 || scrollAttempts >= MAX_ATTEMPTS) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'ORDERS_EXTRACTED',
        orders: currentOrders
      }));
      return;
    }

    setTimeout(scrollAndExtract, 500);
  }

  // Initial delay to let React finish rendering the page
  setTimeout(scrollAndExtract, 1000);
})();
true;
`;
