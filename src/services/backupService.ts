import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db, getTenantId } from '../firebase';

const ROOT_COLLECTIONS = [
  'users',
  'clients',
  'counters',
  'packages',
  'importBatches',
  'tasks',
  'payments',
  'sessions',
  'auditLogs',
  'settings'
];

export type BackupProgressCallback = (step: string, percent: number) => void;

const ROOT_COLLECTION_WEIGHT = 17; // % allocated to root collections (17 collections * 1% each ≈ 17%)
const SUBCOLLECTION_WEIGHT   = 80; // % allocated to client subcollection pass
const BATCH_SIZE = 20;             // parallel reads per batch

export const exportDatabaseToJson = async (onProgress?: BackupProgressCallback) => {
  const backupData: Record<string, any[]> = {};

  // ── Phase 1: Root collections (0 → 17%) ──────────────────────────────────
  for (let i = 0; i < ROOT_COLLECTIONS.length; i++) {
    const collName = ROOT_COLLECTIONS[i];
    if (!collName) continue;
    const pct = Math.round(((i + 1) / ROOT_COLLECTIONS.length) * ROOT_COLLECTION_WEIGHT);
    onProgress?.(`Reading ${collName}…`, pct);

    const snapshot = await getDocs(collection(db, collName));
    backupData[collName] = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    }));
  }

  // ── Phase 2: Client subcollections in parallel batches (17 → 97%) ─────────
  const clientDocs = backupData['clients'] ?? [];
  const allComments: Record<string, any[]>     = {};
  const allInteractions: Record<string, any[]> = {};
  const totalClients = clientDocs.length;

  for (let start = 0; start < totalClients; start += BATCH_SIZE) {
    const batch = clientDocs.slice(start, start + BATCH_SIZE);

    await Promise.all(
      batch.map(async (client) => {
        const cid = client.id as string;
        const [cSnap, iSnap] = await Promise.all([
          getDocs(collection(db, 'clients', cid, 'comments')),
          getDocs(collection(db, 'clients', cid, 'interactions')),
        ]);
        if (!cSnap.empty)
          allComments[cid] = cSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (!iSnap.empty)
          allInteractions[cid] = iSnap.docs.map(d => ({ ...d.data(), id: d.id }));
      })
    );

    const done    = Math.min(start + BATCH_SIZE, totalClients);
    const subPct  = Math.round((done / totalClients) * SUBCOLLECTION_WEIGHT);
    const overall = ROOT_COLLECTION_WEIGHT + subPct;
    onProgress?.(
      `Client notes & history (${done}/${totalClients})…`,
      Math.min(overall, 97)
    );
  }

  backupData['client_comments']     = [allComments];
  backupData['client_interactions']  = [allInteractions];

  onProgress?.('Generating file…', 99);
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mitrixogymcrm_crm_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  onProgress?.('Done', 100);
};

