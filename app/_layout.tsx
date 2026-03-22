import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';
import { runMigrationIfNeeded } from '@/lib/migration';
import { initNotifications, checkAndReschedule } from '@/lib/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  const router = useRouter();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    runMigrationIfNeeded().finally(() => setReady(true));
  }, []);

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

  if (!ready) {
    return (
      <ThemeProvider value={DarkTheme}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
        <StatusBar style="light" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="xp-level" options={{ title: 'Level & XP', headerBackTitle: 'Back' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
