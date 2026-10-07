import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'faa-test-guide-v2' });
}

const db = getFirestore('db-inzanathletics');

const INZAN_PACKAGES = [
  {
    name: 'Basic Membership',
    price: 37500,
    sessions: 365,
    expiryDays: 365,
    branch: 'ALL',
    category: 'Membership',
    type: 'Group',
    isActive: true,
    is_active: true
  },
  {
    name: 'Premium Membership',
    price: 40625,
    sessions: 365,
    expiryDays: 365,
    branch: 'ALL',
    category: 'Membership',
    type: 'Group',
    isActive: true,
    is_active: true
  },
  {
    name: 'Morning Membership',
    price: 9500,
    sessions: 90,
    expiryDays: 90,
    branch: 'ALL',
    category: 'Membership',
    type: 'Group',
    isActive: true,
    is_active: true
  },
  {
    name: 'Student Membership',
    price: 18000,
    sessions: 180,
    expiryDays: 180,
    branch: 'ALL',
    category: 'Membership',
    type: 'Group',
    isActive: true,
    is_active: true
  },
  {
    name: '6 Months Membership',
    price: 20300,
    sessions: 180,
    expiryDays: 180,
    branch: 'ALL',
    category: 'Membership',
    type: 'Group',
    isActive: true,
    is_active: true
  },
  {
    name: 'PT 1-on-1 (12 Sessions)',
    price: 6000,
    sessions: 12,
    expiryDays: 60,
    branch: 'ALL',
    category: 'Personal Training',
    type: 'Private',
    isActive: true,
    is_active: true
  },
  {
    name: 'PT 1-on-1 (24 Sessions)',
    price: 11000,
    sessions: 24,
    expiryDays: 90,
    branch: 'ALL',
    category: 'Personal Training',
    type: 'Private',
    isActive: true,
    is_active: true
  },
  {
    name: 'SGF Academy',
    price: 4500,
    sessions: 12,
    expiryDays: 30,
    branch: 'ALL',
    category: 'SGF',
    type: 'Group',
    isActive: true,
    is_active: true
  },
  {
    name: 'MMA Academy',
    price: 4000,
    sessions: 12,
    expiryDays: 30,
    branch: 'ALL',
    category: 'Classes',
    type: 'Group',
    isActive: true,
    is_active: true
  },
  {
    name: 'Gymnastics Academy',
    price: 3500,
    sessions: 12,
    expiryDays: 30,
    branch: 'ALL',
    category: 'Gymnastics',
    type: 'Group',
    isActive: true,
    is_active: true
  },
  {
    name: 'Nutrition Plan',
    price: 2500,
    sessions: 1,
    expiryDays: 60,
    branch: 'ALL',
    category: 'Nutrition',
    type: 'Other',
    isActive: true,
    is_active: true
  },
  {
    name: 'Physiotherapy Session',
    price: 1200,
    sessions: 1,
    expiryDays: 30,
    branch: 'ALL',
    category: 'Physiotherapy',
    type: 'Private',
    isActive: true,
    is_active: true
  },
  {
    name: 'Complimentary Trial',
    price: 0,
    sessions: 1,
    expiryDays: 7,
    branch: 'ALL',
    category: 'Complimentary',
    type: 'Other',
    isActive: true,
    is_active: true
  }
];

async function main() {
  console.log('1. Updating Nour permissions in db-inzanathletics...');
  await db.collection('users').doc('n8JimhK2uUN5HQEX2kZ6NOKrbrz2').set({
    can_access_settings_and_history: true,
    can_view_global_dashboard: true,
    jobTitle: 'Admin',
    permissionTemplateId: 'sys-general-manager',
    customPermissions: {
      'packages.view': true,
      'packages.create': true,
      'packages.edit': true,
      'packages.delete': true,
      'settings.access': true,
      'members.view': true,
      'members.create': true,
      'members.manage_packages': true,
      'payments.view': true,
      'payments.create': true,
      'dashboard.view': true,
      'dashboard.view_global': true
    }
  }, { merge: true });
  console.log('Nour updated successfully!');

  console.log('\n2. Seeding / updating packages in db-inzanathletics...');
  // Check existing packages
  const existingSnap = await db.collection('packages').get();
  const existingByName = new Map<string, string>();
  existingSnap.forEach(d => {
    existingByName.set(d.data().name?.toLowerCase().trim(), d.id);
  });

  for (const pkg of INZAN_PACKAGES) {
    const existingId = existingByName.get(pkg.name.toLowerCase().trim());
    if (existingId) {
      console.log(`Updating existing package [${existingId}]: ${pkg.name} -> ${pkg.price} LE`);
      await db.collection('packages').doc(existingId).set(pkg, { merge: true });
    } else {
      const newDoc = db.collection('packages').doc();
      console.log(`Creating package [${newDoc.id}]: ${pkg.name} -> ${pkg.price} LE`);
      await newDoc.set({ id: newDoc.id, ...pkg });
    }
  }

  console.log('\nAll packages seeded successfully!');
}

main().catch(console.error);
