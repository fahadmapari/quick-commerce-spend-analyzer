import { INJECTED_SCRIPT } from '@/lib/injectedScript';
import { mergeOrders } from '@/lib/storage';
import { Colors } from '@/src/theme/colors';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import WebView, { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

const BLINKIT_URL = 'https://blinkit.com';

function isOrdersPage(url: string): boolean {
  return url.includes('/past-orders') || url.includes('/orders');
}

export default function OrdersScreen() {
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(BLINKIT_URL);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const onNavigationStateChange = (navState: WebViewNavigation) => {
    setCurrentUrl(navState.url);
  };

  const handleSync = () => {
    if (!webViewRef.current) return;
    setIsSyncing(true);
    setSyncProgress(0);
    setSyncResult(null);
    webViewRef.current.injectJavaScript(INJECTED_SCRIPT);
  };

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'SCROLL_PROGRESS') {
        setSyncProgress(data.count as number);
      } else if (data.type === 'ORDERS_EXTRACTED') {
        const { added, total } = await mergeOrders(data.orders);
        setIsSyncing(false);
        setSyncProgress(null);
        setSyncResult(`Synced ${added} new order${added !== 1 ? 's' : ''} (${total} total)`);
        setTimeout(() => setSyncResult(null), 4000);
      } else if (data.type === 'NOT_ON_ORDERS_PAGE') {
        setIsSyncing(false);
        setSyncProgress(null);
      }
    } catch {
      setIsSyncing(false);
    }
  };

  const showSyncButton = isOrdersPage(currentUrl) && !isSyncing;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: BLINKIT_URL }}
        style={styles.webView}
        javaScriptEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.green} />
          </View>
        )}
        onNavigationStateChange={onNavigationStateChange}
        onMessage={onMessage}
      />

      {/* Scanning progress banner */}
      {isSyncing && (
        <View style={styles.scanBanner}>
          <ActivityIndicator size="small" color={Colors.white} />
          <Text style={styles.scanBannerText}>
            Scanning... {syncProgress ?? 0} orders found
          </Text>
        </View>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <View style={[styles.scanBanner, styles.resultBanner]}>
          <Text style={styles.scanBannerText}>{syncResult}</Text>
        </View>
      )}

      {/* Sync Orders button */}
      {showSyncButton && (
        <TouchableOpacity style={styles.syncButton} onPress={handleSync} activeOpacity={0.85}>
          <Text style={styles.syncButtonText}>Sync Orders</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgBase,
  },
  scanBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.greenDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  resultBanner: {
    backgroundColor: Colors.greenDark,
  },
  scanBannerText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  syncButton: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: Colors.greenDark,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  syncButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
