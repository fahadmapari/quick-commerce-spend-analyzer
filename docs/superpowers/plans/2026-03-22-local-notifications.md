# Local Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily local notification system that reminds users to sync, with rotating copy, a first-sync celebratory interstitial, and a Notifications section in settings.

**Architecture:** `expo-notifications` handles scheduling and permissions. A single non-repeating notification is scheduled for the next eligible time and rescheduled on each app foreground or sync completion. All state is persisted in AsyncStorage following existing patterns — no new Context/Provider.

**Tech Stack:** Expo SDK 54, expo-notifications, @react-native-community/datetimepicker, React Native Reanimated (for confetti animation), AsyncStorage.

**Spec:** `docs/superpowers/specs/2026-03-22-local-notifications-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `lib/notificationCopy.ts` | Exported array of 13 notification message objects (title + body) |
| `lib/notifications.ts` | All notification logic: init channel, schedule, cancel, reschedule, permission request, settings CRUD, `checkAndReschedule()` |
| `components/first-sync-modal.tsx` | Full-screen celebratory interstitial with notification opt-in, shown once after first sync |

### Modified Files

| File | Changes |
|------|---------|
| `app.json` | Add `"expo-notifications"` to `plugins` array |
| `lib/storage.ts` | Add `getNotificationSettings()`, `setNotificationSettings()`, `getNotificationPromptShown()`, `setNotificationPromptShown()`, clear notification keys in `clearAllOrders()` |
| `app/(tabs)/explore.tsx` | Import and show `FirstSyncModal` when sync state is `done` and prompt hasn't been shown |
| `app/(tabs)/settings.tsx` | Add "NOTIFICATIONS" section between Accounts and Data with toggle, time picker, next-reminder info |
| `app/_layout.tsx` | Add `AppState` foreground listener calling `checkAndReschedule()`, add notification tap response listener for deep-link to Sync tab |

---

## Task 1: Install Dependencies & Configure

**Files:**
- Modify: `package.json`
- Modify: `app.json:37-57` (plugins array)

- [ ] **Step 1: Install expo-notifications and datetimepicker**

```bash
npx expo install expo-notifications @react-native-community/datetimepicker
```

- [ ] **Step 2: Add expo-notifications plugin to app.json**

In `app.json`, add `"expo-notifications"` to the `plugins` array (after `"expo-router"`):

```json
"plugins": [
  "expo-router",
  "expo-notifications",
  [
    "expo-location",
    ...
```

- [ ] **Step 3: Commit**

```bash
git add package.json app.json package-lock.json
git commit -m "feat: install expo-notifications and datetimepicker"
```

Note: If a `yarn.lock` exists instead, stage that. Always include the lockfile.

---

## Task 2: Create Notification Copy Pool

**Files:**
- Create: `lib/notificationCopy.ts`

- [ ] **Step 1: Create the notification copy file**

```typescript
// lib/notificationCopy.ts

export interface NotificationCopy {
  title: string;
  body: string;
}

const NOTIFICATION_TITLE = 'QC Spend Tracker';

export const NOTIFICATION_MESSAGES: NotificationCopy[] = [
  // Casual / Playful
  { title: NOTIFICATION_TITLE, body: 'Your wallet called — it wants an update! 📱' },
  { title: NOTIFICATION_TITLE, body: "Quick-commerce never sleeps, but your tracker shouldn't either 🛒" },
  { title: NOTIFICATION_TITLE, body: "Orders delivered, now let's track what they cost 💸" },
  { title: NOTIFICATION_TITLE, body: '2 minutes to sync, 24 hours of clarity ⏱️' },
  { title: NOTIFICATION_TITLE, body: "Your spends are piling up — time for a quick sync!" },

  // Motivational / Serious
  { title: NOTIFICATION_TITLE, body: 'Tracking daily is the first step to spending smarter 📊' },
  { title: NOTIFICATION_TITLE, body: "You can't improve what you don't measure — sync now" },
  { title: NOTIFICATION_TITLE, body: "Small habits, big savings. Don't break your sync streak 🔥" },
  { title: NOTIFICATION_TITLE, body: 'Know where your money goes. Sync your orders today.' },
  { title: NOTIFICATION_TITLE, body: 'Stay ahead of your budget — a quick sync keeps you in control' },

  // Gamification-tied
  { title: NOTIFICATION_TITLE, body: 'Your badges are waiting — sync to unlock progress 🏅' },
  { title: NOTIFICATION_TITLE, body: "Don't let your XP streak go cold! Sync now to earn points ⚡" },
  { title: NOTIFICATION_TITLE, body: 'A daily sync keeps your quests on track 🎯' },
];

export function getRandomNotificationCopy(): NotificationCopy {
  const index = Math.floor(Math.random() * NOTIFICATION_MESSAGES.length);
  return NOTIFICATION_MESSAGES[index];
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/notificationCopy.ts
git commit -m "feat: add notification copy pool with 13 rotating messages"
```

---

## Task 3: Add Notification Storage Functions

**Files:**
- Modify: `lib/storage.ts`

- [ ] **Step 1: Add NotificationSettings type and storage functions**

Add at the bottom of `lib/storage.ts`, before the closing of the file:

```typescript
// ── Notification Settings ───────────────────────────────────────────────

const NOTIFICATION_SETTINGS_KEY = 'notification_settings_v1';
const NOTIFICATION_PROMPT_SHOWN_KEY = 'notification_prompt_shown_v1';

export interface NotificationSettings {
  enabled: boolean;
  hour: number;   // 0-23, default 21
  minute: number; // 0-59, default 0
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  hour: 21,
  minute: 0,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return JSON.parse(raw) as NotificationSettings;
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function setNotificationSettings(settings: NotificationSettings): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
}

export async function getNotificationPromptShown(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PROMPT_SHOWN_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function setNotificationPromptShown(shown: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_PROMPT_SHOWN_KEY, String(shown));
}
```

- [ ] **Step 2: Update clearAllOrders to also clear notification keys**

In `lib/storage.ts`, update the `clearAllOrders` function to also remove notification storage keys:

```typescript
export async function clearAllOrders(): Promise<void> {
  for (const platform of ALL_PLATFORMS) {
    await AsyncStorage.removeItem(orderKey(platform));
  }
  await AsyncStorage.removeItem(GAMIFICATION_KEY);
  await AsyncStorage.removeItem(NOTIFICATION_SETTINGS_KEY);
  await AsyncStorage.removeItem(NOTIFICATION_PROMPT_SHOWN_KEY);
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/storage.ts
git commit -m "feat: add notification settings storage and clear-all integration"
```

---

## Task 4: Create Notification Logic Module

**Files:**
- Create: `lib/notifications.ts`

This is the core logic module. It uses `expo-notifications` for scheduling and permissions, and reads/writes settings via the storage functions from Task 3.

- [ ] **Step 1: Create lib/notifications.ts**

```typescript
// lib/notifications.ts

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getRandomNotificationCopy } from './notificationCopy';
import {
  getNotificationSettings,
  setNotificationSettings,
  loadAllOrders,
  NotificationSettings,
} from './storage';

const NOTIFICATION_ID = 'daily-sync-reminder';
const CHANNEL_ID = 'daily-sync-reminder';

// ── Initialization ──────────────────────────────────────────────────────

export async function initNotifications(): Promise<void> {
  // Set how notifications behave when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  // Create Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Daily Sync Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

// ── Permission ──────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Scheduling ──────────────────────────────────────────────────────────

function getNextTriggerDate(hour: number, minute: number, skipToday: boolean): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  // If target is in the past today, or we should skip today, schedule for tomorrow
  if (target <= now || skipToday) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

async function hasSyncedToday(): Promise<boolean> {
  const { lastSyncedAt } = await loadAllOrders();
  if (!lastSyncedAt) return false;

  const syncDate = new Date(lastSyncedAt);
  const today = new Date();
  return (
    syncDate.getFullYear() === today.getFullYear() &&
    syncDate.getMonth() === today.getMonth() &&
    syncDate.getDate() === today.getDate()
  );
}

export async function scheduleNotification(settings?: NotificationSettings): Promise<void> {
  const s = settings ?? await getNotificationSettings();
  if (!s.enabled) return;

  // Cancel any existing notification first
  await cancelNotification();

  const syncedToday = await hasSyncedToday();
  const triggerDate = getNextTriggerDate(s.hour, s.minute, syncedToday);
  const copy = getRandomNotificationCopy();

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: copy.title,
      body: copy.body,
      data: { action: 'open_sync' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });
}

export async function cancelNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
}

// ── Check & Reschedule (called on app foreground + after sync) ───────

export async function checkAndReschedule(): Promise<void> {
  const settings = await getNotificationSettings();
  if (!settings.enabled) return;
  await scheduleNotification(settings);
}

// ── Settings helpers ────────────────────────────────────────────────────

export async function enableNotifications(hour: number = 21, minute: number = 0): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;

  const settings: NotificationSettings = { enabled: true, hour, minute };
  await setNotificationSettings(settings);
  await scheduleNotification(settings);
  return true;
}

export async function disableNotifications(): Promise<void> {
  await cancelNotification();
  const settings = await getNotificationSettings();
  await setNotificationSettings({ ...settings, enabled: false });
}

export async function updateNotificationTime(hour: number, minute: number): Promise<void> {
  const settings = await getNotificationSettings();
  if (!settings.enabled) return;

  const updated: NotificationSettings = { ...settings, hour, minute };
  await setNotificationSettings(updated);
  await scheduleNotification(updated);
}

// ── Next reminder info (for settings UI) ────────────────────────────────

export async function getNextReminderLabel(settings?: NotificationSettings): Promise<string | null> {
  const s = settings ?? await getNotificationSettings();
  if (!s.enabled) return null;

  const syncedToday = await hasSyncedToday();
  const triggerDate = getNextTriggerDate(s.hour, s.minute, syncedToday);

  const today = new Date();
  const isToday =
    triggerDate.getFullYear() === today.getFullYear() &&
    triggerDate.getMonth() === today.getMonth() &&
    triggerDate.getDate() === today.getDate();

  const timeStr = triggerDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return isToday ? `Today at ${timeStr}` : `Tomorrow at ${timeStr}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/notifications.ts
git commit -m "feat: add notification scheduling, permission, and reschedule logic"
```

---

## Task 5: Create First Sync Celebratory Modal

**Files:**
- Create: `components/first-sync-modal.tsx`

- [ ] **Step 1: Create the first-sync-modal component**

This is a full-screen modal overlay with a celebration UI and notification opt-in. It matches the existing dark theme and card styles from `platform-sync-webview.tsx`.

```typescript
// components/first-sync-modal.tsx

import { Colors } from '@/src/theme/colors';
import { enableNotifications } from '@/lib/notifications';
import { setNotificationPromptShown } from '@/lib/storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
} from 'react-native-reanimated';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

// Simple sparkle/star positions for the celebration effect
const SPARKLES = [
  { left: '15%', top: 20, delay: 0 },
  { left: '40%', top: 8, delay: 200 },
  { left: '65%', top: 24, delay: 100 },
  { left: '85%', top: 12, delay: 300 },
  { left: '25%', top: 36, delay: 150 },
  { left: '75%', top: 32, delay: 250 },
];

function Sparkle({ left, top, delay }: { left: string; top: number; delay: number }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
          withTiming(0.2, { duration: 600, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      )
    );
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.2, { duration: 600 }),
          withTiming(0.8, { duration: 600 })
        ),
        -1,
        true
      )
    );
  }, [delay, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.sparkle, { left: left as any, top }, style]}>
      <Ionicons name="sparkles" size={18} color={Colors.green} />
    </Animated.View>
  );
}

export default function FirstSyncModal({ visible, onDismiss }: Props) {
  const [permissionDenied, setPermissionDenied] = useState(false);

  const handleEnable = useCallback(async () => {
    const granted = await enableNotifications();
    await setNotificationPromptShown(true);
    if (!granted) {
      setPermissionDenied(true);
      return;
    }
    onDismiss();
  }, [onDismiss]);

  const handleMaybeLater = useCallback(async () => {
    await setNotificationPromptShown(true);
    onDismiss();
  }, [onDismiss]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Sparkle animation area */}
          <View style={styles.sparkleContainer}>
            {SPARKLES.map((s, i) => (
              <Sparkle key={i} {...s} />
            ))}
            <View style={styles.trophyCircle}>
              <Ionicons name="trophy" size={36} color={Colors.green} />
            </View>
          </View>

          <Text style={styles.headline}>Your first sync is done!</Text>

          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>+50 XP</Text>
            <Text style={styles.xpLabel}>First Sync Bonus</Text>
          </View>

          <Text style={styles.pitch}>
            We can remind you each evening to sync — tracking your spends daily helps you stay on budget and unlock badges faster.
          </Text>

          {permissionDenied && (
            <View style={styles.deniedBanner}>
              <Ionicons name="information-circle" size={16} color={Colors.textMuted} />
              <Text style={styles.deniedText}>
                Notifications are blocked. Enable them in your device's Settings app to receive reminders.
              </Text>
            </View>
          )}

          <Pressable style={styles.enableButton} onPress={handleEnable}>
            <Ionicons name="notifications" size={18} color={Colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.enableButtonText}>Enable Reminders</Text>
          </Pressable>

          <Pressable style={styles.laterButton} onPress={handleMaybeLater}>
            <Text style={styles.laterButtonText}>Maybe Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 8, 0.96)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 28,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  sparkleContainer: {
    width: '100%',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sparkle: {
    position: 'absolute',
  },
  trophyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.greenBg,
    borderWidth: 2,
    borderColor: Colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textHeading,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  xpBadge: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    alignItems: 'center',
    marginBottom: 16,
  },
  xpText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.green,
  },
  xpLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  pitch: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  deniedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.bgOverlay,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  deniedText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: Colors.greenDark,
  },
  enableButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  laterButton: {
    marginTop: 10,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  laterButtonText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/first-sync-modal.tsx
git commit -m "feat: add first-sync celebratory modal with notification opt-in"
```

---

## Task 6: Integrate First Sync Modal into Explore Screen

**Files:**
- Modify: `app/(tabs)/explore.tsx`

- [ ] **Step 1: Add first-sync modal state and rendering**

Add imports at the top of `explore.tsx`:

```typescript
import FirstSyncModal from '@/components/first-sync-modal';
import { getNotificationPromptShown } from '@/lib/storage';
import { checkAndReschedule } from '@/lib/notifications';
```

Add state inside `SyncScreen` component (after the existing `useState` on line 23):

```typescript
const [showFirstSyncModal, setShowFirstSyncModal] = useState(false);
```

Modify the `onComplete` callback in the `PlatformSyncWebView` component (approximately line 90-97 of `explore.tsx`). The current code is:

```typescript
          onComplete={() => {
            const nextIndex = platformIndex + 1;
            if (nextIndex < platforms.length) {
              setState({ status: 'syncing', platformIndex: nextIndex, platforms });
            } else {
              setState({ status: 'done', platforms });
            }
          }}
```

Change it to `async` and add notification logic. Call `checkAndReschedule()` after every platform sync (not just the final one) to update the notification schedule as soon as any sync completes. Add the first-sync modal check only when all platforms are done:

```typescript
          onComplete={async () => {
            // Reschedule notification after every platform sync
            checkAndReschedule();

            const nextIndex = platformIndex + 1;
            if (nextIndex < platforms.length) {
              setState({ status: 'syncing', platformIndex: nextIndex, platforms });
            } else {
              setState({ status: 'done', platforms });
              // Check if we should show first-sync celebration
              const promptShown = await getNotificationPromptShown();
              if (!promptShown) {
                setShowFirstSyncModal(true);
              }
            }
          }}
```

**Important:** Match the actual file's indentation (12-space prefix for the callback body). Do not use find-and-replace — use the Edit tool targeting the `onComplete` callback at approximately lines 90-97.

In the `// status === 'done'` return block, add the `FirstSyncModal` component right before the closing `</SafeAreaView>`:

```tsx
// status === 'done'
return (
  <SafeAreaView style={styles.container} edges={['top']}>
    <View style={styles.centered}>
      <Text style={styles.doneTitle}>All syncs complete</Text>
      <Text style={styles.doneSubtitle}>
        Check the Dashboard for your updated spending data.
      </Text>
    </View>
    <FirstSyncModal
      visible={showFirstSyncModal}
      onDismiss={() => setShowFirstSyncModal(false)}
    />
  </SafeAreaView>
);
```

- [ ] **Step 2: Commit**

```bash
git add app/(tabs)/explore.tsx
git commit -m "feat: show first-sync modal and reschedule notification after sync"
```

---

## Task 7: Add Root Layout Listeners

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add AppState foreground listener and notification tap handler**

Update imports **additively** (do not replace existing imports — add to them):

- Add `useRef` to the existing `react` import: `import { useEffect, useRef, useState } from 'react';`
- Add `AppState` to the existing `react-native` import: `import { View, ActivityIndicator, AppState } from 'react-native';`
- Add `useRouter` to the existing `expo-router` import: `import { Stack, useRouter } from 'expo-router';`
- Add two new imports:

```typescript
import * as Notifications from 'expo-notifications';
import { initNotifications, checkAndReschedule } from '@/lib/notifications';
```

Inside the `RootLayout` component, after the existing `useEffect` for migration, add:

```typescript
const router = useRouter();
const appState = useRef(AppState.currentState);

// Initialize notifications + foreground listener
useEffect(() => {
  initNotifications();

  const subscription = AppState.addEventListener('change', (nextAppState) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      checkAndReschedule();
    }
    appState.current = nextAppState;
  });

  return () => subscription.remove();
}, []);

// Handle notification tap → navigate to Sync tab
useEffect(() => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.action === 'open_sync') {
      router.push('/(tabs)/explore');
    }
  });

  return () => subscription.remove();
}, [router]);
```

- [ ] **Step 2: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: add AppState listener for notification reschedule and tap deep-link"
```

---

## Task 8: Add Notifications Section to Settings

**Files:**
- Modify: `app/(tabs)/settings.tsx`

- [ ] **Step 1: Add imports and state**

Add to the imports at the top of `settings.tsx`:

```typescript
import { Switch } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  getNotificationSettings,
  NotificationSettings,
} from '@/lib/storage';
import {
  enableNotifications,
  disableNotifications,
  updateNotificationTime,
  getNextReminderLabel,
  cancelNotification,
} from '@/lib/notifications';
```

Add state inside `SettingsScreen` (after existing state declarations):

```typescript
const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
  enabled: false,
  hour: 21,
  minute: 0,
});
const [nextReminder, setNextReminder] = useState<string | null>(null);
const [showTimePicker, setShowTimePicker] = useState(false);
```

- [ ] **Step 2: Load notification settings in loadSettings**

Update the `loadSettings` callback to also load notification settings. Add after the existing `setAccounts` line:

```typescript
const notif = await getNotificationSettings();
setNotifSettings(notif);
const label = await getNextReminderLabel(notif);
setNextReminder(label);
```

- [ ] **Step 3: Add notification toggle and time picker handlers**

Add these handler functions inside the component (after `handleClearAll`):

```typescript
const handleNotifToggle = async (value: boolean) => {
  if (value) {
    const granted = await enableNotifications(notifSettings.hour, notifSettings.minute);
    if (!granted) return;
    const updated = { ...notifSettings, enabled: true };
    setNotifSettings(updated);
    setNextReminder(await getNextReminderLabel(updated));
  } else {
    await disableNotifications();
    setNotifSettings({ ...notifSettings, enabled: false });
    setNextReminder(null);
  }
};

