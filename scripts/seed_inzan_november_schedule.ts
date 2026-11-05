import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'faa-test-guide-v2' });
}

const db = getFirestore('db-inzanathletics');

interface ScheduleTemplateItem {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday
  dayName: string;
  name: string;
  coachName: string;
  instructorId: string;
  startTime: string; // HH:mm (24hr)
  endTime: string;   // HH:mm (24hr)
  category: string;
  capacity: number;
  isFreeEligible: boolean;
  notes?: string;
}

const NOVEMBER_SCHEDULE_TEMPLATE: ScheduleTemplateItem[] = [
  // SUNDAY
  {
    dayOfWeek: 0,
    dayName: 'Sunday',
    name: 'Adult Gymnastics',
    coachName: 'Sarah Maghawry',
    instructorId: 'redgits-staff-121',
    startTime: '20:00',
    endTime: '21:00',
    category: 'Gymnastics',
    capacity: 15,
    isFreeEligible: false,
  },
  {
    dayOfWeek: 0,
    dayName: 'Sunday',
    name: 'Mat Pilates',
    coachName: 'Nada Khayal',
    instructorId: 'redgits-staff-143',
    startTime: '20:30',
    endTime: '21:30',
    category: 'Pilates',
    capacity: 15,
    isFreeEligible: true, // + FOR FREE CLASS
    notes: 'Free class eligible (+)',
  },

  // MONDAY
  {
    dayOfWeek: 1,
    dayName: 'Monday',
    name: 'Pre Gymnastics [3-6]',
    coachName: 'Sarah Maghawry',
    instructorId: 'redgits-staff-121',
    startTime: '16:00',
    endTime: '17:00',
    category: 'Kids Gymnastics',
    capacity: 12,
    isFreeEligible: false,
    notes: 'Ages 3-6',
  },
  {
    dayOfWeek: 1,
    dayName: 'Monday',
    name: 'Kids Gymnastics [6-12]',
    coachName: 'Sarah Maghawry',
    instructorId: 'redgits-staff-121',
    startTime: '18:00',
    endTime: '19:00',
    category: 'Kids Gymnastics',
    capacity: 14,
    isFreeEligible: false,
    notes: 'Ages 6-12',
  },
  {
    dayOfWeek: 1,
    dayName: 'Monday',
    name: 'Splits',
    coachName: 'Karim Awny',
    instructorId: 'redgits-staff-94',
    startTime: '19:30',
    endTime: '20:30',
    category: 'Flexibility & Calisthenics',
    capacity: 15,
    isFreeEligible: true, // + FOR FREE CLASS
    notes: 'Free class eligible (+)',
  },
  {
    dayOfWeek: 1,
    dayName: 'Monday',
    name: 'Power Yoga',
    coachName: 'Farida Hosny',
    instructorId: 'redgits-staff-104',
    startTime: '21:00',
    endTime: '22:00',
    category: 'Yoga & Flexibility',
    capacity: 15,
    isFreeEligible: true, // + FOR FREE CLASS
    notes: 'Free class eligible (+)',
  },

  // TUESDAY
  {
    dayOfWeek: 2,
    dayName: 'Tuesday',
    name: 'Adult Gymnastics',
    coachName: 'Sarah Maghawry',
    instructorId: 'redgits-staff-121',
    startTime: '20:00',
    endTime: '21:00',
    category: 'Gymnastics',
    capacity: 15,
    isFreeEligible: false,
  },
  {
    dayOfWeek: 2,
    dayName: 'Tuesday',
    name: 'Mobility',
    coachName: 'Haya Khaled',
    instructorId: 'redgits-staff-120',
    startTime: '21:00',
    endTime: '22:00',
    category: 'Mobility & Core',
    capacity: 15,
    isFreeEligible: true, // + FOR FREE CLASS
    notes: 'Free class eligible (+)',
  },

  // WEDNESDAY
  {
    dayOfWeek: 3,
    dayName: 'Wednesday',
    name: 'Pre Gymnastics [3-6]',
    coachName: 'Sarah Maghawry',
    instructorId: 'redgits-staff-121',
    startTime: '16:00',
    endTime: '17:00',
    category: 'Kids Gymnastics',
    capacity: 12,
    isFreeEligible: false,
    notes: 'Ages 3-6',
  },
  {
    dayOfWeek: 3,
    dayName: 'Wednesday',
    name: 'Pre Ballet [3-6]',
    coachName: 'Sabina',
    instructorId: 'redgits-staff-147',
    startTime: '16:00',
    endTime: '17:00',
    category: 'Ballet',
    capacity: 12,
    isFreeEligible: false,
    notes: 'Ages 3-6',
  },
  {
    dayOfWeek: 3,
    dayName: 'Wednesday',
    name: 'Kids Gymnastics [6-12]',
    coachName: 'Sarah Maghawry',
    instructorId: 'redgits-staff-121',
    startTime: '18:00',
    endTime: '19:00',
    category: 'Kids Gymnastics',
    capacity: 14,
    isFreeEligible: false,
    notes: 'Ages 6-12',
  },
  {
    dayOfWeek: 3,
    dayName: 'Wednesday',
    name: 'Jumprope',
    coachName: 'Begad Amr',
    instructorId: 'redgits-staff-84',
    startTime: '19:00',
    endTime: '20:00',
    category: 'Cardio Blast',
    capacity: 15,
    isFreeEligible: true, // + FOR FREE CLASS
    notes: 'Free class eligible (+)',
  },
  {
    dayOfWeek: 3,
    dayName: 'Wednesday',
    name: 'Hybrid',
    coachName: 'Haya Khaled',
    instructorId: 'redgits-staff-120',
    startTime: '20:00',
    endTime: '21:00',
    category: 'Cross Training',
    capacity: 15,
    isFreeEligible: true, // + FOR FREE CLASS
    notes: 'Free class eligible (+)',
  },
  {
    dayOfWeek: 3,
    dayName: 'Wednesday',
    name: 'Power Yoga',
    coachName: 'Farida Hosny',
    instructorId: 'redgits-staff-104',
    startTime: '21:00',
    endTime: '22:00',
    category: 'Yoga & Flexibility',
    capacity: 15,
    isFreeEligible: true, // + FOR FREE CLASS
    notes: 'Free class eligible (+)',
  },

  // THURSDAY
  {
    dayOfWeek: 4,
    dayName: 'Thursday',
    name: 'The Balance Yoga Lab',
    coachName: 'Farida Hosny',
    instructorId: 'redgits-staff-104',
    startTime: '19:00',
    endTime: '20:00',
    category: 'Yoga & Flexibility',
    capacity: 15,
    isFreeEligible: true, // + FOR FREE CLASS
    notes: 'Free class eligible (+)',
  },
];

