import { getFirestore } from 'firebase-admin/firestore';
import { isStandaloneMode } from '../config/environment.js';
import { dispatchNotificationEvent } from '../services/notificationEventService.js';

export interface MembershipExpirationScanOptions {
  referenceDate?: Date | string;
  gymName?: string;
  dryRun?: boolean;
}

export interface MembershipExpirationScanResult {
  tenantDb: string;
  scannedClients: number;
  expiredClients: number;
  cancelledBookings: number;
  expiringNotificationsSent: number;
  expiredNotificationsSent: number;
}

/**
 * Safely parses any date value to milliseconds, extending date-only strings
 * (e.g. YYYY-MM-DD) to the end of that day (23:59:59.999).
 */
export function toEndOfDayMs(dateVal: any): number {
  if (!dateVal) return NaN;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return NaN;
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
    return new Date(d).setHours(23, 59, 59, 999);
  }
  return d.getTime();
}

/**
 * Safely extracts year, month (0-indexed), and day from any date or date-only string.
 */
export function parseDateParts(dateVal: any): { year: number; month: number; day: number } | null {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match && match[1] && match[2] && match[3]) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10) - 1,
        day: parseInt(match[3], 10)
      };
    }
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate()
  };
}

/**
 * Calculates calendar day difference between a target date and a reference date (target - ref).
 * Returns positive if target is in future, negative if in past, 0 if same day.
 */
export function getCalendarDaysDiff(targetDateVal: any, refDate: Date = new Date()): number {
  const targetParts = parseDateParts(targetDateVal);
  if (!targetParts) return NaN;

  const targetUtc = Date.UTC(targetParts.year, targetParts.month, targetParts.day);
  const refUtc = Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());

  const msPerDay = 86400000;
  return Math.round((targetUtc - refUtc) / msPerDay);
}

/**
 * Resolves the client's latest active expiration date string from active packages or membershipExpiry / endDate.
 */
export function getClientActiveExpiryDate(client: any): string | null {
  let latestEndMs = NaN;
  let latestEndStr: string | null = null;

  if (Array.isArray(client.packages) && client.packages.length > 0) {
    for (const pkg of client.packages) {
      const pkgStatus = (pkg.status || '').toString().toLowerCase();
      if (pkgStatus === 'inactive' || pkgStatus === 'cancelled' || pkgStatus === 'expired') {
        continue;
      }
      if (pkg.endDate) {
        const ms = toEndOfDayMs(pkg.endDate);
        if (!isNaN(ms) && (isNaN(latestEndMs) || ms > latestEndMs)) {
          latestEndMs = ms;
          latestEndStr = pkg.endDate;
        }
      }
    }
  }

  if (client.membershipExpiry) {
    const ms = toEndOfDayMs(client.membershipExpiry);
    if (!isNaN(ms) && (isNaN(latestEndMs) || ms > latestEndMs)) {
      latestEndMs = ms;
      latestEndStr = client.membershipExpiry;
    }
  } else if (!latestEndStr && client.endDate) {
    const ms = toEndOfDayMs(client.endDate);
    if (!isNaN(ms)) {
      latestEndMs = ms;
      latestEndStr = client.endDate;
    }
  }

  return latestEndStr;
}

/**
 * Attempts to retrieve an Expo or FCM push token from the client document or connected user record.
 */
export async function getClientPushToken(db: FirebaseFirestore.Firestore, client: any): Promise<string | null> {
  const directToken = client.expoPushToken || client.fcmToken || client.pushToken;
  if (directToken && typeof directToken === 'string' && directToken.trim()) {
    return directToken.trim();
  }

  const portalUserId = client.portalUserId || client.userId;
  if (portalUserId) {
    try {
      const uSnap = await db.collection('users').doc(portalUserId).get();
      if (uSnap.exists) {
        const uData = uSnap.data();
        const uToken = uData?.expoPushToken || uData?.fcmToken || uData?.pushToken;
        if (uToken && typeof uToken === 'string' && uToken.trim()) {
          return uToken.trim();
        }
      }
    } catch (err) {
      console.warn(`[ExpirationJob] Error fetching push token for user ${portalUserId}:`, err);
    }
  }

  return null;
}

/**
 * Fallback guardrail: Computes the virtual effective status of a client.
 * Guarantees that any client whose membership expiry is in the past
 * is never treated as 'Active' even if the database record has not yet updated.
 */
