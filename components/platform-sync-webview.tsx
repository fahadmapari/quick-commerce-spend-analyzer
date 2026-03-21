import { PlatformProvider } from '@/lib/platforms/types';
import {
  getSessionResetNonce,
  subscribeToSessionReset,
} from '@/lib/sessionReset';
import {
  clearOrdersOnly,
  clearAllOrders,
  mergeOrders,
  getGamificationState,
  getStoredAccountIdentity,
  saveAccountIdentity,
} from '@/lib/storage';
import { awardXpBatch, makeXpEvent, recordSuccessfulSync } from '@/lib/gamification';
import { XpEvent } from '@/types/gamification';
import { Colors } from '@/src/theme/colors';
import { AutomationPhase, RawOrder, WebViewBridgeMessage } from '@/types/automation';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

const WATCHDOG_MS = 30000;

const USER_INPUT_PHASES = new Set<AutomationPhase>([
  'requesting_location_permission',
  'awaiting_phone',
  'awaiting_otp',
  'awaiting_manual_location',
]);

const AUTOMATED_PHASES = new Set<AutomationPhase>([
  'booting',
  'checking_session',
  'navigating_to_orders',
  'extracting',
]);

interface SyncResult {
  added: number;
  total: number;
  summary: string;
  xpGains: XpEvent[];
}

interface Props {
  provider: PlatformProvider;
  onComplete: (result: SyncResult) => void;
  onError: (error: string) => void;
  label?: string; // e.g. "Syncing Blinkit (1/2)"
}

