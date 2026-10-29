import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Bell, Calendar, Check, Gift, Info, Megaphone, Sparkles, X } from 'lucide-react';
import { formatDistanceToNow, parseISO, differenceInCalendarDays, format } from 'date-fns';
import { toValidDate } from '../utils/dateUtils';
import {
  initGlobalAudioUnlock,
  showBrowserNotificationWithPing,
} from '../services/browserNotificationService';

type MemberNotificationType =
  | 'announcement'
  | 'expiry_warning'
  | 'session_reminder'
  | 'birthday'
  | 'system'
  | 'promo'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_NO_SHOW'
  | 'CLASS_REMINDER'
  | 'STATUS_CHANGED';

interface MemberNotification {
  id: string;
  type: MemberNotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, any>;
  source: 'client-subcollection' | 'top-level' | 'announcement';
}

const typeIcons: Record<string, React.ReactNode> = {
  announcement: <Megaphone className="h-4 w-4 text-blue-500" />,
  expiry_warning: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
  session_reminder: <Calendar className="h-4 w-4 text-emerald-500" />,
  birthday: <Gift className="h-4 w-4 text-pink-500" />,
  promo: <Sparkles className="h-4 w-4 text-strike-green" />,
  BOOKING_CONFIRMED: <Calendar className="h-4 w-4 text-emerald-500" />,
  BOOKING_CANCELLED: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
  BOOKING_NO_SHOW: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
  CLASS_REMINDER: <Calendar className="h-4 w-4 text-emerald-500" />,
  STATUS_CHANGED: <Info className="h-4 w-4 text-zinc-500" />,
  system: <Info className="h-4 w-4 text-zinc-500" />,
};

interface MemberNotificationBellProps {
  clientId?: string;
  onNavigate?: (target: string) => void;
}

