import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { Attendance, Branch, Client, User } from '../types';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const useAttendance = (currentUser: User | null, clients: Client[]) => {
  const { effectiveRole } = useAuth();
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAttendances = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/attendance', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAttendances(data.attendances || []);
      }
    } catch (err) {
      console.error('[Attendance] Failed to fetch attendances:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
    fetchAttendances();
  }, [currentUser, effectiveRole, fetchAttendances]);

  const recordAttendance = async (clientId: string, branch: Branch) => {
    if (!currentUser) return;
    try {
      const client = clients.find(c => c.id === clientId);
      if (!client) throw new Error('Client not found');

      if (client.status === 'Expired') {
        throw new Error(`${client.name}'s membership is expired. They must head to the STRIKE branch to renew.`);
      }

      const cairoDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      
      const token = await auth.currentUser?.getIdToken();

      // Check attendance
      const attendanceRes = await fetch(`/api/attendance?clientId=${clientId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let todayCheckins: any[] = [];
      if (attendanceRes.ok) {
        const attData = await attendanceRes.json();
        todayCheckins = (attData.attendances || []).filter((a: any) => {
          if (!a.date) return false;
          try {
            return new Date(a.date).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) === cairoDateStr;
          } catch {
            return false;
          }
        });
      }
      const checkinCount = todayCheckins.length;

      // Fetch sessions today
      const sessionsRes = await fetch(`/api/sessions?clientId=${clientId}&date=${cairoDateStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let ptSessionsCount = 0;
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        ptSessionsCount = (sessionsData.sessions || []).filter((s: any) => 
          s.status === 'Scheduled' || s.status === 'Attended'
        ).length;
      }

      // Fetch classes today
      const classesRes = await fetch(`/api/classes?date=${cairoDateStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let groupClassesCount = 0;
      if (classesRes.ok) {
        const classesData = await classesRes.json();
        groupClassesCount = (classesData.classes || []).filter((c: any) => 
          (c.attendees || []).includes(clientId)
        ).length;
      }

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

      await fetch('/api/attendance/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ attendance: attendanceData })
      });

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
        await fetch('/api/clients/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ id: clientId, updates: updateData })
        });
      }
      
      await fetchAttendances();
      await addAuditLog('CREATE', 'ATTENDANCE', clientId, `Attendance: ${client.name} at ${branch}`, currentUser?.name);
    } catch (error) {
      console.error('Failed to record attendance', error);
      throw error;
    }
  };

  return { attendances, loading, recordAttendance };
};
