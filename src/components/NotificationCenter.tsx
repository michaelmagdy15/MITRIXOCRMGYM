import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context';
import { useTasks } from '../hooks/useTasks';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Bell, AlertTriangle, Gift, CheckSquare, Clock, User as UserIcon, X, Check, ShoppingCart } from 'lucide-react';
import { differenceInDays, isSameDay, isSameMonth, parseISO, isToday, isBefore, isAfter, startOfDay } from 'date-fns';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export type NotificationType = 'lead_stale' | 'member_expiring' | 'birthday' | 'task_due' | 'booking_request';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  date: Date;
  recordName: string;
  recordId: string;
}

export function NotificationCenter() {
  const { clients, setSearchQuery, setActiveTab } = useAppContext();
  const { currentUser, updateUser } = useAuth();
  const { tasks } = useTasks();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Subscribe to pending booking requests
  useEffect(() => {
    const q = query(collection(db, 'bookingRequests'), where('status', '==', 'Pending'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingBookings(list);
    }, (err) => {
      console.error("Error loading pending bookings for notifications:", err);
    });
    return () => unsub();
  }, []);

  // Load dismissed notifications from database and localStorage on mount
  useEffect(() => {
    if (currentUser?.id) {
      const dbDismissed = currentUser.dismissedNotifications || [];
      const stored = localStorage.getItem(`crm_notifications_dismissed_${currentUser.id}`);
      const mergedSet = new Set<string>(dbDismissed);
      
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach(id => mergedSet.add(id));
          }
        } catch (e) {
          console.error("Failed to parse dismissed notifications from localStorage", e);
        }
      }
      setDismissedIds(mergedSet);
    }
  }, [currentUser?.id, currentUser?.dismissedNotifications]);

  // Save dismissed notifications to database and localStorage when changed
  const dismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser?.id) return;
    
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      const arr = Array.from(next);
      localStorage.setItem(`crm_notifications_dismissed_${currentUser.id}`, JSON.stringify(arr));
      // Save to database
      updateUser(currentUser.id, { dismissedNotifications: arr }).catch(err => {
        console.error("Failed to save dismissed notification to DB", err);
      });
      return next;
    });
  };

  const dismissAll = () => {
    if (!currentUser?.id) return;
    const allIds = notifications.map(n => n.id);
    setDismissedIds(prev => {
      const next = new Set(prev);
      allIds.forEach(id => next.add(id));
      const arr = Array.from(next);
      localStorage.setItem(`crm_notifications_dismissed_${currentUser.id}`, JSON.stringify(arr));
      // Save to database
      updateUser(currentUser.id, { dismissedNotifications: arr }).catch(err => {
        console.error("Failed to save dismissed notifications to DB", err);
      });
      return next;
    });
    setIsOpen(false);
  };

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

  // Generate notifications
  useEffect(() => {
    const today = startOfDay(new Date());
    const generated: AppNotification[] = [];

    // 1. Leads not contacted in 7+ days
    // 2. Members expiring in 3 days
    // 3. Birthdays today
    clients.forEach(client => {
      // Birthdays
      if (client.dateOfBirth) {
        const dob = parseISO(client.dateOfBirth);
        if (dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()) {
          generated.push({
            id: `bday_${client.id}_${today.getFullYear()}`,
            type: 'birthday',
            title: 'Birthday Today!',
            description: `${client.name} is celebrating their birthday today.`,
            date: today,
            recordName: client.name,
            recordId: client.id
          });
        }
      }

      if (client.status === 'Lead') {
        // Stale leads
        if (client.lastContactDate) {
          const lastContact = parseISO(client.lastContactDate);
          const daysPassed = differenceInDays(today, startOfDay(lastContact));
          if (daysPassed >= 7) {
            generated.push({
              id: `lead_stale_${client.id}_${lastContact.toISOString()}`,
              type: 'lead_stale',
              title: 'Stale Lead',
              description: `${client.name} hasn't been contacted in ${daysPassed} days.`,
              date: lastContact,
              recordName: client.name,
              recordId: client.id
            });
          }
        }
      } else if (client.status !== 'Hold') {
        // Expiring members
        if (client.membershipExpiry) {
          const expiryDate = parseISO(client.membershipExpiry);
          const daysToExpiry = differenceInDays(startOfDay(expiryDate), today);
          
          if (daysToExpiry >= 0 && daysToExpiry <= 3) {
            generated.push({
              id: `expiring_${client.id}_${expiryDate.toISOString()}`,
              type: 'member_expiring',
              title: 'Membership Expiring',
              description: `${client.name}'s membership expires in ${daysToExpiry === 0 ? 'today' : `${daysToExpiry} days`}.`,
              date: expiryDate,
              recordName: client.name,
              recordId: client.id
            });
          }
        }
      }
    });

    // 4. Tasks due today or overdue
    tasks.forEach(task => {
      if (task.status !== 'Completed') {
        const dueDate = parseISO(task.dueDate);
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
            recordId: task.id
          });
        }
      }
    });

    // 5. Pending booking requests
    pendingBookings.forEach(booking => {
      generated.push({
        id: `booking_req_${booking.id}`,
        type: 'booking_request',
        title: 'New Booking Request',
        description: `${booking.clientName} requested: ${booking.items.map((i: any) => i.packageName).join(', ')} (${booking.totalPrice} EGP)`,
        date: booking.createdAt ? parseISO(booking.createdAt) : today,
        recordName: booking.clientName,
        recordId: booking.id
      });
    });

    // Sort by date (newest first for tasks/events, but here we can just show tasks first, then birthdays, etc.)
    generated.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    setNotifications(generated);
  }, [clients, tasks, pendingBookings]);

  const activeNotifications = notifications.filter(n => !dismissedIds.has(n.id));

  const handleNotificationClick = (notification: AppNotification) => {
    if (notification.type === 'booking_request') {
      setActiveTab('bookings');
      setIsOpen(false);
    } else {
      setSearchQuery(notification.recordName);
      setIsOpen(false);
    }
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'birthday': return <Gift className="h-4 w-4 text-pink-500" />;
      case 'lead_stale': return <Clock className="h-4 w-4 text-amber-500" />;
      case 'member_expiring': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'task_due': return <CheckSquare className="h-4 w-4 text-blue-500" />;
      case 'booking_request': return <ShoppingCart className="h-4 w-4 text-emerald-500" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

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
          <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-1 ring-background">
            {activeNotifications.length > 99 ? '99+' : activeNotifications.length}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="fixed top-[70px] left-4 right-4 w-auto md:absolute md:top-full md:left-auto md:right-0 md:w-80 sm:md:w-96 md:mt-2 rounded-md border bg-card shadow-lg z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {activeNotifications.length > 0 && (
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground" onClick={dismissAll}>
                Dismiss all <Check className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
          
          <div className="max-h-[400px] overflow-y-auto no-scrollbar">
            {activeNotifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                <Bell className="h-8 w-8 opacity-20 mb-2" />
                <p>You have no new notifications.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeNotifications.map(notification => (
                  <div 
                    key={notification.id} 
                    className="flex flex-col p-3 sm:p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-full bg-background p-1.5 shadow-sm border">
                          {getIcon(notification.type)}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-none mb-1">{notification.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{notification.description}</p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0 ml-2" 
                        onClick={(e) => dismissNotification(notification.id, e)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
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
