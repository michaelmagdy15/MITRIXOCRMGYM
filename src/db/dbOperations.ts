import { query } from './db.js';

// =========================================================================
// Clients and Leads Operations
// =========================================================================

export async function getClientsFromSQL() {
  const res = await query(
    `SELECT 
       id, name, phone, status, member_id, gender, date_of_birth, sales_name, sales_rep, package_type,
       start_date, branch, sessions_remaining, assigned_to, created_at, national_id, email, backup_phone,
       is_blacklisted, photo_url, advertising_source, country, city, address, home_phone, nationality,
       job_title, guest_serial, civilian_or_military, referred_by_name, linked_account, linked_client_ids,
       portal_user_id, packages, import_batch_id, last_contact_date, personal_email, stage, interest,
       category, source, expected_visit_date, trial_date, membership_expiry, height, weight, activity_level,
       workout_times, fitness_target, ai_tokens, referral_code, referred_by, emergency_contact_name, civil_status,
       barcode, card_id, legacy_notes, legacy_member_id
     FROM clients 
     WHERE status != 'Lead' 
     ORDER BY name ASC`
  );
  return res.rows.map(row => ({
    ...row,
    isBlacklisted: row.is_blacklisted,
    photoURL: row.photo_url,
    advertisingSource: row.advertising_source,
    homePhone: row.home_phone,
    jobTitle: row.job_title,
    guestSerial: row.guest_serial,
    civilianOrMilitary: row.civilian_or_military,
    referredByName: row.referred_by_name,
    linkedAccount: row.linked_account,
    linkedClientIds: row.linked_client_ids || [],
    portalUserId: row.portal_user_id,
    packages: row.packages || [],
    comments: [],
    interactions: [],
    importBatchId: row.import_batch_id,
    lastContactDate: row.last_contact_date,
    personalEmail: row.personal_email,
    memberId: row.member_id,
    packageType: row.package_type,
    startDate: row.start_date,
    dateOfBirth: row.date_of_birth,
    salesName: row.sales_name,
    salesRep: row.sales_rep,
    sessionsRemaining: row.sessions_remaining,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    backupPhone: row.backup_phone,
    nationalId: row.national_id,
    expectedVisitDate: row.expected_visit_date,
    trialDate: row.trial_date,
    membershipExpiry: row.membership_expiry,
    activityLevel: row.activity_level,
    workoutTimes: row.workout_times || [],
    fitnessTarget: row.fitness_target,
    aiTokens: row.ai_tokens,
    referralCode: row.referral_code,
    referredBy: row.referred_by,
    emergencyContactName: row.emergency_contact_name,
    civilStatus: row.civil_status,
    cardId: row.card_id,
    legacyNotes: row.legacy_notes,
    legacyMemberId: row.legacy_member_id
  }));
}

export async function getLeadsFromSQL() {
  const res = await query(
    `SELECT 
       id, name, phone, status, member_id, gender, date_of_birth, sales_name, sales_rep, package_type,
       start_date, branch, sessions_remaining, assigned_to, created_at, national_id, email, backup_phone,
       is_blacklisted, photo_url, advertising_source, country, city, address, home_phone, nationality,
       job_title, guest_serial, civilian_or_military, referred_by_name, linked_account, linked_client_ids,
       portal_user_id, packages, import_batch_id, last_contact_date, personal_email, stage, interest,
       category, source, expected_visit_date, trial_date, membership_expiry, height, weight, activity_level,
       workout_times, fitness_target, ai_tokens, referral_code, referred_by, emergency_contact_name, civil_status,
       barcode, card_id, legacy_notes, legacy_member_id
     FROM clients 
     WHERE status = 'Lead' AND stage IN ('New', 'Trial', 'Follow Up') 
     ORDER BY name ASC`
  );
  return res.rows.map(row => ({
    ...row,
    isBlacklisted: row.is_blacklisted,
    photoURL: row.photo_url,
    advertisingSource: row.advertising_source,
    homePhone: row.home_phone,
    jobTitle: row.job_title,
    guestSerial: row.guest_serial,
    civilianOrMilitary: row.civilian_or_military,
    referredByName: row.referred_by_name,
    linkedAccount: row.linked_account,
    linkedClientIds: row.linked_client_ids || [],
    portalUserId: row.portal_user_id,
    packages: row.packages || [],
    comments: [],
    interactions: [],
    importBatchId: row.import_batch_id,
    lastContactDate: row.last_contact_date,
    personalEmail: row.personal_email,
    memberId: row.member_id,
    packageType: row.package_type,
    startDate: row.start_date,
    dateOfBirth: row.date_of_birth,
    salesName: row.sales_name,
    salesRep: row.sales_rep,
    sessionsRemaining: row.sessions_remaining,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    backupPhone: row.backup_phone,
    nationalId: row.national_id,
    expectedVisitDate: row.expected_visit_date,
    trialDate: row.trial_date,
    membershipExpiry: row.membership_expiry,
    activityLevel: row.activity_level,
    workoutTimes: row.workout_times || [],
    fitnessTarget: row.fitness_target,
    aiTokens: row.ai_tokens,
    referralCode: row.referral_code,
    referredBy: row.referred_by,
    emergencyContactName: row.emergency_contact_name,
    civilStatus: row.civil_status,
    cardId: row.card_id,
    legacyNotes: row.legacy_notes,
    legacyMemberId: row.legacy_member_id
  }));
}

