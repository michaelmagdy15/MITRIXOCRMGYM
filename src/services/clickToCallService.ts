import { db, getTenantId } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { sendPushNotification } from './pushService';
import { isRunningInNativeApp, requestNativeDial } from '../utils/nativeBridge';

export type CallRequestStatus =
  | 'pending'
  | 'ringing_device'
  | 'dialing'
  | 'completed'
  | 'expired'
  | 'cancelled';

export interface CallRequestRecord {
  id: string;
  notificationId?: string;
  tenantId: string;
  salespersonId: string;
  salespersonName: string;
  clientId?: string;
  memberId?: string;
  leadName: string;
  phoneNumber: string;
  rawPhone: string;
  status: CallRequestStatus;
  pushSent: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAtMs: number;
  acknowledgedAt?: string;
  dialedAt?: string;
  outcome?: string;
  notes?: string;
}

export interface ClickToCallModalTarget {
  clientId?: string;
  memberId?: string;
  name: string;
  phone: string;
  backupPhone?: string;
  status?: string;
  branch?: string;
  packageType?: string;
  source?: string;
  autoTrigger?: boolean;
}

const CALL_REQUEST_TTL_MS = 2 * 60 * 1000; // 2 minutes TTL for click-to-call notifications

// Unique ID for this browser tab/device so the sender tab does not treat its own click as the receiving mobile device
export const CURRENT_DEVICE_SESSION_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Normalizes a phone number into E.164 format suitable for `tel:` links and CTI dispatch.
 * Defaults local 11-digit Egyptian mobile numbers (01xxxxxxxxx) to +201xxxxxxxxx.
 */
export function normalizeDialPhone(rawPhone: string): string {
  if (!rawPhone) return '';
  const trimmed = rawPhone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  // Handle 00 international prefix (e.g., 00201282820189 -> +201282820189)
  if (digits.startsWith('00') && digits.length > 9) {
    return `+${digits.slice(2)}`;
  }

  // Handle Egyptian local format: 010/011/012/015 + 8 digits (11 digits total)
  if (/^01[0125]\d{8}$/.test(digits)) {
    return `+20${digits.slice(1)}`;
  }

  // Handle Egyptian format missing leading 0: 10/11/12/15 + 8 digits (10 digits total)
  if (/^1[0125]\d{8}$/.test(digits)) {
    return `+20${digits}`;
  }

  // Handle Egyptian format with country code 20: 2010/2011/2012/2015 + 8 digits (12 digits total)
  if (/^201[0125]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  // Handle accidental 2001... prefix
  if (/^2001[0125]\d{8}$/.test(digits)) {
    return `+20${digits.slice(3)}`;
  }

  if (hasPlus) {
    return `+${digits}`;
  }

  return digits.length >= 10 ? `+${digits}` : digits;
}

/**
 * Checks whether the current browser session is running on a mobile phone/tablet or inside the native Expo app.
 */
export function isMobileDeviceSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (isRunningInNativeApp()) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

/**
 * Triggers the native OS dialer on the current device (`tel:` URI or React Native bridge).
 */
export function triggerLocalDeviceDialer(phoneNumber: string, leadName?: string, requestId?: string): void {
  const formatted = normalizeDialPhone(phoneNumber);
  if (!formatted) return;

  if (isRunningInNativeApp()) {
    requestNativeDial(formatted, leadName, requestId);
    return;
  }

  window.location.href = `tel:${formatted}`;
}

/**
 * Shows a native OS / Browser notification on the mobile device when permitted.
 */
export async function showDeviceClickToCallNotification(record: CallRequestRecord): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    const title = `📞 Call ${record.leadName || 'Member'}`;
    const options: NotificationOptions = {
      body: `Tap to dial ${record.phoneNumber} now`,
      tag: `click_to_call_${record.id}`,
      requireInteraction: true,
      data: {
        type: 'CLICK_TO_CALL',
        requestId: record.id,
        phoneNumber: record.phoneNumber,
        leadName: record.leadName,
      },
    };

    const notif = new Notification(title, options);
    notif.onclick = () => {
      window.focus();
      void updateCallRequestStatus(record.id, 'dialing');
      triggerLocalDeviceDialer(record.phoneNumber, record.leadName, record.id);
      notif.close();
    };
  } catch (err) {
    console.warn('[ClickToCall] Browser notification fallback warning:', err);
  }
}

