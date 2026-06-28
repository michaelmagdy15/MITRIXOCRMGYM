import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, limit, Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Bell, X, Check, Megaphone, Gift, AlertTriangle, Calendar, Sparkles, Info } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface MemberNotification {
  id: string;
  type: 'announcement' | 'expiry_warning' | 'session_reminder' | 'birthday' | 'system' | 'promo';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

const typeIcons: Record<string, React.ReactNode> = {
  announcement: <Megaphone className="h-4 w-4 text-blue-500" />,
  expiry_warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  session_reminder: <Calendar className="h-4 w-4 text-emerald-500" />,
  birthday: <Gift className="h-4 w-4 text-pink-500" />,
  promo: <Sparkles className="h-4 w-4 text-amber-500" />,
  system: <Info className="h-4 w-4 text-zinc-500" />,
};

interface MemberNotificationBellProps {
  clientId?: string;
}

export default function MemberNotificationBell({ clientId }: MemberNotificationBellProps) {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const uid = currentUser?.id;

  // Generate client-side notifications from data
  useEffect(() => {
    if (!uid) return;

    const loadNotifications = async () => {
      setLoading(true);
      const generated: MemberNotification[] = [];

      // 1. Pull from Firestore `notifications` collection (if it exists)
      try {
        const q = query(
          collection(db, 'notifications'),
          where('recipientUid', '==', uid)
        );
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const data = d.data();
          generated.push({
            id: d.id,
            type: data.type || 'system',
            title: data.title || 'Notification',
            body: data.body || '',
            read: data.read || false,
            createdAt: data.createdAt || new Date().toISOString(),
            data: data.data,
          });
        });
      } catch {
        // notifications collection may not exist yet — fine
      }

      // 2. Pull active announcements as notifications
      try {
        const now = new Date();
        const announcementsSnap = await getDocs(collection(db, 'announcements'));
        announcementsSnap.docs.forEach(d => {
          const data = d.data();
          try {
            if (!data.startDate || !data.endDate) return;
            const start = parseISO(data.startDate);
            const end = parseISO(data.endDate);
            if (now >= start && now <= end) {
              generated.push({
                id: `ann_${d.id}`,
                type: 'announcement',
                title: data.title || 'Announcement',
                body: data.body || '',
                read: false,
                createdAt: data.startDate,
              });
            }
          } catch { /* skip */ }
        });
      } catch {
        // announcements may not exist
      }

      // Sort newest first
      generated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(generated);
      setLoading(false);
    };

    loadNotifications();
  }, [uid]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    // Only mark Firestore-sourced notifications (not announcement-derived ones)
    if (!id.startsWith('ann_')) {
      try {
        await updateDoc(doc(db, 'notifications', id), { read: true });
      } catch { /* ignore */ }
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    // Batch update Firestore ones
    notifications.filter(n => !n.read && !n.id.startsWith('ann_')).forEach(n => {
      updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {});
    });
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
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="fixed top-[70px] left-4 right-4 w-auto md:absolute md:top-full md:left-auto md:right-0 md:w-80 md:mt-2 rounded-xl border bg-card shadow-2xl z-[60] overflow-hidden animate-in fade-in-0 zoom-in-95">
          {/* Header */}
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

          {/* Notification List */}
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
                    key={n.id}
                    className={`flex gap-3 p-3 transition-colors cursor-pointer ${
                      n.read ? 'opacity-60' : 'bg-primary/5 hover:bg-primary/10'
                    }`}
                    onClick={() => markAsRead(n.id)}
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
