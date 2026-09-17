import fs from 'fs';

const strike = JSON.parse(fs.readFileSync('backups/snapshots/strike_latest.json', 'utf8'));
const inzan = JSON.parse(fs.readFileSync('backups/snapshots/inzanathletics_latest.json', 'utf8'));

console.log('=== STRIKE SNAPSHOT ===');
console.log('Total clients:', strike.clients?.length);
console.log('Total attendance:', strike.attendance?.length);
console.log('Total payments:', strike.payments?.length);
console.log('Total packages:', strike.packages?.length);
if (strike.clients?.length > 0) {
  const c = strike.clients[0];
  console.log('Sample client fields:', Object.keys(c));
  console.log('Sample client 1:', {
    id: c.id,
    name: c.name || c.fullName,
    phone: c.phone || c.phoneNumber,
    memberId: c.memberId,
    status: c.status,
    membershipExpiry: c.membershipExpiry,
    packageType: c.packageType,
    sessionsRemaining: c.sessionsRemaining
  });
}

console.log('\n=== INZAN SNAPSHOT ===');
console.log('Total clients:', inzan.clients?.length);
console.log('Total attendance:', inzan.attendance?.length);
console.log('Total packages:', inzan.packages?.length);
if (inzan.clients?.length > 0) {
  inzan.clients.forEach((c: any, i: number) => {
    console.log(`Inzan client ${i + 1}:`, {
      id: c.id,
      name: c.name || c.fullName,
      phone: c.phone || c.phoneNumber,
      memberId: c.memberId,
      status: c.status,
      membershipExpiry: c.membershipExpiry,
      packageType: c.packageType,
      sessionsRemaining: c.sessionsRemaining
    });
  });
}
