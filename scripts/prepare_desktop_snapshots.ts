import fs from 'fs';
import path from 'path';

function mapClientToMemberEntity(c: any, tenantId: string) {
  // Determine status enum string
  let status = 'Active';
  const rawStatus = (c.status || '').toLowerCase();
  if (rawStatus.includes('expire')) status = 'Expired';
  else if (rawStatus.includes('freez') || rawStatus.includes('froz')) status = 'Frozen';
  else if (rawStatus.includes('cancel')) status = 'Cancelled';
  else if (rawStatus.includes('lead')) status = 'Lead';
  else if (rawStatus.includes('active')) status = 'Active';

  // Check remaining sessions
  let remainingSessions = typeof c.sessionsRemaining === 'number' ? c.sessionsRemaining : 0;
  let totalSessions = typeof c.sessionsTotal === 'number' ? c.sessionsTotal : remainingSessions;
  
  if (Array.isArray(c.packages) && c.packages.length > 0) {
    const activePkg = c.packages.find((p: any) => p.status === 'Active') || c.packages[0];
    if (activePkg) {
      if (typeof activePkg.sessionsRemaining === 'number') remainingSessions = activePkg.sessionsRemaining;
      if (typeof activePkg.sessionsTotal === 'number') totalSessions = activePkg.sessionsTotal;
    }
  }

  return {
    id: String(c.id || ''),
    tenantId,
    name: String(c.name || c.fullName || 'Member ' + (c.memberId || c.id || '')).trim(),
    phone: String(c.phone || c.phoneNumber || '').trim(),
    memberCode: String(c.memberId || c.cardId || '').trim(),
    status,
    membershipExpiryUtc: c.membershipExpiry || null,
    currentPackageName: String(c.packageType || c.packageName || (c.packages?.[0]?.packageName) || 'Standard Package'),
    remainingSessions: Number(remainingSessions) || 0,
    totalSessions: Number(totalSessions) || 0,
    branch: String(c.branch || 'MAIN'),
    serverVersion: Number(c.serverVersion) || 1,
    serverUpdatedAtUtc: c.updatedAt || c.createdAt || new Date().toISOString(),
    isDeleted: Boolean(c.deleted || c.deleted_at || c.deletedAt)
  };
}

function processDatabase(sourceFile: string, tenantId: string, outputDir: string, outputFile: string) {
  if (!fs.existsSync(sourceFile)) {
    console.error(`Source file not found: ${sourceFile}`);
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const clients = raw.clients || [];
  console.log(`Processing ${clients.length} clients for tenant ${tenantId}...`);

  const members = clients.map((c: any) => mapClientToMemberEntity(c, tenantId));

  fs.mkdirSync(outputDir, { recursive: true });
  const fullPath = path.join(outputDir, outputFile);
  fs.writeFileSync(fullPath, JSON.stringify(members, null, 2), 'utf8');
  console.log(`Saved ${members.length} members to ${fullPath}`);

  return members;
}

async function main() {
  console.log('Generating seed snapshots for desktop applications...');

  // 1. Strike members
  const strikeMembers = processDatabase(
    path.join(process.cwd(), 'backups', 'snapshots', 'strike_latest.json'),
    'strike',
    path.join(process.cwd(), 'src', 'desktop', 'MitrixoGym.Strike.Desktop', 'Assets'),
    'strike_members.json'
  );

  // 2. Inzan members
  const inzanMembers = processDatabase(
    path.join(process.cwd(), 'backups', 'snapshots', 'inzanathletics_latest.json'),
    'inzanathletics',
    path.join(process.cwd(), 'src', 'desktop', 'MitrixoGym.Inzan.Desktop', 'Assets'),
    'inzan_members.json'
  );

  console.log(`\nSummary:`);
  console.log(`- Strike members snapshot: ${strikeMembers.length} records`);
  console.log(`- Inzan members snapshot: ${inzanMembers.length} records`);
}

main().catch(console.error);
