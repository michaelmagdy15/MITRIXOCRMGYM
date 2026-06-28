import { db, getTenantId } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

function getTenantBrandedName(): string {
  try {
    const tenantId = getTenantId();
    if (!tenantId || tenantId === 'default') {
      return '';
    }
    if (tenantId.toLowerCase() === 'strike') {
      return 'STRIKE';
    }
    if (tenantId.toLowerCase() === 'inzan') {
      return 'INZAN';
    }
    return tenantId.charAt(0).toUpperCase() + tenantId.slice(1);
  } catch {
    return '';
  }
}

/**
 * Saves the Expo Push Token to the user's account and client record in Firestore.
 */
export async function saveExpoPushToken(userId: string, token: string, clientRecordId?: string) {
  if (!userId || !token) return;
  try {
    // 1. Save to users collection
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      expoPushToken: token,
      lastTokenUpdate: new Date().toISOString()
    });
    console.log('[Push Service] Token saved to user profile:', token);

    // 2. Save to clients collection if clientRecordId is provided
    if (clientRecordId) {
      const clientRef = doc(db, 'clients', clientRecordId);
      await updateDoc(clientRef, {
        expoPushToken: token
      });
      console.log('[Push Service] Token saved to client profile:', token);
    }
  } catch (err) {
    console.error('[Push Service] Error saving push token:', err);
  }
}

/**
 * Sends a push notification to a single Expo push token.
 */
export async function sendPushNotification(expoPushToken: string, title: string, body: string, data?: any) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
    console.warn('[Push Service] Invalid Expo push token:', expoPushToken);
    return;
  }

  try {
    const brandedName = getTenantBrandedName();
    const finalTitle = brandedName ? `${brandedName}: ${title}` : title;

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: expoPushToken,
        sound: 'default',
        title: finalTitle,
        body,
        data,
      }),
    });
    const resData = await response.json();
    console.log('[Push Service] Sent single push notification:', resData);
    return resData;
  } catch (err) {
    console.error('[Push Service] Error sending push notification:', err);
  }
}

/**
 * Sends a push notification to all staff and admins who have registered an Expo push token.
 */
export async function notifyAdmins(title: string, body: string, data?: any) {
  try {
    const q = query(
      collection(db, 'users'), 
      where('role', 'in', ['admin', 'crm_admin', 'manager', 'rep'])
    );
    const snap = await getDocs(q);
    const tokens = snap.docs
      .map(doc => doc.data().expoPushToken)
      .filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken'));

    if (tokens.length === 0) {
      console.log('[Push Service] No admin/staff tokens found to notify.');
      return;
    }

    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const resData = await response.json();
    console.log('[Push Service] Bulk Admin Push response:', resData);
  } catch (err) {
    console.error('[Push Service] Error notifying admins:', err);
  }
}

/**
 * Sends a push notification to a specific client/member.
 */
export async function notifyClient(clientId: string, title: string, body: string, data?: any) {
  if (!clientId) return;
  try {
    const clientRef = doc(db, 'clients', clientId);
    const clientSnap = await getDoc(clientRef);
    if (!clientSnap.exists()) {
      console.warn(`[Push Service] Client document not found: ${clientId}`);
      return;
    }
    const clientData = clientSnap.data();
    const token = clientData.expoPushToken;
    if (token) {
      await sendPushNotification(token, title, body, data);
    } else {
      console.log(`[Push Service] No push token registered for client: ${clientId}`);
    }
  } catch (err) {
    console.error('[Push Service] Error notifying client:', err);
  }
}

/**
 * Sends a push notification to all registered members.
 */
export async function notifyAllMembers(title: string, body: string, data?: any) {
  try {
    const q = query(
      collection(db, 'clients')
    );
    const snap = await getDocs(q);
    const tokens = snap.docs
      .map(doc => doc.data().expoPushToken)
      .filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken'));

    if (tokens.length === 0) {
      console.log('[Push Service] No member tokens found.');
      return { successCount: 0, totalCount: 0 };
    }

    // De-duplicate tokens
    const uniqueTokens = Array.from(new Set(tokens));

    const chunks: string[][] = [];
    for (let i = 0; i < uniqueTokens.length; i += 100) {
      chunks.push(uniqueTokens.slice(i, i + 100));
    }

    let successCount = 0;
    for (const chunk of chunks) {
      const messages = chunk.map(token => ({
        to: token,
        sound: 'default',
        title,
        body,
        data
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      const resData = await response.json();
      console.log('[Push Service] Sent batch notifications:', resData);
      successCount += chunk.length;
    }

    return { successCount, totalCount: uniqueTokens.length };
  } catch (err) {
    console.error('[Push Service] Error sending push to all members:', err);
    throw err;
  }
}
