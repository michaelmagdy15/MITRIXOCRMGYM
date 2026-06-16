import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const PRODUCTION_URL = 'https://dashboard.mitrixogymcrmboxing-eg.pro/';

// Configure notification behavior for when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const webViewRef = useRef(null);
  const [isConnected, setIsConnected] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [key, setKey] = useState(0); // For reloading WebView
  const [expoPushToken, setExpoPushToken] = useState('');

  // 1. Get Push Notification Permission and Token
  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
      }
    });

    // Listener for when a notification is received while app is running
    const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    // Listener for when a user taps/interacts with a notification
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification response:', response);
      // You can inject JavaScript here to navigate to a specific tab on click if needed:
      // webViewRef.current?.injectJavaScript(`window.handleNotificationClick(${JSON.stringify(response)});`);
    });

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

  // 3. Monitor Android hardware back button
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

  const handleRetry = () => {
    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected !== false);
      setKey((prevKey) => prevKey + 1);
    });
  };

  const renderLoading = () => (
    <View style={styles.loaderContainer}>
      <ActivityIndicator size="large" color="#ffffff" />
      <Text style={styles.loaderText}>MITRIXOGYMCRM</Text>
      <Text style={styles.loaderSubtext}>Loading your dashboard...</Text>
    </View>
  );

  // Script to inject into the WebView to make the push token globally accessible in your web app
  const runBeforeFirstPaint = `
    window.expoPushToken = "${expoPushToken}";
    true;
  `;

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" backgroundColor="#000" />
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor="#000" />
      <View style={styles.container}>
        <WebView
          key={key}
          ref={webViewRef}
          source={{ uri: PRODUCTION_URL }}
          style={styles.webview}
          
          // Technical WebView configurations
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
          
          // Native gestures for iOS (swipe from edge to navigate back/forward)
          allowsBackForwardNavigationGestures={true}
          
          // Camera access configuration for iOS WebView
          mediaCapturePermissionGrantType="grant"
          
          // Custom User-Agent suffix for Guideline 4.8 Apple Sign-In compliance
          applicationNameForUserAgent="mitrixogymcrmCRM-Mobile"
          
          // Handle load errors by showing custom offline screen
          onError={() => setIsConnected(false)}
          
          // Inject the push token so the web client can read it
          injectedJavaScriptBeforeContentLoaded={runBeforeFirstPaint}
          
          // Navigation State Monitor
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
            setIsLoading(navState.loading);
          }}
          
          // Custom renderers
          startInLoadingState={true}
          renderLoading={renderLoading}
        />
      </View>
    </SafeAreaView>
  );
}

// Function to request permission and fetch the device's push token
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
      console.log('Failed to get push token for push notification!');
      return '';
    }

    try {
      // Get the Expo Push Token using the project ID
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log('Generated Push Token:', token);
    } catch (error) {
      console.log('Error fetching Expo push token:', error);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  loaderText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginTop: 20,
    textTransform: 'uppercase',
  },
  loaderSubtext: {
    color: '#a1a1aa',
    fontSize: 14,
    marginTop: 8,
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
});
