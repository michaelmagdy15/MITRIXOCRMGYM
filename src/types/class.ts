export type ClassStatus = 'active' | 'cancelled' | 'completed';

export interface ClassSchedule {
  id: string;
  name: string;
  instructorId: string;
  instructorName: string;
  category: string;
  capacity: number;
  price: number; // 0 for free classes
  startTime: string; // ISO string
  endTime: string; // ISO string
  status: ClassStatus;
  createdAt: string;
  updatedAt: string;
  attendees?: string[];
  waitlist?: string[];
  checkedIn?: string[];
  noShows?: string[];
  noShowsProcessed?: boolean;
  branch?: string;
}

export type BookingStatus = 'booked' | 'waitlisted' | 'cancelled' | 'no-show' | 'attended';

export interface ClassBooking {
  id: string;
  classId: string;
  memberId: string;
  memberName: string;
  status: BookingStatus;
  bookedAt: string; // ISO string
  paymentStatus?: 'pending' | 'completed' | 'refunded';
  transactionId?: string;
}

export type CancellationRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CancellationRequest {
  id: string;
  classId: string;
  instructorId: string;
  reason: string;
  status: CancellationRequestStatus;
  requestedAt: string; // ISO string
  reviewedAt?: string; // ISO string
  reviewedBy?: string; // Manager ID
}
