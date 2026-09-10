import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from './context';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  arrayUnion, 
  arrayRemove,
  runTransaction 
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Check, 
  X, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  Search, 
  ShieldAlert, 
  DollarSign, 
  MapPin, 
  CheckCircle, 
  Calendar, 
  Dumbbell, 
  ShoppingBag, 
  UserCheck, 
  UserX, 
  AlertCircle,
  Filter,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { processPaymentTransaction } from './services/transactionService';
import { Package, Branch } from './types';
import { ClassBooking, BookingStatus } from './types/class';
import { PaymentCategory, resolvePaymentCategory } from './utils/paymentCategories';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format, isToday, isTomorrow, isThisWeek, parseISO } from 'date-fns';

interface BookingItem {
  packageId: string;
  packageName: string;
  price: number;
  quantity: number;
  sessions: number;
  type: string;
  expiryDays: number;
}

interface BookingRequest {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientId: string;
  items: BookingItem[];
  totalPrice: number;
  paymentMethod: string;
  instapayRef?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
}

interface PTSessionRecord {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  trainerId?: string;
  trainerName?: string;
  coachId?: string;
  coachName?: string;
  date: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  branch?: string;
  status: 'Scheduled' | 'Attended' | 'No Show' | 'Cancelled';
  notes?: string;
  type?: string;
}