export default function PlatformSyncWebView({ provider, onComplete, onError, label }: Props) {
  const webViewRef = useRef<WebView>(null);
  const watchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledResetNonceRef = useRef(0);
  const forceFetchRunRef = useRef(false);
  const pendingIdentityRef = useRef<string | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<AutomationPhase>('booting');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequiresUserAction, setErrorRequiresUserAction] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(provider.config.url);
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const [manualLocationMode, setManualLocationMode] = useState(false);
  const [webViewInstanceKey, setWebViewInstanceKey] = useState(0);
  const [useIncognitoWebView, setUseIncognitoWebView] = useState(false);
  const [xpGains, setXpGains] = useState<XpEvent[]>([]);
  const [pendingOrders, setPendingOrders] = useState<RawOrder[] | null>(null);
  const [showAccountSwitchModal, setShowAccountSwitchModal] = useState(false);

  const showWebView = USER_INPUT_PHASES.has(phase) || (phase === 'error' && errorRequiresUserAction);
  const showOverlay = !showWebView || phase === 'success' || (phase === 'error' && !errorRequiresUserAction);

  const phaseTitle = useMemo(() => provider.getPhaseTitle(phase), [phase, provider]);
  const phaseSubtitle = useMemo(
    () => provider.getPhaseSubtitle(phase, statusDetail, syncProgress, syncResult, errorMessage),
    [errorMessage, phase, provider, statusDetail, syncProgress, syncResult]
  );

  const eyebrowText = label || `${provider.config.displayName.toUpperCase()} SYNC`;

  const clearWatchdog = useCallback(() => {
    if (watchdogTimeoutRef.current) {
      clearTimeout(watchdogTimeoutRef.current);
      watchdogTimeoutRef.current = null;
    }
  }, []);

  const transitionTo = useCallback(
    (nextPhase: AutomationPhase, detail?: string | null) => {
      setPhase(nextPhase);
      setStatusDetail(detail ?? null);

      if (nextPhase === 'success' || nextPhase === 'error' || USER_INPUT_PHASES.has(nextPhase)) {
        clearWatchdog();
      } else if (AUTOMATED_PHASES.has(nextPhase)) {
        clearWatchdog();
        watchdogTimeoutRef.current = setTimeout(() => {
          setErrorRequiresUserAction(false);
          setErrorMessage(`Automation timed out while ${provider.config.displayName} was loading. Please retry.`);
          setStatusDetail('Automation timed out');
          setPhase('error');
        }, WATCHDOG_MS);
      }
    },
    [clearWatchdog, provider.config.displayName]
  );

  const injectAutomationBridge = useCallback((command?: object) => {
    if (!webViewRef.current) return;
    webViewRef.current.injectJavaScript(provider.getAutomationBridgeScript());
    if (command) {
      webViewRef.current.injectJavaScript(provider.buildCommandScript(command));
    }
  }, [provider]);

  const startAutomationCycle = useCallback(() => {
    pendingIdentityRef.current = null;
    setPendingOrders(null);
    setShowAccountSwitchModal(false);
    setSyncProgress(null);
    setSyncResult(null);
    setErrorMessage(null);
    setErrorRequiresUserAction(false);
    setManualLocationMode(false);
    transitionTo('booting', `Opening ${provider.config.displayName}`);

    if (webViewLoaded) {
      injectAutomationBridge({ type: 'RESTART_AUTOMATION' });
    }
  }, [injectAutomationBridge, provider.config.displayName, transitionTo, webViewLoaded]);

  const performWebViewSessionReset = useCallback((nonce: number) => {
    if (nonce <= handledResetNonceRef.current) return;
    handledResetNonceRef.current = nonce;

    clearWatchdog();
    setManualLocationMode(false);
    setSyncProgress(null);
    setSyncResult(null);
    setErrorMessage(null);
    setErrorRequiresUserAction(false);
    setUseIncognitoWebView(true);

    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(provider.getSessionResetScript());
      webViewRef.current.clearCache(true);
      webViewRef.current.clearHistory?.();
      webViewRef.current.clearFormData?.();
    }

    setWebViewLoaded(false);
    setWebViewInstanceKey(nonce);
    transitionTo('booting', `Resetting ${provider.config.displayName} session`);
  }, [clearWatchdog, provider, transitionTo]);

  const handleManualLocationFallback = useCallback((reason: string) => {
    setErrorMessage(null);
    setErrorRequiresUserAction(false);
    setManualLocationMode(true);
    injectAutomationBridge({ type: 'ENTER_MANUAL_LOCATION_MODE' });
    transitionTo('awaiting_manual_location', reason);
  }, [injectAutomationBridge, transitionTo]);

  const handleRetry = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    startAutomationCycle();
  }, [startAutomationCycle]);

  const handleForceFetch = useCallback(async () => {
    await clearOrdersOnly(provider.id);
    forceFetchRunRef.current = true;
    setSyncResult(null);
    setSyncProgress(null);
    setErrorMessage(null);
    startAutomationCycle();
  }, [provider.id, startAutomationCycle]);

  // Session reset subscription
  useEffect(() => {
    let active = true;

    getSessionResetNonce(provider.id).then((nonce) => {
      if (!active || nonce <= handledResetNonceRef.current) return;
      performWebViewSessionReset(nonce);
    });

    const unsubscribe = subscribeToSessionReset(provider.id, (nonce) => {
      performWebViewSessionReset(nonce);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [performWebViewSessionReset, provider.id]);

  // Start on mount
  useEffect(() => {
    startAutomationCycle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animations
  useEffect(() => {
    const progressLoop = Animated.loop(
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    const dotsLoop = Animated.loop(
      Animated.timing(dotAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    progressLoop.start();
    dotsLoop.start();

    return () => {
      progressLoop.stop();
      dotsLoop.stop();
      clearWatchdog();
    };
  }, [clearWatchdog, dotAnim, progressAnim]);

  const onNavigationStateChange = (navState: WebViewNavigation) => {
    setCurrentUrl(navState.url);
  };

  const onLoadStart = () => {
    setWebViewLoaded(false);
    transitionTo('booting', `Opening ${provider.config.displayName}`);
  };

  const onLoadEnd = () => {
    setWebViewLoaded(true);
    injectAutomationBridge({ type: 'RECHECK' });
  };

  // Manual location mode polling
  useEffect(() => {
    if (!manualLocationMode) return;
    if (phase !== 'awaiting_manual_location') return;

    const timeout = setTimeout(() => {
      injectAutomationBridge({ type: 'RECHECK' });
    }, 1000);

    return () => clearTimeout(timeout);
  }, [currentUrl, injectAutomationBridge, manualLocationMode, phase]);

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as WebViewBridgeMessage;

      if (data.type === 'AUTOMATION_STATE') {
        if (manualLocationMode && data.phase === 'requesting_location_permission') {
          return;
        }
        if (manualLocationMode && data.phase !== 'awaiting_manual_location') {
          setManualLocationMode(false);
          injectAutomationBridge({ type: 'EXIT_MANUAL_LOCATION_MODE' });
        }
        transitionTo(data.phase, data.detail);
        return;
      }

      if (data.type === 'LOCATION_PERMISSION_REQUIRED') {
        setManualLocationMode(false);
        transitionTo(
          'requesting_location_permission',
          'Tap "Use my location" and allow the browser prompt, or select manually.'
        );
        return;
      }

      if (data.type === 'LOCATION_MANUAL_REQUIRED') {
        handleManualLocationFallback('Please pick the location manually.');
        return;
      }

      if (data.type === 'ACCOUNT_IDENTITY') {
        pendingIdentityRef.current = data.identity;
        return;
      }

      if (data.type === 'SCROLL_PROGRESS') {
        setSyncProgress(data.count);
        transitionTo('extracting', `Scanning ${data.count} orders`);
        return;
      }

      if (data.type === 'ORDERS_EXTRACTED') {
        clearWatchdog();
        setSyncProgress(null);

        const incomingIdentity = pendingIdentityRef.current;
        const storedIdentity = await getStoredAccountIdentity(provider.id);

        if (incomingIdentity && storedIdentity && incomingIdentity !== storedIdentity) {
          setPendingOrders(data.orders);
          setShowAccountSwitchModal(true);
          return;
        }

        await finishSync(data.orders, incomingIdentity);
        return;
      }

      if (data.type === 'AUTOMATION_ERROR') {
        clearWatchdog();
        forceFetchRunRef.current = false;
        setErrorRequiresUserAction(Boolean(data.requiresUserAction));
        setErrorMessage(data.message);
        transitionTo('error', data.message);
      }
    } catch {
      clearWatchdog();
      forceFetchRunRef.current = false;
      setErrorRequiresUserAction(false);
      setErrorMessage(`The ${provider.config.displayName} bridge sent an unreadable message.`);
      transitionTo('error', 'Bridge parsing failed');
    }
  };

  const finishSync = async (orders: RawOrder[], identity: string | null) => {
    const { added, total } = await mergeOrders(
      provider.id,
      orders,
      (raw) => provider.parseDate(raw)
    );
    if (identity) await saveAccountIdentity(provider.id, identity);

    const summary = forceFetchRunRef.current
      ? `Fetched ${total} order${total === 1 ? '' : 's'} from scratch`
      : `Synced ${added} new order${added === 1 ? '' : 's'} (${total} total)`;
    forceFetchRunRef.current = false;
    setSyncResult(summary);
    transitionTo('success', summary);

    // Award sync XP
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const xpEvents: XpEvent[] = [];
    const gamState = await getGamificationState();

    if (!gamState.xpEvents.some((e) => e.id === 'sync:first_success')) {
      xpEvents.push(makeXpEvent('sync:first_success', 'first_sync_success', 50));
    }
    xpEvents.push(makeXpEvent(`sync:daily:${dateKey}:${provider.id}`, 'daily_sync_success', 10, { date: dateKey, platform: provider.id }));
    if (added > 0) {
      xpEvents.push(makeXpEvent(`sync:new_orders:${dateKey}:${provider.id}`, 'sync_with_new_orders', 15, { added, date: dateKey, platform: provider.id }));
    }

    const { awarded } = await awardXpBatch(xpEvents);
    await recordSuccessfulSync(dateKey);
    if (awarded.length > 0) setXpGains(awarded);

    onComplete({ added, total, summary, xpGains: awarded });
  };

  const barTranslateX = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });

  const dotOpacity = (offset: number) =>
    dotAnim.interpolate({
      inputRange: [0, 0.25, 0.5, 0.75, 1],
      outputRange: [
        offset === 0 ? 1 : 0.3,
        offset === 1 ? 1 : 0.3,
        offset === 2 ? 1 : 0.3,
        0.3,
        offset === 0 ? 1 : 0.3,
      ],
    });

  return (
    <View style={styles.container}>
      {showWebView && (
        <View style={styles.guidanceContainer}>
          <View style={styles.guidanceBanner}>
            <Text style={styles.guidanceTitle}>{phaseTitle}</Text>
            <Text style={styles.guidanceBody}>{phaseSubtitle}</Text>
          </View>
        </View>
      )}

      <View style={styles.webViewFrame} pointerEvents={showWebView ? 'auto' : 'none'}>
        <WebView
          key={webViewInstanceKey}
          ref={webViewRef}
          source={{ uri: provider.config.url }}
          style={[styles.webView, !showWebView && styles.hiddenWebView]}
          javaScriptEnabled
          incognito={useIncognitoWebView}
          geolocationEnabled={Platform.OS === 'android'}
          startInLoadingState
          injectedJavaScriptBeforeContentLoaded={provider.getAutomationBridgeScript()}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.green} />
            </View>
          )}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onNavigationStateChange={onNavigationStateChange}
          onMessage={onMessage}
        />
      </View>

      {showOverlay && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <View style={styles.overlayHeader}>
              {phase === 'success' ? (
                <View style={[styles.iconBadge, styles.iconBadgeSuccess]}>
                  <Ionicons name="checkmark" size={22} color={Colors.white} />
                </View>
              ) : phase === 'error' ? (
                <View style={[styles.iconBadge, styles.iconBadgeError]}>
                  <Ionicons name="alert" size={20} color={Colors.white} />
                </View>
              ) : (
                <View style={styles.iconBadge}>
                  <Ionicons name="sync" size={20} color={Colors.white} />
                </View>
              )}

              <Text style={styles.eyebrow}>{eyebrowText}</Text>
              <Text style={styles.title}>{phaseTitle}</Text>
              <Text style={styles.subtitle}>{phaseSubtitle}</Text>
            </View>

            {phase !== 'success' && phase !== 'error' && (
              <View style={styles.animationBlock}>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressBeam,
                      { transform: [{ translateX: barTranslateX }] },
                    ]}
                  />
                </View>
                <View style={styles.dotRow}>
                  {[0, 1, 2].map((dot) => (
                    <Animated.View
                      key={dot}
                      style={[
                        styles.dot,
                        {
                          opacity: dotOpacity(dot),
                          transform: [{
                            scale: dotAnim.interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: [0.9, dot === 1 ? 1.25 : 1.05, 0.9],
                            }),
                          }],
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.overlayFooter}>
              <Text style={styles.footerLabel}>LIVE STATUS</Text>
              <Text style={styles.footerValue}>
                {phase === 'extracting' && syncProgress !== null
                  ? `${syncProgress} orders scanned`
                  : currentUrl}
              </Text>
            </View>

            {phase === 'error' && (
              <Pressable style={styles.primaryButton} onPress={handleRetry}>
                <Text style={styles.primaryButtonText}>Retry sync</Text>
              </Pressable>
            )}

            {phase === 'success' && (
              <>
                {xpGains.length > 0 && (
                  <View style={styles.xpBanner}>
                    <Text style={styles.xpBannerAmount}>
                      +{xpGains.reduce((s, e) => s + e.xp, 0)} XP
                    </Text>
                    <Text style={styles.xpBannerDetail}>
                      {xpGains.map((e) => {
                        switch (e.reason) {
                          case 'first_sync_success': return 'First Sync';
                          case 'daily_sync_success': return 'Daily Sync';
                          case 'sync_with_new_orders': return 'New Orders';
                          default: return 'XP';
                        }
                      }).join(' + ')}
                    </Text>
                  </View>
                )}
                <Pressable style={styles.primaryButton} onPress={startAutomationCycle}>
                  <Text style={styles.primaryButtonText}>Sync again</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={handleForceFetch}>
                  <Text style={styles.secondaryButtonText}>Force fetch all orders</Text>
                </Pressable>
                <Text style={styles.successHint}>
                  Use this only when you think your orders were not fetched correctly.
                </Text>
              </>
            )}
          </View>
        </View>
      )}

      {showAccountSwitchModal && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <View style={styles.overlayHeader}>
              <View style={[styles.iconBadge, styles.iconBadgeError]}>
                <Ionicons name="swap-horizontal" size={20} color={Colors.white} />
              </View>
              <Text style={styles.eyebrow}>ACCOUNT CHANGE DETECTED</Text>
              <Text style={styles.title}>Different Account</Text>
              <Text style={styles.subtitle}>
                The {provider.config.displayName} account you're signed into is different from the one whose orders are stored. Mixing orders will give incorrect totals.
              </Text>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={async () => {
                setShowAccountSwitchModal(false);
                await clearAllOrders();
                if (pendingOrders) {
                  await finishSync(pendingOrders, pendingIdentityRef.current);
                }
                setPendingOrders(null);
              }}
            >
              <Text style={styles.primaryButtonText}>Clear old data and sync</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setShowAccountSwitchModal(false);
                setPendingOrders(null);
                const summary = 'Sync cancelled — old data preserved';
                setSyncResult(summary);
                transitionTo('success', summary);
                onComplete({ added: 0, total: 0, summary, xpGains: [] });
              }}
            >
              <Text style={styles.secondaryButtonText}>Cancel — keep old data</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  webViewFrame: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  webView: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  hiddenWebView: {
    opacity: 0.02,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgBase,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 8, 0.96)',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  overlayCard: {
    borderRadius: 28,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  overlayHeader: {
    alignItems: 'center',
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.greenDark,
    marginBottom: 16,
  },
  iconBadgeSuccess: {
    backgroundColor: Colors.greenDark,
  },
  iconBadgeError: {
    backgroundColor: Colors.red,
  },
  eyebrow: {
    color: Colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  title: {
    color: Colors.textHeading,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
  },
  animationBlock: {
    marginTop: 28,
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 14,
    borderRadius: 999,
    backgroundColor: Colors.bgOverlay,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  progressBeam: {
    width: 180,
    height: 14,
    borderRadius: 999,
    backgroundColor: Colors.green,
    opacity: 0.95,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.green,
  },
  overlayFooter: {
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  footerLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  footerValue: {
    color: Colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    marginTop: 22,
    borderRadius: 18,
    backgroundColor: Colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  successHint: {
    marginTop: 12,
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  guidanceContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: Colors.bgBase,
  },
  guidanceBanner: {
    borderRadius: 18,
    backgroundColor: 'rgba(13, 13, 13, 0.94)',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  guidanceTitle: {
    color: Colors.textHeading,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  guidanceBody: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  xpBanner: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.greenBg,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    alignItems: 'center',
    gap: 2,
  },
  xpBannerAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.green,
    letterSpacing: -0.3,
  },
  xpBannerDetail: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
