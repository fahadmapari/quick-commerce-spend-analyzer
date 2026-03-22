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
  { title: NOTIFICATION_TITLE, body: 'Your spends are piling up — time for a quick sync!' },

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
