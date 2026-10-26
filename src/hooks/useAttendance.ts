import { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Attendance, Branch, Client, Package, User } from '../types';
import { addAuditLog } from '../services/auditService';
import { validatePackageTimeWindow } from '../utils/membershipRules';
import { isTenantInzan } from '../utils/inzanOrg';
import { useAuth } from '../contexts/AuthContext';

const CAIRO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

function toCairoDateStr(dateInput: string | number | Date): string {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return CAIRO_DATE_FORMATTER.format(d);
}

export const useAttendance = (currentUser: User | null, clients: Client[]) => {
  const { effectiveRole } = useAuth();
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

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

    const unsub = onSnapshot(recentAttendanceQuery, (snapshot) => {
      const withTs = snapshot.docs.map(d => {
        const data = d.data();
        const rawDate = data.date || data.checkedInAt || '';
        const ts = rawDate ? (Date.parse(String(rawDate)) || 0) : 0;
        return { doc: { ...data, id: d.id } as Attendance, ts, timeStr: String(data.checkInTime || '') };
      });
      withTs.sort((a, b) => {
        if (b.ts !== a.ts) return b.ts - a.ts;
        return b.timeStr.localeCompare(a.timeStr);
      });
      setAttendances(withTs.map(x => x.doc));
      setLoading(false);
    }, (error) => {
      console.error('[Attendance] Failed to fetch attendances:', error);
      setLoading(false);
    });
    
    return () => unsub();
  }, [currentUser?.id, currentUser?.role, effectiveRole]);

  const recordAttendance = async (clientId: string, branch: Branch) => {
    if (!currentUser) return;
    try {
      const client = clients.find(c => c.id === clientId);
      if (!client) throw new Error('Client not found');

      if (client.status === 'Expired') {
        throw new Error(`${client.name}'s membership is expired. Please renew membership at the front desk.`);
      }

      // Time-restricted packages (e.g. Morning Package): allow entry if ANY active package
      // is unrestricted or currently inside its window. Unknown packages never block.
      const activeNames = Array.from(new Set(
        (client.packages || []).filter(p => p.status === 'Active' && p.packageName).map(p => p.packageName)
      )).slice(0, 10);
      if (activeNames.length > 0) {
        const pkgSnap = await getDocs(query(collection(db, 'packages'), where('name', 'in', activeNames)));
        const defsByName = new Map<string, Package>();
        pkgSnap.docs.forEach(d => {
          const data = { ...d.data(), id: d.id } as Package;
          defsByName.set(data.name, data);
        });
        const checkInNow = new Date();
        const windowResults = activeNames.map(n => validatePackageTimeWindow(defsByName.get(n) || null, checkInNow));
        if (windowResults.every(r => !r.allowed)) {
          throw new Error(windowResults[0]?.reason || `${client.name}'s package does not allow access at this time.`);
        }
      }

      const cairoDateStr = toCairoDateStr(new Date());
      
      // Check today's attendance using the live in-memory recent attendances first (0 Firestore reads),
      // falling back to a Firestore query only when in-memory attendances are not loaded (e.g. client/coach role).
      let checkinCount = 0;
      if (attendances.length > 0) {
        for (const a of attendances) {
          if (a.clientId !== clientId || !a.date) continue;
          if ((a as any).sessionDate === cairoDateStr || toCairoDateStr(a.date) === cairoDateStr) {
            checkinCount++;
          }
        }
      } else {
        const attendanceQ = query(collection(db, 'attendance'), where('clientId', '==', clientId));
        const attendanceSnap = await getDocs(attendanceQ);
        attendanceSnap.docs.forEach(d => {
          const a = d.data();
          if (!a.date) return;
          if (a.sessionDate === cairoDateStr || toCairoDateStr(a.date) === cairoDateStr) {
            checkinCount++;
          }
        });
      }

      // Fetch sessions today
      const sessionsQ = query(collection(db, 'sessions'), where('clientId', '==', clientId), where('date', '==', cairoDateStr));
      const sessionsSnap = await getDocs(sessionsQ);
      const ptSessionsCount = sessionsSnap.docs.filter(d => d.data().status === 'Scheduled' || d.data().status === 'Attended').length;

      // Fetch classes today (query strictly today's date to prevent reading full historical collection)
      const classesQ = query(collection(db, 'classSchedules'), where('date', '==', cairoDateStr));
      const classesSnap = await getDocs(classesQ);
      const groupClassesCount = classesSnap.docs.filter(d => {
        const data = d.data();
        return (data.attendees || []).includes(clientId);
      }).length;

      const totalExpectedSessions = Math.max(1, ptSessionsCount + groupClassesCount);

      if (checkinCount >= totalExpectedSessions) {
        const msg = totalExpectedSessions === 1 
          ? `Double check-in blocked. ${client.name} has already checked in today.`
          : `Double check-in blocked. ${client.name} has already checked in ${checkinCount} times today for ${totalExpectedSessions} scheduled sessions.`;
        throw new Error(msg);
      }

      const attendanceData: Omit<Attendance, 'id'> = {
        clientId,
        branch,
        date: new Date().toISOString(),
        recordedBy: currentUser.id,
      };

      if (client.packageType) {
        attendanceData.packageName = client.packageType;
      }

      const docRef = doc(collection(db, 'attendance'));
      await setDoc(docRef, attendanceData);

      // Crucial: Only deduct from package/balance if this check-in is NOT fulfilling
      // a pre-booked class or PT session that was already deducted at reservation time!
      const hasPreBookedDeductedSession = (ptSessionsCount + groupClassesCount) > 0;

      const packagesCopy = client.packages ? [...client.packages] : [];
      const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
      const updateData: any = {};
      
      if (!hasPreBookedDeductedSession) {
        if (activePkgIdx !== -1) {
          const activePkg = packagesCopy[activePkgIdx];
          if (activePkg && typeof activePkg.sessionsRemaining === 'number' && activePkg.sessionsRemaining > 0) {
            packagesCopy[activePkgIdx] = {
              ...activePkg,
              sessionsRemaining: activePkg.sessionsRemaining - 1
            } as any;
            updateData.packages = packagesCopy;
          }
        }
        
        if (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) {
          updateData.sessionsRemaining = client.sessionsRemaining - 1;
        }

        if (Object.keys(updateData).length > 0) {
          await updateDoc(doc(db, 'clients', clientId), updateData);
        }
      }
      await addAuditLog('CREATE', 'ATTENDANCE', clientId, `Attendance: ${client.name} at ${branch}`, currentUser?.name);
    } catch (error) {
      console.error('Failed to record attendance', error);
      throw error;
    }
  };

  return { attendances, loading, recordAttendance };
};
