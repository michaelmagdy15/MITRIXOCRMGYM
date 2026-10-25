import React, { useState, useEffect, useRef, useMemo, createContext, useContext, useCallback } from 'react';
import { useAppContext } from '../context';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Bell,
  AlertTriangle,
  Gift,
  CheckSquare,
  Clock,
  X,
  Check,
  ShoppingCart,
  Volume2,
  History,
  RotateCcw,
  Search,
  ExternalLink,
  CheckCircle2,
  Inbox,
  Archive,
  PhoneCall,
} from 'lucide-react';
import { differenceInDays, isSameDay, parseISO, isBefore, startOfDay, format, isValid } from 'date-fns';
import { db } from '../firebase';
import { arrayRemove, arrayUnion, collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { DismissedNotificationRecord } from '../types';
import {
  CURRENT_DEVICE_SESSION_ID,
  triggerLocalDeviceDialer,
  updateCallRequestStatus,
} from '../services/clickToCallService';

export type NotificationType =
  | 'lead_stale'
  | 'member_expiring'
  | 'birthday'
  | 'task_due'
  | 'booking_request'
  | 'class_booking_created'
  | 'class_waitlist_joined'
  | 'click_to_call'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  date: Date;
  dismissedAt?: Date;
  recordName: string;
  recordId: string;
  // 'user_notification' = per-user docs in `notifications` (e.g. Click-to-Call). They are ephemeral:
  // dismissing/opening marks the Firestore doc read instead of adding to dismissed history.
  source?: 'generated' | 'system' | 'user_notification';
  readBy?: string[];
  data?: Record<string, any>;
  isDismissed?: boolean;
  isRead?: boolean;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  activeNotifications: AppNotification[];
  dismissedNotificationsList: AppNotification[];
  allNotificationsWithHistory: AppNotification[];
  unreadCount: number;
  dismissNotification: (id: string, e?: React.MouseEvent) => void;
  dismissAll: () => void;
  restoreNotification: (id: string, e?: React.MouseEvent) => void;
  restoreAllDismissed: () => void;
  handleNotificationClick: (notification: AppNotification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function safeParseDate(value?: string | Date | null, fallback: Date = new Date()): Date {
  if (!value) return fallback;
  if (value instanceof Date) return isValid(value) ? value : fallback;
  try {
    const parsed = parseISO(String(value));
    if (isValid(parsed)) return parsed;
    const direct = new Date(value);
    return isValid(direct) ? direct : fallback;
  } catch {
    return fallback;
  }
}

export function getNotificationTypeMeta(type: NotificationType) {
  switch (type) {
    case 'birthday':
      return {
        label: 'Birthday',
        icon: <Gift className="h-4 w-4 text-pink-500" />,
        badgeClass: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
      };
    case 'lead_stale':
      return {
        label: 'Stale Lead',
        icon: <Clock className="h-4 w-4 text-amber-500" />,
        badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      };
    case 'member_expiring':
      return {
        label: 'Expiring Member',
        icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
        badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
      };
    case 'task_due':
      return {
        label: 'Task Due',
        icon: <CheckSquare className="h-4 w-4 text-blue-500" />,
        badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      };
    case 'booking_request':
      return {
        label: 'Booking Request',
        icon: <ShoppingCart className="h-4 w-4 text-emerald-500" />,
        badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      };
    case 'class_booking_created':
      return {
        label: 'Class Booking',
        icon: <Volume2 className="h-4 w-4 text-emerald-500" />,
        badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      };
    case 'class_waitlist_joined':
      return {
        label: 'Waitlist Joined',
        icon: <ShoppingCart className="h-4 w-4 text-amber-500" />,
        badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      };
    case 'click_to_call':
      return {
        label: 'Click to Call',
        icon: <PhoneCall className="h-4 w-4 text-blue-600 animate-pulse" />,
        badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      };
    default:
      return {
        label: 'System',
        icon: <Bell className="h-4 w-4 text-primary" />,
        badgeClass: 'bg-primary/10 text-primary border-primary/20',
      };
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const {
    clients,
    allClients,
    tasks,
    allTasks,
    searchQuery,
    setSearchQuery,
    setActiveTab,
    setActiveClientId,
  } = useAppContext();
  const { currentUser, updateUser } = useAuth();

  // Always use unfiltered role-scoped clients so typing in the search bar or clicking a notification
  // never wipes out notifications for other members/leads.
  const sourceClients = allClients && allClients.length > 0 ? allClients : clients;
  const sourceTasks = allTasks && allTasks.length > 0 ? allTasks : tasks;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [restoredSystemIds, setRestoredSystemIds] = useState<Set<string>>(new Set());
  const [historyMap, setHistoryMap] = useState<Map<string, DismissedNotificationRecord>>(new Map());
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [systemNotifications, setSystemNotifications] = useState<AppNotification[]>([]);
  const [userNotifications, setUserNotifications] = useState<AppNotification[]>([]);

  const hasSeenInitialSystemSnapshot = useRef(false);
  const hasSeenInitialUserSnapshot = useRef(false);
  const soundEnabledRef = useRef(true);

  const playAlertSound = () => {
    if (!soundEnabledRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      gain.connect(ctx.destination);

      [880, 1174].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.12);
        osc.connect(gain);
        osc.start(ctx.currentTime + index * 0.12);
        osc.stop(ctx.currentTime + index * 0.12 + 0.18);
      });
      setTimeout(() => ctx.close().catch(() => {}), 900);
    } catch (err) {
      console.warn('[Notifications] Could not play alert sound:', err);
    }
  };

  // Subscribe to booking requests (both Pending for active notifications and recent processed ones for history reconstruction)
  useEffect(() => {
    if (!currentUser?.id || currentUser.role === 'client') return;
    const q = query(collection(db, 'bookingRequests'), limit(150));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setAllBookings(list);
      },
      (err) => {
        console.error('Error loading booking requests for notifications:', err);
      }
    );
    return () => unsub();
  }, [currentUser?.id, currentUser?.role]);

  const pendingBookings = useMemo(
    () => allBookings.filter((b) => b.status === 'Pending'),
    [allBookings]
  );

  // Subscribe to durable staff system notifications generated by server/cloud functions.
  useEffect(() => {
    if (!currentUser?.id || currentUser.role === 'client') return;
    const q = query(
      collection(db, 'systemNotifications'),
      orderBy('createdAt', 'desc'),
      limit(150)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const addedBookingAlerts = snapshot.docChanges().filter((change) => {
          const data = change.doc.data();
          return (
            change.type === 'added' &&
            (data.type === 'class_booking_created' || data.type === 'class_waitlist_joined')
          );
        });

        const rows = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: (data.type as NotificationType) || 'system',
            title: data.title || 'System notification',
            description: data.body || data.description || '',
            date: safeParseDate(data.createdAt),
            recordName: data.data?.memberName || data.data?.className || 'System',
            recordId: data.data?.clientId || data.data?.classId || d.id,
            source: 'system' as const,
            readBy: Array.isArray(data.readBy) ? data.readBy : [],
            data: data.data || {},
          } as AppNotification;
        });
        setSystemNotifications(rows);

        if (hasSeenInitialSystemSnapshot.current && addedBookingAlerts.length > 0) {
          playAlertSound();
        }
        hasSeenInitialSystemSnapshot.current = true;
      },
      (err) => {
        console.error('[Notifications] Error loading system notifications:', err);
      }
    );

    return () => unsub();
  }, [currentUser?.id, currentUser?.role]);

  // Subscribe to per-user notifications addressed to this staff member (e.g. Click-to-Call requests
  // sent from their laptop). The tab that sent the request is excluded via CURRENT_DEVICE_SESSION_ID.
  useEffect(() => {
    if (!currentUser?.id || currentUser.role === 'client') return;
    hasSeenInitialUserSnapshot.current = false;
    const q = query(
      collection(db, 'notifications'),
      where('recipientUid', '==', currentUser.id),
      where('read', '==', false),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nowMs = Date.now();
        const isLiveClickToCall = (data: Record<string, any>) =>
          data.type === 'click_to_call' &&
          data.senderSessionId !== CURRENT_DEVICE_SESSION_ID &&
          (!data.expiresAtMs || Number(data.expiresAtMs) > nowMs);

        const addedClickToCall = snapshot
          .docChanges()
          .filter((change) => change.type === 'added' && isLiveClickToCall(change.doc.data()));

        const rows = snapshot.docs
          .filter((d) => isLiveClickToCall(d.data()))
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: 'click_to_call' as NotificationType,
              title: data.title || `📞 Click to Call: ${data.leadName || 'Member'}`,
              description: data.description || data.body || `Tap to dial ${data.phoneNumber || ''}`,
              date: safeParseDate(data.createdAt),
              recordName: data.leadName || 'Member',
              recordId: data.clientId || data.memberId || d.id,
              source: 'user_notification' as const,
              data,
            } as AppNotification;
          })
          .sort((a, b) => b.date.getTime() - a.date.getTime());

        setUserNotifications(rows);

        if (hasSeenInitialUserSnapshot.current && addedClickToCall.length > 0) {
          playAlertSound();
        }
        hasSeenInitialUserSnapshot.current = true;
      },
      (err) => {
        console.error('[Notifications] Error loading user notifications:', err);
      }
    );

    return () => unsub();
  }, [currentUser?.id, currentUser?.role]);

  // Load dismissed IDs, read IDs, and dismissed history from Firestore user doc + localStorage
  useEffect(() => {
    if (!currentUser?.id) return;

    // 1. Dismissed IDs
    const dbDismissed = currentUser.dismissedNotifications || [];
    const storedDismissed = localStorage.getItem(`crm_notifications_dismissed_${currentUser.id}`);
    const mergedDismissed = new Set<string>(dbDismissed);
    if (storedDismissed) {
      try {
        const parsed = JSON.parse(storedDismissed);
        if (Array.isArray(parsed)) parsed.forEach((id) => mergedDismissed.add(id));
      } catch (e) {
        console.error('Failed to parse dismissed notifications from localStorage', e);
      }
    }
    setDismissedIds(mergedDismissed);

    // 2. Read IDs
    const dbRead = currentUser.readNotifications || [];
    const storedRead = localStorage.getItem(`crm_notifications_read_${currentUser.id}`);
    const mergedRead = new Set<string>(dbRead);
    if (storedRead) {
      try {
        const parsed = JSON.parse(storedRead);
        if (Array.isArray(parsed)) parsed.forEach((id) => mergedRead.add(id));
      } catch (e) {
        console.error('Failed to parse read notifications from localStorage', e);
      }
    }
    setReadIds(mergedRead);

    // 3. Restored System IDs
    const storedRestoredSys = localStorage.getItem(`crm_notifications_restored_sys_${currentUser.id}`);
    if (storedRestoredSys) {
      try {
        const parsed = JSON.parse(storedRestoredSys);
        if (Array.isArray(parsed)) setRestoredSystemIds(new Set(parsed));
      } catch {
        // ignore
      }
    }

    // 4. Dismissed Notification History objects
    const dbHistory = Array.isArray(currentUser.dismissedNotificationHistory)
      ? currentUser.dismissedNotificationHistory
      : [];
    const storedHistory = localStorage.getItem(`crm_notifications_history_${currentUser.id}`);
    const nextHistoryMap = new Map<string, DismissedNotificationRecord>();

    dbHistory.forEach((item) => {
      if (item && item.id) nextHistoryMap.set(item.id, item);
    });

    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: DismissedNotificationRecord) => {
            if (item && item.id && !nextHistoryMap.has(item.id)) {
              nextHistoryMap.set(item.id, item);
            }
          });
        }
      } catch (e) {
        console.error('Failed to parse notification history from localStorage', e);
      }
    }

    setHistoryMap(nextHistoryMap);
  }, [
    currentUser?.id,
    currentUser?.dismissedNotifications,
    currentUser?.readNotifications,
    currentUser?.dismissedNotificationHistory,
  ]);

  // Generate current notifications from unfiltered sourceClients, tasks, pendingBookings, and systemNotifications
  useEffect(() => {
    const today = startOfDay(new Date());
    const generated: AppNotification[] = [];

    sourceClients.forEach((client) => {
      // Birthdays
      if (client.dateOfBirth) {
        const dob = safeParseDate(client.dateOfBirth, new Date(0));
        if (dob.getTime() !== 0 && dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()) {
          generated.push({
            id: `bday_${client.id}_${today.getFullYear()}`,
            type: 'birthday',
            title: 'Birthday Today!',
            description: `${client.name} is celebrating their birthday today.`,
            date: today,
            recordName: client.name,
            recordId: client.id,
            source: 'generated',
          });
        }
      }

      if (client.status === 'Lead') {
        // Stale leads (not contacted in 7+ days)
        if (client.lastContactDate) {
          const lastContact = safeParseDate(client.lastContactDate, today);
          const daysPassed = differenceInDays(today, startOfDay(lastContact));
          if (daysPassed >= 7) {
            generated.push({
              id: `lead_stale_${client.id}_${lastContact.toISOString()}`,
              type: 'lead_stale',
              title: 'Stale Lead',
              description: `${client.name} hasn't been contacted in ${daysPassed} days.`,
              date: lastContact,
              recordName: client.name,
              recordId: client.id,
              source: 'generated',
            });
          }
        }
      } else if (client.status !== 'Hold') {
        // Expiring members (0 to 3 days)
        if (client.membershipExpiry) {
          const expiryDate = safeParseDate(client.membershipExpiry, new Date(0));
          if (expiryDate.getTime() !== 0) {
            const daysToExpiry = differenceInDays(startOfDay(expiryDate), today);
            if (daysToExpiry >= 0 && daysToExpiry <= 3) {
              generated.push({
                id: `expiring_${client.id}_${expiryDate.toISOString()}`,
                type: 'member_expiring',
                title: 'Membership Expiring',
                description: `${client.name}'s membership expires ${daysToExpiry === 0 ? 'today' : `in ${daysToExpiry} days`}.`,
                date: expiryDate,
                recordName: client.name,
                recordId: client.id,
                source: 'generated',
              });
            }
          }
        }
      }
    });

    // Tasks due today or overdue
    tasks.forEach((task) => {
      if (task.status !== 'Completed') {
        const dueDate = safeParseDate(task.dueDate, today);
        const startOfDue = startOfDay(dueDate);

        if (isBefore(startOfDue, today) || isSameDay(startOfDue, today)) {
          const isOverdue = isBefore(startOfDue, today);
          generated.push({
            id: `task_${task.id}_${dueDate.toISOString()}`,
            type: 'task_due',
            title: isOverdue ? 'Overdue Task' : 'Task Due Today',
            description: task.title,
            date: dueDate,
            recordName: task.title,
            recordId: task.id,
            source: 'generated',
          });
        }
      }
    });

    // Pending booking requests
    pendingBookings.forEach((booking) => {
      const itemsList = Array.isArray(booking.items)
        ? booking.items
            .map((i: any) => i.packageName || i.name)
            .filter(Boolean)
            .join(', ')
        : booking.packageName || booking.type || 'Package Request';
      const priceText = typeof booking.totalPrice === 'number' ? ` (${booking.totalPrice} EGP)` : '';

      generated.push({
        id: `booking_req_${booking.id}`,
        type: 'booking_request',
        title: 'New Booking Request',
        description: `${booking.clientName || 'Client'} requested: ${itemsList}${priceText}`,
        date: safeParseDate(booking.createdAt, today),
        recordName: booking.clientName || 'Client',
        recordId: booking.id,
        source: 'generated',
      });
    });

    generated.sort((a, b) => b.date.getTime() - a.date.getTime());
    setNotifications([...userNotifications, ...systemNotifications, ...generated]);
  }, [sourceClients, tasks, pendingBookings, systemNotifications, userNotifications]);

  // Fast O(1) lookup maps for notification reconstruction
  const sourceClientByIdMap = useMemo(() => {
    const map = new Map<string, typeof sourceClients[0]>();
    for (const c of sourceClients) {
      if (c.id) map.set(c.id, c);
    }
    return map;
  }, [sourceClients]);

  const sourceTaskByIdMap = useMemo(() => {
    const map = new Map<string, typeof sourceTasks[0]>();
    for (const t of sourceTasks) {
      if (t.id) map.set(t.id, t);
    }
    return map;
  }, [sourceTasks]);

  const bookingByIdMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const b of allBookings) {
      if (b.id) map.set(b.id, b);
    }
    return map;
  }, [allBookings]);

  const liveNotifByIdMap = useMemo(() => {
    const map = new Map<string, AppNotification>();
    for (const n of notifications) {
      if (n.id) map.set(n.id, n);
    }
    return map;
  }, [notifications]);

  // Helper to reconstruct a legacy dismissed notification ID that wasn't saved with full metadata yet
  const reconstructFromLegacyId = useCallback(
    (id: string): DismissedNotificationRecord | null => {
      const nowIso = new Date().toISOString();

      // 1. Check current notifications list first
      const liveMatch = liveNotifByIdMap.get(id);
      if (liveMatch) {
        return {
          id: liveMatch.id,
          type: liveMatch.type,
          title: liveMatch.title,
          description: liveMatch.description,
          date: liveMatch.date.toISOString(),
          dismissedAt: nowIso,
          recordName: liveMatch.recordName,
          recordId: liveMatch.recordId,
          source: liveMatch.source === 'system' ? 'system' : 'generated',
          data: liveMatch.data || {},
        };
      }

      // 2. Birthday: bday_<clientId>_<year>
      if (id.startsWith('bday_')) {
        const parts = id.split('_');
        const yearStr = parts[parts.length - 1];
        const clientId = parts.slice(1, parts.length - 1).join('_');
        const client = sourceClientByIdMap.get(clientId);
        if (client) {
          const dob = client.dateOfBirth ? safeParseDate(client.dateOfBirth) : new Date();
          const bdayDate = new Date(Number(yearStr) || new Date().getFullYear(), dob.getMonth(), dob.getDate());
          return {
            id,
            type: 'birthday',
            title: 'Birthday Today!',
            description: `${client.name} celebrated their birthday.`,
            date: isValid(bdayDate) ? bdayDate.toISOString() : nowIso,
            dismissedAt: nowIso,
            recordName: client.name,
            recordId: client.id,
            source: 'generated',
          };
        }
      }

      // 3. Stale lead: lead_stale_<clientId>_<isoDate>
      if (id.startsWith('lead_stale_')) {
        const rest = id.slice('lead_stale_'.length);
        const isoMatch = rest.match(/_(\d{4}-\d{2}-\d{2}.*)$/);
        const clientId = isoMatch ? rest.slice(0, rest.length - isoMatch[0].length) : rest;
        const dateIso = isoMatch ? isoMatch[1] : nowIso;
        const client = sourceClientByIdMap.get(clientId);
        const contactDate = safeParseDate(dateIso);
        const daysPassed = Math.max(7, differenceInDays(startOfDay(new Date()), startOfDay(contactDate)));
        return {
          id,
          type: 'lead_stale',
          title: 'Stale Lead',
          description: client
            ? `${client.name} hadn't been contacted in ${daysPassed} days.`
            : `Lead follow-up reminder (${clientId}).`,
          date: contactDate.toISOString(),
          dismissedAt: nowIso,
          recordName: client?.name || 'Lead',
          recordId: clientId,
          source: 'generated',
        };
      }

      // 4. Expiring member: expiring_<clientId>_<isoDate>
      if (id.startsWith('expiring_')) {
        const rest = id.slice('expiring_'.length);
        const isoMatch = rest.match(/_(\d{4}-\d{2}-\d{2}.*)$/);
        const clientId = isoMatch ? rest.slice(0, rest.length - isoMatch[0].length) : rest;
        const dateIso = isoMatch ? isoMatch[1] : nowIso;
        const client = sourceClientByIdMap.get(clientId);
        const expDate = safeParseDate(dateIso);
        return {
          id,
          type: 'member_expiring',
          title: 'Membership Expiring',
          description: client
            ? `${client.name}'s membership expiry alert (${format(expDate, 'MMM d, yyyy')}).`
            : `Membership expiry alert (${format(expDate, 'MMM d, yyyy')}).`,
          date: expDate.toISOString(),
          dismissedAt: nowIso,
          recordName: client?.name || 'Member',
          recordId: clientId,
          source: 'generated',
        };
      }

      // 5. Task due: task_<taskId>_<isoDate>
      if (id.startsWith('task_')) {
        const rest = id.slice('task_'.length);
        const isoMatch = rest.match(/_(\d{4}-\d{2}-\d{2}.*)$/);
        const taskId = isoMatch ? rest.slice(0, rest.length - isoMatch[0].length) : rest;
        const dateIso = isoMatch ? isoMatch[1] : nowIso;
        const task = sourceTaskByIdMap.get(taskId);
        const dueDate = safeParseDate(dateIso);
        return {
          id,
          type: 'task_due',
          title: 'Task Due',
          description: task ? task.title : `Task reminder (${format(dueDate, 'MMM d, yyyy')})`,
          date: dueDate.toISOString(),
          dismissedAt: nowIso,
          recordName: task?.title || 'Task',
          recordId: taskId,
          source: 'generated',
        };
      }

      // 6. Booking request: booking_req_<bookingId>
      if (id.startsWith('booking_req_')) {
        const bookingId = id.slice('booking_req_'.length);
        const booking = bookingByIdMap.get(bookingId);
        if (booking) {
          const itemsList = Array.isArray(booking.items)
            ? booking.items
                .map((i: any) => i.packageName || i.name)
                .filter(Boolean)
                .join(', ')
            : booking.packageName || booking.type || 'Package Request';
          const priceText = typeof booking.totalPrice === 'number' ? ` (${booking.totalPrice} EGP)` : '';
          return {
            id,
            type: 'booking_request',
            title: 'Booking Request',
            description: `${booking.clientName || 'Client'} requested: ${itemsList}${priceText}`,
            date: safeParseDate(booking.createdAt).toISOString(),
            dismissedAt: nowIso,
            recordName: booking.clientName || 'Client',
            recordId: booking.id,
            source: 'generated',
          };
        }
      }

      return null;
    },
    [liveNotifByIdMap, sourceClientByIdMap, sourceTaskByIdMap, bookingByIdMap]
  );

  const attemptedBackfillIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    attemptedBackfillIdsRef.current.clear();
  }, [currentUser?.id]);

  // Backfill any dismissed IDs that don't yet have full history records in historyMap (once per ID per session)
  useEffect(() => {
    if (!currentUser?.id) return;
    if (sourceClients.length === 0 && notifications.length === 0) return;

    let addedAny = false;
    const updatedMap = new Map(historyMap);

    // Only attempt backfill for up to the most recent 500 dismissed IDs to match the 500-item history cap
    const recentDismissedIds = Array.from(dismissedIds).slice(-500);
    recentDismissedIds.forEach((id) => {
      if (!updatedMap.has(id) && !attemptedBackfillIdsRef.current.has(id)) {
        attemptedBackfillIdsRef.current.add(id);
        const reconstructed = reconstructFromLegacyId(id);
        if (reconstructed) {
          updatedMap.set(id, reconstructed);
          addedAny = true;
        }
      }
    });

    // Also include systemNotifications that were marked readBy currentUser
    systemNotifications.forEach((sysNotif) => {
      const wasReadByUser =
        (sysNotif.readBy || []).includes(currentUser.id) && !restoredSystemIds.has(sysNotif.id);
      if (wasReadByUser && !updatedMap.has(sysNotif.id) && !attemptedBackfillIdsRef.current.has(sysNotif.id)) {
        attemptedBackfillIdsRef.current.add(sysNotif.id);
        updatedMap.set(sysNotif.id, {
          id: sysNotif.id,
          type: sysNotif.type,
          title: sysNotif.title,
          description: sysNotif.description,
          date: sysNotif.date.toISOString(),
          dismissedAt: sysNotif.date.toISOString(),
          recordName: sysNotif.recordName,
          recordId: sysNotif.recordId,
          source: 'system',
          data: sysNotif.data || {},
        });
        addedAny = true;
      }
    });

    if (addedAny) {
      setHistoryMap(updatedMap);
      const historyArray = Array.from(updatedMap.values()).slice(-500);
      localStorage.setItem(`crm_notifications_history_${currentUser.id}`, JSON.stringify(historyArray));
      updateUser(currentUser.id, { dismissedNotificationHistory: historyArray }).catch((err) => {
        console.error('Failed to backfill dismissed notification history:', err);
      });
    }
  }, [
    currentUser?.id,
    dismissedIds,
    systemNotifications,
    restoredSystemIds,
    sourceClients.length,
    notifications.length,
    reconstructFromLegacyId,
  ]);

  const isNotificationDismissed = useCallback(
    (n: AppNotification) => {
      if (dismissedIds.has(n.id)) return true;
      if (n.source === 'system') {
        const inReadBy = (n.readBy || []).includes(currentUser?.id || '');
        if (inReadBy && !restoredSystemIds.has(n.id)) return true;
      }
      return false;
    },
    [dismissedIds, currentUser?.id, restoredSystemIds]
  );

  const activeNotifications = useMemo(() => {
    return notifications
      .filter((n) => !isNotificationDismissed(n))
      .map((n) => ({
        ...n,
        isDismissed: false,
        isRead: readIds.has(n.id),
      }));
  }, [notifications, isNotificationDismissed, readIds]);

  const dismissedNotificationsList = useMemo(() => {
    const resultMap = new Map<string, AppNotification>();

    // 1. Add from saved historyMap (only those currently dismissed)
    historyMap.forEach((rec, id) => {
      const sysMatch = systemNotifications.find((s) => s.id === id);
      const isCurrentlyDismissed =
        dismissedIds.has(id) ||
        (sysMatch &&
          (sysMatch.readBy || []).includes(currentUser?.id || '') &&
          !restoredSystemIds.has(id));

      if (isCurrentlyDismissed) {
        resultMap.set(id, {
          id: rec.id,
          type: (rec.type as NotificationType) || 'system',
          title: rec.title,
          description: rec.description,
          date: safeParseDate(rec.date),
          dismissedAt: safeParseDate(rec.dismissedAt, safeParseDate(rec.date)),
          recordName: rec.recordName,
          recordId: rec.recordId,
          source: rec.source || 'generated',
          data: rec.data || {},
          isDismissed: true,
          isRead: true,
        });
      }
    });

    // 2. Also ensure any currently generated/system notification that is dismissed is included
    notifications.forEach((n) => {
      if (isNotificationDismissed(n) && !resultMap.has(n.id)) {
        const savedRec = historyMap.get(n.id);
        resultMap.set(n.id, {
          ...n,
          dismissedAt: savedRec ? safeParseDate(savedRec.dismissedAt) : n.date,
          isDismissed: true,
          isRead: true,
        });
      }
    });

    return Array.from(resultMap.values()).sort((a, b) => {
      const timeA = (a.dismissedAt || a.date).getTime();
      const timeB = (b.dismissedAt || b.date).getTime();
      return timeB - timeA;
    });
  }, [historyMap, dismissedIds, systemNotifications, currentUser?.id, restoredSystemIds, notifications, isNotificationDismissed]);

  const allNotificationsWithHistory = useMemo(() => {
    const combined = [...activeNotifications, ...dismissedNotificationsList];
    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [activeNotifications, dismissedNotificationsList]);

  const unreadCount = useMemo(
    () => activeNotifications.filter((n) => !n.isRead).length,
    [activeNotifications]
  );

  const getNotificationDestination = (notification: AppNotification) => {
    switch (notification.type) {
      case 'booking_request':
      case 'class_booking_created':
        return {
          tab: 'bookings',
          clientId: notification.data?.clientId || notification.recordId,
        };
      case 'class_waitlist_joined':
        return {
          tab: 'class-manager',
          clientId: notification.data?.clientId,
        };
      case 'task_due':
        return {
          tab: 'tasks',
        };
      case 'lead_stale':
      case 'member_expiring':
      case 'birthday':
      case 'click_to_call':
        return {
          tab: 'clients',
          clientId: notification.recordId,
        };
      default:
        return {
          tab: 'dashboard',
          clientId: notification.data?.clientId,
        };
    }
  };

  // Broadcast badge counts to sidebar tabs (including the 'notifications' sidebar tab!)
  useEffect(() => {
    const tabCounts = activeNotifications.reduce<Record<string, number>>((counts, notification) => {
      const destination = getNotificationDestination(notification);
      counts[destination.tab] = (counts[destination.tab] || 0) + 1;
      return counts;
    }, {});

    tabCounts['notifications'] = activeNotifications.length;

    window.dispatchEvent(new CustomEvent('crm:notification-tab-counts', { detail: tabCounts }));
  }, [activeNotifications]);

  const persistDismissedState = useCallback(
    (nextDismissedIds: Set<string>, nextHistoryMap: Map<string, DismissedNotificationRecord>) => {
      if (!currentUser?.id) return;
      const dismissedArr = Array.from(nextDismissedIds);
      const historyArr = Array.from(nextHistoryMap.values()).slice(0, 500);

      localStorage.setItem(`crm_notifications_dismissed_${currentUser.id}`, JSON.stringify(dismissedArr));
      localStorage.setItem(`crm_notifications_history_${currentUser.id}`, JSON.stringify(historyArr));

      updateUser(currentUser.id, {
        dismissedNotifications: dismissedArr,
        dismissedNotificationHistory: historyArr,
      }).catch((err) => {
        console.error('Failed to persist dismissed notifications to DB:', err);
      });
    },
    [currentUser?.id, updateUser]
  );

  const dismissNotification = useCallback(
    (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentUser?.id) return;

      // Ephemeral per-user notifications (Click-to-Call): mark read in Firestore and cancel the request.
      const userNotif = userNotifications.find((n) => n.id === id);
      if (userNotif) {
        setUserNotifications((prev) => prev.filter((n) => n.id !== id));
        if (userNotif.type === 'click_to_call' && userNotif.data?.requestId) {
          void updateCallRequestStatus(userNotif.data.requestId, 'cancelled', { notificationId: id });
        } else {
          updateDoc(doc(db, 'notifications', id), {
            read: true,
            updatedAt: new Date().toISOString(),
          }).catch((err) => console.error('Failed to dismiss user notification:', err));
        }
        return;
      }

      const target =
        notifications.find((n) => n.id === id) ||
        activeNotifications.find((n) => n.id === id);

      const nowIso = new Date().toISOString();
      const record: DismissedNotificationRecord = target
        ? {
            id: target.id,
            type: target.type,
            title: target.title,
            description: target.description,
            date: target.date.toISOString(),
            dismissedAt: nowIso,
            recordName: target.recordName,
            recordId: target.recordId,
            source: target.source === 'system' ? 'system' : 'generated',
            data: target.data || {},
          }
        : reconstructFromLegacyId(id) || {
            id,
            type: 'system',
            title: 'Notification',
            description: '',
            date: nowIso,
            dismissedAt: nowIso,
            recordName: 'System',
            recordId: id,
            source: 'generated',
          };

      if (target?.source === 'system' || systemNotifications.some((s) => s.id === id)) {
        setRestoredSystemIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          localStorage.setItem(
            `crm_notifications_restored_sys_${currentUser.id}`,
            JSON.stringify(Array.from(next))
          );
          return next;
        });
        updateDoc(doc(db, 'systemNotifications', id), {
          readBy: arrayUnion(currentUser.id),
          updatedAt: nowIso,
        }).catch((err) => {
          console.error('Failed to mark system notification dismissed:', err);
        });
      }

      const nextDismissed = new Set(dismissedIds);
      nextDismissed.add(id);

      const nextHistory = new Map(historyMap);
      nextHistory.set(id, record);

      setDismissedIds(nextDismissed);
      setHistoryMap(nextHistory);
      persistDismissedState(nextDismissed, nextHistory);
    },
    [
      currentUser?.id,
      userNotifications,
      notifications,
      activeNotifications,
      reconstructFromLegacyId,
      systemNotifications,
      dismissedIds,
      historyMap,
      persistDismissedState,
    ]
  );

  const dismissAll = useCallback(() => {
    if (!currentUser?.id) return;
    const nowIso = new Date().toISOString();

    const nextDismissed = new Set(dismissedIds);
    const nextHistory = new Map(historyMap);

    activeNotifications.forEach((n) => {
      // Ephemeral Click-to-Call / per-user notifications: mark read in Firestore, skip history.
      if (n.source === 'user_notification') {
        if (n.type === 'click_to_call' && n.data?.requestId) {
          void updateCallRequestStatus(n.data.requestId, 'cancelled', { notificationId: n.id });
        } else {
          updateDoc(doc(db, 'notifications', n.id), { read: true, updatedAt: nowIso }).catch((err) =>
            console.error('Failed to mark user notification read:', err)
          );
        }
        return;
      }

      nextDismissed.add(n.id);
      nextHistory.set(n.id, {
        id: n.id,
        type: n.type,
        title: n.title,
        description: n.description,
        date: n.date.toISOString(),
        dismissedAt: nowIso,
        recordName: n.recordName,
        recordId: n.recordId,
        source: n.source === 'system' ? 'system' : 'generated',
        data: n.data || {},
      });

      if (n.source === 'system') {
        updateDoc(doc(db, 'systemNotifications', n.id), {
          readBy: arrayUnion(currentUser.id),
          updatedAt: nowIso,
        }).catch((err) => console.error('Failed to mark system notification read:', err));
      }
    });

    setRestoredSystemIds((prev) => {
      if (prev.size === 0) return prev;
      localStorage.setItem(`crm_notifications_restored_sys_${currentUser.id}`, JSON.stringify([]));
      return new Set();
    });

    setUserNotifications([]);
    setDismissedIds(nextDismissed);
    setHistoryMap(nextHistory);
    persistDismissedState(nextDismissed, nextHistory);
  }, [currentUser?.id, dismissedIds, historyMap, activeNotifications, persistDismissedState]);

  const restoreNotification = useCallback(
    (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentUser?.id) return;

      const nextDismissed = new Set(dismissedIds);
      nextDismissed.delete(id);

      const sysMatch = systemNotifications.find((s) => s.id === id);
      if (sysMatch) {
        setRestoredSystemIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          localStorage.setItem(
            `crm_notifications_restored_sys_${currentUser.id}`,
            JSON.stringify(Array.from(next))
          );
          return next;
        });
        updateDoc(doc(db, 'systemNotifications', id), {
          readBy: arrayRemove(currentUser.id),
          updatedAt: new Date().toISOString(),
        }).catch((err) => {
          console.error('Failed to restore system notification:', err);
        });
      }

      setDismissedIds(nextDismissed);
      persistDismissedState(nextDismissed, historyMap);
    },
    [currentUser?.id, dismissedIds, systemNotifications, historyMap, persistDismissedState]
  );

  const restoreAllDismissed = useCallback(() => {
    if (!currentUser?.id) return;

    const sysIds = systemNotifications.map((s) => s.id);
    if (sysIds.length > 0) {
      setRestoredSystemIds((prev) => {
        const next = new Set(prev);
        sysIds.forEach((id) => next.add(id));
        localStorage.setItem(
          `crm_notifications_restored_sys_${currentUser.id}`,
          JSON.stringify(Array.from(next))
        );
        return next;
      });
      systemNotifications
        .filter((s) => (s.readBy || []).includes(currentUser.id))
        .forEach((s) => {
          updateDoc(doc(db, 'systemNotifications', s.id), {
            readBy: arrayRemove(currentUser.id),
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        });
    }

    const emptyDismissed = new Set<string>();
    setDismissedIds(emptyDismissed);
    persistDismissedState(emptyDismissed, historyMap);
  }, [currentUser?.id, systemNotifications, historyMap, persistDismissedState]);

  const markAsRead = useCallback(
    (id: string) => {
      if (!currentUser?.id) return;
      setReadIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        const arr = Array.from(next);
        localStorage.setItem(`crm_notifications_read_${currentUser.id}`, JSON.stringify(arr));
        updateUser(currentUser.id, { readNotifications: arr }).catch(() => {});
        return next;
      });
    },
    [currentUser?.id, updateUser]
  );

  const markAllAsRead = useCallback(() => {
    if (!currentUser?.id) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      activeNotifications.forEach((n) => next.add(n.id));
      const arr = Array.from(next);
      localStorage.setItem(`crm_notifications_read_${currentUser.id}`, JSON.stringify(arr));
      updateUser(currentUser.id, { readNotifications: arr }).catch(() => {});
      return next;
    });
  }, [currentUser?.id, activeNotifications, updateUser]);

  // Opening a notification navigates to its record and marks it as read,
  // WITHOUT dismissing it and WITHOUT polluting searchQuery (which previously wiped client notifications!).
  const handleNotificationClick = useCallback(
    (notification: AppNotification) => {
      // Click-to-Call: tapping the notification on the logged-in mobile device dials the lead immediately.
      if (notification.type === 'click_to_call' && notification.data?.phoneNumber) {
        const requestId: string = notification.data.requestId || `call_${currentUser?.id || ''}`;
        setUserNotifications((prev) => prev.filter((n) => n.id !== notification.id));
        void updateCallRequestStatus(requestId, 'dialing', { notificationId: notification.id });
        triggerLocalDeviceDialer(notification.data.phoneNumber, notification.recordName, requestId);
        return;
      }

      const destination = getNotificationDestination(notification);
      if (searchQuery) {
        setSearchQuery('');
      }
      setActiveTab(destination.tab);
      if (destination.tab === 'clients' && destination.clientId) {
        setActiveClientId(destination.clientId);
      }
      markAsRead(notification.id);
    },
    [currentUser?.id, searchQuery, setSearchQuery, setActiveTab, setActiveClientId, markAsRead]
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      activeNotifications,
      dismissedNotificationsList,
      allNotificationsWithHistory,
      unreadCount,
      dismissNotification,
      dismissAll,
      restoreNotification,
      restoreAllDismissed,
      handleNotificationClick,
      markAsRead,
      markAllAsRead,
    }),
    [
      notifications,
      activeNotifications,
      dismissedNotificationsList,
      allNotificationsWithHistory,
      unreadCount,
      dismissNotification,
      dismissAll,
      restoreNotification,
      restoreAllDismissed,
      handleNotificationClick,
      markAsRead,
      markAllAsRead,
    ]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return ctx;
}

