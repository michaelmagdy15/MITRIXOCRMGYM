import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Attendance, Branch, Client, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { addAuditLog } from '../services/auditService';
import { isBefore, parseISO, startOfDay } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

export const useAttendance = (currentUser: User | null, clients: Client[]) => {
  const { effectiveRole } = useAuth();
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    // Members can't list all attendance — skip the global listener
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'attendance'), orderBy('date', 'desc')),
      (snapshot) => {
        setAttendances(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Attendance)));
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'attendance');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [currentUser, effectiveRole]);

  const recordAttendance = async (clientId: string, branch: Branch) => {
    if (!currentUser) return;
    try {
      const client = clients.find(c => c.id === clientId);
      if (!client) throw new Error('Client not found');

      // Block expired members from checking in
      if (client.status === 'Expired') {
        throw new Error(`${client.name}'s membership is expired. Please renew before checking in.`);
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

      await addDoc(collection(db, 'attendance'), attendanceData);

      // Decrement sessions only for finite packages with sessions remaining
      const packagesCopy = client.packages ? [...client.packages] : [];
      const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
      
      const updateData: any = {};
      
      if (activePkgIdx !== -1) {
        const activePkg = { ...packagesCopy[activePkgIdx] };
        if (typeof activePkg.sessionsRemaining === 'number' && activePkg.sessionsRemaining > 0) {
          activePkg.sessionsRemaining = activePkg.sessionsRemaining - 1;
          packagesCopy[activePkgIdx] = activePkg;
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
      handleFirestoreError(error, OperationType.CREATE, 'attendance');
      throw error;
    }
  };

  return { attendances, loading, recordAttendance };
};
