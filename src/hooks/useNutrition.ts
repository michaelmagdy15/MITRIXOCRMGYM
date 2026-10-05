import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  NutritionAppointment,
  NutritionConsultation,
  NutritionistProfile,
  NutritionAppointmentStatus,
  BodyMetrics
} from '../types/nutrition';
import { addAuditLog } from '../services/auditService';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Validates a nutritionist slot before booking/updating.
 * Enforces: nutritionist active, day enabled, time within working hours, and no overlapping appointment.
 */
async function validateNutritionSlot(
  db: any,
  nutritionistId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeAppointmentId?: string
): Promise<void> {
  const profileRef = doc(db, 'nutritionistProfiles', nutritionistId);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    throw new Error('Nutritionist profile not found.');
  }
  const profile = profileSnap.data() as NutritionistProfile;
  if (profile.active === false) {
    throw new Error('Selected nutritionist is not currently active.');
  }

  const dayName = DAYS[new Date(date + 'T00:00:00').getDay()] || 'Sunday';
  const daySchedule = profile.schedule?.[dayName];
  if (!daySchedule || !daySchedule.enabled) {
    throw new Error(`Nutritionist is not available on ${dayName}s.`);
  }
  if (startTime < daySchedule.startTime || endTime > daySchedule.endTime) {
    throw new Error(`Selected time is outside ${profile.name}'s working hours (${daySchedule.startTime} - ${daySchedule.endTime}).`);
  }

  const existingQuery = query(
    collection(db, 'nutritionAppointments'),
    where('nutritionistId', '==', nutritionistId),
    where('date', '==', date),
    where('status', 'not-in', ['Cancelled', 'No-show'])
  );
  const existingSnap = await getDocs(existingQuery);
  for (const d of existingSnap.docs) {
    if (excludeAppointmentId && d.id === excludeAppointmentId) continue;
    const appt = d.data() as NutritionAppointment;
    // Overlap: existing start < new end AND existing end > new start
    if (appt.startTime < endTime && appt.endTime > startTime) {
      throw new Error(`Time slot conflicts with an existing appointment (${appt.startTime} - ${appt.endTime}).`);
    }
  }
}

// Real-time hook for nutrition appointments
export function useNutritionAppointments() {
  const [appointments, setAppointments] = useState<NutritionAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'nutritionAppointments'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as NutritionAppointment[];
        setAppointments(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error subscribing to nutrition appointments:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { appointments, loading, error };
}

// Real-time hook for nutritionist profiles
export function useNutritionists() {
  const [profiles, setProfiles] = useState<NutritionistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'nutritionistProfiles'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as NutritionistProfile[];
        setProfiles(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error subscribing to nutritionist profiles:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { profiles, loading, error };
}

// Action: Book a new nutrition appointment
export async function bookAppointment(
  data: Omit<NutritionAppointment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    await validateNutritionSlot(db, data.nutritionistId, data.date, data.startTime, data.endTime);

    const newRef = doc(collection(db, 'nutritionAppointments'));
    const now = new Date().toISOString();
    const appointmentData: NutritionAppointment = {
      ...data,
      id: newRef.id,
      status: data.status || 'Scheduled',
      createdAt: now,
      updatedAt: now
    };

    await setDoc(newRef, appointmentData);

    await addAuditLog(
      'CREATE',
      'SESSION',
      newRef.id,
      `Booked nutrition consultation for ${data.clientName} with Dr. ${data.nutritionistName} on ${data.date} at ${data.startTime}`
    );

    return newRef.id;
  } catch (err) {
    console.error("Error booking nutrition appointment:", err);
    throw err;
  }
}

// Action: Update appointment status (Scheduled, Completed, Cancelled, Rescheduled, No-show)
export async function updateAppointmentStatus(
  appointmentId: string,
  status: NutritionAppointmentStatus,
  reason?: string
): Promise<void> {
  try {
    const ref = doc(db, 'nutritionAppointments', appointmentId);
    const now = new Date().toISOString();
    const updates: Partial<NutritionAppointment> = {
      status,
      updatedAt: now
    };
    if (reason) {
      updates.cancellationReason = reason;
    }

    await updateDoc(ref, updates);

    await addAuditLog(
      'UPDATE',
      'SESSION',
      appointmentId,
      `Updated nutrition appointment status to ${status}${reason ? ` (Reason: ${reason})` : ''}`
    );
  } catch (err) {
    console.error("Error updating appointment status:", err);
    throw err;
  }
}

// Action: Save consultation notes and body metrics (weight, body fat %, muscle mass, BMR)
export async function saveConsultationNotes(
  appointmentId: string,
  data: {
    clientId: string;
    clientName?: string;
    nutritionistId: string;
    nutritionistName?: string;
    date: string;
    notes: string;
    followUpTasks?: string[];
    dietaryPlan?: string;
    metrics?: BodyMetrics;
  }
): Promise<string> {
  try {
    const now = new Date().toISOString();

    // 1. Store notes in subcollection `nutritionAppointments/{appointmentId}/notes` (restricted role access)
    const notesSubcollectionRef = collection(db, 'nutritionAppointments', appointmentId, 'notes');
    const existingSnap = await getDocs(query(notesSubcollectionRef));
    let noteDocId = '';

    if (!existingSnap.empty && existingSnap.docs[0]) {
      noteDocId = existingSnap.docs[0].id;
      await updateDoc(doc(db, 'nutritionAppointments', appointmentId, 'notes', noteDocId), {
        ...data,
        updatedAt: now
      });
    } else {
      const newNoteRef = doc(notesSubcollectionRef);
      noteDocId = newNoteRef.id;
      await setDoc(newNoteRef, {
        id: noteDocId,
        appointmentId,
        ...data,
        createdAt: now,
        updatedAt: now
      });
    }

    // 2. Mirror consultation in top-level `nutritionConsultations` collection for fast multi-session client progress queries
    const consultationDocRef = doc(db, 'nutritionConsultations', appointmentId);
    await setDoc(consultationDocRef, {
      id: appointmentId,
      appointmentId,
      ...data,
      createdAt: now,
      updatedAt: now
    }, { merge: true });

    // 3. Mark appointment with hasConsultationNotes: true
    const appRef = doc(db, 'nutritionAppointments', appointmentId);
    await updateDoc(appRef, {
      hasConsultationNotes: true,
      updatedAt: now
    });

    await addAuditLog(
      'UPDATE',
      'SESSION',
      appointmentId,
      `Saved consultation notes & metrics for ${data.clientName || data.clientId}`
    );

    return noteDocId;
  } catch (err) {
    console.error("Error saving consultation notes:", err);
    throw err;
  }
}

// Action: Save or update nutritionist profile & availability schedule
export async function saveNutritionistProfile(
  userId: string,
  data: Partial<NutritionistProfile>
): Promise<string> {
  try {
    const now = new Date().toISOString();
    const q = query(collection(db, 'nutritionistProfiles'), where('userId', '==', userId));
    const snap = await getDocs(q);

    let docId = '';
    if (!snap.empty && snap.docs[0]) {
      docId = snap.docs[0].id;
      const ref = doc(db, 'nutritionistProfiles', docId);
      await updateDoc(ref, {
        ...data,
        updatedAt: now
      });
    } else {
      const newRef = doc(collection(db, 'nutritionistProfiles'));
      docId = newRef.id;
      await setDoc(newRef, {
        id: docId,
        ...data,
        userId,
        active: data.active !== undefined ? data.active : true,
        schedule: data.schedule || {},
        createdAt: now,
        updatedAt: now
      });
    }

    await addAuditLog(
      'UPDATE',
      'SYSTEM',
      userId,
      `Saved nutritionist profile for ${data.name || userId}`
    );

    return docId;
  } catch (err) {
    console.error("Error saving nutritionist profile:", err);
    throw err;
  }
}

// Fetch consultation notes for a specific appointment
export async function fetchConsultationNotes(appointmentId: string): Promise<NutritionConsultation | null> {
  try {
    const topLevelSnap = await getDocs(query(collection(db, 'nutritionConsultations'), where('appointmentId', '==', appointmentId)));
    if (!topLevelSnap.empty && topLevelSnap.docs[0]) {
      return { id: topLevelSnap.docs[0].id, ...topLevelSnap.docs[0].data() } as NutritionConsultation;
    }

    const subSnap = await getDocs(query(collection(db, 'nutritionAppointments', appointmentId, 'notes')));
    if (!subSnap.empty && subSnap.docs[0]) {
      return { id: subSnap.docs[0].id, ...subSnap.docs[0].data() } as NutritionConsultation;
    }

    return null;
  } catch (err) {
    console.error("Error fetching consultation notes:", err);
    return null;
  }
}

// Fetch all consultation history for a client to track body metrics
export async function fetchClientConsultations(clientId: string): Promise<NutritionConsultation[]> {
  try {
    const q = query(
      collection(db, 'nutritionConsultations'),
      where('clientId', '==', clientId)
    );
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as NutritionConsultation));
    return items.sort((a, b) => (b.date > a.date ? 1 : -1));
  } catch (err) {
    console.error("Error fetching client consultations:", err);
    return [];
  }
}