/**
 * Dispatches a Cross-Device Click-to-Call notification to the logged-in mobile device:
 * 1. Writes a real-time `callRequests/call_{salespersonId}` document in Firestore.
 * 2. Writes a notification document to `notifications` so the logged-in mobile device's Notification Center & real-time listener receive it immediately.
 * 3. Sends a high-priority Expo Push Notification if the user has a registered mobile app push token.
 */
export async function initiateClickToCall(params: {
  salespersonId: string;
  salespersonName: string;
  clientId?: string;
  memberId?: string;
  leadName: string;
  phoneNumber: string;
}): Promise<{
  requestId: string;
  notificationId: string;
  phoneNumber: string;
  pushSent: boolean;
  hasRegisteredMobileDevice: boolean;
}> {
  const formattedPhone = normalizeDialPhone(params.phoneNumber);
  if (!formattedPhone) {
    throw new Error('Invalid phone number');
  }

  const tenantId = getTenantId();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtMs = now.getTime() + CALL_REQUEST_TTL_MS;

  const requestId = `call_${params.salespersonId}`;
  const notificationId = `ctc_${params.salespersonId}_${Date.now()}`;

  // Look up salesperson's registered mobile push token in tenant Firestore
  let expoPushToken = '';
  try {
    const userSnap = await getDoc(doc(db, 'users', params.salespersonId));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (typeof userData?.expoPushToken === 'string' && userData.expoPushToken.startsWith('ExponentPushToken')) {
        expoPushToken = userData.expoPushToken;
      }
    }
  } catch (err) {
    console.warn('[ClickToCall] Could not read user push token:', err);
  }

  const hasRegisteredMobileDevice = Boolean(expoPushToken);

  const record: CallRequestRecord & { senderSessionId: string } = {
    id: requestId,
    notificationId,
    tenantId,
    salespersonId: params.salespersonId,
    salespersonName: params.salespersonName || 'Sales Rep',
    ...(params.clientId ? { clientId: params.clientId } : {}),
    ...(params.memberId ? { memberId: params.memberId } : {}),
    leadName: params.leadName || 'Member',
    phoneNumber: formattedPhone,
    rawPhone: params.phoneNumber,
    status: 'pending',
    pushSent: hasRegisteredMobileDevice,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAtMs,
    senderSessionId: CURRENT_DEVICE_SESSION_ID,
  };

  // 1. Write to `notifications` collection (always allowed by tenant rules & powers Notification Center + Mobile listener)
  await setDoc(doc(db, 'notifications', notificationId), {
    id: notificationId,
    recipientUid: params.salespersonId,
    recipientId: params.salespersonId,
    salespersonId: params.salespersonId,
    type: 'click_to_call',
    title: `📞 Click to Call: ${params.leadName || 'Member'}`,
    body: `Tap to dial ${formattedPhone}`,
    description: `Tap to call ${params.leadName || 'Member'} at ${formattedPhone}`,
    phoneNumber: formattedPhone,
    leadName: params.leadName || 'Member',
    clientId: params.clientId || '',
    memberId: params.memberId || '',
    requestId,
    status: 'pending',
    read: false,
    senderSessionId: CURRENT_DEVICE_SESSION_ID,
    createdAt: nowIso,
    expiresAtMs,
  });

  // 2. Write to `callRequests` collection for live status tracking
  try {
    await setDoc(doc(db, 'callRequests', requestId), record);
  } catch (err) {
    console.warn('[ClickToCall] callRequests write fallback (using notifications doc):', err);
  }

  // 3. Send native Expo Push Notification if user has a registered Expo push token
  let pushSent = false;
  if (expoPushToken) {
    try {
      await sendPushNotification(
        expoPushToken,
        `📞 Call ${params.leadName || 'Lead'}`,
        `Tap to dial ${formattedPhone} now`,
        {
          type: 'CLICK_TO_CALL',
          categoryId: 'click_to_call',
          requestId,
          notificationId,
          phoneNumber: formattedPhone,
          leadName: params.leadName || 'Lead',
          clientId: params.clientId || '',
          tenantId,
        }
      );
      pushSent = true;
    } catch (pushErr) {
      console.error('[ClickToCall] Failed to send push notification:', pushErr);
    }
  }

  return {
    requestId,
    notificationId,
    phoneNumber: formattedPhone,
    pushSent,
    hasRegisteredMobileDevice,
  };
}

/**
 * Updates the status of an active call request in Firestore.
 */
