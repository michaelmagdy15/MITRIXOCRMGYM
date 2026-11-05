import * as fs from 'fs';
import * as path from 'path';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'redgits_master_archive_2026');

async function auditEdgeCases() {
  const pkgPayments = JSON.parse(
    fs.readFileSync(path.join(BACKUP_DIR, 'packagelist_payments.json'), 'utf8')
  ) as string[][];

  const activeMembers = JSON.parse(
    fs.readFileSync(path.join(BACKUP_DIR, 'active_members.json'), 'utf8')
  ) as string[][];

  console.log('Auditing subscription edge-cases in RedGITS data...');

  // Group payments by member
  const memberPackages = new Map<string, Array<{ pkg: string; type: string; start: string; end: string; paid: string }>>();
  for (let i = 1; i < pkgPayments.length; i++) {
    const row = pkgPayments[i];
    if (!row || row.length < 12) continue;
    const mid = (row[2] || '').trim();
    if (!mid) continue;
    const pkg = (row[3] || '').trim();
    const type = (row[4] || '').trim();
    const paid = (row[5] || '').trim();
    const start = (row[10] || '').trim();
    const end = (row[11] || '').trim();

    if (!memberPackages.has(mid)) memberPackages.set(mid, []);
    memberPackages.get(mid)!.push({ pkg, type, start, end, paid });
  }

  const today = '2026-11-05';
  let multiActive = 0;
  let futureQueued = 0;
  let pendingStart = 0;

  for (const [mid, list] of memberPackages.entries()) {
    const nonExpired = list.filter(p => p.end >= today);
    if (nonExpired.length > 1) {
      multiActive++;
    }
    const future = list.filter(p => p.start > today);
    if (future.length > 0) {
      futureQueued++;
    }
    const unstarted = list.filter(p => !p.start || p.start > today);
    if (unstarted.length > 0) {
      pendingStart++;
    }
  }

  console.log(`================================================================================`);
  console.log(` 📋 SUBSCRIPTION EDGE-CASE AUDIT`);
  console.log(`================================================================================`);
  console.log(` Members with Multiple Non-Expired Packages : ${multiActive}`);
  console.log(` Members with Future/Queued Renewals       : ${futureQueued}`);
  console.log(` Members with Pending First Visit / Start  : ${pendingStart}`);
  console.log(`================================================================================\n`);
}

auditEdgeCases().catch(console.error);