export async function addClientToSQL(id: string, client: any) {
  await query(
    `INSERT INTO clients (
       id, name, phone, status, member_id, gender, date_of_birth, sales_name, sales_rep, package_type,
       start_date, branch, sessions_remaining, assigned_to, created_at, national_id, email, backup_phone,
       is_blacklisted, photo_url, advertising_source, country, city, address, home_phone, nationality,
       job_title, guest_serial, civilian_or_military, referred_by_name, linked_account, linked_client_ids,
       portal_user_id, packages, comments, interactions, import_batch_id, last_contact_date, personal_email,
       stage, interest, category, source, expected_visit_date, trial_date, membership_expiry, height, weight, activity_level,
       workout_times, fitness_target, ai_tokens, referral_code, referred_by, emergency_contact_name, civil_status,
       barcode, card_id, legacy_notes, legacy_member_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18,
       $19, $20, $21, $22, $23, $24, $25, $26,
       $27, $28, $29, $30, $31, $32,
       $33, $34, $35, $36, $37, $38, $39,
       $40, $41, $42, $43, $44, $45, $46, $47, $48, $49,
       $50, $51, $52, $53, $54, $55, $56,
       $57, $58, $59, $60
     )`,
    [
      id,
      client.name || '',
      client.phone || '',
      client.status || 'Lead',
      client.memberId || null,
      client.gender || null,
      client.dateOfBirth || null,
      client.salesName || null,
      client.salesRep || null,
      client.packageType || null,
      client.startDate || null,
      client.branch || 'MAIN',
      typeof client.sessionsRemaining === 'number' ? client.sessionsRemaining : null,
      client.assignedTo || null,
      client.createdAt || new Date().toISOString(),
      client.nationalId || null,
      client.email || null,
      client.backupPhone || null,
      client.isBlacklisted === true,
      client.photoURL || null,
      client.advertisingSource || null,
      client.country || null,
      client.city || null,
      client.address || null,
      client.homePhone || null,
      client.nationality || null,
      client.jobTitle || null,
      client.guestSerial || null,
      client.civilianOrMilitary || null,
      client.referredByName || null,
      client.linkedAccount === true,
      client.linkedClientIds || null,
      client.portalUserId || null,
      client.packages ? JSON.stringify(client.packages) : null,
      JSON.stringify(client.comments || []),
      JSON.stringify(client.interactions || []),
      client.importBatchId || null,
      client.lastContactDate || null,
      client.personalEmail || null,
      client.stage || null,
      client.interest || null,
      client.category || null,
      client.source || null,
      client.expectedVisitDate || null,
      client.trialDate || null,
      client.membershipExpiry || null,
      client.height || null,
      client.weight || null,
      client.activityLevel || null,
      client.workoutTimes || null,
      client.fitnessTarget || null,
      client.aiTokens || 0,
      client.referralCode || null,
      client.referredBy || null,
      client.emergencyContactName || null,
      client.civilStatus || null,
      client.barcode || null,
      client.cardId || null,
      client.legacyNotes || null,
      client.legacyMemberId || null
    ]
  );
}

export async function updateClientInSQL(id: string, updates: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const mapField = (tsField: string, sqlField: string, isJson = false) => {
    if (updates[tsField] !== undefined) {
      fields.push(`${sqlField} = $${paramIndex++}`);
      values.push(isJson ? JSON.stringify(updates[tsField]) : updates[tsField]);
    }
  };

  mapField('name', 'name');
  mapField('phone', 'phone');
  mapField('status', 'status');
  mapField('memberId', 'member_id');
  mapField('gender', 'gender');
  mapField('dateOfBirth', 'date_of_birth');
  mapField('salesName', 'sales_name');
  mapField('salesRep', 'sales_rep');
  mapField('packageType', 'package_type');
  mapField('startDate', 'start_date');
  mapField('branch', 'branch');
  mapField('sessionsRemaining', 'sessions_remaining');
  mapField('assignedTo', 'assigned_to');
  mapField('nationalId', 'national_id');
  mapField('email', 'email');
  mapField('backupPhone', 'backup_phone');
  mapField('isBlacklisted', 'is_blacklisted');
  mapField('photoURL', 'photo_url');
  mapField('advertisingSource', 'advertising_source');
  mapField('country', 'country');
  mapField('city', 'city');
  mapField('address', 'address');
  mapField('homePhone', 'home_phone');
  mapField('nationality', 'nationality');
  mapField('jobTitle', 'job_title');
  mapField('guestSerial', 'guest_serial');
  mapField('civilianOrMilitary', 'civilian_or_military');
  mapField('referredByName', 'referred_by_name');
  mapField('linkedAccount', 'linked_account');
  mapField('linkedClientIds', 'linked_client_ids');
  mapField('portalUserId', 'portal_user_id');
  mapField('packages', 'packages', true);
  mapField('comments', 'comments', true);
  mapField('interactions', 'interactions', true);
  mapField('importBatchId', 'import_batch_id');
  mapField('lastContactDate', 'last_contact_date');
  mapField('personalEmail', 'personal_email');
  mapField('stage', 'stage');
  mapField('interest', 'interest');
  mapField('category', 'category');
  mapField('source', 'source');
  mapField('expectedVisitDate', 'expected_visit_date');
  mapField('trialDate', 'trial_date');
  mapField('membershipExpiry', 'membership_expiry');
  mapField('height', 'height');
  mapField('weight', 'weight');
  mapField('activityLevel', 'activity_level');
  mapField('workoutTimes', 'workout_times');
  mapField('fitnessTarget', 'fitness_target');
  mapField('aiTokens', 'ai_tokens');
  mapField('referralCode', 'referral_code');
  mapField('referredBy', 'referred_by');
  mapField('emergencyContactName', 'emergency_contact_name');
  mapField('civilStatus', 'civil_status');
  mapField('barcode', 'barcode');
  mapField('cardId', 'card_id');
  mapField('legacyNotes', 'legacy_notes');
  mapField('legacyMemberId', 'legacy_member_id');

  if (fields.length === 0) return;

  values.push(id);
  const queryText = `UPDATE clients SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await query(queryText, values);
}

export async function deleteClientFromSQL(id: string) {
  await query(`DELETE FROM clients WHERE id = $1`, [id]);
}

export async function deleteMultipleClientsFromSQL(ids: string[]) {
  await query(`DELETE FROM clients WHERE id = ANY($1)`, [ids]);
}

export async function addCommentToSQL(clientId: string, comment: any) {
  await query(
    `UPDATE clients 
     SET comments = COALESCE(comments, '[]'::jsonb) || $1::jsonb, 
         last_contact_date = $2 
     WHERE id = $3`,
    [JSON.stringify([comment]), new Date().toISOString(), clientId]
  );
}

// =========================================================================
// Payments Operations
// =========================================================================

export async function getPaymentsFromSQL() {
  const res = await query(
    `SELECT * FROM payments 
     WHERE deleted_at IS NULL 
       AND (date IS NULL OR date = '' OR date::timestamp >= NOW() - INTERVAL '12 months')
     ORDER BY created_at DESC`
  );
  return res.rows.map(row => ({
    ...row,
    clientId: row.client_id,
    // Convert NUMERIC(12,2) strings to proper JS numbers (removes trailing .00)
    amount: parseFloat(row.amount) || 0,
    amount_paid: parseFloat(row.amount_paid) || 0,
    discountValue: parseFloat(row.discount_value) || 0,
    sales_rep_id: row.sales_rep_id,
    // Map sales_rep_id → recordedBy so the frontend table displays the correct user
    recordedBy: row.recorded_by || row.sales_rep_id,
    recordedByName: row.recorded_by_name || null,
    packageType: row.package_type,
    created_at: row.created_at,
    deleted_at: row.deleted_at
  }));
}

export async function addPaymentToSQL(id: string, payment: any) {
  await query(
    `INSERT INTO payments (
       id, client_id, client_name, amount, amount_paid, discount_value, method, notes,
       currency, receipt_serial, sales_rep_id, package_type, package_category_type,
       created_at, deleted_at, date, recorded_by, recorded_by_name
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      id,
      payment.clientId || null,
      payment.client_name || null,
      payment.amount || 0,
      payment.amount_paid || 0,
      payment.discountValue || 0,
      payment.method || null,
      payment.notes || null,
      payment.currency || 'L.E.',
      payment.receiptSerial || null,
      payment.sales_rep_id || null,
      payment.packageType || null,
      payment.package_category_type || null,
      payment.created_at || new Date().toISOString(),
      null,
      payment.date || null,
      payment.recordedBy || null,
      payment.recordedByName || null
    ]
  );
}

