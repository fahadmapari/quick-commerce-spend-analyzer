/**
 * Backend-scraping alternative to PlatformSyncWebView.
 *
 * Instead of running a WebView on-device, this component opens a WebSocket
 * connection to the scraper server (Node.js + Playwright headless browser).
 * The server handles all browser automation; this component shows status UI
 * and collects phone/OTP input from the user when required.
 *
 * Drop-in replacement: same Props interface as PlatformSyncWebView.
 *
 * Server URL is read from EXPO_PUBLIC_SCRAPER_WS_URL env var, falling back to
 * the Android-emulator host alias so local dev works out of the box.
 */

import { PlatformProvider } from '@/lib/platforms/types';
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
import { AutomationPhase, RawOrder, WebViewBridgeMessage } from '@/types/automation';
import { Colors } from '@/src/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getServerUrl(): string {
  const env = process.env.EXPO_PUBLIC_SCRAPER_WS_URL;
  if (env) return env;
  // Android emulator: 10.0.2.2 maps to the host machine's localhost
  return Platform.OS === 'android'
    ? 'ws://10.0.2.2:3001'
    : 'ws://localhost:3001';
}

const SESSION_KEY = (platform: string) => `backend_session_id_${platform}`;

async function getOrCreateSessionId(platform: string): Promise<string> {
  const stored = await AsyncStorage.getItem(SESSION_KEY(platform));
  if (stored) return stored;
  // Simple random ID — no external dependency needed
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(SESSION_KEY(platform), id);
  return id;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  label?: string;
}

