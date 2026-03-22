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
      shouldShowBanner: false,
      shouldShowList: false,
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
  try {
    const settings = await getNotificationSettings();
    if (!settings.enabled) return;
    await scheduleNotification(settings);
  } catch {
    // Silently ignore — notification scheduling is non-critical
  }
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
