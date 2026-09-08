import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { NutritionAppointment, NutritionConsultation, NutritionistProfile } from '../types/nutrition';
import { addAuditLog } from '../services/auditService';

export function useNutrition() {
  const [appointments, setAppointments] = useState<NutritionAppointment[]>([]);
  const [profiles, setProfiles] = useState<NutritionistProfile[]>([]);
  const [consultations, setConsultations] = useState<NutritionConsultation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appointmentsQ = query(collection(db, 'nutritionAppointments'), orderBy('date', 'desc'));
    const profilesQ = query(collection(db, 'nutritionistProfiles'));
    
    // Listen to appointments
    const unsubscribeAppointments = onSnapshot(appointmentsQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NutritionAppointment[];
      setAppointments(data);
    }, (error) => console.error("Error fetching nutrition appointments:", error));

    // Listen to nutritionist profiles
    const unsubscribeProfiles = onSnapshot(profilesQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NutritionistProfile[];
      setProfiles(data);
      setLoading(false); // Consider loading finished once both are initiated (or at least profiles which usually load fast)
    }, (error) => {
      console.error("Error fetching nutritionist profiles:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeAppointments();
      unsubscribeProfiles();
    };
  }, []);

  // -- APPOINTMENTS --

  const addAppointment = async (data: Omit<NutritionAppointment, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newRef = doc(collection(db, 'nutritionAppointments'));
      const now = new Date().toISOString();
      const appointmentData = {
        ...data,
        createdAt: now,
        updatedAt: now
      };
      await setDoc(newRef, appointmentData);
      
      await addAuditLog(
        'CREATE',
        'SESSION',
        newRef.id,
        `Created nutrition appointment for ${data.clientName} on ${data.date}`
      );

      return newRef.id;
    } catch (error) {
      console.error("Error adding nutrition appointment:", error);
      throw error;
    }
  };

  const updateAppointment = async (id: string, updates: Partial<NutritionAppointment>) => {
    try {
      const ref = doc(db, 'nutritionAppointments', id);
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
    } catch (error) {
      console.error("Error updating nutrition appointment:", error);
      throw error;
    }
  };

  const deleteAppointment = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'nutritionAppointments', id));
      await addAuditLog(
        'DELETE',
        'SESSION',
        id,
        `Deleted nutrition appointment ${id}`
      );
    } catch (error) {
      console.error("Error deleting nutrition appointment:", error);
      throw error;
    }
  };

  // -- NUTRITIONIST PROFILES --

  const saveProfile = async (userId: string, data: Partial<NutritionistProfile>) => {
    try {
      // Check if profile exists
      const q = query(collection(db, 'nutritionistProfiles'), where('userId', '==', userId));
      const snap = await getDocs(q);
      
      const now = new Date().toISOString();
      if (!snap.empty && snap.docs.length > 0 && snap.docs[0]) {
        // Update existing
        const docId = snap.docs[0].id;
        const ref = doc(db, 'nutritionistProfiles', docId);
        await updateDoc(ref, {
          ...data,
          updatedAt: now
        });
      } else {
        // Create new
        const newRef = doc(collection(db, 'nutritionistProfiles'));
        await setDoc(newRef, {
          ...data,
          userId,
          createdAt: now,
          updatedAt: now
        });
      }
    } catch (error) {
      console.error("Error saving nutritionist profile:", error);
      throw error;
    }
  };

  // -- CONSULTATIONS (Notes) --

  const fetchConsultation = async (appointmentId: string) => {
    try {
      // Storing notes in a subcollection for security (as per PRD)
      const q = query(collection(db, 'nutritionAppointments', appointmentId, 'notes'));
      const snap = await getDocs(q);
      if (!snap.empty && snap.docs.length > 0 && snap.docs[0]) {
        const firstDoc = snap.docs[0];
        return { id: firstDoc.id, ...firstDoc.data() } as NutritionConsultation;
      }
      return null;
    } catch (error) {
      console.error("Error fetching consultation notes:", error);
      throw error;
    }
  };

  const saveConsultation = async (appointmentId: string, data: Omit<NutritionConsultation, 'id' | 'appointmentId' | 'createdAt' | 'updatedAt'>) => {
    try {
      const notesRef = collection(db, 'nutritionAppointments', appointmentId, 'notes');
      const q = query(notesRef);
      const snap = await getDocs(q);
      
      const now = new Date().toISOString();
      
      if (!snap.empty && snap.docs.length > 0 && snap.docs[0]) {
        // Update
        const docId = snap.docs[0].id;
        const ref = doc(db, 'nutritionAppointments', appointmentId, 'notes', docId);
        await updateDoc(ref, {
          ...data,
          updatedAt: now
        });
        return docId;
      } else {
        // Create
        const newRef = doc(notesRef);
        await setDoc(newRef, {
          ...data,
          appointmentId,
          createdAt: now,
          updatedAt: now
        });
        return newRef.id;
      }
    } catch (error) {
      console.error("Error saving consultation notes:", error);
      throw error;
    }
  };

  return { 
    appointments, 
    profiles, 
    loading, 
    addAppointment, 
    updateAppointment, 
    deleteAppointment,
    saveProfile,
    fetchConsultation,
    saveConsultation
  };
}
