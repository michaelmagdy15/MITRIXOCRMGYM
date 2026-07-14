// RedGits Database Extractor — Content Script v2.0
// Extracts ALL records from DataTables, forms, and page content
(() => {
  /**
   * Extract ALL rows from a DataTable (handles pagination).
   * RedGits uses jQuery DataTables with server-side or client-side pagination.
   * We switch to "show all" or iterate pages to get every record.
   */
  function extractAllTableRows(tableEl) {
    const headers = [];
    const rows = [];

    // Get headers
    const ths = tableEl.querySelectorAll('thead th, th');
    ths.forEach(th => {
      const text = th.innerText.trim().replace(/[\n\r]+/g, ' ');
      if (text && text !== '') headers.push(text);
    });

    // If no thead, try first row
    if (headers.length === 0) {
      const firstRow = tableEl.querySelector('tr');
      if (firstRow) {
        firstRow.querySelectorAll('td, th').forEach(cell => {
          headers.push(cell.innerText.trim());
        });
      }
    }

    // Get ALL visible body rows
    const bodyRows = tableEl.querySelectorAll('tbody tr');
    bodyRows.forEach(tr => {
      // Skip "no data" rows
      const text = tr.innerText.trim();
      if (text.includes('No data available') || text.includes('No records')) return;
      if (tr.classList.contains('dataTables_empty') || tr.querySelector('.dataTables_empty')) return;

      const cells = [];
      tr.querySelectorAll('td').forEach(td => {
        // Extract text, but also check for links and images
        let cellValue = td.innerText.trim().replace(/[\n\r]+/g, ' ');
        
        // Check for links (like "View" action links with member IDs)
        const link = td.querySelector('a[href]');
        if (link) {
          const href = link.getAttribute('href') || '';
          if (href && !cellValue) {
            cellValue = href;
          } else if (href && (href.includes('/view/') || href.includes('/edit/'))) {
            // Extract the ID from view/edit links
            const idMatch = href.match(/\/(\d+)(?:\?|$|\/)/);
            if (idMatch) {
              cellValue = cellValue + ` [ID:${idMatch[1]}]`;
            }
          }
        }

        // Check for images (profile photos)
        const img = td.querySelector('img');
        if (img && img.src) {
          cellValue = cellValue ? `${cellValue} [img:${img.src}]` : `[img:${img.src}]`;
        }

        // Check for badges/labels
        const badge = td.querySelector('.badge, .label, .tag, [class*="badge"], [class*="label"]');
        if (badge && !cellValue) {
          cellValue = badge.innerText.trim();
        }

        // Check for color indicators
        const colorEl = td.querySelector('[style*="background"], [style*="color"]');
        if (colorEl && colorEl.style) {
          const bg = colorEl.style.backgroundColor;
          if (bg) cellValue = cellValue ? `${cellValue} [color:${bg}]` : `[color:${bg}]`;
        }

        cells.push(cellValue);
      });

      if (cells.length > 0 && cells.some(c => c !== '')) {
        rows.push(cells);
      }
    });

    return { headers, rows, totalRows: rows.length };
  }

  /**
   * Try to show ALL records by changing the DataTable page length select.
   * Returns true if we successfully changed it.
   */
  function tryShowAllRecords() {
    // Look for the DataTables length selector
    const lengthSelects = document.querySelectorAll('select[name$="_length"], .dataTables_length select');
    let changed = false;
    
    lengthSelects.forEach(select => {
      // Find the maximum option
      const options = Array.from(select.querySelectorAll('option'));
      if (options.length > 0) {
        // Sort by value descending and pick the largest
        const maxOption = options.reduce((max, opt) => {
          const val = parseInt(opt.value, 10);
          return val > parseInt(max.value, 10) ? opt : max;
        }, options[0]);
        
        if (maxOption && select.value !== maxOption.value) {
          select.value = maxOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          changed = true;
        }
      }
    });
    
    return changed;
  }

  /**
   * Extract form field data including all select options and values.
   */
  function extractFormData() {
    const forms = [];
    const allForms = document.querySelectorAll('form, [class*="form-container"], .modal-content');
    const processedInputs = new Set();

    allForms.forEach(form => {
      const formData = {
        id: form.getAttribute('id') || '',
        action: form.getAttribute('action') || '',
        method: form.getAttribute('method') || '',
        fields: []
      };

      form.querySelectorAll('input, select, textarea').forEach(input => {
        if (processedInputs.has(input)) return;
        processedInputs.add(input);

        const field = {
          tag: input.tagName.toLowerCase(),
          type: input.getAttribute('type') || input.tagName.toLowerCase(),
          name: input.getAttribute('name') || '',
          id: input.getAttribute('id') || '',
          value: input.value || '',
          placeholder: input.getAttribute('placeholder') || '',
          label: '',
          required: input.hasAttribute('required'),
          options: []
        };

        // Find label
        if (field.id) {
          const labelEl = document.querySelector(`label[for="${field.id}"]`);
          if (labelEl) field.label = labelEl.innerText.trim();
        }
        if (!field.label) {
          const parent = input.closest('.form-group, .field, .input-group');
          if (parent) {
            const label = parent.querySelector('label, .control-label, .form-label');
            if (label) field.label = label.innerText.trim();
          }
        }

        // Extract select options
        if (input.tagName.toLowerCase() === 'select') {
          input.querySelectorAll('option').forEach(opt => {
            field.options.push({
              value: opt.value,
              text: opt.innerText.trim(),
              selected: opt.selected
            });
          });
        }

        // Skip hidden CSRF tokens and empty inputs
        if (field.type === 'hidden' && (field.name === '_token' || field.name === 'csrf')) return;

        formData.fields.push(field);
      });

      if (formData.fields.length > 0) {
        forms.push(formData);
      }
    });

    return forms;
  }

  /**
   * Extract member detail data from a member view page.
   * RedGits URLs: /admin/members/view/{id}
   */
  function extractMemberDetails() {
    const path = window.location.pathname;
    if (!path.includes('/members/view/')) return null;

    const idMatch = path.match(/\/view\/(\d+)/);
    const memberId = idMatch ? idMatch[1] : '';

    const details = {
      redgitsId: memberId,
      fields: {},
      packages: [],
      payments: [],
      attendance: [],
      comments: [],
      transfers: []
    };

    // Extract key-value pairs from detail rows
    document.querySelectorAll('.form-group, .detail-row, tr, .info-row, .row').forEach(row => {
      const label = row.querySelector('label, .control-label, th, .detail-label, strong');
      const value = row.querySelector('.form-control-static, td:last-child, .detail-value, span:not(label)');
      if (label && value) {
        const key = label.innerText.trim().replace(/[:\s]+$/, '');
        const val = value.innerText.trim();
        if (key && val && key !== val && key.length < 50) {
          details.fields[key] = val;
        }
      }
    });

    // Extract profile image
    const profileImg = document.querySelector('.profile-img img, .member-photo img, .avatar img, img[class*="profile"]');
    if (profileImg) {
      details.fields['profileImage'] = profileImg.src;
    }

    // Extract tabs content (packages, payments, attendance, etc.)
    document.querySelectorAll('table').forEach(table => {
      const tableData = extractAllTableRows(table);
      if (tableData.rows.length > 0) {
        // Try to classify the table by its headers
        const headerStr = tableData.headers.join(' ').toLowerCase();
        if (headerStr.includes('package') || headerStr.includes('subscription')) {
          details.packages.push(tableData);
        } else if (headerStr.includes('payment') || headerStr.includes('amount') || headerStr.includes('income')) {
          details.payments.push(tableData);
        } else if (headerStr.includes('check') || headerStr.includes('attendance') || headerStr.includes('activity')) {
          details.attendance.push(tableData);
        } else if (headerStr.includes('comment') || headerStr.includes('note')) {
          details.comments.push(tableData);
        } else if (headerStr.includes('transfer')) {
          details.transfers.push(tableData);
        }
      }
    });

    return details;
  }

  /**
   * Extract all data from the current page.
   */
  function extractPage() {
    const path = window.location.pathname;
    const url = window.location.href;

    // Determine what kind of page this is
    let pageType = 'unknown';
    if (path.includes('/members/view/')) pageType = 'member_detail';
    else if (path.includes('/members/show/active')) pageType = 'members_active';
    else if (path.includes('/members/show/expired')) pageType = 'members_expired';
    else if (path.includes('/members/show/guest')) pageType = 'members_guest';
    else if (path.includes('/members/show/invitation')) pageType = 'members_invitation';
    else if (path.includes('/members/myshow')) pageType = 'members_my';
    else if (path.includes('/members/show')) pageType = 'members_all';
    else if (path.includes('/members')) pageType = 'members_search';
    else if (path.includes('/incomes')) pageType = 'payments';
    else if (path.includes('/staff/show')) pageType = 'staff';
    else if (path.includes('/reports')) pageType = 'reports';
    else if (path.includes('/callcenter')) pageType = 'callcenter';
    else if (path.includes('/lost')) pageType = 'lost_and_found';
    else if (path.includes('/complain')) pageType = 'complaints';
    else if (path.includes('/packages')) pageType = 'packages';
    else if (path.includes('/check/')) pageType = 'checkins';
    else if (path.includes('/online_reservations')) pageType = 'reservations';
    else if (path.includes('/survey')) pageType = 'surveys';
    else if (path.includes('/advertising')) pageType = 'marketing';
    else if (path.includes('/keywords')) pageType = 'keywords';
    else if (path.includes('/leads')) pageType = 'leads';
    else if (path.includes('/items')) pageType = 'items';
    else if (path.includes('/locations')) pageType = 'locations';
    else if (path.includes('/payment_method')) pageType = 'payment_methods';
    else if (path.includes('/rating')) pageType = 'ratings';
    else if (path.includes('/tasks')) pageType = 'tasks';
    else if (path.includes('/setting')) pageType = 'settings';
    else if (path.includes('/home')) pageType = 'dashboard';

    const result = {
      url,
      path,
      pageType,
      pageTitle: document.title,
      scrapedAt: new Date().toISOString(),
      tables: [],
      forms: [],
      memberDetail: null,
      stats: [],
      pagination: null
    };

    // 1. Try to show all records first
    const showAllChanged = tryShowAllRecords();
    if (showAllChanged) {
      // Give the table time to reload — we'll return a marker
      result._needsRetry = true;
      result._retryReason = 'Changed page length to maximum, need to re-scrape after table loads';
    }

    // 2. Extract all tables
    document.querySelectorAll('table').forEach((table, idx) => {
      const tableData = extractAllTableRows(table);
      if (tableData.headers.length > 0 || tableData.rows.length > 0) {
        tableData.tableIndex = idx;
        tableData.tableId = table.getAttribute('id') || '';
        tableData.tableClass = table.getAttribute('class') || '';
        result.tables.push(tableData);
      }
    });

    // 3. Extract forms with all values
    result.forms = extractFormData();

    // 4. Member detail extraction
    if (pageType === 'member_detail') {
      result.memberDetail = extractMemberDetails();
    }

    // 5. Extract statistics / KPI cards
    document.querySelectorAll('[class*="card"], [class*="widget"], [class*="tile"], .stats-item, .info-box, .small-box').forEach(card => {
      const text = card.innerText.trim();
      if (text.length < 200 && text.length > 3) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length >= 1) {
          result.stats.push({
            lines,
            raw: text.replace(/\s+/g, ' ')
          });
        }
      }
    });

    // 6. Extract pagination info
    const pagingInfo = document.querySelector('.dataTables_info, .paging-info');
    if (pagingInfo) {
      result.pagination = {
        text: pagingInfo.innerText.trim(),
        parsed: null
      };
      // Try to parse "Showing 1 to 50 of 1,234 entries"
      const match = pagingInfo.innerText.match(/Showing\s+(\d[\d,]*)\s+to\s+(\d[\d,]*)\s+of\s+([\d,]+)/i);
      if (match) {
        result.pagination.parsed = {
          from: parseInt(match[1].replace(/,/g, ''), 10),
          to: parseInt(match[2].replace(/,/g, ''), 10),
          total: parseInt(match[3].replace(/,/g, ''), 10)
        };
      }
    }

    // 7. Extract all links with data IDs (for member listing pages)
    if (pageType.startsWith('members_') && pageType !== 'member_detail') {
      const memberLinks = [];
      document.querySelectorAll('a[href*="/members/view/"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const idMatch = href.match(/\/view\/(\d+)/);
        if (idMatch) {
          memberLinks.push({
            redgitsCode: idMatch[1],
            text: a.innerText.trim(),
            href
          });
        }
      });
      result.memberViewLinks = memberLinks;
    }

    return result;
  }

  return extractPage();
})();
