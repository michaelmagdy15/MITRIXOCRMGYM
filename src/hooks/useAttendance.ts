import { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Attendance, Branch, Client, User } from '../types';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

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
    
    const unsub = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      setAttendances(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Attendance)));
      setLoading(false);
    }, (error) => {
      console.error('[Attendance] Failed to fetch attendances:', error);
      setLoading(false);
    });
    
    return () => unsub();
  }, [currentUser, effectiveRole]);

  const recordAttendance = async (clientId: string, branch: Branch) => {
    if (!currentUser) return;
    try {
      const client = clients.find(c => c.id === clientId);
      if (!client) throw new Error('Client not found');

      if (client.status === 'Expired') {
        throw new Error(`${client.name}'s membership is expired. They must head to the STRIKE branch to renew.`);
      }

      const cairoDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      
      // Check attendance
      const attendanceQ = query(collection(db, 'attendance'), where('clientId', '==', clientId));
      const attendanceSnap = await getDocs(attendanceQ);
      let todayCheckins: any[] = [];
      attendanceSnap.docs.forEach(d => {
        const a = d.data();
        if (!a.date) return;
        try {
          if (new Date(a.date).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) === cairoDateStr) {
            todayCheckins.push(a);
          }
        } catch {}
      });
      const checkinCount = todayCheckins.length;

      // Fetch sessions today
      const sessionsQ = query(collection(db, 'sessions'), where('clientId', '==', clientId), where('date', '==', cairoDateStr));
      const sessionsSnap = await getDocs(sessionsQ);
      const ptSessionsCount = sessionsSnap.docs.filter(d => d.data().status === 'Scheduled' || d.data().status === 'Attended').length;

      // Fetch classes today
      const classesQ = query(collection(db, 'classes'), where('date', '==', cairoDateStr));
      const classesSnap = await getDocs(classesQ);
      const groupClassesCount = classesSnap.docs.filter(d => (d.data().attendees || []).includes(clientId)).length;

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

      const packagesCopy = client.packages ? [...client.packages] : [];
      const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
      const updateData: any = {};
      
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
      await addAuditLog('CREATE', 'ATTENDANCE', clientId, `Attendance: ${client.name} at ${branch}`, currentUser?.name);
    } catch (error) {
      console.error('Failed to record attendance', error);
      throw error;
    }
  };

  return { attendances, loading, recordAttendance };
};
