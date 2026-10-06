export type NotificationEventType =
  | 'booking_confirmed'
  | 'session_reminder_48h'
  | 'session_cancelled_24h'
  | 'waitlist_promoted'
  | 'instructor_cancelled'
  | 'payment_confirmed'
  | 'membership_expiring'
  | 'pt_balance_low'
  | 'lead_followup_due'
  | 'frontdesk_fully_booked'
  | 'frontdesk_repeated_noshow';

export type NotificationChannel = 'in_app' | 'push' | 'email';
export type NotificationDeliveryStatus = 'delivered' | 'failed' | 'queued' | 'skipped_duplicate';

export interface NotificationDeliveryLog {
  id: string;
  eventType: NotificationEventType;
  recipientId: string;
  recipientType: 'member' | 'coach' | 'staff' | 'admin';
  recipientName: string;
  recipientEmail?: string;
  channels: NotificationChannel[];
  title: string;
  body: string;
  metadata?: Record<string, any>;
  status: NotificationDeliveryStatus;
  sentAt: string;
  idempotencyKey?: string;
  failureReason?: string;
  tenantId?: string;
}

export interface NotificationEventParams {
  eventType: NotificationEventType;
  recipientId: string;
  recipientType: 'member' | 'coach' | 'staff' | 'admin';
  recipientName: string;
  recipientEmail?: string;
  channels?: NotificationChannel[];
  data: {
    serviceName?: string;
    date?: string;
    time?: string;
    coachName?: string;
    clientName?: string;
    amount?: number;
    sessionsRemaining?: number;
    expiryDate?: string;
    reason?: string;
    branch?: string;
    [key: string]: any;
  };
  idempotencyKey?: string;
}
