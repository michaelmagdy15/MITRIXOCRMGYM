import 'dotenv/config';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { pool, query } from './db.js';
import fs from 'fs';
import path from 'path';

// Initialize Firebase Admin SDK
const serviceAccountPath = './service-account.json';
if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')))
  });
} else {
  // Use ADC or default project config
  const defaultConfigPath = './firebase-applet-config.json';
  let defaultProjectId = 'faa-test-guide-v2';
  if (fs.existsSync(defaultConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
      if (config.projectId) {
        defaultProjectId = config.projectId;
      }
    } catch (e) {}
  }
  admin.initializeApp({
    projectId: defaultProjectId
  });
}

// Inzan Firestore Database
const firestoreDb = getFirestore('db-inzanathletics');

async function runSchema() {
  console.log('[Migration] Applying SQL Schema DDL to CockroachDB...');
  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  const ddl = fs.readFileSync(schemaPath, 'utf8');
  
  // Split DDL by semicolon to run queries
  const statements = ddl
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      await query(statement);
    } catch (err: any) {
      console.error(`[Migration] Error running DDL statement: ${err.message}`);
      throw err;
    }
  }
  console.log('[Migration] DDL Schema applied successfully!');
}

async function migratePackages() {
  console.log('[Migration] Fetching packages from Firestore...');
  const snap = await firestoreDb.collection('packages').get();
  console.log(`[Migration] Found ${snap.size} packages. Migrating...`);

  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    await query(
      `INSERT INTO packages (id, name, price, sessions, expiry_days, branch, type, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         price = EXCLUDED.price,
         sessions = EXCLUDED.sessions,
         expiry_days = EXCLUDED.expiry_days,
         branch = EXCLUDED.branch,
         type = EXCLUDED.type,
         image_url = EXCLUDED.image_url`,
      [
        doc.id,
        data.name || '',
        data.price || 0,
        data.sessions || 0,
        data.expiryDays || 0,
        data.branch || 'ALL',
        data.type || 'Group',
        data.imageUrl || null
      ]
    );
    count++;
  }
  console.log(`[Migration] Migrated ${count} packages.`);
}

async function migrateCoaches() {
  console.log('[Migration] Fetching coaches from Firestore...');
  const snap = await firestoreDb.collection('coaches').get();
  console.log(`[Migration] Found ${snap.size} coaches. Migrating...`);

  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    await query(
      `INSERT INTO coaches (id, name, active, user_id, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         active = EXCLUDED.active,
         user_id = EXCLUDED.user_id,
         phone = EXCLUDED.phone`,
      [
        doc.id,
        data.name || '',
        data.active !== false,
        data.userId || null,
        data.phone || null
      ]
    );
    count++;
  }
  console.log(`[Migration] Migrated ${count} coaches.`);
}

