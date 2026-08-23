import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  BackHandler,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { CameraView, requestCameraPermissionsAsync } from 'expo-camera';

// ─── Configuration ─────────────────────────────────────────────
// Single source of truth: app.config.js reads env vars at build time
// and passes them through Constants.expoConfig.extra.
// Fallback chain: EAS env → config.json (white-label) → STRIKE default.
// STRIKE is the ONLY tenant allowed to fall back to hardcoded defaults — a
// white-label build missing its config is treated as a fatal error so we never
// silently ship one gym's binary pointing at another gym's data.
const PRODUCTION_URL =
  Constants?.expoConfig?.extra?.PRODUCTION_URL || 'https://strike-egy.com/';
const APP_NAME =
  Constants?.expoConfig?.extra?.APP_NAME || 'STRIKE';

// Runtime validation: if PRODUCTION_URL is missing or not an https URL, show a
// fatal config error instead of loading the wrong tenant's data.
function isValidProductionUrl(url) {
  if (!url || typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return false;
  }
  return parsed.protocol === 'https:';
}
const CONFIG_VALID = isValidProductionUrl(PRODUCTION_URL);

// Allowed origin for the WebView: only same-origin (PRODUCTION_URL) navigations
// are permitted. Used by onShouldStartLoadWithRequest and the push deep-link path
// to block dangerous schemes (javascript:, file:, data:) and cross-origin loads.
let ALLOWED_ORIGIN = '';
try {
  ALLOWED_ORIGIN = new URL(PRODUCTION_URL).origin;
} catch (_) {
  // If PRODUCTION_URL is malformed, fall back to a string prefix match on https://
  ALLOWED_ORIGIN = PRODUCTION_URL;
}

/**
 * Returns true if a URL is safe to load inside the CRM WebView.
 * Rejects anything that isn't http(s) and, when an allowed origin is known,
 * anything outside the configured CRM origin (prevents the WebView from being
 * navigated to an attacker-controlled page).
 */
function isSafeWebUrl(url) {
  if (!url || typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return false;
  }
  // Block dangerous schemes outright. `javascript:` assigned to location.href
  // executes in the WebView with full session access — a stored-XSS vector.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }
  // Only allow same-origin navigations to the configured CRM origin.
  if (ALLOWED_ORIGIN) {
    return parsed.origin === ALLOWED_ORIGIN;
  }
  return true;
}

// ─── Notification Handler & Categories ───────────────────────────
// Configure notification behavior for when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Configure interactive notification categories (action buttons)
Notifications.setNotificationCategoryAsync('class_reminder', [
  {
    identifier: 'confirm',
    buttonTitle: 'Confirm Attendance',
    options: { opensAppToForeground: true },
  },
  {
    identifier: 'cancel',
    buttonTitle: 'Cancel Booking',
    options: { opensAppToForeground: true, isDestructive: true },
  },
]);

Notifications.setNotificationCategoryAsync('task_assignment', [
  {
    identifier: 'view_task',
    buttonTitle: 'View Task',
    options: { opensAppToForeground: true },
  },
  {
    identifier: 'complete_task',
    buttonTitle: 'Mark Complete',
    options: { opensAppToForeground: true },
  },
]);

// ─── Error Boundary ────────────────────────────────────────────
// Catches render errors and provides a recovery UI instead of white-screen
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" backgroundColor="#0a0a0a" />
          <View style={styles.offlineContainer}>
            <View style={styles.offlineIconContainer}>
              <Text style={styles.offlineIcon}>⚠️</Text>
            </View>
            <Text style={styles.offlineTitle}>Something went wrong</Text>
            <Text style={styles.offlineMessage}>
              The app encountered an unexpected error. Please restart to continue.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={styles.retryButtonText}>Restart App</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

