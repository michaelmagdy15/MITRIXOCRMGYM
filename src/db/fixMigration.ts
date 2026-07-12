// Fix script: Backfill referral data, package prices, and payment recorded_by
// from Firestore (db-inzanathletics) into CockroachDB
// Run via: POST /api/admin/fix-migration (authenticated)

import { getFirestore } from 'firebase-admin/firestore';
import { query } from './db.js';

function getInzanFirestore() {
  return getFirestore('db-inzanathletics');
}

export async function fixMigrationData() {
  const results = {
    referralsFixed: 0,
    packagePricesFixed: 0,
    paymentRecordedByFixed: 0,
    errors: [] as string[]
  };

  // ─────────────────────────────────────────────
  // 1. BACKFILL REFERRAL DATA FROM FIRESTORE
  // ─────────────────────────────────────────────
  console.log('[Fix] Step 1: Backfilling referral data from Firestore...');
  try {
    const clientsSnap = await getInzanFirestore().collection('clients').get();
    console.log(`[Fix] Loaded ${clientsSnap.size} clients from Firestore.`);
    
    let refBatch: { id: string; referredBy: string | null; referralCode: string | null; referredByName: string | null }[] = [];
    
    clientsSnap.docs.forEach(doc => {
      const data = doc.data();
      const referredBy = data.referredBy || null;
      const referralCode = data.referralCode || null;
      const referredByName = data.referredByName || null;
      
      if (referredBy || referralCode || referredByName) {
        refBatch.push({
          id: doc.id,
          referredBy,
          referralCode,
          referredByName
        });
      }
    });
    
    console.log(`[Fix] Found ${refBatch.length} clients with referral data to backfill.`);
    
    // Update in batches of 50
    for (let i = 0; i < refBatch.length; i += 50) {
      const chunk = refBatch.slice(i, i + 50);
      for (const item of chunk) {
        try {
          await query(
            `UPDATE clients SET 
               referred_by = COALESCE($1, referred_by),
               referral_code = COALESCE($2, referral_code),
               referred_by_name = COALESCE($3, referred_by_name)
             WHERE id = $4`,
            [item.referredBy, item.referralCode, item.referredByName, item.id]
          );
          results.referralsFixed++;
        } catch (e: any) {
          results.errors.push(`Referral fix for ${item.id}: ${e.message}`);
        }
      }
    }
    console.log(`[Fix] Referrals fixed: ${results.referralsFixed}`);
  } catch (e: any) {
    console.error(`[Fix] Failed to backfill referrals:`, e.message);
    results.errors.push(`Referral backfill: ${e.message}`);
  }

  // ─────────────────────────────────────────────
  // 2. FIX PACKAGE PRICES FROM FIRESTORE
  // ─────────────────────────────────────────────
  console.log('[Fix] Step 2: Fixing package prices from Firestore...');
  try {
    const packagesSnap = await getInzanFirestore().collection('packages').get();
    console.log(`[Fix] Loaded ${packagesSnap.size} packages from Firestore.`);
    
    for (const doc of packagesSnap.docs) {
      const data = doc.data();
      const price = data.price;
      const sessions = data.sessions;
      const expiryDays = data.expiryDays;
      
      if (price !== undefined && price !== null && price !== 0) {
        try {
          const updateFields: string[] = [];
          const updateValues: any[] = [];
          let pIdx = 1;

          updateFields.push(`price = $${pIdx++}`);
          updateValues.push(price);

          if (sessions !== undefined && sessions !== null) {
            updateFields.push(`sessions = $${pIdx++}`);
            updateValues.push(sessions);
          }
          if (expiryDays !== undefined && expiryDays !== null) {
            updateFields.push(`expiry_days = $${pIdx++}`);
            updateValues.push(expiryDays);
          }

          updateValues.push(doc.id);
          await query(
            `UPDATE packages SET ${updateFields.join(', ')} WHERE id = $${pIdx}`,
            updateValues
          );
          results.packagePricesFixed++;
        } catch (e: any) {
          results.errors.push(`Package price fix for ${doc.id}: ${e.message}`);
        }
      }
    }
    console.log(`[Fix] Package prices fixed: ${results.packagePricesFixed}`);
  } catch (e: any) {
    console.error(`[Fix] Failed to fix packages:`, e.message);
    results.errors.push(`Package fix: ${e.message}`);
  }

  // ─────────────────────────────────────────────
  // 3. BACKFILL PAYMENT recordedBy FROM FIRESTORE
  // ─────────────────────────────────────────────
  console.log('[Fix] Step 3: Backfilling payment recordedBy from Firestore...');
  try {
    // First, ensure the columns exist
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS recorded_by VARCHAR(50)`);
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS recorded_by_name VARCHAR(255)`);
      console.log('[Fix] Added recorded_by and recorded_by_name columns to payments table.');
    } catch (e: any) {
      console.log('[Fix] Columns may already exist:', e.message);
    }

    const paymentsSnap = await getInzanFirestore().collection('payments').get();
    console.log(`[Fix] Loaded ${paymentsSnap.size} payments from Firestore.`);
    
    let payBatch: { id: string; recordedBy: string | null; recordedByName: string | null }[] = [];
    
    paymentsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.recordedBy || data.recordedByName) {
        payBatch.push({
          id: doc.id,
          recordedBy: data.recordedBy || null,
          recordedByName: data.recordedByName || null
        });
      }
    });
    
    console.log(`[Fix] Found ${payBatch.length} payments with recordedBy data to backfill.`);
    
    for (let i = 0; i < payBatch.length; i += 100) {
      const chunk = payBatch.slice(i, i + 100);
      for (const item of chunk) {
        try {
          await query(
            `UPDATE payments SET recorded_by = $1, recorded_by_name = $2 WHERE id = $3`,
            [item.recordedBy, item.recordedByName, item.id]
          );
          results.paymentRecordedByFixed++;
        } catch (e: any) {
          // Ignore individual errors — payment might not exist in CockroachDB
        }
      }
    }
    console.log(`[Fix] Payment recordedBy fixed: ${results.paymentRecordedByFixed}`);
  } catch (e: any) {
    console.error(`[Fix] Failed to fix payment recordedBy:`, e.message);
    results.errors.push(`Payment recordedBy fix: ${e.message}`);
  }

  console.log('[Fix] Migration fix complete!', JSON.stringify(results, null, 2));
  return results;
}
