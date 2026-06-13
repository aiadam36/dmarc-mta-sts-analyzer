'use strict';

/* ─── State ─────────────────────────────────────────────────────────────── */
let currentView = 'dashboard';
let currentDetailId = null;

/* ─── Init ──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupDragDrop();
  setupFileInput();
  loadView('dashboard');
});

/* ─── Mobile Sidebar ────────────────────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
  }
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}

/* ─── Navigation ────────────────────────────────────────────────────────── */
function navigate(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  closeDetail();
  closeSidebar();
  loadView(view);
}

async function loadView(view) {
  if (view === 'dashboard') await loadDashboard();
  else if (view === 'dmarc') await loadDmarcList();
  else if (view === 'mtasts') await loadMtaStsList();
}

/* ─── Dashboard ─────────────────────────────────────────────────────────── */
async function loadDashboard() {
  const [stats, reports] = await Promise.all([
    api('/api/stats'),
    api('/api/reports'),
  ]);

  const dmarcPassPct = stats.dmarc.total > 0
    ? ((stats.dmarc.pass / stats.dmarc.total) * 100).toFixed(1)
    : '—';
  const mtaSuccessPct = (stats.mtaSts.success + stats.mtaSts.fail) > 0
    ? ((stats.mtaSts.success / (stats.mtaSts.success + stats.mtaSts.fail)) * 100).toFixed(1)
    : '—';

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card" style="--accent-color: var(--accent)">
      <div class="stat-label">DMARC Reports</div>
      <div class="stat-value">${stats.dmarcReports}</div>
      <div class="stat-sub">imported reports</div>
    </div>
    <div class="stat-card" style="--accent-color: var(--green)">
      <div class="stat-label">MTA-STS Reports</div>
      <div class="stat-value">${stats.mtaStsReports}</div>
      <div class="stat-sub">TLS reports</div>
    </div>
    <div class="stat-card" style="--accent-color: ${stats.dmarc.total && parseFloat(dmarcPassPct) >= 95 ? 'var(--green)' : 'var(--yellow)'}">
      <div class="stat-label">DMARC Pass Rate</div>
      <div class="stat-value">${dmarcPassPct}${dmarcPassPct !== '—' ? '%' : ''}</div>
      <div class="stat-sub">${stats.dmarc.pass.toLocaleString()} / ${stats.dmarc.total.toLocaleString()} messages</div>
    </div>
    <div class="stat-card" style="--accent-color: ${stats.mtaSts.success + stats.mtaSts.fail > 0 && parseFloat(mtaSuccessPct) >= 95 ? 'var(--green)' : 'var(--yellow)'}">
      <div class="stat-label">TLS Success Rate</div>
      <div class="stat-value">${mtaSuccessPct}${mtaSuccessPct !== '—' ? '%' : ''}</div>
      <div class="stat-sub">${stats.mtaSts.success.toLocaleString()} / ${(stats.mtaSts.success + stats.mtaSts.fail).toLocaleString()} sessions</div>
    </div>
    <div class="stat-card" style="--accent-color: var(--red)">
      <div class="stat-label">DMARC Failures</div>
      <div class="stat-value">${stats.dmarc.fail.toLocaleString()}</div>
      <div class="stat-sub">failed messages</div>
    </div>
    <div class="stat-card" style="--accent-color: var(--red)">
      <div class="stat-label">TLS Failures</div>
      <div class="stat-value">${stats.mtaSts.fail.toLocaleString()}</div>
      <div class="stat-sub">failed sessions</div>
    </div>
  `;

  const recentList = document.getElementById('recentList');
  if (!reports.length) {
    recentList.innerHTML = emptyState('No reports yet', 'Upload DMARC (.xml/.zip/.gz) or MTA-STS (.json) reports using the sidebar');
  } else {
    recentList.innerHTML = reports.slice(0, 10).map(renderReportCard).join('');
  }
}

/* ─── DMARC List ────────────────────────────────────────────────────────── */
async function loadDmarcList() {
  const reports = await api('/api/reports?type=dmarc');
  const el = document.getElementById('dmarcList');
  if (!reports.length) {
    el.innerHTML = emptyState('No DMARC reports', 'Upload aggregate XML report files (.xml, .zip, .gz)');
  } else {
    el.innerHTML = reports.map(renderReportCard).join('');
  }
}

/* ─── MTA-STS List ──────────────────────────────────────────────────────── */
async function loadMtaStsList() {
  const reports = await api('/api/reports?type=mta-sts');
  const el = document.getElementById('mtaStsList');
  if (!reports.length) {
    el.innerHTML = emptyState('No MTA-STS reports', 'Upload TLS report JSON files (.json, .gz)');
  } else {
    el.innerHTML = reports.map(renderReportCard).join('');
  }
}

/* ─── Report Card HTML ──────────────────────────────────────────────────── */
function renderReportCard(r) {
  if (r.type === 'dmarc') {
    const pass = r.summary?.passCount || 0;
    const fail = r.summary?.failCount || 0;
    const total = r.summary?.totalMessages || 0;
    const pct = total > 0 ? ((pass / total) * 100).toFixed(0) : 0;
    return `
      <div class="report-card" onclick="openDetail('${r.id}')">
        <span class="report-type-badge badge-dmarc">DMARC</span>
        <div class="report-info">
          <div class="report-domain">${esc(r.domain || r.orgName || 'Unknown')}</div>
          <div class="report-meta">${esc(r.orgName || '')} · ${formatDate(r.dateBegin)} → ${formatDate(r.dateEnd)} · ${r.records?.length || 0} records</div>
        </div>
        <div class="report-stats">
          <div class="mini-stat">
            <div class="mini-stat-val green">${pass.toLocaleString()}</div>
            <div class="mini-stat-label">pass</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-val red">${fail.toLocaleString()}</div>
            <div class="mini-stat-label">fail</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-val" style="color:${parseInt(pct) >= 95 ? 'var(--green)' : parseInt(pct) >= 80 ? 'var(--yellow)' : 'var(--red)'}">${pct}%</div>
            <div class="mini-stat-label">rate</div>
          </div>
        </div>
      </div>`;
  } else {
    const s = r.summary || {};
    return `
      <div class="report-card" onclick="openDetail('${r.id}')">
        <span class="report-type-badge badge-mtasts">MTA-STS</span>
        <div class="report-info">
          <div class="report-domain">${esc(r.organizationName || 'Unknown')}</div>
          <div class="report-meta">ID: ${esc(r.reportId || '')} · ${formatDate(r.dateRange?.startDatetime)} → ${formatDate(r.dateRange?.endDatetime)}</div>
        </div>
        <div class="report-stats">
          <div class="mini-stat">
            <div class="mini-stat-val green">${(s.totalSuccess || 0).toLocaleString()}</div>
            <div class="mini-stat-label">success</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-val red">${(s.totalFail || 0).toLocaleString()}</div>
            <div class="mini-stat-label">fail</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-val" style="color:${parseFloat(s.successRate) >= 95 ? 'var(--green)' : parseFloat(s.successRate) >= 80 ? 'var(--yellow)' : 'var(--red)'}">${s.successRate || '0.0'}%</div>
            <div class="mini-stat-label">rate</div>
          </div>
        </div>
      </div>`;
  }
}

/* ─── Detail Panel ──────────────────────────────────────────────────────── */
async function openDetail(id) {
  currentDetailId = id;
  const report = await api(`/api/reports/${id}`);
  const panel = document.getElementById('detailPanel');
  document.getElementById('detailTitle').textContent =
    report.type === 'dmarc'
      ? `DMARC · ${report.domain || report.orgName}`
      : `MTA-STS · ${report.organizationName}`;

  document.getElementById('detailDeleteBtn').onclick = () => deleteReport(id);
  document.getElementById('detailBody').innerHTML =
    report.type === 'dmarc' ? renderDmarcDetail(report) : renderMtaStsDetail(report);

  panel.classList.add('open');
}

function closeDetail() {
  document.getElementById('detailPanel').classList.remove('open');
  currentDetailId = null;
}

/* ─── DMARC Detail ──────────────────────────────────────────────────────── */
function renderDmarcDetail(r) {
  const s = r.summary || {};
  const passRate = s.totalMessages > 0 ? ((s.passCount / s.totalMessages) * 100).toFixed(1) : '0.0';
  const rateColor = parseFloat(passRate) >= 95 ? 'green' : parseFloat(passRate) >= 80 ? 'yellow' : 'red';

  const topSenders = s.topSenders || [];
  const maxCount = topSenders.length > 0 ? topSenders[0].count : 1;

  const rows = (r.records || []).map(rec => {
    const dkimDetail = rec.dkimResults?.map(d => `${d.domain}(${d.result})`).join(', ') || '—';
    const spfDetail = rec.spfResults?.map(d => `${d.domain}(${d.result})`).join(', ') || '—';
    return `<tr>
      <td>${esc(rec.sourceIp)}</td>
      <td>${rec.count}</td>
      <td>${pill(rec.disposition || 'none')}</td>
      <td>${pill(rec.dkim)}</td>
      <td>${pill(rec.spf)}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${esc(dkimDetail)}">${esc(dkimDetail)}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${esc(spfDetail)}">${esc(spfDetail)}</td>
      <td>${esc(rec.headerFrom)}</td>
    </tr>`;
  }).join('');

  const barRows = topSenders.map(s => {
    const pct = Math.round((s.count / maxCount) * 100);
    const fpct = s.count > 0 ? Math.round((s.fail / s.count) * 100) : 0;
    return `<div class="bar-row">
      <span class="bar-label" title="${esc(s.ip)}">${esc(s.ip)}</span>
      <div class="bar-track"><div class="bar-fill ${fpct > 20 ? 'red' : 'green'}" style="width:${pct}%"></div></div>
      <span class="bar-count">${s.count.toLocaleString()}</span>
    </div>`;
  }).join('');

  return `
    <div class="detail-grid">
      <div class="detail-card"><div class="detail-card-label">Total Messages</div><div class="detail-card-value large">${(s.totalMessages||0).toLocaleString()}</div></div>
      <div class="detail-card"><div class="detail-card-label">Pass Rate</div><div class="detail-card-value large ${rateColor}">${passRate}%</div></div>
      <div class="detail-card"><div class="detail-card-label">Passed</div><div class="detail-card-value large green">${(s.passCount||0).toLocaleString()}</div></div>
      <div class="detail-card"><div class="detail-card-label">Failed</div><div class="detail-card-value large red">${(s.failCount||0).toLocaleString()}</div></div>
      <div class="detail-card"><div class="detail-card-label">Quarantined</div><div class="detail-card-value large yellow">${(s.quarantineCount||0).toLocaleString()}</div></div>
      <div class="detail-card"><div class="detail-card-label">Rejected</div><div class="detail-card-value large red">${(s.rejectCount||0).toLocaleString()}</div></div>
    </div>

    <div class="section-title">Policy</div>
    <div class="policy-row">
      <span class="policy-tag"><strong>domain</strong> ${esc(r.domain)}</span>
      <span class="policy-tag"><strong>policy</strong> ${esc(r.policy || '—')}</span>
      <span class="policy-tag"><strong>subdomain</strong> ${esc(r.subdomainPolicy || '—')}</span>
      <span class="policy-tag"><strong>pct</strong> ${r.pct ?? '—'}%</span>
      <span class="policy-tag"><strong>adkim</strong> ${esc(r.adkim || '—')}</span>
      <span class="policy-tag"><strong>aspf</strong> ${esc(r.aspf || '—')}</span>
      <span class="policy-tag"><strong>reporter</strong> ${esc(r.orgName || '—')}</span>
      <span class="policy-tag"><strong>period</strong> ${formatDate(r.dateBegin)} → ${formatDate(r.dateEnd)}</span>
    </div>

    <div class="section-title">Top Senders</div>
    <div class="bar-chart">${barRows || '<p style="color:var(--text-muted);font-size:12px">No data</p>'}</div>

    <div class="section-title">Records (${(r.records||[]).length})</div>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Source IP</th><th>Count</th><th>Disposition</th>
          <th>DKIM</th><th>SPF</th><th>DKIM Detail</th><th>SPF Detail</th><th>Header From</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="8" style="color:var(--text-muted);text-align:center">No records</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

/* ─── MTA-STS Detail ────────────────────────────────────────────────────── */
function renderMtaStsDetail(r) {
  const s = r.summary || {};
  const rateColor = parseFloat(s.successRate) >= 95 ? 'green' : parseFloat(s.successRate) >= 80 ? 'yellow' : 'red';

  const failureRows = (s.failureTypes || []).map(f => `
    <tr><td>${esc(f.type)}</td><td>${f.count.toLocaleString()}</td></tr>
  `).join('');

  const policyHtml = (r.policies || []).map(p => {
    const fdRows = p.failureDetails.map(fd => `
      <tr>
        <td>${esc(fd.resultType)}</td>
        <td>${esc(fd.sendingMtaIp)}</td>
        <td>${esc(fd.receivingMxHostname)}</td>
        <td>${fd.failedSessionCount}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${esc(fd.additionalInfo)}">${esc(fd.additionalInfo || '—')}</td>
      </tr>
    `).join('');

    return `
      <div class="section-title" style="margin-top:20px">Policy: ${esc(p.policyDomain)}</div>
      <div class="policy-row">
        <span class="policy-tag"><strong>type</strong> ${esc(p.policyType)}</span>
        <span class="policy-tag"><strong>success</strong> ${p.totalSuccessfulSessionCount.toLocaleString()}</span>
        <span class="policy-tag"><strong>fail</strong> ${p.totalFailureSessionCount.toLocaleString()}</span>
        ${p.mxHost?.map(mx => `<span class="policy-tag"><strong>mx</strong> ${esc(mx)}</span>`).join('') || ''}
      </div>
      ${fdRows ? `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Result Type</th><th>Sending IP</th><th>Receiving MX</th><th>Failed</th><th>Info</th></tr></thead>
            <tbody>${fdRows}</tbody>
          </table>
        </div>` : '<p style="color:var(--text-muted);font-size:12px;margin-bottom:16px">No failure details recorded.</p>'}
    `;
  }).join('');

  return `
    <div class="detail-grid">
      <div class="detail-card"><div class="detail-card-label">Total Sessions</div><div class="detail-card-value large">${(s.totalSessions||0).toLocaleString()}</div></div>
      <div class="detail-card"><div class="detail-card-label">Success Rate</div><div class="detail-card-value large ${rateColor}">${s.successRate || '0.0'}%</div></div>
      <div class="detail-card"><div class="detail-card-label">Successful</div><div class="detail-card-value large green">${(s.totalSuccess||0).toLocaleString()}</div></div>
      <div class="detail-card"><div class="detail-card-label">Failed</div><div class="detail-card-value large red">${(s.totalFail||0).toLocaleString()}</div></div>
    </div>

    <div class="section-title">Report Metadata</div>
    <div class="policy-row">
      <span class="policy-tag"><strong>org</strong> ${esc(r.organizationName || '—')}</span>
      <span class="policy-tag"><strong>report-id</strong> ${esc(r.reportId || '—')}</span>
      <span class="policy-tag"><strong>contact</strong> ${esc(r.contactInfo || '—')}</span>
      <span class="policy-tag"><strong>period</strong> ${formatDate(r.dateRange?.startDatetime)} → ${formatDate(r.dateRange?.endDatetime)}</span>
    </div>

    ${failureRows ? `
      <div class="section-title">Failure Types</div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Result Type</th><th>Count</th></tr></thead>
          <tbody>${failureRows}</tbody>
        </table>
      </div>` : ''}

    ${policyHtml}
  `;
}

/* ─── Upload ────────────────────────────────────────────────────────────── */
function setupFileInput() {
  document.getElementById('fileInput').addEventListener('change', function () {
    if (this.files.length) uploadFiles(Array.from(this.files));
    this.value = '';
  });
}

function setupDragDrop() {
  const zone = document.getElementById('uploadZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  });
}

async function uploadFiles(files) {
  const prog = document.getElementById('uploadProgress');
  const bar = document.getElementById('progressBar');
  const label = document.getElementById('progressLabel');
  prog.style.display = 'flex';

  let done = 0;
  let errors = 0;

  for (const file of files) {
    label.textContent = `Uploading ${file.name}…`;
    bar.style.width = `${(done / files.length) * 100}%`;

    const fd = new FormData();
    fd.append('report', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
    } catch (err) {
      errors++;
      showToast(`Error: ${err.message}`, 'error');
    }
    done++;
  }

  bar.style.width = '100%';
  setTimeout(() => {
    prog.style.display = 'none';
    bar.style.width = '0%';
  }, 600);

  const ok = files.length - errors;
  if (ok > 0) showToast(`${ok} report${ok > 1 ? 's' : ''} imported`, 'success');

  loadView(currentView);
}

/* ─── Delete ────────────────────────────────────────────────────────────── */
async function deleteReport(id) {
  if (!confirm('Delete this report?')) return;
  await api(`/api/reports/${id}`, { method: 'DELETE' });
  closeDetail();
  showToast('Report deleted', 'success');
  loadView(currentView);
}

async function clearAll() {
  if (!confirm('Delete ALL reports? This cannot be undone.')) return;
  await api('/api/reports', { method: 'DELETE' });
  showToast('All reports cleared', 'success');
  loadView(currentView);
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */
async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pill(val) {
  const v = (val || '').toLowerCase();
  const cls = v === 'pass' ? 'pill-pass'
    : v === 'fail' ? 'pill-fail'
    : v === 'quarantine' ? 'pill-quarantine'
    : v === 'reject' ? 'pill-reject'
    : 'pill-neutral';
  return `<span class="pill ${cls}">${esc(val || 'none')}</span>`;
}

function emptyState(title, hint) {
  return `<div class="empty-state">
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="4" y="8" width="32" height="26" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M12 16 L28 16 M12 22 L22 22" stroke="currentColor" stroke-width="1.5"/></svg>
    <p>${esc(title)}</p><span>${esc(hint)}</span>
  </div>`;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 3000);
}