export async function updatePaymentInSQL(id: string, updates: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const mapField = (tsField: string, sqlField: string) => {
    if (updates[tsField] !== undefined) {
      fields.push(`${sqlField} = $${paramIndex++}`);
      values.push(updates[tsField]);
    }
  };

  mapField('amount', 'amount');
  mapField('amount_paid', 'amount_paid');
  mapField('discountValue', 'discount_value');
  mapField('method', 'method');
  mapField('notes', 'notes');
  mapField('currency', 'currency');
  mapField('receiptSerial', 'receipt_serial');
  mapField('sales_rep_id', 'sales_rep_id');
  mapField('packageType', 'package_type');
  mapField('package_category_type', 'package_category_type');
  mapField('deleted_at', 'deleted_at');
  mapField('date', 'date');
  mapField('recordedBy', 'recorded_by');
  mapField('recordedByName', 'recorded_by_name');

  if (fields.length === 0) return;

  values.push(id);
  const queryText = `UPDATE payments SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await query(queryText, values);
}

export async function deletePaymentFromSQL(id: string) {
  // Performs a soft delete by setting deleted_at timestamp
  await query(
    `UPDATE payments SET deleted_at = $1 WHERE id = $2`,
    [new Date().toISOString(), id]
  );
}

// =========================================================================
// Attendance Operations
// =========================================================================

export async function getAttendancesFromSQL() {
  const res = await query(
    `SELECT a.*, c.name as client_name 
     FROM attendance a
     LEFT JOIN clients c ON a.client_id = c.id
     WHERE a.date::timestamp >= NOW() - INTERVAL '90 days'
     ORDER BY a.date DESC`
  );
  return res.rows.map(row => ({
    ...row,
    clientId: row.client_id,
    packageName: row.package_name,
    recordedBy: row.recorded_by,
    clientName: row.client_name
  }));
}

export async function recordAttendanceInSQL(attendance: any) {
  await query(
    `INSERT INTO attendance (client_id, branch, date, recorded_by, package_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      attendance.clientId || '',
      attendance.branch || 'MAIN',
      attendance.date || new Date().toISOString(),
      attendance.recordedBy || null,
      attendance.packageName || null
    ]
  );
}

// =========================================================================
// Coaches Operations
// =========================================================================

export async function getCoachesFromSQL() {
  const res = await query(`SELECT * FROM coaches ORDER BY name ASC`);
  return res.rows.map(row => ({
    ...row,
    userId: row.user_id
  }));
}