export function getEffectiveClientStatus(client: any): 'Active' | 'Expired' | 'Frozen' | 'Inactive' | 'Pending' | 'Suspended' {
  if (!client) return 'Inactive';

  const rawStatus = (client.status || '').toString().trim();
  const normalized = rawStatus.toLowerCase();

  if (normalized === 'frozen') return 'Frozen';
  if (normalized === 'suspended') return 'Suspended';
  if (normalized === 'inactive') return 'Inactive';
  if (normalized === 'pending') return 'Pending';

  const now = new Date();
  const todayMs = now.getTime();

  // Check client-level membershipExpiry
  if (client.membershipExpiry) {
    const expiryMs = toEndOfDayMs(client.membershipExpiry);
    if (!isNaN(expiryMs) && expiryMs < todayMs) {
      return 'Expired';
    }
  }

  // Check client-level endDate fallback
  if (client.endDate) {
    const endMs = toEndOfDayMs(client.endDate);
    if (!isNaN(endMs) && endMs < todayMs) {
      return 'Expired';
    }
  }

  // Check packages array
  if (Array.isArray(client.packages) && client.packages.length > 0) {
    const hasActiveFuturePackage = client.packages.some((pkg: any) => {
      const pkgStatus = (pkg.status || '').toString().toLowerCase();
      if (pkgStatus === 'inactive' || pkgStatus === 'cancelled' || pkgStatus === 'expired') {
        return false;
      }
      if (pkg.endDate) {
        const pkgEndMs = toEndOfDayMs(pkg.endDate);
        if (!isNaN(pkgEndMs) && pkgEndMs < todayMs) {
          return false;
        }
      }
      if (pkg.sessionsRemaining !== undefined && pkg.sessionsRemaining <= 0 && pkg.sessionsTotal !== 'unlimited') {
        return false;
      }
      return true;
    });

    if (!hasActiveFuturePackage && (normalized === 'active' || !rawStatus)) {
      // If client has positive session balance and no past expiry, preserve Active
      const hasDirectCredits = client.sessionsRemaining === 'unlimited' || (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0);
      const isExpiryValid = !client.membershipExpiry || toEndOfDayMs(client.membershipExpiry) >= todayMs;
      if (hasDirectCredits && isExpiryValid) {
        return 'Active';
      }
      return 'Expired';
    }
  }

  return (normalized === 'active' || rawStatus === 'ACTIVE') ? 'Active' : (client.status || 'Active');
}

/**
 * Dynamic Membership Status Calculator
 * Returns 'ACTIVE' | 'EXPIRED' | 'HOLD'
 */
export function getEffectiveStatus(member: any): 'ACTIVE' | 'EXPIRED' | 'HOLD' {
  if (!member) return 'EXPIRED';
  const rawStatus = (member.status || '').toString().trim().toUpperCase();
  if (rawStatus === 'HOLD' || rawStatus === 'FROZEN') {
    return 'HOLD';
  }

  const now = new Date();
  const validUntilStr = member.validUntil || member.expiryDate || member.expirationDate || member.membershipExpiry || member.endDate;
  if (validUntilStr) {
    const validUntilMs = toEndOfDayMs(validUntilStr);
    if (!isNaN(validUntilMs) && validUntilMs < now.getTime()) {
      return 'EXPIRED';
    }
  }

  const sessionsLeft = member.sessionsLeft !== undefined ? Number(member.sessionsLeft) : member.sessionsRemaining !== undefined && member.sessionsRemaining !== 'unlimited' ? Number(member.sessionsRemaining) : undefined;
  const isUnlimited = member.isUnlimited === true || member.packageType?.toLowerCase?.().includes('unlimited') || member.sessionsRemaining === 'unlimited';
  if (!isUnlimited && sessionsLeft !== undefined && !isNaN(sessionsLeft) && sessionsLeft <= 0) {
    return 'EXPIRED';
  }

  if (rawStatus === 'EXPIRED' || rawStatus === 'INACTIVE') {
    return 'EXPIRED';
  }

  return 'ACTIVE';
}

/**
 * Idempotent worker that scans a Firestore tenant database for expired memberships,
 * transitions their status to 'Expired', updates package statuses, invalidates future bookings,
 * records an immutable audit log entry in 'membership_status_changes', and dispatches
 * mobile app push & in-app notifications for both expiring (7, 3, 1 days) and expired members.
 */
