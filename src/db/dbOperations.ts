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
  const res = await query(`SELECT comments FROM clients WHERE id = $1`, [clientId]);
  const comments = res.rows[0]?.comments || [];
  comments.push(comment);
  
  await query(
    `UPDATE clients SET comments = $1, last_contact_date = $2 WHERE id = $3`,
    [JSON.stringify(comments), new Date().toISOString(), clientId]
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
  const res = await query(`SELECT * FROM user_targets`);
  return res.rows.map(row => ({
    ...row,
    userId: row.user_id,
    userName: row.user_name
  }));
}

export async function saveUserTargetToSQL(id: string, target: any) {
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
      id,
      target.userId || '',
      target.userName || '',
      target.amount || 0,
      target.month || '',
      target.year || new Date().getFullYear()
    ]
  );
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
