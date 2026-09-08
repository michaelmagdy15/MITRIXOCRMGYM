import { getFirestore } from 'firebase-admin/firestore';

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
    const expiryDate = new Date(client.membershipExpiry);
    if (!isNaN(expiryDate.getTime()) && expiryDate.getTime() < todayMs) {
      return 'Expired';
    }
  }

  // Check client-level endDate fallback
  if (client.endDate) {
    const endDate = new Date(client.endDate);
    if (!isNaN(endDate.getTime()) && endDate.getTime() < todayMs) {
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
        const pkgEnd = new Date(pkg.endDate);
        if (!isNaN(pkgEnd.getTime()) && pkgEnd.getTime() < todayMs) {
          return false;
        }
      }
      if (pkg.sessionsRemaining !== undefined && pkg.sessionsRemaining <= 0 && pkg.sessionsTotal !== 'unlimited') {
        return false;
      }
      return true;
    });

    if (!hasActiveFuturePackage && (normalized === 'active' || !rawStatus)) {
      return 'Expired';
    }
  }

  return (normalized === 'active' || rawStatus === 'ACTIVE') ? 'Active' : (client.status || 'Active');
}

/**
 * Idempotent worker that scans a Firestore tenant database for expired memberships,
 * transitions their status to 'Expired', updates package statuses, invalidates future bookings,
 * and records an immutable audit log entry in 'membership_status_changes'.
 */
export async function runMembershipExpirationWorker(db: FirebaseFirestore.Firestore): Promise<{
  tenantDb: string;
  scannedClients: number;
  expiredClients: number;
  cancelledBookings: number;
}> {
  const today = new Date();
  const todayIso = today.toISOString();
  let expiredCount = 0;
  let cancelledBookingsTotal = 0;

  console.log(`[ExpirationJob] Scanning clients in database: ${db.databaseId || 'default'}...`);

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
            const pkgEnd = new Date(pkg.endDate);
            if (!isNaN(pkgEnd.getTime()) && pkgEnd.getTime() < today.getTime()) {
              return { ...pkg, status: 'Expired' };
            }
          }
          return pkg;
        });
      }

      // Commit client update
      await doc.ref.update(updates);
      expiredCount++;

      // Invalidate any future active bookings for this client
      let clientCancelledBookings = 0;
      try {
        const canonicalClientId = doc.id;
        const memberIdStr = client.memberId ? String(client.memberId) : '';

        // Query future bookings in classBookings
        const bookingsQuery = db.collection('classBookings')
          .where('status', '==', 'booked');

        const bookingsSnap = await bookingsQuery.get();
        for (const bDoc of bookingsSnap.docs) {
          const bData = bDoc.data();
          const matchesClient = bData.clientId === canonicalClientId || (memberIdStr && bData.memberId === memberIdStr);
          if (!matchesClient) continue;

          // Check if class schedule is in future
          const classScheduleId = bData.scheduleId || bData.classId;
          if (classScheduleId) {
            const schedDoc = await db.collection('classSchedules').doc(classScheduleId).get();
            if (schedDoc.exists) {
              const schedData = schedDoc.data()!;
              const classDateTime = schedData.date ? new Date(`${schedData.date}T${schedData.startTime || '00:00'}`) : null;
              
              if (classDateTime && classDateTime.getTime() > today.getTime()) {
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
  } catch {}

  console.log(`[ExpirationJob] Completed for ${db.databaseId || 'default'}. Expired ${expiredCount} clients, invalidated ${cancelledBookingsTotal} future bookings.`);

  return {
    tenantDb: db.databaseId || 'default',
    scannedClients: docsToInspect.length,
    expiredClients: expiredCount,
    cancelledBookings: cancelledBookingsTotal
  };
}

/**
 * Runs the expiration scan across all active tenant databases (Strike and Inzan).
 */
export async function runAllTenantsExpirationScan() {
  const results = [];
  const databases = [
    getFirestore(),                   // Default DB (Strike)
    getFirestore('db-inzanathletics') // Inzan DB
  ];

  for (const db of databases) {
    try {
      const res = await runMembershipExpirationWorker(db);
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
