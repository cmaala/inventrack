// ════════════════════════════════════════════════════════
//  DATA STORE — localStorage persistence
// ════════════════════════════════════════════════════════
const STORE_KEY = 'inventrack_data';

async function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (!data.entryLogs) data.entryLogs = [];
      if (!data.itemHistory) data.itemHistory = [];
      return data;
    }
  } catch(e) {
    console.error('Error reading localStorage', e);
  }

  try {
    const res = await fetch('data.json');
    const data = await res.json();
    return data;
  } catch(e) {
    console.error('Error fetching data.json', e);
    return { items: [], transactions: [], categories: [], suppliers: [], itemHistory: [], entryLogs: [], settings: { currency: '₱', markup: 20, tax: 12, enableTax: false, showMargin: true, minStock: 5, company: 'My Store' } };
  }
}

function saveStore() { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
let db;

// ════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════
function uid() { return Math.random().toString(36).substring(2, 10) + Date.now().toString(36); }
function iso() { return new Date().toISOString(); }
function fmt(n) { return db.settings.currency + Number(n||0).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function fmtDate(iso) { return new Date(iso).toLocaleString('en-PH', {month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function fmtDay(iso) { return new Date(iso).toLocaleDateString('en-PH', {month:'short',day:'numeric'}); }

function toast(msg, type='success') {
  const el = document.getElementById('toast');
  const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--blue)', warning: 'var(--accent)' };
  el.style.display = 'block';
  el.style.borderColor = colors[type] || 'var(--border2)';
  el.innerHTML = `<span style="color:${colors[type]||'var(--text)'}">${msg}</span>`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.display = 'none', 3000);
}

function confirm2(title, message, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-ok-btn').onclick = () => { closeModal('modal-confirm'); onOk(); };
  openModal('modal-confirm');
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if(e.target === el) closeModal(el.id); });
});

// ════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════
function navigate(page) {
  // Permission gate for protected pages
  if (page === 'reports' && !can('viewReports')) {
    toast('Access denied — you cannot view reports.', 'error'); return;
  }
  const entryPages = ['entry-new','entry-rent','entry-return','entry-repair','entry-disposal','entry-sale'];
  if (entryPages.includes(page) && !can('entryDashboards')) {
    toast('Access denied — you cannot use entry dashboards.', 'error'); return;
  }

  // Auto-expand the group containing this page
  expandGroupForPage(page);
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes(`'${page}'`)) n.classList.add('active');
  });
  document.getElementById('topbar-page').textContent = page.toUpperCase();
  renderPage(page);
}

function renderPage(page) {
  if (page === 'dashboard') renderDashboard();
  if (page === 'inventory') renderInventory();
  if (page === 'transactions') renderTransactions();
  if (page === 'reports') renderReports();
  if (page === 'categories') renderCategories();
  if (page === 'suppliers') renderSuppliers();
  if (page === 'settings') renderSettings();
  if (page === 'entry-new') renderEntryNew();
  if (page === 'entry-rent') renderEntryRent();
  if (page === 'entry-return') renderEntryReturn();
  if (page === 'entry-repair') renderEntryRepair();
  if (page === 'entry-disposal') renderEntryDisposal();
  if (page === 'entry-sale') renderEntrySale();
  if (page === 'items') renderItems();
}

// ════════════════════════════════════════════════════════
//  CHARTS
// ════════════════════════════════════════════════════════
let chartActivity, chartCategory, chartReport;

function initCharts() {
  Chart.defaults.color = '#8a9bbf';
  Chart.defaults.borderColor = '#1e2d4a';

  // Activity bar chart
  const actCtx = document.getElementById('chart-activity').getContext('2d');
  chartActivity = new Chart(actCtx, {
    type: 'bar',
    data: { labels: [], datasets: [
      { label: 'Stock In', data: [], backgroundColor: 'rgba(0,214,143,0.7)', borderRadius: 4, borderSkipped: false },
      { label: 'Stock Out', data: [], backgroundColor: 'rgba(255,77,106,0.7)', borderRadius: 4, borderSkipped: false },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#1e2d4a' }, ticks: { callback: v => db.settings.currency + v } }
      }
    }
  });

  // Category pie chart
  const catCtx = document.getElementById('chart-category').getContext('2d');
  chartCategory = new Chart(catCtx, {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 1, borderColor: '#0a0e1a' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
      }
    }
  });

  // Report line chart
  const repCtx = document.getElementById('chart-report').getContext('2d');
  chartReport = new Chart(repCtx, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Stock In', data: [], borderColor: '#00d68f', backgroundColor: 'rgba(0,214,143,0.08)', fill: true, tension: 0.3 },
      { label: 'Stock Out', data: [], borderColor: '#ff4d6a', backgroundColor: 'rgba(255,77,106,0.08)', fill: true, tension: 0.3 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#1e2d4a' }, ticks: { callback: v => db.settings.currency + v } }
      }
    }
  });
}

