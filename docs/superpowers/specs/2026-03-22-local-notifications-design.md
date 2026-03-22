# Local Notification System — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**App:** QC Spend Tracker v2.0 (blinkit-analyser)

## Overview

A local notification system that reminds users to sync their order data daily. Notifications fire at a user-configurable time (default 9 PM), use rotating copy emphasizing the importance of tracking spends, and are gated behind user consent requested after the first successful sync.

## Requirements

1. Send a daily local notification reminding the user to sync
2. Default time: 9 PM, configurable in settings
3. Skip notification if the user already synced today (calendar-day based)
4. Ask for notification permission after first successful sync via a celebratory interstitial
5. Provide a "Notifications" section in settings to toggle on/off, change time, and see next scheduled reminder
6. Use 10+ rotating message variants with mixed casual/motivational tone

## Technical Approach

**Library:** `expo-notifications` for scheduling and permissions. `@react-native-community/datetimepicker` for the native time picker in settings.

**No new state management patterns.** Follows the existing direct-AsyncStorage pattern used throughout the app.

---

## 1. Notification Scheduling & Logic

### Core Flow

1. After first successful sync → show celebratory interstitial with notification opt-in
2. If user enables → request OS permission via `expo-notifications`, schedule a daily notification at 9 PM (default)
3. Each day at the scheduled time, the OS fires the notification
4. When the app opens (or sync completes), check if the user synced today (calendar day). If yes → cancel today's pending notification and ensure tomorrow's is scheduled
5. If the user changes the time in settings → cancel existing schedule, reschedule at new time

### Calendar-Day Skip Logic

- On each app foreground + after each successful sync, compare `lastSyncedAt` date against today's date
- If same calendar day → cancel any pending notification for today
- Always ensure tomorrow's notification is scheduled

### Notification Identifier

A single repeating daily trigger with a fixed identifier: `"daily-sync-reminder"`. Cancel/reschedule by this identifier.

### Copy Rotation

Pick a random message from the pool each time we schedule. Since we reschedule daily (after sync or app open), the copy naturally rotates.

---

## 2. First Sync Celebratory Interstitial

### Trigger

Fires once, immediately after the first successful sync completes (any platform). Tracked via AsyncStorage key `notification_prompt_shown_v1` (boolean).

### UI — Full-screen modal (dark themed)

- Confetti/sparkle animation at the top (Reanimated-based particle effect or static celebratory illustration)
- **"Your first sync is done!"** headline
- XP award display: surfaces the existing 50 XP first-sync award
- Value pitch: "We can remind you each evening to sync — tracking your spends daily helps you stay on budget and unlock badges faster."
- **"Enable Reminders"** button (primary, filled) → requests OS notification permission → schedules daily notification → saves preference → dismisses modal
- **"Maybe Later"** button (secondary, text-only) → dismisses modal, does NOT save as permanently declined (user can enable in settings later)

### Permission Denied Handling

If OS permission is denied, show a brief inline message explaining how to enable notifications in system settings. Save preference as disabled.

### File

New component: `components/first-sync-modal.tsx`
Triggered from `app/(tabs)/explore.tsx` when sync state transitions to `done` and the prompt hasn't been shown yet.

---

## 3. Notification Copy Pool

Stored in `lib/notificationCopy.ts` as a simple exported array.

**Title for all notifications:** "QC Spend Tracker"

### Casual/Playful

1. "Your wallet called — it wants an update! 📱"
2. "Quick-commerce never sleeps, but your tracker shouldn't either 🛒"
3. "Blinkit delivered, now let's track what it cost 💸"
4. "2 minutes to sync, 24 hours of clarity ⏱️"
5. "Your spends are piling up — time for a quick sync!"

### Motivational/Serious

6. "Tracking daily is the first step to spending smarter 📊"
7. "You can't improve what you don't measure — sync now"
8. "Small habits, big savings. Don't break your sync streak 🔥"
9. "Know where your money goes. Sync your orders today."
10. "Stay ahead of your budget — a quick sync keeps you in control"

### Gamification-tied

11. "Your badges are waiting — sync to unlock progress 🏅"
12. "Don't let your XP streak go cold! Sync now to earn points ⚡"
13. "A daily sync keeps your quests on track 🎯"

---

## 4. Settings UI — Notifications Section

### Location

New section in `app/(tabs)/settings.tsx`, placed between "Monthly Budget" and "Data Management" sections.

### Section Header

"Notifications"

### Controls

| Control | UI Element | Behavior |
|---------|-----------|----------|
| **Enable Reminders** | Toggle switch | On → requests permission if not granted, schedules notification. Off → cancels all scheduled notifications. |
| **Reminder Time** | Tappable row showing current time (e.g., "9:00 PM") | Opens native time picker. On change → reschedules notification at new time. |
| **Next Reminder** | Info row (non-interactive) | Shows "Today at 9:00 PM" or "Tomorrow at 9:00 PM" based on whether today's notification has been skipped. Grayed out if notifications disabled. |

### Time Picker

`@react-native-community/datetimepicker` for native platform feel.

### Visual Style

Matches existing settings sections — same dark card background, same text styles, same section header pattern used for "Platform Selection" and "Monthly Budget".

---

## 5. Storage & Data Architecture

### New AsyncStorage Keys

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `notification_settings_v1` | `{ enabled: boolean; hour: number; minute: number }` | `{ enabled: false, hour: 21, minute: 0 }` | User's notification preferences |
| `notification_prompt_shown_v1` | `boolean` | `false` | Whether first-sync interstitial has been shown |

### New Files

| File | Purpose |
|------|---------|
| `lib/notificationCopy.ts` | Array of 13+ notification message variants |
| `lib/notifications.ts` | All notification logic: schedule, cancel, reschedule, permission request, check-and-skip |
| `components/first-sync-modal.tsx` | Celebratory interstitial with notification opt-in |

### Modified Files

| File | Change |
|------|--------|
| `app/(tabs)/explore.tsx` | After sync `done` → check if prompt shown → show first-sync modal |
| `app/(tabs)/settings.tsx` | Add Notifications section with toggle, time picker, next reminder info |
| `app/_layout.tsx` | On app foreground → call skip-if-synced-today logic |
| `lib/storage.ts` | Add getter/setter for new AsyncStorage keys |

### Dependencies Added

| Package | Purpose |
|---------|---------|
| `expo-notifications` | Local notification scheduling + OS permission management |
| `@react-native-community/datetimepicker` | Native time picker for settings |
