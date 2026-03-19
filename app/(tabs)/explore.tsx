import {
  AUTOMATION_BRIDGE_SCRIPT,
  RESET_WEBVIEW_SESSION_SCRIPT,
  buildAutomationCommandScript,
} from '@/lib/injectedScript';
import {
  getBlinkitSessionResetNonce,
  subscribeToBlinkitSessionReset,
} from '@/lib/sessionReset';
import { clearOrders, mergeOrders } from '@/lib/storage';
import { Colors } from '@/src/theme/colors';
import { AutomationPhase, WebViewBridgeMessage } from '@/types/automation';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
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
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

const BLINKIT_URL = 'https://blinkit.com';
const WATCHDOG_MS = 30000;
const LOCATION_FALLBACK_MS = 8000;

const USER_INPUT_PHASES = new Set<AutomationPhase>([
  'awaiting_phone',
  'awaiting_otp',
  'awaiting_manual_location',
]);

const AUTOMATED_PHASES = new Set<AutomationPhase>([
  'booting',
  'checking_session',
  'requesting_location_permission',
  'navigating_to_orders',
  'extracting',
]);

function getPhaseTitle(phase: AutomationPhase): string {
  switch (phase) {
    case 'booting':
      return 'Opening Blinkit';
    case 'checking_session':
      return 'Checking your account';
    case 'requesting_location_permission':
      return 'Confirming your location';
    case 'awaiting_phone':
      return 'Enter mobile number';
    case 'awaiting_otp':
      return 'Enter OTP';
    case 'awaiting_manual_location':
      return 'Select your location';
    case 'navigating_to_orders':
      return 'Opening Order History';
    case 'extracting':
      return 'Extracting orders';
    case 'success':
      return 'Sync complete';
    case 'error':
      return 'Sync needs attention';
    default:
      return 'Syncing Blinkit';
  }
}

function getPhaseSubtitle(
  phase: AutomationPhase,
  detail: string | null,
  syncProgress: number | null,
  syncResult: string | null,
  errorMessage: string | null
): string {
  if (phase === 'extracting' && syncProgress !== null) {
    return `Scanning order history. ${syncProgress} order${syncProgress === 1 ? '' : 's'} found so far.`;
  }

  if (phase === 'success') {
    return syncResult ?? 'Your Blinkit data is ready on the dashboard.';
  }

  if (phase === 'error') {
    return errorMessage ?? 'Blinkit did not respond the way we expected. Retry to continue.';
  }

  if (phase === 'awaiting_manual_location') {
    return 'The WebView is visible so you can select the delivery location manually and we will continue automatically.';
  }

  if (phase === 'awaiting_phone') {
    return 'The WebView is visible so you can enter the Blinkit mobile number. We will take over again right after that.';
  }

  if (phase === 'awaiting_otp') {
    return 'The WebView is visible so you can enter the OTP. We will resume navigation as soon as Blinkit accepts it.';
  }

  return detail ?? 'We are moving through Blinkit for you.';
}

