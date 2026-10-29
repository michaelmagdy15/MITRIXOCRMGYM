import { useState, useEffect } from 'react';
import { db, getTenantId } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Attendance, Branch, Client, Package, User } from '../types';
import { addAuditLog } from '../services/auditService';
import { validatePackageTimeWindow } from '../utils/membershipRules';
import { useAuth } from '../contexts/AuthContext';
import {
  getLocalDb,
  getMemberById,
  getPackages,
  getTodayAttendanceForClient,
  recordLocalAttendance,
  saveTodayAttendance,
} from '../services/localDb';
import { enqueueOperation } from '../services/outbox';

const CAIRO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

function toCairoDateStr(dateInput: string | number | Date): string {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return CAIRO_DATE_FORMATTER.format(d);
}

function isNetworkOrOfflineError(error: any): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!error) return false;
  const msg = String(error?.message || error?.code || '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('deadline-exceeded') ||
    msg.includes('client is offline') ||
    msg.includes('transport errored') ||
    msg.includes('aborted')
  );
}

export const useAttendance = (currentUser: User | null, clients: Client[]) => {
  const { effectiveRole } = useAuth();
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  // Load cached today attendances immediately from IndexedDB on mount (< 5ms)
  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId || effectiveRole === 'client' || effectiveRole === 'coach') return;

    getLocalDb(tenantId)
      .then((ldb) => ldb.getAll('todayAttendance'))
      .then((cached) => {
        if (cached && cached.length > 0) {
          setAttendances((prev) => (prev.length === 0 ? (cached as any) : prev));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[Attendance] Failed to load cached attendances from localDb:', err);
      });
  }, [effectiveRole]);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    // Members can't list all attendance
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      setLoading(false);
      return;
    }

    // Scope live listener to the last 30 days to save 95%+ of Firestore read quota
    // and avoid loading 10,000+ historical attendance docs into memory on every session.
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recentAttendanceQuery = query(
      collection(db, 'attendance'),
      where('date', '>=', thirtyDaysAgoIso)
    );

    const unsub = onSnapshot(
      recentAttendanceQuery,
      (snapshot) => {
        const withTs = snapshot.docs.map((d) => {
          const data = d.data();
          const rawDate = data.date || data.checkedInAt || '';
          const ts = rawDate ? Date.parse(String(rawDate)) || 0 : 0;
          return { doc: { ...data, id: d.id } as Attendance, ts, timeStr: String(data.checkInTime || '') };
        });
        withTs.sort((a, b) => {
          if (b.ts !== a.ts) return b.ts - a.ts;
          return b.timeStr.localeCompare(a.timeStr);
        });
        const fetched = withTs.map((x) => x.doc);
        setAttendances(fetched);
        setLoading(false);

        // Background sync: keep today's attendance fresh in gymLocalDb
        const tenantId = getTenantId();
        if (tenantId && fetched.length > 0) {
          const todayCairo = toCairoDateStr(new Date());
          const todayItems = fetched.filter(
            (a) => (a as any).sessionDate === todayCairo || toCairoDateStr(a.date) === todayCairo
          );
          if (todayItems.length > 0) {
            saveTodayAttendance(tenantId, todayItems).catch((err) => {
              console.warn('[Attendance] Failed to sync today attendance to localDb:', err);
            });
          }
        }
      },
      (error) => {
        console.error('[Attendance] Failed to fetch attendances:', error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser?.id, currentUser?.role, effectiveRole]);

  const recordAttendance = async (clientId: string, branch: Branch) => {
    if (!currentUser) return;
    const tenantId = getTenantId();

    try {
      let client = clients.find((c) => c.id === clientId);
      if (!client) {
        try {
          const localMember = await getMemberById(tenantId, clientId);
          if (localMember) {
            client = localMember as Client;
          }
        } catch (e) {
          console.warn('[Attendance] Error fetching local member:', e);
        }
      }
      if (!client) throw new Error('Client not found');

      if (client.status === 'Expired') {
        throw new Error(`${client.name}'s membership is expired. Please renew membership at the front desk.`);
      }

      // Time-restricted packages (e.g. Morning Package): allow entry if ANY active package
      // is unrestricted or currently inside its window. Unknown packages never block.
      const activeNames = Array.from(
        new Set(
          (client.packages || []).filter((p) => p.status === 'Active' && p.packageName).map((p) => p.packageName)
        )
      ).slice(0, 10);

      if (activeNames.length > 0) {
        const defsByName = new Map<string, Package>();

        // Check local package definitions first (< 2ms)
        try {
          const localPkgs = await getPackages(tenantId);
          if (localPkgs && Array.isArray(localPkgs)) {
            for (const pkg of localPkgs) {
              if (pkg && pkg.name) {
                defsByName.set(pkg.name, pkg as Package);
              }
            }
          }
        } catch (pkgErr) {
          console.warn('[Attendance] Error reading local packages:', pkgErr);
        }

        // If definitions missing and network is available, try fast Firestore lookup with timeout
        const missingNames = activeNames.filter((n) => !defsByName.has(n));
        if (missingNames.length > 0 && navigator.onLine) {
          try {
            const fetchPromise = getDocs(query(collection(db, 'packages'), where('name', 'in', missingNames)));
            const timeoutPromise = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 1500)
            );
            const pkgSnap = (await Promise.race([fetchPromise, timeoutPromise])) as any;
            if (pkgSnap && pkgSnap.docs) {
              pkgSnap.docs.forEach((d: any) => {
                const data = { ...d.data(), id: d.id } as Package;
                defsByName.set(data.name, data);
              });
            }
          } catch {
            // Timeout or offline: proceed with cached definitions. Unknown packages never block.
          }
        }

        const checkInNow = new Date();
        const windowResults = activeNames.map((n) => validatePackageTimeWindow(defsByName.get(n) || null, checkInNow));
        if (windowResults.every((r) => !r.allowed)) {
          throw new Error(windowResults[0]?.reason || `${client.name}'s package does not allow access at this time.`);
        }
      }

      const cairoDateStr = toCairoDateStr(new Date());

      // Check today's attendance using:
      // 1. in-memory recent attendances
      // 2. local IndexedDB gymLocalDb (getTodayAttendanceForClient)
      // 3. (if needed and online) Firestore fallback query
      const seenCheckinKeys = new Set<string>();
      let checkinCount = 0;

      // 1. In-memory check
      for (const a of attendances) {
        if (a.clientId !== clientId && (a as any).memberId !== clientId) continue;
        const aDate = a.date || (a as any).checkedInAt;
        if (!aDate) continue;
        if ((a as any).sessionDate === cairoDateStr || toCairoDateStr(aDate) === cairoDateStr) {
          const key = a.id || `${a.clientId}_${aDate}`;
          if (!seenCheckinKeys.has(key)) {
            seenCheckinKeys.add(key);
            checkinCount++;
          }
        }
      }

      // 2. Local IndexedDB check
      try {
        const localTodayRecords = await getTodayAttendanceForClient(tenantId, clientId, cairoDateStr);
        for (const a of localTodayRecords) {
          const aDate = a.date || a.checkedInAt;
          const key = a.id || `${a.clientId || clientId}_${aDate}`;
          if (!seenCheckinKeys.has(key)) {
            seenCheckinKeys.add(key);
            checkinCount++;
          }
        }
      } catch (locAttErr) {
        console.warn('[Attendance] Error fetching local today attendance:', locAttErr);
      }

      // 3. Fallback to Firestore if no attendances found in memory/local and online
      if (attendances.length === 0 && checkinCount === 0 && navigator.onLine) {
        try {
          const attendanceQ = query(collection(db, 'attendance'), where('clientId', '==', clientId));
          const attendanceSnap = (await Promise.race([
            getDocs(attendanceQ),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
          ])) as any;
          if (attendanceSnap && attendanceSnap.docs) {
            attendanceSnap.docs.forEach((d: any) => {
              const a = d.data();
              const aDate = a.date || a.checkedInAt;
              if (!aDate) return;
              if (a.sessionDate === cairoDateStr || toCairoDateStr(aDate) === cairoDateStr) {
                const key = d.id;
                if (!seenCheckinKeys.has(key)) {
                  seenCheckinKeys.add(key);
                  checkinCount++;
                }
              }
            });
          }
        } catch {
          // If offline/timeout, rely on local check
        }
      }

      // Fetch scheduled sessions & group classes today (if online)
      let ptSessionsCount = 0;
      let groupClassesCount = 0;

      if (navigator.onLine) {
        try {
          const sessionsQ = query(
            collection(db, 'sessions'),
            where('clientId', '==', clientId),
            where('date', '==', cairoDateStr)
          );
          const classesQ = query(collection(db, 'classSchedules'), where('date', '==', cairoDateStr));

          const [sessionsSnap, classesSnap] = (await Promise.race([
            Promise.all([getDocs(sessionsQ), getDocs(classesQ)]),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
          ])) as any;

          ptSessionsCount = sessionsSnap.docs.filter(
            (d: any) => d.data().status === 'Scheduled' || d.data().status === 'Attended'
          ).length;
          groupClassesCount = classesSnap.docs.filter((d: any) => {
            const data = d.data();
            return (data.attendees || []).includes(clientId);
          }).length;
        } catch {
          // Fall back to 0 so offline check-in does not block
        }
      }

      const totalExpectedSessions = Math.max(1, ptSessionsCount + groupClassesCount);

      if (checkinCount >= totalExpectedSessions) {
        const msg =
          totalExpectedSessions === 1
            ? `Double check-in blocked. ${client.name} has already checked in today.`
            : `Double check-in blocked. ${client.name} has already checked in ${checkinCount} times today for ${totalExpectedSessions} scheduled sessions.`;
        throw new Error(msg);
      }

      // Generate local attendance record
      const attendanceId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const nowIso = new Date().toISOString();
      const attendanceData: Attendance = {
        id: attendanceId,
        clientId,
        branch,
        date: nowIso,
        recordedBy: currentUser.id,
        ...(client.packageType ? { packageName: client.packageType } : {}),
      };

      // Optimistically update React state immediately (< 5ms)
      setAttendances((prev) => [attendanceData, ...prev]);

      // Record locally in gymLocalDb
      try {
        await recordLocalAttendance(tenantId, {
          ...attendanceData,
          sessionDate: cairoDateStr,
          clientName: client.name || '',
          memberId: (client as any).memberId,
        });
      } catch (locErr) {
        console.warn('[Attendance] Failed to record local attendance in gymLocalDb:', locErr);
      }

      // Deduct session locally from client state if applicable
      const hasPreBookedDeductedSession = ptSessionsCount + groupClassesCount > 0;
      const packagesCopy = client.packages ? [...client.packages] : [];
      const activePkgIdx = packagesCopy.findIndex((p) => p.status === 'Active');
      const updateData: any = {};

      if (!hasPreBookedDeductedSession) {
        if (activePkgIdx !== -1) {
          const activePkg = packagesCopy[activePkgIdx];
          if (activePkg && typeof activePkg.sessionsRemaining === 'number' && activePkg.sessionsRemaining > 0) {
            packagesCopy[activePkgIdx] = {
              ...activePkg,
              sessionsRemaining: activePkg.sessionsRemaining - 1,
            } as any;
            updateData.packages = packagesCopy;
            (client as any).packages = packagesCopy;
          }
        }

        if (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) {
          updateData.sessionsRemaining = client.sessionsRemaining - 1;
          (client as any).sessionsRemaining = client.sessionsRemaining - 1;
        }
      }

      // If offline, enqueue operation immediately and return without network call
      if (!navigator.onLine) {
        try {
          await enqueueOperation(tenantId, 'attendance.checkin', clientId, {
            attendanceId,
            clientId,
            clientName: client.name || '',
            branch,
            date: nowIso,
            recordedBy: currentUser.id,
            packageName: client.packageType || '',
          });
        } catch (enqueueErr) {
          console.warn('[Attendance] Failed to enqueue offline check-in operation:', enqueueErr);
        }
        return;
      }

      // If online, commit to Firestore with timeout
      try {
        const docRef = doc(collection(db, 'attendance'));
        const firestoreAttendanceData = {
          clientId,
          clientName: client.name || '',
          branch,
          date: nowIso,
          recordedBy: currentUser.id,
          sessionDate: cairoDateStr,
          ...(client.packageType ? { packageName: client.packageType } : {}),
        };

        const commitPromise = async () => {
          await setDoc(docRef, firestoreAttendanceData);
          if (Object.keys(updateData).length > 0) {
            await updateDoc(doc(db, 'clients', clientId), updateData);
          }
          await addAuditLog(
            'CREATE',
            'ATTENDANCE',
            clientId,
            `Attendance: ${client.name} at ${branch}`,
            currentUser?.name
          );
        };

        await Promise.race([
          commitPromise(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Network timeout writing attendance')), 3500)
          ),
        ]);
      } catch (networkError) {
        if (isNetworkOrOfflineError(networkError)) {
          console.warn(
            '[Attendance] Network write failed, enqueuing to outbox for background sync:',
            networkError
          );
          try {
            await enqueueOperation(tenantId, 'attendance.checkin', clientId, {
              attendanceId,
              clientId,
              clientName: client.name || '',
              branch,
              date: nowIso,
              recordedBy: currentUser.id,
              packageName: client.packageType || '',
            });
          } catch (enqueueErr) {
            console.warn('[Attendance] Failed to enqueue check-in to outbox:', enqueueErr);
          }
          // Never throw a network error to the staff if the local check-in succeeded!
          return;
        }
        // Non-network Firestore error
        throw networkError;
      }
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        // Suppress network errors from throwing to staff UI
        console.warn('[Attendance] Suppressing network error on check-in:', error);
        return;
      }
      console.error('Failed to record attendance', error);
      throw error;
    }
  };

  return { attendances, loading, recordAttendance };
};