// ════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════
function renderDashboard() {
  // Stats
  const lowStock = db.items.filter(i => i.qty <= (i.minStock || db.settings.minStock));
  document.getElementById('stat-total-items').textContent = db.items.length;
  document.getElementById('stat-total-qty').textContent = db.items.reduce((s,i)=>s+i.qty,0).toLocaleString();
  document.getElementById('stat-inv-value').textContent = fmt(db.items.reduce((s,i)=>s+(i.price*i.qty),0));
  document.getElementById('stat-low-stock').textContent = lowStock.length;

  // Low stock badge in topbar
  document.getElementById('topbar-low-stock').style.display = lowStock.length > 0 ? 'inline-flex' : 'none';

  // Today's activity
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayTx = db.transactions.filter(t => new Date(t.date) >= todayStart);
  const todayIn = todayTx.filter(t=>t.type==='in');
  const todayOut = todayTx.filter(t=>t.type==='out');
  const todayInAmt = todayIn.reduce((s,t)=>s+t.total,0);
  const todayOutAmt = todayOut.reduce((s,t)=>s+t.total,0);
  document.getElementById('today-in').textContent = fmt(todayInAmt);
  document.getElementById('today-in-qty').textContent = `${todayIn.reduce((s,t)=>s+t.qty,0)} units received`;
  document.getElementById('today-out').textContent = fmt(todayOutAmt);
  document.getElementById('today-out-qty').textContent = `${todayOut.reduce((s,t)=>s+t.qty,0)} units issued`;
  document.getElementById('today-net').textContent = fmt(todayOutAmt - todayInAmt);
  document.getElementById('today-tx-count').textContent = `${todayTx.length} transactions`;

  // 7-day chart
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - (6-i));
    return d;
  });
  chartActivity.data.labels = days.map(d => d.toLocaleDateString('en-PH', {month:'short', day:'numeric'}));
  chartActivity.data.datasets[0].data = days.map(d => {
    const next = new Date(d); next.setDate(next.getDate()+1);
    return db.transactions.filter(t=>t.type==='in'&&new Date(t.date)>=d&&new Date(t.date)<next).reduce((s,t)=>s+t.total,0);
  });
  chartActivity.data.datasets[1].data = days.map(d => {
    const next = new Date(d); next.setDate(next.getDate()+1);
    return db.transactions.filter(t=>t.type==='out'&&new Date(t.date)>=d&&new Date(t.date)<next).reduce((s,t)=>s+t.total,0);
  });
  chartActivity.update();

  // Category pie chart
  const catVals = {};
  db.items.forEach(item => { catVals[item.catName || 'Uncategorized'] = (catVals[item.catName || 'Uncategorized']||0) + item.price*item.qty; });
  chartCategory.data.labels = Object.keys(catVals);
  chartCategory.data.datasets[0].data = Object.values(catVals);
  chartCategory.data.datasets[0].backgroundColor = Object.keys(catVals).map(k => {
    const cat = db.categories.find(c=>c.name===k);
    return cat?.color || '#4a5a7a';
  });
  chartCategory.update();

  // Low stock list
  const lowEl = document.getElementById('low-stock-list');
  document.getElementById('low-stock-section').style.display = lowStock.length ? 'block' : 'none';
  if (lowStock.length) {
    lowEl.innerHTML = `<table><thead><tr><th>Code</th><th>Item</th><th>Category</th><th>Current Qty</th><th>Min Level</th><th>Action</th></tr></thead><tbody>
      ${lowStock.map(i=>`<tr>
        <td><span class="code-chip">${i.code}</span></td>
        <td><strong>${esc(i.name)}</strong></td>
        <td>${esc(i.catName||'—')}</td>
        <td><span class="badge badge-red">${i.qty}</span></td>
        <td>${i.minStock||db.settings.minStock}</td>
        <td><button class="btn btn-green btn-sm" onclick="openStockIn('${i.id}')">+ Stock In</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  // Recent transactions
  const recent = db.transactions.slice(0,8);
  const tbody = document.getElementById('recent-tx-body');
  tbody.innerHTML = recent.length
    ? recent.map(t=>`<tr>
        <td class="mono">${fmtDate(t.date)}</td>
        <td><strong>${esc(t.itemName)}</strong></td>
        <td><span class="code-chip">${esc(t.itemCode)}</span></td>
        <td><span class="pill ${t.type==='in'?'pill-green':'pill-red'}">${t.type.toUpperCase()}</span></td>
        <td class="mono">${t.qty}</td>
        <td class="mono ${t.type==='in'?'tx-in':'tx-out'}">${fmt(t.total)}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">No transactions yet</td></tr>`;
}

// ════════════════════════════════════════════════════════
//  INVENTORY
// ════════════════════════════════════════════════════════
function renderInventory() {
  // Populate category filter
  const catSel = document.getElementById('inv-filter-cat');
  const curCat = catSel.value;
  catSel.innerHTML = '<option value="">All Categories</option>' +
    db.categories.map(c=>`<option value="${esc(c.name)}" ${curCat===c.name?'selected':''}>${esc(c.name)}</option>`).join('');

  const search = document.getElementById('inv-search').value.toLowerCase();
  const catFilter = catSel.value;
  const typeFilter = document.getElementById('inv-filter-type').value;

  let items = db.items.filter(i => {
    const ms = i.name.toLowerCase().includes(search) || i.code.toLowerCase().includes(search) || (i.catName||'').toLowerCase().includes(search);
    const mc = !catFilter || i.catName === catFilter;
    const mt = !typeFilter || i.type === typeFilter;
    return ms && mc && mt;
  });

  const showMargin = db.settings.showMargin;
  const condFilter = (document.getElementById('inv-filter-cond')||{}).value || '';
  if (condFilter) items = items.filter(i => i.condition === condFilter);

  const tbody = document.getElementById('inv-table-body');
  document.getElementById('inv-empty').style.display = items.length ? 'none' : 'block';

  // Update count badge
  const badge = document.getElementById('inv-count-badge');
  if (badge) badge.textContent = `— ${items.length} of ${db.items.length} item${db.items.length !== 1 ? 's' : ''}`;

  tbody.innerHTML = items.map(i => {
    const isLow = i.qty <= (i.minStock||db.settings.minStock);
    const margin = i.price > 0 ? ((i.price-i.cost)/i.price*100).toFixed(1) : '0.0';
    const condColor = {new:'pill-blue',good:'pill-green',fair:'pill-amber',poor:'pill-red'}[i.condition]||'pill-gray';
    const typeColor = i.type==='for_rent'?'pill-purple':'pill-gray';
    return `
    <tr id="inv-row-${i.id}" style="cursor:default">
      <td><span class="code-chip">${esc(i.code)}</span></td>
      <td>
        <strong>${esc(i.name)}</strong>
        ${i.notes?`<div style="font-size:11px;color:var(--text3)">${esc(i.notes)}</div>`:''}
      </td>
      <td>${i.catName?`<span class="pill" style="background:${hexAlpha(getCatColor(i.catName),0.15)};color:${getCatColor(i.catName)}">${esc(i.catName)}</span>`:'—'}</td>
      <td><span class="pill ${typeColor}">${i.type==='for_rent'?'For Rent':'Purchased'}</span></td>
      <td><span class="pill ${condColor}">${i.condition}</span></td>
      <td>
        <div class="qty-wrap">
          <span style="font-family:var(--mono);font-weight:700;color:${isLow?'var(--red)':'var(--text)'}">${i.qty}</span>
          ${isLow?'<span class="badge badge-red" style="font-size:9px;margin-left:4px">LOW</span>':''}
        </div>
      </td>
      <td class="mono">${fmt(i.price)}</td>
      <td class="mono" style="color:var(--text2)">${fmt(i.cost)}</td>
      <td class="mono">${fmt(i.price*i.qty)}${showMargin?`<div style="font-size:10px;color:var(--green)">${margin}% margin</div>`:''}</td>
      <td style="color:var(--text2);font-size:12px">${esc(i.supplierName||'—')}</td>
      <td style="text-align:right">
        <div style="display:flex;gap:4px;justify-content:flex-end;align-items:center">
          <button class="btn btn-green btn-sm btn-icon" data-tip="Stock In" onclick="openStockIn('${i.id}')">↓</button>
          <button class="btn btn-danger btn-sm btn-icon" data-tip="Stock Out" onclick="openStockOut('${i.id}')">↑</button>
          <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:5px 10px;border-color:var(--accent);color:var(--accent)" onclick="openInlineEdit('${i.id}')" title="Quick edit inline">
            ✎ Edit
          </button>
          <button class="btn btn-ghost btn-sm btn-icon" data-tip="Full Edit" onclick="editItem('${i.id}')" title="Full edit modal" style="font-size:13px">⊞</button>
          <button class="btn btn-danger btn-sm btn-icon" data-tip="Delete" onclick="deleteItem('${i.id}')">✕</button>
        </div>
      </td>
    </tr>
    <tr id="inv-inline-${i.id}" style="display:none;background:var(--bg3)">
      <td colspan="11" style="padding:0">
        <div style="padding:16px 20px;border-top:2px solid var(--accent);border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <span style="font-family:var(--mono);font-size:11px;color:var(--accent);letter-spacing:1px">✎ QUICK EDIT — ${esc(i.name)}</span>
            <span class="code-chip" style="font-size:10px">${esc(i.code)}</span>
            <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="editItem('${i.id}')">Open Full Editor ⊞</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="closeInlineEdit('${i.id}')">✕</button>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;gap:12px;align-items:end">
            <div>
              <div class="form-label">Item Name</div>
              <input class="input input-sm" id="il-name-${i.id}" value="${esc(i.name)}" placeholder="Item name">
            </div>
            <div>
              <div class="form-label">Sell Price</div>
              <input class="input input-sm" type="number" id="il-price-${i.id}" value="${i.price}" step="0.01">
            </div>
            <div>
              <div class="form-label">Cost</div>
              <input class="input input-sm" type="number" id="il-cost-${i.id}" value="${i.cost}" step="0.01">
            </div>
            <div>
              <div class="form-label">Condition</div>
              <select class="select input-sm" id="il-cond-${i.id}">
                <option value="new" ${i.condition==='new'?'selected':''}>New</option>
                <option value="good" ${i.condition==='good'?'selected':''}>Good</option>
                <option value="fair" ${i.condition==='fair'?'selected':''}>Fair</option>
                <option value="poor" ${i.condition==='poor'?'selected':''}>Poor</option>
              </select>
            </div>
            <div>
              <div class="form-label">Min Stock</div>
              <input class="input input-sm" type="number" id="il-min-${i.id}" value="${i.minStock||db.settings.minStock}" min="0">
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary btn-sm" style="flex:1" onclick="saveInlineEdit('${i.id}')">✓ Save</button>
              <button class="btn btn-ghost btn-sm" onclick="closeInlineEdit('${i.id}')">Cancel</button>
            </div>
          </div>
          <div style="margin-top:10px">
            <div class="form-label">Notes</div>
            <input class="input input-sm" id="il-notes-${i.id}" value="${esc(i.notes||'')}" placeholder="Notes…" style="width:100%">
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── INLINE EDIT HELPERS ─────────────────────────────────────────────────────
function openInlineEdit(id) {
  // Close any other open inline editors first
  document.querySelectorAll('[id^="inv-inline-"]').forEach(el => {
    if (el.id !== 'inv-inline-' + id) el.style.display = 'none';
  });
  const row = document.getElementById('inv-inline-' + id);
  if (!row) return;
  const isOpen = row.style.display !== 'none';
  row.style.display = isOpen ? 'none' : 'table-row';
  if (!isOpen) {
    // Focus name field
    const nameEl = document.getElementById('il-name-' + id);
    if (nameEl) setTimeout(() => nameEl.focus(), 50);
  }
}

function closeInlineEdit(id) {
  const row = document.getElementById('inv-inline-' + id);
  if (row) row.style.display = 'none';
}

function saveInlineEdit(id) {
  const item = db.items.find(i => i.id === id);
  if (!item) return;

  const name = (document.getElementById('il-name-' + id)?.value || '').trim();
  const price = parseFloat(document.getElementById('il-price-' + id)?.value) || 0;
  const cost = parseFloat(document.getElementById('il-cost-' + id)?.value) || 0;
  const condition = document.getElementById('il-cond-' + id)?.value || item.condition;
  const minStock = parseInt(document.getElementById('il-min-' + id)?.value) || db.settings.minStock;
  const notes = (document.getElementById('il-notes-' + id)?.value || '').trim();

  if (!name) { toast('Item name cannot be empty', 'error'); return; }

  // Build change log
  if (!db.itemHistory) db.itemHistory = [];
  const fieldMap = {
    name: [item.name, name],
    price: [item.price, price],
    cost: [item.cost, cost],
    condition: [item.condition, condition],
    minStock: [item.minStock, minStock],
    notes: [item.notes || '', notes],
  };
  const changes = Object.entries(fieldMap)
    .filter(([_, [from, to]]) => String(from) !== String(to))
    .map(([field, [from, to]]) => ({ field, from, to }));

  if (changes.length === 0) {
    toast('No changes detected', 'info');
    closeInlineEdit(id);
    return;
  }

  db.itemHistory.push({ id: uid(), itemId: id, date: iso(), changes });
  Object.assign(item, { name, price, cost, condition, minStock, notes, updatedAt: iso() });

  saveStore();
  closeInlineEdit(id);
  toast(`✓ ${changes.length} change${changes.length !== 1 ? 's' : ''} saved`, 'success');
  renderInventory();
  renderDashboard();
}

function getCatColor(name) {
  const cat = db.categories.find(c=>c.name===name);
  return cat?.color || '#4a5a7a';
}
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ════════════════════════════════════════════════════════
//  ADD / EDIT ITEM
// ════════════════════════════════════════════════════════
function openAddItem() {
  if (!can('addItems')) { toast('Access denied — you cannot add items.', 'error'); return; }
  document.getElementById('modal-item-title').textContent = 'ADD ITEM';
  document.getElementById('item-edit-id').value = '';
  document.getElementById('item-name').value = '';
  document.getElementById('item-code').value = generateCodeVal();
  document.getElementById('item-cost').value = '';
  document.getElementById('item-price').value = '';
  document.getElementById('item-qty').value = '';
  document.getElementById('item-type').value = 'purchased';
  document.getElementById('item-condition').value = 'new';
  document.getElementById('item-min-stock').value = db.settings.minStock;
  document.getElementById('item-notes').value = '';
  document.getElementById('code-error').style.display = 'none';
  populateItemSelects();
  openModal('modal-item');
}

function editItem(id) {
  if (!can('editItems')) { toast('Access denied — you cannot edit items.', 'error'); return; }
  const i = db.items.find(x => x.id === id);
  if (!i) return;
  openEditModal(id);
}

// ═══════════════════════════════════════════
//  EDIT ITEM MODAL — full featured
// ═══════════════════════════════════════════
function openEditModal(id) {
  const i = db.items.find(x => x.id === id);
  if (!i) return;

  document.getElementById('edit-item-id').value = id;
  document.getElementById('edit-modal-title').textContent = 'EDIT: ' + i.name.toUpperCase();
  document.getElementById('edit-modal-meta').textContent = 'Code: ' + i.code + '  |  Last updated: ' + (i.updatedAt ? fmtDate(i.updatedAt) : '—');

  // Details tab
  document.getElementById('edit-name').value = i.name;
  document.getElementById('edit-code').value = i.code;
  document.getElementById('edit-notes').value = i.notes || '';
  document.getElementById('edit-min-stock').value = i.minStock || db.settings.minStock;
  document.getElementById('edit-code-error').style.display = 'none';

  // Info strip
  document.getElementById('edit-info-qty').textContent = i.qty;
  document.getElementById('edit-info-qty').style.color = i.qty <= (i.minStock || db.settings.minStock) ? 'var(--red)' : 'var(--text)';
  document.getElementById('edit-info-created').textContent = i.createdAt ? fmtDate(i.createdAt) : '—';
  document.getElementById('edit-info-updated').textContent = i.updatedAt ? fmtDate(i.updatedAt) : '—';

  // Category & supplier selects
  const catSel = document.getElementById('edit-category');
  catSel.innerHTML = '<option value="">Select…</option>' +
    db.categories.map(c => `<option value="${c.id}" ${c.id === i.catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const supSel = document.getElementById('edit-supplier');
  supSel.innerHTML = '<option value="">No supplier</option>' +
    db.suppliers.map(s => `<option value="${s.id}" ${s.id === i.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');

  // Pricing tab
  document.getElementById('edit-cost').value = i.cost;
  document.getElementById('edit-price').value = i.price;
  document.getElementById('edit-calc-value').dataset.qty = i.qty;
  editCalcMargin();

  // Classification tab
  document.getElementById('edit-type').value = i.type;
  document.getElementById('edit-condition').value = i.condition;
  document.getElementById('edit-condition-notes').value = i.conditionNotes || '';
  document.getElementById('edit-info-id').textContent = i.id;
  const txCount = db.transactions.filter(t => t.itemId === id).length;
  document.getElementById('edit-info-tx-count').textContent = txCount;

  // History tab
  renderEditHistory(id);

  // Update markup button label with current setting
  const mbtn = document.getElementById('edit-markup-btn');
  if (mbtn) mbtn.textContent = 'Apply ' + (db.settings.markup || 20) + '% Markup';

  // Reset to first tab
  switchEditTab('details');
  openModal('modal-edit-item');
}

function switchEditTab(tab) {
  ['details', 'pricing', 'meta', 'history'].forEach(t => {
    document.getElementById('edit-panel-' + t).style.display = t === tab ? 'block' : 'none';
    document.getElementById('edit-tab-' + t).classList.toggle('active', t === tab);
  });
}

function editCalcMargin() {
  const cost = parseFloat(document.getElementById('edit-cost').value) || 0;
  const price = parseFloat(document.getElementById('edit-price').value) || 0;
  const qty = parseInt(document.getElementById('edit-calc-value').dataset.qty) || 0;
  const profit = price - cost;
  const margin = price > 0 ? (profit / price * 100) : 0;
  document.getElementById('edit-calc-profit').textContent = fmt(profit);
  document.getElementById('edit-calc-profit').style.color = profit >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('edit-calc-margin').textContent = margin.toFixed(1) + '%';
  document.getElementById('edit-calc-margin').style.color = margin >= 0 ? 'var(--accent)' : 'var(--red)';
  document.getElementById('edit-calc-value').textContent = fmt(price * qty);
  document.getElementById('edit-calc-total-profit').textContent = fmt(profit * qty);
  document.getElementById('edit-calc-total-profit').style.color = profit >= 0 ? 'var(--green)' : 'var(--red)';
}

function editApplyMarkup() {
  const cost = parseFloat(document.getElementById('edit-cost').value) || 0;
  if (cost <= 0) { toast('Enter a cost price first', 'warning'); return; }
  document.getElementById('edit-price').value = (cost * (1 + (db.settings.markup || 20) / 100)).toFixed(2);
  editCalcMargin();
}

function renderEditHistory(itemId) {
  if (!db.itemHistory) db.itemHistory = [];
  const history = db.itemHistory.filter(h => h.itemId === itemId).slice().reverse();
  const container = document.getElementById('edit-history-list');
  document.getElementById('edit-history-empty').style.display = history.length ? 'none' : 'block';
  container.innerHTML = history.map(h => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;background:var(--bg3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${fmtDate(h.date)}</span>
        <span class="badge badge-blue" style="font-size:9px">${h.changes.length} field${h.changes.length !== 1 ? 's' : ''} changed</span>
      </div>
      ${h.changes.map(c => `
        <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase">${c.field}</span>
          <span style="font-size:12px;color:var(--red);text-decoration:line-through;word-break:break-word">${esc(String(c.from ?? '—'))}</span>
          <span style="font-size:12px;color:var(--green);word-break:break-word">→ ${esc(String(c.to ?? '—'))}</span>
        </div>`).join('')}
    </div>`).join('') || '';
}

function saveEditedItem() {
  const id = document.getElementById('edit-item-id').value;
  const i = db.items.find(x => x.id === id);
  if (!i) return;

  const name = document.getElementById('edit-name').value.trim();
  const code = document.getElementById('edit-code').value.trim();
  const catId = document.getElementById('edit-category').value;
  const cost = parseFloat(document.getElementById('edit-cost').value) || 0;
  const price = parseFloat(document.getElementById('edit-price').value) || 0;
  const type = document.getElementById('edit-type').value;
  const condition = document.getElementById('edit-condition').value;
  const conditionNotes = document.getElementById('edit-condition-notes').value.trim();
  const minStock = parseInt(document.getElementById('edit-min-stock').value) || db.settings.minStock;
  const notes = document.getElementById('edit-notes').value.trim();
  const supId = document.getElementById('edit-supplier').value;

  // Validation
  if (!name) { toast('Item name is required', 'error'); switchEditTab('details'); return; }
  if (!code) { toast('Item code is required', 'error'); switchEditTab('details'); return; }
  if (!catId) { toast('Please select a category', 'error'); switchEditTab('details'); return; }
  if (cost <= 0) { toast('Cost price is required', 'error'); switchEditTab('pricing'); return; }
  if (price <= 0) { toast('Sell price is required', 'error'); switchEditTab('pricing'); return; }

  // Code uniqueness check
  const codeTaken = db.items.some(x => x.code === code && x.id !== id);
  if (codeTaken) {
    document.getElementById('edit-code-error').style.display = 'block';
    toast('Item code already in use', 'error');
    switchEditTab('details');
    return;
  }
  document.getElementById('edit-code-error').style.display = 'none';

  const cat = db.categories.find(c => c.id === catId);
  const sup = db.suppliers.find(s => s.id === supId);

  // Build change log
  const fieldMap = {
    name: [i.name, name],
    code: [i.code, code],
    category: [i.catName, cat?.name || ''],
    supplier: [i.supplierName || 'None', sup?.name || 'None'],
    cost: [i.cost, cost],
    price: [i.price, price],
    type: [i.type, type],
    condition: [i.condition, condition],
    conditionNotes: [i.conditionNotes || '', conditionNotes],
    minStock: [i.minStock, minStock],
    notes: [i.notes || '', notes],
  };

  const changes = Object.entries(fieldMap)
    .filter(([_, [from, to]]) => String(from) !== String(to))
    .map(([field, [from, to]]) => ({ field, from, to }));

  if (changes.length === 0) {
    toast('No changes detected', 'info');
    closeModal('modal-edit-item');
    return;
  }

  // Save history
  if (!db.itemHistory) db.itemHistory = [];
  db.itemHistory.push({ id: uid(), itemId: id, date: iso(), changes });

  // Apply changes
  Object.assign(i, {
    name, code,
    catId, catName: cat?.name || '',
    supplierId: supId || '', supplierName: sup?.name || '',
    cost, price, type, condition, conditionNotes,
    minStock, notes,
    updatedAt: iso(),
  });

  saveStore();
  closeModal('modal-edit-item');
  toast(`✓ ${changes.length} change${changes.length !== 1 ? 's' : ''} saved for "${name}"`, 'success');
  renderInventory();
  renderDashboard();
}

function deleteItemFromEdit() {
  const id = document.getElementById('edit-item-id').value;
  const item = db.items.find(i => i.id === id);
  if (!item) return;
  confirm2('DELETE ITEM', `Delete "${item.name}"? All data for this item will be permanently removed.`, () => {
    db.items = db.items.filter(i => i.id !== id);
    if (db.itemHistory) db.itemHistory = db.itemHistory.filter(h => h.itemId !== id);
    saveStore();
    closeModal('modal-edit-item');
    toast('Item deleted', 'warning');
    renderInventory();
    renderDashboard();
  });
}

function populateItemSelects(catId='', supplierId='') {
  const catSel = document.getElementById('item-category');
  catSel.innerHTML = '<option value="">Select category…</option>' +
    db.categories.map(c=>`<option value="${c.id}" ${c.id===catId?'selected':''}>${esc(c.name)}</option>`).join('');
  const supSel = document.getElementById('item-supplier');
  supSel.innerHTML = '<option value="">No supplier</option>' +
    db.suppliers.map(s=>`<option value="${s.id}" ${s.id===supplierId?'selected':''}>${esc(s.name)}</option>`).join('');
}

function generateCodeVal() {
  const now = new Date();
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `ITM-${now.getFullYear()}${String(now.getMonth()+1).padLeft?String(now.getMonth()+1).padStart(2,'0'):('0'+(now.getMonth()+1)).slice(-2)}-${rand}`;
}
function generateCode() { document.getElementById('item-code').value = generateCodeVal(); }

function autoCalcPrice() {
  const cost = parseFloat(document.getElementById('item-cost').value) || 0;
  if (cost > 0 && !document.getElementById('item-price').value) {
    document.getElementById('item-price').value = (cost * (1 + db.settings.markup/100)).toFixed(2);
  }
}

function saveItem() {
  const editId = document.getElementById('item-edit-id').value;
  if (!editId && !can('addItems')) { toast('Access denied — you cannot add items.', 'error'); return; }
  if (editId && !can('editItems')) { toast('Access denied — you cannot edit items.', 'error'); return; }
  const name = document.getElementById('item-name').value.trim();
  const code = document.getElementById('item-code').value.trim();
  const catId = document.getElementById('item-category').value;
  const cost = parseFloat(document.getElementById('item-cost').value) || 0;
  const price = parseFloat(document.getElementById('item-price').value) || 0;
  const qty = parseInt(document.getElementById('item-qty').value) || 0;

  if (!name) { toast('Item name is required', 'error'); return; }
  if (!code) { toast('Item code is required', 'error'); return; }
  if (!catId) { toast('Please select a category', 'error'); return; }

  // Check code uniqueness
  const codeTaken = db.items.some(i => i.code === code && i.id !== editId);
  if (codeTaken) {
    document.getElementById('code-error').style.display = 'block';
    toast('Item code already in use', 'error');
    return;
  }
  document.getElementById('code-error').style.display = 'none';

  const cat = db.categories.find(c=>c.id===catId);
  const supId = document.getElementById('item-supplier').value;
  const sup = db.suppliers.find(s=>s.id===supId);

  const itemData = {
    id: editId || uid(),
    code, name,
    catId, catName: cat?.name || '',
    supplierId: supId||'', supplierName: sup?.name||'',
    cost, price, qty,
    type: document.getElementById('item-type').value,
    condition: document.getElementById('item-condition').value,
    minStock: parseInt(document.getElementById('item-min-stock').value)||db.settings.minStock,
    notes: document.getElementById('item-notes').value.trim(),
    createdAt: editId ? (db.items.find(i=>i.id===editId)?.createdAt||iso()) : iso(),
    updatedAt: iso(),
  };

  if (editId) {
    const idx = db.items.findIndex(i=>i.id===editId);
    db.items[idx] = itemData;
    toast('Item updated ✓');
  } else {
    db.items.push(itemData);
    toast('Item added ✓');
  }

  saveStore();
  closeModal('modal-item');
  renderInventory();
  renderDashboard();
}

function deleteItem(id) {
  if (!can('deleteItems')) { toast('Access denied — you cannot delete items.', 'error'); return; }
  const item = db.items.find(i=>i.id===id);
  confirm2('DELETE ITEM', `Delete "${item?.name}"? This cannot be undone.`, () => {
    db.items = db.items.filter(i=>i.id!==id);
    saveStore();
    renderInventory();
    renderDashboard();
    toast('Item deleted');
  });
}

// ════════════════════════════════════════════════════════
//  STOCK IN / OUT
// ════════════════════════════════════════════════════════
function openStockIn(itemId) {
  if (!can('stockIn')) { toast('Access denied — you cannot perform Stock In.', 'error'); return; }
  const item = db.items.find(i=>i.id===itemId);
  if (!item) return;
  document.getElementById('modal-stock-title').textContent = '▼ STOCK IN';
  document.getElementById('stock-item-id').value = itemId;
  document.getElementById('stock-type').value = 'in';
  document.getElementById('stock-item-name').textContent = item.name;
  document.getElementById('stock-item-code').textContent = item.code;
  document.getElementById('stock-current-qty').textContent = item.qty;
  document.getElementById('stock-qty').value = '';
  document.getElementById('stock-price').value = item.cost;
  document.getElementById('stock-notes').value = '';
  document.getElementById('stock-supplier-wrap').style.display = 'block';
  document.getElementById('stock-confirm-btn').style.background = 'var(--green)';
  document.getElementById('stock-confirm-btn').style.color = '#000';
  document.getElementById('stock-total').style.color = 'var(--green)';

  const supSel = document.getElementById('stock-supplier');
  supSel.innerHTML = '<option value="">No supplier</option>' +
    db.suppliers.map(s=>`<option value="${s.id}" ${s.id===item.supplierId?'selected':''}>${esc(s.name)}</option>`).join('');

  calcStockTotal();
  openModal('modal-stock');
}

function openStockOut(itemId) {
  if (!can('stockOut')) { toast('Access denied — you cannot perform Stock Out.', 'error'); return; }
  const item = db.items.find(i=>i.id===itemId);
  if (!item) return;
  document.getElementById('modal-stock-title').textContent = '▲ STOCK OUT';
  document.getElementById('stock-item-id').value = itemId;
  document.getElementById('stock-type').value = 'out';
  document.getElementById('stock-item-name').textContent = item.name;
  document.getElementById('stock-item-code').textContent = item.code;
  document.getElementById('stock-current-qty').textContent = item.qty;
  document.getElementById('stock-qty').value = '';
  document.getElementById('stock-price').value = item.price;
  document.getElementById('stock-notes').value = '';
  document.getElementById('stock-supplier-wrap').style.display = 'none';
  document.getElementById('stock-confirm-btn').style.background = 'var(--red)';
  document.getElementById('stock-confirm-btn').style.color = '#fff';
  document.getElementById('stock-total').style.color = 'var(--red)';
  calcStockTotal();
  openModal('modal-stock');
}

function calcStockTotal() {
  const qty = parseInt(document.getElementById('stock-qty').value) || 0;
  const price = parseFloat(document.getElementById('stock-price').value) || 0;
  const total = qty * price;
  const type = document.getElementById('stock-type').value;
  const itemId = document.getElementById('stock-item-id').value;
  const item = db.items.find(i=>i.id===itemId);
  document.getElementById('stock-total').textContent = fmt(total);
  const after = item ? (type==='in' ? item.qty+qty : item.qty-qty) : '—';
  document.getElementById('stock-after-label').textContent = `Stock after: ${after}`;
}

function confirmStock() {
  const itemId = document.getElementById('stock-item-id').value;
  const type = document.getElementById('stock-type').value;
  const qty = parseInt(document.getElementById('stock-qty').value) || 0;
  const price = parseFloat(document.getElementById('stock-price').value) || 0;
  const notes = document.getElementById('stock-notes').value.trim();
  const supId = document.getElementById('stock-supplier').value;
  const sup = db.suppliers.find(s=>s.id===supId);

  if (qty <= 0) { toast('Enter a valid quantity', 'error'); return; }
  if (price <= 0) { toast('Enter a valid price', 'error'); return; }

  const item = db.items.find(i=>i.id===itemId);
  if (!item) return;
  if (type==='out' && qty > item.qty) { toast(`Insufficient stock. Available: ${item.qty}`, 'error'); return; }

  // Update item quantity
  item.qty += type==='in' ? qty : -qty;
  item.updatedAt = iso();

  // Add transaction
  db.transactions.unshift({
    id: uid(),
    itemId, itemCode: item.code, itemName: item.name,
    type, qty, price, total: qty*price,
    supplierId: supId||'', supplierName: sup?.name||'',
    notes, date: iso(),
  });

  saveStore();
  closeModal('modal-stock');
  toast(`Stock ${type.toUpperCase()} recorded: ${qty} × ${item.name}`, type==='in'?'success':'warning');
  renderInventory();
  renderDashboard();
  renderTransactions();
}

// ════════════════════════════════════════════════════════
//  TRANSACTIONS
// ════════════════════════════════════════════════════════
function renderTransactions() {
  const search = document.getElementById('tx-search').value.toLowerCase();
  const typeFilter = document.getElementById('tx-filter-type').value;
  const from = document.getElementById('tx-filter-from').value;
  const to = document.getElementById('tx-filter-to').value;

  let txns = db.transactions.filter(t => {
    const ms = t.itemName.toLowerCase().includes(search) || t.itemCode.toLowerCase().includes(search);
    const mt = !typeFilter || t.type === typeFilter;
    const mf = !from || new Date(t.date) >= new Date(from);
    const me = !to || new Date(t.date) <= new Date(to + 'T23:59:59');
    return ms && mt && mf && me;
  });

  const totalIn = txns.filter(t=>t.type==='in').reduce((s,t)=>s+t.total,0);
  const totalOut = txns.filter(t=>t.type==='out').reduce((s,t)=>s+t.total,0);
  const qtyIn = txns.filter(t=>t.type==='in').reduce((s,t)=>s+t.qty,0);
  const qtyOut = txns.filter(t=>t.type==='out').reduce((s,t)=>s+t.qty,0);

  document.getElementById('tx-total-in').textContent = fmt(totalIn);
  document.getElementById('tx-total-out').textContent = fmt(totalOut);
  document.getElementById('tx-net').textContent = fmt(totalOut-totalIn);
  document.getElementById('tx-total-in-qty').textContent = `${qtyIn} units`;
  document.getElementById('tx-total-out-qty').textContent = `${qtyOut} units`;
  document.getElementById('tx-count').textContent = `${txns.length} transactions`;

  const tbody = document.getElementById('tx-table-body');
  document.getElementById('tx-empty').style.display = txns.length ? 'none' : 'block';
  tbody.innerHTML = txns.map(t=>`<tr>
    <td class="mono">${fmtDate(t.date)}</td>
    <td><strong>${esc(t.itemName)}</strong></td>
    <td><span class="code-chip">${esc(t.itemCode)}</span></td>
    <td><span class="pill ${t.type==='in'?'pill-green':'pill-red'}">${t.type.toUpperCase()}</span></td>
    <td class="mono">${t.qty}</td>
    <td class="mono">${fmt(t.price)}</td>
    <td class="mono ${t.type==='in'?'tx-in':'tx-out'}">${fmt(t.total)}</td>
    <td style="color:var(--text2);font-size:12px">${esc(t.supplierName||'—')}</td>
    <td style="color:var(--text2);font-size:12px">${esc(t.notes||'')}</td>
  </tr>`).join('');
}

function clearTxFilters() {
  document.getElementById('tx-search').value = '';
  document.getElementById('tx-filter-type').value = '';
  document.getElementById('tx-filter-from').value = '';
  document.getElementById('tx-filter-to').value = '';
  renderTransactions();
}

// ════════════════════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════════════════════
let reportStart = null, reportEnd = null;

function setPeriod(period, btn) {
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const now = new Date();
  let s, e;
  if (period === 'today') {
    s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    document.getElementById('rep-range-label').textContent = 'Period: Today — ' + s.toLocaleDateString('en-PH',{month:'long',day:'numeric',year:'numeric'});
    document.getElementById('custom-range-wrap').style.display = 'none';
  } else if (period === 'week') {
    const day = now.getDay() || 7;
    s = new Date(now); s.setDate(s.getDate() - (day-1)); s.setHours(0,0,0,0);
    e = new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999);
    document.getElementById('rep-range-label').textContent = `Period: This Week — ${s.toLocaleDateString('en-PH')} → ${e.toLocaleDateString('en-PH')}`;
    document.getElementById('custom-range-wrap').style.display = 'none';
  } else if (period === 'month') {
    s = new Date(now.getFullYear(), now.getMonth(), 1);
    e = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59);
    document.getElementById('rep-range-label').textContent = `Period: ${s.toLocaleDateString('en-PH',{month:'long',year:'numeric'})}`;
    document.getElementById('custom-range-wrap').style.display = 'none';
  } else if (period === 'custom') {
    document.getElementById('custom-range-wrap').style.display = 'flex';
    const today = now.toISOString().slice(0,10);
    document.getElementById('rep-from').value = today;
    document.getElementById('rep-to').value = today;
    s = new Date(today); e = new Date(today + 'T23:59:59');
    document.getElementById('rep-range-label').textContent = `Custom: ${s.toLocaleDateString('en-PH')} → ${e.toLocaleDateString('en-PH')}`;
  }
  reportStart = s; reportEnd = e;
  renderReports();
}

function applyCustomRange() {
  const f = document.getElementById('rep-from').value;
  const t = document.getElementById('rep-to').value;
  if (!f || !t) { toast('Select both start and end dates', 'warning'); return; }
  reportStart = new Date(f); reportEnd = new Date(t + 'T23:59:59');
  document.getElementById('rep-range-label').textContent = `Custom: ${reportStart.toLocaleDateString('en-PH')} → ${reportEnd.toLocaleDateString('en-PH')}`;
  renderReports();
}

function getReportTxns() {
  if (!reportStart || !reportEnd) return db.transactions;
  return db.transactions.filter(t => new Date(t.date) >= reportStart && new Date(t.date) <= reportEnd);
}

function renderReports() {
  if (!can('viewReports')) { toast('Access denied — you cannot view reports.', 'error'); navigate('dashboard'); return; }
  if (!reportStart) {
    // Default: today
    const now = new Date();
    reportStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    reportEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  }

  const txns = getReportTxns();
  const totalIn = txns.filter(t=>t.type==='in').reduce((s,t)=>s+t.total,0);
  const totalOut = txns.filter(t=>t.type==='out').reduce((s,t)=>s+t.total,0);
  const qtyIn = txns.filter(t=>t.type==='in').reduce((s,t)=>s+t.qty,0);
  const qtyOut = txns.filter(t=>t.type==='out').reduce((s,t)=>s+t.qty,0);

  document.getElementById('rep-in').textContent = fmt(totalIn);
  document.getElementById('rep-out').textContent = fmt(totalOut);
  document.getElementById('rep-net').textContent = fmt(totalOut-totalIn);
  document.getElementById('rep-in-qty').textContent = `${qtyIn} units`;
  document.getElementById('rep-out-qty').textContent = `${qtyOut} units`;
  document.getElementById('rep-tx-count').textContent = `${txns.length} transactions`;

  // Day-by-day chart
  const dayCount = Math.max(1, Math.round((reportEnd - reportStart) / (1000*60*60*24)) + 1);
  const days = Array.from({length: Math.min(dayCount, 31)}, (_,i) => {
    const d = new Date(reportStart); d.setDate(d.getDate()+i); return d;
  });
  chartReport.data.labels = days.map(d => fmtDay(d.toISOString()));
  chartReport.data.datasets[0].data = days.map(d => {
    const next = new Date(d); next.setDate(next.getDate()+1);
    return txns.filter(t=>t.type==='in'&&new Date(t.date)>=d&&new Date(t.date)<next).reduce((s,t)=>s+t.total,0);
  });
  chartReport.data.datasets[1].data = days.map(d => {
    const next = new Date(d); next.setDate(next.getDate()+1);
    return txns.filter(t=>t.type==='out'&&new Date(t.date)>=d&&new Date(t.date)<next).reduce((s,t)=>s+t.total,0);
  });
  chartReport.update();

  // Item breakdown
  const breakdown = {};
  txns.forEach(t => {
    if (!breakdown[t.itemName]) breakdown[t.itemName] = {name:t.itemName,code:t.itemCode,inAmt:0,outAmt:0,inQty:0,outQty:0};
    if (t.type==='in') { breakdown[t.itemName].inAmt+=t.total; breakdown[t.itemName].inQty+=t.qty; }
    else { breakdown[t.itemName].outAmt+=t.total; breakdown[t.itemName].outQty+=t.qty; }
  });
  const bRows = Object.values(breakdown);
  document.getElementById('rep-breakdown-empty').style.display = bRows.length ? 'none' : 'block';
  document.getElementById('rep-breakdown-body').innerHTML = bRows.map(b=>`<tr>
    <td><strong>${esc(b.name)}</strong></td>
    <td><span class="code-chip">${esc(b.code)}</span></td>
    <td class="mono tx-in">${fmt(b.inAmt)}</td>
    <td class="mono tx-out">${fmt(b.outAmt)}</td>
    <td class="mono" style="color:var(--accent)">${fmt(b.outAmt-b.inAmt)}</td>
    <td class="mono">${b.inQty}</td>
    <td class="mono">${b.outQty}</td>
  </tr>`).join('');
}

// ════════════════════════════════════════════════════════
//  CATEGORIES
// ════════════════════════════════════════════════════════
const CAT_COLORS = ['#3d9eff','#00d68f','#f0a500','#ff4d6a','#a78bfa','#e879f9','#34d399','#fb923c','#60a5fa','#f472b6','#4ade80','#facc15'];
let selectedCatColor = CAT_COLORS[0];

function renderCategories() {
  buildColorGrid();
  const tbody = document.getElementById('cat-table-body');
  document.getElementById('cat-empty').style.display = db.categories.length ? 'none' : 'block';
  tbody.innerHTML = db.categories.map(c => {
    const count = db.items.filter(i=>i.catId===c.id).length;
    return `<tr>
      <td><div style="width:18px;height:18px;border-radius:50%;background:${c.color}"></div></td>
      <td><strong>${esc(c.name)}</strong></td>
      <td style="color:var(--text2);font-size:12px">${esc(c.description||'—')}</td>
      <td><span class="pill pill-blue">${count}</span></td>
      <td><div class="row-actions" style="opacity:1">
        <button class="btn btn-ghost btn-sm" onclick="editCategory('${c.id}')">✎ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCat('${c.id}','${count}')">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

function buildColorGrid() {
  document.getElementById('cat-color-grid').innerHTML = CAT_COLORS.map(c=>
    `<div class="color-swatch ${c===selectedCatColor?'selected':''}" style="background:${c}" onclick="selectColor('${c}')"></div>`
  ).join('');
}

function selectColor(c) { selectedCatColor = c; buildColorGrid(); }

function openCategoryForm(cat) {
  if (!can('manageCategories')) { toast('Access denied — you cannot manage categories.', 'error'); return; }
  document.getElementById('modal-cat-title').textContent = cat ? 'EDIT CATEGORY' : 'ADD CATEGORY';
  document.getElementById('cat-edit-id').value = cat?.id || '';
  document.getElementById('cat-name').value = cat?.name || '';
  document.getElementById('cat-desc').value = cat?.description || '';
  selectedCatColor = cat?.color || CAT_COLORS[0];
  buildColorGrid();
  openModal('modal-category');
}

function editCategory(id) { openCategoryForm(db.categories.find(c=>c.id===id)); }

function deleteCat(id, count) {
  if (!can('manageCategories')) { toast('Access denied — you cannot manage categories.', 'error'); return; }
  if (count > 0) { toast(`Cannot delete: ${count} item(s) use this category`, 'error'); return; }
  confirm2('DELETE CATEGORY', 'Delete this category? This cannot be undone.', () => {
    db.categories = db.categories.filter(c=>c.id!==id);
    saveStore();
    renderCategories();
    toast('Category deleted');
  });
}

function saveCategory() {
  if (!can('manageCategories')) { toast('Access denied.', 'error'); return; }
  const editId = document.getElementById('cat-edit-id').value;
  const name = document.getElementById('cat-name').value.trim();
  if (!name) { toast('Category name is required', 'error'); return; }
  const cat = { id: editId||uid(), name, description: document.getElementById('cat-desc').value.trim()||null, color: selectedCatColor, createdAt: editId?(db.categories.find(c=>c.id===editId)?.createdAt||iso()):iso() };
  if (editId) { const idx=db.categories.findIndex(c=>c.id===editId); db.categories[idx]=cat; }
  else db.categories.push(cat);
  saveStore();
  closeModal('modal-category');
  renderCategories();
  toast(`Category ${editId?'updated':'added'} ✓`);
}

// ════════════════════════════════════════════════════════
//  SUPPLIERS
// ════════════════════════════════════════════════════════
function renderSuppliers() {
  const tbody = document.getElementById('sup-table-body');
  document.getElementById('sup-empty').style.display = db.suppliers.length ? 'none' : 'block';
  tbody.innerHTML = db.suppliers.map(s => {
    const count = db.items.filter(i=>i.supplierId===s.id).length;
    return `<tr>
      <td><strong>${esc(s.name)}</strong>${s.notes?`<div style="font-size:11px;color:var(--text3)">${esc(s.notes)}</div>`:''}</td>
      <td style="color:var(--text2)">${esc(s.phone||'—')}</td>
      <td style="color:var(--text2)">${esc(s.email||'—')}</td>
      <td style="color:var(--text2);font-size:12px">${esc(s.address||'—')}</td>
      <td><span class="pill pill-teal" style="background:var(--green-dim);color:var(--green)">${count} items</span></td>
      <td><div class="row-actions" style="opacity:1">
        <button class="btn btn-ghost btn-sm" onclick="editSupplier('${s.id}')">✎ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSupplier('${s.id}')">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openSupplierForm(sup) {
  if (!can('manageSuppliers')) { toast('Access denied — you cannot manage suppliers.', 'error'); return; }
  document.getElementById('modal-sup-title').textContent = sup ? 'EDIT SUPPLIER' : 'ADD SUPPLIER';
  document.getElementById('sup-edit-id').value = sup?.id || '';
  document.getElementById('sup-name').value = sup?.name || '';
  document.getElementById('sup-phone').value = sup?.phone || '';
  document.getElementById('sup-email').value = sup?.email || '';
  document.getElementById('sup-address').value = sup?.address || '';
  document.getElementById('sup-notes').value = sup?.notes || '';
  openModal('modal-supplier');
}

function editSupplier(id) { openSupplierForm(db.suppliers.find(s=>s.id===id)); }

function deleteSupplier(id) {
  if (!can('manageSuppliers')) { toast('Access denied — you cannot manage suppliers.', 'error'); return; }
  confirm2('DELETE SUPPLIER', 'Delete this supplier?', () => {
    db.suppliers = db.suppliers.filter(s=>s.id!==id);
    saveStore();
    renderSuppliers();
    toast('Supplier deleted');
  });
}

function saveSupplier() {
  if (!can('manageSuppliers')) { toast('Access denied.', 'error'); return; }
  const editId = document.getElementById('sup-edit-id').value;
  const name = document.getElementById('sup-name').value.trim();
  if (!name) { toast('Supplier name is required', 'error'); return; }
  const sup = {
    id: editId||uid(), name,
    phone: document.getElementById('sup-phone').value.trim()||null,
    email: document.getElementById('sup-email').value.trim()||null,
    address: document.getElementById('sup-address').value.trim()||null,
    notes: document.getElementById('sup-notes').value.trim()||null,
    createdAt: editId?(db.suppliers.find(s=>s.id===editId)?.createdAt||iso()):iso(),
  };
  if (editId) { const idx=db.suppliers.findIndex(s=>s.id===editId); db.suppliers[idx]=sup; }
  else db.suppliers.push(sup);
  saveStore();
  closeModal('modal-supplier');
  renderSuppliers();
  toast(`Supplier ${editId?'updated':'added'} ✓`);
}

// ════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
//  AUTH & USER MANAGEMENT
// ════════════════════════════════════════════════════════
const AUTH_KEY  = 'inventrack_users';
const SESS_KEY  = 'inventrack_session';

// Default permissions — admin always has everything
const DEFAULT_PERMS = {
  clearData:       { admin: true,  manager: false, viewer: false },
  editItems:       { admin: true,  manager: true,  viewer: false },
  addItems:        { admin: true,  manager: true,  viewer: false },
  deleteItems:     { admin: true,  manager: false, viewer: false },
  stockIn:         { admin: true,  manager: true,  viewer: false },
  stockOut:        { admin: true,  manager: true,  viewer: false },
  viewReports:     { admin: true,  manager: true,  viewer: true  },
  exportData:      { admin: true,  manager: true,  viewer: false },
  manageCategories:{ admin: true,  manager: true,  viewer: false },
  manageSuppliers: { admin: true,  manager: true,  viewer: false },
  entryDashboards: { admin: true,  manager: true,  viewer: false },
};

const PERM_LABELS = {
  clearData:        { label: 'Clear All Data',        sub: 'Wipe inventory and transaction data' },
  editItems:        { label: 'Edit Item Details',      sub: 'Modify item name, price, condition, etc.' },
  addItems:         { label: 'Add New Items',          sub: 'Register new items to inventory' },
  deleteItems:      { label: 'Delete Items',           sub: 'Permanently remove items' },
  stockIn:          { label: 'Stock In',               sub: 'Receive items into inventory' },
  stockOut:         { label: 'Stock Out',              sub: 'Issue items from inventory' },
  viewReports:      { label: 'View Reports',           sub: 'Access financial reports' },
  exportData:       { label: 'Export Data',            sub: 'Download Excel, CSV, or backup' },
  manageCategories: { label: 'Manage Categories',      sub: 'Add, edit, or delete categories' },
  manageSuppliers:  { label: 'Manage Suppliers',       sub: 'Add, edit, or delete suppliers' },
  entryDashboards:  { label: 'Entry Dashboards',       sub: 'Use rent, repair, sale entry forms' },
};

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || '[]'); } catch { return []; }
}
function saveUsers(users) { localStorage.setItem(AUTH_KEY, JSON.stringify(users)); }
function loadPerms() {
  try {
    const raw = localStorage.getItem('inventrack_perms');
    const saved = raw ? JSON.parse(raw) : {};
    // Merge with defaults, always enforce admin = true
    const perms = {};
    for (const key of Object.keys(DEFAULT_PERMS)) {
      perms[key] = { ...DEFAULT_PERMS[key], ...(saved[key] || {}), admin: true };
    }
    return perms;
  } catch { return { ...DEFAULT_PERMS }; }
}
function savePerms(perms) { localStorage.setItem('inventrack_perms', JSON.stringify(perms)); }

let currentUser = null; // { id, username, fullName, role }
let appPerms = loadPerms();

// SHA-256 hash (async, returns hex string)
async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── LOGIN / LOGOUT ──────────────────────────────────────────────────────────
function checkSession() {
  const users = loadUsers();
  if (users.length === 0) {
    // No users — open mode, skip login
    currentUser = null;
    hideLoginScreen();
    return;
  }
  // Check for saved session
  try {
    const sess = JSON.parse(sessionStorage.getItem(SESS_KEY) || 'null');
    if (sess?.id) {
      const user = users.find(u => u.id === sess.id);
      if (user) { currentUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role }; hideLoginScreen(); return; }
    }
  } catch {}
  showLoginScreen();
}