async function migrateClients(clientsSnap: admin.firestore.QuerySnapshot<admin.firestore.DocumentData>) {
  console.log('[Migration] Fetching comments collection group...');
  const commentsSnap = await firestoreDb.collectionGroup('comments').get();
  const commentsMap = new Map<string, any[]>();
  commentsSnap.docs.forEach(doc => {
    const clientId = doc.ref.parent.parent?.id;
    if (clientId) {
      if (!commentsMap.has(clientId)) commentsMap.set(clientId, []);
      commentsMap.get(clientId)!.push({ ...doc.data(), id: doc.id });
    }
  });
  console.log(`[Migration] Loaded comments for ${commentsMap.size} clients.`);

  console.log('[Migration] Fetching interactions collection group...');
  const interactionsSnap = await firestoreDb.collectionGroup('interactions').get();
  const interactionsMap = new Map<string, any[]>();
  interactionsSnap.docs.forEach(doc => {
    const clientId = doc.ref.parent.parent?.id;
    if (clientId) {
      if (!interactionsMap.has(clientId)) interactionsMap.set(clientId, []);
      interactionsMap.get(clientId)!.push({ ...doc.data(), id: doc.id });
    }
  });
  console.log(`[Migration] Loaded interactions for ${interactionsMap.size} clients.`);

  console.log('[Migration] Writing clients to CockroachDB in batches...');
  const docs = clientsSnap.docs;
  const batchSize = 100; // 100 clients per batch because clients table has 39 columns (100 * 39 = 3900 parameters, well within PG limit of 65535)
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const doc of chunk) {
      const data = doc.data();
      const clientId = doc.id;
      const clientComments = commentsMap.get(clientId) || [];
      const clientInteractions = interactionsMap.get(clientId) || [];

      const colPlaceholders: string[] = [];
      for (let c = 0; c < 39; c++) {
        colPlaceholders.push(`$${pIdx + c}`);
      }
      placeholders.push(`(${colPlaceholders.join(', ')})`);

      values.push(
        clientId,
        data.name || '',
        data.phone || '',
        data.status || 'Lead',
        data.memberId || null,
        data.gender || null,
        data.dateOfBirth || null,
        data.salesName || null,
        data.salesRep || null,
        data.packageType || null,
        data.startDate || null,
        data.branch || 'MAIN',
        typeof data.sessionsRemaining === 'number' ? data.sessionsRemaining : null,
        data.assignedTo || null,
        data.createdAt || null,
        data.nationalId || null,
        data.email || null,
        data.backupPhone || null,
        data.isBlacklisted === true,
        data.photoURL || null,
        data.advertisingSource || null,
        data.country || null,
        data.city || null,
        data.address || null,
        data.homePhone || null,
        data.nationality || null,
        data.jobTitle || null,
        data.guestSerial || null,
        data.civilianOrMilitary || null,
        data.referredByName || null,
        data.linkedAccount === true,
        data.linkedClientIds || null,
        data.portalUserId || null,
        data.packages ? JSON.stringify(data.packages) : null,
        JSON.stringify(clientComments),
        JSON.stringify(clientInteractions),
        data.importBatchId || null,
        data.lastContactDate || null,
        data.personalEmail || null
      );
      pIdx += 39;
    }

    if (placeholders.length > 0) {
      const sql = `
        INSERT INTO clients (
          id, name, phone, status, member_id, gender, date_of_birth, sales_name, sales_rep, package_type,
          start_date, branch, sessions_remaining, assigned_to, created_at, national_id, email, backup_phone,
          is_blacklisted, photo_url, advertising_source, country, city, address, home_phone, nationality,
          job_title, guest_serial, civilian_or_military, referred_by_name, linked_account, linked_client_ids,
          portal_user_id, packages, comments, interactions, import_batch_id, last_contact_date, personal_email
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          status = EXCLUDED.status,
          member_id = EXCLUDED.member_id,
          gender = EXCLUDED.gender,
          date_of_birth = EXCLUDED.date_of_birth,
          sales_name = EXCLUDED.sales_name,
          sales_rep = EXCLUDED.sales_rep,
          package_type = EXCLUDED.package_type,
          start_date = EXCLUDED.start_date,
          branch = EXCLUDED.branch,
          sessions_remaining = EXCLUDED.sessions_remaining,
          assigned_to = EXCLUDED.assigned_to,
          created_at = EXCLUDED.created_at,
          national_id = EXCLUDED.national_id,
          email = EXCLUDED.email,
          backup_phone = EXCLUDED.backup_phone,
          is_blacklisted = EXCLUDED.is_blacklisted,
          photo_url = EXCLUDED.photo_url,
          advertising_source = EXCLUDED.advertising_source,
          country = EXCLUDED.country,
          city = EXCLUDED.city,
          address = EXCLUDED.address,
          home_phone = EXCLUDED.home_phone,
          nationality = EXCLUDED.nationality,
          job_title = EXCLUDED.job_title,
          guest_serial = EXCLUDED.guest_serial,
          civilian_or_military = EXCLUDED.civilian_or_military,
          referred_by_name = EXCLUDED.referred_by_name,
          linked_account = EXCLUDED.linked_account,
          linked_client_ids = EXCLUDED.linked_client_ids,
          portal_user_id = EXCLUDED.portal_user_id,
          packages = EXCLUDED.packages,
          comments = EXCLUDED.comments,
          interactions = EXCLUDED.interactions,
          import_batch_id = EXCLUDED.import_batch_id,
          last_contact_date = EXCLUDED.last_contact_date,
          personal_email = EXCLUDED.personal_email`;
      
      try {
        await query(sql, values);
        count += chunk.length;
        console.log(`[Migration] Migrated ${count}/${docs.length} clients...`);
      } catch (err: any) {
        console.error(`[Migration] Failed to migrate client batch starting at index ${i}:`, err.message);
        // Fallback to individual insert for safety
        for (const doc of chunk) {
          const data = doc.data();
          const clientId = doc.id;
          const clientComments = commentsMap.get(clientId) || [];
          const clientInteractions = interactionsMap.get(clientId) || [];
          try {
            await query(
              `INSERT INTO clients (
                id, name, phone, status, member_id, gender, date_of_birth, sales_name, sales_rep, package_type,
                start_date, branch, sessions_remaining, assigned_to, created_at, national_id, email, backup_phone,
                is_blacklisted, photo_url, advertising_source, country, city, address, home_phone, nationality,
                job_title, guest_serial, civilian_or_military, referred_by_name, linked_account, linked_client_ids,
                portal_user_id, packages, comments, interactions, import_batch_id, last_contact_date, personal_email
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18,
                $19, $20, $21, $22, $23, $24, $25, $26,
                $27, $28, $29, $30, $31, $32,
                $33, $34, $35, $36, $37, $38, $39
              ) ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                phone = EXCLUDED.phone,
                status = EXCLUDED.status,
                member_id = EXCLUDED.member_id,
                gender = EXCLUDED.gender,
                date_of_birth = EXCLUDED.date_of_birth,
                sales_name = EXCLUDED.sales_name,
                sales_rep = EXCLUDED.sales_rep,
                package_type = EXCLUDED.package_type,
                start_date = EXCLUDED.start_date,
                branch = EXCLUDED.branch,
                sessions_remaining = EXCLUDED.sessions_remaining,
                assigned_to = EXCLUDED.assigned_to,
                created_at = EXCLUDED.created_at,
                national_id = EXCLUDED.national_id,
                email = EXCLUDED.email,
                backup_phone = EXCLUDED.backup_phone,
                is_blacklisted = EXCLUDED.is_blacklisted,
                photo_url = EXCLUDED.photo_url,
                advertising_source = EXCLUDED.advertising_source,
                country = EXCLUDED.country,
                city = EXCLUDED.city,
                address = EXCLUDED.address,
                home_phone = EXCLUDED.home_phone,
                nationality = EXCLUDED.nationality,
                job_title = EXCLUDED.job_title,
                guest_serial = EXCLUDED.guest_serial,
                civilian_or_military = EXCLUDED.civilian_or_military,
                referred_by_name = EXCLUDED.referred_by_name,
                linked_account = EXCLUDED.linked_account,
                linked_client_ids = EXCLUDED.linked_client_ids,
                portal_user_id = EXCLUDED.portal_user_id,
                packages = EXCLUDED.packages,
                comments = EXCLUDED.comments,
                interactions = EXCLUDED.interactions,
                import_batch_id = EXCLUDED.import_batch_id,
                last_contact_date = EXCLUDED.last_contact_date,
                personal_email = EXCLUDED.personal_email`,
              [
                clientId,
                data.name || '',
                data.phone || '',
                data.status || 'Lead',
                data.memberId || null,
                data.gender || null,
                data.dateOfBirth || null,
                data.salesName || null,
                data.salesRep || null,
                data.packageType || null,
                data.startDate || null,
                data.branch || 'MAIN',
                typeof data.sessionsRemaining === 'number' ? data.sessionsRemaining : null,
                data.assignedTo || null,
                data.createdAt || null,
                data.nationalId || null,
                data.email || null,
                data.backupPhone || null,
                data.isBlacklisted === true,
                data.photoURL || null,
                data.advertisingSource || null,
                data.country || null,
                data.city || null,
                data.address || null,
                data.homePhone || null,
                data.nationality || null,
                data.jobTitle || null,
                data.guestSerial || null,
                data.civilianOrMilitary || null,
                data.referredByName || null,
                data.linkedAccount === true,
                data.linkedClientIds || null,
                data.portalUserId || null,
                data.packages ? JSON.stringify(data.packages) : null,
                JSON.stringify(clientComments),
                JSON.stringify(clientInteractions),
                data.importBatchId || null,
                data.lastContactDate || null,
                data.personalEmail || null
              ]
            );
            count++;
          } catch (e: any) {
            console.warn(`[Migration] Failed to migrate individual client ${clientId}: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`[Migration] Completed clients migration. Total: ${count}`);
}

async function migratePayments(validClientIds: Set<string>) {
  console.log('[Migration] Fetching payments from Firestore...');
  const snap = await firestoreDb.collection('payments').get();
  console.log(`[Migration] Found ${snap.size} payments. Filtering orphans...`);

  const docs = snap.docs.filter(doc => {
    const cid = doc.data().clientId;
    return cid && validClientIds.has(cid);
  });
  console.log(`[Migration] Found ${docs.length} valid payments to migrate. Orphans skipped: ${snap.size - docs.length}`);

  const batchSize = 500; // 500 * 16 = 8000 parameters
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const doc of chunk) {
      const data = doc.data();
      placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6}, $${pIdx + 7}, $${pIdx + 8}, $${pIdx + 9}, $${pIdx + 10}, $${pIdx + 11}, $${pIdx + 12}, $${pIdx + 13}, $${pIdx + 14}, $${pIdx + 15})`);
      
      values.push(
        doc.id,
        data.clientId || null,
        data.client_name || null,
        data.amount || 0,
        data.amount_paid || 0,
        data.discountValue || 0,
        data.method || null,
        data.notes || null,
        data.currency || 'L.E.',
        data.receiptSerial || null,
        data.sales_rep_id || null,
        data.packageType || null,
        data.package_category_type || null,
        data.created_at || null,
        data.deleted_at || null,
        data.date || null
      );
      pIdx += 16;
    }

    if (placeholders.length > 0) {
      const sql = `
        INSERT INTO payments (
          id, client_id, client_name, amount, amount_paid, discount_value, method, notes,
          currency, receipt_serial, sales_rep_id, package_type, package_category_type,
          created_at, deleted_at, date
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          client_id = EXCLUDED.client_id,
          client_name = EXCLUDED.client_name,
          amount = EXCLUDED.amount,
          amount_paid = EXCLUDED.amount_paid,
          discount_value = EXCLUDED.discount_value,
          method = EXCLUDED.method,
          notes = EXCLUDED.notes,
          currency = EXCLUDED.currency,
          receipt_serial = EXCLUDED.receipt_serial,
          sales_rep_id = EXCLUDED.sales_rep_id,
          package_type = EXCLUDED.package_type,
          package_category_type = EXCLUDED.package_category_type,
          created_at = EXCLUDED.created_at,
          deleted_at = EXCLUDED.deleted_at,
          date = EXCLUDED.date`;

      try {
        await query(sql, values);
        count += chunk.length;
        console.log(`[Migration] Migrated ${count}/${docs.length} payments...`);
      } catch (err: any) {
        console.error(`[Migration] Failed to migrate payment batch starting at ${i}:`, err.message);
        // Fallback
        for (const doc of chunk) {
          const data = doc.data();
          try {
            await query(
              `INSERT INTO payments (
                 id, client_id, client_name, amount, amount_paid, discount_value, method, notes,
                 currency, receipt_serial, sales_rep_id, package_type, package_category_type,
                 created_at, deleted_at, date
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
               ON CONFLICT (id) DO UPDATE SET
                 client_id = EXCLUDED.client_id,
                 client_name = EXCLUDED.client_name,
                 amount = EXCLUDED.amount,
                 amount_paid = EXCLUDED.amount_paid,
                 discount_value = EXCLUDED.discount_value,
                 method = EXCLUDED.method,
                 notes = EXCLUDED.notes,
                 currency = EXCLUDED.currency,
                 receipt_serial = EXCLUDED.receipt_serial,
                 sales_rep_id = EXCLUDED.sales_rep_id,
                 package_type = EXCLUDED.package_type,
                 package_category_type = EXCLUDED.package_category_type,
                 created_at = EXCLUDED.created_at,
                 deleted_at = EXCLUDED.deleted_at,
                 date = EXCLUDED.date`,
              [
                doc.id,
                data.clientId || null,
                data.client_name || null,
                data.amount || 0,
                data.amount_paid || 0,
                data.discountValue || 0,
                data.method || null,
                data.notes || null,
                data.currency || 'L.E.',
                data.receiptSerial || null,
                data.sales_rep_id || null,
                data.packageType || null,
                data.package_category_type || null,
                data.created_at || null,
                data.deleted_at || null,
                data.date || null
              ]
            );
            count++;
          } catch (e: any) {
            console.warn(`[Migration] Failed to migrate individual payment ${doc.id}: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`[Migration] Migrated ${count} payments.`);
}

async function migrateAttendance(validClientIds: Set<string>) {
  console.log('[Migration] Fetching attendance from Firestore...');
  const snap = await firestoreDb.collection('attendance').get();
  console.log(`[Migration] Found ${snap.size} attendance records. Filtering orphans...`);

  const docs = snap.docs.filter(doc => {
    const cid = doc.data().clientId;
    return cid && validClientIds.has(cid);
  });
  console.log(`[Migration] Found ${docs.length} valid attendance records. Orphans skipped: ${snap.size - docs.length}`);

  await query('TRUNCATE TABLE attendance');

  const batchSize = 1000; // 1000 * 5 = 5000 parameters
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const doc of chunk) {
      const data = doc.data();
      placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4})`);
      values.push(
        data.clientId || '',
        data.branch || 'MAIN',
        data.date || new Date().toISOString(),
        data.recordedBy || null,
        data.packageName || null
      );
      pIdx += 5;
    }

    if (placeholders.length > 0) {
      const sql = `INSERT INTO attendance (client_id, branch, date, recorded_by, package_name) VALUES ${placeholders.join(', ')}`;
      try {
        await query(sql, values);
        count += chunk.length;
        console.log(`[Migration] Migrated ${count}/${docs.length} attendance records...`);
      } catch (err: any) {
        console.error(`[Migration] Failed to migrate attendance batch starting at ${i}:`, err.message);
        // Fallback
        for (const doc of chunk) {
          const data = doc.data();
          try {
            await query(
              `INSERT INTO attendance (client_id, branch, date, recorded_by, package_name) VALUES ($1, $2, $3, $4, $5)`,
              [
                data.clientId || '',
                data.branch || 'MAIN',
                data.date || new Date().toISOString(),
                data.recordedBy || null,
                data.packageName || null
              ]
            );
            count++;
          } catch (e: any) {
            console.warn(`[Migration] Failed to migrate individual attendance: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`[Migration] Migrated ${count} attendance records.`);
}

async function migrateSessions(validClientIds: Set<string>) {
  console.log('[Migration] Fetching PT sessions from Firestore...');
  const snap = await firestoreDb.collection('sessions').get();
  console.log(`[Migration] Found ${snap.size} PT sessions. Filtering orphans...`);

  const docs = snap.docs.filter(doc => {
    const cid = doc.data().clientId;
    return cid ? validClientIds.has(cid) : true; // Allow sessions without clientId if applicable, but filter mismatching ones
  });
  console.log(`[Migration] Found ${docs.length} sessions to migrate. Orphans skipped: ${snap.size - docs.length}`);

  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const doc of chunk) {
      const data = doc.data();
      placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6}, $${pIdx + 7}, $${pIdx + 8}, $${pIdx + 9}, $${pIdx + 10})`);
      values.push(
        doc.id,
        data.clientId || '',
        data.clientName || null,
        data.coachId || null,
        data.coachName || null,
        data.date || '',
        data.time || '',
        data.status || 'Scheduled',
        data.notes || null,
        data.branch || null,
        data.createdAt || null
      );
      pIdx += 11;
    }

    if (placeholders.length > 0) {
      const sql = `
        INSERT INTO sessions (id, client_id, client_name, coach_id, coach_name, date, time, status, notes, branch, created_at)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          client_id = EXCLUDED.client_id,
          client_name = EXCLUDED.client_name,
          coach_id = EXCLUDED.coach_id,
          coach_name = EXCLUDED.coach_name,
          date = EXCLUDED.date,
          time = EXCLUDED.time,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes,
          branch = EXCLUDED.branch,
          created_at = EXCLUDED.created_at`;
      
      try {
        await query(sql, values);
        count += chunk.length;
        console.log(`[Migration] Migrated ${count}/${docs.length} PT sessions...`);
      } catch (err: any) {
        console.error(`[Migration] Failed to migrate sessions batch starting at ${i}:`, err.message);
        // Fallback
        for (const doc of chunk) {
          const data = doc.data();
          try {
            await query(
              `INSERT INTO sessions (id, client_id, client_name, coach_id, coach_name, date, time, status, notes, branch, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO UPDATE SET
                 client_id = EXCLUDED.client_id,
                 client_name = EXCLUDED.client_name,
                 coach_id = EXCLUDED.coach_id,
                 coach_name = EXCLUDED.coach_name,
                 date = EXCLUDED.date,
                 time = EXCLUDED.time,
                 status = EXCLUDED.status,
                 notes = EXCLUDED.notes,
                 branch = EXCLUDED.branch,
                 created_at = EXCLUDED.created_at`,
              [
                doc.id,
                data.clientId || '',
                data.clientName || null,
                data.coachId || null,
                data.coachName || null,
                data.date || '',
                data.time || '',
                data.status || 'Scheduled',
                data.notes || null,
                data.branch || null,
                data.createdAt || null
              ]
            );
            count++;
          } catch (e: any) {
            console.warn(`[Migration] Failed to migrate individual session: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`[Migration] Migrated ${count} PT sessions.`);
}

async function migrateTasks(validClientIds: Set<string>) {
  console.log('[Migration] Fetching tasks from Firestore...');
  const snap = await firestoreDb.collection('tasks').get();
  console.log(`[Migration] Found ${snap.size} tasks. Filtering orphans...`);

  const docs = snap.docs.filter(doc => {
    const cid = doc.data().clientId;
    return cid ? validClientIds.has(cid) : true;
  });
  console.log(`[Migration] Found ${docs.length} tasks to migrate. Orphans skipped: ${snap.size - docs.length}`);

  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const doc of chunk) {
      const data = doc.data();
      placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6}, $${pIdx + 7}, $${pIdx + 8}, $${pIdx + 9}, $${pIdx + 10})`);
      values.push(
        doc.id,
        data.title || '',
        data.description || null,
        data.status || 'Pending',
        data.dueDate || null,
        data.assignedTo || null,
        data.assignedName || null,
        data.clientId || null,
        data.clientName || null,
        data.createdBy || null,
        data.createdAt || null
      );
      pIdx += 11;
    }

    if (placeholders.length > 0) {
      const sql = `
        INSERT INTO tasks (id, title, description, status, due_date, assigned_to, assigned_name, client_id, client_name, created_by, created_at)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          due_date = EXCLUDED.due_date,
          assigned_to = EXCLUDED.assigned_to,
          assigned_name = EXCLUDED.assigned_name,
          client_id = EXCLUDED.client_id,
          client_name = EXCLUDED.client_name,
          created_by = EXCLUDED.created_by,
          created_at = EXCLUDED.created_at`;
      
      try {
        await query(sql, values);
        count += chunk.length;
        console.log(`[Migration] Migrated ${count}/${docs.length} tasks...`);
      } catch (err: any) {
        console.error(`[Migration] Failed to migrate tasks batch starting at ${i}:`, err.message);
        // Fallback
        for (const doc of chunk) {
          const data = doc.data();
          try {
            await query(
              `INSERT INTO tasks (id, title, description, status, due_date, assigned_to, assigned_name, client_id, client_name, created_by, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO UPDATE SET
                 title = EXCLUDED.title,
                 description = EXCLUDED.description,
                 status = EXCLUDED.status,
                 due_date = EXCLUDED.due_date,
                 assigned_to = EXCLUDED.assigned_to,
                 assigned_name = EXCLUDED.assigned_name,
                 client_id = EXCLUDED.client_id,
                 client_name = EXCLUDED.client_name,
                 created_by = EXCLUDED.created_by,
                 created_at = EXCLUDED.created_at`,
              [
                doc.id,
                data.title || '',
                data.description || null,
                data.status || 'Pending',
                data.dueDate || null,
                data.assignedTo || null,
                data.assignedName || null,
                data.clientId || null,
                data.clientName || null,
                data.createdBy || null,
                data.createdAt || null
              ]
            );
            count++;
          } catch (e: any) {
            console.warn(`[Migration] Failed to migrate individual task: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`[Migration] Migrated ${count} tasks.`);
}

async function migrateImportBatches() {
  console.log('[Migration] Fetching import batches from Firestore...');
  const snap = await firestoreDb.collection('importBatches').get();
  console.log(`[Migration] Found ${snap.size} import batches. Migrating...`);

  const docs = snap.docs;
  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const doc of chunk) {
      const data = doc.data();
      placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6})`);
      values.push(
        doc.id,
        data.date || '',
        data.fileName || '',
        data.importedCount || 0,
        data.failedCount || 0,
        data.errors ? JSON.stringify(data.errors) : null,
        data.status || 'Completed'
      );
      pIdx += 7;
    }

    if (placeholders.length > 0) {
      const sql = `
        INSERT INTO import_batches (id, date, file_name, imported_count, failed_count, errors, status)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          date = EXCLUDED.date,
          file_name = EXCLUDED.file_name,
          imported_count = EXCLUDED.imported_count,
          failed_count = EXCLUDED.failed_count,
          errors = EXCLUDED.errors,
          status = EXCLUDED.status`;
      
      try {
        await query(sql, values);
        count += chunk.length;
        console.log(`[Migration] Migrated ${count}/${docs.length} import batches...`);
      } catch (err: any) {
        console.error(`[Migration] Failed to migrate import batches batch starting at ${i}:`, err.message);
        // Fallback
        for (const doc of chunk) {
          const data = doc.data();
          try {
            await query(
              `INSERT INTO import_batches (id, date, file_name, imported_count, failed_count, errors, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (id) DO UPDATE SET
                 date = EXCLUDED.date,
                 file_name = EXCLUDED.file_name,
                 imported_count = EXCLUDED.imported_count,
                 failed_count = EXCLUDED.failed_count,
                 errors = EXCLUDED.errors,
                 status = EXCLUDED.status`,
              [
                doc.id,
                data.date || '',
                data.fileName || '',
                data.importedCount || 0,
                data.failedCount || 0,
                data.errors ? JSON.stringify(data.errors) : null,
                data.status || 'Completed'
              ]
            );
            count++;
          } catch (e: any) {
            console.warn(`[Migration] Failed to migrate individual import batch: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`[Migration] Migrated ${count} import batches.`);
}

async function migrateUserTargets() {
  console.log('[Migration] Fetching user targets from Firestore...');
  const snap = await firestoreDb.collection('userTargets').get();
  console.log(`[Migration] Found ${snap.size} user targets. Migrating...`);

  const docs = snap.docs;
  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const doc of chunk) {
      const data = doc.data();
      placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5})`);
      values.push(
        doc.id,
        data.userId || '',
        data.userName || '',
        data.amount || 0,
        data.month || '',
        data.year || new Date().getFullYear()
      );
      pIdx += 6;
    }

    if (placeholders.length > 0) {
      const sql = `
        INSERT INTO user_targets (id, user_id, user_name, amount, month, year)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          user_name = EXCLUDED.user_name,
          amount = EXCLUDED.amount,
          month = EXCLUDED.month,
          year = EXCLUDED.year`;
      
      try {
        await query(sql, values);
        count += chunk.length;
        console.log(`[Migration] Migrated ${count}/${docs.length} user targets...`);
      } catch (err: any) {
        console.error(`[Migration] Failed to migrate user targets batch starting at ${i}:`, err.message);
        // Fallback
        for (const doc of chunk) {
          const data = doc.data();
          try {
            await query(
              `INSERT INTO user_targets (id, user_id, user_name, amount, month, year)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO UPDATE SET
                 user_id = EXCLUDED.user_id,
                 user_name = EXCLUDED.user_name,
                 amount = EXCLUDED.amount,
                 month = EXCLUDED.month,
                 year = EXCLUDED.year`,
              [
                doc.id,
                data.userId || '',
                data.userName || '',
                data.amount || 0,
                data.month || '',
                data.year || new Date().getFullYear()
              ]
            );
            count++;
          } catch (e: any) {
            console.warn(`[Migration] Failed to migrate individual user target: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`[Migration] Migrated ${count} user targets.`);
}

async function migrateAuditLogs() {
  console.log('[Migration] Fetching audit logs from Firestore...');
  const snap = await firestoreDb.collection('auditLogs').get();
  console.log(`[Migration] Found ${snap.size} audit logs. Migrating...`);

  await query('TRUNCATE TABLE audit_logs');

  const docs = snap.docs;
  const batchSize = 1000;
  let count = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const doc of chunk) {
      const data = doc.data();
      placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6})`);
      values.push(
        data.action || '',
        data.entityType || '',
        data.entityId || '',
        data.details || '',
        data.timestamp || new Date().toISOString(),
        data.userId || null,
        data.userName || null
      );
      pIdx += 7;
    }

    if (placeholders.length > 0) {
      const sql = `INSERT INTO audit_logs (action, entity_type, entity_id, details, timestamp, user_id, user_name) VALUES ${placeholders.join(', ')}`;
      try {
        await query(sql, values);
        count += chunk.length;
        console.log(`[Migration] Migrated ${count}/${docs.length} audit logs...`);
      } catch (err: any) {
        console.error(`[Migration] Failed to migrate audit logs batch starting at ${i}:`, err.message);
        // Fallback
        for (const doc of chunk) {
          const data = doc.data();
          try {
            await query(
              `INSERT INTO audit_logs (action, entity_type, entity_id, details, timestamp, user_id, user_name)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                data.action || '',
                data.entityType || '',
                data.entityId || '',
                data.details || '',
                data.timestamp || new Date().toISOString(),
                data.userId || null,
                data.userName || null
              ]
            );
            count++;
          } catch (e: any) {
            console.warn(`[Migration] Failed to migrate individual audit log: ${e.message}`);
          }
        }
      }
    }
  }
  console.log(`[Migration] Migrated ${count} audit logs.`);
}

async function main() {
  console.log('=== STARTING INZAN ATHLETICS COCKROACHDB MIGRATION ===');
  const start = Date.now();
  try {
    await runSchema();
    await migratePackages();
    await migrateCoaches();

    // Fetch clients once and populate a set of valid client IDs to check references in memory
    console.log('[Migration] Fetching clients from Firestore...');
    const clientsSnap = await firestoreDb.collection('clients').get();
    const validClientIds = new Set(clientsSnap.docs.map(doc => doc.id));
    console.log(`[Migration] Loaded ${validClientIds.size} valid client IDs.`);

    await migrateClients(clientsSnap);
    await migratePayments(validClientIds);
    await migrateAttendance(validClientIds);
    await migrateSessions(validClientIds);
    await migrateTasks(validClientIds);
    await migrateImportBatches();
    await migrateUserTargets();
    await migrateAuditLogs();
    
    console.log(`=== MIGRATION COMPLETED SUCCESSFULLY IN ${((Date.now() - start) / 1000).toFixed(2)}s ===`);
  } catch (err: any) {
    console.error('=== MIGRATION FAILED ===');
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
