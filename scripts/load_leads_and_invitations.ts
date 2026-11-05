import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';
const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'redgits_master_archive_2026');

let inzanApp: App;
const existingApps = getApps();
const existingNamed = existingApps.find(a => a.name === 'inzan-leads-sync');
if (existingNamed) {
  inzanApp = existingNamed;
} else {
  inzanApp = initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-leads-sync');
}
const inzanDb = getFirestore(inzanApp, INZAN_DATABASE_ID);
inzanDb.settings({ ignoreUndefinedProperties: true });

function stripUndefined(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) clean[k] = stripUndefined(v);
    }
    return clean;
  }
  return obj;
}

async function commitDocsInBatches(
  collectionName: string,
  docs: Array<{ id: string; data: Record<string, any> }>
): Promise<number> {
  if (docs.length === 0) return 0;
  const BATCH_SIZE = 450;
  let committed = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = inzanDb.batch();
    for (const doc of chunk) {
      const ref = inzanDb.collection(collectionName).doc(doc.id);
      batch.set(ref, stripUndefined(doc.data), { merge: true });
    }
    await batch.commit();
    committed += chunk.length;
    if (committed % 5000 === 0 || committed === docs.length) {
      console.log(`    [${collectionName}] ${committed} / ${docs.length} committed`);
    }
  }
  return committed;
}

async function main() {
  console.log('1. Loading Guest Members & Leads (25,223 records)...');
  const leadsRaw = JSON.parse(
    fs.readFileSync(path.join(BACKUP_DIR, 'guest_members_leads.json'), 'utf8')
  ) as any[][];

  const leadDocs: Array<{ id: string; data: Record<string, any> }> = [];
  for (const row of leadsRaw) {
    const rId = (row[0] || '').trim();
    const name = (row[1] || '').trim();
    if (!rId || !name) continue;
    const category = (row[2] || '').trim();
    const source = (row[3] || '').trim();
    const dateStr = (row[4] || '').trim();
    const sales = (row[7] || '').trim();
    const createdBy = (row[8] || '').trim();
    const gender = (row[9] || '').trim();

    const id = `redgits-lead-${rId}`;
    leadDocs.push({
      id,
      data: {
        id,
        redgitsId: rId,
        name,
        category: category || 'Walk-in (New Lead)',
        source: source || 'Walk-in',
        createdAt: dateStr || new Date().toISOString(),
        salesName: sales || undefined,
        assignedTo: sales || undefined,
        createdBy: createdBy || undefined,
        gender: gender || undefined,
        branch: 'Garden 8',
        stage: 'NEW',
        status: 'Open',
        sourceSystem: 'RedGITS_v17.14',
        updatedAt: new Date().toISOString(),
      },
    });
  }

  console.log(`  Writing ${leadDocs.length} leads to 'leads'...`);
  await commitDocsInBatches('leads', leadDocs);

  console.log('2. Loading Invitations (10,120 records)...');
  const invRaw = JSON.parse(
    fs.readFileSync(path.join(BACKUP_DIR, 'invitations.json'), 'utf8')
  ) as any[][];

  const invDocs: Array<{ id: string; data: Record<string, any> }> = [];
  for (const row of invRaw) {
    const rId = (row[0] || '').trim();
    const guestName = (row[1] || '').trim();
    if (!rId || !guestName) continue;
    const hostMemberName = (row[3] || '').trim();
    const staffName = (row[6] || '').trim();
    const dateStr = (row[7] || '').trim();
    const salesName = (row[8] || '').trim();

    const id = `redgits-inv-${rId}`;
    invDocs.push({
      id,
      data: {
        id,
        redgitsId: rId,
        guestName,
        hostMemberName: hostMemberName || undefined,
        staffName: staffName || undefined,
        salesName: salesName || undefined,
        date: dateStr || new Date().toISOString(),
        branch: 'Garden 8',
        sourceSystem: 'RedGITS_v17.14',
        updatedAt: new Date().toISOString(),
      },
    });
  }

  console.log(`  Writing ${invDocs.length} invitations to 'invitations'...`);
  await commitDocsInBatches('invitations', invDocs);

  console.log('\n✓ Leads & Invitations Sync Complete!');
}

main().catch(console.error);