function showLoginScreen() {
  const el = document.getElementById('login-screen');
  el.classList.add('visible');
  el.style.display = 'flex';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').style.display = 'none';
  setTimeout(() => document.getElementById('login-username').focus(), 100);
}
function hideLoginScreen() {
  const el = document.getElementById('login-screen');
  el.classList.remove('visible');
  el.style.display = 'none';
  updateUserBadge();
  applyAccessControl();
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  if (!username || !password) { showLoginError('Please enter username and password.'); return; }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) { btn.disabled = false; btn.textContent = 'Sign In'; showLoginError('Invalid username or password.'); return; }

  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) { btn.disabled = false; btn.textContent = 'Sign In'; showLoginError('Invalid username or password.'); return; }

  // Success
  currentUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  sessionStorage.setItem(SESS_KEY, JSON.stringify(currentUser));

  // Update last login
  user.lastLogin = iso();
  saveUsers(users);

  btn.disabled = false; btn.textContent = 'Sign In';
  hideLoginScreen();
  toast(`Welcome back, ${user.fullName}! 👋`, 'success');
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem(SESS_KEY);
  closeUserMenu();
  showLoginScreen();
}

// ── USER BADGE & MENU ───────────────────────────────────────────────────────
function updateUserBadge() {
  const badge = document.getElementById('user-badge');
  if (!badge) return;
  if (!currentUser) { badge.style.display = 'none'; return; }
  badge.style.display = 'inline-flex';
  const colors = { admin: '#f0a500', manager: '#3d9eff', viewer: '#4a5a7a' };
  const avatar = document.getElementById('user-avatar');
  avatar.textContent = currentUser.fullName.charAt(0).toUpperCase();
  avatar.style.background = (colors[currentUser.role] || '#4a5a7a') + '33';
  avatar.style.color = colors[currentUser.role] || '#4a5a7a';
  document.getElementById('user-badge-name').textContent = currentUser.fullName;
  document.getElementById('user-badge-role').textContent = currentUser.role.toUpperCase();
}

