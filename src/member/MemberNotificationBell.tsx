import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Bell, Calendar, Check, Gift, Info, Megaphone, Sparkles, X } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

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
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const uid = currentUser?.id;

  useEffect(() => {
    if (!clientId) {
      setClientNotifications([]);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'clients', clientId, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
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

    const loadTopLevel = async () => {
      try {
        const q = query(collection(db, 'notifications'), where('recipientUid', '==', uid));
        const snap = await getDocs(q);
        setTopLevelNotifications(snap.docs.map((d) => {
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
        }));
      } catch (err) {
        console.warn('[Member Notifications] Could not load legacy notifications:', err);
      }
    };

    loadTopLevel();
  }, [uid]);

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const now = new Date();
        const announcementsSnap = await getDocs(collection(db, 'announcements'));
        const rows: MemberNotification[] = [];
        announcementsSnap.docs.forEach((d) => {
          const data = d.data();
          try {
            if (!data.startDate || !data.endDate) return;
            const start = parseISO(data.startDate);
            const end = parseISO(data.endDate);
            if (now >= start && now <= end) {
              rows.push({
                id: `ann_${d.id}`,
                type: 'announcement',
                title: data.title || 'Announcement',
                body: data.body || '',
                read: false,
                createdAt: data.startDate,
                source: 'announcement',
              });
            }
          } catch {
            // Ignore malformed announcement dates.
          }
        });
        setAnnouncementNotifications(rows);
      } catch (err) {
        console.warn('[Member Notifications] Could not load announcements:', err);
      }
    };

    loadAnnouncements();
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

  const notifications = useMemo(() => {
    return [...clientNotifications, ...topLevelNotifications, ...announcementNotifications]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [clientNotifications, topLevelNotifications, announcementNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (notification: MemberNotification) => {
    if (notification.read) return;
    try {
      if (notification.source === 'client-subcollection' && clientId) {
        await updateDoc(doc(db, 'clients', clientId, 'notifications', notification.id), { read: true });
      } else if (notification.source === 'top-level') {
        await updateDoc(doc(db, 'notifications', notification.id), { read: true });
      }
    } catch (err) {
      console.error('[Member Notifications] Failed to mark notification read:', err);
    }
  };

  const markAllRead = () => {
    notifications.filter(n => !n.read).forEach((n) => {
      markAsRead(n);
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
        <div className="fixed top-[70px] left-4 right-4 w-auto md:absolute md:top-full md:left-auto md:right-0 md:w-80 md:mt-2 rounded-xl border bg-card shadow-2xl z-[60] overflow-hidden animate-in fade-in-0 zoom-in-95">
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
