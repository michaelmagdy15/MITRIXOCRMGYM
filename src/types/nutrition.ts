export type NutritionAppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled' | 'No-show';

export interface NutritionAppointment {
  id: string;
  clientId: string;
  clientName: string;
  nutritionistId: string;
  nutritionistName: string;
  date: string; // ISO string YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: NutritionAppointmentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus?: 'pending' | 'completed' | 'refunded';
  transactionId?: string;
}

export interface NutritionConsultation {
  id: string;
  appointmentId: string;
  clientId: string;
  nutritionistId: string;
  date: string; // ISO string
  notes: string; // Private consultation notes
  followUpTasks?: string[];
  metrics?: {
    weight?: number;
    bodyFatPercentage?: number;
    muscleMass?: number;
    bmr?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface NutritionistProfile {
  id: string;
  userId: string; // links to users collection
  name: string;
  active: boolean;
  specialties?: string[];
  schedule: Record<string, { // e.g. "Monday"
    enabled: boolean;
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    appointmentDuration: number; // in minutes (e.g. 45)
  }>;
  createdAt: string;
  updatedAt: string;
}