let _menuOpen = false;
function showUserMenu() {
  if (_menuOpen) { closeUserMenu(); return; }
  const existing = document.getElementById('user-menu-popup');
  if (existing) existing.remove();

  const badge = document.getElementById('user-badge');
  const rect = badge.getBoundingClientRect();
  const roleColors = { admin:'var(--accent)', manager:'var(--blue)', viewer:'var(--text3)' };
  const roleLabels = { admin:'🔑 Administrator', manager:'🏢 Manager', viewer:'👁 Viewer' };

  const menu = document.createElement('div');
  menu.id = 'user-menu-popup';
  menu.style.cssText = `position:fixed;top:${rect.bottom+6}px;right:${window.innerWidth-rect.right}px;
    background:var(--bg2);border:1px solid var(--border2);border-radius:10px;
    min-width:200px;z-index:9999;box-shadow:0 12px 40px rgba(0,0,0,0.5);overflow:hidden`;

  menu.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);background:var(--bg3)">
      <div style="font-weight:700;font-size:14px">${esc(currentUser.fullName)}</div>
      <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">@${esc(currentUser.username)}</div>
      <div style="margin-top:6px"><span class="pill" style="background:${roleColors[currentUser.role]}22;color:${roleColors[currentUser.role]};font-size:10px">${roleLabels[currentUser.role]||currentUser.role}</span></div>
    </div>
    <div style="padding:6px">
      <button onclick="openChangePassword()" style="width:100%;text-align:left;padding:9px 12px;background:none;border:none;color:var(--text);font-size:13px;cursor:pointer;border-radius:6px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='none'">🔑 Change Password</button>
      <button onclick="logout()" style="width:100%;text-align:left;padding:9px 12px;background:none;border:none;color:var(--red);font-size:13px;cursor:pointer;border-radius:6px;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--red-dim)'" onmouseout="this.style.background='none'">🚪 Sign Out</button>
    </div>`;

  document.body.appendChild(menu);
  _menuOpen = true;
  setTimeout(() => document.addEventListener('click', _menuClickOut), 10);
}

function _menuClickOut(e) {
  const m = document.getElementById('user-menu-popup');
  if (m && !m.contains(e.target) && !document.getElementById('user-badge').contains(e.target)) closeUserMenu();
}
function closeUserMenu() {
  const m = document.getElementById('user-menu-popup');
  if (m) m.remove();
  _menuOpen = false;
  document.removeEventListener('click', _menuClickOut);
}

// ── CHANGE PASSWORD ─────────────────────────────────────────────────────────
function openChangePassword() {
  closeUserMenu();
  const html = `
    <div class="modal-overlay open" id="modal-change-pw" onclick="if(event.target===this)this.remove()">
      <div class="modal" style="max-width:380px">
        <div class="modal-header">
          <div class="modal-title">CHANGE PASSWORD</div>
          <button class="btn btn-ghost btn-icon" onclick="document.getElementById('modal-change-pw').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input type="password" class="input" id="cpw-current" placeholder="Your current password">
          </div>
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input type="password" class="input" id="cpw-new" placeholder="Min. 4 characters">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm New Password</label>
            <input type="password" class="input" id="cpw-confirm" placeholder="Re-enter new password">
          </div>
          <div id="cpw-error" style="color:var(--red);font-size:12px;display:none;margin-top:4px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="document.getElementById('modal-change-pw').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="doChangePassword()">Update Password</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function doChangePassword() {
  const current = document.getElementById('cpw-current').value;
  const newPw   = document.getElementById('cpw-new').value;
  const confirm = document.getElementById('cpw-confirm').value;
  const errEl   = document.getElementById('cpw-error');

  if (!current || !newPw || !confirm) { errEl.textContent = 'All fields required.'; errEl.style.display='block'; return; }
  if (newPw.length < 4) { errEl.textContent = 'New password must be at least 4 characters.'; errEl.style.display='block'; return; }
  if (newPw !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display='block'; return; }

  const users = loadUsers();
  const user = users.find(u => u.id === currentUser.id);
  if (!user) return;

  const curHash = await hashPassword(current);
  if (curHash !== user.passwordHash) { errEl.textContent = 'Current password is incorrect.'; errEl.style.display='block'; return; }

  user.passwordHash = await hashPassword(newPw);
  saveUsers(users);
  document.getElementById('modal-change-pw').remove();
  toast('Password updated successfully ✓', 'success');
}

// ── USER CRUD ───────────────────────────────────────────────────────────────
function renderUsersTab() {
  const users = loadUsers();
  const tbody = document.getElementById('users-table-body');
  const empty = document.getElementById('users-empty');
  if (!tbody) return;
  document.getElementById('ov-users').textContent = users.length;
  empty.style.display = users.length ? 'none' : 'block';
  const roleLabels = { admin:'Admin', manager:'Manager', viewer:'Viewer' };
  const roleClass  = { admin:'role-admin', manager:'role-manager', viewer:'role-viewer' };
  tbody.innerHTML = users.map(u => `<tr>
    <td><strong>${esc(u.fullName)}</strong></td>
    <td class="mono" style="color:var(--text2)">@${esc(u.username)}</td>
    <td><span class="pill ${roleClass[u.role]||'pill-gray'}">${roleLabels[u.role]||u.role}</span></td>
    <td class="mono" style="font-size:11px;color:var(--text3)">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—'}</td>
    <td class="mono" style="font-size:11px;color:var(--text3)">${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : 'Never'}</td>
    <td style="text-align:right">
      <div class="user-row-actions" style="justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="editUserForm('${u.id}')">✎ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')" ${u.id===currentUser?.id?'disabled title="Cannot delete your own account"':''}>✕</button>
      </div>
    </td>
  </tr>`).join('');
}

function cancelUserEdit() {
  document.getElementById('user-edit-id').value = '';
  document.getElementById('user-form-title').textContent = 'Register New User';
  document.getElementById('user-fullname').value = '';
  document.getElementById('user-username').value = '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-password2').value = '';
  document.getElementById('user-role').value = 'admin';
  document.getElementById('user-save-btn').textContent = 'Register User';
  document.getElementById('user-cancel-btn').style.display = 'none';
  document.getElementById('user-form-note').style.display = 'block';
  document.getElementById('user-username-err').style.display = 'none';
  document.getElementById('user-pw-mismatch').style.display = 'none';
}

function editUserForm(id) {
  const user = loadUsers().find(u => u.id === id);
  if (!user) return;
  document.getElementById('user-edit-id').value = id;
  document.getElementById('user-form-title').textContent = 'Edit User';
  document.getElementById('user-fullname').value = user.fullName;
  document.getElementById('user-username').value = user.username;
  document.getElementById('user-password').value = '';
  document.getElementById('user-password2').value = '';
  document.getElementById('user-role').value = user.role;
  document.getElementById('user-save-btn').textContent = 'Update User';
  document.getElementById('user-cancel-btn').style.display = 'inline-flex';
  document.getElementById('user-form-note').style.display = 'block';
}

async function saveUser() {
  const editId   = document.getElementById('user-edit-id').value;
  const fullName = document.getElementById('user-fullname').value.trim();
  const username = document.getElementById('user-username').value.trim().toLowerCase();
  const role     = document.getElementById('user-role').value;
  const pw1      = document.getElementById('user-password').value;
  const pw2      = document.getElementById('user-password2').value;

  // Validations
  document.getElementById('user-username-err').style.display = 'none';
  document.getElementById('user-pw-mismatch').style.display  = 'none';

  if (!fullName) { toast('Full name is required', 'error'); return; }
  if (!username) { toast('Username is required', 'error'); return; }
  if (!editId && !pw1) { toast('Password is required for new users', 'error'); return; }
  if (pw1 && pw1.length < 4) { toast('Password must be at least 4 characters', 'error'); return; }
  if (pw1 !== pw2) { document.getElementById('user-pw-mismatch').style.display = 'block'; return; }

  const users = loadUsers();
  const duplicate = users.find(u => u.username.toLowerCase() === username && u.id !== editId);
  if (duplicate) { document.getElementById('user-username-err').style.display = 'block'; return; }

  if (editId) {
    // Update
    const idx = users.findIndex(u => u.id === editId);
    if (idx < 0) return;
    users[idx].fullName = fullName;
    users[idx].username = username;
    users[idx].role = role;
    if (pw1) users[idx].passwordHash = await hashPassword(pw1);
    saveUsers(users);
    // Update current session if editing self
    if (currentUser?.id === editId) {
      currentUser.fullName = fullName;
      currentUser.role = role;
      sessionStorage.setItem(SESS_KEY, JSON.stringify(currentUser));
      updateUserBadge();
    }
    toast(`User "${fullName}" updated ✓`, 'success');
  } else {
    // Create
    const newUser = {
      id: uid(), fullName, username, role,
      passwordHash: await hashPassword(pw1),
      createdAt: iso(), lastLogin: null,
    };
    users.push(newUser);
    saveUsers(users);
    toast(`User "${fullName}" registered ✓`, 'success');
  }

  cancelUserEdit();
  renderUsersTab();
  updateTabVisibility();
}

