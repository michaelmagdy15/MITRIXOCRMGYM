/**
 * Native Bridge — Communication between web CRM and React Native WebView
 *
 * This module provides utilities for the web app to send messages to the
 * native Expo mobile wrapper via `window.ReactNativeWebView.postMessage()`.
 *
 * The native side handles these messages in App.js's `onMessage` handler.
 *
 * Usage in any component:
 *   import { sendToNative, isRunningInNativeApp } from '@/utils/nativeBridge';
 *   if (isRunningInNativeApp()) sendToNative('REFRESH');
 */

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (data: string) => void;
    };
    expoPushToken?: string;
  }
}

export type NativeMessageType =
  | 'REQUEST_CAMERA'
  | 'NAVIGATE'
  | 'REFRESH'
  | 'HAPTIC'
  | 'LOG';

interface NativeMessage {
  type: NativeMessageType;
  payload?: unknown;
}

/**
 * Checks if the web app is running inside the React Native WebView wrapper.
 */
export function isRunningInNativeApp(): boolean {
  return !!(
    window.ReactNativeWebView ||
    window.expoPushToken ||
    /mitrixogymcrmCRM-Mobile/i.test(navigator.userAgent)
  );
}

/**
 * Send a typed message to the native React Native layer.
 * No-ops gracefully when not running inside the native wrapper.
 */
export function sendToNative(type: NativeMessageType, payload?: unknown): void {
  if (window.ReactNativeWebView) {
    const message: NativeMessage = { type, payload };
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
}

/**
 * Request camera permission from the native layer.
 * Returns a promise that resolves with the permission status.
 */
export function requestNativeCamera(): Promise<string> {
  return new Promise((resolve) => {
    if (!window.ReactNativeWebView) {
      resolve('not-native');
      return;
    }

    const handler = (e: Event) => {
      const status = (e as CustomEvent).detail;
      window.removeEventListener('nativeCameraPermission', handler);
      resolve(status);
    };

    window.addEventListener('nativeCameraPermission', handler);
    sendToNative('REQUEST_CAMERA');

    // Timeout after 10s
    setTimeout(() => {
      window.removeEventListener('nativeCameraPermission', handler);
      resolve('timeout');
    }, 10000);
  });
}

/**
 * Request a full WebView reload from the native layer.
 * Useful after major data changes that require a fresh state.
 */
export function requestNativeRefresh(): void {
  sendToNative('REFRESH');
}
