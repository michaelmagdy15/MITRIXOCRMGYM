import { InzanDepartment } from '../types';

export type TaskRecurrenceRule = 'DAILY' | 'WEEKLY' | 'SHIFT_START' | 'SHIFT_END';

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  department: InzanDepartment | 'General';
  recurrence: TaskRecurrenceRule;
  dueTimeOfDay: string; // HH:mm e.g. "09:00"
  priority: 'Low' | 'Medium' | 'High';
  branch?: string;
  isActive: boolean;
}

export interface OperationalStaffTask {
  id: string;
  templateId?: string;
  title: string;
  description: string;
  department: InzanDepartment | 'General';
  assignedTo?: string; // staff UID
  assignedToName?: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:mm
  status: 'Pending' | 'In Progress' | 'Completed' | 'Missed';
  priority: 'Low' | 'Medium' | 'High';
  completedAt?: string; // ISO
  completedBy?: string;
  branch?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffTaskKPI {
  staffId: string;
  staffName: string;
  department: string;
  totalTasks: number;
  completedTasks: number;
  completedOnTime: number;
  completedLate: number;
  missedTasks: number;
  completionRatePercent: number;
}