const USER_INPUT_PHASES = new Set<AutomationPhase>(['awaiting_phone', 'awaiting_otp']);
const AUTOMATED_PHASES = new Set<AutomationPhase>([
  'booting',
  'checking_session',
  'requesting_location_permission',
  'navigating_to_orders',
  'extracting',
]);
const WATCHDOG_MS = 45_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlatformSyncBackend({ provider, onComplete, onError, label }: Props) {
  const wsRef = useRef<WebSocket | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceFetchRef = useRef(false);
  const pendingIdentityRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<AutomationPhase>('booting');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequiresUserAction, setErrorRequiresUserAction] = useState(false);
  const [xpGains, setXpGains] = useState<XpEvent[]>([]);
  const [pendingOrders, setPendingOrders] = useState<RawOrder[] | null>(null);
  const [showAccountSwitchModal, setShowAccountSwitchModal] = useState(false);

  // Input state for phone / OTP
  const [inputValue, setInputValue] = useState('');
  const [connecting, setConnecting] = useState(true);

  const phaseTitle = useMemo(() => provider.getPhaseTitle(phase), [phase, provider]);
  const phaseSubtitle = useMemo(
    () => provider.getPhaseSubtitle(phase, statusDetail, syncProgress, syncResult, errorMessage),
    [errorMessage, phase, provider, statusDetail, syncProgress, syncResult],
  );
  const eyebrowText = label ?? `${provider.config.displayName.toUpperCase()} SYNC`;

  // -------------------------------------------------------------------------
  // Watchdog
  // -------------------------------------------------------------------------

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
  }, []);

  const resetWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setPhase('error');
      setErrorMessage(`Automation timed out — ${provider.config.displayName} may be slow or unreachable.`);
      setErrorRequiresUserAction(false);
    }, WATCHDOG_MS);
  }, [clearWatchdog, provider.config.displayName]);

  // -------------------------------------------------------------------------
  // WebSocket send helper
  // -------------------------------------------------------------------------

  const sendWs = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // -------------------------------------------------------------------------
  // finishSync — mirrors PlatformSyncWebView logic
  // -------------------------------------------------------------------------

  const finishSync = useCallback(async (orders: RawOrder[], identity: string | null) => {
    const { added, total } = await mergeOrders(provider.id, orders, (raw) => provider.parseDate(raw));
    if (identity) await saveAccountIdentity(provider.id, identity);

    const summary = forceFetchRef.current
      ? `Fetched ${total} order${total === 1 ? '' : 's'} from scratch`
      : `Synced ${added} new order${added === 1 ? '' : 's'} (${total} total)`;
    forceFetchRef.current = false;

    if (!mountedRef.current) return;
    setSyncResult(summary);
    setPhase('success');
    setStatusDetail(summary);

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
    if (mountedRef.current && awarded.length > 0) setXpGains(awarded);

    onComplete({ added, total, summary, xpGains: awarded });
  }, [onComplete, provider]);

  // -------------------------------------------------------------------------
  // Message handler
  // -------------------------------------------------------------------------

  const handleMessage = useCallback(async (data: WebViewBridgeMessage) => {
    if (data.type === 'AUTOMATION_STATE') {
      const nextPhase = data.phase;
      setPhase(nextPhase);
      setStatusDetail(data.detail ?? null);

      if (nextPhase === 'success' || nextPhase === 'error' || USER_INPUT_PHASES.has(nextPhase)) {
        clearWatchdog();
      } else if (AUTOMATED_PHASES.has(nextPhase)) {
        resetWatchdog();
      }
      return;
    }

    if (data.type === 'ACCOUNT_IDENTITY') {
      pendingIdentityRef.current = data.identity;
      return;
    }

    if (data.type === 'SCROLL_PROGRESS') {
      setSyncProgress(data.count);
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
      forceFetchRef.current = false;
      setErrorRequiresUserAction(Boolean(data.requiresUserAction));
      setErrorMessage(data.message);
      setPhase('error');
      setStatusDetail(data.message ?? null);
    }
  }, [clearWatchdog, finishSync, provider.id, resetWatchdog]);

  // -------------------------------------------------------------------------
  // Connect / start scrape
  // -------------------------------------------------------------------------

  const startScrape = useCallback(async () => {
    wsRef.current?.close();

    if (!mountedRef.current) return;
    setConnecting(true);
    setPhase('booting');
    setStatusDetail(null);
    setSyncProgress(null);
    setSyncResult(null);
    setErrorMessage(null);
    setErrorRequiresUserAction(false);
    setPendingOrders(null);
    setShowAccountSwitchModal(false);
    setInputValue('');
    pendingIdentityRef.current = null;

    const sessionId = await getOrCreateSessionId(provider.id);
    const ws = new WebSocket(getServerUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setConnecting(false);
      resetWatchdog();
      ws.send(JSON.stringify({ type: 'START_SCRAPE', platform: provider.id, sessionId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WebViewBridgeMessage;
        handleMessage(data);
      } catch {}
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      clearWatchdog();
      setConnecting(false);
      setPhase('error');
      setErrorMessage('Could not connect to the scraper server. Make sure it is running.');
      setErrorRequiresUserAction(false);
    };

    ws.onclose = () => {
      clearWatchdog();
      setConnecting(false);
    };
  }, [clearWatchdog, handleMessage, provider.id, resetWatchdog]);

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    startScrape();
    return () => {
      mountedRef.current = false;
      clearWatchdog();
      wsRef.current?.close();
    };
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
      }),
    );
    const dotsLoop = Animated.loop(
      Animated.timing(dotAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    progressLoop.start();
    dotsLoop.start();
    return () => { progressLoop.stop(); dotsLoop.stop(); };
  }, [dotAnim, progressAnim]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const submitInput = useCallback(() => {
    const v = inputValue.trim();
    if (!v) return;
    sendWs({ type: 'SUBMIT_INPUT', value: v });
    setInputValue('');
  }, [inputValue, sendWs]);

  const handleRetry = useCallback(() => startScrape(), [startScrape]);

  const handleForceFetch = useCallback(async () => {
    await clearOrdersOnly(provider.id);
    forceFetchRef.current = true;
    await startScrape();
  }, [provider.id, startScrape]);

  // -------------------------------------------------------------------------
  // Derived display
  // -------------------------------------------------------------------------

  const needsInput = USER_INPUT_PHASES.has(phase);
  const isInputPhone = phase === 'awaiting_phone';
  const showProgress = !needsInput && phase !== 'success' && phase !== 'error';

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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (connecting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.green} />
        <Text style={styles.connectingText}>Connecting to scraper server…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Account-switch modal */}
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
                The {provider.config.displayName} account differs from the one whose orders are stored.
                Mixing accounts gives incorrect totals.
              </Text>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={async () => {
                setShowAccountSwitchModal(false);
                await clearAllOrders();
                if (pendingOrders) await finishSync(pendingOrders, pendingIdentityRef.current);
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
                setPhase('success');
                setStatusDetail(summary);
                onComplete({ added: 0, total: 0, summary, xpGains: [] });
              }}
            >
              <Text style={styles.secondaryButtonText}>Cancel — keep old data</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Main card */}
      {!showAccountSwitchModal && (
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
              ) : needsInput ? (
                <View style={[styles.iconBadge, styles.iconBadgeInput]}>
                  <Ionicons name={isInputPhone ? 'call' : 'keypad'} size={20} color={Colors.white} />
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

            {/* Phone / OTP input */}
            {needsInput && (
              <View style={styles.inputBlock}>
                <TextInput
                  style={styles.textInput}
                  value={inputValue}
                  onChangeText={setInputValue}
                  placeholder={isInputPhone ? 'Enter mobile number' : 'Enter OTP'}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={isInputPhone ? 'phone-pad' : 'number-pad'}
                  maxLength={isInputPhone ? 10 : 6}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={submitInput}
                  secureTextEntry={!isInputPhone}
                />
                <Pressable
                  style={[styles.primaryButton, !inputValue.trim() && styles.buttonDisabled]}
                  onPress={submitInput}
                  disabled={!inputValue.trim()}
                >
                  <Text style={styles.primaryButtonText}>
                    {isInputPhone ? 'Send OTP' : 'Verify'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Progress animation */}
            {showProgress && (
              <View style={styles.animationBlock}>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[styles.progressBeam, { transform: [{ translateX: barTranslateX }] }]}
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

            {/* Footer status */}
            {!needsInput && (
              <View style={styles.overlayFooter}>
                <Text style={styles.footerLabel}>LIVE STATUS</Text>
                <Text style={styles.footerValue}>
                  {phase === 'extracting' && syncProgress !== null
                    ? `${syncProgress} orders scanned`
                    : statusDetail ?? phase}
                </Text>
              </View>
            )}

            {/* Error actions */}
            {phase === 'error' && (
              <Pressable style={styles.primaryButton} onPress={handleRetry}>
                <Text style={styles.primaryButtonText}>Retry sync</Text>
              </Pressable>
            )}

            {/* Success actions */}
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
                <Pressable style={styles.primaryButton} onPress={handleRetry}>
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
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles — mirrors PlatformSyncWebView for visual consistency
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgBase,
    gap: 16,
  },
  connectingText: {
    color: Colors.textMuted,
    fontSize: 13,
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
  iconBadgeSuccess: { backgroundColor: Colors.greenDark },
  iconBadgeError: { backgroundColor: Colors.red },
  iconBadgeInput: { backgroundColor: '#7c3aed' },
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
  inputBlock: {
    marginTop: 20,
    gap: 10,
  },
  textInput: {
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: Colors.textPrimary,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 2,
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
  buttonDisabled: {
    opacity: 0.4,
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
