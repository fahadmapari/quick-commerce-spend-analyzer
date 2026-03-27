import { getProvider } from '@/lib/platforms';
import {
  getSelectedPlatforms,
  hasCompletedPlatformSelection,
  markPlatformSelectionComplete,
} from '@/lib/platformSettings';
import { PlatformId, PLATFORM_CONFIGS } from '@/types/platform';
import { Colors } from '@/src/theme/colors';
import PlatformSelectionModal from '@/components/platform-selection-modal';
import PlatformSyncWebView from '@/components/platform-sync-webview';
import FirstSyncModal from '@/components/first-sync-modal';
import { showSyncInterstitialIfEligible } from '@/lib/ads';
import { getNotificationPromptShown } from '@/lib/storage';
import { checkAndReschedule } from '@/lib/notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SyncState =
  | { status: 'loading' }
  | { status: 'selecting_platforms' }
  | { status: 'syncing'; platformIndex: number; platforms: PlatformId[] }
  | { status: 'done'; platforms: PlatformId[] };

export default function SyncScreen() {
  const [state, setState] = useState<SyncState>({ status: 'loading' });
  const [showFirstSyncModal, setShowFirstSyncModal] = useState(false);

  const beginSyncing = useCallback(async (platforms: PlatformId[]) => {
    try {
      await showSyncInterstitialIfEligible();
    } catch (error) {
      console.error('Failed to present sync interstitial:', error);
    }

    setState({ status: 'syncing', platformIndex: 0, platforms });
  }, []);

  const startSyncFlow = useCallback(async () => {
    const completed = await hasCompletedPlatformSelection();
    if (!completed) {
      setState({ status: 'selecting_platforms' });
      return;
    }

    const platforms = await getSelectedPlatforms();
    if (platforms.length === 0) {
      setState({ status: 'selecting_platforms' });
      return;
    }

    await beginSyncing(platforms);
  }, [beginSyncing]);

  useFocusEffect(
    useCallback(() => {
      startSyncFlow();
      return undefined;
    }, [startSyncFlow])
  );

  const handlePlatformSelection = async (platforms: PlatformId[]) => {
    await markPlatformSelectionComplete(platforms);
    await beginSyncing(platforms);
  };

  if (state.status === 'loading') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'selecting_platforms') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <PlatformSelectionModal
          visible
          onConfirm={handlePlatformSelection}
        />
      </SafeAreaView>
    );
  }

  if (state.status === 'syncing') {
    const { platformIndex, platforms } = state;
    const currentPlatform = platforms[platformIndex];
    const provider = getProvider(currentPlatform);
    const config = PLATFORM_CONFIGS[currentPlatform];
    const total = platforms.length;
    const label = total > 1
      ? `${config.displayName.toUpperCase()} SYNC (${platformIndex + 1}/${total})`
      : `${config.displayName.toUpperCase()} SYNC`;

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <PlatformSyncWebView
          key={currentPlatform}
          provider={provider}
          label={label}
          onComplete={async () => {
            checkAndReschedule();

            const nextIndex = platformIndex + 1;
            if (nextIndex < platforms.length) {
              setState({ status: 'syncing', platformIndex: nextIndex, platforms });
            } else {
              setState({ status: 'done', platforms });
              const promptShown = await getNotificationPromptShown();
              if (!promptShown) {
                setShowFirstSyncModal(true);
              }
            }
          }}
          onError={() => {
            // Stay on current platform's sync screen — user can retry from there
          }}
        />
      </SafeAreaView>
    );
  }

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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  doneTitle: {
    color: Colors.textHeading,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  doneSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