export default function MemberNotificationBell({ clientId, onNavigate }: MemberNotificationBellProps) {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [clientNotifications, setClientNotifications] = useState<MemberNotification[]>([]);
  const [topLevelNotifications, setTopLevelNotifications] = useState<MemberNotification[]>([]);
  const [announcementNotifications, setAnnouncementNotifications] = useState<MemberNotification[]>([]);
  const [autoStatusNotifications, setAutoStatusNotifications] = useState<MemberNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasSeenInitialClientSnap = useRef(false);
  const hasSeenInitialTopSnap = useRef(false);
  const hasSeenInitialAnnSnap = useRef(false);

  const uid = currentUser?.id;
  const readStorageKey = useMemo(
    () => `member_read_notifications_${clientId || uid || 'guest'}`,
    [clientId, uid]
  );

  const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`member_read_notifications_${clientId || uid || 'guest'}`);
      const parsed = raw ? JSON.parse(raw) : [];
      const initial = new Set<string>(Array.isArray(parsed) ? parsed : []);
      if (Array.isArray(currentUser?.readNotifications)) {
        currentUser.readNotifications.forEach((id) => initial.add(String(id)));
      }
      return initial;
    } catch {
      return new Set<string>();
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(readStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const next = new Set<string>(Array.isArray(parsed) ? parsed : []);
      if (Array.isArray(currentUser?.readNotifications)) {
        currentUser.readNotifications.forEach((id) => next.add(String(id)));
      }
      setLocallyReadIds(next);
    } catch {}
  }, [readStorageKey, currentUser?.readNotifications]);

  const persistLocalReadIds = (idsToMark: string[]) => {
    if (idsToMark.length === 0) return;
    setLocallyReadIds((prev) => {
      const next = new Set(prev);
      idsToMark.forEach((id) => next.add(id));
      try {
        localStorage.setItem(readStorageKey, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    initGlobalAudioUnlock();
  }, []);

  useEffect(() => {
    if (!clientId) {
      setClientNotifications([]);
      return;
    }

    hasSeenInitialClientSnap.current = false;
    setLoading(true);
    const q = query(
      collection(db, 'clients', clientId, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const added = snap.docChanges().filter((c) => c.type === 'added');
      setClientNotifications(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type || 'system',
          title: data.title || 'Notification',
          body: data.body || '',
          read: data.read || false,
          createdAt: data.createdAt || new Date().toISOString(),
          data: data.data,
          source: 'client-subcollection',
        } as MemberNotification;
      }));
      setLoading(false);

      if (hasSeenInitialClientSnap.current && added.length > 0) {
        const newest = added[0]?.doc;
        const d = newest?.data() || {};
        void showBrowserNotificationWithPing({
          id: `client_notif_${newest?.id || Date.now()}`,
          title: d.title || 'Member Update',
          body: d.body || '',
        });
      }
      hasSeenInitialClientSnap.current = true;
    }, (err) => {
      console.error('[Member Notifications] Error loading client notifications:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clientId]);

  useEffect(() => {
    if (!uid) {
      setTopLevelNotifications([]);
      return;
    }

    hasSeenInitialTopSnap.current = false;
    const q = query(collection(db, 'notifications'), where('recipientUid', '==', uid), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const added = snap.docChanges().filter((c) => c.type === 'added');
        setTopLevelNotifications(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: data.type || 'system',
              title: data.title || 'Notification',
              body: data.body || '',
              read: data.read || false,
              createdAt: data.createdAt || new Date().toISOString(),
              data: data.data,
              source: 'top-level',
            } as MemberNotification;
          })
        );

        if (hasSeenInitialTopSnap.current && added.length > 0) {
          const newest = added[0]?.doc;
          const d = newest?.data() || {};
          void showBrowserNotificationWithPing({
            id: `top_notif_${newest?.id || Date.now()}`,
            title: d.title || 'Notification',
            body: d.body || d.description || '',
          });
        }
        hasSeenInitialTopSnap.current = true;
      },
      (err) => {
        console.warn('[Member Notifications] Could not load legacy notifications:', err);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    hasSeenInitialAnnSnap.current = false;
    const unsubscribe = onSnapshot(
      collection(db, 'announcements'),
      (announcementsSnap) => {
        const now = new Date();
        const added = announcementsSnap.docChanges().filter((c) => c.type === 'added');
        const rows: MemberNotification[] = [];
        announcementsSnap.docs.forEach((d) => {
          const data = d.data();
          try {
            if (data.isActive === false) return;
            const start = data.startDate ? toValidDate(data.startDate) : null;
            const end = data.endDate ? toValidDate(data.endDate) : null;
            if (start && now < start) return;
            if (end && now > end) return;

            rows.push({
              id: `ann_${d.id}`,
              type: 'announcement',
              title: data.title || 'Announcement',
              body: data.body || '',
              read: false,
              createdAt: data.createdAt || data.startDate || new Date().toISOString(),
              source: 'announcement',
            });
          } catch {
            // Ignore malformed announcement dates.
          }
        });
        setAnnouncementNotifications(rows);

        if (hasSeenInitialAnnSnap.current && added.length > 0) {
          const newest = added[0]?.doc;
          const d = newest?.data() || {};
          if (d.isActive !== false) {
            void showBrowserNotificationWithPing({
              id: `ann_${newest?.id || Date.now()}`,
              title: d.title || 'New Club Announcement',
              body: d.body || '',
            });
          }
        }
        hasSeenInitialAnnSnap.current = true;
      },
      (err) => {
        console.warn('[Member Notifications] Could not load announcements:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!clientId) {
      setAutoStatusNotifications([]);
      return;
    }

    const unsubClientDoc = onSnapshot(
      doc(db, 'clients', clientId),
      (docSnap) => {
        if (!docSnap.exists()) {
          setAutoStatusNotifications([]);
          return;
        }
        const clientData = docSnap.data() || {};
        const generated: MemberNotification[] = [];
        const todayStr = new Date().toISOString().slice(0, 10);

        // 1. Check membership expiry (Expired or Expiring within 7 days)
        const pkgs = Array.isArray(clientData.packages) ? clientData.packages : [];
        const primaryPkg = pkgs.find((p: any) => p.status === 'Active' || p.status === 'Nearly Expired') || pkgs[0];
        const rawExpiry = clientData.membershipExpiry || primaryPkg?.endDate;
        const expiryDate = rawExpiry ? toValidDate(rawExpiry) : null;
        const statusStr = String(clientData.status || '').toLowerCase();

        if (statusStr === 'expired' || (expiryDate && differenceInCalendarDays(expiryDate, new Date()) < 0)) {
          const expFormatted = expiryDate ? format(expiryDate, 'dd MMM yyyy') : 'recently';
          generated.push({
            id: `auto_expired_${clientId}_${rawExpiry || 'status'}`,
            type: 'expiry_warning',
            title: 'Membership Expired — Renew Now',
            body: `Your gym membership expired (${expFormatted}). Visit reception or tap here to renew your package and restore club access.`,
            read: false,
            createdAt: new Date().toISOString(),
            data: { target: 'profile-membership' },
            source: 'client-subcollection',
          });
        } else if (expiryDate) {
          const daysLeft = differenceInCalendarDays(expiryDate, new Date());
          if (daysLeft >= 0 && daysLeft <= 7) {
            const expFormatted = format(expiryDate, 'dd MMM yyyy');
            generated.push({
              id: `auto_expiring_${clientId}_${rawExpiry}_${daysLeft <= 3 ? '3d' : '7d'}`,
              type: 'expiry_warning',
              title: daysLeft === 0 ? 'Membership Expires Today!' : `Membership Expiring in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}`,
              body: `Your package (${clientData.packageType || primaryPkg?.packageName || 'Membership'}) expires on ${expFormatted}. Renew early to keep your streak and benefits active!`,
              read: false,
              createdAt: new Date().toISOString(),
              data: { target: 'profile-membership' },
              source: 'client-subcollection',
            });
          }
        }

        // 2. Check missing profile photo or photo moderation feedback
        if (clientData.photoModerationStatus === 'rejected') {
          generated.push({
            id: `auto_photo_rejected_${clientId}_${clientData.updatedAt || todayStr}`,
            type: 'STATUS_CHANGED',
            title: 'Profile Photo Needs Re-upload',
            body: `Your uploaded photo was not approved (${clientData.photoRejectionReason || 'Must be a clear face photo: no caps, no sunglasses, no inappropriate imagery'}). Tap to upload a new photo.`,
            read: false,
            createdAt: clientData.updatedAt || new Date().toISOString(),
            data: { target: 'profile' },
            source: 'client-subcollection',
          });
        } else if (!clientData.photoURL && !clientData.pendingPhotoURL) {
          generated.push({
            id: `auto_missing_photo_${clientId}`,
            type: 'STATUS_CHANGED',
            title: 'Action Required: Add Your Profile Picture',
            body: 'Please upload a clear profile picture from your Profile tab (no caps or sunglasses) or take one at the reception desk.',
            read: false,
            createdAt: clientData.createdAt || new Date().toISOString(),
            data: { target: 'profile' },
            source: 'client-subcollection',
          });
        }

        setAutoStatusNotifications(generated);
      },
      () => {}
    );

    return () => unsubClientDoc();
  }, [clientId]);

  const notifications = useMemo(() => {
    return [...autoStatusNotifications, ...clientNotifications, ...topLevelNotifications, ...announcementNotifications]
      .map((n) => ({
        ...n,
        read: Boolean(n.read || locallyReadIds.has(n.id) || locallyReadIds.has(`${n.source}:${n.id}`)),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [autoStatusNotifications, clientNotifications, topLevelNotifications, announcementNotifications, locallyReadIds]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (notification: MemberNotification) => {
    persistLocalReadIds([notification.id, `${notification.source}:${notification.id}`]);
    if (notification.read) return;
    try {
      if (notification.source === 'client-subcollection' && clientId) {
        await updateDoc(doc(db, 'clients', clientId, 'notifications', notification.id), { read: true });
      } else if (notification.source === 'top-level') {
        await updateDoc(doc(db, 'notifications', notification.id), { read: true });
      } else if (notification.source === 'announcement' && uid) {
        const existingRead = Array.isArray(currentUser?.readNotifications) ? currentUser.readNotifications : [];
        if (!existingRead.includes(notification.id)) {
          await updateDoc(doc(db, 'users', uid), {
            readNotifications: Array.from(new Set([...existingRead, notification.id])),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[Member Notifications] Could not sync read status to Firestore (saved locally):', err);
    }
  };

  const markAllRead = () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    const allKeys: string[] = [];
    unread.forEach((n) => {
      allKeys.push(n.id, `${n.source}:${n.id}`);
    });
    persistLocalReadIds(allKeys);
    unread.forEach((n) => {
      void markAsRead(n);
    });
  };

  const getNotificationTarget = (notification: MemberNotification) => {
    const target = String(notification.data?.target || notification.data?.screen || notification.data?.tab || '').toLowerCase();
    const url = String(notification.data?.url || notification.data?.deeplink || '').toLowerCase();
    const type = notification.type;

    if (target.includes('membership') || url.includes('membership') || type === 'expiry_warning') return 'profile-membership';
    if (target.includes('profile') || url.includes('profile') || type === 'STATUS_CHANGED') return 'profile';
    if (target.includes('attendance') || url.includes('attendance')) return 'profile-attendance';
    if (target.includes('pt') || target.includes('session') || url.includes('session')) return 'booking-pt';
    if (
      target.includes('booking') ||
      target.includes('class') ||
      url.includes('booking') ||
      url.includes('class') ||
      type === 'BOOKING_CONFIRMED' ||
      type === 'BOOKING_CANCELLED' ||
      type === 'BOOKING_NO_SHOW' ||
      type === 'CLASS_REMINDER' ||
      type === 'session_reminder'
    ) {
      return 'booking-group';
    }
    return null;
  };

  const handleNotificationClick = (notification: MemberNotification) => {
    markAsRead(notification);
    const target = getNotificationTarget(notification);
    if (target && onNavigate) {
      onNavigate(target);
      setIsOpen(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative text-foreground"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-strike-green text-[9px] font-bold text-background ring-2 ring-background">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="fixed top-[calc(4rem+var(--safe-top))] left-4 right-4 w-auto md:absolute md:top-full md:left-auto md:right-0 md:w-80 md:mt-2 rounded-xl border bg-card shadow-2xl z-[60] overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <h3 className="font-bold text-sm">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto no-scrollbar">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Bell className="h-8 w-8 opacity-20 mx-auto mb-2" />
                <p className="text-sm">No notifications yet</p>
                <p className="text-xs mt-1">We'll notify you about important updates</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map(n => (
                  <div
                    key={`${n.source}-${n.id}`}
                    className={`flex gap-3 p-3 transition-colors cursor-pointer ${
                      n.read ? 'opacity-60' : 'bg-primary/5 hover:bg-primary/10'
                    }`}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className="mt-0.5 rounded-full bg-background p-1.5 shadow-sm border shrink-0">
                      {typeIcons[n.type] || typeIcons.system}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">{n.title}</p>
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{formatTime(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
