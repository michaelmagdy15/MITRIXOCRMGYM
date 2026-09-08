/**
 * Strike Gym Official Weekly Schedules
 * Source of truth for Maxim, Mivida, and Impact branches.
 * Strictly isolated for the Strike gym tenant.
 */

export interface StrikeScheduleSlot {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  dayName: 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
  startTime: string; // "17:00", "18:00", "19:00", "20:00", "21:00"
  endTime: string;   // "18:00", "19:00", "20:00", "21:00", "22:00"
  timeDisplay: string; // "5:00 PM", "6:00 PM", etc.
  className: string;
  tier: 'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults';
  allowedTiers: string[];
  capacity: number;
  category: 'Kids' | 'Juniors' | 'Adults';
}

export interface StrikeBranchSchedule {
  branchId: 'maxim' | 'mivida' | 'impact';
  branchName: string;
  title: string;
  displayName: string;
  slots: StrikeScheduleSlot[];
}

export const STRIKE_SCHEDULES: Record<'maxim' | 'mivida' | 'impact', StrikeBranchSchedule> = {
  maxim: {
    branchId: 'maxim',
    branchName: 'Maxim Compound',
    title: 'STRIKE MAXIM SCHEDULE',
    displayName: 'Maxim Branch',
    slots: [
      // ── Sunday (0) ──
      { dayOfWeek: 0, dayName: 'SUN', startTime: '17:00', endTime: '18:00', timeDisplay: '5:00 PM', className: 'Kids / Pro Boxing', tier: 'Kids Pro', allowedTiers: ['Kids Pro', 'Kids Only'], capacity: 15, category: 'Kids' },
      { dayOfWeek: 0, dayName: 'SUN', startTime: '18:00', endTime: '19:00', timeDisplay: '6:00 PM', className: 'Juniors / Advanced Boxing', tier: 'Junior Advanced', allowedTiers: ['Junior Advanced', 'Junior Only'], capacity: 15, category: 'Juniors' },
      { dayOfWeek: 0, dayName: 'SUN', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 0, dayName: 'SUN', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Monday (1) ──
      { dayOfWeek: 1, dayName: 'MON', startTime: '18:00', endTime: '19:00', timeDisplay: '6:00 PM', className: 'Kids / Pro Boxing', tier: 'Kids Pro', allowedTiers: ['Kids Pro', 'Kids Only'], capacity: 15, category: 'Kids' },
      { dayOfWeek: 1, dayName: 'MON', startTime: '19:00', endTime: '20:00', timeDisplay: '7:00 PM', className: 'Juniors / Advanced Boxing', tier: 'Junior Advanced', allowedTiers: ['Junior Advanced', 'Junior Only'], capacity: 15, category: 'Juniors' },
      { dayOfWeek: 1, dayName: 'MON', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 1, dayName: 'MON', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Tuesday (2) ──
      { dayOfWeek: 2, dayName: 'TUE', startTime: '17:00', endTime: '18:00', timeDisplay: '5:00 PM', className: 'Kids / Pro Boxing', tier: 'Kids Pro', allowedTiers: ['Kids Pro', 'Kids Only'], capacity: 15, category: 'Kids' },
      { dayOfWeek: 2, dayName: 'TUE', startTime: '18:00', endTime: '19:00', timeDisplay: '6:00 PM', className: 'Juniors / Advanced Boxing', tier: 'Junior Advanced', allowedTiers: ['Junior Advanced', 'Junior Only'], capacity: 15, category: 'Juniors' },
      { dayOfWeek: 2, dayName: 'TUE', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 2, dayName: 'TUE', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Wednesday (3) ──
      { dayOfWeek: 3, dayName: 'WED', startTime: '18:00', endTime: '19:00', timeDisplay: '6:00 PM', className: 'Kids / Pro Boxing', tier: 'Kids Pro', allowedTiers: ['Kids Pro', 'Kids Only'], capacity: 15, category: 'Kids' },
      { dayOfWeek: 3, dayName: 'WED', startTime: '19:00', endTime: '20:00', timeDisplay: '7:00 PM', className: 'Juniors / Advanced Boxing', tier: 'Junior Advanced', allowedTiers: ['Junior Advanced', 'Junior Only'], capacity: 15, category: 'Juniors' },
      { dayOfWeek: 3, dayName: 'WED', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 3, dayName: 'WED', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Thursday (4) ──
      { dayOfWeek: 4, dayName: 'THU', startTime: '17:00', endTime: '18:00', timeDisplay: '5:00 PM', className: 'Kids / Pro Boxing', tier: 'Kids Pro', allowedTiers: ['Kids Pro', 'Kids Only'], capacity: 15, category: 'Kids' },
      { dayOfWeek: 4, dayName: 'THU', startTime: '18:00', endTime: '19:00', timeDisplay: '6:00 PM', className: 'Juniors / Advanced Boxing', tier: 'Junior Advanced', allowedTiers: ['Junior Advanced', 'Junior Only'], capacity: 15, category: 'Juniors' },
      { dayOfWeek: 4, dayName: 'THU', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 4, dayName: 'THU', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // Friday (5): OFF

      // ── Saturday (6) ──
      { dayOfWeek: 6, dayName: 'SAT', startTime: '18:00', endTime: '19:00', timeDisplay: '6:00 PM', className: 'Kids / Pro Boxing', tier: 'Kids Pro', allowedTiers: ['Kids Pro', 'Kids Only'], capacity: 15, category: 'Kids' },
      { dayOfWeek: 6, dayName: 'SAT', startTime: '19:00', endTime: '20:00', timeDisplay: '7:00 PM', className: 'Juniors / Advanced Boxing', tier: 'Junior Advanced', allowedTiers: ['Junior Advanced', 'Junior Only'], capacity: 15, category: 'Juniors' },
      { dayOfWeek: 6, dayName: 'SAT', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 6, dayName: 'SAT', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing & Conditioning', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' }
    ]
  },

  impact: {
    branchId: 'impact',
    branchName: 'Impact by Strike',
    title: 'IMPACT BY STRIKE SCHEDULE',
    displayName: 'Impact by Strike',
    slots: [
      // ── Sunday (0) ──
      { dayOfWeek: 0, dayName: 'SUN', startTime: '19:00', endTime: '20:00', timeDisplay: '7:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 0, dayName: 'SUN', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Monday (1) ──
      { dayOfWeek: 1, dayName: 'MON', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 1, dayName: 'MON', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Tuesday (2) ──
      { dayOfWeek: 2, dayName: 'TUE', startTime: '19:00', endTime: '20:00', timeDisplay: '7:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 2, dayName: 'TUE', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Wednesday (3) ──
      { dayOfWeek: 3, dayName: 'WED', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 3, dayName: 'WED', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // Thursday (4): OFF

      // ── Friday (5) ──
      { dayOfWeek: 5, dayName: 'FRI', startTime: '19:00', endTime: '20:00', timeDisplay: '7:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 5, dayName: 'FRI', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Saturday (6) ──
      { dayOfWeek: 6, dayName: 'SAT', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },
      { dayOfWeek: 6, dayName: 'SAT', startTime: '21:00', endTime: '22:00', timeDisplay: '9:00 PM', className: 'Adult Boxing (Impact)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' }
    ]
  },

  mivida: {
    branchId: 'mivida',
    branchName: 'Mivida Compound',
    title: 'STRIKE MIVIDA SCHEDULE',
    displayName: 'Mivida Branch',
    slots: [
      // ── Wednesday (3) ──
      { dayOfWeek: 3, dayName: 'WED', startTime: '17:00', endTime: '18:00', timeDisplay: '5:00 PM', className: 'Kids Boxing (Mivida)', tier: 'Kids Only', allowedTiers: ['Kids Only', 'Kids Pro'], capacity: 15, category: 'Kids' },
      { dayOfWeek: 3, dayName: 'WED', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Mivida)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Saturday (6) ──
      { dayOfWeek: 6, dayName: 'SAT', startTime: '17:00', endTime: '18:00', timeDisplay: '5:00 PM', className: 'Kids Boxing (Mivida)', tier: 'Kids Only', allowedTiers: ['Kids Only', 'Kids Pro'], capacity: 15, category: 'Kids' },

      // ── Sunday (0) ──
      { dayOfWeek: 0, dayName: 'SUN', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Mivida)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Monday (1) ──
      { dayOfWeek: 1, dayName: 'MON', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Mivida)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' },

      // ── Tuesday (2) ──
      { dayOfWeek: 2, dayName: 'TUE', startTime: '20:00', endTime: '21:00', timeDisplay: '8:00 PM', className: 'Adult Boxing (Mivida)', tier: 'Adults', allowedTiers: ['Adults'], capacity: 20, category: 'Adults' }
    ]
  }
};

/**
 * Generates concrete class schedule objects for a given date range (e.g. next 60 days).
 */
export function generateStrikeClassesForDateRange(
  startDate: Date,
  daysCount: number = 45,
  targetBranch?: 'maxim' | 'mivida' | 'impact'
): Array<any> {
  const generated: any[] = [];
  const branchKeys: Array<'maxim' | 'mivida' | 'impact'> = targetBranch 
    ? [targetBranch] 
    : ['maxim', 'mivida', 'impact'];

  for (let d = 0; d < daysCount; d++) {
    const current = new Date(startDate.getTime());
    current.setDate(current.getDate() + d);
    const dayOfWeek = current.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    for (const key of branchKeys) {
      const branchSchedule = STRIKE_SCHEDULES[key];
      const matchingSlots = branchSchedule.slots.filter(s => s.dayOfWeek === dayOfWeek);

      for (const slot of matchingSlots) {
        const startIso = `${dateStr}T${slot.startTime}:00`;
        const endIso = `${dateStr}T${slot.endTime}:00`;
        // Deterministic ID so repeated generations are idempotent
        const id = `strike_${key}_${dateStr}_${slot.startTime.replace(':', '')}`;

        generated.push({
          id,
          name: slot.className,
          branch: branchSchedule.branchName,
          date: dateStr,
          time: `${slot.timeDisplay} - ${slot.endTime.startsWith('22') ? '10:00 PM' : slot.endTime.startsWith('21') ? '9:00 PM' : slot.endTime.startsWith('20') ? '8:00 PM' : slot.endTime.startsWith('19') ? '7:00 PM' : '6:00 PM'}`,
          startTime: startIso,
          endTime: endIso,
          tier: slot.tier,
          allowedTiers: slot.allowedTiers,
          category: slot.category,
          type: 'Class',
          status: 'active',
          capacity: slot.capacity,
          attendees: [],
          waitlist: [],
          coachName: 'Strike Team',
          instructorName: 'Strike Team',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  return generated;
}
