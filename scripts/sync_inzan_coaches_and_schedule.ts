import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'faa-test-guide-v2' });
}

const db = getFirestore('db-inzanathletics');

const REAL_INZAN_COACHES: Record<string, {
  name: string;
  specialty: string;
  discipline: string;
  category: string;
  bio: string;
  certifications: string[];
  isFitnessManager?: boolean;
  featuredOnWebsite?: boolean;
  displayOrder?: number;
  coachId?: string;
  userId?: string;
}> = {
  'csihyCMkxqvtq9nehf36': {
    name: 'Ahmed Tarek',
    specialty: 'Fitness Manager & Head S&C Coach',
    discipline: 'Strength & Conditioning • Personal Training',
    category: 'Strength & Conditioning',
    bio: 'Fitness Manager overseeing athlete assessments, biomechanical screening, and elite strength & conditioning programming at Inzan Athletics.',
    certifications: ['Fitness Manager', 'CSCS / S&C Lead', 'Movement & Biomechanics Assessment'],
    isFitnessManager: true,
    featuredOnWebsite: true,
    displayOrder: 1,
    coachId: 'COACH-011',
    userId: 'dKnpr7KiHdaK0ylsUd9ohqIzVJ72',
  },
  'redgits-staff-10': {
    name: 'Beezo',
    specialty: 'Fitness Manager & Group PT Lead',
    discipline: 'Group PT • Youth & Athletic Performance',
    category: 'Personal Training',
    bio: 'Fitness Manager and senior performance specialist leading small-group PT, youth athletic development, and high-output conditioning.',
    certifications: ['Fitness Manager', 'Senior Group PT Specialist', 'Youth Athletic Performance'],
    isFitnessManager: true,
    featuredOnWebsite: true,
    displayOrder: 2,
    coachId: 'COACH-010',
    userId: '2FhKL2cfyuMSKtxj4bztPpd5I6y2',
  },
  'redgits-staff-72': {
    name: 'Akram Hammad',
    specialty: 'Senior S&C & Personal Trainer',
    discipline: 'Strength & Hypertrophy • Youth PT',
    category: 'Strength & Conditioning',
    bio: 'Senior strength and conditioning coach specializing in progressive overload, athletic power, and structured 1-on-1 & small-group training.',
    certifications: ['Certified Personal Trainer', 'Strength & Hypertrophy Specialist', 'Youth Performance Coach'],
    featuredOnWebsite: true,
    displayOrder: 3,
    coachId: 'COACH-005',
    userId: 'qeEVXXdNNcVUhnEvo8M2xrFy4vi2',
  },
  'redgits-staff-128': {
    name: 'Ahmed Ezzat',
    specialty: 'SGF Lead & Functional Conditioning',
    discipline: 'SGF Academy • Metabolic Conditioning',
    category: 'SGF & Conditioning',
    bio: 'High-intensity Small Group Fitness (SGF) and functional conditioning specialist focused on engine building, work capacity, and body recomposition.',
    certifications: ['SGF Head Coach', 'Functional Conditioning Specialist', 'Personal Trainer'],
    featuredOnWebsite: true,
    displayOrder: 4,
    coachId: 'COACH-012',
  },
  'redgits-staff-122': {
    name: 'Bassem Youssef',
    specialty: 'MMA & Combat Conditioning Coach',
    discipline: 'MMA Academy • Boxing & Combat',
    category: 'Combat & MMA',
    bio: 'Combat sports and MMA conditioning coach delivering technical striking, fight conditioning, and explosive athletic agility.',
    certifications: ['MMA Academy Coach', 'Boxing & Striking Conditioning', 'Functional Strength'],
    featuredOnWebsite: true,
    displayOrder: 5,
    coachId: 'COACH-013',
  },
  'redgits-staff-94': {
    name: 'Kareem Awny',
    specialty: 'Calisthenics & Strength Specialist',
    discipline: 'Calisthenics • Bodyweight & Strength',
    category: 'Calisthenics & Gymnastics',
    bio: 'Specialist in calisthenics progressions, relative bodyweight strength, core control, and functional hypertrophy.',
    certifications: ['Calisthenics Specialist', 'Progressive Strength Coach', 'Mobility & Core Control'],
    featuredOnWebsite: true,
    displayOrder: 6,
    coachId: 'COACH-014',
  },
  'redgits-staff-51': {
    name: 'Heidi El Hariri',
    specialty: 'Gymnastics & Mobility Specialist',
    discipline: 'Gymnastics Academy • Flexibility',
    category: 'Calisthenics & Gymnastics',
    bio: 'Gymnastics and movement specialist coaching youth and adult gymnastics progressions, joint mobility, and body control.',
    certifications: ['Gymnastics Academy Lead', 'Mobility & Flexibility Specialist', 'Youth Movement Coach'],
    featuredOnWebsite: true,
    displayOrder: 7,
    coachId: 'COACH-015',
  },
  'redgits-staff-33': {
    name: 'Moaz Azoz',
    specialty: 'Personal Training & Sports Nutrition',
    discipline: 'Personal Training • Body Recomposition',
    category: 'Personal Training',
    bio: 'Personal trainer and performance nutrition specialist combining structured resistance training with tailored nutrition protocols.',
    certifications: ['Certified Personal Trainer', 'Sports Nutrition & Recomposition', 'Small Group PT'],
    featuredOnWebsite: true,
    displayOrder: 8,
    coachId: 'COACH-016',
  },
  'redgits-staff-30': {
    name: 'Kogy',
    specialty: 'Youth Athletics & Group PT Coach',
    discipline: 'Youth PT • Group Conditioning',
    category: 'Youth & Academies',
    bio: 'Dedicated youth athletic performance and group PT coach building speed, coordination, and foundational strength.',
    certifications: ['Youth Athletic Specialist', 'Group PT Coach', 'Speed & Agility'],
    featuredOnWebsite: true,
    displayOrder: 9,
    coachId: 'COACH-017',
  },
  'redgits-staff-12': {
    name: 'Mariam Atef',
    specialty: 'Ladies Fitness & Lower Body Sculpt',
    discipline: 'Studio Classes • Personal Training',
    category: 'Studio & Classes',
    bio: 'Specialist in women’s strength training, Peachy lower-body conditioning, and high-energy studio sessions.',
    certifications: ['Certified Personal Trainer', 'Group Studio Specialist', 'Lower Body & Core Conditioning'],
    featuredOnWebsite: true,
    displayOrder: 10,
    coachId: 'COACH-018',
  },
  'redgits-staff-118': {
    name: 'Dr. Melissia Magdy',
    specialty: 'Clinical & Sports Nutrition Doctor',
    discipline: 'Nutrition Clinic • InBody Diagnostics',
    category: 'Allied Health',
    bio: 'Clinical and sports nutrition doctor providing InBody body composition diagnostics and customized performance nutrition plans.',
    certifications: ['Clinical & Sports Nutritionist', 'InBody Body Composition Specialist', 'Metabolic Health'],
    featuredOnWebsite: true,
    displayOrder: 11,
    coachId: 'COACH-019',
  },
  'redgits-staff-130': {
    name: 'Dr. Heba',
    specialty: 'Physiotherapy & Sports Rehabilitation',
    discipline: 'Physiotherapy • Injury Recovery',
    category: 'Allied Health',
    bio: 'Sports physiotherapy and rehabilitation specialist focused on injury recovery, manual therapy, and return-to-play protocols.',
    certifications: ['Doctor of Physiotherapy', 'Sports Injury Rehabilitation', 'Return-to-Play Assessment'],
    featuredOnWebsite: true,
    displayOrder: 12,
    coachId: 'COACH-020',
  },
  'redgits-staff-68': {
    name: 'Nour Amin',
    specialty: 'Functional Training & SGF Coach',
    discipline: 'SGF • Functional Fitness',
    category: 'SGF & Conditioning',
    bio: 'Functional training and group conditioning coach delivering high-energy athletic workouts.',
    certifications: ['Functional Training Coach', 'SGF Specialist'],
    displayOrder: 13,
    coachId: 'COACH-021',
  },
  'redgits-staff-69': {
    name: 'Zeyad Gad',
    specialty: 'Personal Trainer & Hypertrophy',
    discipline: 'Personal Training • Strength',
    category: 'Personal Training',
    bio: '1-on-1 personal trainer specializing in strength mechanics and muscle hypertrophy.',
    certifications: ['Certified Personal Trainer', 'Hypertrophy Specialist'],
    displayOrder: 14,
    coachId: 'COACH-022',
  },
  'redgits-staff-84': {
    name: 'Begad Amr',
    specialty: 'Athletic Performance Coach',
    discipline: 'Personal Training • Conditioning',
    category: 'Personal Training',
    bio: 'Strength and athletic performance trainer focused on explosive power and conditioning.',
    certifications: ['Certified Personal Trainer', 'Athletic Conditioning'],
    displayOrder: 15,
    coachId: 'COACH-023',
  },
  'redgits-staff-112': {
    name: 'Mazen',
    specialty: 'Personal Trainer',
    discipline: 'Personal Training',
    category: 'Personal Training',
    bio: 'Individualized strength and conditioning coach.',
    certifications: ['Certified Personal Trainer'],
    displayOrder: 16,
    coachId: 'COACH-024',
  },
  'redgits-staff-110': {
    name: 'Abdelrahman Jad',
    specialty: 'Personal Trainer',
    discipline: 'Personal Training',
    category: 'Personal Training',
    bio: 'Functional strength and movement coach.',
    certifications: ['Certified Personal Trainer'],
    displayOrder: 17,
    coachId: 'COACH-025',
  },
  'redgits-staff-104': {
    name: 'Farida Hosny',
    specialty: 'Flexibility & Mobility Coach',
    discipline: 'Flexibility • Studio Classes',
    category: 'Studio & Classes',
    bio: 'Flexibility, mobility flow, and active recovery coach.',
    certifications: ['Flexibility & Mobility Specialist'],
    displayOrder: 18,
    coachId: 'COACH-026',
  },
  'redgits-staff-107': {
    name: 'Farida Nabil',
    specialty: 'Studio & Group Conditioning Coach',
    discipline: 'Studio Classes',
    category: 'Studio & Classes',
    bio: 'Group studio and conditioning instructor.',
    certifications: ['Group Fitness Specialist'],
    displayOrder: 19,
    coachId: 'COACH-027',
  },
  'redgits-staff-120': {
    name: 'Haya Khaled',
    specialty: 'Gymnastics & Youth Coach',
    discipline: 'Gymnastics Academy',
    category: 'Calisthenics & Gymnastics',
    bio: 'Youth gymnastics and movement development coach.',
    certifications: ['Gymnastics Coach'],
    displayOrder: 20,
    coachId: 'COACH-028',
  },
  'redgits-staff-121': {
    name: 'Sarah Maghawry',
    specialty: 'Studio & Conditioning Coach',
    discipline: 'Studio Classes',
    category: 'Studio & Classes',
    bio: 'High-energy studio and toning instructor.',
    certifications: ['Studio Fitness Coach'],
    displayOrder: 21,
    coachId: 'COACH-029',
  },
  'redgits-staff-138': {
    name: 'Christine Sonia',
    specialty: 'Personal Trainer & Studio Coach',
    discipline: 'Personal Training • Classes',
    category: 'Studio & Classes',
    bio: 'Personal trainer and group studio coach.',
    certifications: ['Certified Personal Trainer'],
    displayOrder: 22,
    coachId: 'COACH-030',
  },
  'redgits-staff-143': {
    name: 'Nada Khayal',
    specialty: 'Personal Trainer',
    discipline: 'Personal Training',
    category: 'Personal Training',
    bio: 'Strength and personal fitness coach.',
    certifications: ['Certified Personal Trainer'],
    displayOrder: 23,
    coachId: 'COACH-031',
  },
  'redgits-staff-146': {
    name: 'Carol Hany',
    specialty: 'Personal Trainer',
    discipline: 'Personal Training',
    category: 'Personal Training',
    bio: 'Personal trainer and conditioning specialist.',
    certifications: ['Certified Personal Trainer'],
    displayOrder: 24,
    coachId: 'COACH-032',
  },
  'redgits-staff-147': {
    name: 'Sabina',
    specialty: 'Gymnastics & Ballet Coach',
    discipline: 'Ballet • Gymnastics Academy',
    category: 'Calisthenics & Gymnastics',
    bio: 'Ballet, posture, and artistic movement instructor.',
    certifications: ['Ballet & Movement Specialist'],
    displayOrder: 25,
    coachId: 'COACH-033',
  },
  'k90ABBVmNYY4yLZWyUYV': {
    name: 'Semary Coach',
    specialty: 'Performance & Strength Coach',
    discipline: 'Personal Training',
    category: 'Personal Training',
    bio: 'Strength and conditioning coach at Inzan Athletics.',
    certifications: ['Certified Personal Trainer'],
    displayOrder: 26,
    coachId: 'COACH-006',
    userId: 'YFpfGPZrujVH4Jtx9ua5FdOrmhL2',
  },
};

