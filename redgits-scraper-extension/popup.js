// RedGits Database Extractor - Popup Controller v2.0
document.addEventListener('DOMContentLoaded', () => {
  const domainVal = document.getElementById('domain-val');
  const pageTypeVal = document.getElementById('page-type-val');
  const statusVal = document.getElementById('status-val');
  
  const countMembers = document.getElementById('count-members');
  const countPayments = document.getElementById('count-payments');
  const countCallcenter = document.getElementById('count-callcenter');
  const countLostfound = document.getElementById('count-lostfound');
  const countComplaints = document.getElementById('count-complaints');
  const countStaff = document.getElementById('count-staff');

  const btnScrape = document.getElementById('btn-scrape');
  const btnDownloadAll = document.getElementById('btn-download-all');
  const btnClear = document.getElementById('btn-clear');

  let activeTabUrl = '';
  let activeTabId = null;

  // Initialize UI & load active tab info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      const activeTab = tabs[0];
      activeTabId = activeTab.id;
      activeTabUrl = activeTab.url || '';
      
      try {
        const urlObj = new URL(activeTabUrl);
        domainVal.textContent = urlObj.hostname;
        
        // Run a lightweight pre-scan check to detect page type
        chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          func: () => {
            const path = window.location.pathname;
            if (path.includes('/members/view/')) return 'Member Detail';
            if (path.includes('/members/show/active')) return 'Active Members';
            if (path.includes('/members/show/expired')) return 'Expired Members';
            if (path.includes('/members/show/guest')) return 'Guest Members';
            if (path.includes('/members/show/invitation')) return 'Invitation Members';
            if (path.includes('/members/myshow')) return 'My Members';
            if (path.includes('/members/show')) return 'All Members';
            if (path.includes('/members')) return 'Members Search';
            if (path.includes('/incomes')) return 'Payments/Incomes';
            if (path.includes('/staff/show')) return 'Staff';
            if (path.includes('/callcenter')) return 'Call Center';
            if (path.includes('/lost')) return 'Lost & Found';
            if (path.includes('/complain')) return 'Complaints';
            if (path.includes('/packages')) return 'Packages';
            if (path.includes('/check/')) return 'Attendance';
            if (path.includes('/online_reservations')) return 'Reservations';
            return 'General Page';
          }
        }, (results) => {
          if (results && results[0]) {
            pageTypeVal.innerHTML = `<span class="detected-type">${results[0].result}</span>`;
          }
        });
      } catch (e) {
        domainVal.textContent = 'Invalid URL';
      }
    }
  });

  // Get session counts and update counters
  function updateDatabaseStats() {
    chrome.storage.local.get({
      db_members: {},
      db_payments: {},
      db_calllogs: {},
      db_lostfound: {},
      db_complaints: {},
      db_staff: {}
    }, (result) => {
      const mSize = Object.keys(result.db_members || {}).length;
      const pSize = Object.keys(result.db_payments || {}).length;
      const cSize = Object.keys(result.db_calllogs || {}).length;
      const lfSize = Object.keys(result.db_lostfound || {}).length;
      const compSize = Object.keys(result.db_complaints || {}).length;
      const sSize = Object.keys(result.db_staff || {}).length;

      countMembers.textContent = mSize;
      countPayments.textContent = pSize;
      countCallcenter.textContent = cSize;
      countLostfound.textContent = lfSize;
      countComplaints.textContent = compSize;
      countStaff.textContent = sSize;

      const totalItems = mSize + pSize + cSize + lfSize + compSize + sSize;
      btnDownloadAll.disabled = totalItems === 0;
    });
  }
  
  updateDatabaseStats();

  // Helper to parse column mappings dynamically based on table headers
  function mapHeadersToFields(headers) {
    const map = {};
    headers.forEach((h, index) => {
      const cleanHeader = h.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (cleanHeader.includes('code') || cleanHeader.includes('id') || cleanHeader.includes('memberid')) {
        map.id = index;
      }
      if (cleanHeader.includes('name') || cleanHeader.includes('membername') || cleanHeader.includes('client')) {
        map.name = index;
      }
      if (cleanHeader.includes('phone') || cleanHeader.includes('mobile')) {
        map.phone = index;
      }
      if (cleanHeader.includes('package') || cleanHeader.includes('subscription')) {
        map.package = index;
      }
      if (cleanHeader.includes('status')) {
        map.status = index;
      }
      if (cleanHeader.includes('start') || cleanHeader.includes('from')) {
        map.startDate = index;
      }
      if (cleanHeader.includes('end') || cleanHeader.includes('to') || cleanHeader.includes('expiry')) {
        map.endDate = index;
      }
      if (cleanHeader.includes('amount') || cleanHeader.includes('price')) {
        map.amount = index;
      }
      if (cleanHeader.includes('paid')) {
        map.paid = index;
      }
      if (cleanHeader.includes('sales') || cleanHeader.includes('salesman') || cleanHeader.includes('salesname')) {
        map.salesRep = index;
      }
      if (cleanHeader.includes('coach') || cleanHeader.includes('trainer')) {
        map.coach = index;
      }
      if (cleanHeader.includes('method') || cleanHeader.includes('paymentmethod')) {
        map.method = index;
      }
      if (cleanHeader.includes('date') || cleanHeader.includes('added')) {
        map.date = index;
      }
      if (cleanHeader.includes('priority')) {
        map.priority = index;
      }
      if (cleanHeader.includes('comment') || cleanHeader.includes('notes') || cleanHeader.includes('description')) {
        map.comment = index;
      }
      if (cleanHeader.includes('type') || cleanHeader.includes('calltype')) {
        map.type = index;
      }
    });
    return map;
  }

  // Handle Scrape Button click
  btnScrape.addEventListener('click', () => {
    if (!activeTabId) {
      alert('No active tab found.');
      return;
    }

    statusVal.textContent = 'Extracting data...';
    statusVal.style.color = '#3b82f6';

    chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ['content.js']
    }, (results) => {
      if (chrome.runtime.lastError || !results || !results[0]) {
        console.error(chrome.runtime.lastError);
        statusVal.textContent = 'Scrape Failed';
        statusVal.style.color = '#ef4444';
        alert('Failed to execute script. Please refresh the page and try again.');
        return;
      }

      const data = results[0].result;
      
      // If table reload is requested (e.g. page length changed)
      if (data._needsRetry) {
        statusVal.textContent = 'Setting show all...';
        statusVal.style.color = '#fbbf24';
        // Wait 1.5s and scrape again
        setTimeout(() => {
          chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ['content.js']
          }, (secondResults) => {
            if (secondResults && secondResults[0]) {
              processExtractedData(secondResults[0].result);
            } else {
              statusVal.textContent = 'Auto-retry failed';
              statusVal.style.color = '#ef4444';
            }
          });
        }, 1500);
      } else {
        processExtractedData(data);
      }
    });
  });

  // Process extracted pages and update local storage databases
  function processExtractedData(data) {
    chrome.storage.local.get({
      db_members: {},
      db_payments: {},
      db_calllogs: {},
      db_lostfound: {},
      db_complaints: {},
      db_staff: {}
    }, (db) => {
      let addedCount = 0;
      const pageType = data.pageType;

      // Extract statistics from the main dashboard or tables
      data.tables.forEach(table => {
        const mapping = mapHeadersToFields(table.headers);
        
        table.rows.forEach(row => {
          const item = {};
          table.headers.forEach((h, idx) => {
            item[h] = row[idx] || '';
          });

          // Unique ID extraction
          let id = row[mapping.id] || row[0] || Math.random().toString(36).substring(7);
          id = id.trim();

          // Classify table rows into correct DB collections
          if (pageType.startsWith('members_') || pageType === 'members_search') {
            // Member list table
            db.db_members[id] = {
              redgitsCode: id,
              name: row[mapping.name] || '',
              memberId: row[mapping.memberId] || row[mapping.id] || '',
              phone: row[mapping.phone] || '',
              package: row[mapping.package] || '',
              status: row[mapping.status] || '',
              startDate: row[mapping.startDate] || '',
              endDate: row[mapping.endDate] || '',
              salesRep: row[mapping.salesRep] || '',
              coach: row[mapping.coach] || '',
              scrapedAt: new Date().toISOString(),
              ...db.db_members[id] // Keep detail data if exists
            };
            addedCount++;
          }
          else if (pageType === 'payments') {
            // Payments table
            db.db_payments[id] = {
              paymentCode: id,
              memberName: row[mapping.name] || '',
              amount: parseFloat(row[mapping.amount]) || 0,
              paid: parseFloat(row[mapping.paid]) || 0,
              coach: row[mapping.coach] || '',
              salesRep: row[mapping.salesRep] || '',
              method: row[mapping.method] || '',
              date: row[mapping.date] || '',
              scrapedAt: new Date().toISOString()
            };
            addedCount++;
          }
          else if (pageType === 'callcenter') {
            // Outbound call logs
            db.db_calllogs[id] = {
              logId: id,
              memberName: row[mapping.name] || '',
              memberId: row[mapping.memberId] || '',
              phone: row[mapping.phone] || '',
              callType: row[mapping.type] || '',
              comment: row[mapping.comment] || '',
              date: row[mapping.date] || '',
              scrapedAt: new Date().toISOString()
            };
            addedCount++;
          }
          else if (pageType === 'lost_and_found') {
            // Lost property items
            db.db_lostfound[id] = {
              itemId: id,
              itemName: row[mapping.name] || '',
              category: row[mapping.package] || '', // Category column is often parsed as package
              foundDate: row[mapping.startDate] || '',
              status: row[mapping.status] || '',
              scrapedAt: new Date().toISOString()
            };
            addedCount++;
          }
          else if (pageType === 'complaints') {
            // Member complaints/suggestions
            db.db_complaints[id] = {
              complaintId: id,
              title: row[mapping.name] || '',
              priority: row[mapping.priority] || '',
              status: row[mapping.status] || '',
              date: row[mapping.date] || '',
              scrapedAt: new Date().toISOString()
            };
            addedCount++;
          }
          else if (pageType === 'staff') {
            // Gym staff list
            db.db_staff[id] = {
              staffId: id,
              name: row[mapping.name] || '',
              phone: row[mapping.phone] || '',
              role: row[mapping.package] || '',
              status: row[mapping.status] || '',
              scrapedAt: new Date().toISOString()
            };
            addedCount++;
          }
        });
      });

      // Special handling: Member Detail view page (full individual profile capture)
      if (pageType === 'member_detail' && data.memberDetail) {
        const m = data.memberDetail;
        const id = m.redgitsId;
        
        db.db_members[id] = {
          ...(db.db_members[id] || {}),
          redgitsCode: id,
          name: m.fields['Member Name'] || m.fields['Name'] || db.db_members[id]?.name || '',
          memberId: m.fields['Member ID'] || m.fields['ID'] || '',
          phone: m.fields['Mobile'] || m.fields['Mobile 1'] || m.fields['Phone'] || '',
          backupPhone: m.fields['Mobile 2'] || '',
          status: m.fields['Status'] || '',
          medicalInfo: m.fields['Medical Notes'] || m.fields['Medical Info'] || '',
          nationality: m.fields['Nationality'] || '',
          gender: m.fields['Gender'] || '',
          birthDate: m.fields['Birth Date'] || m.fields['Date of Birth'] || '',
          salesRep: m.fields['Sales Rep'] || m.fields['SalesName'] || '',
          coach: m.fields['Trainer'] || m.fields['Assigned Coach'] || '',
          scrapedAt: new Date().toISOString(),
          // Embed direct profile metrics
          packages: m.packages,
          payments: m.payments,
          attendance: m.attendance,
          comments: m.comments,
          transfers: m.transfers
        };
        addedCount++;
      }

      // Save merged databases back to storage
      chrome.storage.local.set(db, () => {
        statusVal.textContent = `Extracted ${addedCount} records!`;
        statusVal.style.color = '#10b981';
        updateDatabaseStats();
      });
    });
  }

  // Handle Export Consolidated DB click
  btnDownloadAll.addEventListener('click', () => {
    chrome.storage.local.get({
      db_members: {},
      db_payments: {},
      db_calllogs: {},
      db_lostfound: {},
      db_complaints: {},
      db_staff: {}
    }, (db) => {
      // Re-map objects to clean arrays for consolidated export
      const payload = {
        exportedAt: new Date().toISOString(),
        domain: domainVal.textContent,
        members: Object.values(db.db_members),
        payments: Object.values(db.db_payments),
        calllogs: Object.values(db.db_calllogs),
        lostfound: Object.values(db.db_lostfound),
        complaints: Object.values(db.db_complaints),
        staff: Object.values(db.db_staff)
      };

      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const safeGymName = domainVal.textContent.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      
      chrome.downloads.download({
        url: url,
        filename: `redgits_${safeGymName}_database.json`,
        saveAs: true
      }, () => {
        URL.revokeObjectURL(url);
        statusVal.textContent = 'Database Exported!';
        statusVal.style.color = '#10b981';
      });
    });
  });

  // Handle Reset Scraped Session click
  btnClear.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset the extracted database? All accumulated records will be deleted.')) {
      chrome.storage.local.set({
        db_members: {},
        db_payments: {},
        db_calllogs: {},
        db_lostfound: {},
        db_complaints: {},
        db_staff: {}
      }, () => {
        updateDatabaseStats();
        statusVal.textContent = 'Database Reset';
        statusVal.style.color = '#8e8e9f';
      });
    }
  });
});
