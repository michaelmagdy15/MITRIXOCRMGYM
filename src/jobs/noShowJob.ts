import { getFirestore } from 'firebase-admin/firestore';
import { isStandaloneMode } from '../config/environment.js';

export async function runNoShowScan() {
  try {
    console.log('[Cron] Running No-Show scan (10-minute post-start cutoff)...');
    
    const databases = isStandaloneMode()
      ? [getFirestore()]
      : [
          getFirestore(), // Default DB (Strike)
          getFirestore('db-inzanathletics') // Inzan DB
        ];

    for (const db of databases) {
      try {
        const nowMs = Date.now();
        const tenMinutesMs = 10 * 60 * 1000;
        const nowIso = new Date().toISOString();

        // Inspect classes from the last 48 hours
        const todayStr = new Date().toISOString().split('T')[0];
        const twoDaysAgoStr = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];

        const classesSnap = await db.collection('classSchedules')
          .where('date', '>=', twoDaysAgoStr)
          .where('date', '<=', todayStr)
          .get();

        for (const classDoc of classesSnap.docs) {
          const classData = classDoc.data();
          if (classData.status === 'cancelled') continue;
          if (classData.noShowsProcessed === true) continue;

          // Parse class start time
          let startTimeMs = NaN;
          if (classData.startTime) {
            startTimeMs = new Date(classData.startTime).getTime();
          }
          if (isNaN(startTimeMs) && classData.date && (classData.time || classData.startTime)) {
            const timePart = classData.time || (typeof classData.startTime === 'string' && classData.startTime.length === 5 ? classData.startTime : '10:00');
            startTimeMs = new Date(`${classData.date}T${timePart}:00`).getTime();
          }

          // If start time cannot be determined, fallback to endTime
          if (isNaN(startTimeMs) && classData.endTime) {
            startTimeMs = new Date(classData.endTime).getTime() - 60 * 60 * 1000;
          }
          if (isNaN(startTimeMs)) continue;

          // Check if class started at least 10 minutes ago
          if (nowMs - startTimeMs >= tenMinutesMs) {
            const attendees: string[] = Array.isArray(classData.attendees) ? classData.attendees : [];
            const checkedIn: string[] = Array.isArray(classData.checkedIn) ? classData.checkedIn : [];
            const currentNoShows: string[] = Array.isArray(classData.noShows) ? classData.noShows : [];

            // Attendees who have not checked in and are not already marked no-show
            const newNoShows = attendees.filter((id: string) => !checkedIn.includes(id) && !currentNoShows.includes(id));

            if (newNoShows.length > 0) {
              const finalNoShows = [...currentNoShows, ...newNoShows];
              
              // Determine if class has ended to mark noShowsProcessed
              let isClassEnded = false;
              if (classData.endTime) {
                const endTimeMs = new Date(classData.endTime).getTime();
                if (!isNaN(endTimeMs) && nowMs > endTimeMs) {
                  isClassEnded = true;
                }
              }

              await classDoc.ref.update({
                noShows: finalNoShows,
                noShowsProcessed: isClassEnded
              });

              for (const memberId of newNoShows) {
                // 1. Mark classBookings record
                const bookingRef = db.collection('classBookings').doc(`${classDoc.id}_${memberId}`);
                await bookingRef.set({
                  classId: classDoc.id,
                  memberId,
                  status: 'no-show',
                  noShowAt: nowIso,
                  updatedAt: nowIso
                }, { merge: true });

                // 2. Increment strikes and enforce lockout on clients doc
                const clientRef = db.collection('clients').doc(memberId);
                const clientDoc = await clientRef.get();
                if (clientDoc.exists) {
                  const cData = clientDoc.data() || {};
                  const currentNoShowStrikes = (cData.noShowStrikes || 0) + 1;
                  const currentLegacyStrikes = (cData.strikes || 0) + 1;
                  const updates: Record<string, any> = {
                    noShowStrikes: currentNoShowStrikes,
                    strikes: currentLegacyStrikes,
                    lastNoShowAt: nowIso,
                    updatedAt: nowIso
                  };

                  if (currentNoShowStrikes >= 3) {
                    // 7-day lockout per PRD §14, §32
                    const blockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    updates.bookingBlockedUntil = blockedUntil;
                    console.log(`[Cron] Member ${memberId} reached ${currentNoShowStrikes} strikes. Booking blocked until ${blockedUntil}`);
                  }

                  await clientRef.update(updates);

                  // 3. In-app system notification
                  await db.collection('systemNotifications').add({
                    type: 'class_no_show',
                    title: `Class No-Show: ${classData.name || 'Group Class'}`,
                    body: `You were marked as a no-show for ${classData.name || 'class'} on ${classData.date || 'today'}. Strike ${currentNoShowStrikes} of 3 recorded.${currentNoShowStrikes >= 3 ? ' Your class bookings have been suspended for 7 days.' : ''}`,
                    severity: currentNoShowStrikes >= 3 ? 'critical' : 'warning',
                    read: false,
                    targetUserId: cData.portalUserId || memberId,
                    data: {
                      classId: classDoc.id,
                      memberId,
                      strikeCount: currentNoShowStrikes
                    },
                    createdAt: nowIso
                  });
                }

                // 4. Audit log
                await db.collection('auditLogs').add({
                  action: 'CLASS_NOSHOW',
                  entityType: 'CLASS',
                  entityId: classDoc.id,
                  details: `Member ${memberId} marked no-show for class ${classData.name || classDoc.id} (10min post-start rule).`,
                  timestamp: nowIso,
                  userId: 'system-cron',
                  userName: 'System Cron'
                });
              }
            } else {
              // If class ended and all attendees accounted for, mark processed
              if (classData.endTime) {
                const endTimeMs = new Date(classData.endTime).getTime();
                if (!isNaN(endTimeMs) && nowMs > endTimeMs) {
                  await classDoc.ref.update({ noShowsProcessed: true });
                }
              }
            }
          }
        }
      } catch (dbError) {
        console.error('[Cron] Error processing database for no-shows:', dbError);
      }
    }
  } catch (error) {
    console.error('[Cron] Error running No-Show scan:', error);
  }
}

// Runs every 15 minutes to flag no-shows for classes that have started/finished
export function startNoShowJob() {
  setInterval(async () => {
    await runNoShowScan();
  }, 15 * 60 * 1000); // 15 minutes
}