export async function addCoachToSQL(id: string, coach: any) {
  await query(
    `INSERT INTO coaches (id, name, active, user_id, phone)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      coach.name || '',
      coach.active !== false,
      coach.userId || null,
      coach.phone || null
    ]
  );
}

export async function updateCoachInSQL(id: string, updates: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const mapField = (tsField: string, sqlField: string) => {
    if (updates[tsField] !== undefined) {
      fields.push(`${sqlField} = $${paramIndex++}`);
      values.push(updates[tsField]);
    }
  };

  mapField('name', 'name');
  mapField('active', 'active');
  mapField('userId', 'user_id');
  mapField('phone', 'phone');

  if (fields.length === 0) return;

  values.push(id);
  const queryText = `UPDATE coaches SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await query(queryText, values);
}

export async function deleteCoachFromSQL(id: string) {
  await query(`DELETE FROM coaches WHERE id = $1`, [id]);
}

// =========================================================================
// Packages Operations
// =========================================================================

export async function getPackagesFromSQL() {
  const res = await query(`SELECT * FROM packages ORDER BY name ASC`);
  return res.rows.map(row => ({
    ...row,
    // Convert NUMERIC strings to proper JS numbers
    price: parseFloat(row.price) || 0,
    sessions: parseInt(row.sessions, 10) || 0,
    expiryDays: parseInt(row.expiry_days, 10) || 0,
    imageUrl: row.image_url
  }));
}

export async function addPackageToSQL(id: string, pkg: any) {
  await query(
    `INSERT INTO packages (id, name, price, sessions, expiry_days, branch, type, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      pkg.name || '',
      pkg.price || 0,
      pkg.sessions || 0,
      pkg.expiryDays || 0,
      pkg.branch || 'ALL',
      pkg.type || 'Group',
      pkg.imageUrl || null
    ]
  );
}

export async function updatePackageInSQL(id: string, updates: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const mapField = (tsField: string, sqlField: string) => {
    if (updates[tsField] !== undefined) {
      fields.push(`${sqlField} = $${paramIndex++}`);
      values.push(updates[tsField]);
    }
  };

  mapField('name', 'name');
  mapField('price', 'price');
  mapField('sessions', 'sessions');
  mapField('expiryDays', 'expiry_days');
  mapField('branch', 'branch');
  mapField('type', 'type');
  mapField('imageUrl', 'image_url');

  if (fields.length === 0) return;

  values.push(id);
  const queryText = `UPDATE packages SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await query(queryText, values);
}

export async function deletePackageFromSQL(id: string) {
  await query(`DELETE FROM packages WHERE id = $1`, [id]);
}

// =========================================================================
// Sessions Operations
// =========================================================================

export async function getSessionsFromSQL() {
  const res = await query(`SELECT * FROM sessions ORDER BY date DESC, time DESC`);
  return res.rows.map(row => ({
    ...row,
    clientId: row.client_id,
    clientName: row.client_name,
    coachId: row.coach_id,
    coachName: row.coach_name,
    createdAt: row.created_at
  }));
}

export async function addSessionToSQL(id: string, session: any) {
  await query(
    `INSERT INTO sessions (id, client_id, client_name, coach_id, coach_name, date, time, status, notes, branch, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      session.clientId || '',
      session.clientName || null,
      session.coachId || null,
      session.coachName || null,
      session.date || '',
      session.time || '',
      session.status || 'Scheduled',
      session.notes || null,
      session.branch || null,
      session.createdAt || new Date().toISOString()
    ]
  );
}

export async function updateSessionInSQL(id: string, updates: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const mapField = (tsField: string, sqlField: string) => {
    if (updates[tsField] !== undefined) {
      fields.push(`${sqlField} = $${paramIndex++}`);
      values.push(updates[tsField]);
    }
  };

  mapField('clientId', 'client_id');
  mapField('clientName', 'client_name');
  mapField('coachId', 'coach_id');
  mapField('coachName', 'coach_name');
  mapField('date', 'date');
  mapField('time', 'time');
  mapField('status', 'status');
  mapField('notes', 'notes');
  mapField('branch', 'branch');

  if (fields.length === 0) return;

  values.push(id);
  const queryText = `UPDATE sessions SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await query(queryText, values);
}

// =========================================================================
// Tasks Operations
// =========================================================================

export async function getTasksFromSQL() {
  const res = await query(`SELECT * FROM tasks ORDER BY created_at DESC`);
  return res.rows.map(row => ({
    ...row,
    dueDate: row.due_date,
    assignedTo: row.assigned_to,
    assignedName: row.assigned_name,
    clientId: row.client_id,
    clientName: row.client_name,
    createdBy: row.created_by,
    createdAt: row.created_at
  }));
}

export async function addTaskToSQL(id: string, task: any) {
  await query(
    `INSERT INTO tasks (id, title, description, status, due_date, assigned_to, assigned_name, client_id, client_name, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      task.title || '',
      task.description || null,
      task.status || 'Pending',
      task.dueDate || null,
      task.assignedTo || null,
      task.assignedName || null,
      task.clientId || null,
      task.clientName || null,
      task.createdBy || null,
      task.createdAt || new Date().toISOString()
    ]
  );
}

export async function updateTaskInSQL(id: string, updates: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const mapField = (tsField: string, sqlField: string) => {
    if (updates[tsField] !== undefined) {
      fields.push(`${sqlField} = $${paramIndex++}`);
      values.push(updates[tsField]);
    }
  };

  mapField('title', 'title');
  mapField('description', 'description');
  mapField('status', 'status');
  mapField('dueDate', 'due_date');
  mapField('assignedTo', 'assigned_to');
  mapField('assignedName', 'assigned_name');
  mapField('clientId', 'client_id');
  mapField('clientName', 'client_name');

  if (fields.length === 0) return;

  values.push(id);
  const queryText = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await query(queryText, values);
}

export async function deleteTaskFromSQL(id: string) {
  await query(`DELETE FROM tasks WHERE id = $1`, [id]);
}

// =========================================================================
// Import Batches Operations
// =========================================================================

export async function getImportBatchesFromSQL() {
  const res = await query(`SELECT * FROM import_batches ORDER BY date DESC`);
  return res.rows.map(row => ({
    ...row,
    fileName: row.file_name,
    importedCount: row.imported_count,
    failedCount: row.failed_count,
    errors: row.errors || []
  }));
}

export async function addImportBatchToSQL(id: string, batch: any) {
  await query(
    `INSERT INTO import_batches (id, date, file_name, imported_count, failed_count, errors, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      batch.date || '',
      batch.fileName || '',
      batch.importedCount || 0,
      batch.failedCount || 0,
      batch.errors ? JSON.stringify(batch.errors) : null,
      batch.status || 'Completed'
    ]
  );
}

export async function updateImportBatchInSQL(id: string, updates: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const mapField = (tsField: string, sqlField: string) => {
    if (updates[tsField] !== undefined) {
      fields.push(`${sqlField} = $${paramIndex++}`);
      values.push(updates[tsField]);
    }
  };

  mapField('status', 'status');

  if (fields.length === 0) return;

  values.push(id);
  const queryText = `UPDATE import_batches SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await query(queryText, values);
}

// =========================================================================
// User Targets Operations
// =========================================================================

export async function getUserTargetsFromSQL() {
  const res = await query('SELECT * FROM user_targets');
  return res.rows.map(row => ({
    ...row,
    userId: row.user_id,
    userName: row.user_name,
    targetAmount: row.amount,
    ptTarget: row.pt_target,
    classesTarget: row.classes_target,
    membershipsTarget: row.memberships_target
  }));
}

export async function saveUserTargetToSQL(id: string, target: any) {
  await query(
    `INSERT INTO user_targets (id, user_id, user_name, amount, pt_target, classes_target, memberships_target, month, year)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       user_name = EXCLUDED.user_name,
       amount = EXCLUDED.amount,
       pt_target = EXCLUDED.pt_target,
       classes_target = EXCLUDED.classes_target,
       memberships_target = EXCLUDED.memberships_target,
       month = EXCLUDED.month,
       year = EXCLUDED.year`,
    [
      id,
      target.userId || '',
      target.userName || '',
      target.targetAmount || target.amount || 0,
      target.ptTarget || 0,
      target.classesTarget || 0,
      target.membershipsTarget || 0,
      target.month || '',
      target.year || new Date().getFullYear()
    ]
  );
}

// =========================================================================
// Users Operations
// =========================================================================

export async function getUsersFromSQL() {
  const res = await query('SELECT * FROM users');
  return res.rows.map(row => ({
    ...row,
    salesTarget: row.sales_target,
    canDeletePayments: row.can_delete_payments,
    canViewGlobalDashboard: row.can_view_global_dashboard,
    canAccessSettingsAndHistory: row.can_access_settings_and_history,
    canDeleteRecords: row.can_delete_records,
    canAssignLeads: row.can_assign_leads,
    lastSeen: row.last_seen,
    isPending: row.is_pending,
    coachId: row.coach_id,
    clientRecordId: row.client_record_id,
    clientDocId: row.client_doc_id,
    mustChangePassword: row.must_change_password,
    photoURL: row.photo_url,
    dismissedNotifications: row.dismissed_notifications
  }));
}

export async function addUserToSQL(id: string, user: any) {
  await query(
    `INSERT INTO users (
      id, name, role, email, branch, sales_target, can_delete_payments,
      can_view_global_dashboard, can_access_settings_and_history, can_delete_records,
      can_assign_leads, last_seen, is_pending, coach_id, client_record_id,
      client_doc_id, phone, must_change_password, photo_url, dismissed_notifications, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      id, user.name || '', user.role || 'rep', user.email || '', JSON.stringify(user.branch || null),
      user.salesTarget || null, user.can_delete_payments || false, user.can_view_global_dashboard || false,
      user.can_access_settings_and_history || false, user.can_delete_records || false,
      user.can_assign_leads || false, user.lastSeen || null, user.isPending || false,
      user.coachId || null, user.clientRecordId || null, user.clientDocId || null,
      user.phone || null, user.mustChangePassword || false, user.photoURL || null,
      JSON.stringify(user.dismissedNotifications || []), user.status || 'working'
    ]
  );
}

export async function updateUserInSQL(id: string, updates: any) {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  const mapping: Record<string, string> = {
    name: 'name',
    role: 'role',
    email: 'email',
    branch: 'branch',
    salesTarget: 'sales_target',
    can_delete_payments: 'can_delete_payments',
    can_view_global_dashboard: 'can_view_global_dashboard',
    can_access_settings_and_history: 'can_access_settings_and_history',
    can_delete_records: 'can_delete_records',
    can_assign_leads: 'can_assign_leads',
    lastSeen: 'last_seen',
    isPending: 'is_pending',
    coachId: 'coach_id',
    clientRecordId: 'client_record_id',
    clientDocId: 'client_doc_id',
    phone: 'phone',
    mustChangePassword: 'must_change_password',
    photoURL: 'photo_url',
    dismissedNotifications: 'dismissed_notifications',
    status: 'status'
  };

  for (const [key, value] of Object.entries(updates)) {
    if (mapping[key]) {
      setClauses.push(`${mapping[key]} = $${paramIdx}`);
      if (typeof value === 'object' && value !== null) {
         values.push(JSON.stringify(value));
      } else {
         values.push(value);
      }
      paramIdx++;
    }
  }

  if (setClauses.length > 0) {
    values.push(id);
    await query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`, values);
  }
}

export async function deleteUserFromSQL(id: string) {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

// =========================================================================
// Settings Operations
// =========================================================================

export async function getSettingsFromSQL() {
  const res = await query('SELECT key, value FROM settings');
  const settings: Record<string, any> = {};
  for (const row of res.rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function updateSettingInSQL(key: string, value: any) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

// =========================================================================
// Announcements Operations
// =========================================================================

export async function getAnnouncementsFromSQL() {
  const res = await query(`SELECT * FROM announcements ORDER BY priority DESC, start_date DESC`);
  return res.rows.map(row => ({
    ...row,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    startDate: row.start_date,
    endDate: row.end_date,
    createdBy: row.created_by
  }));
}

export async function addAnnouncementToSQL(announcement: any) {
  const newId = announcement.id || Math.random().toString(36).substr(2, 9);
  await query(
    `INSERT INTO announcements (id, title, body, image_url, link_url, priority, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId,
      announcement.title || '',
      announcement.body || '',
      announcement.imageUrl || null,
      announcement.linkUrl || null,
      announcement.priority || 1,
      announcement.startDate || null,
      announcement.endDate || null,
      announcement.createdBy || null
    ]
  );
  return newId;
}

export async function updateAnnouncementInSQL(id: string, updates: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const mapField = (tsField: string, sqlField: string) => {
    if (updates[tsField] !== undefined) {
      fields.push(`${sqlField} = $${paramIndex++}`);
      values.push(updates[tsField]);
    }
  };

  mapField('title', 'title');
  mapField('body', 'body');
  mapField('imageUrl', 'image_url');
  mapField('linkUrl', 'link_url');
  mapField('priority', 'priority');
  mapField('startDate', 'start_date');
  mapField('endDate', 'end_date');

  if (fields.length === 0) return;

  values.push(id);
  const queryText = `UPDATE announcements SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  await query(queryText, values);
}

export async function deleteAnnouncementFromSQL(id: string) {
  await query(`DELETE FROM announcements WHERE id = $1`, [id]);
}

// =========================================================================
// Audit Logs Operations
// =========================================================================

export async function getAuditLogsFromSQL() {
  const res = await query(`SELECT * FROM audit_logs ORDER BY timestamp DESC`);
  return res.rows.map(row => ({
    ...row,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userId: row.user_id,
    userName: row.user_name
  }));
}

export async function addAuditLogToSQL(log: any) {
  await query(
    `INSERT INTO audit_logs (action, entity_type, entity_id, details, timestamp, user_id, user_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      log.action || '',
      log.entityType || '',
      log.entityId || '',
      log.details || '',
      log.timestamp || new Date().toISOString(),
      log.userId || null,
      log.userName || null
    ]
  );
}

// =========================================================================
// Optimized Targeted SQL Queries for QR Check-In
// =========================================================================

export async function getClientByQrCodeFromSQL(qrData: string) {
  const res = await query(
    `SELECT 
       id, name, phone, status, member_id, gender, date_of_birth, sales_name, sales_rep, package_type,
       start_date, branch, sessions_remaining, assigned_to, created_at, national_id, email, backup_phone,
       is_blacklisted, photo_url, advertising_source, country, city, address, home_phone, nationality,
       job_title, guest_serial, civilian_or_military, referred_by_name, linked_account, linked_client_ids,
       portal_user_id, packages, import_batch_id, last_contact_date, personal_email, stage, interest,
       category, source, expected_visit_date, trial_date, membership_expiry, height, weight, activity_level,
       workout_times, fitness_target, ai_tokens, referral_code, referred_by, emergency_contact_name, civil_status,
       barcode, card_id, legacy_notes, legacy_member_id
     FROM clients 
     WHERE id = $1 OR member_id = $1 OR phone = $1
     LIMIT 1`,
    [qrData]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    ...row,
    isBlacklisted: row.is_blacklisted,
    photoURL: row.photo_url,
    advertisingSource: row.advertising_source,
    homePhone: row.home_phone,
    jobTitle: row.job_title,
    guestSerial: row.guest_serial,
    civilianOrMilitary: row.civilian_or_military,
    referredByName: row.referred_by_name,
    linkedAccount: row.linked_account,
    linkedClientIds: row.linked_client_ids || [],
    portalUserId: row.portal_user_id,
    packages: row.packages || [],
    comments: [],
    interactions: [],
    importBatchId: row.import_batch_id,
    lastContactDate: row.last_contact_date,
    personalEmail: row.personal_email,
    memberId: row.member_id,
    packageType: row.package_type,
    startDate: row.start_date,
    dateOfBirth: row.date_of_birth,
    salesName: row.sales_name,
    salesRep: row.sales_rep,
    sessionsRemaining: row.sessions_remaining,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    backupPhone: row.backup_phone,
    nationalId: row.national_id,
    expectedVisitDate: row.expected_visit_date,
    trialDate: row.trial_date,
    membershipExpiry: row.membership_expiry,
    activityLevel: row.activity_level,
    workoutTimes: row.workout_times || [],
    fitnessTarget: row.fitness_target,
    aiTokens: row.ai_tokens,
    referralCode: row.referral_code,
    referredBy: row.referred_by,
    emergencyContactName: row.emergency_contact_name,
    civilStatus: row.civil_status,
    cardId: row.card_id,
    legacyNotes: row.legacy_notes,
    legacyMemberId: row.legacy_member_id
  };
}

export async function getAttendancesForClientFromSQL(clientId: string) {
  const res = await query(
    `SELECT a.*, c.name as client_name 
     FROM attendance a
     LEFT JOIN clients c ON a.client_id = c.id
     WHERE a.client_id = $1
     ORDER BY a.date DESC`,
    [clientId]
  );
  return res.rows.map(row => ({
    ...row,
    clientId: row.client_id,
    packageName: row.package_name,
    recordedBy: row.recorded_by,
    clientName: row.client_name
  }));
}

export async function getSessionsForClientAndDateFromSQL(clientId: string, dateStr: string) {
  const res = await query(
    `SELECT * FROM sessions 
     WHERE client_id = $1 AND date = $2`,
    [clientId, dateStr]
  );
  return res.rows.map(row => ({
    ...row,
    clientId: row.client_id,
    clientName: row.client_name,
    coachId: row.coach_id,
    coachName: row.coach_name,
    createdAt: row.created_at
  }));
}

// =========================================================================
// Operational Modules: Call Center, Complaints, Lost & Found, Calendar, Bookings, Club Operations
// =========================================================================

export async function getCallCenterLogs() {
  const res = await query(`SELECT * FROM call_center_logs ORDER BY created_at DESC`);
  return res.rows.map(row => ({
    id: row.id, memberId: row.member_id, memberName: row.member_name, memberPhone: row.member_phone,
    memberStatus: row.member_status, packageData: row.package_data, callType: row.call_type,
    comment: row.comment, source: row.source, createdBy: row.created_by, createdByName: row.created_by_name,
    createdAt: row.created_at, branch: row.branch
  }));
}

export async function addCallCenterLog(log: any) {
  await query(
    `INSERT INTO call_center_logs (id, member_id, member_name, member_phone, member_status, package_data, call_type, comment, source, created_by, created_by_name, created_at, branch) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [log.id, log.memberId, log.memberName, log.memberPhone, log.memberStatus, log.packageData, log.callType, log.comment, log.source, log.createdBy, log.createdByName, log.createdAt, log.branch]
  );
}

export async function getComplaints() {
  const res = await query(`SELECT * FROM complaints ORDER BY created_at DESC`);
  return res.rows.map(row => ({
    id: row.id, title: row.title, description: row.description, categoryId: row.category_id,
    categoryName: row.category_name, category: row.category, priority: row.priority, status: row.status,
    memberId: row.member_id, memberName: row.member_name, branch: row.branch, resolutionNotes: row.resolution_notes,
    resolvedAt: row.resolved_at, resolvedBy: row.resolved_by, createdBy: row.created_by, createdByName: row.created_by_name,
    createdAt: row.created_at
  }));
}

export async function addComplaint(complaint: any) {
  await query(
    `INSERT INTO complaints (id, title, description, category_id, category_name, category, priority, status, member_id, member_name, branch, resolution_notes, resolved_at, resolved_by, created_by, created_by_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [complaint.id, complaint.title, complaint.description, complaint.categoryId, complaint.categoryName, complaint.category, complaint.priority, complaint.status, complaint.memberId, complaint.memberName, complaint.branch, complaint.resolutionNotes, complaint.resolvedAt, complaint.resolvedBy, complaint.createdBy, complaint.createdByName, complaint.createdAt]
  );
}

export async function updateComplaint(id: string, updates: any) {
  const fields = [];
  const values = [];
  let paramIndex = 1;
  const mappedKeys: any = {
    title: 'title', description: 'description', categoryId: 'category_id', categoryName: 'category_name', category: 'category',
    priority: 'priority', status: 'status', memberId: 'member_id', memberName: 'member_name', branch: 'branch',
    resolutionNotes: 'resolution_notes', resolvedAt: 'resolved_at', resolvedBy: 'resolved_by'
  };
  for (const [key, val] of Object.entries(updates)) {
    if (mappedKeys[key]) {
      fields.push(`${mappedKeys[key]} = $${paramIndex++}`);
      values.push(val);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  await query(`UPDATE complaints SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
}

export async function deleteComplaint(id: string) {
  await query(`DELETE FROM complaints WHERE id = $1`, [id]);
}
export async function getLostAndFound() {
  const res = await query(`SELECT * FROM lost_and_found ORDER BY found_date DESC`);
  return res.rows.map(row => ({
    id: row.id, itemName: row.item_name, name: row.name, description: row.description, categoryId: row.category_id,
    categoryName: row.category_name, category: row.category, foundDate: row.found_date, foundBy: row.found_by,
    branch: row.branch, photoURL: row.photo_url, status: row.status, claimedBy: row.claimed_by, claimedByName: row.claimed_by_name,
    claimedDate: row.claimed_date, disposedDate: row.disposed_date, createdBy: row.created_by, createdAt: row.created_at
  }));
}

export async function addLostAndFound(item: any) {
  await query(
    `INSERT INTO lost_and_found (id, item_name, name, description, category_id, category_name, category, found_date, found_by, branch, photo_url, status, claimed_by, claimed_by_name, claimed_date, disposed_date, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [item.id, item.itemName, item.name, item.description, item.categoryId, item.categoryName, item.category, item.foundDate, item.foundBy, item.branch, item.photoURL, item.status, item.claimedBy, item.claimedByName, item.claimedDate, item.disposedDate, item.createdBy, item.createdAt]
  );
}

export async function updateLostAndFound(id: string, updates: any) {
  const fields = [];
  const values = [];
  let paramIndex = 1;
  const mappedKeys: any = {
    itemName: 'item_name', name: 'name', description: 'description', categoryId: 'category_id', categoryName: 'category_name', category: 'category',
    foundDate: 'found_date', foundBy: 'found_by', branch: 'branch', photoURL: 'photo_url', status: 'status', claimedBy: 'claimed_by',
    claimedByName: 'claimed_by_name', claimedDate: 'claimed_date', disposedDate: 'disposed_date'
  };
  for (const [key, val] of Object.entries(updates)) {
    if (mappedKeys[key]) {
      fields.push(`${mappedKeys[key]} = $${paramIndex++}`);
      values.push(val);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  await query(`UPDATE lost_and_found SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
}

export async function deleteLostAndFound(id: string) {
  await query(`DELETE FROM lost_and_found WHERE id = $1`, [id]);
}
export async function getCalendarEvents() {
  const res = await query(`SELECT * FROM calendar_events`);
  return res.rows.map(row => ({
    id: row.id, name: row.title, description: row.description, date: row.start_time,
    time: row.end_time, type: row.type, branch: row.branch, createdBy: row.created_by, createdAt: row.created_at,
    coachName: row.coach_name, capacity: row.capacity, attendees: row.attendees
  }));
}

export async function addCalendarEvent(event: any) {
  await query(
    `INSERT INTO calendar_events (id, title, description, start_time, end_time, type, branch, created_by, created_at, coach_name, capacity, attendees)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [event.id, event.name, event.description, event.date, event.time, event.type, event.branch, event.createdBy, event.createdAt, event.coachName, event.capacity, JSON.stringify(event.attendees || [])]
  );
}

export async function deleteCalendarEvent(id: string) {
  await query(`DELETE FROM calendar_events WHERE id = $1`, [id]);
}

export async function getBookingRequests() {
  const res = await query(`SELECT * FROM booking_requests ORDER BY created_at DESC`);
  return res.rows.map(row => ({
    id: row.id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    clientId: row.client_id,
    items: row.items,
    totalPrice: Number(row.total_price),
    paymentMethod: row.payment_method,
    instapayRef: row.instapay_ref,
    status: row.status,
    createdAt: row.created_at
  }));
}

export async function updateBookingRequestStatus(id: string, status: string) {
  await query(`UPDATE booking_requests SET status = $1 WHERE id = $2`, [status, id]);
}

export async function updateClient(id: string, fields: any) {
  const updates = [];
  const values = [];
  let i = 1;
  for (const key of Object.keys(fields)) {
    let col = key;
    if (key === 'lastContactDate') col = 'last_contact_date';
    updates.push(`${col} = $${i}`);
    values.push(fields[key]);
    i++;
  }
  values.push(id);
  await query(`UPDATE clients SET ${updates.join(', ')} WHERE id = $${i}`, values);
}

export async function addTask(task: any) {
  await query(
    `INSERT INTO tasks (id, title, description, status, due_date, assigned_to, type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [task.id, task.title, task.description, task.status, task.dueDate, task.assignedTo, task.type, task.createdAt]
  );
}

export async function getBookings() {
  const res = await query(`SELECT * FROM bookings ORDER BY booking_date DESC`);
  return res.rows.map(row => ({
    id: row.id, memberId: row.member_id, memberName: row.member_name, classId: row.class_id, className: row.class_name,
    bookingDate: row.booking_date, bookingTime: row.booking_time, status: row.status, branch: row.branch,
    createdBy: row.created_by, createdAt: row.created_at
  }));
}

export async function addBooking(booking: any) {
  await query(
    `INSERT INTO bookings (id, member_id, member_name, class_id, class_name, booking_date, booking_time, status, branch, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [booking.id, booking.memberId, booking.memberName, booking.classId, booking.className, booking.bookingDate, booking.bookingTime, booking.status, booking.branch, booking.createdBy, booking.createdAt]
  );
}

export async function updateBooking(id: string, updates: any) {
  const fields = [];
  const values = [];
  let paramIndex = 1;
  const mappedKeys: any = { status: 'status' };
  for (const [key, val] of Object.entries(updates)) {
    if (mappedKeys[key]) {
      fields.push(`${mappedKeys[key]} = $${paramIndex++}`);
      values.push(val);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  await query(`UPDATE bookings SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
}

export async function getClubOperations() {
  const res = await query(`SELECT * FROM club_operations ORDER BY created_at DESC`);
  return res.rows.map(row => ({
    id: row.id, taskName: row.task_name, description: row.description, taskType: row.task_type, status: row.status,
    priority: row.priority, assignedTo: row.assigned_to, assignedToName: row.assigned_to_name, dueDate: row.due_date,
    completedAt: row.completed_at, completedBy: row.completed_by, branch: row.branch, createdBy: row.created_by, createdAt: row.created_at
  }));
}

export async function addClubOperation(op: any) {
  await query(
    `INSERT INTO club_operations (id, task_name, description, task_type, status, priority, assigned_to, assigned_to_name, due_date, completed_at, completed_by, branch, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [op.id, op.taskName, op.description, op.taskType, op.status, op.priority, op.assignedTo, op.assignedToName, op.dueDate, op.completedAt, op.completedBy, op.branch, op.createdBy, op.createdAt]
  );
}

export async function updateClubOperation(id: string, updates: any) {
  const fields = [];
  const values = [];
  let paramIndex = 1;
  const mappedKeys: any = { status: 'status', completedAt: 'completed_at', completedBy: 'completed_by', assignedTo: 'assigned_to', assignedToName: 'assigned_to_name' };
  for (const [key, val] of Object.entries(updates)) {
    if (mappedKeys[key]) {
      fields.push(`${mappedKeys[key]} = $${paramIndex++}`);
      values.push(val);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  await query(`UPDATE club_operations SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
}

export async function getJuiceBarOrders() {
  const res = await query(`SELECT * FROM juice_bar_orders`);
  return res.rows.map(row => ({
    id: row.id, memberId: row.member_id, memberName: row.member_name, items: row.items,
    totalPrice: Number(row.total_price), status: row.status, orderedAt: row.ordered_at
  }));
}

export async function updateJuiceBarOrder(id: string, status: string) {
  await query(`UPDATE juice_bar_orders SET status = $1 WHERE id = $2`, [status, id]);
}

export async function getLockers() {
  const res = await query(`SELECT * FROM lockers`);
  return res.rows.map(row => ({
    id: row.id, lockerNumber: row.locker_number, branch: row.branch, status: row.status,
    assignedTo: row.assigned_to, assignedName: row.assigned_name, pinCode: row.pin_code
  }));
}

export async function addLocker(locker: any) {
  await query(
    `INSERT INTO lockers (id, locker_number, branch, status) VALUES ($1, $2, $3, $4)`,
    [locker.id, locker.lockerNumber, locker.branch, locker.status]
  );
}

export async function updateLocker(id: string, fields: any) {
  const updates = [];
  const values = [];
  let i = 1;
  for (const key of Object.keys(fields)) {
    let col = key;
    if (key === 'lockerNumber') col = 'locker_number';
    if (key === 'assignedTo') col = 'assigned_to';
    if (key === 'assignedName') col = 'assigned_name';
    if (key === 'pinCode') col = 'pin_code';
    updates.push(`${col} = $${i}`);
    values.push(fields[key]);
    i++;
  }
  if (updates.length === 0) return;
  values.push(id);
  await query(`UPDATE lockers SET ${updates.join(', ')} WHERE id = $${i}`, values);
}

export async function deleteLocker(id: string) {
  await query(`DELETE FROM lockers WHERE id = $1`, [id]);
}

export async function getLockerRequests() {
  const res = await query(`SELECT * FROM locker_requests`);
  return res.rows.map(row => ({
    id: row.id, clientId: row.client_id, clientName: row.client_name, branch: row.branch,
    duration: row.duration, status: row.status, requestedAt: row.requested_at
  }));
}

export async function updateLockerRequest(id: string, status: string) {
  await query(`UPDATE locker_requests SET status = $1 WHERE id = $2`, [status, id]);
}

export async function getGuestInvites() {
  const res = await query(`SELECT * FROM guest_invites`);
  return res.rows.map(row => ({
    id: row.id, guestName: row.guest_name, guestPhone: row.guest_phone, invitedById: row.invited_by_id,
    invitedByName: row.invited_by_name, visitDate: row.visit_date, status: row.status, notes: row.notes, createdAt: row.created_at
  }));
}

export async function updateGuestInvite(id: string, status: string) {
  await query(`UPDATE guest_invites SET status = $1 WHERE id = $2`, [status, id]);
}

export async function addAuditLog(log: any) {
  await query(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, details, user_id, user_name, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [log.id, log.action, log.entityType, log.entityId, log.details, log.userId, log.userName, log.timestamp]
  );
}