export async function runMembershipExpirationScan(
  db: FirebaseFirestore.Firestore,
  options?: MembershipExpirationScanOptions
): Promise<MembershipExpirationScanResult> {
  const today = options?.referenceDate ? new Date(options.referenceDate) : new Date();
  const todayIso = today.toISOString();
  const todayDateStr = todayIso.slice(0, 10);
  const dryRun = options?.dryRun === true;

  const dbId = (db as any)?.databaseId || '';
  const isTenantInzan = dbId.includes('inzan');
  const resolvedGymName = options?.gymName || (isTenantInzan ? 'INZAN Athletics' : 'Strike Boxing Club');

  let expiredCount = 0;
  let cancelledBookingsTotal = 0;
  let expiringNotificationsCount = 0;
  let expiredNotificationsCount = 0;

  console.log(`[ExpirationJob] Scanning clients in database: ${dbId || 'default'}...`);

  // Query active clients (supporting 'Active', 'ACTIVE', and 'active')
  const activeQueries = [
    db.collection('clients').where('status', '==', 'Active').get(),
    db.collection('clients').where('status', '==', 'ACTIVE').get(),
    db.collection('clients').where('status', '==', 'active').get(),
  ];

  const snapshots = await Promise.all(activeQueries);
  const seenDocIds = new Set<string>();
  const docsToInspect: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      if (!seenDocIds.has(doc.id)) {
        seenDocIds.add(doc.id);
        docsToInspect.push(doc);
      }
    }
  }

  // Also check if any clients have no status set but have membershipExpiry in the past
  try {
    const noStatusSnap = await db.collection('clients').limit(300).get();
    for (const doc of noStatusSnap.docs) {
      if (!seenDocIds.has(doc.id)) {
        const data = doc.data();
        if (!data.status || data.status === '') {
          seenDocIds.add(doc.id);
          docsToInspect.push(doc);
        }
      }
    }
  } catch (err) {
    console.warn(`[ExpirationJob] Error scanning no-status clients in ${dbId || 'default'}:`, err);
  }

  for (const doc of docsToInspect) {
    const client = doc.data();
    const effective = getEffectiveClientStatus(client);

    if (effective === 'Expired') {
      const previousStatus = client.status || 'Active';
      const updates: Record<string, any> = {
        status: 'Expired',
        statusUpdatedAt: todayIso,
        updatedAt: todayIso
      };

      // Expire individual packages if they have ended
      if (Array.isArray(client.packages)) {
        updates.packages = client.packages.map((pkg: any) => {
          if (pkg.endDate) {
            const pkgEndMs = toEndOfDayMs(pkg.endDate);
            if (!isNaN(pkgEndMs) && pkgEndMs < today.getTime()) {
              return { ...pkg, status: 'Expired' };
            }
          }
          return pkg;
        });
      }

      if (!dryRun) {
        // Commit client update
        await doc.ref.update(updates);
      }
      expiredCount++;

      // Invalidate any future active bookings for this client
      let clientCancelledBookings = 0;
      try {
        const canonicalClientId = doc.id;
        const memberIdStr = client.memberId ? String(client.memberId) : '';

        // Query future bookings specifically for this client instead of querying all bookings in the gym
        const clientBookingSnaps = await Promise.all([
          db.collection('classBookings')
            .where('clientId', '==', canonicalClientId)
            .where('status', '==', 'booked')
            .get(),
          memberIdStr && memberIdStr !== canonicalClientId
            ? db.collection('classBookings')
                .where('memberId', '==', memberIdStr)
                .where('status', '==', 'booked')
                .get()
            : Promise.resolve({ docs: [] as any } as any)
        ]);

        const clientBookingDocs = [...clientBookingSnaps[0].docs, ...clientBookingSnaps[1].docs];
        const seenBookingIds = new Set<string>();

        for (const bDoc of clientBookingDocs) {
          if (seenBookingIds.has(bDoc.id)) continue;
          seenBookingIds.add(bDoc.id);
          const bData = bDoc.data();

          // Check if class schedule is in future
          const classScheduleId = bData.scheduleId || bData.classId;
          if (classScheduleId) {
            const schedDoc = await db.collection('classSchedules').doc(classScheduleId).get();
            if (schedDoc.exists) {
              const schedData = schedDoc.data()!;
              const classDateTime = schedData.date ? new Date(`${schedData.date}T${schedData.startTime || '00:00'}`) : null;
              
              if (classDateTime && classDateTime.getTime() > today.getTime()) {
                if (!dryRun) {
                  // Cancel future booking
                  await bDoc.ref.update({
                    status: 'cancelled_membership_expired',
                    cancelledAt: todayIso,
                    cancelReason: 'Membership expired'
                  });

                  // Remove from attendees
                  const attendees: string[] = schedData.attendees || [];
                  const updatedAttendees = attendees.filter(
                    id => id !== canonicalClientId && id !== memberIdStr
                  );
                  await schedDoc.ref.update({ attendees: updatedAttendees });
                }
                clientCancelledBookings++;
                cancelledBookingsTotal++;
              }
            }
          }
        }
      } catch (bookErr) {
        console.warn(`[ExpirationJob] Error invalidating bookings for client ${doc.id}:`, bookErr);
      }

      // Record immutable audit log entry in membership_status_changes
      if (!dryRun) {
        try {
          await db.collection('membership_status_changes').add({
            clientId: doc.id,
            memberId: client.memberId || '',
            clientName: client.name || '',
            previousStatus,
            newStatus: 'Expired',
            reason: 'membership_expired_scan',
            expiryDate: client.membershipExpiry || client.endDate || '',
            cancelledBookingsCount: clientCancelledBookings,
            changedAt: todayIso,
            system: true
          });
        } catch (auditErr) {
          console.warn(`[ExpirationJob] Failed to write audit log for ${doc.id}:`, auditErr);
        }

        // Dispatch membership_expired notification
        const expiredExpiryStr = (client.membershipExpiry || client.endDate || todayDateStr).slice(0, 10);
        const expiredIdempotencyKey = `membership_expired_${doc.id}_${expiredExpiryStr}`;

        try {
          const existingExpiredLogSnap = await db.collection('notifications_log')
            .where('clientId', '==', doc.id)
            .where('idempotencyKey', '==', expiredIdempotencyKey)
            .limit(1)
            .get();

          if (existingExpiredLogSnap.empty) {
            const pushToken = await getClientPushToken(db, client);
            const channels: ('in_app' | 'push')[] = pushToken ? ['in_app', 'push'] : ['in_app'];

            await dispatchNotificationEvent({
              eventType: 'membership_expired',
              recipientId: doc.id,
              recipientType: 'member',
              recipientName: client.name || 'Member',
              recipientEmail: client.email || undefined,
              channels,
              data: {
                clientName: client.name || 'Member',
                clientId: doc.id,
                memberId: client.memberId || '',
                gymName: resolvedGymName,
                expiryDate: expiredExpiryStr,
                expoPushToken: pushToken || undefined,
                fcmToken: pushToken || undefined,
                pushToken: pushToken || undefined,
                tenantId: dbId || undefined
              },
              idempotencyKey: expiredIdempotencyKey
            }, db as any);

            await db.collection('notifications_log').add({
              clientId: doc.id,
              memberId: client.memberId || '',
              clientName: client.name || '',
              eventType: 'membership_expired',
              expiryDate: expiredExpiryStr,
              idempotencyKey: expiredIdempotencyKey,
              channels,
              pushToken: pushToken || null,
              sentAt: todayIso,
              dateOnly: todayDateStr
            });
            expiredNotificationsCount++;
          }
        } catch (notifErr) {
          console.error(`[ExpirationJob] Error dispatching membership_expired notification for ${doc.id}:`, notifErr);
        }
      } else {
        expiredNotificationsCount++;
      }
    } else {
      // Member is still active — check if membershipExpiry or active package endDate is in 7 days, 3 days, or 1 day
      const targetEndDate = getClientActiveExpiryDate(client);
      if (targetEndDate) {
        const daysRemaining = getCalendarDaysDiff(targetEndDate, today);
        if (daysRemaining === 7 || daysRemaining === 3 || daysRemaining === 1) {
          const expiryDateOnly = targetEndDate.slice(0, 10);
          const expiringIdempotencyKey = `membership_expiring_${doc.id}_${daysRemaining}d_${expiryDateOnly}`;

          if (!dryRun) {
            try {
              const existingExpiringLogSnap = await db.collection('notifications_log')
                .where('clientId', '==', doc.id)
                .where('idempotencyKey', '==', expiringIdempotencyKey)
                .limit(1)
                .get();

              if (existingExpiringLogSnap.empty) {
                const pushToken = await getClientPushToken(db, client);
                const channels: ('in_app' | 'push')[] = pushToken ? ['in_app', 'push'] : ['in_app'];

                await dispatchNotificationEvent({
                  eventType: 'membership_expiring',
                  recipientId: doc.id,
                  recipientType: 'member',
                  recipientName: client.name || 'Member',
                  recipientEmail: client.email || undefined,
                  channels,
                  data: {
                    clientName: client.name || 'Member',
                    clientId: doc.id,
                    memberId: client.memberId || '',
                    gymName: resolvedGymName,
                    daysRemaining,
                    expiryDate: expiryDateOnly,
                    expoPushToken: pushToken || undefined,
                    fcmToken: pushToken || undefined,
                    pushToken: pushToken || undefined,
                    tenantId: dbId || undefined
                  },
                  idempotencyKey: expiringIdempotencyKey
                }, db as any);

                await db.collection('notifications_log').add({
                  clientId: doc.id,
                  memberId: client.memberId || '',
                  clientName: client.name || '',
                  eventType: 'membership_expiring',
                  daysRemaining,
                  expiryDate: expiryDateOnly,
                  idempotencyKey: expiringIdempotencyKey,
                  channels,
                  pushToken: pushToken || null,
                  sentAt: todayIso,
                  dateOnly: todayDateStr
                });
                expiringNotificationsCount++;
              }
            } catch (expiringErr) {
              console.error(`[ExpirationJob] Error dispatching membership_expiring notification for ${doc.id}:`, expiringErr);
            }
          } else {
            expiringNotificationsCount++;
          }
        }
      }
    }
  }

  // Also scan memberships table if present in this tenant
  try {
    const membershipsSnap = await db.collection('memberships').where('status', 'in', ['Active', 'active', 'ACTIVE']).get();
    for (const mDoc of membershipsSnap.docs) {
      const mData = mDoc.data();
      const end = mData.endDate || mData.end_date || mData.membershipExpiry;
      if (end) {
        const endDate = new Date(end);
        if (!isNaN(endDate.getTime()) && endDate.getTime() < today.getTime()) {
          if (!dryRun) {
            await mDoc.ref.update({
              status: 'EXPIRED',
              updatedAt: todayIso
            });
            await db.collection('membership_status_changes').add({
              membershipId: mDoc.id,
              clientId: mData.clientId || mData.userId || '',
              previousStatus: mData.status || 'Active',
              newStatus: 'EXPIRED',
              reason: 'membership_expired_scan',
              expiryDate: end,
              changedAt: todayIso,
              system: true
            });
          }
        }
      }
    }
  } catch {}

  console.log(`[ExpirationJob] Completed for ${dbId || 'default'}. Expired: ${expiredCount}, Cancelled Bookings: ${cancelledBookingsTotal}, Expiring Notifs: ${expiringNotificationsCount}, Expired Notifs: ${expiredNotificationsCount}.`);

  return {
    tenantDb: dbId || 'default',
    scannedClients: docsToInspect.length,
    expiredClients: expiredCount,
    cancelledBookings: cancelledBookingsTotal,
    expiringNotificationsSent: expiringNotificationsCount,
    expiredNotificationsSent: expiredNotificationsCount
  };
}

