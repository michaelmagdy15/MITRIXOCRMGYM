import fs from 'fs';

const redgitsPath = 'docs/redgits_pages/redgits_inzan_database.json';
if (fs.existsSync(redgitsPath)) {
  const data = JSON.parse(fs.readFileSync(redgitsPath, 'utf8'));
  console.log('RedGits membersList length:', data.membersList?.length);
  console.log('RedGits membersDetailScraped count:', Object.keys(data.membersDetailScraped || {}).length);
  if (data.membersList?.length > 0) {
    console.log('Sample member:', data.membersList[0]);
  }
} else {
  console.log('RedGits file not found');
}