export const restoreDatabaseFromJson = async (jsonData: string) => {
  const backupData = JSON.parse(jsonData);
  
  const commitBatch = async (batch: any) => {
    await batch.commit();
    return writeBatch(db);
  };

  let batch = writeBatch(db);
  let operationCount = 0;

  // Restore root collections
  for (const collName of ROOT_COLLECTIONS) {
    if (!backupData[collName]) continue;

    for (const record of backupData[collName]) {
      const { id, ...data } = record;
      const docRef = doc(db, collName, id);
      batch.set(docRef, data);
      operationCount++;

      if (operationCount >= 450) {
        batch = await commitBatch(batch);
        operationCount = 0;
      }
    }
  }

  // Restore comments specifically
  if (backupData['client_comments'] && backupData['client_comments'][0]) {
    const allComments = backupData['client_comments'][0];
    for (const clientId in allComments) {
      for (const comment of allComments[clientId]) {
        const { id, ...data } = comment;
        const docRef = doc(db, 'clients', clientId, 'comments', id);
        batch.set(docRef, data);
        operationCount++;

        if (operationCount >= 450) {
          batch = await commitBatch(batch);
          operationCount = 0;
        }
      }
    }
  }

  // Restore interactions
  if (backupData['client_interactions'] && backupData['client_interactions'][0]) {
    const allInteractions = backupData['client_interactions'][0];
    for (const clientId in allInteractions) {
      for (const interaction of allInteractions[clientId]) {
        const { id, ...data } = interaction;
        const docRef = doc(db, 'clients', clientId, 'interactions', id);
        batch.set(docRef, data);
        operationCount++;

        if (operationCount >= 450) {
          batch = await commitBatch(batch);
          operationCount = 0;
        }
      }
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }
};

/**
 * Merges records exported from the offline backup-station.html into Firestore.
 * Only adds new records — does NOT overwrite existing data.
 * Handles: check-ins (attendance), payments, leads (clients with status='lead').
 */
export const mergeBackupRecords = async (
  jsonString: string,
  onProgress?: BackupProgressCallback
): Promise<{ checkins: number; payments: number; leads: number }> => {
  const data = JSON.parse(jsonString) as {
    tenantId?: string;
    checkins?: any[];
    payments?: any[];
    leads?: any[];
  };

  const currentTenantId = getTenantId();
  if (data.tenantId && data.tenantId !== currentTenantId) {
    throw new Error(
      `Tenant mismatch: this backup is from "${data.tenantId}" but you are logged into "${currentTenantId}". Please import this file from the correct gym's system.`
    );
  }

  const checkins = data.checkins ?? [];
  const payments = data.payments ?? [];
  const leads = data.leads ?? [];
  const total = checkins.length + payments.length + leads.length;
  let done = 0;

  // ── Build lookup maps for auto-linking (ALL reads BEFORE any writes) ───────
  onProgress?.('Loading client index…', 0);
  const clientsSnapshot = await getDocs(collection(db, 'clients'));
  const byMemberId = new Map<string, string>(); // memberId  -> docId
  const byNameNorm = new Map<string, string>(); // norm name -> docId
  const byPhone    = new Map<string, string>(); // digits-only phone -> docId

  clientsSnapshot.forEach(snap => {
    const d = snap.data() as Record<string, unknown>;
    if (d['memberId']) byMemberId.set(String(d['memberId']).trim(), snap.id);
    if (d['name'])     byNameNorm.set(String(d['name']).trim().toLowerCase(), snap.id);
    if (d['phone'])    byPhone.set(String(d['phone']).replace(/\D/g, ''), snap.id);
  });

  const findClientId = (r: Record<string, unknown>): string | null => {
    const mid = String(r['memberId'] ?? '').trim();
    if (mid && byMemberId.has(mid)) return byMemberId.get(mid)!;

    const nameKey = String(r['memberName'] ?? r['clientName'] ?? r['name'] ?? '').trim().toLowerCase();
    if (nameKey && byNameNorm.has(nameKey)) return byNameNorm.get(nameKey)!;

    const phoneKey = String(r['phone'] ?? '').replace(/\D/g, '');
    if (phoneKey.length >= 7 && byPhone.has(phoneKey)) return byPhone.get(phoneKey)!;

    return null;
  };
  // ─────────────────────────────────────────────────────────────────────────

  const now = new Date();
  let batch = writeBatch(db);
  let opCount = 0;

  const flush = async () => {
    if (opCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  const addOp = async (colPath: string, id: string, docData: Record<string, unknown>) => {
    batch.set(doc(db, colPath, id), { ...docData, _importedFromBackup: true, _importedAt: now }, { merge: false });
    opCount++;
    done++;
    if (onProgress) onProgress(`Importing record ${done}/${total}…`, Math.round((done / total) * 100));
    if (opCount >= 450) await flush();
  };

  // ── Check-ins: inject clientId when a match is found ─────────────────────
  for (const ci of checkins) {
    const { id, ...rest } = ci as Record<string, unknown> & { id: string };
    const matchedClientId = findClientId(rest);
    await addOp('attendance', id, {
      ...rest,
      ...(matchedClientId ? { clientId: matchedClientId } : {}),
    });
  }

  // ── Payments: inject clientId when a match is found ───────────────────────
  for (const pay of payments) {
    const { id, ...rest } = pay as Record<string, unknown> & { id: string };
    const matchedClientId = findClientId(rest);
    await addOp('payments', id, {
      ...rest,
      ...(matchedClientId ? { clientId: matchedClientId } : {}),
    });
  }

  // ── Leads: update existing client OR create new ───────────────────────────
  for (const lead of leads) {
    const { id, ...rest } = lead as Record<string, unknown> & { id: string };
    const matchedClientId = findClientId(rest);

    if (matchedClientId) {
      // Existing client — update contact metadata, skip duplicate creation
      batch.update(doc(db, 'clients', matchedClientId), {
        lastContactedAt: now,
        _lastBackupImport: now,
      });
      opCount++;
      done++;
      if (onProgress) onProgress(`Importing record ${done}/${total}…`, Math.round((done / total) * 100));
      if (opCount >= 450) await flush();
    } else {
      // New lead — use the original backup id so re-imports stay idempotent
      await addOp('clients', id, { ...rest, status: 'lead' });
    }
  }

  await flush();
  onProgress?.('Done', 100);

  return { checkins: checkins.length, payments: payments.length, leads: leads.length };
};