async function main() {
  console.log('1. Syncing coaches in db-inzanathletics...');
  const coachSnap = await db.collection('coaches').get();
  const batch = db.batch();
  let deletedCount = 0;
  let updatedCount = 0;

  for (const docSnap of coachSnap.docs) {
    const id = docSnap.id;
    const meta = REAL_INZAN_COACHES[id];
    if (meta) {
      batch.set(docSnap.ref, {
        name: meta.name,
        active: true,
        status: 'Active',
        specialty: meta.specialty,
        discipline: meta.discipline,
        category: meta.category,
        bio: meta.bio,
        certifications: meta.certifications,
        isFitnessManager: Boolean(meta.isFitnessManager),
        featuredOnWebsite: Boolean(meta.featuredOnWebsite),
        displayOrder: meta.displayOrder || 99,
        ...(meta.coachId ? { coachId: meta.coachId } : {}),
        ...(meta.userId ? { userId: meta.userId } : {}),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      updatedCount++;
    } else {
      // Remove non-coaching RedGITS staff (Receptionists, SalesMen, Black-List, Transfer, CEO, GM) & dummy test coaches from coaches collection
      batch.delete(docSnap.ref);
      deletedCount++;
    }
  }

  await batch.commit();
  console.log(`Updated ${updatedCount} real Inzan coaches, removed ${deletedCount} non-coach/test entries.`);

  // Also ensure Ahmed Tarek and Beezo have isFitnessManager: true on their user docs
  await db.collection('users').doc('dKnpr7KiHdaK0ylsUd9ohqIzVJ72').set({
    isFitnessManager: true,
    jobTitle: 'Fitness Manager',
    department: 'Fitness',
    coachId: 'COACH-011',
  }, { merge: true });
  await db.collection('users').doc('2FhKL2cfyuMSKtxj4bztPpd5I6y2').set({
    isFitnessManager: true,
    jobTitle: 'Fitness Manager',
    department: 'Fitness',
    coachId: 'COACH-010',
  }, { merge: true });

  console.log('2. Syncing real Inzan classSchedules in db-inzanathletics...');
  const schedSnap = await db.collection('classSchedules').get();
  const schedBatch = db.batch();
  for (const docSnap of schedSnap.docs) {
    const data = docSnap.data();
    if (
      docSnap.id.startsWith('demo_') ||
      (data.name && ['test', 'TEST'].includes(String(data.name).trim()))
    ) {
      schedBatch.delete(docSnap.ref);
    }
  }

  // Seed weekly recurring schedule entries for the current & upcoming 14 days + weekly template metadata
  const weeklyTemplate = [
    { day: 'saturday', time: '09:00 AM', startHour: '09:00', endHour: '10:00', name: 'SGF Morning Engine', category: 'SGF', coachName: 'Ahmed Ezzat', level: 'All Levels', spotsTotal: 15, spotsLeft: 4, duration: '60 Min' },
    { day: 'saturday', time: '11:00 AM', startHour: '11:00', endHour: '12:00', name: 'Gymnastics Foundations', category: 'Gymnastics', coachName: 'Heidi El Hariri', level: 'All Levels', spotsTotal: 12, spotsLeft: 3, duration: '60 Min' },
    { day: 'saturday', time: '01:00 PM', startHour: '13:00', endHour: '14:00', name: 'Youth Athletic Academy', category: 'Youth', coachName: 'Kogy', level: 'Under 16', spotsTotal: 16, spotsLeft: 5, duration: '60 Min' },
    { day: 'saturday', time: '05:00 PM', startHour: '17:00', endHour: '18:00', name: 'Calisthenics & Bar Mastery', category: 'Calisthenics', coachName: 'Kareem Awny', level: 'Intermediate', spotsTotal: 12, spotsLeft: 2, duration: '60 Min' },
    { day: 'saturday', time: '07:00 PM', startHour: '19:00', endHour: '20:00', name: 'MMA & Combat Conditioning', category: 'MMA', coachName: 'Bassem Youssef', level: 'All Levels', spotsTotal: 16, spotsLeft: 4, duration: '60 Min' },
    { day: 'saturday', time: '08:30 PM', startHour: '20:30', endHour: '21:30', name: 'SGF Night Metcon', category: 'SGF', coachName: 'Ahmed Tarek', level: 'Advanced', spotsTotal: 15, spotsLeft: 3, duration: '60 Min' },

    { day: 'sunday', time: '09:30 AM', startHour: '09:30', endHour: '10:30', name: 'Peachy & Lower Body Sculpt', category: 'Classes', coachName: 'Mariam Atef', level: 'Ladies / All Levels', spotsTotal: 15, spotsLeft: 4, duration: '60 Min' },
    { day: 'sunday', time: '04:30 PM', startHour: '16:30', endHour: '17:30', name: 'Youth Gymnastics Academy', category: 'Gymnastics', coachName: 'Haya Khaled', level: 'Youth', spotsTotal: 14, spotsLeft: 5, duration: '60 Min' },
    { day: 'sunday', time: '06:00 PM', startHour: '18:00', endHour: '19:00', name: 'Strength & Hypertrophy Lab', category: 'Strength & Conditioning', coachName: 'Akram Hammad', level: 'All Levels', spotsTotal: 12, spotsLeft: 2, duration: '60 Min' },
    { day: 'sunday', time: '07:30 PM', startHour: '19:30', endHour: '20:30', name: 'SGF Team Conditioning', category: 'SGF', coachName: 'Beezo', level: 'All Levels', spotsTotal: 16, spotsLeft: 3, duration: '60 Min' },
    { day: 'sunday', time: '08:30 PM', startHour: '20:30', endHour: '21:30', name: 'Flexibility & Mobility Flow', category: 'Classes', coachName: 'Farida Hosny', level: 'All Levels', spotsTotal: 15, spotsLeft: 6, duration: '60 Min' },

    { day: 'monday', time: '09:00 AM', startHour: '09:00', endHour: '10:00', name: 'SGF Athletic Conditioning', category: 'SGF', coachName: 'Ahmed Ezzat', level: 'All Levels', spotsTotal: 15, spotsLeft: 5, duration: '60 Min' },
    { day: 'monday', time: '05:00 PM', startHour: '17:00', endHour: '18:00', name: 'Calisthenics Strength', category: 'Calisthenics', coachName: 'Kareem Awny', level: 'All Levels', spotsTotal: 12, spotsLeft: 4, duration: '60 Min' },
    { day: 'monday', time: '06:30 PM', startHour: '18:30', endHour: '19:30', name: 'MMA Striking & Conditioning', category: 'MMA', coachName: 'Bassem Youssef', level: 'All Levels', spotsTotal: 16, spotsLeft: 3, duration: '60 Min' },
    { day: 'monday', time: '08:00 PM', startHour: '20:00', endHour: '21:00', name: 'SGF High-Output Intervals', category: 'SGF', coachName: 'Nour Amin', level: 'All Levels', spotsTotal: 15, spotsLeft: 2, duration: '60 Min' },

    { day: 'tuesday', time: '10:00 AM', startHour: '10:00', endHour: '11:00', name: 'Peachy Lower Body & Core', category: 'Classes', coachName: 'Mariam Atef', level: 'All Levels', spotsTotal: 15, spotsLeft: 3, duration: '60 Min' },
    { day: 'tuesday', time: '04:30 PM', startHour: '16:30', endHour: '17:30', name: 'Youth Performance PT Group', category: 'Youth', coachName: 'Kogy', level: 'Under 16', spotsTotal: 14, spotsLeft: 4, duration: '60 Min' },
    { day: 'tuesday', time: '06:30 PM', startHour: '18:30', endHour: '19:30', name: 'Adult Gymnastics & Handstands', category: 'Gymnastics', coachName: 'Heidi El Hariri', level: 'All Levels', spotsTotal: 12, spotsLeft: 3, duration: '60 Min' },
    { day: 'tuesday', time: '08:00 PM', startHour: '20:00', endHour: '21:00', name: 'Strength & Power Conditioning', category: 'Strength & Conditioning', coachName: 'Ahmed Tarek', level: 'All Levels', spotsTotal: 14, spotsLeft: 2, duration: '60 Min' },

    { day: 'wednesday', time: '09:00 AM', startHour: '09:00', endHour: '10:00', name: 'SGF Morning Engine', category: 'SGF', coachName: 'Ahmed Ezzat', level: 'All Levels', spotsTotal: 15, spotsLeft: 5, duration: '60 Min' },
    { day: 'wednesday', time: '05:30 PM', startHour: '17:30', endHour: '18:30', name: 'Calisthenics & Core', category: 'Calisthenics', coachName: 'Kareem Awny', level: 'All Levels', spotsTotal: 12, spotsLeft: 3, duration: '60 Min' },
    { day: 'wednesday', time: '07:00 PM', startHour: '19:00', endHour: '20:00', name: 'MMA Academy Session', category: 'MMA', coachName: 'Bassem Youssef', level: 'All Levels', spotsTotal: 16, spotsLeft: 4, duration: '60 Min' },
    { day: 'wednesday', time: '08:30 PM', startHour: '20:30', endHour: '21:30', name: 'Group PT Performance Lab', category: 'Strength & Conditioning', coachName: 'Beezo', level: 'All Levels', spotsTotal: 15, spotsLeft: 2, duration: '60 Min' },

    { day: 'thursday', time: '10:00 AM', startHour: '10:00', endHour: '11:00', name: 'Flexibility & Recovery Flow', category: 'Classes', coachName: 'Farida Hosny', level: 'All Levels', spotsTotal: 15, spotsLeft: 5, duration: '60 Min' },
    { day: 'thursday', time: '05:00 PM', startHour: '17:00', endHour: '18:00', name: 'Youth Gymnastics & Ballet', category: 'Gymnastics', coachName: 'Sabina', level: 'Youth', spotsTotal: 14, spotsLeft: 4, duration: '60 Min' },
    { day: 'thursday', time: '06:30 PM', startHour: '18:30', endHour: '19:30', name: 'Strength & Hypertrophy Lab', category: 'Strength & Conditioning', coachName: 'Akram Hammad', level: 'All Levels', spotsTotal: 14, spotsLeft: 3, duration: '60 Min' },
    { day: 'thursday', time: '08:00 PM', startHour: '20:00', endHour: '21:00', name: 'SGF Thursday Gauntlet', category: 'SGF', coachName: 'Ahmed Tarek', level: 'All Levels', spotsTotal: 16, spotsLeft: 1, duration: '60 Min' },

    { day: 'friday', time: '10:30 AM', startHour: '10:30', endHour: '11:30', name: 'Friday Community SGF Team WOD', category: 'SGF', coachName: 'Beezo', level: 'All Levels', spotsTotal: 20, spotsLeft: 5, duration: '60 Min' },
    { day: 'friday', time: '12:00 PM', startHour: '12:00', endHour: '13:00', name: 'Open Calisthenics & Gymnastics Jam', category: 'Calisthenics', coachName: 'Kareem Awny', level: 'All Levels', spotsTotal: 15, spotsLeft: 6, duration: '60 Min' },
    { day: 'friday', time: '04:00 PM', startHour: '16:00', endHour: '17:00', name: 'Active Recovery & Mobility', category: 'Classes', coachName: 'Heidi El Hariri', level: 'All Levels', spotsTotal: 15, spotsLeft: 7, duration: '60 Min' },
  ];

  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const today = new Date();
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dow = d.getDay();

    const matchingClasses = weeklyTemplate.filter((item) => dayMap[item.day] === dow);
    matchingClasses.forEach((cls, idx) => {
      const docId = `inzan-sched-${cls.day}-${idx + 1}`;
      const ref = db.collection('classSchedules').doc(docId);
      schedBatch.set(ref, {
        name: cls.name,
        title: cls.name,
        category: cls.category,
        type: 'Class',
        day: cls.day,
        date: dateStr,
        time: `${cls.startHour} - ${cls.endHour}`,
        displayTime: cls.time,
        startTime: `${dateStr}T${cls.startHour}:00`,
        endTime: `${dateStr}T${cls.endHour}:00`,
        coachName: cls.coachName,
        instructorName: cls.coachName,
        branch: 'Garden 8',
        capacity: cls.spotsTotal,
        spotsLeft: cls.spotsLeft,
        level: cls.level,
        duration: cls.duration,
        tier: 'All Tiers',
        allowedTiers: ['All Tiers', 'Adults', 'Youth'],
        status: 'active',
        price: 0,
        attendees: [],
        waitlist: [],
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
  }

  await schedBatch.commit();
  console.log('Seeded 30 live Inzan classSchedules across all 7 days of the week.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
