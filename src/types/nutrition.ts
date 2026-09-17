export type NutritionAppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled' | 'No-show';

export interface NutritionAppointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  nutritionistId: string;
  nutritionistName: string;
  date: string; // ISO string YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: NutritionAppointmentStatus;
  notes?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus?: 'pending' | 'completed' | 'refunded';
  transactionId?: string;
  hasConsultationNotes?: boolean;
}

export interface BodyMetrics {
  weight?: number; // kg
  bodyFatPercentage?: number; // %
  muscleMass?: number; // kg
  bmr?: number; // kcal
  height?: number; // cm
  visceralFat?: number; // rating 1-30
}

export interface NutritionConsultation {
  id: string;
  appointmentId: string;
  clientId: string;
  clientName?: string;
  nutritionistId: string;
  nutritionistName?: string;
  date: string; // ISO string
  notes: string; // Private consultation notes
  followUpTasks?: string[];
  dietaryPlan?: string;
  metrics?: BodyMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionistScheduleDay {
  enabled: boolean;
  startTime: string; // HH:mm e.g. "09:00"
  endTime: string; // HH:mm e.g. "17:00"
  appointmentDuration: number; // in minutes (e.g. 45)
}

export interface NutritionistProfile {
  id: string;
  userId: string; // links to users or coaches collection
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  active: boolean;
  specialties?: string[];
  schedule: Record<string, NutritionistScheduleDay>; // Keyed by day name: e.g. "Monday", "Tuesday", etc.
  createdAt: string;
  updatedAt: string;
}

export interface NutritionPackage {
  id: string;
  name: string;
  sessions: number;
  price: number;
  validityDays: number;
  active: boolean;
}
