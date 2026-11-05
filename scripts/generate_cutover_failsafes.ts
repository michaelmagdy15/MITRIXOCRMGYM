import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';
const GROUND_TRUTH_DIR = path.resolve(process.cwd(), 'backups', 'ground_truth_final');
if (!fs.existsSync(GROUND_TRUTH_DIR)) {
  fs.mkdirSync(GROUND_TRUTH_DIR, { recursive: true });
}

let inzanApp: App;
const existingApps = getApps();
const existingNamed = existingApps.find(a => a.name === 'inzan-failsafe-gen');
if (existingNamed) {
  inzanApp = existingNamed;
} else {
  inzanApp = initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-failsafe-gen');
}
const inzanDb = getFirestore(inzanApp, INZAN_DATABASE_ID);

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

async function generateFailsafes() {
  console.log('1. Generating Ground Truth Snapshot CSVs...');

  // 1A. Active & Frozen Members
  console.log('  • Fetching active members from db-inzanathletics...');
  const clientsSnap = await inzanDb.collection('clients').get();
  const allMembers: any[] = [];
  const activeAndFrozen: any[] = [];
  clientsSnap.forEach(doc => {
    const d = doc.data();
    allMembers.push(d);
    if (d.status === 'Active' || d.status === 'Frozen') {
      activeAndFrozen.push(d);
    }
  });

  const memberCsvHeaders = ['MemberCode', 'RedgitsID', 'Name', 'Phone', 'Status', 'Package', 'StartDate', 'EndDate', 'NationalID', 'SalesName', 'PhotoFile'];
  const memberCsvRows = [memberCsvHeaders.join(',')];
  for (const m of activeAndFrozen) {
    memberCsvRows.push([
      escapeCsv(m.memberId || m.memberCode || ''),
      escapeCsv(m.redgitsId || ''),
      escapeCsv(m.name || ''),
      escapeCsv(m.phone || ''),
      escapeCsv(m.status || ''),
      escapeCsv(m.packageType || ''),
      escapeCsv(m.membershipStartDate || ''),
      escapeCsv(m.membershipEndDate || ''),
      escapeCsv(m.nationalId || ''),
      escapeCsv(m.salesName || ''),
      escapeCsv(m.photoLocal || ''),
    ].join(','));
  }
  const memberCsvPath = path.join(GROUND_TRUTH_DIR, 'active_and_frozen_members.csv');
  fs.writeFileSync(memberCsvPath, memberCsvRows.join('\n'), 'utf8');
  console.log(`    ✓ Saved ${activeAndFrozen.length} active/frozen members to ${memberCsvPath}`);

  // 1B. Open Installments & Debtors
  console.log('  • Fetching debtors from db-inzanathletics...');
  const debtorSnap = await inzanDb.collection('debtors').get();
  const debtorsList: any[] = [];
  debtorSnap.forEach(doc => debtorsList.push(doc.data()));

  const debtorCsvHeaders = ['MemberID', 'ClientName', 'Phone', 'Package', 'RemainingAmountEGP', 'PaidAmountEGP', 'StartDate', 'EndDate', 'SalesName', 'Status'];
  const debtorCsvRows = [debtorCsvHeaders.join(',')];
  for (const d of debtorsList) {
    debtorCsvRows.push([
      escapeCsv(d.memberId || ''),
      escapeCsv(d.clientName || ''),
      escapeCsv(d.phone || ''),
      escapeCsv(d.packageType || ''),
      escapeCsv(d.remainingAmount || 0),
      escapeCsv(d.paidAmount || 0),
      escapeCsv(d.startDate || ''),
      escapeCsv(d.endDate || ''),
      escapeCsv(d.salesName || ''),
      escapeCsv(d.status || ''),
    ].join(','));
  }
  const debtorCsvPath = path.join(GROUND_TRUTH_DIR, 'open_installments_and_debtors.csv');
  fs.writeFileSync(debtorCsvPath, debtorCsvRows.join('\n'), 'utf8');
  console.log(`    ✓ Saved ${debtorsList.length} debtor records to ${debtorCsvPath}`);

  // 1C. PT Remaining Balances & Packages
  console.log('  • Fetching PT Packages from db-inzanathletics...');
  const pkgSnap = await inzanDb.collection('packages').get();
  const ptPackages: any[] = [];
  pkgSnap.forEach(doc => {
    const d = doc.data();
    if (d.type === 'Private' || (d.name && d.name.toLowerCase().includes('pt'))) {
      ptPackages.push(d);
    }
  });

  const ptCsvHeaders = ['PackageID', 'Name', 'PriceEGP', 'Sessions', 'DurationDays', 'Category'];
  const ptCsvRows = [ptCsvHeaders.join(',')];
  for (const p of ptPackages) {
    ptCsvRows.push([
      escapeCsv(p.id || ''),
      escapeCsv(p.name || ''),
      escapeCsv(p.price || 0),
      escapeCsv(p.sessions || 0),
      escapeCsv(p.expiryDays || 30),
      escapeCsv(p.type || 'Private'),
    ].join(','));
  }
  const ptCsvPath = path.join(GROUND_TRUTH_DIR, 'pt_remaining_balances.csv');
  fs.writeFileSync(ptCsvPath, ptCsvRows.join('\n'), 'utf8');
  console.log(`    ✓ Saved ${ptPackages.length} PT package rules to ${ptCsvPath}`);

  // 2. Generating Offline Emergency Reception Desk (single-file HTML)
  console.log('2. Generating Offline Emergency Reception Desk (emergency_desk.html)...');
  const debtMapByMemberId: Record<string, number> = {};
  for (const d of debtorsList) {
    const mid = String(d.memberId || '').trim();
    if (mid) debtMapByMemberId[mid] = (debtMapByMemberId[mid] || 0) + Number(d.remainingAmount || 0);
  }

  const compactDeskMembers = activeAndFrozen.map(m => {
    const mid = String(m.memberId || m.memberCode || '').trim();
    return {
      c: mid,
      r: m.redgitsId || '',
      n: m.name || '',
      p: m.phone || '',
      s: m.status || 'Active',
      pkg: m.packageType || 'Membership',
      e: m.membershipEndDate || '',
      d: debtMapByMemberId[mid] || 0,
    };
  });

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>INZAN ATHLETICS — Emergency Offline Reception Desk</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-b: 1px solid #334155; padding-bottom: 15px; margin-bottom: 20px; }
    .title { font-size: 24px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 10px; }
    .badge { background: #dc2626; color: white; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .search-box { width: 100%; max-width: 600px; margin-bottom: 20px; position: relative; }
    .search-input { width: 100%; padding: 14px 20px; font-size: 18px; border-radius: 12px; border: 2px solid #38bdf8; background: #1e293b; color: white; outline: none; }
    .search-input:focus { border-color: #60a5fa; box-shadow: 0 0 15px rgba(56, 189, 248, 0.4); }
    .stats { display: flex; gap: 15px; margin-bottom: 20px; }
    .stat-card { background: #1e293b; border: 1px solid #334155; padding: 12px 18px; border-radius: 8px; font-size: 14px; }
    .stat-card strong { color: #38bdf8; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }
    th { background: #0b1329; color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 12px; }
    tr:hover { background: #24334d; }
    .status-active { color: #4ade80; font-weight: 700; }
    .status-frozen { color: #38bdf8; font-weight: 700; }
    .debt-badge { background: #7f1d1d; color: #fca5a5; padding: 3px 8px; border-radius: 4px; font-weight: 700; }
    .btn-checkin { background: #10b981; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; }
    .btn-checkin:hover { background: #059669; }
    .checkin-log { margin-top: 30px; background: #1e293b; padding: 15px; border-radius: 8px; border: 1px solid #334155; }
    .log-item { padding: 6px 0; border-bottom: 1px solid #334155; font-size: 13px; color: #94a3b8; }
    .log-item strong { color: white; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>⚡ INZAN ATHLETICS — FRONT DESK EMERGENCY FAILSAFE</span>
      <span class="badge">Offline Standalone Mode</span>
    </div>
    <div style="color: #94a3b8; font-size: 13px;">Zero Internet Required • Instant Local Search</div>
  </div>

  <div class="stats">
    <div class="stat-card">Active Members: <strong id="activeCount">${activeAndFrozen.length}</strong></div>
    <div class="stat-card">Total Debtors: <strong id="debtorCount">${debtorsList.length}</strong></div>
    <div class="stat-card">Offline Shift Check-ins: <strong id="sessionCheckinCount">0</strong></div>
  </div>

  <div class="search-box">
    <input type="text" id="searchInput" class="search-input" placeholder="Search by Code (e.g. 302), Name, or Phone..." autofocus>
  </div>

  <table>
    <thead>
      <tr>
        <th>Code / ID</th>
        <th>Member Name</th>
        <th>Phone</th>
        <th>Status</th>
        <th>Current Package</th>
        <th>Expiry Date</th>
        <th>Open Debt (EGP)</th>
        <th>Quick Check-in</th>
      </tr>
    </thead>
    <tbody id="memberTableBody"></tbody>
  </table>

  <div class="checkin-log">
    <h3 style="margin-bottom: 10px; font-size: 15px; color: #38bdf8;">📝 Offline Emergency Attendance Log (Preserved in Browser Memory & Downloadable)</h3>
    <div id="logList">No check-ins recorded yet this shift.</div>
    <button onclick="exportLogCsv()" style="margin-top: 10px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 700;">💾 Export Shift Check-ins CSV</button>
  </div>

  <script>
    const members = ${JSON.stringify(compactDeskMembers)};
    const shiftLogs = [];

    const searchInput = document.getElementById('searchInput');
    const tbody = document.getElementById('memberTableBody');
    const logList = document.getElementById('logList');
    const sessionCheckinCount = document.getElementById('sessionCheckinCount');

    function renderTable(list) {
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 30px;">No matching members found.</td></tr>';
        return;
      }
      tbody.innerHTML = list.slice(0, 50).map(m => {
        const debtAlert = m.d > 0 ? \`<span class="debt-badge">⚠️ OWES EGP \${m.d.toLocaleString()}</span>\` : '<span style="color:#64748b;">EGP 0</span>';
        const stClass = m.s === 'Frozen' ? 'status-frozen' : 'status-active';
        return \`
          <tr>
            <td><strong>\${m.c || m.r}</strong></td>
            <td><strong>\${m.n}</strong></td>
            <td>\${m.p || '—'}</td>
            <td><span class="\${stClass}">\${m.s}</span></td>
            <td>\${m.pkg}</td>
            <td>\${m.e || '—'}</td>
            <td>\${debtAlert}</td>
            <td>
              <button class="btn-checkin" onclick="recordCheckin('\${m.c || m.r}', '\${m.n.replace(/'/g, "\\\\'")}', \${m.d})">✅ Check-In</button>
            </td>
          </tr>
        \`;
      }).join('');
    }

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) { renderTable(members.slice(0, 30)); return; }
      const filtered = members.filter(m => 
        (m.c && m.c.toLowerCase().includes(q)) ||
        (m.r && m.r.toLowerCase().includes(q)) ||
        (m.n && m.n.toLowerCase().includes(q)) ||
        (m.p && m.p.toLowerCase().includes(q))
      );
      renderTable(filtered);
    });

    function recordCheckin(code, name, debt) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString();
      const entry = { code, name, time: timeStr, debt };
      shiftLogs.unshift(entry);
      sessionCheckinCount.innerText = shiftLogs.length;

      if (debt > 0) {
        alert('⚠️ ATTENTION RECEPTION:\\n\\nMember ' + name + ' has an UNPAID DEBT of EGP ' + debt.toLocaleString() + '!\\nPlease collect installment at the desk.');
      }

      logList.innerHTML = shiftLogs.map(l => 
        \`<div class="log-item">⏱️ <strong>\${l.time}</strong> — \${l.name} (Code: \${l.code}) \${l.debt > 0 ? '<span style="color:#f87171;">[DEBT OWED]</span>' : '[OK]'}</div>\`
      ).join('');
    }

    function exportLogCsv() {
      if (shiftLogs.length === 0) { alert('No check-ins logged yet.'); return; }
      let csv = 'Timestamp,MemberCode,MemberName,DebtOwed\\n';
      shiftLogs.forEach(l => {
        csv += \`"\${l.time}","\${l.code}","\${l.name}","\${l.debt}"\\n\`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'emergency_inzan_checkins_' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
    }

    // Initial render
    renderTable(members.slice(0, 30));
  </script>
</body>
</html>`;

  const deskHtmlPath = path.resolve(process.cwd(), 'backups', 'emergency_desk.html');
  fs.writeFileSync(deskHtmlPath, htmlContent, 'utf8');

  // Also put a copy in public/ for instant localhost access
  const publicDeskPath = path.resolve(process.cwd(), 'public', 'emergency_desk.html');
  fs.writeFileSync(publicDeskPath, htmlContent, 'utf8');

  console.log(`    ✓ Generated standalone offline emergency app: ${deskHtmlPath}`);
  console.log(`    ✓ Hosted copy ready at public/emergency_desk.html`);
  console.log('Failsafes generation completed successfully.');
}

generateFailsafes().catch(console.error);
