/**
 * Scoped Firebase Auth Filtering Tool for Strike Gym Migration
 * 
 * Extracts only Strike staff, coaches, and gym members from the central
 * Firebase export (faa-test-guide-v2), strictly stripping any ATPL Vector,
 * Gamén, or Inzan accounts to prevent cross-venture data leakage.
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || path.join(__dirname, 'all_users_raw.json');
const outputFile = process.argv[3] || path.join(__dirname, 'strike_users_clean.json');

if (!fs.existsSync(inputFile)) {
  console.error(`❌ Input file not found: ${inputFile}`);
  console.error(`Please run the export first: npx firebase auth:export ${inputFile} --format=json --project faa-test-guide-v2`);
  process.exit(1);
}

console.log(`=== Reading Raw Auth Export: ${inputFile} ===`);
const rawContent = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const users = rawContent.users || [];
console.log(`Found ${users.length} total accounts in raw export.`);

let strikeUsers = [];
let excludedCount = 0;
let atplCount = 0;
let gamenCount = 0;
let inzanCount = 0;

for (const user of users) {
  const email = (user.email || '').toLowerCase().trim();
  const displayName = (user.displayName || '').toLowerCase().trim();

  // Explicit blacklist: Never migrate ATPL, Gamén, or Inzan accounts
  if (email.includes('atpl') || email.includes('pilot') || email.includes('easa') || displayName.includes('atpl')) {
    atplCount++;
    excludedCount++;
    continue;
  }

  if (email.includes('gamen') || email.includes('gamer') || email.includes('esports') || displayName.includes('gamen')) {
    gamenCount++;
    excludedCount++;
    continue;
  }

  if (email.includes('inzan') || email.includes('athletics')) {
    inzanCount++;
    excludedCount++;
    continue;
  }

  if (email === 'michaelmitry13@gmail.com') {
    excludedCount++;
    continue;
  }

  // Whitelist criteria for Strike Boxing Gym
  const isStrikeMember = email.includes('@strike.mitrixo-member.local') || 
                         email.includes('strike-member') ||
                         email.startsWith('member-');
                         
  const isStrikeDomain = email.includes('strike-egy') || 
                         email.includes('strikeboxing') || 
                         email.includes('@strike.');

  // If user matches Strike criteria
  if (isStrikeMember || isStrikeDomain) {
    strikeUsers.push(user);
  } else {
    // If it's a general phone-number user or custom domain member tied to Strike
    if (user.phoneNumber && !email) {
      strikeUsers.push(user);
    } else {
      excludedCount++;
    }
  }
}

// Preserve JSON structure expected by `firebase auth:import`
const outputPayload = {
  users: strikeUsers
};

fs.writeFileSync(outputFile, JSON.stringify(outputPayload, null, 2), 'utf8');

console.log(`\n=== Filtering Summary ===`);
console.log(`✅ Strike Accounts Kept: ${strikeUsers.length}`);
console.log(`🚫 Excluded Non-Strike:   ${excludedCount}`);
console.log(`   - ATPL Vector accounts: ${atplCount}`);
console.log(`   - Gamén accounts:       ${gamenCount}`);
console.log(`   - Inzan accounts:       ${inzanCount}`);
console.log(`📁 Saved sanitized export: ${outputFile}\n`);
