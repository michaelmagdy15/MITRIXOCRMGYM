import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

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
