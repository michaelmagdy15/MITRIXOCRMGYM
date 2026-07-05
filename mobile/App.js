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
import { requestCameraPermissionsAsync } from 'expo-camera';

// ─── Configuration ─────────────────────────────────────────────
// Single source of truth: app.config.js reads env vars at build time
// and passes them through Constants.expoConfig.extra.
// Fallback chain: EAS env → config.json (white-label) → hardcoded default
const PRODUCTION_URL =
  Constants?.expoConfig?.extra?.PRODUCTION_URL || 'https://strike-egy.com/';
const APP_NAME =
  Constants?.expoConfig?.extra?.APP_NAME || 'STRIKE';

// ─── Notification Handler ──────────────────────────────────────
// Configure notification behavior for when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
        const data = response.notification.request.content.data;
        console.log('[Notification] Tapped:', data);

        // Deep link: if the push payload includes a url, navigate the WebView there
        if (data?.url && webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `window.location.href = ${JSON.stringify(String(data.url))};`
          );
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

        case 'NAVIGATE':
          // Navigate WebView to a specific URL
          if (message.payload?.url) {
            webViewRef.current?.injectJavaScript(
              `window.location.href = ${JSON.stringify(String(message.payload.url))}; true;`
            );
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

  // ─── Offline Full Screen ──────────────────────────────
  if (!isConnected && !hasLoadedSuccessfully) {
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
          cacheMode="LOAD_CACHE_ELSE_NETWORK"

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

          // Native gestures for iOS (swipe from edge to navigate back/forward)
          allowsBackForwardNavigationGestures={true}

          // Camera access configuration for iOS WebView
          mediaCapturePermissionGrantType="grant"

          // Custom User-Agent suffix for Guideline 4.8 Apple Sign-In compliance
          applicationNameForUserAgent="mitrixogymcrmCRM-Mobile"

          // Handle load errors
          onError={() => {
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
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF231F" />
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
    backgroundColor: '#FFFFFF',
  },
});
