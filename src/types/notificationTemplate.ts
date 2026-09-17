export type NotificationTriggerEvent = 
  | 'class_booking_confirmation'
  | 'waitlist_promotion'
  | 'class_reminder_2h'
  | 'class_cancelled'
  | 'no_show_alert'
  | 'pt_booking_confirmation'
  | 'pt_rescheduled';

export interface NotificationTemplate {
  id: string;
  eventKey: NotificationTriggerEvent;
  title: string;
  bodyTemplate: string; // Supports placeholders: {memberName}, {className}, {coachName}, {startTime}, {date}, {branch}
  channels: {
    push: boolean;
    sms: boolean;
    inApp: boolean;
  };
  isActive: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export const DEFAULT_NOTIFICATION_TEMPLATES: Record<NotificationTriggerEvent, { title: string; bodyTemplate: string; channels: NotificationTemplate['channels'] }> = {
  class_booking_confirmation: {
    title: "Class Booking Confirmed! 🎉",
    bodyTemplate: "Hi {memberName}, your spot in {className} with {coachName} on {date} at {startTime} is confirmed!",
    channels: { push: true, sms: false, inApp: true }
  },
  waitlist_promotion: {
    title: "You're In! Spot Confirmed 🚀",
    bodyTemplate: "Great news {memberName}! A spot opened up in {className} on {date} at {startTime} and you've been promoted from the waitlist!",
    channels: { push: true, sms: true, inApp: true }
  },
  class_reminder_2h: {
    title: "Upcoming Class in 2 Hours ⏰",
    bodyTemplate: "Reminder: Your class {className} starts in 2 hours at {startTime}. See you at {branch}!",
    channels: { push: true, sms: false, inApp: true }
  },
  class_cancelled: {
    title: "Class Cancellation Notice ⚠️",
    bodyTemplate: "Dear {memberName}, your class {className} scheduled for {date} at {startTime} has been cancelled. Your session credit has been refunded.",
    channels: { push: true, sms: true, inApp: true }
  },
  no_show_alert: {
    title: "Missed Class Notice ℹ️",
    bodyTemplate: "Hi {memberName}, you were marked as a no-show for {className} on {date}. Please remember to cancel at least 2 hours in advance to avoid penalty strikes.",
    channels: { push: true, sms: false, inApp: true }
  },
  pt_booking_confirmation: {
    title: "PT Session Booked 💪",
    bodyTemplate: "Your personal training session with Coach {coachName} is booked for {date} at {startTime}.",
    channels: { push: true, sms: false, inApp: true }
  },
  pt_rescheduled: {
    title: "PT Session Rescheduled 📅",
    bodyTemplate: "Your session with Coach {coachName} has been rescheduled to {date} at {startTime}.",
    channels: { push: true, sms: false, inApp: true }
  }
};