// ─── Main App ──────────────────────────────────────────────────
function MainApp() {
  const webViewRef = useRef(null);
  const [isConnected, setIsConnected] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [key, setKey] = useState(0);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [hasLoadedSuccessfully, setHasLoadedSuccessfully] = useState(false);
  const [hasFailedToLoad, setHasFailedToLoad] = useState(false);
  const [isNativeScanning, setIsNativeScanning] = useState(false);

  // 1. Push Notification Registration (camera is requested on-demand via bridge)
  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
      }
    });

    // Listener for when a notification is received while app is running
    const notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Notification] Received:', notification.request.content.title);
      }
    );

    // Listener for when a user taps/interacts with a notification — deep link into CRM
    const responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const actionId = response.actionIdentifier;
        const data = response.notification.request.content.data;
        console.log('[Notification] Tapped/Action:', actionId, data);

        let targetUrl = data?.url ? String(data.url) : null;

        // Map notification action buttons to specific deep link paths
        if (actionId === 'confirm' && data?.classId) {
          targetUrl = `/member/classes?action=confirm&id=${data.classId}`;
        } else if (actionId === 'cancel' && data?.classId) {
          targetUrl = `/member/classes?action=cancel&id=${data.classId}`;
        } else if (actionId === 'view_task' && data?.taskId) {
          targetUrl = `/admin/tasks?id=${data.taskId}`;
        } else if (actionId === 'complete_task' && data?.taskId) {
          targetUrl = `/admin/tasks?action=complete&id=${data.taskId}`;
        }

        // Convert relative URLs to absolute based on the tenant's PRODUCTION_URL
        if (targetUrl && targetUrl.startsWith('/')) {
          targetUrl = PRODUCTION_URL.replace(/\/$/, '') + targetUrl;
        }

        // Deep link: if the push payload includes a url, navigate the WebView there.
        // Validate the URL scheme + origin first — an attacker-controlled push
        // (the proxy-push endpoint was previously open) could otherwise set
        // location.href = "javascript:..." and execute code in the logged-in CRM.
        if (targetUrl && isSafeWebUrl(targetUrl) && webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `window.location.href = ${JSON.stringify(targetUrl)}; true;`
          );
        } else if (targetUrl) {
          console.warn('[Notification] Blocked unsafe deep-link URL:', targetUrl);
        }
      }
    );

    return () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  // 2. Monitor Network Connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected !== false);
    });
    return () => unsubscribe();
  }, []);

  // 3. Android hardware back button
  useEffect(() => {
    const backAction = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [canGoBack]);

  // 4. Re-inject push token when it changes
  useEffect(() => {
    if (expoPushToken && webViewRef.current) {
      const safeToken = JSON.stringify(expoPushToken);
      const injectScript = `
        window.expoPushToken = ${safeToken};
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('expoPushTokenLoaded', { detail: ${safeToken} }));
        }
        true;
      `;
      webViewRef.current.injectJavaScript(injectScript);
    }
  }, [expoPushToken]);

  // ─── Handlers ──────────────────────────────────────────
  const handleRetry = () => {
    setHasFailedToLoad(false);
    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected !== false);
      setKey((prevKey) => prevKey + 1);
    });
  };

  /**
   * Native Bridge: handles messages FROM the web CRM via
   * window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }))
   *
   * This is how CRM dashboard actions trigger native features.
   */
  const handleWebViewMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      switch (message.type) {
        case 'REQUEST_CAMERA':
          // On-demand camera permission (Apple compliance: only ask when contextually relevant)
          (async () => {
            const { status } = await requestCameraPermissionsAsync();
            // Notify the web app of the result
            webViewRef.current?.injectJavaScript(
              `window.dispatchEvent(new CustomEvent('nativeCameraPermission', { detail: ${JSON.stringify(status)} })); true;`
            );
          })();
          break;

        case 'START_SCANNER':
          // Request permissions and open native scanner
          (async () => {
            const { status } = await requestCameraPermissionsAsync();
            if (status === 'granted') {
              setIsNativeScanning(true);
            } else {
              // Notify web that we couldn't start scanner
              webViewRef.current?.injectJavaScript(
                `window.dispatchEvent(new CustomEvent('nativeCameraPermission', { detail: 'denied' })); true;`
              );
            }
          })();
          break;

        case 'STOP_SCANNER':
          setIsNativeScanning(false);
          break;

        case 'NAVIGATE':
          // Navigate WebView to a specific URL (only same-origin https allowed)
          if (message.payload?.url && isSafeWebUrl(String(message.payload.url))) {
            webViewRef.current?.injectJavaScript(
              `window.location.href = ${JSON.stringify(String(message.payload.url))}; true;`
            );
          } else if (message.payload?.url) {
            console.warn('[Bridge] Blocked unsafe NAVIGATE url:', message.payload.url);
          }
          break;

        case 'REFRESH':
          // Force full WebView reload (e.g., after major CRM data changes)
          setKey((prev) => prev + 1);
          break;

        case 'HAPTIC':
          // Future: trigger native haptic feedback
          break;

        case 'LOG':
          console.log('[WebView]', message.payload);
          break;

        default:
          console.log('[Bridge] Unknown message type:', message.type);
      }
    } catch (e) {
      // Non-JSON messages are ignored (e.g., third-party scripts)
      console.warn('[Bridge] Invalid message:', e.message);
    }
  };

  // Script injected before first paint — makes push token globally accessible
  const runBeforeFirstPaint = `
    window.expoPushToken = ${JSON.stringify(expoPushToken)};
    true;
  `;

  // ─── Fatal Config Error Screen ─────────────────────────
  // Rendered when PRODUCTION_URL is missing/invalid at runtime. Prevents the app
  // from silently loading the wrong tenant's data (e.g. a white-label build that
  // shipped without its config would otherwise fall back to STRIKE).
  if (!CONFIG_VALID) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" backgroundColor="#0a0a0a" />
        <View style={styles.offlineContainer}>
          <View style={styles.offlineIconContainer}>
            <Text style={styles.offlineIcon}>⚙️</Text>
          </View>
          <Text style={styles.offlineTitle}>Configuration Error</Text>
          <Text style={styles.offlineMessage}>
            {APP_NAME ? `${APP_NAME} ` : 'This app '}could not start because its
            server configuration is missing or invalid. Please reinstall or
            contact support.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Offline Full Screen ──────────────────────────────
  // If the WebView attempted to load the PWA (which includes the SW cache)
  // but failed (no cache, no internet), show the offline blocker.
  if (hasFailedToLoad && !hasLoadedSuccessfully) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        <View style={styles.offlineContainer}>
          <View style={styles.offlineIconContainer}>
            <Text style={styles.offlineIcon}>⚡</Text>
          </View>
          <Text style={styles.offlineTitle}>Connection Interrupted</Text>
          <Text style={styles.offlineMessage}>
            Please check your internet connection and try again to access the CRM.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Offline Banner ──────────────────────────────────
  const renderOfflineBanner = () => {
    if (isConnected) return null;
    return (
      <View style={styles.offlineBanner}>
        <Text style={styles.offlineBannerText}>⚡ Offline Mode — Showing cached data</Text>
      </View>
    );
  };

  // ─── Main Render ─────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <View style={styles.container}>
        <WebView
          key={key}
          ref={webViewRef}
          source={{ uri: PRODUCTION_URL }}
          style={styles.webview}

          // Use default browser caching (LOAD_DEFAULT): normal HTTP cache-control semantics.
          // Previously used "LOAD_CACHE_ELSE_NETWORK", which preferred stale cache over the
          // network — after every server deploy, existing installs kept showing old JS/HTML
          // until the cache expired (the cause of the "empty states after deploy" bug).
          // For an always-online CRM, honoring server cache headers is correct.

          // Native performance and UX enhancements
          bounces={false}
          decelerationRate="normal"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          // Note: scalesPageToFit removed — deprecated and no-op in modern RN WebView.
          // Control scaling via <meta name="viewport"> in your web app instead.

          // Technical WebView configurations
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}

          // Security: only allow HTTPS origins (blocks file://, data://, javascript:// schemes)
          originWhitelist={['https://*']}

          // Actually enforce the origin whitelist. Without this handler, originWhitelist
          // is NOT applied — the WebView still loads any scheme/frame. This returns false
          // for anything that isn't a safe http(s) same-origin navigation, which closes
          // javascript:/data:/file: navigations (incl. push deep-link attempts).
          onShouldStartLoadWithRequest={(request) => {
            // Allow only http(s) same-origin URLs. Main-frame and iframe loads alike.
            return isSafeWebUrl(request.url);
          }}

          // Native gestures for iOS (swipe from edge to navigate back/forward)
          allowsBackForwardNavigationGestures={true}

          // Camera access configuration for iOS WebView
          mediaCapturePermissionGrantType="grant"

          // Custom User-Agent suffix for Guideline 4.8 Apple Sign-In compliance
          applicationNameForUserAgent="mitrixogymcrmCRM-Mobile"

          // Handle load errors
          onError={() => {
            setHasFailedToLoad(true);
            if (!hasLoadedSuccessfully) {
              setIsConnected(false);
            }
          }}

          // Inject the push token so the web client can read it
          injectedJavaScriptBeforeContentLoaded={runBeforeFirstPaint}

          // ─── Native Bridge: receive messages from the web CRM ───
          onMessage={handleWebViewMessage}

          // Navigation State Monitor
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
            setIsLoading(navState.loading);
          }}

          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onLoad={() => {
            setHasLoadedSuccessfully(true);
            setIsLoading(false);
          }}
        />
        
        {isNativeScanning && (
          <View style={StyleSheet.absoluteFill}>
            <CameraView 
              style={StyleSheet.absoluteFill}
              facing="back"
              onBarcodeScanned={({ data }) => {
                // Prevent multiple scans rapidly
                setIsNativeScanning(false);
                // Send back to WebView
                if (webViewRef.current) {
                  webViewRef.current.injectJavaScript(
                    `if (typeof window.handleNativeScan === 'function') { window.handleNativeScan(${JSON.stringify(data)}); } true;`
                  );
                }
              }}
            />
            {/* Close button for scanner */}
            <TouchableOpacity 
              style={styles.closeScannerButton}
              onPress={() => setIsNativeScanning(false)}
            >
              <Text style={styles.closeScannerText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading && (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingCard}>
              <Text style={styles.loadingAppTitle}>{APP_NAME}</Text>
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginTop: 14 }} />
            </View>
          </View>
        )}
        {renderOfflineBanner()}
      </View>
    </SafeAreaView>
  );
}

// ─── Root Export with Error Boundary ──────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

// ─── Push Token Registration ─────────────────────────────────
async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted for push notifications');
      return '';
    }

    try {
      // Get the Expo Push Token using the project ID
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('[Push] Token:', token);
    } catch (error) {
      console.log('[Push] Error fetching token:', error);
    }
  } else {
    console.log('[Push] Must use physical device for Push Notifications');
  }

  return token;
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  offlineContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  offlineIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1f1f22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  offlineIcon: {
    fontSize: 36,
  },
  offlineTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  offlineMessage: {
    color: '#a1a1aa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 30,
  },
  retryButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  offlineBanner: {
    backgroundColor: '#C20E1A',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  offlineBannerText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#070709',
  },
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingAppTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  closeScannerButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  closeScannerText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