export function NotificationCenter() {
  const { setActiveTab } = useAppContext();
  const {
    activeNotifications,
    dismissedNotificationsList,
    dismissNotification,
    dismissAll,
    handleNotificationClick,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8 sm:h-10 sm:w-10 rounded-full"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
        {activeNotifications.length > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-1 ring-background">
            {activeNotifications.length > 99 ? '99+' : activeNotifications.length}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="fixed top-[70px] left-4 right-4 w-auto md:absolute md:top-full md:left-auto md:right-0 md:w-80 sm:md:w-96 md:mt-2 rounded-xl border bg-card shadow-xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {activeNotifications.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {activeNotifications.length} active
                </Badge>
              )}
            </div>
            {activeNotifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={dismissAll}
              >
                Dismiss all <Check className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto no-scrollbar">
            {activeNotifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                <Bell className="h-8 w-8 opacity-20 mb-2" />
                <p>You have no active notifications.</p>
                {dismissedNotificationsList.length > 0 && (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {dismissedNotificationsList.length} saved in dismissed history
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeNotifications.map((notification) => {
                  const meta = getNotificationTypeMeta(notification.type);
                  return (
                    <div
                      key={notification.id}
                      className={`flex flex-col p-3 sm:p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                        !notification.isRead ? 'bg-primary/[0.03]' : ''
                      }`}
                      onClick={() => {
                        handleNotificationClick(notification);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 rounded-full bg-background p-1.5 shadow-sm border shrink-0">
                            {meta.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              {!notification.isRead && (
                                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                              )}
                              <p className="text-sm font-medium leading-none truncate">
                                {notification.title}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {notification.description}
                            </p>
                            <p className="text-[10px] text-muted-foreground/70 mt-1">
                              {format(notification.date, 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                          title="Dismiss notification (saves to history)"
                          onClick={(e) => dismissNotification(notification.id, e)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-2.5 border-t bg-muted/20 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs font-medium justify-center gap-1.5 h-8"
              onClick={() => {
                setActiveTab('notifications');
                setIsOpen(false);
              }}
            >
              <History className="h-3.5 w-3.5" />
              View All Notifications & Dismissed History ({activeNotifications.length + dismissedNotificationsList.length})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const {
    activeNotifications,
    dismissedNotificationsList,
    allNotificationsWithHistory,
    unreadCount,
    dismissNotification,
    dismissAll,
    restoreNotification,
    restoreAllDismissed,
    handleNotificationClick,
    markAllAsRead,
  } = useNotifications();

  const [viewFilter, setViewFilter] = useState<'all' | 'active' | 'dismissed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | NotificationType>('all');
  const [localSearch, setLocalSearch] = useState('');

  const typeCounts = useMemo(() => {
    const baseList =
      viewFilter === 'active'
        ? activeNotifications
        : viewFilter === 'dismissed'
        ? dismissedNotificationsList
        : allNotificationsWithHistory;

    const counts: Record<string, number> = { all: baseList.length };
    baseList.forEach((n) => {
      counts[n.type] = (counts[n.type] || 0) + 1;
    });
    return counts;
  }, [viewFilter, activeNotifications, dismissedNotificationsList, allNotificationsWithHistory]);

  const filteredList = useMemo(() => {
    const base =
      viewFilter === 'active'
        ? activeNotifications
        : viewFilter === 'dismissed'
        ? dismissedNotificationsList
        : allNotificationsWithHistory;

    return base.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (localSearch.trim()) {
        const q = localSearch.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesRecord = (item.recordName || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesRecord) return false;
      }
      return true;
    });
  }, [viewFilter, typeFilter, localSearch, activeNotifications, dismissedNotificationsList, allNotificationsWithHistory]);

  const filterChips: { id: 'all' | NotificationType; label: string }[] = [
    { id: 'all', label: 'All Types' },
    { id: 'member_expiring', label: 'Expiring Members' },
    { id: 'lead_stale', label: 'Stale Leads' },
    { id: 'booking_request', label: 'Booking Requests' },
    { id: 'task_due', label: 'Tasks Due' },
    { id: 'birthday', label: 'Birthdays' },
    { id: 'class_booking_created', label: 'Class Bookings' },
    { id: 'class_waitlist_joined', label: 'Waitlist' },
    { id: 'system', label: 'System' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Bell className="h-6 w-6 text-primary" />
            Notifications & History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View all active alerts and browse or restore your saved history of dismissed notifications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Mark all read ({unreadCount})
            </Button>
          )}
          {activeNotifications.length > 0 && (
            <Button variant="outline" size="sm" onClick={dismissAll} className="gap-1.5">
              <Check className="h-4 w-4" />
              Dismiss All Active ({activeNotifications.length})
            </Button>
          )}
          {dismissedNotificationsList.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={restoreAllDismissed}
              className="gap-1.5"
              title="Restore all dismissed notifications back to active"
            >
              <RotateCcw className="h-4 w-4" />
              Restore All Dismissed ({dismissedNotificationsList.length})
            </Button>
          )}
        </div>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          className={`cursor-pointer transition-all border ${
            viewFilter === 'all' ? 'border-primary ring-1 ring-primary/30 bg-primary/[0.03]' : 'hover:border-border/80'
          }`}
          onClick={() => setViewFilter('all')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                All Notifications
              </p>
              <p className="text-2xl font-bold mt-1">{allNotificationsWithHistory.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Active + saved history</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Bell className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            viewFilter === 'active' ? 'border-primary ring-1 ring-primary/30 bg-primary/[0.03]' : 'hover:border-border/80'
          }`}
          onClick={() => setViewFilter('active')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Active Notifications
              </p>
              <p className="text-2xl font-bold mt-1">{activeNotifications.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {unreadCount} unread right now
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Inbox className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            viewFilter === 'dismissed' ? 'border-primary ring-1 ring-primary/30 bg-primary/[0.03]' : 'hover:border-border/80'
          }`}
          onClick={() => setViewFilter('dismissed')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Dismissed History
              </p>
              <p className="text-2xl font-bold mt-1">{dismissedNotificationsList.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Saved permanently in history</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Archive className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Local Search */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* View Mode Tabs */}
            <div className="inline-flex rounded-lg border bg-muted/40 p-1 gap-1 self-start">
              <button
                type="button"
                onClick={() => setViewFilter('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({allNotificationsWithHistory.length})
              </button>
              <button
                type="button"
                onClick={() => setViewFilter('active')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewFilter === 'active'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Active ({activeNotifications.length})
              </button>
              <button
                type="button"
                onClick={() => setViewFilter('dismissed')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewFilter === 'dismissed'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Dismissed History ({dismissedNotificationsList.length})
              </button>
            </div>

            {/* Search within notifications */}
            <div className="relative w-full md:w-80">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search notifications by name or details..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="ps-9 h-9 text-sm"
              />
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex flex-wrap gap-1.5">
            {filterChips.map((chip) => {
              const count = typeCounts[chip.id] || 0;
              if (chip.id !== 'all' && count === 0 && typeFilter !== chip.id) return null;
              const isSelected = typeFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setTypeFilter(chip.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  }`}
                >
                  <span>{chip.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardContent className="p-0">
          {filteredList.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
              <Bell className="h-10 w-10 opacity-20 mb-3" />
              <p className="text-base font-medium text-foreground">No notifications found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                {localSearch
                  ? `No notifications match "${localSearch}". Try clearing your search filter.`
                  : viewFilter === 'dismissed'
                  ? 'You have no dismissed notifications in history yet.'
                  : 'You are all caught up!'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredList.map((notification) => {
                const meta = getNotificationTypeMeta(notification.type);
                const isDismissed = Boolean(notification.isDismissed);

                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/40 cursor-pointer transition-colors ${
                      isDismissed ? 'opacity-80 bg-muted/10' : !notification.isRead ? 'bg-primary/[0.02]' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="mt-0.5 rounded-xl bg-background p-2.5 shadow-sm border shrink-0">
                        {meta.icon}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {!isDismissed && !notification.isRead && (
                            <span className="h-2 w-2 rounded-full bg-primary shrink-0" title="Unread" />
                          )}
                          <p className="text-sm font-semibold text-foreground">{notification.title}</p>
                          <Badge variant="outline" className={`text-[10px] font-medium ${meta.badgeClass}`}>
                            {meta.label}
                          </Badge>
                          {isDismissed ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                            >
                              Dismissed
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            >
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{notification.description}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/75 pt-0.5">
                          <span>Date: {format(notification.date, 'MMM d, yyyy')}</span>
                          {isDismissed && notification.dismissedAt && (
                            <span>
                              • Saved to history: {format(notification.dismissedAt, 'MMM d, yyyy h:mm a')}
                            </span>
                          )}
                          {notification.recordName && (
                            <span>• Record: {notification.recordName}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNotificationClick(notification);
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Button>

                      {isDismissed ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 text-xs gap-1.5"
                          onClick={(e) => restoreNotification(notification.id, e)}
                          title="Restore this notification back to active"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                          onClick={(e) => dismissNotification(notification.id, e)}
                          title="Dismiss notification and save to history"
                        >
                          <X className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
