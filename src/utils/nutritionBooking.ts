/**
 * Nutrition Booking Domain Logic and Concurrency Lock Utilities
 * Enforces atomic slot reservation, working hours, and overlap prevention
 * conforming to Inzan Athletics PRD Sections 6.5, 11, 13, 14, 25, 26.
 */

export interface NutritionSlotValidationParams {
  nutritionistId: string;
  nutritionistName?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  schedule?: Record<string, {
    enabled: boolean;
    startTime: string;
    endTime: string;
    appointmentDuration?: number;
  }>;
  active?: boolean;
  now?: Date;
}

export interface NutritionSlotReservationDoc {
  appointmentId: string;
  nutritionistId: string;
  date: string;
  timeBucket: string;
  clientId: string;
  createdAt: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Converts "HH:mm" to total minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time format: "${timeStr}". Expected HH:mm (24-hour).`);
  }
  return h * 60 + m;
}

/**
 * Converts total minutes from midnight to "HH:mm"
 */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Generates 15-minute bucket keys for deterministic Firestore slot reservation.
 * e.g. for 10:00 to 10:45:
 * ["nut123_2026-10-08_10:00", "nut123_2026-10-08_10:15", "nut123_2026-10-08_10:30"]
 */
export function generateSlotBucketKeys(
  nutritionistId: string,
  date: string,
  startTime: string,
  endTime: string,
  bucketMinutes: number = 15
): string[] {
  if (!nutritionistId || !date || !startTime || !endTime) {
    throw new Error('nutritionistId, date, startTime, and endTime are required to generate slot keys.');
  }

  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);

  if (endM <= startM) {
    throw new Error(`Appointment end time (${endTime}) must be strictly after start time (${startTime}).`);
  }

  const keys: string[] = [];
  for (let current = startM; current < endM; current += bucketMinutes) {
    const bucketTime = minutesToTime(current);
    keys.push(`${nutritionistId}_${date}_${bucketTime}`);
  }

  return keys;
}

/**
 * Pure validation logic for nutrition booking rules.
 */
export function validateNutritionSlotRules(params: NutritionSlotValidationParams): void {
  const { nutritionistId, date, startTime, endTime, schedule, active, now = new Date() } = params;

  if (!nutritionistId) {
    throw new Error('Nutritionist is required.');
  }
  if (!date) {
    throw new Error('Date is required.');
  }
  if (!startTime || !endTime) {
    throw new Error('Start time and end time are required.');
  }

  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);
  if (endM <= startM) {
    throw new Error(`End time (${endTime}) must be after start time (${startTime}).`);
  }

  if (active === false) {
    throw new Error('Selected nutritionist is not currently active.');
  }

  // Verify slot is not in the past
  const slotDateObj = new Date(`${date}T${startTime}:00`);
  if (isNaN(slotDateObj.getTime())) {
    throw new Error(`Invalid date format: ${date}`);
  }
  if (slotDateObj.getTime() < now.getTime() - 60 * 1000) { // 1-minute grace for clock skew
    throw new Error('Cannot book an appointment in the past.');
  }

  // Verify day schedule and working hours
  if (schedule) {
    const dayOfWeek = DAYS[slotDateObj.getDay()] || 'Sunday';
    const daySchedule = schedule[dayOfWeek];

    if (!daySchedule || !daySchedule.enabled) {
      throw new Error(`Nutritionist is not available on ${dayOfWeek}s.`);
    }

    const schedStartM = timeToMinutes(daySchedule.startTime);
    const schedEndM = timeToMinutes(daySchedule.endTime);

    if (startM < schedStartM || endM > schedEndM) {
      throw new Error(
        `Selected time (${startTime} - ${endTime}) falls outside working hours (${daySchedule.startTime} - ${daySchedule.endTime}) on ${dayOfWeek}s.`
      );
    }
  }
}
