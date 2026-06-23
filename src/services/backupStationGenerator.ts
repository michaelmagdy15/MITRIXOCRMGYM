/**
 * Generates a personalized backup-station HTML file for a specific gym tenant.
 * The generated file works offline, stores data in localStorage, and tags
 * all exported records with the gym's tenantId for safe re-import.
 */
export interface BackupStationConfig {
  gymName: string;
  tenantId: string;
  brandColor: string;
}

export function generateBackupStationHTML(config: BackupStationConfig): string {
  const { gymName, tenantId, brandColor } = config;
  const safeGymName = gymName || 'My Gym';
  const safeTenantId = tenantId || 'default';
  const safeBrandColor = brandColor || '#1a1a1a';

  // Read the template and inject config
  // We build the HTML as a template string based on backup-station.html
  // with these personalizations:
  // 1. Title: "[GymName] — Backup Station"
  // 2. Header h1: "⚡ [GymName] Backup Station"
  // 3. Badge background color: safeBrandColor
  // 4. localStorage key: "backup_station_[tenantId]_records"
  // 5. Export filename: "[tenantId]_backup_YYYY-MM-DD.json"
  // 6. Exported JSON includes { tenantId, gymName } at root level
  // 7. Each record includes tenantId field

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeGymName} — Backup Station</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #f0f0f0; min-height: 100vh; }
  .header { background: #1a1a1a; border-bottom: 1px solid #2a2a2a; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
  .header .badge { color: #fff; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 99px; background-color: ${safeBrandColor}; }
  .header .gym-name { font-size: 12px; color: #666; margin-top: 2px; }
  .tabs { display: flex; background: #1a1a1a; border-bottom: 1px solid #2a2a2a; padding: 0 24px; }
  .tab { padding: 12px 20px; cursor: pointer; font-size: 14px; font-weight: 500; color: #888; border-bottom: 2px solid transparent; transition: all 0.15s; }
  .tab.active { color: #f0f0f0; border-bottom-color: #f0f0f0; }
  .tab:hover:not(.active) { color: #ccc; }
  .content { max-width: 600px; margin: 32px auto; padding: 0 24px; }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .card p { font-size: 13px; color: #888; margin-bottom: 20px; }
  .field { margin-bottom: 16px; }
  .field label { display: block; font-size: 12px; font-weight: 500; color: #aaa; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .field input, .field select { width: 100%; background: #111; border: 1px solid #333; color: #f0f0f0; border-radius: 8px; padding: 10px 14px; font-size: 14px; outline: none; transition: border-color 0.15s; }
  .field input:focus, .field select:focus { border-color: #555; }
  .field select option { background: #1a1a1a; }
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
  .btn-primary { background: #f0f0f0; color: #111; }
  .btn-primary:hover { background: #ddd; }
  .btn-danger { background: #7f1d1d; color: #fca5a5; }
  .btn-danger:hover { background: #991b1b; }
  .btn-export { background: #14532d; color: #86efac; }
  .btn-export:hover { background: #166534; }
  .records-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .records-header h2 { font-size: 15px; font-weight: 600; }
  .count-badge { background: #333; color: #aaa; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 99px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; color: #666; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2a2a2a; }
  td { padding: 10px 12px; border-bottom: 1px solid #1f1f1f; color: #ccc; }
  tr:last-child td { border-bottom: none; }
  .type-badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
  .type-checkin { background: #1e3a5f; color: #93c5fd; }
  .type-payment { background: #1a2e1a; color: #86efac; }
  .type-lead { background: #3b1f4e; color: #d8b4fe; }
  .empty { text-align: center; padding: 40px 0; color: #555; font-size: 14px; }
  .success-toast { position: fixed; bottom: 24px; right: 24px; color: #fff; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; opacity: 0; pointer-events: none; transition: opacity 0.3s; background-color: ${safeBrandColor}; }
  .success-toast.show { opacity: 1; }
  .panel { display: none; }
  .panel.active { display: block; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .tenant-info { font-size: 11px; color: #555; text-align: center; padding: 8px; }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>⚡ Backup Station</h1>
    <div class="gym-name">${safeGymName}</div>
  </div>
  <span class="badge">OFFLINE MODE</span>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('checkin')">Check-in</div>
  <div class="tab" onclick="switchTab('payment')">Payment</div>
  <div class="tab" onclick="switchTab('lead')">Lead</div>
</div>

<div class="content">

  <div id="panel-checkin" class="panel active">
    <div class="card">
      <h2>Member Check-in</h2>
      <p>Log a member arriving at the gym.</p>
      <div class="field"><label>Member Name</label><input id="ci-name" type="text" placeholder="e.g. Ahmed Mohamed" /></div>
      <div class="field"><label>Member ID <span style="color:#555">(optional)</span></label><input id="ci-id" type="text" placeholder="e.g. 112" /></div>
      <button class="btn btn-primary" onclick="saveCheckin()">✅ Log Check-in</button>
    </div>
  </div>

  <div id="panel-payment" class="panel">
    <div class="card">
      <h2>Record Payment</h2>
      <p>Record a payment received while offline.</p>
      <div class="field"><label>Member Name</label><input id="pay-name" type="text" placeholder="e.g. Sara Ali" /></div>
      <div class="field"><label>Package / Service</label><input id="pay-pkg" type="text" placeholder="e.g. Monthly Membership" /></div>
      <div class="field"><label>Amount</label><input id="pay-amount" type="number" placeholder="0" min="0" /></div>
      <div class="field"><label>Payment Method</label>
        <select id="pay-method">
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="transfer">Bank Transfer</option>
          <option value="other">Other</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="savePayment()">💳 Record Payment</button>
    </div>
  </div>

  <div id="panel-lead" class="panel">
    <div class="card">
      <h2>New Lead</h2>
      <p>Log a new prospect who visited or called.</p>
      <div class="field"><label>Name</label><input id="lead-name" type="text" placeholder="e.g. Omar Khaled" /></div>
      <div class="field"><label>Phone</label><input id="lead-phone" type="tel" placeholder="e.g. 01012345678" /></div>
      <div class="field"><label>Interest</label>
        <select id="lead-interest">
          <option value="membership">Membership</option>
          <option value="pt">Personal Training</option>
          <option value="group">Group Classes</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="field"><label>Source</label>
        <select id="lead-source">
          <option value="walk-in">Walk-in</option>
          <option value="phone">Phone Call</option>
          <option value="referral">Referral</option>
          <option value="social">Social Media</option>
          <option value="other">Other</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="saveLead()">🎯 Save Lead</button>
    </div>
  </div>

  <div class="card">
    <div class="records-header">
      <h2>Session Records</h2>
      <span class="count-badge" id="record-count">0 records</span>
    </div>
    <div id="records-container"><div class="empty">No records yet — add a check-in, payment, or lead above.</div></div>
    <div class="actions" style="margin-top:20px">
      <button class="btn btn-export" onclick="exportJSON()">⬇️ Export JSON</button>
      <button class="btn btn-danger" onclick="clearAll()">🗑️ Clear All</button>
    </div>
  </div>

  <div class="tenant-info">Gym: ${safeGymName} · ID: ${safeTenantId}</div>

</div>

<div class="success-toast" id="toast"></div>

<script>
const GYM_CONFIG = { tenantId: '${safeTenantId}', gymName: '${safeGymName}', brandColor: '${safeBrandColor}' };
const STORAGE_KEY = 'backup_station_' + GYM_CONFIG.tenantId + '_records';

function getRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  renderTable();
}
function uid() { return 'backup-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); }
function now() { return new Date().toISOString(); }
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    const tabs = ['checkin', 'payment', 'lead'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
}
function saveCheckin() {
  const name = document.getElementById('ci-name').value.trim();
  if (!name) { alert('Please enter a member name.'); return; }
  const records = getRecords();
  records.push({ id: uid(), type: 'checkin', tenantId: GYM_CONFIG.tenantId, memberName: name, memberId: document.getElementById('ci-id').value.trim(), timestamp: now(), source: 'backup-station' });
  saveRecords(records);
  document.getElementById('ci-name').value = '';
  document.getElementById('ci-id').value = '';
  toast('✅ Check-in logged');
}
function savePayment() {
  const name = document.getElementById('pay-name').value.trim();
  const amount = parseFloat(document.getElementById('pay-amount').value);
  if (!name) { alert('Please enter a member name.'); return; }
  if (isNaN(amount) || amount < 0) { alert('Please enter a valid amount.'); return; }
  const records = getRecords();
  records.push({ id: uid(), type: 'payment', tenantId: GYM_CONFIG.tenantId, clientName: name, package: document.getElementById('pay-pkg').value.trim(), amount, method: document.getElementById('pay-method').value, timestamp: now(), source: 'backup-station' });
  saveRecords(records);
  document.getElementById('pay-name').value = '';
  document.getElementById('pay-pkg').value = '';
  document.getElementById('pay-amount').value = '';
  toast('💳 Payment recorded');
}
function saveLead() {
  const name = document.getElementById('lead-name').value.trim();
  if (!name) { alert('Please enter a name.'); return; }
  const records = getRecords();
  records.push({ id: uid(), type: 'lead', tenantId: GYM_CONFIG.tenantId, name, phone: document.getElementById('lead-phone').value.trim(), interest: document.getElementById('lead-interest').value, leadSource: document.getElementById('lead-source').value, timestamp: now(), source: 'backup-station' });
  saveRecords(records);
  document.getElementById('lead-name').value = '';
  document.getElementById('lead-phone').value = '';
  toast('🎯 Lead saved');
}
function renderTable() {
  const records = getRecords();
  const countEl = document.getElementById('record-count');
  countEl.textContent = records.length + ' record' + (records.length !== 1 ? 's' : '');
  const container = document.getElementById('records-container');
  if (records.length === 0) {
    container.innerHTML = '<div class="empty">No records yet — add a check-in, payment, or lead above.</div>';
    return;
  }
  const rows = [...records].reverse().map(r => {
    const typeLabel = r.type === 'checkin' ? 'Check-in' : r.type === 'payment' ? 'Payment' : 'Lead';
    const typeClass = 'type-' + r.type;
    const detail = r.type === 'checkin' ? (r.memberName + (r.memberId ? ' #' + r.memberId : '')) :
                   r.type === 'payment' ? (r.clientName + ' — ' + (r.amount || 0) + ' (' + r.method + ')') :
                   (r.name + (r.phone ? ' · ' + r.phone : ''));
    const time = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return '<tr><td><span class="type-badge ' + typeClass + '">' + typeLabel + '</span></td><td>' + detail + '</td><td>' + time + '</td></tr>';
  }).join('');
  container.innerHTML = '<table><thead><tr><th>Type</th><th>Details</th><th>Time</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
function exportJSON() {
  const records = getRecords();
  if (records.length === 0) { alert('No records to export.'); return; }
  const checkins = records.filter(r => r.type === 'checkin');
  const payments = records.filter(r => r.type === 'payment');
  const leads = records.filter(r => r.type === 'lead');
  const data = { tenantId: GYM_CONFIG.tenantId, gymName: GYM_CONFIG.gymName, exportedAt: now(), totalRecords: records.length, checkins, payments, leads };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = GYM_CONFIG.tenantId + '_backup_' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('⬇️ Exported ' + records.length + ' records');
}
function clearAll() {
  if (!confirm('Clear all session records? Make sure you have exported first.')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderTable();
  toast('🗑️ Cleared');
}
renderTable();
</script>
</body>
</html>`;
}