export default function Bookings() {
  const { currentUser, users, packages, branches, clients } = useAppContext();

  // Active Hub Tab: 'classes' | 'pt' | 'store'
  const [hubTab, setHubTab] = useState<'classes' | 'pt' | 'store'>('classes');

  // =========================================================================
  // 1. GROUP CLASS BOOKINGS STATE (from 'classBookings' collection)
  // =========================================================================
  const [classBookings, setClassBookings] = useState<ClassBooking[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [classSearchQuery, setClassSearchQuery] = useState('');
  const [classStatusFilter, setClassStatusFilter] = useState<'all' | 'booked' | 'attended' | 'waitlist' | 'cancelled' | 'no-show'>('all');
  const [classDateFilter, setClassDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'upcoming'>('all');
  const [classBranchFilter, setClassBranchFilter] = useState<string>('all');
  
  // Action states for class bookings
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<ClassBooking | null>(null);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  // Real-time listener for classBookings
  useEffect(() => {
    const q = collection(db, 'classBookings');
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ClassBooking[];
      // Sort newest bookings first
      list.sort((a, b) => {
        const timeA = new Date(a.bookedAt || a.createdAt || a.classStartTime || 0).getTime();
        const timeB = new Date(b.bookedAt || b.createdAt || b.classStartTime || 0).getTime();
        return timeB - timeA;
      });
      setClassBookings(list);
      setLoadingClasses(false);
    }, (err) => {
      console.error("Error listening to classBookings:", err);
      setLoadingClasses(false);
    });

    return () => unsub();
  }, []);

  // =========================================================================
  // 2. 1-ON-1 PT SESSIONS STATE (from 'sessions' collection)
  // =========================================================================
  const [ptSessions, setPtSessions] = useState<PTSessionRecord[]>([]);
  const [loadingPt, setLoadingPt] = useState(true);
  const [ptSearchQuery, setPtSearchQuery] = useState('');
  const [ptStatusFilter, setPtStatusFilter] = useState<'all' | 'Scheduled' | 'Attended' | 'Cancelled' | 'No Show'>('all');
  const [ptDateFilter, setPtDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'upcoming'>('all');

  // Real-time listener for PT sessions
  useEffect(() => {
    const q = collection(db, 'sessions');
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          clientId: data.clientId,
          clientName: data.clientName,
          clientPhone: data.clientPhone,
          trainerId: data.coachId || data.trainerId,
          trainerName: data.coachName || data.trainerName || 'Coach',
          date: data.date || (data.startTime ? data.startTime.substring(0, 10) : ''),
          time: data.time || (data.startTime ? data.startTime.substring(11, 16) : '10:00'),
          startTime: data.startTime,
          endTime: data.endTime,
          branch: data.branch || 'Main Studio',
          status: data.status || 'Scheduled',
          notes: data.notes || '',
          type: data.type || '1-on-1'
        } as PTSessionRecord;
      });

      // Sort chronological
      list.sort((a, b) => {
        const timeA = new Date(a.date ? `${a.date}T${a.time || '00:00'}` : 0).getTime();
        const timeB = new Date(b.date ? `${b.date}T${b.time || '00:00'}` : 0).getTime();
        return timeB - timeA;
      });

      setPtSessions(list);
      setLoadingPt(false);
    }, (err) => {
      console.error("Error listening to sessions:", err);
      setLoadingPt(false);
    });

    return () => unsub();
  }, []);

  // =========================================================================
  // 3. STOREFRONT PURCHASE REQUESTS STATE (from 'booking_requests' collection)
  // =========================================================================
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loadingStore, setLoadingStore] = useState(true);
  const [storeSearchQuery, setStoreSearchQuery] = useState('');
  const [storeStatusFilter, setStoreStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');

  // Accept Dialog State
  const [selectedRequest, setSelectedRequest] = useState<BookingRequest | null>(null);
  const [isAcceptOpen, setIsAcceptOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientBranch, setClientBranch] = useState<Branch | ''>('');
  const [clientGender, setClientGender] = useState('Prefer not to say');
  const [salesRepId, setSalesRepId] = useState('');
  const [processingAccept, setProcessingAccept] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  // Reject Dialog State
  const [rejectingRequest, setRejectingRequest] = useState<BookingRequest | null>(null);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processingReject, setProcessingReject] = useState(false);

  // Fetch booking requests in real-time
  useEffect(() => {
    const q = collection(db, 'booking_requests');
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as BookingRequest[];
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setRequests(list);
      setLoadingStore(false);
    }, (err) => {
      console.error("Error loading booking requests:", err);
      setLoadingStore(false);
    });

    return () => unsub();
  }, []);

  // Pre-fill accept dialog when selected
  useEffect(() => {
    if (selectedRequest) {
      setClientName(selectedRequest.clientName);
      setClientPhone(selectedRequest.clientPhone);
      setClientEmail(selectedRequest.clientEmail);
      setAcceptError('');
      
      if (selectedRequest.clientId && selectedRequest.clientId !== 'GUEST-LEAD') {
        const foundClient = clients.find(c => c.id === selectedRequest.clientId || c.memberId === selectedRequest.clientId);
        if (foundClient) {
          if (foundClient.branch) setClientBranch(foundClient.branch as Branch);
          if (foundClient.gender) setClientGender(foundClient.gender);
        } else {
          getDocs(query(collection(db, 'clients'), where('id', '==', selectedRequest.clientId))).then(snap => {
            if (!snap.empty && snap.docs[0]) {
              const data = snap.docs[0].data();
              if (data.branch) setClientBranch(data.branch);
              if (data.gender) setClientGender(data.gender);
            }
          }).catch(err => console.error("Error loading client record for accept dialog:", err));
        }
      }
    } else {
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientBranch('');
      setClientGender('Prefer not to say');
      setSalesRepId('');
    }
  }, [selectedRequest, clients]);

  // =========================================================================
  // CLASS BOOKINGS ACTIONS
  // =========================================================================
  const handleCheckInClassBooking = async (booking: ClassBooking) => {
    setProcessingBookingId(booking.id);
    try {
      // 1. Update classBookings status
      await updateDoc(doc(db, 'classBookings', booking.id), {
        status: 'attended',
        checkedInAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // 2. Update classSchedules checkedIn array if classId is present
      if (booking.classId) {
        const resolvedClientId = booking.clientId || booking.memberId;
        await updateDoc(doc(db, 'classSchedules', booking.classId), {
          checkedIn: arrayUnion(resolvedClientId),
          noShows: arrayRemove(resolvedClientId)
        });
      }
    } catch (err) {
      console.error("Error checking in booking:", err);
      alert("Failed to check in attendee. Please try again.");
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleMarkNoShowClassBooking = async (booking: ClassBooking) => {
    setProcessingBookingId(booking.id);
    try {
      // 1. Update classBookings status
      await updateDoc(doc(db, 'classBookings', booking.id), {
        status: 'no-show',
        updatedAt: new Date().toISOString()
      });

      // 2. Update classSchedules noShows array
      if (booking.classId) {
        const resolvedClientId = booking.clientId || booking.memberId;
        await updateDoc(doc(db, 'classSchedules', booking.classId), {
          noShows: arrayUnion(resolvedClientId),
          checkedIn: arrayRemove(resolvedClientId)
        });
      }
    } catch (err) {
      console.error("Error marking no-show:", err);
      alert("Failed to mark no-show. Please try again.");
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleConfirmCancelClassBooking = async () => {
    if (!cancellingBooking) return;
    setProcessingBookingId(cancellingBooking.id);
    setCancelFeedback(null);

    const targetClassId = cancellingBooking.classId;
    const targetClientId = cancellingBooking.clientId || cancellingBooking.memberId;

    try {
      // Try backend endpoint first (handles transactions, balance refunds, waitlist FIFO promotion)
      let backendSuccess = false;
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/classes/book', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            classId: targetClassId,
            action: 'leave',
            clientId: targetClientId
          })
        });
        if (res.ok) {
          backendSuccess = true;
        }
      } catch (e) {
        console.warn("Backend /api/classes/book call failed, falling back to direct Firestore update", e);
      }

      // If backend was not reached or returned error, perform direct Firestore refund
      if (!backendSuccess) {
        // Update booking doc
        await updateDoc(doc(db, 'classBookings', cancellingBooking.id), {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Remove from class attendees
        if (targetClassId) {
          await updateDoc(doc(db, 'classSchedules', targetClassId), {
            attendees: arrayRemove(targetClientId),
            checkedIn: arrayRemove(targetClientId)
          });
        }

        // Restore member's package session if they have a client doc
        if (targetClientId) {
          try {
            const clientDocRef = doc(db, 'clients', targetClientId);
            await runTransaction(db, async (t) => {
              const cSnap = await t.get(clientDocRef);
              if (cSnap.exists()) {
                const cData = cSnap.data();
                const packages = Array.isArray(cData.packages) ? [...cData.packages] : [];
                for (let i = 0; i < packages.length; i++) {
                  if (packages[i].usedSessions && packages[i].usedSessions > 0) {
                    packages[i].usedSessions = Math.max(0, packages[i].usedSessions - 1);
                    if (typeof packages[i].sessionsRemaining === 'number') {
                      packages[i].sessionsRemaining = packages[i].sessionsRemaining + 1;
                    }
                    break;
                  }
                }
                const rawRemaining = cData.sessionsRemaining;
                const newRemaining = typeof rawRemaining === 'number' ? rawRemaining + 1 : rawRemaining;
                t.update(clientDocRef, {
                  packages,
                  sessionsRemaining: newRemaining,
                  updatedAt: new Date().toISOString()
                });
              }
            });
          } catch (refundErr) {
            console.warn("Could not restore client session balance:", refundErr);
          }
        }
      }

      setIsCancelConfirmOpen(false);
      setCancellingBooking(null);
    } catch (err: any) {
      console.error("Error cancelling class booking:", err);
      setCancelFeedback(err?.message || "Failed to cancel booking. Please try again.");
    } finally {
      setProcessingBookingId(null);
    }
  };

  // =========================================================================
  // PT SESSIONS ACTIONS
  // =========================================================================
  const handleUpdatePtStatus = async (sessionId: string, newStatus: 'Scheduled' | 'Attended' | 'Cancelled' | 'No Show') => {
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error updating PT session status:", err);
      alert("Failed to update session status.");
    }
  };

  // =========================================================================
  // STOREFRONT REQUEST ACTIONS (Accept / Decline)
  // =========================================================================
  const resolveCategory = (pkg: Package): PaymentCategory => resolvePaymentCategory(pkg.name);

  const handleAcceptConfirm = async () => {
    if (!selectedRequest) return;
    if (!clientBranch) {
      setAcceptError('Please select a branch for the member.');
      return;
    }
    if (!salesRepId) {
      setAcceptError('Please assign a sales representative for this booking.');
      return;
    }

    setProcessingAccept(true);
    setAcceptError('');

    try {
      const assignedRep = users.find(u => u.id === salesRepId);
      const repName = assignedRep?.name || 'Unassigned';

      // 1. Update the client's profile details on the spot
      if (selectedRequest.clientId && selectedRequest.clientId !== 'GUEST-LEAD') {
        await updateDoc(doc(db, 'clients', selectedRequest.clientId), {
          name: clientName,
          phone: clientPhone,
          branch: clientBranch,
          gender: clientGender,
          status: 'Active',
          lastContactDate: new Date().toISOString()
        });
      }

      // 2. Loop through items in booking request and run transaction for each package
      for (const item of selectedRequest.items) {
        const sysPkg = packages.find(p => p.id === item.packageId || p.name.toLowerCase() === item.packageName.toLowerCase());
        const category = sysPkg ? resolveCategory(sysPkg) : 'Memberships' as PaymentCategory;

        const isKidsPackage = item.packageName.toLowerCase().includes('kids') || item.packageName.toLowerCase().includes('junior');
        if (isKidsPackage && clientBranch !== 'Mivida') {
          alert(`Booking rejected: "${item.packageName}" can only be booked at the Mivida branch.`);
          return;
        }

        await processPaymentTransaction({
          clientId: selectedRequest.clientId,
          clientName: clientName,
          clientBranch: clientBranch,
          clientStatus: 'Active',
          amount: item.price * item.quantity,
          method: selectedRequest.paymentMethod as any,
          instapayRef: selectedRequest.instapayRef || undefined,
          packageType: item.packageName,
          packageCategory: category,
          recordedBy: currentUser?.id || 'admin',
          recordedByName: currentUser?.name || 'Admin',
          sales_rep_id: salesRepId,
          salesName: repName,
          paymentDate: new Date().toISOString(),
          startDate: new Date().toISOString(),
          systemPackage: sysPkg,
          notes: `Storefront booking request approved. Method: ${selectedRequest.paymentMethod}`
        });
      }

      // 3. Mark the booking request as Approved
      await updateDoc(doc(db, 'booking_requests', selectedRequest.id), { status: 'Approved' });

      // 4. Create an automatic Follow Up task
      await setDoc(doc(db, 'tasks', crypto.randomUUID()), {
        title: `Follow up with ${clientName}`,
        description: `Follow up on recently activated package. Ensure everything is smooth.`,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        assignedTo: salesRepId,
        status: 'Pending',
        type: 'Follow Up',
        createdAt: new Date().toISOString()
      });

      try {
        const { notifyClient } = await import('./services/pushService');
        const pkgNames = Array.isArray(selectedRequest.items)
          ? selectedRequest.items.map(item => item.packageName).join(', ')
          : (selectedRequest.packageName || 'Package');
        await notifyClient(
          selectedRequest.clientId,
          'Purchase Approved! 🎉',
          `Your request for ${pkgNames} has been approved and activated.`
        );
      } catch (err) {
        console.error('Failed to send client push notification:', err);
      }

      setIsAcceptOpen(false);
      setSelectedRequest(null);
    } catch (err: any) {
      console.error("Error accepting booking request:", err);
      setAcceptError(err.message || 'Failed to approve booking request.');
    } finally {
      setProcessingAccept(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingRequest) return;
    setProcessingReject(true);

    try {
      await updateDoc(doc(db, 'booking_requests', rejectingRequest.id), { status: 'Rejected' });

      if (salesRepId) {
        await setDoc(doc(db, 'tasks', crypto.randomUUID()), {
          title: `Follow up with ${rejectingRequest.clientName} regarding rejected request`,
          description: `Reason: ${rejectReason}`,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          assignedTo: salesRepId,
          status: 'Pending',
          type: 'Follow Up',
          createdAt: new Date().toISOString()
        });
      }

      try {
        const { notifyClient } = await import('./services/pushService');
        await notifyClient(
          rejectingRequest.clientId,
          'Purchase Request Declined',
          `Your booking request has been declined. ${rejectReason ? `Reason: ${rejectReason}` : ''}`
        );
      } catch (err) {
        console.error('Failed to send client push notification:', err);
      }

      setIsRejectOpen(false);
      setRejectingRequest(null);
      setRejectReason('');
    } catch (err) {
      console.error("Error rejecting booking request:", err);
    } finally {
      setProcessingReject(false);
    }
  };

  // =========================================================================
  // FILTERED DATASETS
  // =========================================================================
  
  // 1. Filtered Class Bookings
  const filteredClassBookings = useMemo(() => {
    return classBookings.filter(b => {
      // Status filter
      if (classStatusFilter !== 'all' && b.status !== classStatusFilter) return false;

      // Branch filter
      if (classBranchFilter !== 'all' && b.branch && b.branch !== classBranchFilter) return false;

      // Date filter
      if (classDateFilter !== 'all') {
        const dateStr = b.classDate || (b.classStartTime ? b.classStartTime.substring(0, 10) : '');
        if (dateStr) {
          try {
            const parsed = parseISO(dateStr);
            if (classDateFilter === 'today' && !isToday(parsed)) return false;
            if (classDateFilter === 'tomorrow' && !isTomorrow(parsed)) return false;
            if (classDateFilter === 'week' && !isThisWeek(parsed, { weekStartsOn: 0 })) return false;
            if (classDateFilter === 'upcoming') {
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              if (dateStr < todayStr) return false;
            }
          } catch {
            // keep if date parsing fails
          }
        }
      }

      // Search Query
      if (classSearchQuery.trim()) {
        const q = classSearchQuery.toLowerCase().trim();
        const matchesName = (b.memberName || '').toLowerCase().includes(q);
        const matchesPhone = (b.memberPhone || '').includes(q);
        const matchesMemberId = (b.memberId || '').toLowerCase().includes(q);
        const matchesClass = (b.className || '').toLowerCase().includes(q);
        const matchesBranch = (b.branch || '').toLowerCase().includes(q);
        const matchesCoach = (b.coachName || '').toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesMemberId && !matchesClass && !matchesBranch && !matchesCoach) {
          return false;
        }
      }

      return true;
    });
  }, [classBookings, classStatusFilter, classBranchFilter, classDateFilter, classSearchQuery]);

  // 2. Filtered PT Sessions
  const filteredPtSessions = useMemo(() => {
    return ptSessions.filter(s => {
      // Status filter
      if (ptStatusFilter !== 'all' && s.status !== ptStatusFilter) return false;

      // Date filter
      if (ptDateFilter !== 'all' && s.date) {
        try {
          const parsed = parseISO(s.date);
          if (ptDateFilter === 'today' && !isToday(parsed)) return false;
          if (ptDateFilter === 'tomorrow' && !isTomorrow(parsed)) return false;
          if (ptDateFilter === 'week' && !isThisWeek(parsed, { weekStartsOn: 0 })) return false;
          if (ptDateFilter === 'upcoming') {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            if (s.date < todayStr) return false;
          }
        } catch {
          // keep
        }
      }

      // Search Query
      if (ptSearchQuery.trim()) {
        const q = ptSearchQuery.toLowerCase().trim();
        const matchesClient = (s.clientName || '').toLowerCase().includes(q);
        const matchesPhone = (s.clientPhone || '').includes(q);
        const matchesTrainer = (s.trainerName || '').toLowerCase().includes(q);
        const matchesBranch = (s.branch || '').toLowerCase().includes(q);
        if (!matchesClient && !matchesPhone && !matchesTrainer && !matchesBranch) {
          return false;
        }
      }

      return true;
    });
  }, [ptSessions, ptStatusFilter, ptDateFilter, ptSearchQuery]);

  // 3. Filtered Store Requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchesStatus = storeStatusFilter === 'All' || r.status === storeStatusFilter;
      const q = storeSearchQuery.toLowerCase();
      const matchesSearch = 
        (r.clientName || '').toLowerCase().includes(q) || 
        (r.clientPhone || '').includes(q) || 
        (r.clientEmail || '').toLowerCase().includes(q) || 
        (r.instapayRef && r.instapayRef.includes(q)) ||
        (r.items || []).some(i => (i.packageName || '').toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [requests, storeStatusFilter, storeSearchQuery]);

  // Metrics Counters
  const pendingRequestsCount = requests.filter(r => r.status === 'Pending').length;
  const activeClassBookingsCount = classBookings.filter(b => b.status === 'booked').length;
  const todayClassBookingsCount = classBookings.filter(b => {
    const d = b.classDate || (b.classStartTime ? b.classStartTime.substring(0, 10) : '');
    return d === format(new Date(), 'yyyy-MM-dd');
  }).length;
  const activePtSessionsCount = ptSessions.filter(s => s.status === 'Scheduled').length;

  return (
    <div className="space-y-6">
      {/* Header & Section Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> Bookings & Sessions Center
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor real-time member bookings across group classes, 1-on-1 private training sessions, and storefront purchase requests.
          </p>
        </div>

        {/* Top-Level Navigation Tabs */}
        <div className="flex bg-muted p-1 rounded-xl border border-border/40">
          <button
            onClick={() => setHubTab('classes')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              hubTab === 'classes' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Dumbbell className="h-3.5 w-3.5" />
            Group Classes
            {activeClassBookingsCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 bg-primary/10 text-primary font-bold">
                {activeClassBookingsCount}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setHubTab('pt')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              hubTab === 'pt' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            1-on-1 PT
            {activePtSessionsCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 bg-indigo-500/10 text-indigo-400 font-bold">
                {activePtSessionsCount}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setHubTab('store')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              hubTab === 'store' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Store Orders
            {pendingRequestsCount > 0 && (
              <Badge className="px-1.5 py-0 text-[10px] h-4 bg-rose-500 text-white font-bold animate-pulse">
                {pendingRequestsCount}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: GROUP CLASS BOOKINGS */}
      {/* ===================================================================== */}
      {hubTab === 'classes' && (
        <div className="space-y-4">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Today's Class Bookings</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-foreground">{todayClassBookingsCount}</span>
                  <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 font-mono">Today</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Active Bookings</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-primary">{activeClassBookingsCount}</span>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">Confirmed</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Checked In Today</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-emerald-500">
                    {classBookings.filter(b => b.status === 'attended').length}
                  </span>
                  <UserCheck className="h-4 w-4 text-emerald-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Cancelled / No-Show</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-rose-500">
                    {classBookings.filter(b => b.status === 'cancelled' || b.status === 'no-show').length}
                  </span>
                  <UserX className="h-4 w-4 text-rose-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card className="border bg-card/40 shadow-xs">
            <CardContent className="p-3.5 flex flex-wrap gap-3 items-center justify-between">
              {/* Search */}
              <div className="relative w-full sm:w-80">
                <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search member, phone, ID, class, coach..." 
                  className="ps-9 h-9 text-xs bg-background"
                  value={classSearchQuery}
                  onChange={(e) => setClassSearchQuery(e.target.value)}
                />
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Date Filter */}
                <Select value={classDateFilter} onValueChange={(v: any) => setClassDateFilter(v)}>
                  <SelectTrigger className="h-9 text-xs w-[130px] bg-background">
                    <SelectValue placeholder="All Dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="tomorrow">Tomorrow</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                  </SelectContent>
                </Select>

                {/* Branch Filter */}
                {branches && branches.length > 0 && (
                  <Select value={classBranchFilter} onValueChange={(val) => { if (val) setClassBranchFilter(val); }}>
                    <SelectTrigger className="h-9 text-xs w-[140px] bg-background">
                      <SelectValue placeholder="All Branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Status Filter */}
                <div className="flex bg-muted p-0.5 rounded-lg border border-border/40">
                  {(['all', 'booked', 'attended', 'cancelled', 'no-show'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setClassStatusFilter(tab)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold capitalize transition-all ${
                        classStatusFilter === tab 
                          ? 'bg-background text-foreground shadow-xs' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Group Class Bookings Table */}
          <Card className="border bg-card/40">
            <CardContent className="p-0">
              {loadingClasses ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filteredClassBookings.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-xs italic">
                  No class bookings match the current filter criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="uppercase font-bold text-[11px]">Member</TableHead>
                        <TableHead className="uppercase font-bold text-[11px]">Class & Facility</TableHead>
                        <TableHead className="uppercase font-bold text-[11px]">Date & Time</TableHead>
                        <TableHead className="uppercase font-bold text-[11px]">Booked At</TableHead>
                        <TableHead className="uppercase font-bold text-[11px] w-[110px]">Status</TableHead>
                        <TableHead className="text-right uppercase font-bold text-[11px] w-[170px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClassBookings.map(b => {
                        const isProcessing = processingBookingId === b.id;
                        const clientInfo = clients.find(c => c.id === b.clientId || c.memberId === b.memberId);
                        const displayName = b.memberName || clientInfo?.name || 'Member';
                        const displayPhone = b.memberPhone || clientInfo?.phone || '';
                        const displayId = b.memberId || clientInfo?.memberId || '';

                        return (
                          <TableRow key={b.id} className="hover:bg-muted/30 transition-colors">
                            {/* Member info */}
                            <TableCell className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
                                  {displayName.substring(0, 1).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-extrabold text-xs text-foreground flex items-center gap-1.5">
                                    {displayName}
                                    {displayId && (
                                      <span className="text-[10px] font-mono text-muted-foreground font-medium">#{displayId}</span>
                                    )}
                                  </p>
                                  {displayPhone && (
                                    <a 
                                      href={`tel:${displayPhone}`} 
                                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                                    >
                                      <Phone className="h-3 w-3" /> {displayPhone}
                                    </a>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            {/* Class & Facility */}
                            <TableCell className="space-y-0.5">
                              <p className="font-bold text-xs text-foreground uppercase">{b.className || 'Group Class'}</p>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span>{b.branch || 'Main Studio'}</span>
                                {b.coachName && (
                                  <>
                                    <span>•</span>
                                    <span>Coach: {b.coachName}</span>
                                  </>
                                )}
                              </div>
                            </TableCell>

                            {/* Date & Time */}
                            <TableCell className="space-y-0.5">
                              <p className="font-semibold text-xs text-foreground">
                                {b.classDate ? format(parseISO(b.classDate), 'EEE, MMM d, yyyy') : (b.classStartTime ? b.classStartTime.substring(0, 10) : '—')}
                              </p>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {b.classTime || (b.classStartTime ? b.classStartTime.substring(11, 16) : '—')}
                              </p>
                            </TableCell>

                            {/* Booked At */}
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {b.bookedAt ? new Date(b.bookedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </TableCell>

                            {/* Status Badge */}
                            <TableCell>
                              <Badge 
                                className={`text-[10px] font-black uppercase tracking-wider ${
                                  b.status === 'attended'
                                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                    : b.status === 'booked'
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : b.status === 'waitlist' || b.status === 'waitlisted'
                                    ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                    : b.status === 'cancelled'
                                    ? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                    : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                }`}
                              >
                                {b.status}
                              </Badge>
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {b.status === 'booked' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isProcessing}
                                      onClick={() => handleCheckInClassBooking(b)}
                                      className="h-7 px-2 text-[11px] font-bold border-emerald-500/30 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                                      title="Check in attendee"
                                    >
                                      <Check className="h-3 w-3 mr-0.5" /> Check-in
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isProcessing}
                                      onClick={() => handleMarkNoShowClassBooking(b)}
                                      className="h-7 px-2 text-[11px] font-bold border-amber-500/30 text-amber-600 hover:bg-amber-600 hover:text-white"
                                      title="Mark as No-Show"
                                    >
                                      No-Show
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={isProcessing}
                                      onClick={() => { setCancellingBooking(b); setIsCancelConfirmOpen(true); }}
                                      className="h-7 px-2 text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                                      title="Cancel booking and refund session"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}

                                {b.status === 'attended' && (
                                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                                    <CheckCircle className="h-3.5 w-3.5" /> Checked In
                                  </span>
                                )}

                                {b.status === 'cancelled' && (
                                  <span className="text-[11px] text-muted-foreground italic">Cancelled</span>
                                )}

                                {b.status === 'no-show' && (
                                  <span className="text-[11px] text-rose-500 font-semibold">Marked No-Show</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: 1-ON-1 PT SESSIONS */}
      {/* ===================================================================== */}
      {hubTab === 'pt' && (
        <div className="space-y-4">
          {/* PT Quick Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Scheduled PT Sessions</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-indigo-400">{activePtSessionsCount}</span>
                  <Badge variant="outline" className="text-[10px] text-indigo-400 border-indigo-400/30">Active</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Attended Sessions</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-emerald-500">
                    {ptSessions.filter(s => s.status === 'Attended').length}
                  </span>
                  <UserCheck className="h-4 w-4 text-emerald-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Cancelled PT</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-muted-foreground">
                    {ptSessions.filter(s => s.status === 'Cancelled').length}
                  </span>
                  <UserX className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Total PT Logged</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-foreground">{ptSessions.length}</span>
                  <Badge variant="secondary" className="text-[10px]">All time</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* PT Filter Bar */}
          <Card className="border bg-card/40 shadow-xs">
            <CardContent className="p-3.5 flex flex-wrap gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search client, coach, branch..." 
                  className="ps-9 h-9 text-xs bg-background"
                  value={ptSearchQuery}
                  onChange={(e) => setPtSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={ptDateFilter} onValueChange={(v: any) => setPtDateFilter(v)}>
                  <SelectTrigger className="h-9 text-xs w-[130px] bg-background">
                    <SelectValue placeholder="All Dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="tomorrow">Tomorrow</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex bg-muted p-0.5 rounded-lg border border-border/40">
                  {(['all', 'Scheduled', 'Attended', 'Cancelled', 'No Show'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setPtStatusFilter(tab)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold capitalize transition-all ${
                        ptStatusFilter === tab 
                          ? 'bg-background text-foreground shadow-xs' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PT Sessions Table */}
          <Card className="border bg-card/40">
            <CardContent className="p-0">
              {loadingPt ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filteredPtSessions.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-xs italic">
                  No 1-on-1 PT sessions recorded.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="uppercase font-bold text-[11px]">Client</TableHead>
                        <TableHead className="uppercase font-bold text-[11px]">Coach / Trainer</TableHead>
                        <TableHead className="uppercase font-bold text-[11px]">Date & Time</TableHead>
                        <TableHead className="uppercase font-bold text-[11px]">Branch</TableHead>
                        <TableHead className="uppercase font-bold text-[11px] w-[110px]">Status</TableHead>
                        <TableHead className="text-right uppercase font-bold text-[11px] w-[160px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPtSessions.map(s => {
                        const clientInfo = clients.find(c => c.id === s.clientId);
                        const displayName = s.clientName || clientInfo?.name || 'Member';
                        const displayPhone = s.clientPhone || clientInfo?.phone || '';

                        return (
                          <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="space-y-0.5">
                              <p className="font-extrabold text-xs text-foreground uppercase">{displayName}</p>
                              {displayPhone && (
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {displayPhone}
                                </p>
                              )}
                            </TableCell>

                            <TableCell className="text-xs font-semibold text-foreground">
                              {s.trainerName || 'Assigned Coach'}
                            </TableCell>

                            <TableCell className="space-y-0.5">
                              <p className="font-semibold text-xs text-foreground">
                                {s.date ? format(parseISO(s.date), 'EEE, MMM d, yyyy') : '—'}
                              </p>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {s.time || '10:00'}
                              </p>
                            </TableCell>

                            <TableCell className="text-xs text-muted-foreground">
                              {s.branch || 'Main Studio'}
                            </TableCell>

                            <TableCell>
                              <Badge 
                                className={`text-[10px] font-black uppercase tracking-wider ${
                                  s.status === 'Attended'
                                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                    : s.status === 'Scheduled'
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : s.status === 'Cancelled'
                                    ? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                    : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                }`}
                              >
                                {s.status}
                              </Badge>
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {s.status === 'Scheduled' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleUpdatePtStatus(s.id, 'Attended')}
                                      className="h-7 px-2 text-[11px] font-bold border-emerald-500/30 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                                    >
                                      <Check className="h-3 w-3 mr-0.5" /> Attended
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleUpdatePtStatus(s.id, 'Cancelled')}
                                      className="h-7 px-2 text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: STOREFRONT PURCHASE REQUESTS */}
      {/* ===================================================================== */}
      {hubTab === 'store' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">Store Package Orders</h2>
              <p className="text-xs text-muted-foreground">Approve or reject package purchases made through the public mobile app store.</p>
            </div>
            
            {/* Status Filter Tab Group */}
            <div className="flex bg-muted p-1 rounded-xl border border-border/40">
              {(['Pending', 'Approved', 'Rejected', 'All'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setStoreStatusFilter(tab)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    storeStatusFilter === tab 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab}
                  {tab === 'Pending' && pendingRequestsCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px]">
                      {pendingRequestsCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, phone, package, or reference..." 
              className="ps-9 bg-card border-none text-xs"
              value={storeSearchQuery}
              onChange={(e) => setStoreSearchQuery(e.target.value)}
            />
          </div>

          {/* Store Requests Table */}
          <Card className="border bg-card/40">
            <CardContent className="p-0">
              {loadingStore ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground text-xs italic">
                  No storefront booking requests found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px] uppercase font-bold text-xs">Date</TableHead>
                        <TableHead className="uppercase font-bold text-xs">Client</TableHead>
                        <TableHead className="uppercase font-bold text-xs">Requested Package(s)</TableHead>
                        <TableHead className="uppercase font-bold text-xs">Price</TableHead>
                        <TableHead className="uppercase font-bold text-xs">Payment Method</TableHead>
                        <TableHead className="w-[120px] uppercase font-bold text-xs">Status</TableHead>
                        {storeStatusFilter === 'Pending' && <TableHead className="w-[200px] text-right uppercase font-bold text-xs">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map(req => (
                        <TableRow key={req.id}>
                          <TableCell className="font-mono text-[11px] text-muted-foreground">
                            {new Date(req.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell className="space-y-0.5">
                            <p className="font-extrabold text-xs uppercase text-foreground">{req.clientName}</p>
                            <p className="text-[10px] text-muted-foreground">📞 {req.clientPhone}</p>
                            {req.clientEmail && <p className="text-[10px] text-zinc-500">✉️ {req.clientEmail}</p>}
                          </TableCell>
                          <TableCell className="space-y-1">
                            {Array.isArray(req.items) && req.items.length > 0 ? (
                              req.items.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-[9px] py-0 border-zinc-700 text-zinc-400 font-bold">x{item.quantity}</Badge>
                                  <span className="text-xs font-semibold text-foreground uppercase">{item.packageName}</span>
                                  {item.sessions && <span className="text-[10px] text-muted-foreground font-medium">({item.sessions} sessions)</span>}
                                </div>
                              ))
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-foreground uppercase">{req.packageName || req.type || 'Custom Request'}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-black text-xs text-primary">
                            {req.totalPrice.toLocaleString()} EGP
                          </TableCell>
                          <TableCell className="space-y-0.5">
                            <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-wider">{req.paymentMethod}</Badge>
                            {req.paymentMethod === 'Instapay' && req.instapayRef && (
                              <p className="text-[10px] text-muted-foreground font-mono">Ref: {req.instapayRef}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              className={`text-[9px] font-black uppercase tracking-wider ${
                                req.status === 'Approved' 
                                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                                  : req.status === 'Rejected'
                                  ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              }`}
                            >
                              {req.status}
                            </Badge>
                          </TableCell>
                          {storeStatusFilter === 'Pending' && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 text-xs font-bold border-rose-500/30 text-rose-500 hover:bg-rose-600 hover:text-white"
                                  onClick={() => { setRejectingRequest(req); setIsRejectOpen(true); }}
                                >
                                  <X className="h-3 w-3 mr-1" /> Decline
                                </Button>
                                <Button 
                                  size="sm" 
                                  className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                                  onClick={() => { setSelectedRequest(req); setIsAcceptOpen(true); }}
                                >
                                  <Check className="h-3 w-3 mr-1" /> Accept
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── CANCEL CLASS BOOKING CONFIRMATION DIALOG ─── */}
      <Dialog open={isCancelConfirmOpen} onOpenChange={setIsCancelConfirmOpen}>
        <DialogContent className="max-w-md bg-card border">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight text-rose-500 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Cancel Class Booking
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cancelling will remove this member from the class roster, release their capacity slot, refund their session credit, and promote any waitlisted member.
            </DialogDescription>
          </DialogHeader>

          {cancelFeedback && (
            <Alert variant="destructive" className="py-2.5 rounded-xl">
              <AlertDescription className="text-xs font-semibold">{cancelFeedback}</AlertDescription>
            </Alert>
          )}

          {cancellingBooking && (
            <div className="bg-muted/40 p-4 rounded-xl border border-border/50 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Member:</span>
                <span className="font-bold text-foreground">{cancellingBooking.memberName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Class:</span>
                <span className="font-bold text-foreground">{cancellingBooking.className}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date & Time:</span>
                <span className="font-bold text-foreground">
                  {cancellingBooking.classDate} ({cancellingBooking.classTime})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch:</span>
                <span className="font-bold text-foreground">{cancellingBooking.branch || 'Main Studio'}</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsCancelConfirmOpen(false)}
              disabled={!!processingBookingId}
              className="h-9 text-xs font-bold rounded-xl"
            >
              Keep Booking
            </Button>
            <Button 
              variant="destructive"
              onClick={handleConfirmCancelClassBooking}
              disabled={!!processingBookingId}
              className="h-9 text-xs font-bold rounded-xl"
            >
              {processingBookingId ? 'Cancelling & Refunding...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── ACCEPT STOREFRONT BOOKING DIALOG ─── */}
      <Dialog open={isAcceptOpen} onOpenChange={setIsAcceptOpen}>
        <DialogContent className="max-w-md bg-card border">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-500" /> Accept Booking & Profile Setup
            </DialogTitle>
            <DialogDescription className="text-xs">Verify member details, assign branch, and set sales attribution on the spot.</DialogDescription>
          </DialogHeader>

          {acceptError && (
            <Alert variant="destructive" className="py-2.5 rounded-xl">
              <AlertDescription className="text-xs font-semibold">{acceptError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="memberName" className="text-xs font-bold text-muted-foreground uppercase">Member Name</Label>
                <Input 
                  id="memberName" 
                  value={clientName} 
                  onChange={(e) => setClientName(e.target.value)} 
                  className="h-10 bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="memberPhone" className="text-xs font-bold text-muted-foreground uppercase">Phone Number</Label>
                <Input 
                  id="memberPhone" 
                  value={clientPhone} 
                  onChange={(e) => setClientPhone(e.target.value)} 
                  className="h-10 bg-background"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="memberEmail" className="text-xs font-bold text-muted-foreground uppercase">Email Address (Optional)</Label>
              <Input 
                id="memberEmail" 
                value={clientEmail} 
                onChange={(e) => setClientEmail(e.target.value)} 
                className="h-10 bg-background"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="memberBranch" className="text-xs font-bold text-muted-foreground uppercase">Assigned Branch</Label>
                <Select value={clientBranch} onValueChange={(v) => v && setClientBranch(v as Branch)}>
                  <SelectTrigger id="memberBranch" className="h-10 bg-background">
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="memberGender" className="text-xs font-bold text-muted-foreground uppercase">Gender</Label>
                <Select value={clientGender} onValueChange={(val) => setClientGender(val || '')}>
                  <SelectTrigger id="memberGender" className="h-10 bg-background">
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 border-t pt-3 mt-2">
              <Label htmlFor="salesRep" className="text-xs font-bold text-primary uppercase">Attributed Sales Rep</Label>
              <Select value={salesRepId} onValueChange={(val) => setSalesRepId(val || '')}>
                <SelectTrigger id="salesRep" className="h-10 bg-background border-primary/20">
                  <SelectValue placeholder="Assign Sales Representative" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.role === 'rep' || u.role === 'manager' || u.role === 'crm_admin').map(rep => (
                    <SelectItem key={rep.id} value={rep.id}>{rep.name} ({rep.role === 'rep' ? 'Sales Rep' : rep.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted/40 p-3 rounded-xl border border-border/50 space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Packages to Activate</p>
              {Array.isArray(selectedRequest?.items) && selectedRequest.items.length > 0 ? (
                selectedRequest.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs font-semibold">
                    <span className="uppercase text-foreground">{item.packageName} x{item.quantity}</span>
                    <span className="text-primary">{(item.price * item.quantity).toLocaleString()} EGP</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-xs font-semibold">
                  <span className="uppercase text-foreground">{selectedRequest?.packageName || 'Selected Package'}</span>
                  <span className="text-primary">{(selectedRequest?.totalPrice || 0).toLocaleString()} EGP</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsAcceptOpen(false)}
              disabled={processingAccept}
              className="h-10 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAcceptConfirm}
              disabled={processingAccept}
              className="h-10 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {processingAccept ? 'Activating...' : 'Approve & Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DECLINE STOREFRONT BOOKING DIALOG ─── */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="max-w-sm bg-card border">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight">Decline Booking Request</DialogTitle>
            <DialogDescription className="text-xs">Specify a reason for declining this storefront purchase request.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="rejectReason" className="text-xs font-bold text-muted-foreground uppercase">Decline Reason (Optional)</Label>
            <Input 
              id="rejectReason" 
              placeholder="e.g. Reference number not found, unpaid request..." 
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="h-10 bg-background text-xs"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsRejectOpen(false)}
              disabled={processingReject}
              className="h-10 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={processingReject}
              className="h-10 text-xs font-bold rounded-xl"
            >
              {processingReject ? 'Declining...' : 'Decline Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
