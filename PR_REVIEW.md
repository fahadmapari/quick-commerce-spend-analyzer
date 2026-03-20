## PR Review: Order Fetch Automation and Animation

### Summary
This PR transforms the manual "Sync Orders" workflow into a fully automated state machine. The WebView now automatically detects the Blinkit page state (download modal, location prompt, login, order history) and drives the user through the flow with minimal interaction. It adds an animated overlay UI, session reset capability, deduplication in storage, and location permissions via `expo-location`.

Overall the feature is ambitious and well-structured. The state machine design is sound and the types are clean. Below are the issues I found, ordered by severity.

---

### Bugs / Correctness

**1. `isOrdersPage()` false-positive on `/orders` substring match**
`lib/injectedScript.ts:134` — `url.indexOf('/orders') !== -1` will match any URL containing the substring, e.g. `/reorders` or `/preorders`. Since this now triggers automated extraction, a false positive would start scrolling and scraping on the wrong page.

Suggested fix: use a stricter check like `/\/account\/orders(\/|$|\?)/.test(url) || /\/past-orders(\/|$|\?)/.test(url)`.

**2. Watchdog timeout never fires when automation is stuck in a loop**
`app/(tabs)/explore.tsx:155-162` — Every `transitionTo` call to an automated phase resets the 30s watchdog. The injected script's `emitState` has a 2-second dedup, but `SCROLL_PROGRESS` messages during extraction call `transitionTo('extracting', ...)` on every scroll step (line 355), continuously resetting the watchdog. If extraction hangs in a loop where order count never stabilizes and `MAX_ATTEMPTS` is high (90), the watchdog becomes ineffective.

Consider only resetting the watchdog on *phase changes*, not on repeated emissions of the same phase.

**3. `onLoadStart` unconditionally resets to 'booting'**
`app/(tabs)/explore.tsx:294-296` — Any navigation (including in-page SPA transitions that some WebView implementations report) resets the phase to `booting`. If this fires mid-extraction, it interrupts the flow. Consider gating this on `phase` not being `extracting`.

**4. `showOverlay` / `showWebView` can both be true simultaneously**
`app/(tabs)/explore.tsx:132-133` — When `phase === 'success'` and `showWebView` is false, both values work correctly. But if `errorRequiresUserAction` is true (making `showWebView` true) and phase transitions to a non-error state before `errorRequiresUserAction` is cleared, both the overlay and the interactive WebView render at once. The overlay's `absoluteFillObject` covers the WebView visually, but the WebView frame still has `pointerEvents="auto"`.

---

### Performance

**5. MutationObserver with `attributes: true` on entire subtree is expensive**
`lib/injectedScript.ts:489-493` — Observing attribute changes on every node in a complex SPA like Blinkit will fire the observer callback extremely frequently (CSS-in-JS class toggles, animation frames, etc.). Combined with the 500ms interval and history patches, `runAutomation` → `handleKnownStates()` runs DOM queries (querySelectorAll, getComputedStyle, getBoundingClientRect) at a very high rate.

Suggestion: Drop `attributes: true`. The `childList + subtree` combination is sufficient for detecting meaningful DOM changes (new modals, page transitions). This alone should cut MutationObserver invocations significantly.

**6. `findScrollContainer` iterates all `<div>` elements and calls `getComputedStyle` on each**
`lib/injectedScript.ts:222-239` — On a page with hundreds of divs, this is called on every extraction step (every 700ms). Consider caching the result after the first successful find, or narrowing the selector.

---

### Code Quality

**7. `explore.tsx` is a 723-line single component**
The component manages: automation state machine, animation loops, watchdog timer, WebView lifecycle, session reset, message handling, and all rendering. Consider extracting the state machine into a custom hook (e.g. `useBlinkitAutomation`) to separate concerns and improve testability.

**8. `expo-location` dependency is added but never used in code**
`package.json` adds `expo-location` and `app.json` configures its permissions, but no code imports or calls `expo-location` APIs. The WebView's geolocation prompt is handled by `geolocationEnabled` on the WebView component. If `expo-location` is only needed for the native permission manifest entries, document this — otherwise remove the unused dependency.

**9. `hiddenWebView` uses `opacity: 0.02` instead of `0`**
`app/(tabs)/explore.tsx:548` — Presumably to keep the WebView rendering (some implementations skip layout at `opacity: 0`), but this may cause a faint visual artifact. A comment explaining the intent would help.

**10. `buildAutomationCommandScript` template literal injection risk**
`lib/injectedScript.ts:510` — `JSON.stringify(command)` is interpolated into a template literal. If a command value contains a backtick or `${`, the template literal breaks. Since commands are all internal objects this is low risk, but consider using single quotes or escaping.

---

### Minor / Nits

- **Typo in branch name**: `order-fecth-automation-codex` → should be `fetch`
- **`iconBadgeSuccess` style is identical to `iconBadge`** (`explore.tsx:587-589`) — `backgroundColor: Colors.greenDark` is already the default. This style is a no-op and can be removed.
- **`dedupeSerializedOrders` called 3 times in `mergeOrders`**: once in `loadOrders`, once explicitly on line 42, and once on the final merged array (line 60). The triple dedup is harmless but redundant — one pass on the final merged array is sufficient.
- **No error boundary**: If `mergeOrders` throws (e.g. storage full), the `onMessage` handler catches it but transitions to a generic error state without the actual cause.

---

### What looks good
- The `AutomationPhase` type and `WebViewBridgeMessage` discriminated union are clean and well-typed
- The session reset nonce pattern with pub/sub is a nice lightweight approach
- The injected script's guard against double-initialization (line 7-11) is solid
- Extraction deduplication at both the JS and storage layers is thorough
- The watchdog concept is the right idea for timeouts
- UI polish with the animated overlay is nice