async function seedNovemberSchedule() {
  console.log('Seeding official Inzan Athletics November & December 2026 Schedule...');

  // Dates range: 2026-11-01 through 2026-12-31
  const startDate = new Date(2026, 10, 1); // Month 10 is November (0-indexed)
  const endDate = new Date(2026, 11, 31);   // Month 11 is December

  let current = new Date(startDate);
  let batch = db.batch();
  let batchOps = 0;
  let totalCreated = 0;

  while (current <= endDate) {
    const dayOfWeek = current.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const yearStr = current.getFullYear();
    const monthStr = String(current.getMonth() + 1).padStart(2, '0');
    const dayStr = String(current.getDate()).padStart(2, '0');
    const dateStr = `${yearStr}-${monthStr}-${dayStr}`;

    const matchingTemplates = NOVEMBER_SCHEDULE_TEMPLATE.filter(t => t.dayOfWeek === dayOfWeek);

    for (const tpl of matchingTemplates) {
      const startIso = `${dateStr}T${tpl.startTime}:00`;
      const endIso = `${dateStr}T${tpl.endTime}:00`;
      const timeFormatted = `${tpl.startTime} - ${tpl.endTime}`;
      
      const docSlug = `${tpl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${tpl.startTime.replace(':', '')}`;
      const docId = `inzan-sched-${dateStr}-${docSlug}`;

      const classDocRef = db.collection('classSchedules').doc(docId);

      batch.set(classDocRef, {
        id: docId,
        name: tpl.name,
        coachName: tpl.coachName,
        instructorName: tpl.coachName,
        instructorId: tpl.instructorId,
        date: dateStr,
        time: timeFormatted,
        startTime: startIso,
        endTime: endIso,
        category: tpl.category,
        capacity: tpl.capacity,
        price: 0,
        classType: 'Class',
        type: 'Class',
        branch: 'Main Branch',
        branch_id: 'main',
        status: 'active',
        isFreeEligible: tpl.isFreeEligible,
        notes: tpl.notes || '',
        description: `${tpl.name} with Coach ${tpl.coachName}${tpl.isFreeEligible ? ' • Eligible for Free Class Trial (+)' : ''}`,
        attendees: [],
        waitlist: [],
        checkedIn: [],
        noShows: [],
        noShowsProcessed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      batchOps++;
      totalCreated++;

      if (batchOps >= 400) {
        await batch.commit();
        console.log(`Committed batch of ${batchOps} schedule sessions...`);
        batch = db.batch();
        batchOps = 0;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  if (batchOps > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchOps} schedule sessions.`);
  }

  console.log(`Successfully seeded ${totalCreated} schedule sessions across November and December 2026!`);

  // Also seed Partnerships into corporate deals / promotions so reception and members see them:
  console.log('Seeding Inzan Partnerships (CIB Wealth 10% & Padel 8 10%)...');
  const promoBatch = db.batch();

  const cibRef = db.collection('corporateDeals').doc('inzan-cib-wealth');
  promoBatch.set(cibRef, {
    id: 'inzan-cib-wealth',
    title: 'Inzan Athletics x CIB WEALTH',
    companyName: 'CIB Wealth',
    discountPercentage: 10,
    dealType: 'partnership_card',
    description: 'Pay your membership with your CIB Wealth Card and get 10% off.',
    terms: 'Valid on annual and seasonal memberships paid with eligible CIB Wealth cards.',
    badgeText: '10% CIB WEALTH',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  const padelRef = db.collection('corporateDeals').doc('inzan-padel-8');
  promoBatch.set(padelRef, {
    id: 'inzan-padel-8',
    title: 'PADEL 8 x Inzan Athletics',
    companyName: 'Padel 8',
    discountPercentage: 10,
    dealType: 'partner_benefit',
    description: 'Exclusive 10% discount at Padel 8 for Inzan Athletics annual membership holders.',
    terms: 'Present your active Inzan Athletics annual membership card at Padel 8 courts.',
    badgeText: '10% PADEL 8',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  await promoBatch.commit();
  console.log('Successfully seeded Inzan partnerships!');
}

seedNovemberSchedule()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error seeding schedule:', err);
    process.exit(1);
  });