export async function updateCallRequestStatus(
  requestId: string,
  status: CallRequestStatus,
  extra?: Partial<CallRequestRecord>
): Promise<void> {
  if (!requestId) return;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'callRequests', requestId), {
      status,
      updatedAt: nowIso,
      ...(status === 'ringing_device' ? { acknowledgedAt: nowIso } : {}),
      ...(status === 'dialing' ? { dialedAt: nowIso } : {}),
      ...(extra || {}),
    });
  } catch {
    // Ignore if callRequests doc doesn't exist
  }

  if (extra?.notificationId) {
    try {
      await updateDoc(doc(db, 'notifications', extra.notificationId), {
        status,
        read: status === 'dialing' || status === 'completed' || status === 'cancelled',
        updatedAt: nowIso,
      });
    } catch {
      // Ignore
    }
  }
}

/**
 * Subscribes to a specific call request document (used by the laptop modal to watch mobile handoff status).
 */
export function subscribeToCallRequest(
  requestId: string,
  onChange: (record: CallRequestRecord | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'callRequests', requestId),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange({ ...(snap.data() as CallRequestRecord), id: snap.id });
    },
    (err) => {
      console.error('[ClickToCall] Error listening to call request:', err);
    }
  );
}

/**
 * Subscribes to incoming pending call requests for a logged-in salesperson on their other devices (e.g. mobile phone).
 * Listens to `callRequests` AND `notifications` so notifications are guaranteed to arrive in real time.
 */
export function subscribeToIncomingCallRequests(
  salespersonId: string,
  onIncoming: (record: CallRequestRecord) => void
): Unsubscribe {
  const seenIds = new Set<string>();

  const qCallRequests = query(
    collection(db, 'callRequests'),
    where('salespersonId', '==', salespersonId),
    where('status', '==', 'pending')
  );

  const unsub1 = onSnapshot(
    qCallRequests,
    (snap) => {
      const nowMs = Date.now();
      snap.docs.forEach((docSnap) => {
        const raw = docSnap.data() as CallRequestRecord & { senderSessionId?: string };
        // Do not trigger incoming call alert on the exact same browser tab that clicked "Call Now"
        if (raw.senderSessionId && raw.senderSessionId === CURRENT_DEVICE_SESSION_ID) {
          return;
        }
        const dedupeKey = `${docSnap.id}_${raw.createdAt}`;
        if (seenIds.has(dedupeKey)) return;

        const data = { ...raw, id: docSnap.id };
        if (data.expiresAtMs && data.expiresAtMs > nowMs) {
          seenIds.add(dedupeKey);
          onIncoming(data);
        } else if (data.status === 'pending') {
          void updateCallRequestStatus(data.id, 'expired');
        }
      });
    },
    (err) => {
      console.warn('[ClickToCall] Error subscribing to incoming callRequests:', err);
    }
  );

  const qNotifications = query(
    collection(db, 'notifications'),
    where('recipientUid', '==', salespersonId),
    where('read', '==', false)
  );

  const unsub2 = onSnapshot(
    qNotifications,
    (snap) => {
      const nowMs = Date.now();
      snap.docs.forEach((docSnap) => {
        const raw = docSnap.data() as any;
        if (raw.type !== 'click_to_call' || raw.status !== 'pending') return;
        if (raw.senderSessionId && raw.senderSessionId === CURRENT_DEVICE_SESSION_ID) {
          return;
        }
        const dedupeKey = `${raw.requestId || docSnap.id}_${raw.createdAt}`;
        if (seenIds.has(dedupeKey)) return;

        if (raw.expiresAtMs && raw.expiresAtMs > nowMs) {
          seenIds.add(dedupeKey);
          onIncoming({
            id: raw.requestId || `call_${salespersonId}`,
            notificationId: docSnap.id,
            tenantId: getTenantId(),
            salespersonId,
            salespersonName: '',
            clientId: raw.clientId,
            memberId: raw.memberId,
            leadName: raw.leadName || 'Member',
            phoneNumber: raw.phoneNumber,
            rawPhone: raw.phoneNumber,
            status: 'pending',
            pushSent: false,
            createdAt: raw.createdAt,
            updatedAt: raw.createdAt,
            expiresAtMs: raw.expiresAtMs,
          });
        }
      });
    },
    (err) => {
      console.warn('[ClickToCall] Error subscribing to incoming click_to_call notifications:', err);
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

/**
 * Dispatches a global browser event to open the Click-to-Call modal from anywhere in the CRM.
 */
export function openClickToCallModal(target: ClickToCallModalTarget): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ClickToCallModalTarget>('crm:open-click-to-call', { detail: target }));
}