function deleteUser(id) {
  const users = loadUsers();
  const user = users.find(u => u.id === id);
  if (!user) return;
  confirm2('DELETE USER', `Delete user "${user.fullName}" (@${user.username})? They will no longer be able to log in.`, () => {
    saveUsers(users.filter(u => u.id !== id));
    renderUsersTab();
    updateTabVisibility();
    toast(`User deleted`, 'warning');
  });
}

function confirmClearUsers() {
  confirm2('CLEAR ALL USERS', 'Remove ALL user accounts? The system will revert to open mode (no login required).', () => {
    localStorage.removeItem(AUTH_KEY);
    currentUser = null;
    sessionStorage.removeItem(SESS_KEY);
    updateUserBadge();
    renderUsersTab();
    updateTabVisibility();
    toast('All users removed — system is now in open mode', 'warning');
  });
}

// ── PERMISSIONS ─────────────────────────────────────────────────────────────
function renderPermGrid() {
  const grid = document.getElementById('perm-grid');
  if (!grid) return;
  const perms = loadPerms();
  grid.innerHTML = Object.entries(PERM_LABELS).map(([key, info]) => {
    const p = perms[key] || DEFAULT_PERMS[key];
    return `<div class="perm-row">
      <div>
        <div class="perm-row-label">${info.label}</div>
        <div class="perm-row-sub">${info.sub}</div>
      </div>
      <div class="perm-check on-admin locked" title="Admins always have this permission">✓</div>
      <div class="perm-check ${p.manager?'on-manager':''}" id="perm-m-${key}" onclick="togglePerm('manager','${key}')" title="Toggle for Manager">${p.manager?'✓':''}</div>
      <div class="perm-check ${p.viewer?'on-viewer':''}"  id="perm-v-${key}" onclick="togglePerm('viewer','${key}')"  title="Toggle for Viewer">${p.viewer?'✓':''}</div>
    </div>`;
  }).join('');
}

function togglePerm(role, key) {
  const perms = loadPerms();
  if (!perms[key]) perms[key] = { ...DEFAULT_PERMS[key] };
  // Admin always stays true
  if (role === 'admin') return;
  perms[key][role] = !perms[key][role];
  savePerms(perms);
  appPerms = perms;
  renderPermGrid();
  // Apply UI changes immediately so the user sees the effect
  applyAccessControl();
}

function savePermissions() {
  appPerms = loadPerms();
  updateTabVisibility();
  toast('Access control saved ✓', 'success');
}

// ── ACCESS ENFORCEMENT ───────────────────────────────────────────────────────
function can(action) {
  const users = loadUsers();
  if (users.length === 0) return true; // open mode
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  const perms = appPerms || loadPerms();
  return !!(perms[action] && perms[action][currentUser.role]);
}

function applyAccessControl() {
  // Always reload permissions fresh from storage
  appPerms = loadPerms();
  const users = loadUsers();
  const isOpen = users.length === 0;
  const role = currentUser?.role || (isOpen ? 'admin' : 'viewer');
  const showAll = role === 'admin' || isOpen;

  // Helper: show/disable a button based on permission
  function setBtn(selector, allowed, disabledTitle) {
    document.querySelectorAll(selector).forEach(el => {
      if (allowed) {
        el.disabled = false;
        el.style.opacity = '';
        el.style.pointerEvents = '';
        el.title = '';
      } else {
        el.disabled = true;
        el.style.opacity = '0.35';
        el.style.pointerEvents = 'none';
        el.title = disabledTitle || 'No permission';
      }
    });
  }

  function hideEl(selector, allowed) {
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = allowed ? '' : 'none';
    });
  }

  // ── Admin badge ────────────────────────────────────────
  const adminBadge = document.getElementById('settings-admin-badge');
  if (adminBadge) adminBadge.style.display = (role === 'admin') ? 'block' : 'none';

  // ── Settings tabs (admin-only) ─────────────────────────
  ['stab-users','stab-access','stab-data'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = showAll ? '' : 'none';
  });

  // ── Add Items ──────────────────────────────────────────
  const canAdd = can('addItems');
  document.querySelectorAll('[onclick="openAddItem()"]').forEach(el => {
    el.style.display = canAdd ? '' : 'none';
  });

  // ── Edit Items ─────────────────────────────────────────
  const canEdit = can('editItems');
  // Hide ✎ Edit buttons in inventory table rows
  document.querySelectorAll('[onclick*="editItem("], [onclick*="openInlineEdit("], [onclick*="openEditModal("]').forEach(el => {
    el.style.display = canEdit ? '' : 'none';
  });
  // Hide Edit Details buttons in item cards
  document.querySelectorAll('.item-card-action-btn.edit').forEach(el => {
    el.style.display = canEdit ? '' : 'none';
  });
  // Hide full-editor ⊞ buttons
  document.querySelectorAll('[title="Full edit modal"]').forEach(el => {
    el.style.display = canEdit ? '' : 'none';
  });

  // ── Delete Items ───────────────────────────────────────
  const canDelete = can('deleteItems');
  document.querySelectorAll('[onclick*="deleteItem("]').forEach(el => {
    el.style.display = canDelete ? '' : 'none';
  });

  // ── Stock In ───────────────────────────────────────────
  const canStockIn = can('stockIn');
  document.querySelectorAll('[onclick*="openStockIn("]').forEach(el => {
    el.style.display = canStockIn ? '' : 'none';
  });

  // ── Stock Out ──────────────────────────────────────────
  const canStockOut = can('stockOut');
  document.querySelectorAll('[onclick*="openStockOut("]').forEach(el => {
    el.style.display = canStockOut ? '' : 'none';
  });

  // ── Clear Data ─────────────────────────────────────────
  const canClear = can('clearData');
  const clearBtn = document.getElementById('btn-clear-data');
  if (clearBtn) {
    clearBtn.disabled = !canClear;
    clearBtn.style.opacity = canClear ? '' : '0.35';
    clearBtn.style.pointerEvents = canClear ? '' : 'none';
    clearBtn.title = canClear ? '' : 'No permission to clear data';
  }

  // ── Export Data ────────────────────────────────────────
  const canExport = can('exportData');
  document.querySelectorAll('[onclick*="exportJSON"], [onclick*="exportExcel"], [onclick*="exportCSV"], [onchange*="restoreJSON"]').forEach(el => {
    const wrap = el.closest('label') || el;
    wrap.style.display = canExport ? '' : 'none';
  });
  // Export buttons on reports page
  document.querySelectorAll('[onclick="exportExcel()"], [onclick="exportCSV()"], [onclick="exportJSON()"]').forEach(el => {
    const wrap = el.closest('label') || el;
    wrap.style.display = canExport ? '' : 'none';
  });

  // ── Categories ─────────────────────────────────────────
  const canCats = can('manageCategories');
  document.querySelectorAll('[onclick*="openCategoryForm"], [onclick*="editCategory"], [onclick*="deleteCat"]').forEach(el => {
    el.style.display = canCats ? '' : 'none';
  });
  hideEl('[onclick="openCategoryForm()"]', canCats);

  // ── Suppliers ──────────────────────────────────────────
  const canSups = can('manageSuppliers');
  document.querySelectorAll('[onclick*="openSupplierForm"], [onclick*="editSupplier"], [onclick*="deleteSupplier"]').forEach(el => {
    el.style.display = canSups ? '' : 'none';
  });

  // ── Sidebar nav — show/hide by permission ─────────────
  // Map: nav item ID -> permission key (null = always visible)
  const navPerms = {
    'nav-dashboard':     null,
    'nav-inventory':     null,
    'nav-items':         null,
    'nav-transactions':  null,
    'nav-reports':       'viewReports',
    'nav-entry-new':     'entryDashboards',
    'nav-entry-rent':    'entryDashboards',
    'nav-entry-return':  'entryDashboards',
    'nav-entry-repair':  'entryDashboards',
    'nav-entry-disposal':'entryDashboards',
    'nav-entry-sale':    'entryDashboards',
    'nav-categories':    'manageCategories',
    'nav-suppliers':     'manageSuppliers',
    'nav-settings':      null,
  };

  Object.entries(navPerms).forEach(([id, perm]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = (perm === null || can(perm)) ? '' : 'none';
  });

  // Hide nav section labels when all items under them are hidden
  const sectionMap = {
    'nav-sec-reports': ['nav-reports'],
    'nav-sec-entry':   ['nav-entry-new','nav-entry-rent','nav-entry-return','nav-entry-repair','nav-entry-disposal','nav-entry-sale'],
    'nav-sec-config':  ['nav-categories','nav-suppliers','nav-settings'],
  };
  Object.entries(sectionMap).forEach(([secId, itemIds]) => {
    const sec = document.getElementById(secId);
    if (!sec) return;
    const anyVisible = itemIds.some(id => {
      const el = document.getElementById(id);
      return el && el.style.display !== 'none';
    });
    sec.style.display = anyVisible ? '' : 'none';
  });

  // ── Inline edit Save button ────────────────────────────
  document.querySelectorAll('[onclick*="saveInlineEdit("]').forEach(el => {
    el.style.display = canEdit ? '' : 'none';
  });
}

function requirePerm(action, onAllow) {
  if (can(action)) { onAllow(); }
  else { toast(`Access denied — your role cannot perform this action.`, 'error'); }
}