/**
 * Backward compatibility wrapper: Delegates to runMembershipExpirationScan.
 */
export async function runMembershipExpirationWorker(
  db: FirebaseFirestore.Firestore
): Promise<MembershipExpirationScanResult> {
  return runMembershipExpirationScan(db);
}

/**
 * Runs the expiration scan across all active tenant databases (Strike and Inzan).
 */
export async function runAllTenantsExpirationScan() {
  const results = [];
  const databases = isStandaloneMode()
    ? [getFirestore()]
    : [
        getFirestore(),                   // Default DB (Strike)
        getFirestore('db-inzanathletics') // Inzan DB
      ];

  for (const db of databases) {
    try {
      const res = await runMembershipExpirationScan(db);
      results.push(res);
    } catch (err) {
      console.error(`[ExpirationJob] Error running expiration scan on DB:`, err);
    }
  }
  return results;
}

/**
 * Starts the scheduled background job running every hour.
 */
export function startMembershipExpirationJob() {
  console.log('[ExpirationJob] Initializing Membership Expiration Worker...');
  // Initial scan after 10 seconds of boot
  setTimeout(() => {
    runAllTenantsExpirationScan().catch(err => console.error('[ExpirationJob] Initial scan error:', err));
  }, 10000);

  // Hourly recurring scan
  setInterval(() => {
    runAllTenantsExpirationScan().catch(err => console.error('[ExpirationJob] Scheduled scan error:', err));
  }, 60 * 60 * 1000);
}