const handleTimeChange = async (_event: any, selectedDate?: Date) => {
  setShowTimePicker(false);
  if (!selectedDate) return;
  const hour = selectedDate.getHours();
  const minute = selectedDate.getMinutes();
  await updateNotificationTime(hour, minute);
  const updated = { ...notifSettings, hour, minute };
  setNotifSettings(updated);
  setNextReminder(await getNextReminderLabel(updated));
};
```

- [ ] **Step 4: Update handleClearAll to also cancel notifications**

In the `handleClearAll` `onPress` callback (lines 97-116 of `settings.tsx`), add after the `for (const p of ALL_PLATFORMS) { await requestSessionReset(p); }` loop and **before** `await loadSettings();`:

```typescript
await cancelNotification();
setNotifSettings({ enabled: false, hour: 21, minute: 0 });
setNextReminder(null);
```

The full `onPress` should become:
```typescript
onPress: async () => {
  await clearAllOrders();
  for (const p of ALL_PLATFORMS) {
    await requestSessionReset(p);
  }
  await cancelNotification();
  setNotifSettings({ enabled: false, hour: 21, minute: 0 });
  setNextReminder(null);
  await loadSettings();
},
```

- [ ] **Step 5: Add Notifications section JSX**

Insert between the `{/* Accounts section */}` closing `</View>` and `{/* Data section */}` comment:

```tsx
{/* Notifications section */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
  <View style={styles.notifRow}>
    <Text style={styles.notifLabel}>Enable Reminders</Text>
    <Switch
      value={notifSettings.enabled}
      onValueChange={handleNotifToggle}
      trackColor={{ false: Colors.bgOverlay, true: Colors.greenDark }}
      thumbColor={notifSettings.enabled ? Colors.green : Colors.textMuted}
    />
  </View>
  <Pressable
    style={[styles.notifRow, !notifSettings.enabled && styles.notifRowDisabled]}
    onPress={() => notifSettings.enabled && setShowTimePicker(true)}
    disabled={!notifSettings.enabled}
  >
    <Text style={[styles.notifLabel, !notifSettings.enabled && styles.notifTextDisabled]}>
      Reminder Time
    </Text>
    <Text style={[styles.notifValue, !notifSettings.enabled && styles.notifTextDisabled]}>
      {new Date(0, 0, 0, notifSettings.hour, notifSettings.minute).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}
    </Text>
  </Pressable>
  {nextReminder && (
    <View style={styles.notifRow}>
      <Text style={styles.notifLabel}>Next Reminder</Text>
      <Text style={styles.notifHint}>{nextReminder}</Text>
    </View>
  )}
  {showTimePicker && (
    <DateTimePicker
      value={new Date(0, 0, 0, notifSettings.hour, notifSettings.minute)}
      mode="time"
      is24Hour={false}
      display="spinner"
      onChange={handleTimeChange}
      themeVariant="dark"
    />
  )}
</View>
```

- [ ] **Step 6: Add styles for the notification section**

Add to the `StyleSheet.create` at the bottom:

```typescript
notifRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: 6,
},
notifRowDisabled: {
  opacity: 0.4,
},
notifLabel: {
  fontSize: 14,
  fontWeight: '600',
  color: Colors.textPrimary,
},
notifValue: {
  fontSize: 14,
  color: Colors.green,
  fontWeight: '600',
},
notifTextDisabled: {
  color: Colors.textDisabled,
},
notifHint: {
  fontSize: 13,
  color: Colors.textMuted,
},
```

- [ ] **Step 7: Commit**

```bash
git add app/(tabs)/settings.tsx
git commit -m "feat: add Notifications section to settings with toggle, time picker, next reminder"
```

---

## Task 9: Rebuild Native App & Manual Test

- [ ] **Step 1: Rebuild the dev client**

Since `expo-notifications` and `@react-native-community/datetimepicker` require native modules:

```bash
npx expo prebuild --clean
npx expo run:android  # or npx expo run:ios
```

- [ ] **Step 2: Manual test checklist**

Test these flows on device:

1. **First sync flow:** Sync for the first time → celebratory modal appears → tap "Enable Reminders" → OS permission prompt → notification scheduled
2. **Maybe Later flow:** Dismiss modal → check Settings → Notifications section shows toggle OFF → toggle ON → permission prompt → works
3. **Notification fires:** Set reminder time to 1 minute from now → wait → notification appears with random copy
4. **Tap notification:** Tap the notification → app opens to Sync tab
5. **Skip if synced today:** Sync → notification for today should be cancelled → Next Reminder shows "Tomorrow at..."
6. **Change time:** In settings, change time → Next Reminder updates
7. **Toggle off:** Turn off notifications → no more reminders
8. **Clear all data:** Clear all data → notification settings reset → first-sync modal will show again on next sync

- [ ] **Step 3: Final commit if any fixes needed**
