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

export interface SavedAuthSessionPayload {
  token?: string;
  email?: string;
  memberId?: string;
  coachId?: string;
  password?: string;
  tenantId?: string;
  updatedAt?: string;
}

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (data: string) => void;
    };
    expoPushToken?: string;
    __nativeSavedAuth?: SavedAuthSessionPayload | null;
  }
}

export type NativeMessageType =
  | 'REQUEST_CAMERA'
  | 'START_SCANNER'
  | 'STOP_SCANNER'
  | 'DIAL_PHONE'
  | 'NAVIGATE'
  | 'REFRESH'
  | 'HAPTIC'
  | 'SAVE_AUTH_SESSION'
  | 'CLEAR_AUTH_SESSION'
  | 'LOG';

interface NativeMessage {
  type: NativeMessageType;
  payload?: unknown;
}

const MOBILE_AUTH_STORAGE_KEY = 'mitrixo_mobile_saved_auth_v1';

/**
 * Checks if the web app is running inside the React Native WebView wrapper.
 */
export function isRunningInNativeApp(): boolean {
  return !!(
    window.ReactNativeWebView ||
    window.expoPushToken ||
    /mitrixogymcrmCRM-Mobile|Strike.*Mobile|STRIKE|Inzan.*Mobile|INZAN|inzanathletics/i.test(navigator.userAgent)
  );
}

/**
 * Checks if the app is running on a mobile device (Native WebView, iOS/Android browser, or standalone PWA).
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    isRunningInNativeApp() ||
    /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true ||
    window.innerWidth < 768
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
 * Persist mobile auth session across both localStorage and the native React Native shell
 * so mobile users stay logged in even if the OS evicts WebView IndexedDB/cookies.
 */
export function saveMobileAuthSession(session: SavedAuthSessionPayload): void {
  try {
    const existingRaw = localStorage.getItem(MOBILE_AUTH_STORAGE_KEY);
    const existing: SavedAuthSessionPayload = existingRaw ? JSON.parse(existingRaw) : {};
    const merged: SavedAuthSessionPayload = {
      ...existing,
      ...session,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(MOBILE_AUTH_STORAGE_KEY, JSON.stringify(merged));
    window.__nativeSavedAuth = merged;
    sendToNative('SAVE_AUTH_SESSION', merged);
  } catch (err) {
    console.warn('[NativeBridge] Could not save mobile auth session:', err);
  }
}

/**
 * Read any saved mobile auth session from the native bridge injection or localStorage.
 */
export function getSavedMobileAuthSession(): SavedAuthSessionPayload | null {
  try {
    if (window.__nativeSavedAuth && (window.__nativeSavedAuth.token || window.__nativeSavedAuth.email || window.__nativeSavedAuth.password)) {
      return window.__nativeSavedAuth;
    }
    const raw = localStorage.getItem(MOBILE_AUTH_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as SavedAuthSessionPayload;
    }
  } catch (err) {
    console.warn('[NativeBridge] Could not read saved mobile auth session:', err);
  }
  return null;
}

/**
 * Clear saved mobile auth session when the user explicitly logs out.
 */
export function clearMobileAuthSession(): void {
  try {
    localStorage.removeItem(MOBILE_AUTH_STORAGE_KEY);
    window.__nativeSavedAuth = null;
    sendToNative('CLEAR_AUTH_SESSION');
  } catch (err) {
    console.warn('[NativeBridge] Could not clear mobile auth session:', err);
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

/**
 * Request the native mobile shell to launch the system phone dialer (`tel:`).
 */
export function requestNativeDial(phoneNumber: string, leadName?: string, requestId?: string): void {
  sendToNative('DIAL_PHONE', { phoneNumber, leadName, requestId });
}
