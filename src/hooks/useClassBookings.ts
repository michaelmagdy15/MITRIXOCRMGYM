import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ClassBooking, BookingStatus } from '../types/class';
import { isBookingCutoffExceeded, AppError } from '../utils/bookingCutoff';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export function useClassBookings(classId?: string) {
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<ClassBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q = query(collection(db, 'classBookings'));
    
    if (classId) {
      q = query(collection(db, 'classBookings'), where('classId', '==', classId));
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ClassBooking[];
      
      setBookings(bookingsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching class bookings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [classId]);

  const bookClass = async (
    bookingData: Omit<ClassBooking, 'id' | 'bookedAt'>,
    options?: { isAdminRequest?: boolean; cutoffMinutes?: number; classStartTime?: string }
  ) => {
    try {
      const startTime = options?.classStartTime || bookingData.classStartTime;
      const cutoffMinutes = options?.cutoffMinutes ?? 120;
      if (!options?.isAdminRequest && startTime) {
        const isCutoff = isBookingCutoffExceeded({ startTime }, cutoffMinutes);
        if (isCutoff) {
          throw new AppError(
            `Booking for this session closed ${cutoffMinutes} minutes before start time. Please see the front desk for walk-in availability.`,
            403,
            'BOOKING_CUTOFF_EXCEEDED'
          );
        }
      }

      const newBookingRef = doc(collection(db, 'classBookings'));
      await setDoc(newBookingRef, {
        ...bookingData,
        bookedAt: new Date().toISOString()
      });
      await addAuditLog('CREATE', 'CLASS', newBookingRef.id, `Class booking created for ${bookingData.memberName || bookingData.clientId || 'member'} on ${bookingData.className || bookingData.classId}`, currentUser?.name);
      return newBookingRef.id;
    } catch (error) {
      console.error("Error booking class:", error);
      throw error;
    }
  };

  const updateBookingStatus = async (id: string, status: BookingStatus) => {
    try {
      const bookingRef = doc(db, 'classBookings', id);
      await updateDoc(bookingRef, { status });
      const booking = bookings.find(b => b.id === id);
      await addAuditLog('UPDATE', 'CLASS', id, `Class booking status updated to ${status} for ${booking?.memberName || booking?.clientId || 'member'}`, currentUser?.name);
      // TODO: Waitlist promotion logic should ideally be triggered by a Cloud Function
      // or server endpoint here instead of purely client-side to ensure atomicity.
    } catch (error) {
      console.error("Error updating booking status:", error);
      throw error;
    }
  };

  const cancelBooking = async (id: string, classStartTime: string) => {
    try {
      const startTime = new Date(classStartTime).getTime();
      const now = Date.now();
      const twoHoursInMs = 2 * 60 * 60 * 1000;
      
      if (startTime - now < twoHoursInMs) {
        throw new Error("Cancellations are locked within 2 hours of the class start time.");
      }

      const bookingRef = doc(db, 'classBookings', id);
      const booking = bookings.find(b => b.id === id);
      await updateDoc(bookingRef, { status: 'cancelled' });
      await addAuditLog('UPDATE', 'CLASS', id, `Class booking cancelled for ${booking?.memberName || booking?.clientId || 'member'}`, currentUser?.name);
    } catch (error) {
      console.error("Error cancelling booking:", error);
      throw error;
    }
  };

  return { bookings, loading, bookClass, updateBookingStatus, cancelBooking };
}
