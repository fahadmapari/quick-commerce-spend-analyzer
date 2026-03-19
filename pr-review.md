# PR Review: `order-fetch-automation-codex` → `master`

## Overview

This is a substantial and well-architected feature PR that transforms the manual "Sync Orders" button flow into a fully automated order extraction pipeline. The old approach required users to navigate to the Blinkit orders page and tap a button; the new approach automates the entire login-and-extraction journey through a WebView bridge with a polished animated UI.

**+1,309 / -138 lines across 6 files. Approve with suggestions.**

---

## What's Good

- **Clean type system** — `types/automation.ts` uses a proper discriminated union for `WebViewBridgeMessage`, making message handling safe and predictable.
- **Solid automation state machine** — The `AutomationPhase` enum covers all expected states cleanly. The `transitionTo` function with watchdog timer (30 s) is a good pattern.
- **Graceful location fallback** — The 8-second `LOCATION_FALLBACK_MS` timer with manual mode is thoughtful UX.
- **Session reset nonce** (`lib/sessionReset.ts`) — Simple, correct pub/sub pattern for cross-screen coordination.
- **History patching** in `injectedScript.ts` (`pushState`/`replaceState`/`popstate`) ensures the automation re-runs on SPA navigations.
- **Guard against re-injection** — `if (window.__blinkitAutomation) { receiveCommand({ type: 'RECHECK' }); return; }` prevents duplicate bridge instances.
- **Animation polish** — The animated progress beam and dot row give real-time feedback during extraction.

---

## Issues

### 1. Hidden WebView still receives touch events (`explore.tsx:616`)

```ts
hiddenWebView: {
  opacity: 0.02,   // ← nearly invisible but still hittable
},
```

`opacity: 0.02` makes the WebView almost invisible but it still responds to touches. A user could accidentally tap through the overlay and interact with Blinkit's page (e.g. tapping a button the automation is about to click). Fix:

```ts
hiddenWebView: {
  opacity: 0,
  pointerEvents: 'none',   // or wrap in <View pointerEvents="none">
},
```

---

### 2. `onMessage` is not memoized (`explore.tsx:393`)

`onMessage` is an `async` function defined inline without `useCallback`. It closes over `manualLocationMode`, `clearLocationFallback`, `clearWatchdog`, `injectAutomationBridge`, `transitionTo`, and `mergeOrders`. Every render creates a new reference and passes it to `WebView`, causing a full WebView prop update on each render (not a re-mount, but still wasteful). Wrap it:

```ts
const onMessage = useCallback(async (event: WebViewMessageEvent) => {
  // ...
}, [clearLocationFallback, clearWatchdog, handleLocationPermissionRequired,
    handleManualLocationFallback, injectAutomationBridge, manualLocationMode, transitionTo]);
```

---

### 3. iOS location permission is silently skipped (`explore.tsx:~260`)

```ts
const granted = Platform.OS === 'android'
  ? (await PermissionsAndroid.request(...)) === PermissionsAndroid.RESULTS.GRANTED
  : true;   // ← iOS always "granted"
```

On iOS the app never actually requests location access, so `granted = true` is sent to the bridge but `CLLocationManager` may still deny the request inside the WebView. This causes the "Use my location" button to fail silently and likely falls back to manual mode. Use `expo-location` (already in many Expo projects) or `Linking.openSettings()` to handle iOS permission.

---

### 4. `useFocusEffect` restarts automation on every tab focus

```ts
useFocusEffect(
  useCallback(() => {
    startAutomationCycle();
  }, [startAutomationCycle])
);
```

Every time the user switches away and back to the Sync tab, the automation fully restarts — even if a successful sync just completed. Add a guard:

```ts
useFocusEffect(
  useCallback(() => {
    if (phase !== 'success') {
      startAutomationCycle();
    }
  }, [phase, startAutomationCycle])
);
```

---

### 5. Tick interval in injected script never stops (`injectedScript.ts`)

```js
automation.tickInterval = window.setInterval(runAutomation, 500);
```

After extraction completes (`finishExtraction`), the 500 ms interval and the `MutationObserver` continue running indefinitely. The MutationObserver with `attributes: true` on the entire document is also heavy on complex React pages. After `finishExtraction`, consider:

```js
function finishExtraction(orders) {
  // ...
  if (automation.tickInterval) window.clearInterval(automation.tickInterval);
  if (automation.observer) automation.observer.disconnect();
  post({ type: 'ORDERS_EXTRACTED', orders: orders });
}
```

---

### 6. Storage error in `onMessage` surfaces as misleading message (`explore.tsx:427`)

```ts
const { added, total } = await mergeOrders(data.orders);
```

If `mergeOrders` throws (e.g. AsyncStorage full or corrupt), it's caught by the outer `catch` and shows **"The Blinkit bridge sent an unreadable message"** — which is incorrect and confusing. Separate the storage call:

```ts
if (data.type === 'ORDERS_EXTRACTED') {
  clearLocationFallback();
  clearWatchdog();
  setSyncProgress(null);
  try {
    const { added, total } = await mergeOrders(data.orders);
    // ...
    transitionTo('success', summary);
  } catch (storageError) {
    setErrorMessage('Failed to save orders to storage. Please retry.');
    transitionTo('error', 'Storage error');
  }
  return;
}
```

---

### 7. Minor: branch name typo

The branch is named `order-fecth-automation-codex` (fecth → fetch). Not blocking, but worth fixing for history clarity.

---

## Nits

- `STABLE_THRESHOLD = 5` at `EXTRACTION_STEP_DELAY = 1100 ms` means 5.5 seconds of stability before finishing. For users with long order histories this is fine, but could feel slow on short histories. Consider reducing to 3.
- `RESET_WEBVIEW_SESSION_SCRIPT` clears all `localStorage`/`sessionStorage` without scoping to blinkit.com — this would affect any other origin loaded in the same WebView (unlikely here but worth noting).
- `webViewRef.current.clearHistory?.()` and `clearFormData?.()` are optional-chained because they're not on the official RN `WebView` type. If they're needed for the session reset, they should be properly typed or a note added explaining why they may be absent.

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | Medium | `explore.tsx:616` | Hidden WebView receives touch events |
| 2 | Low | `explore.tsx:393` | `onMessage` not memoized |
| 3 | Medium | `explore.tsx:~260` | iOS location always assumed granted |
| 4 | Low | `explore.tsx:~340` | Automation restarts on every tab focus |
| 5 | Low | `injectedScript.ts` | Interval/observer never cleaned up after extraction |
| 6 | Low | `explore.tsx:427` | Storage error shows misleading message |
| 7 | Nit | branch | Typo in branch name |