// Main composite hook for full Nutrition Module access
export function useNutrition() {
  const { appointments, loading: appointmentsLoading, error: appointmentsError } = useNutritionAppointments();
  const { profiles, loading: profilesLoading, error: profilesError } = useNutritionists();

  const loading = appointmentsLoading || profilesLoading;
  const error = appointmentsError || profilesError;

  const updateAppointment = useCallback(async (id: string, updates: Partial<NutritionAppointment>) => {
    try {
      const ref = doc(db, 'nutritionAppointments', id);

      // Validate slot if reschedule changes time, date, or nutritionist
      if (updates.date || updates.startTime || updates.endTime || updates.nutritionistId) {
        const currentSnap = await getDoc(ref);
        const current = currentSnap.exists() ? (currentSnap.data() as NutritionAppointment) : null;
        const nutritionistId = updates.nutritionistId || current?.nutritionistId || '';
        const date = updates.date || current?.date || '';
        const startTime = updates.startTime || current?.startTime || '';
        const endTime = updates.endTime || current?.endTime || '';
        if (nutritionistId && date && startTime && endTime) {
          await validateNutritionSlot(db, nutritionistId, date, startTime, endTime, id);
        }
      }

      await updateDoc(ref, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      await addAuditLog(
        'UPDATE',
        'SESSION',
        id,
        `Updated nutrition appointment ${id}. Updates: ${Object.keys(updates).join(', ')}`
      );
    } catch (err) {
      console.error("Error updating appointment:", err);
      throw err;
    }
  }, []);

  const deleteAppointment = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'nutritionAppointments', id));
      await addAuditLog('DELETE', 'SESSION', id, `Deleted nutrition appointment ${id}`);
    } catch (err) {
      console.error("Error deleting appointment:", err);
      throw err;
    }
  }, []);

  return {
    appointments,
    profiles,
    loading,
    error,
    // Core actions requested
    bookAppointment,
    addAppointment: bookAppointment,
    updateAppointmentStatus,
    updateAppointment,
    deleteAppointment,
    saveConsultationNotes,
    saveConsultation: saveConsultationNotes,
    fetchConsultationNotes,
    fetchConsultation: fetchConsultationNotes,
    fetchClientConsultations,
    saveNutritionistProfile,
    saveProfile: saveNutritionistProfile
  };
}