export default function OrdersScreen() {
  const webViewRef = useRef<WebView>(null);
  const watchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestingLocationRef = useRef(false);
  const handledResetNonceRef = useRef(0);
  const forceFetchRunRef = useRef(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<AutomationPhase>('booting');
  const [statusDetail, setStatusDetail] = useState<string | null>('Opening Blinkit');
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequiresUserAction, setErrorRequiresUserAction] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(BLINKIT_URL);
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const [androidGeolocationEnabled, setAndroidGeolocationEnabled] = useState(false);
  const [manualLocationMode, setManualLocationMode] = useState(false);
  const [webViewInstanceKey, setWebViewInstanceKey] = useState(0);
  const [useIncognitoWebView, setUseIncognitoWebView] = useState(false);

  const showWebView = USER_INPUT_PHASES.has(phase) || (phase === 'error' && errorRequiresUserAction);
  const showOverlay = !showWebView || phase === 'success' || (phase === 'error' && !errorRequiresUserAction);

  const phaseTitle = useMemo(() => getPhaseTitle(phase), [phase]);
  const phaseSubtitle = useMemo(
    () => getPhaseSubtitle(phase, statusDetail, syncProgress, syncResult, errorMessage),
    [errorMessage, phase, statusDetail, syncProgress, syncResult]
  );

  const clearWatchdog = useCallback(() => {
    if (watchdogTimeoutRef.current) {
      clearTimeout(watchdogTimeoutRef.current);
      watchdogTimeoutRef.current = null;
    }
  }, []);

  const clearLocationFallback = useCallback(() => {
    if (locationFallbackTimeoutRef.current) {
      clearTimeout(locationFallbackTimeoutRef.current);
      locationFallbackTimeoutRef.current = null;
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
          setErrorMessage('Automation timed out while Blinkit was loading. Please retry once.');
          setStatusDetail('Automation timed out');
          setPhase('error');
        }, WATCHDOG_MS);
      }

      if (nextPhase !== 'requesting_location_permission') {
        clearLocationFallback();
      }
    },
    [clearLocationFallback, clearWatchdog]
  );

  const injectAutomationBridge = useCallback((command?: object) => {
    if (!webViewRef.current) return;
    webViewRef.current.injectJavaScript(AUTOMATION_BRIDGE_SCRIPT);
    if (command) {
      webViewRef.current.injectJavaScript(buildAutomationCommandScript(command));
    }
  }, []);

  const startAutomationCycle = useCallback(() => {
    requestingLocationRef.current = false;
    clearLocationFallback();
    setSyncProgress(null);
    setSyncResult(null);
    setErrorMessage(null);
    setErrorRequiresUserAction(false);
    setManualLocationMode(false);
    transitionTo('booting', 'Opening Blinkit');

    if (webViewLoaded) {
      injectAutomationBridge({ type: 'RESTART_AUTOMATION' });
    }
  }, [clearLocationFallback, injectAutomationBridge, transitionTo, webViewLoaded]);

  const performWebViewSessionReset = useCallback((nonce: number) => {
    if (nonce <= handledResetNonceRef.current) return;
    handledResetNonceRef.current = nonce;

    requestingLocationRef.current = false;
    clearWatchdog();
    clearLocationFallback();
    setManualLocationMode(false);
    setAndroidGeolocationEnabled(false);
    setSyncProgress(null);
    setSyncResult(null);
    setErrorMessage(null);
    setErrorRequiresUserAction(false);
    setUseIncognitoWebView(true);

    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(RESET_WEBVIEW_SESSION_SCRIPT);
      webViewRef.current.clearCache(true);
      webViewRef.current.clearHistory?.();
      webViewRef.current.clearFormData?.();
    }

    setWebViewLoaded(false);
    setWebViewInstanceKey(nonce);
    transitionTo('booting', 'Resetting Blinkit session');
  }, [clearLocationFallback, clearWatchdog, transitionTo]);

  const handleManualLocationFallback = useCallback((reason: string) => {
    setErrorMessage(null);
    setErrorRequiresUserAction(false);
    setManualLocationMode(true);
    injectAutomationBridge({ type: 'ENTER_MANUAL_LOCATION_MODE' });
    transitionTo('awaiting_manual_location', reason);
  }, [injectAutomationBridge, transitionTo]);

  const handleLocationPermissionRequired = useCallback(async () => {
    if (requestingLocationRef.current || manualLocationMode) return;
    requestingLocationRef.current = true;

    transitionTo('requesting_location_permission', 'Waiting for location permission');
    clearLocationFallback();
    locationFallbackTimeoutRef.current = setTimeout(() => {
      handleManualLocationFallback('Location could not be selected automatically');
    }, LOCATION_FALLBACK_MS);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      const granted = permission.granted;

      if (granted) {
        if (Platform.OS === 'android') {
          setAndroidGeolocationEnabled(true);
        }

        setTimeout(() => {
          injectAutomationBridge({
            type: 'LOCATION_PERMISSION_RESULT',
            granted: true,
          });
        }, Platform.OS === 'android' ? 350 : 100);
      } else {
        clearLocationFallback();
        handleManualLocationFallback('Location permission was denied');
        injectAutomationBridge({
          type: 'LOCATION_PERMISSION_RESULT',
          granted: false,
        });
      }
    } catch (error) {
      clearLocationFallback();
      handleManualLocationFallback('Location permission could not be completed');
      injectAutomationBridge({
        type: 'LOCATION_PERMISSION_RESULT',
        granted: false,
      });
    } finally {
      requestingLocationRef.current = false;
    }
  }, [
    clearLocationFallback,
    handleManualLocationFallback,
    injectAutomationBridge,
    manualLocationMode,
    transitionTo,
  ]);

  const handleRetry = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    startAutomationCycle();
  }, [startAutomationCycle]);

  const handleForceFetch = useCallback(async () => {
    await clearOrders();
    forceFetchRunRef.current = true;
    setSyncResult(null);
    setSyncProgress(null);
    setErrorMessage(null);
    startAutomationCycle();
  }, [startAutomationCycle]);

  useFocusEffect(
    useCallback(() => {
      startAutomationCycle();
      return undefined;
    }, [startAutomationCycle])
  );

  useEffect(() => {
    let active = true;

    getBlinkitSessionResetNonce().then((nonce) => {
      if (!active || nonce <= handledResetNonceRef.current) return;
      performWebViewSessionReset(nonce);
    });

    const unsubscribe = subscribeToBlinkitSessionReset((nonce) => {
      performWebViewSessionReset(nonce);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [performWebViewSessionReset]);

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
      clearLocationFallback();
    };
  }, [clearLocationFallback, clearWatchdog, dotAnim, progressAnim]);

  const onNavigationStateChange = (navState: WebViewNavigation) => {
    setCurrentUrl(navState.url);
  };

  const onLoadStart = () => {
    setWebViewLoaded(false);
    transitionTo('booting', 'Opening Blinkit');
  };

  const onLoadEnd = () => {
    setWebViewLoaded(true);
    injectAutomationBridge({ type: 'RECHECK' });
  };

  useEffect(() => {
    if (!manualLocationMode) return;

    const stillOnLocationStep = currentUrl.includes('blinkit.com');
    if (!stillOnLocationStep) return;

    if (phase !== 'awaiting_manual_location') {
      return;
    }

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
        await handleLocationPermissionRequired();
        return;
      }

      if (data.type === 'LOCATION_MANUAL_REQUIRED') {
        handleManualLocationFallback('Please pick the Blinkit location manually.');
        return;
      }

      if (data.type === 'SCROLL_PROGRESS') {
        setSyncProgress(data.count);
        transitionTo('extracting', `Scanning ${data.count} orders`);
        return;
      }

      if (data.type === 'ORDERS_EXTRACTED') {
        clearLocationFallback();
        clearWatchdog();
        setSyncProgress(null);
        const { added, total } = await mergeOrders(data.orders);
        const summary = forceFetchRunRef.current
          ? `Fetched ${total} order${total === 1 ? '' : 's'} from scratch`
          : `Synced ${added} new order${added === 1 ? '' : 's'} (${total} total)`;
        forceFetchRunRef.current = false;
        setSyncResult(summary);
        transitionTo('success', summary);
        return;
      }

      if (data.type === 'AUTOMATION_ERROR') {
        clearLocationFallback();
        clearWatchdog();
        forceFetchRunRef.current = false;
        setErrorRequiresUserAction(Boolean(data.requiresUserAction));
        setErrorMessage(data.message);
        transitionTo('error', data.message);
      }
    } catch (error) {
      clearLocationFallback();
      clearWatchdog();
      forceFetchRunRef.current = false;
      setErrorRequiresUserAction(false);
      setErrorMessage('The Blinkit bridge sent an unreadable message.');
      transitionTo('error', 'Bridge parsing failed');
    }
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.webViewFrame}>
        <WebView
          key={webViewInstanceKey}
          ref={webViewRef}
          source={{ uri: BLINKIT_URL }}
          style={[styles.webView, !showWebView && styles.hiddenWebView]}
          javaScriptEnabled
          incognito={useIncognitoWebView}
          geolocationEnabled={Platform.OS === 'android' ? androidGeolocationEnabled : false}
          startInLoadingState
          injectedJavaScriptBeforeContentLoaded={AUTOMATION_BRIDGE_SCRIPT}
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

              <Text style={styles.eyebrow}>BLINKIT SYNC</Text>
              <Text style={styles.title}>{phaseTitle}</Text>
              <Text style={styles.subtitle}>{phaseSubtitle}</Text>
            </View>

            {phase !== 'success' && phase !== 'error' && (
              <View style={styles.animationBlock}>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressBeam,
                      {
                        transform: [{ translateX: barTranslateX }],
                      },
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
                          transform: [
                            {
                              scale: dotAnim.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [0.9, dot === 1 ? 1.25 : 1.05, 0.9],
                              }),
                            },
                          ],
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

      {showWebView && (
        <View style={styles.guidanceBanner}>
          <Text style={styles.guidanceTitle}>{phaseTitle}</Text>
          <Text style={styles.guidanceBody}>{phaseSubtitle}</Text>
        </View>
      )}
    </SafeAreaView>
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
  guidanceBanner: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
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
});