// ── SETTINGS TABS ────────────────────────────────────────────────────────────
function switchSettingsTab(tab) {
  ['general','users','access','data'].forEach(t => {
    const panel = document.getElementById('spanel-' + t);
    const stab  = document.getElementById('stab-'  + t);
    if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
    if (stab)  stab.classList.toggle('active', t === tab);
  });
  if (tab === 'users')  { renderUsersTab(); cancelUserEdit(); }
  if (tab === 'access') renderPermGrid();
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function togglePwVis(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
}

function renderSettings() {
  const s = db.settings;
  document.getElementById('set-currency').value = s.currency;
  document.getElementById('set-markup').value = s.markup;
  document.getElementById('set-tax').value = s.tax;
  document.getElementById('set-min-stock').value = s.minStock;
  document.getElementById('set-company').value = s.company||'';
  document.getElementById('tog-tax').className = 'toggle' + (s.enableTax?' on':'');
  document.getElementById('tog-margin').className = 'toggle' + (s.showMargin?' on':'');
  document.getElementById('ov-items').textContent = db.items.length;
  document.getElementById('ov-tx').textContent = db.transactions.length;
  document.getElementById('ov-cats').textContent = db.categories.length;
  document.getElementById('ov-sups').textContent = db.suppliers.length;
  document.getElementById('ov-users').textContent = loadUsers().length;
  // Reflect current theme in appearance cards
  applyTheme(localStorage.getItem('inventrack_theme') || 'dark');
  // Always reset to General tab so panels are in a known visible state
  switchSettingsTab('general');
  applyAccessControl();
}

function toggleSetting(id) {
  const el = document.getElementById(id);
  el.classList.toggle('on');
}

function saveSettings() {
  db.settings = {
    currency: document.getElementById('set-currency').value,
    markup: parseFloat(document.getElementById('set-markup').value)||20,
    tax: parseFloat(document.getElementById('set-tax').value)||12,
    minStock: parseInt(document.getElementById('set-min-stock').value)||5,
    company: document.getElementById('set-company').value.trim(),
    enableTax: document.getElementById('tog-tax').classList.contains('on'),
    showMargin: document.getElementById('tog-margin').classList.contains('on'),
  };
  saveStore();
  toast('Settings saved ✓');
  renderDashboard();
}

function updateCurrencyPreview() {
  // live preview happens via renderSettings on save
}

function confirmClearData() {
  if (!can('clearData')) { toast('Access denied — you do not have permission to clear data.', 'error'); return; }
  confirm2('⚠ CLEAR ALL DATA', 'This will permanently delete ALL items, transactions, categories, and suppliers. This action cannot be undone!', () => {
    localStorage.removeItem(STORE_KEY);
    db = defaultStore();
    toast('All data cleared', 'warning');
    renderDashboard();
    renderSettings();
  });
}

// ════════════════════════════════════════════════════════
//  EXPORT / BACKUP
// ════════════════════════════════════════════════════════
function exportJSON() {
  if (!can('exportData')) { toast('Access denied — you cannot export data.', 'error'); return; }
  const json = JSON.stringify(db, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventrack_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup exported ✓');
}

function restoreJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.items || !data.transactions) { toast('Invalid backup file', 'error'); return; }
      confirm2('RESTORE BACKUP', `This will replace all current data with the backup from ${file.name}. Continue?`, () => {
        db = data;
        saveStore();
        renderDashboard();
        toast('Data restored from backup ✓');
      });
    } catch { toast('Failed to read backup file', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function exportCSV() {
  if (!can('exportData')) { toast('Access denied.', 'error'); return; }
  const txns = getReportTxns();
  const rows = [
    ['Date','Item Name','Item Code','Type','Qty','Unit Price','Total','Supplier','Notes'],
    ...txns.map(t=>[fmtDate(t.date),t.itemName,t.itemCode,t.type.toUpperCase(),t.qty,t.price,t.total,t.supplierName||'',t.notes||''])
  ];
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventrack_report_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported ✓');
}

function exportExcel() {
  if (!can('exportData')) { toast('Access denied.', 'error'); return; }
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const txns = getReportTxns();
  const totalIn = txns.filter(t=>t.type==='in').reduce((s,t)=>s+t.total,0);
  const totalOut = txns.filter(t=>t.type==='out').reduce((s,t)=>s+t.total,0);
  const summary = [
    ['INVENTRACK — Inventory Report'],
    ['Company', db.settings.company||''],
    ['Generated', new Date().toLocaleString()],
    ['Currency', db.settings.currency],
    [],
    ['FINANCIAL SUMMARY'],
    ['Stock In Value', totalIn],
    ['Stock Out Value', totalOut],
    ['Net Revenue', totalOut-totalIn],
    ['Total Transactions', txns.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  // Transactions sheet
  const txData = [
    ['Date','Item Name','Item Code','Type','Qty','Unit Price','Total','Supplier','Notes'],
    ...txns.map(t=>[fmtDate(t.date),t.itemName,t.itemCode,t.type.toUpperCase(),t.qty,t.price,t.total,t.supplierName||'',t.notes||''])
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txData), 'Transactions');

  // Inventory sheet
  const invData = [
    ['Code','Item Name','Category','Type','Condition','Qty','Sell Price','Cost','Total Value','Margin %','Supplier','Notes'],
    ...db.items.map(i=>[i.code,i.name,i.catName||'',i.type==='for_rent'?'For Rent':'Purchased',i.condition,i.qty,i.price,i.cost,i.price*i.qty,i.price>0?((i.price-i.cost)/i.price*100).toFixed(1)+'%':'0%',i.supplierName||'',i.notes||''])
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invData), 'Inventory');

  XLSX.writeFile(wb, `inventrack_report_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Excel report exported ✓');
}

// ════════════════════════════════════════════════════════
//  CLOCK & INIT
// ════════════════════════════════════════════════════════
function updateClock() {
  const now = new Date();
  document.getElementById('sidebar-time').textContent = now.toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'});
  document.getElementById('topbar-date').textContent = now.toLocaleDateString('en-PH', {month:'short',day:'numeric',year:'numeric'});
}


// ════════════════════════════════════════════════════════
//  ENTRY DASHBOARDS — Shared helpers
// ════════════════════════════════════════════════════════

// All entry-specific logs stored in db.entryLogs (initialized in loadStore)

function entryGenCode(inputId) {
  document.getElementById(inputId).value = generateCodeVal();
}

function entryAutoPrice(costId, priceId) {
  const cost = parseFloat(document.getElementById(costId).value) || 0;
  const priceEl = document.getElementById(priceId);
  if (cost > 0 && !priceEl.value) {
    priceEl.value = (cost * (1 + db.settings.markup / 100)).toFixed(2);
  }
}

// entryPopulateItemSelect is now replaced by the ItemSearch component below

// ════════════════════════════════════════════════════════
//  ITEM SEARCH AUTOCOMPLETE — Entry Dashboards
// ════════════════════════════════════════════════════════
// Each entry type has a key: 'rent','ret','rep','dis','sale'
// State: which item is selected per key
const _itemSearchState = {};  // key -> { focusIdx }

function _itemSearchKey(key)    { return `en-${key}-item`; }
function _itemSearchInput(key)  { return document.getElementById(`en-${key}-item-search`); }
function _itemSearchHidden(key) { return document.getElementById(`en-${key}-item`); }
function _itemSearchDrop(key)   { return document.getElementById(`en-${key}-item-dropdown`); }
function _itemSearchSel(key)    { return document.getElementById(`en-${key}-item-selected`); }
function _itemSearchSelName(key){ return document.getElementById(`en-${key}-item-selname`); }
function _itemSearchSelMeta(key){ return document.getElementById(`en-${key}-item-selmeta`); }

function itemSearchOpen(key) {
  itemSearchFilter(key);
  const drop = _itemSearchDrop(key);
  if (drop) drop.classList.add('open');
  _itemSearchState[key] = { focusIdx: -1 };
  // Close other open dropdowns
  ['rent','ret','rep','dis','sale'].forEach(k => {
    if (k !== key) _itemSearchDrop(k)?.classList.remove('open');
  });
  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function _close(e) {
      const wrap = document.getElementById(`iswrap-${key}`);
      if (wrap && !wrap.contains(e.target)) {
        _itemSearchDrop(key)?.classList.remove('open');
        document.removeEventListener('click', _close);
      }
    });
  }, 10);
}

function itemSearchFilter(key) {
  const input = _itemSearchInput(key);
  const drop  = _itemSearchDrop(key);
  if (!input || !drop) return;

  const q = input.value.toLowerCase().trim();
  const items = db.items.filter(i => {
    if (!q) return true;
    return i.name.toLowerCase().includes(q)
      || i.code.toLowerCase().includes(q)
      || (i.catName || '').toLowerCase().includes(q)
      || (i.supplierName || '').toLowerCase().includes(q);
  });

  _itemSearchState[key] = { focusIdx: -1 };

  if (items.length === 0) {
    drop.innerHTML = `<div class="item-search-no-results">No items found for "${esc(q)}"</div>`;
    drop.classList.add('open');
    return;
  }

  const condColor = { new:'var(--blue)', good:'var(--green)', fair:'#fb923c', poor:'var(--red)' };
  drop.innerHTML = items.map((i, idx) => {
    const isLow  = i.qty > 0 && i.qty <= (i.minStock || db.settings.minStock);
    const isZero = i.qty === 0;
    const qtyColor = isZero ? 'var(--red)' : isLow ? '#fb923c' : 'var(--green)';
    const cat = i.catName ? `<span style="color:var(--text3)">${esc(i.catName)}</span>` : '';
    const sup = i.supplierName ? `<span style="color:var(--text3)"> · ${esc(i.supplierName)}</span>` : '';
    const cond = `<span style="color:${condColor[i.condition]||'var(--text3)'}">${i.condition}</span>`;
    // Highlight matching text
    const nameHl = (()=>{ try { const safe=q.replace(/[-[\]{}()*+?.,\\^$|#]/g,'\\$&'); return q ? esc(i.name).replace(new RegExp(safe,'gi'),m=>`<mark style="background:var(--accent-dim);color:var(--accent);border-radius:2px">${m}</mark>`) : esc(i.name); } catch(e){ return esc(i.name); } })();
    return `<div class="item-search-option" data-id="${i.id}" data-key="${key}" data-idx="${idx}"
      onmousedown="itemSearchSelect('${key}','${i.id}')"
      onmouseover="itemSearchHover('${key}',${idx})">
      <div class="item-search-option-info">
        <div class="item-search-option-name">${nameHl}</div>
        <div class="item-search-option-sub">
          <span class="code-chip" style="font-size:10px">${esc(i.code)}</span>
          ${cat}${sup} · ${cond}
        </div>
      </div>
      <div class="item-search-option-stock" style="color:${qtyColor}">
        ${isZero ? '✕ 0' : isLow ? `⚠ ${i.qty}` : `✓ ${i.qty}`}
        <div style="font-size:9px;color:var(--text3);font-weight:400">in stock</div>
      </div>
    </div>`;
  }).join('');
  drop.classList.add('open');
}

function itemSearchHover(key, idx) {
  const drop = _itemSearchDrop(key);
  if (!drop) return;
  drop.querySelectorAll('.item-search-option').forEach((el, i) => el.classList.toggle('focused', i === idx));
  if (_itemSearchState[key]) _itemSearchState[key].focusIdx = idx;
}

function itemSearchKey(e, key) {
  const drop = _itemSearchDrop(key);
  if (!drop || !drop.classList.contains('open')) return;
  const opts = drop.querySelectorAll('.item-search-option[data-id]');
  const state = _itemSearchState[key] || { focusIdx: -1 };
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.focusIdx = Math.min(state.focusIdx + 1, opts.length - 1);
    opts.forEach((el, i) => el.classList.toggle('focused', i === state.focusIdx));
    opts[state.focusIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.focusIdx = Math.max(state.focusIdx - 1, 0);
    opts.forEach((el, i) => el.classList.toggle('focused', i === state.focusIdx));
    opts[state.focusIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const focused = drop.querySelector('.item-search-option.focused');
    if (focused) itemSearchSelect(key, focused.dataset.id);
  } else if (e.key === 'Escape') {
    drop.classList.remove('open');
  }
  _itemSearchState[key] = state;
}

function itemSearchSelect(key, itemId) {
  const item = db.items.find(i => i.id === itemId);
  if (!item) return;

  // Set hidden value
  const hidden = _itemSearchHidden(key);
  if (hidden) hidden.value = itemId;

  // Hide text input row, show selected badge
  const input = _itemSearchInput(key);
  if (input) { input.value = ''; input.parentElement.style.display = 'none'; }

  const selDiv = _itemSearchSel(key);
  const selName = _itemSearchSelName(key);
  const selMeta = _itemSearchSelMeta(key);
  if (selDiv)  selDiv.classList.add('visible');
  if (selName) selName.textContent = item.name;
  if (selMeta) selMeta.textContent = `${item.code}  ·  Stock: ${item.qty}  ·  ${item.condition}`;

  // Close dropdown
  _itemSearchDrop(key)?.classList.remove('open');

  // Trigger any callbacks for this key
  if (key === 'sale') entrySaleFillPrice();
}

function itemSearchClearSel(key) {
  // Clear hidden value
  const hidden = _itemSearchHidden(key);
  if (hidden) hidden.value = '';

  // Show text input row, hide selected badge
  const input = _itemSearchInput(key);
  if (input) { input.value = ''; input.parentElement.style.display = 'flex'; input.focus(); }

  const selDiv = _itemSearchSel(key);
  if (selDiv) selDiv.classList.remove('visible');

  // Re-open dropdown showing all items
  itemSearchOpen(key);
}

function itemSearchReset(key) {
  // Called after a form submit to reset to empty state
  const hidden = _itemSearchHidden(key);
  if (hidden) hidden.value = '';
  const input = _itemSearchInput(key);
  if (input) { input.value = ''; input.parentElement.style.display = 'flex'; }
  const selDiv = _itemSearchSel(key);
  if (selDiv) selDiv.classList.remove('visible');
  _itemSearchDrop(key)?.classList.remove('open');
}

// Stub to keep backward compatibility (called in render* functions)
function entryPopulateItemSelect(selectId, filterType) { /* replaced by ItemSearch */ }

function entryPopulateNewSelects() {
  const cat = document.getElementById('en-new-cat');
  const sup = document.getElementById('en-new-sup');
  if (cat) {
    cat.innerHTML = '<option value="">Select…</option>' +
      db.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
  if (sup) {
    sup.innerHTML = '<option value="">None</option>' +
      db.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }
}

function entryTodayLogs(type) {
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  return db.entryLogs.filter(l => l.type === type && new Date(l.date) >= todayStart);
}

function entryAllLogs(type) {
  return db.entryLogs.filter(l => l.type === type);
}

// ── NEW ITEMS ──────────────────────────────────────────
function renderEntryNew() {
  entryPopulateNewSelects();
  document.getElementById('en-new-code').value = document.getElementById('en-new-code').value || generateCodeVal();

  const todayLogs = entryTodayLogs('new');
  const allLogs = entryAllLogs('new');
  document.getElementById('en-new-today').textContent = todayLogs.length;
  document.getElementById('en-new-total').textContent = allLogs.length;
  document.getElementById('en-new-value').textContent = fmt(todayLogs.reduce((s,l) => s + (l.price * l.qty), 0));
  document.getElementById('en-new-units').textContent = todayLogs.reduce((s,l) => s + l.qty, 0);

  const tbody = document.getElementById('en-new-log');
  const logs = [...db.entryLogs].filter(l => l.type === 'new').reverse();
  document.getElementById('en-new-empty').style.display = logs.length ? 'none' : 'block';
  tbody.innerHTML = logs.map(l => `<tr>
    <td class="mono">${fmtDate(l.date)}</td>
    <td><span class="code-chip">${esc(l.itemCode)}</span></td>
    <td><strong>${esc(l.itemName)}</strong></td>
    <td>${l.catName ? `<span class="pill pill-blue">${esc(l.catName)}</span>` : '—'}</td>
    <td class="mono">${l.qty}</td>
    <td class="mono" style="color:var(--text2)">${fmt(l.cost)}</td>
    <td class="mono" style="color:var(--green)">${fmt(l.price)}</td>
    <td style="color:var(--text2);font-size:12px">${esc(l.supplierName || '—')}</td>
  </tr>`).join('');
}

// ── FOR RENT ──────────────────────────────────────────
function renderEntryRent() {
  itemSearchReset('rent');
  // Set today as default date
  const today = new Date().toISOString().slice(0,10);
  if (!document.getElementById('en-rent-date-out').value) document.getElementById('en-rent-date-out').value = today;

  const todayLogs = entryTodayLogs('rent');
  const allOut = entryAllLogs('rent').reduce((s,l) => s + l.qty, 0);
  const allRet = entryAllLogs('return').reduce((s,l) => s + l.qty, 0);
  document.getElementById('en-rent-today').textContent = todayLogs.length;
  document.getElementById('en-rent-out').textContent = Math.max(0, allOut - allRet);
  document.getElementById('en-rent-rev').textContent = fmt(todayLogs.reduce((s,l) => s + (l.fee * l.qty), 0));
  document.getElementById('en-rent-units').textContent = todayLogs.reduce((s,l) => s + l.qty, 0);

  const logs = db.entryLogs.filter(l => l.type === 'rent').slice().reverse();
  document.getElementById('en-rent-empty').style.display = logs.length ? 'none' : 'block';
  document.getElementById('en-rent-log').innerHTML = logs.map(l => `<tr>
    <td class="mono">${fmtDate(l.date)}</td>
    <td><strong>${esc(l.itemName)}</strong> <span class="code-chip" style="font-size:9px">${esc(l.itemCode)}</span></td>
    <td style="color:var(--purple)">${esc(l.customer)}</td>
    <td class="mono">${l.qty}</td>
    <td class="mono" style="color:var(--green)">${fmt(l.fee * l.qty)}</td>
    <td class="mono" style="color:var(--text2)">${l.expectedReturn || '—'}</td>
    <td style="font-size:12px;color:var(--text2)">${esc(l.notes || '')}</td>
  </tr>`).join('');
}

// ── RETURNS ──────────────────────────────────────────
function renderEntryReturn() {
  itemSearchReset('ret');

  const todayLogs = entryTodayLogs('return');
  const allLogs = entryAllLogs('return');
  const damaged = allLogs.filter(l => l.condition === 'poor');
  document.getElementById('en-ret-today').textContent = todayLogs.length;
  document.getElementById('en-ret-total').textContent = allLogs.length;
  document.getElementById('en-ret-units').textContent = todayLogs.reduce((s,l) => s + l.qty, 0);
  document.getElementById('en-ret-damaged').textContent = damaged.length;

  const logs = db.entryLogs.filter(l => l.type === 'return').slice().reverse();
  document.getElementById('en-ret-empty').style.display = logs.length ? 'none' : 'block';
  const condPill = { new:'pill-blue', good:'pill-green', fair:'pill-amber', poor:'pill-red' };
  document.getElementById('en-ret-log').innerHTML = logs.map(l => `<tr>
    <td class="mono">${fmtDate(l.date)}</td>
    <td><strong>${esc(l.itemName)}</strong> <span class="code-chip" style="font-size:9px">${esc(l.itemCode)}</span></td>
    <td style="color:var(--blue)">${esc(l.returnedBy)}</td>
    <td class="mono">${l.qty}</td>
    <td><span class="pill ${condPill[l.condition]||'pill-gray'}">${l.condition}</span></td>
    <td style="font-size:12px;color:var(--text2)">${esc(l.notes || '')}</td>
  </tr>`).join('');
}

// ── FOR REPAIR ──────────────────────────────────────────
function renderEntryRepair() {
  itemSearchReset('rep');
  const today = new Date().toISOString().slice(0,10);
  if (!document.getElementById('en-rep-date-sent').value) document.getElementById('en-rep-date-sent').value = today;

  const todayLogs = entryTodayLogs('repair');
  const allPending = entryAllLogs('repair').length;
  document.getElementById('en-rep-today').textContent = todayLogs.length;
  document.getElementById('en-rep-pending').textContent = allPending;
  document.getElementById('en-rep-cost').textContent = fmt(todayLogs.reduce((s,l) => s + (l.estCost || 0), 0));
  document.getElementById('en-rep-units').textContent = todayLogs.reduce((s,l) => s + l.qty, 0);

  const logs = db.entryLogs.filter(l => l.type === 'repair').slice().reverse();
  document.getElementById('en-rep-empty').style.display = logs.length ? 'none' : 'block';
  document.getElementById('en-rep-log').innerHTML = logs.map(l => `<tr>
    <td class="mono">${fmtDate(l.date)}</td>
    <td><strong>${esc(l.itemName)}</strong> <span class="code-chip" style="font-size:9px">${esc(l.itemCode)}</span></td>
    <td style="color:#fb923c">${esc(l.shop)}</td>
    <td class="mono">${l.qty}</td>
    <td class="mono" style="color:var(--accent)">${l.estCost ? fmt(l.estCost) : '—'}</td>
    <td class="mono" style="color:var(--text2)">${l.estReturn || '—'}</td>
    <td style="font-size:12px;color:var(--text2)">${esc(l.issue || '')}</td>
  </tr>`).join('');
}

// ── DISPOSAL ──────────────────────────────────────────
function renderEntryDisposal() {
  itemSearchReset('dis');

  const todayLogs = entryTodayLogs('disposal');
  const allLogs = entryAllLogs('disposal');
  document.getElementById('en-dis-today').textContent = todayLogs.length;
  document.getElementById('en-dis-total').textContent = allLogs.length;
  // Loss = cost value of disposed items
  const todayLoss = todayLogs.reduce((s,l) => {
    const item = db.items.find(i => i.id === l.itemId);
    return s + ((item?.cost || 0) * l.qty);
  }, 0);
  document.getElementById('en-dis-loss').textContent = fmt(todayLoss);
  document.getElementById('en-dis-units').textContent = todayLogs.reduce((s,l) => s + l.qty, 0);

  const logs = db.entryLogs.filter(l => l.type === 'disposal').slice().reverse();
  document.getElementById('en-dis-empty').style.display = logs.length ? 'none' : 'block';
  const methodPills = { scrapped:'pill-red', destroyed:'pill-red', donated:'pill-green', lost:'pill-amber', expired:'pill-amber', other:'pill-gray' };
  document.getElementById('en-dis-log').innerHTML = logs.map(l => `<tr>
    <td class="mono">${fmtDate(l.date)}</td>
    <td><strong>${esc(l.itemName)}</strong> <span class="code-chip" style="font-size:9px">${esc(l.itemCode)}</span></td>
    <td class="mono">${l.qty}</td>
    <td><span class="pill ${methodPills[l.method]||'pill-gray'}">${l.method}</span></td>
    <td class="mono" style="color:var(--red)">${fmt(l.bookValue)}</td>
    <td style="font-size:12px;color:var(--text2)">${esc(l.authorizedBy || '—')}</td>
    <td style="font-size:12px;color:var(--text2)">${esc(l.reason || '')}</td>
  </tr>`).join('');
}

// ── FOR SALE ──────────────────────────────────────────
function renderEntrySale() {
  itemSearchReset('sale');

  const todayLogs = entryTodayLogs('sale');
  const rev = todayLogs.reduce((s,l) => s + l.total, 0);
  const profit = todayLogs.reduce((s,l) => {
    const item = db.items.find(i => i.id === l.itemId);
    return s + ((l.salePrice - (item?.cost || 0)) * l.qty);
  }, 0);
  document.getElementById('en-sale-today').textContent = todayLogs.length;
  document.getElementById('en-sale-rev').textContent = fmt(rev);
  document.getElementById('en-sale-profit').textContent = fmt(profit);
  document.getElementById('en-sale-units').textContent = todayLogs.reduce((s,l) => s + l.qty, 0);

  const logs = db.entryLogs.filter(l => l.type === 'sale').slice().reverse();
  document.getElementById('en-sale-empty').style.display = logs.length ? 'none' : 'block';
  const pmColor = { cash:'pill-green', gcash:'pill-blue', bank:'pill-blue', credit:'pill-purple', check:'pill-amber', other:'pill-gray' };
  document.getElementById('en-sale-log').innerHTML = logs.map(l => {
    const item = db.items.find(i => i.id === l.itemId);
    const profit = ((l.salePrice - (item?.cost || 0)) * l.qty);
    return `<tr>
      <td class="mono">${fmtDate(l.date)}</td>
      <td><strong>${esc(l.itemName)}</strong> <span class="code-chip" style="font-size:9px">${esc(l.itemCode)}</span></td>
      <td style="color:var(--text2)">${esc(l.buyer || '—')}</td>
      <td class="mono">${l.qty}</td>
      <td class="mono">${fmt(l.salePrice)}</td>
      <td class="mono" style="color:var(--green)">${fmt(l.total)}</td>
      <td class="mono" style="color:var(--accent)">${fmt(profit)}</td>
      <td><span class="pill ${pmColor[l.payment]||'pill-gray'}">${l.payment}</span></td>
    </tr>`;
  }).join('');
}

function entrySaleFillPrice() {
  const itemId = document.getElementById('en-sale-item').value;
  if (!itemId) return;
  const item = db.items.find(i => i.id === itemId);
  if (item) {
    document.getElementById('en-sale-price').value = item.price;
    entrySaleCalc();
  }
}

function entrySaleCalc() {
  const qty   = parseInt(document.getElementById('en-sale-qty').value) || 0;
  const price = parseFloat(document.getElementById('en-sale-price').value) || 0;
  const total = qty * price;
  document.getElementById('en-sale-total').textContent = fmt(total);
  const itemId = document.getElementById('en-sale-item').value;
  const item = db.items.find(i => i.id === itemId);
  const cost = item?.cost || 0;
  const profit = (price - cost) * qty;
  document.getElementById('en-sale-est-profit').textContent = fmt(profit);
}

// ════════════════════════════════════════════════════════
//  ENTRY SUBMIT HANDLERS
// ════════════════════════════════════════════════════════
function entrySubmit(type) {
  if (!can('entryDashboards')) { toast('Access denied — you cannot use entry dashboards.', 'error'); return; }
  if (type === 'new') return entrySubmitNew();
  if (type === 'rent') return entrySubmitRent();
  if (type === 'return') return entrySubmitReturn();
  if (type === 'repair') return entrySubmitRepair();
  if (type === 'sale') return entrySubmitSale();
}

function entrySubmitNew() {
  const name = document.getElementById('en-new-name').value.trim();
  const code = document.getElementById('en-new-code').value.trim() || generateCodeVal();
  const catId = document.getElementById('en-new-cat').value;
  const cost = parseFloat(document.getElementById('en-new-cost').value) || 0;
  const price = parseFloat(document.getElementById('en-new-price').value) || 0;
  const qty = parseInt(document.getElementById('en-new-qty').value) || 0;
  const condition = document.getElementById('en-new-cond').value;
  const notes = document.getElementById('en-new-notes').value.trim();
  const supId = document.getElementById('en-new-sup').value;

  if (!name) { toast('Item name is required', 'error'); return; }
  if (!catId) { toast('Please select a category', 'error'); return; }
  if (qty <= 0) { toast('Quantity must be at least 1', 'error'); return; }
  if (db.items.some(i => i.code === code)) { toast('Item code already in use — auto-generating new code', 'warning'); document.getElementById('en-new-code').value = generateCodeVal(); return; }

  const cat = db.categories.find(c => c.id === catId);
  const sup = db.suppliers.find(s => s.id === supId);

  // Add to main inventory
  const newItem = {
    id: uid(), code, name,
    catId, catName: cat?.name || '',
    supplierId: supId || '', supplierName: sup?.name || '',
    cost, price, qty, type: 'purchased', condition,
    minStock: db.settings.minStock, notes,
    createdAt: iso(), updatedAt: iso(),
  };
  db.items.push(newItem);

  // Log it
  db.entryLogs.push({ id: uid(), type: 'new', date: iso(), itemId: newItem.id, itemCode: code, itemName: name, catName: cat?.name || '', qty, cost, price, supplierName: sup?.name || '', notes });

  // Also log a stock-in transaction
  db.transactions.unshift({ id: uid(), itemId: newItem.id, itemCode: code, itemName: name, type: 'in', qty, price: cost, total: qty * cost, supplierId: supId || '', supplierName: sup?.name || '', notes: 'New item entry', date: iso() });

  saveStore();
  toast(`✓ New item "${name}" added to inventory`, 'success');

  // Reset form
  document.getElementById('en-new-name').value = '';
  document.getElementById('en-new-code').value = generateCodeVal();
  document.getElementById('en-new-cost').value = '';
  document.getElementById('en-new-price').value = '';
  document.getElementById('en-new-qty').value = '';
  document.getElementById('en-new-notes').value = '';
  renderEntryNew();
  renderDashboard();
}

function entrySubmitRent() {
  const itemId = document.getElementById('en-rent-item').value;
  const customer = document.getElementById('en-rent-customer').value.trim();
  const qty = parseInt(document.getElementById('en-rent-qty').value) || 0;
  const fee = parseFloat(document.getElementById('en-rent-fee').value) || 0;
  const dateOut = document.getElementById('en-rent-date-out').value;
  const expectedReturn = document.getElementById('en-rent-date-ret').value;
  const notes = document.getElementById('en-rent-notes').value.trim();

  if (!itemId) { toast('Please select an item', 'error'); return; }
  if (!customer) { toast('Customer name is required', 'error'); return; }
  if (qty <= 0) { toast('Quantity must be at least 1', 'error'); return; }
  if (fee <= 0) { toast('Rental fee is required', 'error'); return; }

  const item = db.items.find(i => i.id === itemId);
  if (!item) return;
  if (qty > item.qty) { toast(`Insufficient stock. Available: ${item.qty}`, 'error'); return; }

  // Deduct stock
  item.qty -= qty;
  item.updatedAt = iso();

  db.entryLogs.push({ id: uid(), type: 'rent', date: iso(), itemId, itemCode: item.code, itemName: item.name, qty, fee, customer, dateOut, expectedReturn, notes });
  db.transactions.unshift({ id: uid(), itemId, itemCode: item.code, itemName: item.name, type: 'out', qty, price: fee, total: qty * fee, supplierId: '', supplierName: '', notes: `Rented to: ${customer}`, date: iso() });

  saveStore();
  toast(`✓ Rental logged: ${qty}× ${item.name} → ${customer}`, 'success');

  itemSearchReset('rent');
  document.getElementById('en-rent-customer').value = '';
  document.getElementById('en-rent-qty').value = '';
  document.getElementById('en-rent-fee').value = '';
  document.getElementById('en-rent-date-ret').value = '';
  document.getElementById('en-rent-notes').value = '';
  renderEntryRent();
  renderDashboard();
}

function entrySubmitReturn() {
  const itemId = document.getElementById('en-ret-item').value;
  const returnedBy = document.getElementById('en-ret-from').value.trim();
  const qty = parseInt(document.getElementById('en-ret-qty').value) || 0;
  const condition = document.getElementById('en-ret-cond').value;
  const notes = document.getElementById('en-ret-notes').value.trim();

  if (!itemId) { toast('Please select an item', 'error'); return; }
  if (!returnedBy) { toast('Please enter who is returning the item', 'error'); return; }
  if (qty <= 0) { toast('Quantity must be at least 1', 'error'); return; }

  const item = db.items.find(i => i.id === itemId);
  if (!item) return;

  // Restore stock
  item.qty += qty;
  item.condition = condition;
  item.updatedAt = iso();

  db.entryLogs.push({ id: uid(), type: 'return', date: iso(), itemId, itemCode: item.code, itemName: item.name, qty, condition, returnedBy, notes });
  db.transactions.unshift({ id: uid(), itemId, itemCode: item.code, itemName: item.name, type: 'in', qty, price: 0, total: 0, supplierId: '', supplierName: '', notes: `Returned by: ${returnedBy}`, date: iso() });

  saveStore();
  toast(`✓ Return logged: ${qty}× ${item.name} from ${returnedBy}`, 'success');

  itemSearchReset('ret');
  document.getElementById('en-ret-from').value = '';
  document.getElementById('en-ret-qty').value = '';
  document.getElementById('en-ret-notes').value = '';
  renderEntryReturn();
  renderDashboard();
}

function entrySubmitRepair() {
  const itemId = document.getElementById('en-rep-item').value;
  const shop = document.getElementById('en-rep-shop').value.trim();
  const qty = parseInt(document.getElementById('en-rep-qty').value) || 0;
  const estCost = parseFloat(document.getElementById('en-rep-est-cost').value) || 0;
  const dateSent = document.getElementById('en-rep-date-sent').value;
  const estReturn = document.getElementById('en-rep-date-est').value;
  const issue = document.getElementById('en-rep-issue').value.trim();

  if (!itemId) { toast('Please select an item', 'error'); return; }
  if (!shop) { toast('Repair shop / technician is required', 'error'); return; }
  if (qty <= 0) { toast('Quantity must be at least 1', 'error'); return; }
  if (!issue) { toast('Issue description is required', 'error'); return; }

  const item = db.items.find(i => i.id === itemId);
  if (!item) return;
  if (qty > item.qty) { toast(`Insufficient stock. Available: ${item.qty}`, 'error'); return; }

  // Deduct stock (items are out for repair)
  item.qty -= qty;
  item.updatedAt = iso();

  db.entryLogs.push({ id: uid(), type: 'repair', date: iso(), itemId, itemCode: item.code, itemName: item.name, qty, shop, estCost, dateSent, estReturn, issue });
  db.transactions.unshift({ id: uid(), itemId, itemCode: item.code, itemName: item.name, type: 'out', qty, price: estCost, total: estCost, supplierId: '', supplierName: '', notes: `For repair: ${shop} — ${issue}`, date: iso() });

  saveStore();
  toast(`✓ Repair entry logged: ${qty}× ${item.name} → ${shop}`, 'success');

  itemSearchReset('rep');
  document.getElementById('en-rep-shop').value = '';
  document.getElementById('en-rep-qty').value = '';
  document.getElementById('en-rep-est-cost').value = '';
  document.getElementById('en-rep-date-est').value = '';
  document.getElementById('en-rep-issue').value = '';
  renderEntryRepair();
  renderDashboard();
}

function entrySubmitDisposal() {
  if (!can('entryDashboards')) { toast('Access denied.', 'error'); return; }
  const itemId = document.getElementById('en-dis-item').value;
  const qty = parseInt(document.getElementById('en-dis-qty').value) || 0;
  const method = document.getElementById('en-dis-method').value;
  const authorizedBy = document.getElementById('en-dis-auth').value.trim();
  const reason = document.getElementById('en-dis-reason').value.trim();

  if (!itemId) { toast('Please select an item', 'error'); return; }
  if (qty <= 0) { toast('Quantity must be at least 1', 'error'); return; }
  if (!reason) { toast('Reason / justification is required', 'error'); return; }

  const item = db.items.find(i => i.id === itemId);
  if (!item) return;
  if (qty > item.qty) { toast(`Insufficient stock. Available: ${item.qty}`, 'error'); return; }

  confirm2('⚠ CONFIRM DISPOSAL', `Permanently dispose ${qty}× "${item.name}" via ${method}? This will deduct from stock and cannot be undone.`, () => {
    const bookValue = item.cost * qty;
    item.qty -= qty;
    item.updatedAt = iso();

    db.entryLogs.push({ id: uid(), type: 'disposal', date: iso(), itemId, itemCode: item.code, itemName: item.name, qty, method, bookValue, authorizedBy, reason });
    db.transactions.unshift({ id: uid(), itemId, itemCode: item.code, itemName: item.name, type: 'out', qty, price: item.cost, total: bookValue, supplierId: '', supplierName: '', notes: `Disposal (${method}): ${reason}`, date: iso() });

    saveStore();
    toast(`✓ Disposal logged: ${qty}× ${item.name}`, 'warning');

    itemSearchReset('dis');
    document.getElementById('en-dis-qty').value = '';
    document.getElementById('en-dis-auth').value = '';
    document.getElementById('en-dis-reason').value = '';
    renderEntryDisposal();
    renderDashboard();
  });
}

function entrySubmitSale() {
  const itemId = document.getElementById('en-sale-item').value;
  const buyer = document.getElementById('en-sale-buyer').value.trim();
  const qty = parseInt(document.getElementById('en-sale-qty').value) || 0;
  const salePrice = parseFloat(document.getElementById('en-sale-price').value) || 0;
  const payment = document.getElementById('en-sale-payment').value;
  const notes = document.getElementById('en-sale-notes').value.trim();

  if (!itemId) { toast('Please select an item', 'error'); return; }
  if (qty <= 0) { toast('Quantity must be at least 1', 'error'); return; }
  if (salePrice <= 0) { toast('Sale price is required', 'error'); return; }

  const item = db.items.find(i => i.id === itemId);
  if (!item) return;
  if (qty > item.qty) { toast(`Insufficient stock. Available: ${item.qty}`, 'error'); return; }

  item.qty -= qty;
  item.updatedAt = iso();

  const total = qty * salePrice;
  db.entryLogs.push({ id: uid(), type: 'sale', date: iso(), itemId, itemCode: item.code, itemName: item.name, qty, salePrice, total, buyer, payment, notes });
  db.transactions.unshift({ id: uid(), itemId, itemCode: item.code, itemName: item.name, type: 'out', qty, price: salePrice, total, supplierId: '', supplierName: buyer || '', notes: `Sale — ${payment}${notes ? ' | ' + notes : ''}`, date: iso() });

  saveStore();
  toast(`✓ Sale recorded: ${qty}× ${item.name} — ${fmt(total)}`, 'success');

  itemSearchReset('sale');
  document.getElementById('en-sale-buyer').value = '';
  document.getElementById('en-sale-qty').value = '';
  document.getElementById('en-sale-price').value = '';
  document.getElementById('en-sale-notes').value = '';
  document.getElementById('en-sale-total').textContent = fmt(0);
  document.getElementById('en-sale-est-profit').textContent = fmt(0);
  renderEntrySale();
  renderDashboard();
}


// ════════════════════════════════════════════════════════
//  ALL ITEMS VIEW
// ════════════════════════════════════════════════════════
let itemsViewMode = 'cards';   // 'cards' | 'table'
let itemsSort = 'date';        // 'date' | 'name' | 'price' | 'cost' | 'qty' | 'value'
let itemsSortDir = 'desc';     // 'asc' | 'desc'

function setItemsView(mode) {
  itemsViewMode = mode;
  document.getElementById('vt-cards').classList.toggle('active', mode === 'cards');
  document.getElementById('vt-table').classList.toggle('active', mode === 'table');
  document.getElementById('items-card-view').style.display  = mode === 'cards' ? 'block' : 'none';
  document.getElementById('items-table-view').style.display = mode === 'table' ? 'block' : 'none';
  renderItems();
}

function setItemsSort(field) {
  if (itemsSort === field) {
    itemsSortDir = itemsSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    itemsSort = field;
    itemsSortDir = field === 'name' ? 'asc' : 'desc';
  }
  // Update sort button states
  ['date','name','price','cost','qty','value'].forEach(f => {
    const btn = document.getElementById('sort-' + f);
    const arrow = document.getElementById('sort-' + f + '-arrow');
    if (!btn) return;
    btn.classList.toggle('active', f === itemsSort);
    if (arrow) arrow.textContent = (f === itemsSort) ? (itemsSortDir === 'asc' ? '↑' : '↓') : '↓';
  });
  renderItems();
}

function clearItemsFilters() {
  document.getElementById('items-search').value = '';
  document.getElementById('items-f-cat').value  = '';
  document.getElementById('items-f-sup').value  = '';
  document.getElementById('items-f-cond').value = '';
  document.getElementById('items-f-type').value = '';
  document.getElementById('items-f-stock').value = '';
  renderItems();
}

function getFilteredSortedItems() {
  const search = (document.getElementById('items-search')?.value || '').toLowerCase().trim();
  const fCat   = document.getElementById('items-f-cat')?.value   || '';
  const fSup   = document.getElementById('items-f-sup')?.value   || '';
  const fCond  = document.getElementById('items-f-cond')?.value  || '';
  const fType  = document.getElementById('items-f-type')?.value  || '';
  const fStock = document.getElementById('items-f-stock')?.value || '';

  let items = db.items.filter(i => {
    // Search
    if (search) {
      const hay = [i.name, i.code, i.catName, i.supplierName, i.notes, i.condition, i.type]
        .join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    // Filters
    if (fCat  && i.catName       !== fCat)  return false;
    if (fSup  && i.supplierName  !== fSup)  return false;
    if (fCond && i.condition     !== fCond) return false;
    if (fType && i.type          !== fType) return false;
    if (fStock === 'low'  && !(i.qty > 0  && i.qty <= (i.minStock || db.settings.minStock))) return false;
    if (fStock === 'ok'   && !(i.qty > (i.minStock || db.settings.minStock))) return false;
    if (fStock === 'zero' && i.qty !== 0) return false;
    return true;
  });

  // Sort
  items.sort((a, b) => {
    let va, vb;
    switch (itemsSort) {
      case 'name':  va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
      case 'price': va = a.price; vb = b.price; break;
      case 'cost':  va = a.cost;  vb = b.cost;  break;
      case 'qty':   va = a.qty;   vb = b.qty;   break;
      case 'value': va = a.price * a.qty; vb = b.price * b.qty; break;
      default:      va = new Date(a.createdAt||0); vb = new Date(b.createdAt||0); break;
    }
    if (va < vb) return itemsSortDir === 'asc' ? -1 : 1;
    if (va > vb) return itemsSortDir === 'asc' ?  1 : -1;
    return 0;
  });

  return items;
}

function renderItems() {
  // Populate filter dropdowns
  const catSel = document.getElementById('items-f-cat');
  const supSel = document.getElementById('items-f-sup');
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">All Categories</option>' +
      [...new Set(db.items.map(i => i.catName).filter(Boolean))].sort()
        .map(c => `<option value="${esc(c)}" ${cur===c?'selected':''}>${esc(c)}</option>`).join('');
    catSel.value = cur;
  }
  if (supSel) {
    const cur = supSel.value;
    supSel.innerHTML = '<option value="">All Suppliers</option>' +
      [...new Set(db.items.map(i => i.supplierName).filter(Boolean))].sort()
        .map(s => `<option value="${esc(s)}" ${cur===s?'selected':''}>${esc(s)}</option>`).join('');
    supSel.value = cur;
  }

  const items = getFilteredSortedItems();
  const totalValue = items.reduce((s, i) => s + i.price * i.qty, 0);

  // Results bar
  const resLabel = document.getElementById('items-results-label');
  const valLabel = document.getElementById('items-value-label');
  if (resLabel) resLabel.innerHTML = `Showing <strong>${items.length}</strong> of <strong>${db.items.length}</strong> items`;
  if (valLabel) valLabel.textContent = `Total value: ${fmt(totalValue)}`;

  // Active filter chips
  renderActiveFilterChips();

  // Render appropriate view
  if (itemsViewMode === 'cards') {
    renderItemCards(items);
  } else {
    renderItemTable(items);
  }
}

function renderActiveFilterChips() {
  const container = document.getElementById('items-active-filters');
  if (!container) return;
  const chips = [];
  const search = document.getElementById('items-search')?.value?.trim();
  if (search) chips.push({ label: `"${search}"`, clear: () => { document.getElementById('items-search').value = ''; renderItems(); } });

  const filters = [
    { id: 'items-f-cat',   prefix: 'Category' },
    { id: 'items-f-sup',   prefix: 'Supplier' },
    { id: 'items-f-cond',  prefix: 'Condition' },
    { id: 'items-f-type',  prefix: 'Type' },
    { id: 'items-f-stock', prefix: 'Stock' },
  ];
  filters.forEach(f => {
    const el = document.getElementById(f.id);
    if (el?.value) {
      const label = el.options[el.selectedIndex]?.text || el.value;
      chips.push({ label: `${f.prefix}: ${label.replace(/[🔵🟢🟡🔴⚠✓✕]\s*/g,'')}`,
        clear: () => { el.value = ''; renderItems(); } });
    }
  });

  container.innerHTML = chips.length
    ? chips.map((c, idx) => `<span class="filter-chip" onclick="itemFilterClear(${idx})">${esc(c.label)} <span class="filter-chip-x">×</span></span>`).join('')
    : '';
  container._chips = chips;
}

function itemFilterClear(idx) {
  const container = document.getElementById('items-active-filters');
  if (container?._chips?.[idx]) container._chips[idx].clear();
}

// ── CARD VIEW ───────────────────────────────────────────────────────────────
function renderItemCards(items) {
  const grid = document.getElementById('items-grid');
  const empty = document.getElementById('items-empty');
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const showMargin = db.settings.showMargin;
  const sym = db.settings.currency;

  grid.innerHTML = items.map(i => {
    const isLow  = i.qty > 0 && i.qty <= (i.minStock || db.settings.minStock);
    const isZero = i.qty === 0;
    const margin = i.price > 0 ? ((i.price - i.cost) / i.price * 100).toFixed(1) : '0.0';
    const condColor  = { new:'pill-blue', good:'pill-green', fair:'pill-amber', poor:'pill-red' }[i.condition] || 'pill-gray';
    const typeColor  = i.type === 'for_rent' ? 'pill-purple' : 'pill-gray';
    const qtyColor   = isZero ? 'var(--red)' : isLow ? '#fb923c' : 'var(--green)';
    const catColor   = getCatColor(i.catName);
    const dateStr    = i.createdAt ? new Date(i.createdAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—';

    return `
    <div class="item-card${isLow?' low-stock':''}" id="ic-${i.id}">
      <div class="item-card-top">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <div class="item-card-code">${esc(i.code)}</div>
          ${isZero ? '<span class="badge badge-red" style="font-size:9px">OUT OF STOCK</span>'
            : isLow ? '<span class="badge badge-amber" style="font-size:9px">LOW STOCK</span>' : ''}
        </div>
        <div class="item-card-name">${esc(i.name)}</div>
        <div class="item-card-pills">
          ${i.catName ? `<span class="pill" style="background:${hexAlpha(catColor,0.15)};color:${catColor}">${esc(i.catName)}</span>` : ''}
          <span class="pill ${typeColor}">${i.type === 'for_rent' ? 'For Rent' : 'Purchased'}</span>
          <span class="pill ${condColor}">${i.condition}</span>
        </div>

        <div class="item-card-row">
          <span class="item-card-row-label">Sell Price</span>
          <span class="item-card-row-val" style="color:var(--green)">${fmt(i.price)}</span>
        </div>
        <div class="item-card-row">
          <span class="item-card-row-label">Cost</span>
          <span class="item-card-row-val" style="color:var(--text2)">${fmt(i.cost)}</span>
        </div>
        ${showMargin ? `
        <div class="item-card-row">
          <span class="item-card-row-label">Margin</span>
          <span class="item-card-row-val" style="color:var(--accent)">${margin}%</span>
        </div>` : ''}
        <div class="item-card-row">
          <span class="item-card-row-label">In Stock</span>
          <span class="item-card-row-val" style="color:${qtyColor}">${i.qty} units</span>
        </div>
        <div class="item-card-row">
          <span class="item-card-row-label">Total Value</span>
          <span class="item-card-row-val">${fmt(i.price * i.qty)}</span>
        </div>
        ${i.supplierName ? `
        <div class="item-card-row">
          <span class="item-card-row-label">Supplier</span>
          <span style="font-size:12px;color:var(--text2)">${esc(i.supplierName)}</span>
        </div>` : ''}
        <div class="item-card-row">
          <span class="item-card-row-label">Added</span>
          <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${dateStr}</span>
        </div>
        ${i.notes ? `<div style="margin-top:8px;font-size:11px;color:var(--text3);font-style:italic;padding-top:8px;border-top:1px solid var(--border)">${esc(i.notes)}</div>` : ''}
      </div>

      <div class="item-card-actions">
        <button class="item-card-action-btn edit" onclick="editItem('${i.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Details
        </button>
        <div class="item-card-divider"></div>
        <button class="item-card-action-btn stock-in" onclick="openStockIn('${i.id}')">↓ In</button>
        <div class="item-card-divider"></div>
        <button class="item-card-action-btn stock-out" onclick="openStockOut('${i.id}')" ${i.qty === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>↑ Out</button>
      </div>
    </div>`;
  }).join('');
}

// ── TABLE VIEW ──────────────────────────────────────────────────────────────
function renderItemTable(items) {
  const tbody = document.getElementById('items-table-body');
  const empty = document.getElementById('items-table-empty');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const showMargin = db.settings.showMargin;
  const condColor  = { new:'pill-blue', good:'pill-green', fair:'pill-amber', poor:'pill-red' };
  const typeColor  = { purchased:'pill-gray', for_rent:'pill-purple' };

  tbody.innerHTML = items.map(i => {
    const isLow  = i.qty > 0 && i.qty <= (i.minStock || db.settings.minStock);
    const isZero = i.qty === 0;
    const margin = i.price > 0 ? ((i.price - i.cost) / i.price * 100).toFixed(1) : '0.0';
    const dateStr = i.createdAt ? new Date(i.createdAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—';
    const qtyStyle = isZero ? 'color:var(--red)' : isLow ? 'color:#fb923c' : 'color:var(--green)';

    return `<tr>
      <td><span class="code-chip">${esc(i.code)}</span></td>
      <td>
        <strong>${esc(i.name)}</strong>
        ${i.notes ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${esc(i.notes)}</div>` : ''}
      </td>
      <td>${i.catName ? `<span class="pill" style="background:${hexAlpha(getCatColor(i.catName),0.15)};color:${getCatColor(i.catName)}">${esc(i.catName)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
      <td style="color:var(--text2);font-size:12px">${esc(i.supplierName || '—')}</td>
      <td><span class="pill ${typeColor[i.type]||'pill-gray'}">${i.type === 'for_rent' ? 'For Rent' : 'Purchased'}</span></td>
      <td><span class="pill ${condColor[i.condition]||'pill-gray'}">${i.condition}</span></td>
      <td>
        <span class="mono" style="font-weight:700;${qtyStyle}">${i.qty}</span>
        ${isZero ? '<span class="badge badge-red" style="font-size:8px;margin-left:4px">OUT</span>'
          : isLow ? '<span class="badge badge-amber" style="font-size:8px;margin-left:4px">LOW</span>' : ''}
      </td>
      <td class="mono" style="color:var(--green)">${fmt(i.price)}</td>
      <td class="mono" style="color:var(--text2)">${fmt(i.cost)}</td>
      <td class="mono" style="color:var(--accent)">${showMargin ? margin + '%' : '—'}</td>
      <td class="mono">${fmt(i.price * i.qty)}</td>
      <td class="mono" style="color:var(--text3);font-size:11px">${dateStr}</td>
      <td style="text-align:right">
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="btn btn-sm" style="background:var(--accent-dim);color:var(--accent);border:1px solid rgba(240,165,0,0.3);font-size:11px" onclick="editItem('${i.id}')">✎ Edit</button>
          <button class="btn btn-green btn-sm btn-icon" data-tip="Stock In" onclick="openStockIn('${i.id}')">↓</button>
          <button class="btn btn-danger btn-sm btn-icon" data-tip="Stock Out" onclick="openStockOut('${i.id}')" ${i.qty===0?'disabled style="opacity:0.4"':''}>↑</button>
          <button class="btn btn-danger btn-sm btn-icon" data-tip="Delete" onclick="deleteItem('${i.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}


// ════════════════════════════════════════════════════════
//  COLLAPSIBLE NAV GROUPS
// ════════════════════════════════════════════════════════

// Map each page to its group ID
const PAGE_GROUP_MAP = {
  'dashboard':      'nav-sec-main',
  'inventory':      'nav-sec-main',
  'items':          'nav-sec-main',
  'transactions':   'nav-sec-main',
  'reports':        'nav-sec-reports',
  'entry-new':      'nav-sec-entry',
  'entry-rent':     'nav-sec-entry',
  'entry-return':   'nav-sec-entry',
  'entry-repair':   'nav-sec-entry',
  'entry-disposal': 'nav-sec-entry',
  'entry-sale':     'nav-sec-entry',
  'categories':     'nav-sec-config',
  'suppliers':      'nav-sec-config',
  'settings':       'nav-sec-config',
};

function toggleNavGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.classList.toggle('collapsed');
  // Persist collapse state
  const states = getNavStates();
  states[groupId] = group.classList.contains('collapsed');
  localStorage.setItem('inventrack_nav_states', JSON.stringify(states));
}

function getNavStates() {
  try { return JSON.parse(localStorage.getItem('inventrack_nav_states') || '{}'); }
  catch { return {}; }
}

function restoreNavStates() {
  const states = getNavStates();
  ['nav-sec-main','nav-sec-reports','nav-sec-entry','nav-sec-config'].forEach(id => {
    const group = document.getElementById(id);
    if (!group) return;
    if (states[id] === true) {
      group.classList.add('collapsed');
    } else if (states[id] === false) {
      group.classList.remove('collapsed');
    }
    // undefined = use HTML default (main & reports open, entry & config collapsed)
  });
}

function expandGroupForPage(page) {
  const groupId = PAGE_GROUP_MAP[page];
  if (!groupId) return;
  const group = document.getElementById(groupId);
  if (group && group.classList.contains('collapsed')) {
    group.classList.remove('collapsed');
    const states = getNavStates();
    states[groupId] = false;
    localStorage.setItem('inventrack_nav_states', JSON.stringify(states));
  }
}


// ════════════════════════════════════════════════════════
//  THEME — DARK / LIGHT MODE
// ════════════════════════════════════════════════════════
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-mode', isLight);

  // Topbar icon
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = isLight ? '🌙' : '☀️';
  if (btn) btn.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';

  // Settings cards highlight
  const darkCard  = document.getElementById('theme-card-dark');
  const lightCard = document.getElementById('theme-card-light');
  const darkCheck  = document.getElementById('theme-check-dark');
  const lightCheck = document.getElementById('theme-check-light');

  if (darkCard) {
    darkCard.style.borderColor  = isLight ? 'var(--border)' : 'var(--accent)';
    lightCard.style.borderColor = isLight ? 'var(--accent)' : 'var(--border)';
  }
  if (darkCheck) {
    darkCheck.style.background  = isLight ? 'var(--border)' : 'var(--accent)';
    darkCheck.style.color       = isLight ? 'var(--text3)'  : '#000';
    darkCheck.style.opacity     = isLight ? '0.3' : '1';
    lightCheck.style.background = isLight ? 'var(--accent)' : 'var(--border)';
    lightCheck.style.color      = isLight ? '#000'          : 'var(--text3)';
    lightCheck.style.opacity    = isLight ? '1' : '0.3';
  }
}

function setTheme(theme) {
  localStorage.setItem('inventrack_theme', theme);
  applyTheme(theme);
  toast(theme === 'light' ? '☀️ Light mode enabled' : '🌙 Dark mode enabled', 'info');
}

function toggleTheme() {
  const current = localStorage.getItem('inventrack_theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem('inventrack_theme') || 'dark';
  applyTheme(saved);
}

function init() {
  loadTheme();
  initCharts();
  renderDashboard();
  updateClock();
  setInterval(updateClock, 30000);
  appPerms = loadPerms();
  restoreNavStates();
  // Wire settings tabs via event delegation
  const tabBar = document.getElementById('settings-tabs-bar');
  if (tabBar) {
    tabBar.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-tab]');
      if (btn) switchSettingsTab(btn.dataset.tab);
    });
  }
  checkSession();
}

async function startApp() {
  db = await loadStore();
  init();
}

startApp();