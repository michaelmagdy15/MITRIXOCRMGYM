const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

admin.initializeApp({ projectId: 'faa-test-guide-v2' });
const db = getFirestore('db-inzanathletics');

async function main() {
  const doc = await db.collection('secrets_config').doc('drone_shoot_list').get();
  const recipients = doc.data()?.recipients || [];
  
  const csvLines = ['Name,FirstName,Phone,Branch,MemberId'];
  const phoneList = [];
  
  for (const r of recipients) {
    const cleanPhone = (r.phone || '').replace(/[^\d+]/g, '');
    csvLines.push(`"${(r.name || '').replace(/"/g, '""')}","${(r.firstName || '').replace(/"/g, '""')}","${cleanPhone}","${r.branch || ''}","${r.memberId || ''}"`);
    if (cleanPhone) phoneList.push(cleanPhone);
  }

  const outCsv = path.resolve(process.cwd(), 'INZAN_DRONE_SHOOT_194_MEMBERS.csv');
  const outTxt = path.resolve(process.cwd(), 'INZAN_DRONE_SHOOT_PHONES_ONLY.txt');
  
  fs.writeFileSync(outCsv, csvLines.join('\n'), 'utf8');
  fs.writeFileSync(outTxt, phoneList.join('\n'), 'utf8');

  console.log(`SUCCESS: Exported ${recipients.length} members to:`);
  console.log(`CSV: ${outCsv}`);
  console.log(`TXT: ${outTxt}`);
}

main().catch(console.error);
