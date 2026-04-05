// Chuẩn hoá dòng tài khoản: chuyển TAB / nhiều khoảng trắng → dấu hai chấm
// Hỗ trợ: email TAB pass TAB cookie  →  email:pass:cookie
// Bỏ qua cột thừa (cột 4, 5... trong Excel export)
function normalizeAccountLine(raw) {
  if (!raw) return ''
  const line = raw.trim()
  if (!line) return ''

  // Nếu đã có dấu hai chấm đúng format → giữ nguyên
  // Phân biệt: "email:pass:cookie" vs "cookie:with:colons" (không chứa @)
  // Nếu chứa TAB → đây là tab-separated, cần convert
  if (line.includes('\t')) {
    const parts = line.split('\t').map(p => p.trim()).filter(Boolean)
    // parts[0]=email, parts[1]=password, parts[2]=cookie (bỏ parts[3+])
    if (parts.length >= 3) return `${parts[0]}:${parts[1]}:${parts[2]}`
    if (parts.length === 2) return `${parts[0]}:${parts[1]}`
    return parts[0]
  }

  return line
}

import {
  adminApiFetch,
  adminGetAllSubscriptions, adminGetAllPayments, adminGetAllProfiles,
  adminActivateSubscription, adminUpdateSubscription, adminUpdatePayment,
  adminSetLoginLink, adminUpdateProfile, adminDeleteUser,
  adminGetUserSubscriptions, adminGetUserPayments,
  adminAssignPlan, adminAssignAccount, getPlans,
  adminGetAllAccounts, adminAddAccount, adminAddAccountsBulk,
  adminUpdateAccount, adminDeleteAccount, adminAssignAccountFromPool,
  adminCreatePlan, adminUpdatePlan, adminDeletePlan,
  adminGetSettings, adminPatchSettings,
  adminConfirmPayment
} from '../utils/api.js'
import { formatVND, formatDate, statusLabel, statusClass, planLabel, daysLeft } from '../utils/format.js'

function inventoryErrorHint(message) {
  const s = String(message || '').toLowerCase()
  if (s.includes('column') || s.includes('schema cache'))
    return ' Gợi ý: Supabase → SQL Editor → chạy nội dung file supabase/fix_resources_inventory.sql.'
  if (s.includes('row-level security') || s.includes('new row violates') || s.includes('policy'))
    return ' Gợi ý: chạy fix_resources_inventory.sql (policy INSERT) hoặc fix_rls_infinite_recursion.sql.'
  return ''
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function renderAdmin(container) {
  container.innerHTML = `
    <section class="admin-section">
      <div class="admin-layout">
        <aside class="admin-sidebar" aria-label="Điều hướng quản trị">
          <div class="admin-sidebar__brand">
            <div class="admin-sidebar__logo" aria-hidden="true">NS</div>
            <div class="admin-sidebar__brand-text">
              <span class="admin-sidebar__brand-name">Netflix Store</span>
              <span class="admin-sidebar__brand-role">Trung tâm quản trị</span>
            </div>
          </div>
          <nav class="admin-nav" role="tablist" aria-label="Mục quản trị">
            <button type="button" class="admin-nav__item active" data-tab="stats" role="tab" aria-selected="true">
              <span class="admin-nav__icon" aria-hidden="true">◆</span>
              <span class="admin-nav__label">Thống kê</span>
            </button>
            <button type="button" class="admin-nav__item" data-tab="orders" role="tab" aria-selected="false">
              <span class="admin-nav__icon" aria-hidden="true">▣</span>
              <span class="admin-nav__label">Đơn hàng</span>
            </button>
            <button type="button" class="admin-nav__item" data-tab="payments" role="tab" aria-selected="false">
              <span class="admin-nav__icon" aria-hidden="true">◇</span>
              <span class="admin-nav__label">Thanh toán</span>
            </button>
            <button type="button" class="admin-nav__item" data-tab="accounts" role="tab" aria-selected="false">
              <span class="admin-nav__icon" aria-hidden="true">◎</span>
              <span class="admin-nav__label">Kho tài khoản</span>
            </button>
            <button type="button" class="admin-nav__item" data-tab="users" role="tab" aria-selected="false">
              <span class="admin-nav__icon" aria-hidden="true">◉</span>
              <span class="admin-nav__label">Người dùng</span>
            </button>
            <button type="button" class="admin-nav__item" data-tab="plans" role="tab" aria-selected="false">
              <span class="admin-nav__icon" aria-hidden="true">▤</span>
              <span class="admin-nav__label">Gói dịch vụ</span>
            </button>
            <button type="button" class="admin-nav__item" data-tab="settings" role="tab" aria-selected="false">
              <span class="admin-nav__icon" aria-hidden="true">⌘</span>
              <span class="admin-nav__label">Cài đặt</span>
            </button>
          </nav>
        </aside>

        <div class="admin-main">
          <header class="admin-header">
            <div class="admin-header__titles">
              <p class="admin-header__eyebrow">Vận hành</p>
              <h1 class="admin-header__title">Quản trị cửa hàng</h1>
              <p class="admin-header__desc">Doanh thu, đơn hàng, kho và cấu hình — một nơi xử lý.</p>
            </div>
            <div class="admin-header__aside">
              <div class="admin-header__badge" title="Chỉ tài khoản admin mới truy cập được">
                <span class="admin-header__badge-dot" aria-hidden="true"></span>
                <span>Quyền admin</span>
              </div>
            </div>
          </header>

          <div class="admin-panels">
            <div class="admin-panel admin-panel-surface active" id="adminStats">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div class="admin-panel admin-panel-surface" id="adminOrders">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div class="admin-panel admin-panel-surface" id="adminPayments">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div class="admin-panel admin-panel-surface" id="adminAccounts">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div class="admin-panel admin-panel-surface" id="adminUsers">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div class="admin-panel admin-panel-surface" id="adminPlans">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div class="admin-panel admin-panel-surface" id="adminSettings">
              <div class="loading"><div class="spinner"></div></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `

  const tabs = container.querySelectorAll('.admin-nav__item')
  const panels = {
    stats:    container.querySelector('#adminStats'),
    orders:   container.querySelector('#adminOrders'),
    payments: container.querySelector('#adminPayments'),
    accounts: container.querySelector('#adminAccounts'),
    users:    container.querySelector('#adminUsers'),
    plans:    container.querySelector('#adminPlans'),
    settings: container.querySelector('#adminSettings'),
  }
  const loaded = { stats: false, orders: false, payments: false, accounts: false, users: false, plans: false, settings: false }

  function onAdminRetryClick(e) {
    const btn = e.target.closest('[data-admin-retry-tab]')
    if (!btn || !container.contains(btn)) return
    const tabName = btn.dataset.adminRetryTab
    if (!tabName || !panels[tabName]) return
    loaded[tabName] = false
    void loadTab(tabName)
  }
  container.addEventListener('click', onAdminRetryClick)

  async function loadTab(name) {
    if (loaded[name]) return
    loaded[name] = true
    try {
      if (name === 'stats')    { await renderStats(panels.stats) }
      if (name === 'orders')   { const d = await adminGetAllSubscriptions(); renderOrders(panels.orders, d) }
      if (name === 'payments') { const d = await adminGetAllPayments();       renderAdminPayments(panels.payments, d) }
      if (name === 'accounts') { const d = await adminGetAllAccounts();       renderAccounts(panels.accounts, d) }
      if (name === 'users')    { const d = await adminGetAllProfiles();       renderUsers(panels.users, d) }
      if (name === 'plans')    { const d = await getPlans();                  renderPlans(panels.plans, d) }
      if (name === 'settings') { const d = await adminGetSettings(); renderSettings(panels.settings, d) }
    } catch (err) {
      loaded[name] = false  // Cho phép retry khi click lại tab
      const settingsHint = name === 'settings'
        ? `<p style="font-size:13px;color:var(--text-muted);max-width:460px;margin:12px auto 0;line-height:1.5;">
            Kiểm tra <code>node server.cjs</code>, đăng nhập admin, và bảng <code>settings</code> trên DB.
            Nếu thiếu bảng/policy: chạy <code>supabase/fix_settings.sql</code> trong Supabase SQL Editor.
          </p>`
        : ''
      panels[name].innerHTML = `
        <div style="text-align:center;padding:40px;">
          <p class="error-text">Lỗi tải tab: ${escapeHtml(err.message)}</p>
          ${settingsHint}
          <button type="button" class="btn btn-outline btn-sm" style="margin-top:12px;" data-admin-retry-tab="${name}">
            🔄 Thử lại
          </button>
        </div>`
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const name = tab.dataset.tab
      tabs.forEach(t => {
        t.classList.toggle('active', t === tab)
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false')
      })
      Object.entries(panels).forEach(([key, p]) => {
        p.classList.toggle('active', key === name)
      })
      await loadTab(name)
    })
  })

  // Load tab thống kê mặc định
  await loadTab('stats')

  return () => container.removeEventListener('click', onAdminRetryClick)
}

// ============================================================
// STATS DASHBOARD
// ============================================================
async function renderStats(panel) {
  panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
  let data
  try {
    const r = await adminApiFetch('/api/admin/stats')
    if (!r.ok) {
      let msg = String(r.status)
      try {
        const j = await r.json()
        msg = j.message || j.error || msg
      } catch {}
      panel.innerHTML = `<div class="admin-empty"><p class="error-text" style="margin:0;">Không lấy được thống kê: ${msg}</p><p style="font-size:13px;margin-top:12px;color:var(--text-muted);">Đăng nhập admin; server cần <code>VITE_SUPABASE_URL</code> + anon key trong <code>.env</code>.</p></div>`
      return
    }
    data = await r.json()
  } catch (err) {
    panel.innerHTML = `<div class="admin-empty"><p class="error-text" style="margin:0;">Không lấy được thống kê: ${err.message}</p><p style="font-size:13px;margin-top:12px;color:var(--text-muted);">Chạy <code>node server.cjs</code> và thử lại.</p></div>`
    return
  }

  const fmt = n => Number(n||0).toLocaleString('vi-VN')
  const r   = data.revenue || {}
  const o   = data.orders  || {}
  const inv = data.inventory || {}

  panel.innerHTML = `
    <div class="admin-dashboard">
      <div>
        <h3 class="admin-section-title">Doanh thu</h3>
        <div class="admin-stat-grid">
          ${statCard('Hôm nay', fmt(r.today) + '₫', 'primary', '📅')}
          ${statCard('7 ngày', fmt(r.week) + '₫', 'cyan', '📆')}
          ${statCard('30 ngày', fmt(r.month) + '₫', 'violet', '🗓️')}
          ${statCard('Tất cả', fmt(r.total) + '₫', 'emerald', '💎')}
        </div>
      </div>

      <div>
        <h3 class="admin-section-title">Đơn hàng (subscriptions)</h3>
        <div class="admin-stat-grid">
          ${statCard('Hôm nay', o.today || 0, 'primary', '🛒', false)}
          ${statCard('7 ngày', o.week || 0, 'cyan', '📊', false)}
          ${statCard('Đang active', o.active || 0, 'emerald', '✅', false)}
          ${statCard('Đang chờ', o.pending || 0, 'amber', '⏳', false)}
        </div>
      </div>

      <div class="admin-split">
        <div>
          <h3 class="admin-section-title">Kho tài khoản</h3>
          <div class="admin-inventory-card">
            ${invRow('Sẵn sàng', inv.available || 0, 'ok')}
            ${invRow('Đầy slot', inv.full || 0, 'info')}
            ${invRow('Đã chết', inv.dead || 0, 'bad')}
            ${invRow('Tổng cộng', inv.total || 0, 'neutral')}
          </div>
        </div>
        <div>
          <h3 class="admin-section-title">Thao tác nhanh</h3>
          <div class="admin-quick">
            <button type="button" class="admin-quick__btn" id="btnHealthCheck">
              <span class="admin-quick__btn-icon">🔍</span>
              <span>Kiểm tra sức khỏe kho (cookie)</span>
            </button>
            <button type="button" class="admin-quick__btn" id="btnRunExpiry">
              <span class="admin-quick__btn-icon">⏰</span>
              <span>Chạy hết hạn subscriptions</span>
            </button>
            <button type="button" class="admin-quick__btn" id="btnTestTelegram">
              <span class="admin-quick__btn-icon">✈️</span>
              <span>Test thông báo Telegram</span>
            </button>
            <div class="admin-quick__result" id="actionResult"></div>
          </div>
        </div>
      </div>

      <div class="admin-summary">
        <div class="admin-summary__item">
          <span>Tổng khách hàng</span>
          <strong>${fmt(data.customers)}</strong>
        </div>
        <div class="admin-summary__item">
          <span>Tổng đơn hàng</span>
          <strong>${fmt(o.total)}</strong>
        </div>
        <div class="admin-summary__item">
          <span>Tổng doanh thu</span>
          <strong>${fmt(r.total)}₫</strong>
        </div>
        <div class="admin-summary__item admin-summary__item--danger">
          <span>Đã hết hạn</span>
          <strong>${fmt(o.expired)}</strong>
        </div>
      </div>
    </div>
  `

  const resultEl = panel.querySelector('#actionResult')

  panel.querySelector('#btnHealthCheck')?.addEventListener('click', async () => {
    resultEl.innerHTML = '⏳ Đang kiểm tra... (có thể mất vài phút)'
    try {
      const res = await adminApiFetch('/api/admin/health-check', { method: 'POST' })
      if (!res.ok) {
        resultEl.innerHTML = '<span class="text-danger">Không có quyền hoặc phiên đăng nhập hết hạn.</span>'
        return
      }
      const d = await res.json()
      resultEl.innerHTML = `<span class="text-success">Xong: ${d.alive} sống, ${d.dead} chết / ${d.total} tổng</span>`
    } catch { resultEl.innerHTML = '<span class="text-danger">Lỗi kết nối</span>' }
  })

  panel.querySelector('#btnRunExpiry')?.addEventListener('click', async () => {
    resultEl.textContent = 'Đang chạy...'
    try {
      const res = await adminApiFetch('/api/admin/run-expiry', { method: 'POST' })
      if (!res.ok) {
        resultEl.innerHTML = '<span class="text-danger">Không có quyền hoặc phiên đăng nhập hết hạn.</span>'
        return
      }
      const d = await res.json()
      resultEl.innerHTML = `<span class="text-success">${d.message}</span>`
    } catch { resultEl.innerHTML = '<span class="text-danger">Lỗi</span>' }
  })

  panel.querySelector('#btnTestTelegram')?.addEventListener('click', async () => {
    resultEl.textContent = 'Đang gửi...'
    try {
      const res = await adminApiFetch('/api/admin/test-telegram', { method: 'POST' })
      if (!res.ok) {
        resultEl.innerHTML = '<span class="text-danger">Không có quyền hoặc phiên đăng nhập hết hạn.</span>'
        return
      }
      const d = await res.json()
      resultEl.innerHTML = d.success
        ? '<span class="text-success">Đã gửi — kiểm tra Telegram.</span>'
        : '<span class="text-danger">Chưa cấu hình TELEGRAM_BOT_TOKEN</span>'
    } catch { resultEl.innerHTML = '<span class="text-danger">Lỗi kết nối server</span>' }
  })
}

/** @param accentValue - nếu true (mặc định), value dùng màu accent của thẻ */
function statCard(label, value, variant, icon, accentValue = true) {
  const vClass = accentValue ? 'admin-stat-card__value admin-stat-card__value--accent' : 'admin-stat-card__value'
  return `
    <div class="admin-stat-card admin-stat-card--${variant}">
      <div class="admin-stat-card__top">
        <span class="admin-stat-card__label">${label}</span>
        <span class="admin-stat-card__icon" aria-hidden="true">${icon}</span>
      </div>
      <div class="${vClass}">${value}</div>
    </div>`
}

function invRow(label, value, tone) {
  const toneClass =
    tone === 'ok' ? 'admin-inventory-row__value admin-inventory-row__value--ok' :
    tone === 'info' ? 'admin-inventory-row__value admin-inventory-row__value--info' :
    tone === 'bad' ? 'admin-inventory-row__value admin-inventory-row__value--bad' :
    'admin-inventory-row__value'
  return `
    <div class="admin-inventory-row">
      <span class="admin-inventory-row__label">${label}</span>
      <strong class="${toneClass}">${value}</strong>
    </div>`
}

function renderOrders(panel, subs) {
  if (!subs || subs.length === 0) {
    panel.innerHTML = `
      <div class="admin-empty">
        <div class="admin-empty__icon">📦</div>
        <h3>Chưa có đơn hàng</h3>
        <p>Khi có gói đăng ký, danh sách hiển thị tại đây.</p>
      </div>`
    return
  }

  let html = `
    <div class="admin-toolbar">
      <span class="admin-count">Tổng ${subs.length} đơn hàng</span>
      <select id="filterOrderStatus" class="admin-filter">
        <option value="">Tất cả</option>
        <option value="pending">Chờ xử lý</option>
        <option value="active">Hoạt động</option>
        <option value="expired">Hết hạn</option>
      </select>
    </div>
    <div class="admin-table-wrap">
    <div class="table-responsive">
      <table class="data-table" id="ordersTable">
        <thead>
          <tr>
            <th>Email</th>
            <th>Gói</th>
            <th>Trạng thái</th>
            <th>Bắt đầu</th>
            <th>Hết hạn</th>
            <th>Còn lại</th>
            <th>Login Link</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
  `

  subs.forEach(sub => {
    const plan = sub.plans || {}
    const days = daysLeft(sub.end_at)

    html += `
      <tr data-status="${sub.status}" data-id="${sub.id}">
        <td>${sub.user_email || '—'}</td>
        <td>${plan.name || planLabel(sub.plan)}</td>
        <td><span class="status-badge ${statusClass(sub.status)}">${statusLabel(sub.status)}</span></td>
        <td>${formatDate(sub.start_at)}</td>
        <td>${formatDate(sub.end_at)}</td>
        <td>${days !== null ? days + ' ngày' : '—'}</td>
        <td>
          <div class="admin-link-cell">
            <input type="text" class="admin-link-input" value="${sub.login_link || ''}" 
                   placeholder="Nhập link..." data-sub-id="${sub.id}">
            <button class="btn btn-sm btn-primary save-link-btn" data-sub-id="${sub.id}">💾</button>
          </div>
        </td>
        <td>
          <div class="admin-actions">
            ${sub.status === 'pending' ? `
              <button class="btn btn-sm btn-success activate-btn" data-sub-id="${sub.id}" data-plan="${sub.plan}">✅ Kích hoạt</button>
            ` : ''}
            ${sub.status === 'active' ? `
              <button class="btn btn-sm btn-danger expire-btn" data-sub-id="${sub.id}">❌ Hết hạn</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `
  })

  html += '</tbody></table></div></div>'
  panel.innerHTML = html

  // Filter
  const filter = panel.querySelector('#filterOrderStatus')
  if (filter) {
    filter.addEventListener('change', () => {
      const rows = panel.querySelectorAll('#ordersTable tbody tr')
      rows.forEach(row => {
        if (!filter.value || row.dataset.status === filter.value) {
          row.style.display = ''
        } else {
          row.style.display = 'none'
        }
      })
    })
  }

  // Activate buttons — inline update, không re-render toàn bộ
  panel.querySelectorAll('.activate-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '⏳'
      try {
        await adminActivateSubscription(btn.dataset.subId, btn.dataset.plan)
        // Cập nhật row tại chỗ
        const row = panel.querySelector(`tr[data-id="${btn.dataset.subId}"]`)
        if (row) {
          row.querySelector('.status-badge').textContent = '✅ Hoạt động'
          row.querySelector('.status-badge').className  = 'status-badge status-active'
          row.dataset.status = 'active'
          btn.closest('.admin-actions').innerHTML =
            `<button class="btn btn-sm btn-danger expire-btn" data-sub-id="${btn.dataset.subId}">❌ Hết hạn</button>`
          attachExpireBtn(panel, row.querySelector('.expire-btn'))
        }
      } catch (err) { alert('Lỗi: ' + err.message); btn.disabled = false; btn.textContent = '✅ Kích hoạt' }
    })
  })

  panel.querySelectorAll('.expire-btn').forEach(b => attachExpireBtn(panel, b))

  // Save link buttons
  panel.querySelectorAll('.save-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = panel.querySelector(`.admin-link-input[data-sub-id="${btn.dataset.subId}"]`)
      if (!input) return
      btn.disabled = true; btn.textContent = '⏳'
      try {
        await adminSetLoginLink(btn.dataset.subId, input.value.trim())
        btn.textContent = '✅'
        setTimeout(() => { btn.textContent = '💾'; btn.disabled = false }, 1500)
      } catch (err) { alert('Lỗi: ' + err.message); btn.textContent = '💾'; btn.disabled = false }
    })
  })
}

function attachExpireBtn(panel, btn) {
  if (!btn) return
  btn.addEventListener('click', async () => {
    if (!confirm('Xác nhận đánh dấu hết hạn?')) return
    btn.disabled = true
    try {
      await adminUpdateSubscription(btn.dataset.subId, { status: 'expired' })
      const row = panel.querySelector(`tr[data-id="${btn.dataset.subId}"]`)
      if (row) {
        row.querySelector('.status-badge').textContent = '❌ Hết hạn'
        row.querySelector('.status-badge').className  = 'status-badge status-expired'
        row.dataset.status = 'expired'
        btn.closest('.admin-actions').innerHTML = ''
      }
    } catch (err) { alert('Lỗi: ' + err.message); btn.disabled = false }
  })
}

function renderAdminPayments(panel, payments) {
  if (!payments || payments.length === 0) {
    panel.innerHTML = `
      <div class="admin-empty">
        <div class="admin-empty__icon">💳</div>
        <h3>Chưa có thanh toán</h3>
        <p>Giao dịch sẽ xuất hiện sau khi khách tạo thanh toán.</p>
      </div>`
    return
  }

  let html = `
    <div class="admin-toolbar">
      <span class="admin-count">Tổng ${payments.length} thanh toán</span>
      <select id="filterPayStatus" class="admin-filter">
        <option value="">Tất cả</option>
        <option value="pending">Chờ xử lý</option>
        <option value="success">Thành công</option>
        <option value="fail">Thất bại</option>
      </select>
    </div>
    <div class="admin-table-wrap">
    <div class="table-responsive">
      <table class="data-table" id="paymentsTable">
        <thead>
          <tr>
            <th>Email</th>
            <th>Gói</th>
            <th>Số tiền</th>
            <th>Phương thức</th>
            <th>Nội dung CK</th>
            <th>Trạng thái</th>
            <th>Thời gian</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
  `

  payments.forEach(p => {
    const plan = p.plans || {}

    html += `
      <tr data-status="${p.status}">
        <td>${p.user_email || '—'}</td>
        <td>${plan.name || planLabel(p.plan)}</td>
        <td>${formatVND(p.amount)}</td>
        <td>${p.method || '—'}</td>
        <td><code>${p.transfer_content || '—'}</code></td>
        <td><span class="status-badge ${statusClass(p.status)}">${statusLabel(p.status)}</span></td>
        <td>${formatDate(p.created_at)}</td>
        <td>
          ${p.status === 'pending' ? `
            <button class="btn btn-sm btn-success confirm-pay-btn" data-pay-id="${p.id}">✅ Xác nhận</button>
            <button class="btn btn-sm btn-danger reject-pay-btn" data-pay-id="${p.id}">❌ Từ chối</button>
          ` : '—'}
        </td>
      </tr>
    `
  })

  html += '</tbody></table></div></div>'
  panel.innerHTML = html

  // Filter
  const filter = panel.querySelector('#filterPayStatus')
  if (filter) {
    filter.addEventListener('change', () => {
      const rows = panel.querySelectorAll('#paymentsTable tbody tr')
      rows.forEach(row => {
        if (!filter.value || row.dataset.status === filter.value) {
          row.style.display = ''
        } else {
          row.style.display = 'none'
        }
      })
    })
  }

  // Confirm payment — gọi server để tự kích hoạt sub + gán account
  panel.querySelectorAll('.confirm-pay-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '⏳ Đang xử lý...'
      try {
        await adminConfirmPayment(btn.dataset.payId)
        // Cập nhật row tại chỗ
        const row = btn.closest('tr')
        if (row) {
          row.querySelector('.status-badge').textContent = '✅ Thành công'
          row.querySelector('.status-badge').className  = 'status-badge status-active'
          row.dataset.status = 'success'
          row.querySelector('td:last-child').innerHTML =
            '<span class="admin-pay-done">Đã kích hoạt tự động</span>'
        }
      } catch (err) {
        alert('Lỗi: ' + err.message)
        btn.disabled = false; btn.textContent = '✅ Xác nhận'
      }
    })
  })

  // Reject payment — chỉ đổi status, không cần re-render
  panel.querySelectorAll('.reject-pay-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Xác nhận từ chối thanh toán?')) return
      btn.disabled = true
      try {
        await adminUpdatePayment(btn.dataset.payId, { status: 'fail' })
        const row = btn.closest('tr')
        if (row) {
          row.querySelector('.status-badge').textContent = '❌ Thất bại'
          row.querySelector('.status-badge').className  = 'status-badge status-expired'
          row.dataset.status = 'fail'
          row.querySelector('td:last-child').innerHTML = '—'
        }
      } catch (err) { alert('Lỗi: ' + err.message); btn.disabled = false }
    })
  })
}


// ============================================================
// ACCOUNT INVENTORY (Kho tài khoản)
// ============================================================
function renderAccounts(panel, accounts) {
  const available = (accounts || []).filter(a => a.status === 'available').length
  const assigned  = (accounts || []).filter(a => a.status === 'assigned').length
  const dead      = (accounts || []).filter(a => a.status === 'dead').length
  const total     = (accounts || []).length

  // Cảnh báo kho sắp hết / trống
  const WARNING_THRESHOLD = 3
  const stockWarning = available === 0
    ? `<div class="admin-alert admin-alert--danger" role="alert">
        Kho trống — không còn tài khoản sẵn sàng. Khách thanh toán sẽ chờ gán tay. Thêm tài khoản ngay.
       </div>`
    : available <= WARNING_THRESHOLD
    ? `<div class="admin-alert admin-alert--warn" role="status">
        Kho sắp hết: còn <strong>${available}</strong> tài khoản. Nên nhập thêm sớm.
       </div>`
    : ''

  let html = `
    ${stockWarning}
    <!-- ADD FORM -->
    <div class="acc-add-section">
      <h3>➕ Thêm tài khoản mới</h3>
      <div class="acc-add-modes">
        <button class="acc-mode-btn active" data-mode="single">Thêm 1</button>
        <button class="acc-mode-btn" data-mode="bulk">Thêm hàng loạt</button>
      </div>

      <!-- Format hint -->
      <div class="acc-format-hint">
        <strong>📌 Định dạng hỗ trợ (hệ thống tự nhận diện):</strong>
        <div class="acc-format-examples">
          <code>email@gmail.com:password:NetflixId=xxx; SecureNetflixId=xxx...</code>
          <code>email@gmail.com:password</code>
          <code>NetflixId=xxx; SecureNetflixId=xxx; nfvdid=xxx...</code>
        </div>
      </div>

      <!-- Single add -->
      <form id="addSingleForm" class="acc-add-form">
        <div class="acc-add-row">
          <input type="text" id="addValue" class="acc-input acc-input-wide"
            placeholder="email:pass:cookie  HOẶC  email:pass  HOẶC  cookie..." required>
          <input type="text" id="addNote" class="acc-input" placeholder="Ghi chú (tuỳ chọn)" style="width:130px;">
          <button type="submit" class="btn btn-sm btn-success">➕ Thêm</button>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
          <span style="font-size:13px;color:var(--text-secondary);white-space:nowrap;">Số slot:</span>
          <input type="range" id="addMaxSlots" min="1" max="20" value="5" style="width:140px;"
            oninput="document.getElementById('addMaxSlotsVal').textContent=this.value">
          <span id="addMaxSlotsVal" style="font-size:16px;font-weight:800;color:var(--primary);min-width:20px;">5</span>
          <span style="font-size:12px;color:var(--text-muted);">user/acc (share account)</span>
        </div>
      </form>

      <!-- Bulk add -->
      <div id="bulkAddSection" style="display:none;">
        <textarea id="bulkValues" class="acc-textarea" rows="8"
          placeholder="Mỗi dòng 1 tài khoản, ví dụ:&#10;email1@gmail.com:pass1:NetflixId=abc; SecureNetflixId=xyz...&#10;email2@gmail.com:pass2:NetflixId=def; SecureNetflixId=uvw...&#10;NetflixId=standalone_cookie; SecureNetflixId=..."></textarea>
        <div class="acc-add-row" style="margin-top:8px;">
          <button class="btn btn-sm btn-success" id="bulkAddBtn">➕ Thêm tất cả</button>
          <span id="bulkCount" class="acc-bulk-count"></span>
        </div>
      </div>
      <div id="addResult" class="form-success" style="margin-top:8px;"></div>
      <div id="addError" class="form-error" style="margin-top:8px;"></div>
    </div>

    <!-- STATS -->
    <div class="admin-toolbar" style="margin-top:24px;">
      <span class="admin-count">
        Tổng: ${total} &nbsp;|&nbsp; 🟢 Sẵn sàng: <strong>${available}</strong>
        &nbsp;|&nbsp; 🔵 Đã gán: ${assigned}
        &nbsp;|&nbsp; 💀 Chết: ${dead}
      </span>
      <div style="display:flex;gap:8px;">
        <input type="text" id="searchAcc" class="admin-filter" placeholder="🔍 Tìm email/cookie..." style="min-width:180px;">
        <select id="filterAccStatus" class="admin-filter">
          <option value="">Tất cả trạng thái</option>
          <option value="available">🟢 Sẵn sàng</option>
          <option value="full">🔵 Đầy slot</option>
          <option value="dead">💀 Đã chết</option>
        </select>
      </div>
    </div>

    <!-- TABLE -->
    <div class="admin-table-wrap">
    <div class="table-responsive">
      <table class="data-table" id="accountsTable">
        <thead>
          <tr>
            <th style="width:36px;">#</th>
            <th>Email</th>
            <th>Cookie (tóm tắt)</th>
            <th>Slots dùng</th>
            <th>Trạng thái</th>
            <th>Ngày tạo</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
  `

  if (!accounts || accounts.length === 0) {
    html += '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">Chưa có tài khoản nào. Thêm ở form phía trên.</td></tr>'
  } else {
    accounts.forEach((a, i) => {
      const raw      = a.value || ''
      const maxSlots = a.max_slots || 5
      const usedSlots = a.assigned_count || 0
      const slotPct  = maxSlots > 0 ? Math.round(usedSlots / maxSlots * 100) : 0
      const slotColor = usedSlots >= maxSlots ? 'var(--danger)' : usedSlots >= maxSlots * 0.8 ? 'var(--warning)' : 'var(--secondary)'

      let displayEmail = '—'
      let displayCookie = '—'

      if (raw.includes('@')) {
        const firstColon = raw.indexOf(':')
        displayEmail = firstColon > -1 ? raw.substring(0, firstColon) : raw
        const secondColon = raw.indexOf(':', firstColon + 1)
        if (secondColon > -1) {
          const cookiePart = raw.substring(secondColon + 1)
          displayCookie = cookiePart.length > 40 ? cookiePart.substring(0, 40) + '…' : cookiePart
        }
      } else {
        displayCookie = raw.length > 40 ? raw.substring(0, 40) + '…' : raw
      }

      html += `
        <tr data-id="${a.id}" data-status="${a.status}" data-type="${a.type || 'account'}"
          data-search="${raw.toLowerCase()} ${(a.note || '').toLowerCase()}">
          <td>${i + 1}</td>
          <td>
            <span class="acc-email-preview">${displayEmail}</span>
          </td>
          <td>
            <div class="acc-value-cell">
              <code class="acc-value-code" title="${raw}">${displayCookie}</code>
              <button class="btn-copy-sm" data-copy="${raw}">📋</button>
            </div>
          </td>
          <td>
            <!-- Slot usage bar -->
            <div style="display:flex;align-items:center;gap:8px;min-width:110px;">
              <div style="flex:1;background:var(--bg-muted);border-radius:99px;height:6px;overflow:hidden;">
                <div style="width:${slotPct}%;height:100%;background:${slotColor};border-radius:99px;transition:.3s;"></div>
              </div>
              <span style="font-size:12px;font-weight:700;color:${slotColor};white-space:nowrap;">${usedSlots}/${maxSlots}</span>
            </div>
          </td>
          <td>
            <span class="status-badge ${
              a.status === 'available' ? 'status-active' :
              a.status === 'full'      ? 'status-pending' :
              a.status === 'dead'      ? 'status-expired' : 'status-pending'
            }">
              ${a.status === 'available' ? '🟢 Sẵn sàng' :
                a.status === 'full'      ? '🔵 Đầy slot' :
                a.status === 'dead'      ? '💀 Chết' : a.status}
            </span>
          </td>
          <td>${formatDate(a.created_at)}</td>
          <td>
            <div class="admin-actions">
              <button class="btn btn-sm btn-primary edit-acc-btn"
                data-id="${a.id}"
                data-value="${encodeURIComponent(raw)}"
                data-note="${encodeURIComponent(a.note || '')}"
                data-maxslots="${maxSlots}"
                data-type="${a.type || 'account'}">✏️</button>
              ${(a.status === 'available' || a.status === 'full') ? `<button class="btn btn-sm btn-success quick-assign-btn"
                data-id="${a.id}"
                data-value="${encodeURIComponent(raw)}">🔗 Gán</button>` : ''}
              <button class="btn btn-sm btn-danger del-acc-btn" data-id="${a.id}">🗑️</button>
            </div>
          </td>
        </tr>
      `
    })
  }

  html += '</tbody></table></div></div>'

  // Quick assign modal
  html += `
    <div class="user-modal-overlay" id="quickAssignModal" style="display:none;">
      <div class="user-modal" style="max-width:500px;">
        <div class="user-modal-header">
          <h2>🔗 Gán tài khoản cho subscription</h2>
          <button class="btn btn-sm btn-outline close-quick-assign">✕</button>
        </div>
        <div class="user-modal-body">
          <div class="form-group">
            <label>Tài khoản</label>
            <input type="text" id="qaValue" readonly class="form-readonly">
          </div>
          <div class="form-group">
            <label>Chọn subscription (chỉ hiện active, chưa có link)</label>
            <select id="qaSubSelect"><option value="">⏳ Đang tải...</option></select>
          </div>
          <div id="qaError" class="form-error"></div>
          <div id="qaSuccess" class="form-success"></div>
          <button class="btn btn-primary btn-block" id="qaSubmit">✅ Gán</button>
        </div>
      </div>
    </div>
  `

  // Edit modal
  html += `
    <div class="user-modal-overlay" id="editAccModal" style="display:none;">
      <div class="user-modal" style="max-width:500px;">
        <div class="user-modal-header">
          <h2>✏️ Sửa tài khoản</h2>
          <button class="btn btn-sm btn-outline close-edit-acc">✕</button>
        </div>
        <div class="user-modal-body">
          <input type="hidden" id="editAccId">
          <div class="form-group">
            <label>Loại</label>
            <select id="editAccType" class="acc-input">
              <option value="account">🔐 Account (email:pass:cookie)</option>
              <option value="login_link">🔗 Login Link</option>
              <option value="cookie">🍪 Cookie</option>
              <option value="nftoken">🎫 NFToken</option>
              <option value="email_pass">📧 Email:Pass</option>
            </select>
          </div>
          <div class="form-group">
            <label>Giá trị</label>
            <textarea id="editAccValue" rows="3" class="acc-textarea"></textarea>
          </div>
          <div class="form-group">
            <label>
              Số slot tối đa
              <span style="color:var(--text-secondary);font-size:12px;font-weight:400;">— tài khoản share được bao nhiêu user</span>
            </label>
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="range" id="editAccMaxSlots" min="1" max="20" value="5"
                style="flex:1;" oninput="document.getElementById('editAccMaxSlotsVal').textContent=this.value">
              <span id="editAccMaxSlotsVal" style="font-size:18px;font-weight:800;color:var(--primary);min-width:28px;text-align:center;">5</span>
              <span style="font-size:13px;color:var(--text-secondary);">user</span>
            </div>
          </div>
          <div class="form-group">
            <label>Ghi chú</label>
            <input type="text" id="editAccNote" class="acc-input" placeholder="VD: Premium 4K Brazil...">
          </div>
          <div id="editAccError" class="form-error"></div>
          <div id="editAccSuccess" class="form-success"></div>
          <button class="btn btn-primary btn-block" id="editAccSubmit">💾 Lưu thay đổi</button>
        </div>
      </div>
    </div>
  `

  panel.innerHTML = html

  // ===== Mode switch =====
  const singleForm = panel.querySelector('#addSingleForm')
  const bulkSection = panel.querySelector('#bulkAddSection')
  panel.querySelectorAll('.acc-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.acc-mode-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      singleForm.style.display = btn.dataset.mode === 'single' ? 'block' : 'none'
      bulkSection.style.display = btn.dataset.mode === 'bulk' ? 'block' : 'none'
    })
  })

  // ===== Single add =====
  singleForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const raw   = panel.querySelector('#addValue').value.trim()
    const value = normalizeAccountLine(raw)
    const note  = panel.querySelector('#addNote').value.trim()
    const resultEl = panel.querySelector('#addResult')
    const errorEl  = panel.querySelector('#addError')
    resultEl.textContent = ''; errorEl.textContent = ''

    if (!value) { errorEl.textContent = 'Vui lòng nhập giá trị'; return }
    const maxSlots  = parseInt(panel.querySelector('#addMaxSlots')?.value) || 5
    const submitBtn = singleForm.querySelector('button[type="submit"]')
    submitBtn.disabled = true; submitBtn.textContent = '⏳'
    try {
      await adminAddAccount('account', value, note, maxSlots)
      resultEl.innerHTML = `<span style="color:var(--secondary-hover);font-weight:600;">✅ Đã thêm! Đang tải...</span>`
      panel.querySelector('#addValue').value = ''
      panel.querySelector('#addNote').value = ''
      const fresh = await adminGetAllAccounts()
      renderAccounts(panel, fresh)
    } catch (err) {
      errorEl.textContent = `❌ ${err.message}${inventoryErrorHint(err.message)}`
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = '➕ Thêm'
    }
  })

  // ===== Bulk add =====
  const bulkTextarea = panel.querySelector('#bulkValues')
  const bulkCount = panel.querySelector('#bulkCount')
  bulkTextarea?.addEventListener('input', () => {
    const lines = bulkTextarea.value.split('\n').filter(l => l.trim()).length
    bulkCount.textContent = `${lines} tài khoản`
  })

  panel.querySelector('#bulkAddBtn')?.addEventListener('click', async () => {
    const lines = bulkTextarea.value.split('\n').map(l => normalizeAccountLine(l)).filter(Boolean)
    const resultEl = panel.querySelector('#addResult')
    const errorEl = panel.querySelector('#addError')
    resultEl.textContent = ''; errorEl.textContent = ''

    if (lines.length === 0) { errorEl.textContent = 'Vui lòng nhập ít nhất 1 dòng'; return }

    const btn = panel.querySelector('#bulkAddBtn')
    btn.disabled = true
    btn.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px;"></span>Đang thêm ${lines.length} tài khoản...`

    try {
      const items = lines.map(v => ({ type: 'account', value: v }))
      await adminAddAccountsBulk(items)

      // Chỉ fetch lại 1 lần để cập nhật toàn bộ, không re-render trong vòng lặp
      resultEl.innerHTML = `<span style="color:var(--secondary-hover);font-weight:600;">✅ Đã thêm thành công ${lines.length} tài khoản! Đang tải danh sách...</span>`
      bulkTextarea.value = ''
      bulkCount.textContent = ''

      const fresh = await adminGetAllAccounts()
      renderAccounts(panel, fresh)   // re-render 1 lần duy nhất sau khi có data
    } catch (err) {
      errorEl.textContent = `❌ ${err.message}${inventoryErrorHint(err.message)}`
      console.error('[Bulk Add]', err)
    } finally {
      btn.disabled = false
      btn.textContent = '➕ Thêm tất cả'
    }
  })

  // ===== Search & Filter =====
  const searchAcc = panel.querySelector('#searchAcc')
  const filterStatus = panel.querySelector('#filterAccStatus')
  const filterAccRows = () => {
    const q = (searchAcc?.value || '').toLowerCase()
    const s = filterStatus?.value || ''
    panel.querySelectorAll('#accountsTable tbody tr').forEach(row => {
      const mq = !q || (row.dataset.search || '').includes(q)
      const ms = !s || row.dataset.status === s
      row.style.display = (mq && ms) ? '' : 'none'
    })
  }
  searchAcc?.addEventListener('input', filterAccRows)
  filterStatus?.addEventListener('change', filterAccRows)

  // ===== Copy =====
  panel.querySelectorAll('.btn-copy-sm').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy)
      btn.textContent = '✅'
      setTimeout(() => btn.textContent = '📋', 1500)
    })
  })

  // ===== Delete =====
  panel.querySelectorAll('.del-acc-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Xóa tài khoản này?')) return
      btn.disabled = true
      try {
        await adminDeleteAccount(btn.dataset.id)
        btn.closest('tr').remove()
      } catch (err) { alert('Lỗi: ' + err.message); btn.disabled = false }
    })
  })

  // ===== Edit modal =====
  const editModal = panel.querySelector('#editAccModal')
  panel.querySelector('.close-edit-acc')?.addEventListener('click', () => editModal.style.display = 'none')
  editModal?.addEventListener('click', (e) => { if (e.target === editModal) editModal.style.display = 'none' })

  panel.querySelectorAll('.edit-acc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const maxSlots = parseInt(btn.dataset.maxslots) || 5
      panel.querySelector('#editAccId').value              = btn.dataset.id
      panel.querySelector('#editAccType').value            = btn.dataset.type
      panel.querySelector('#editAccValue').value           = decodeURIComponent(btn.dataset.value)
      panel.querySelector('#editAccNote').value            = decodeURIComponent(btn.dataset.note)
      panel.querySelector('#editAccMaxSlots').value        = maxSlots
      panel.querySelector('#editAccMaxSlotsVal').textContent = maxSlots
      panel.querySelector('#editAccError').textContent     = ''
      panel.querySelector('#editAccSuccess').textContent   = ''
      editModal.style.display = 'flex'
    })
  })

  panel.querySelector('#editAccSubmit')?.addEventListener('click', async () => {
    const id       = panel.querySelector('#editAccId').value
    const type     = panel.querySelector('#editAccType').value
    const value    = panel.querySelector('#editAccValue').value.trim()
    const note     = panel.querySelector('#editAccNote').value.trim()
    const maxSlots = parseInt(panel.querySelector('#editAccMaxSlots').value) || 5
    const errEl    = panel.querySelector('#editAccError')
    const sucEl    = panel.querySelector('#editAccSuccess')
    const btn      = panel.querySelector('#editAccSubmit')
    errEl.textContent = ''; sucEl.textContent = ''

    if (!value) { errEl.textContent = 'Giá trị không được trống'; return }
    btn.disabled = true; btn.textContent = '⏳'
    try {
      await adminUpdateAccount(id, { type, value, note, max_slots: maxSlots })
      sucEl.textContent = `✅ Đã lưu! (max ${maxSlots} user)`
      setTimeout(async () => {
        editModal.style.display = 'none'
        const fresh = await adminGetAllAccounts()
        renderAccounts(panel, fresh)
      }, 800)
    } catch (err) { errEl.textContent = 'Lỗi: ' + err.message }
    finally { btn.disabled = false; btn.textContent = '💾 Lưu thay đổi' }
  })

  // ===== Quick assign modal =====
  const qaModal = panel.querySelector('#quickAssignModal')
  panel.querySelector('.close-quick-assign')?.addEventListener('click', () => qaModal.style.display = 'none')
  qaModal?.addEventListener('click', (e) => { if (e.target === qaModal) qaModal.style.display = 'none' })

  panel.querySelectorAll('.quick-assign-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const resourceId = btn.dataset.id
      const value = decodeURIComponent(btn.dataset.value)

      panel.querySelector('#qaValue').value = value
      panel.querySelector('#qaError').textContent = ''
      panel.querySelector('#qaSuccess').textContent = ''
      const subSelect = panel.querySelector('#qaSubSelect')
      subSelect.innerHTML = '<option value="">⏳ Đang tải...</option>'
      qaModal.style.display = 'flex'
      qaModal.dataset.resourceId = resourceId

      try {
        const subs = await adminGetAllSubscriptions()
        const activeSubs = subs.filter(s => s.status === 'active' && !s.login_link)
        subSelect.innerHTML = '<option value="">-- Chọn subscription --</option>'
        if (activeSubs.length === 0) {
          subSelect.innerHTML += '<option value="" disabled>Không có subscription active chưa gán link</option>'
        }
        activeSubs.forEach(s => {
          const plan = s.plans || {}
          subSelect.innerHTML += `<option value="${s.id}">${s.user_email || s.user_id} — ${plan.name || planLabel(s.plan)}</option>`
        })
      } catch (err) {
        subSelect.innerHTML = `<option value="">Lỗi: ${err.message}</option>`
      }
    })
  })

  panel.querySelector('#qaSubmit')?.addEventListener('click', async () => {
    const resourceId = qaModal.dataset.resourceId
    const subId = panel.querySelector('#qaSubSelect').value
    const errEl = panel.querySelector('#qaError')
    const sucEl = panel.querySelector('#qaSuccess')
    const btn = panel.querySelector('#qaSubmit')
    errEl.textContent = ''; sucEl.textContent = ''

    if (!subId) { errEl.textContent = 'Vui lòng chọn subscription'; return }
    btn.disabled = true; btn.textContent = '⏳'
    try {
      await adminAssignAccountFromPool(resourceId, subId)
      sucEl.textContent = '✅ Đã gán tài khoản!'
      setTimeout(async () => {
        qaModal.style.display = 'none'
        const fresh = await adminGetAllAccounts()
        renderAccounts(panel, fresh)
      }, 800)
    } catch (err) { errEl.textContent = 'Lỗi: ' + err.message }
    finally { btn.disabled = false; btn.textContent = '✅ Gán' }
  })
}

function renderUsers(panel, profiles) {
  if (!profiles || profiles.length === 0) {
    panel.innerHTML = `
      <div class="admin-empty">
        <div class="admin-empty__icon">👥</div>
        <h3>Chưa có người dùng</h3>
        <p>Danh sách profile sẽ hiện khi có tài khoản đăng ký.</p>
      </div>`
    return
  }

  const adminCount    = profiles.filter(p => p.role === 'admin').length
  const employeeCount = profiles.filter(p => p.role === 'employee').length
  const userCount     = profiles.filter(p => !['admin','employee'].includes(p.role)).length

  let html = `
    <div class="admin-toolbar">
      <span class="admin-count">${profiles.length} tài khoản · ${adminCount} admin · ${employeeCount} nhân viên · ${userCount} user</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="text" id="searchUser" class="admin-filter" placeholder="Tìm email..." style="min-width:200px;">
        <select id="filterRole" class="admin-filter">
          <option value="">Tất cả role</option>
          <option value="admin">Admin</option>
          <option value="employee">Nhân viên</option>
          <option value="user">User</option>
        </select>
      </div>
    </div>
    <div class="admin-table-wrap">
    <div class="table-responsive">
      <table class="data-table" id="usersTable">
        <thead>
          <tr>
            <th>#</th>
            <th>Email</th>
            <th>Role</th>
            <th>Ngày tạo</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
  `

  profiles.forEach((p, i) => {
    const isAdmin = p.role === 'admin'
    html += `
      <tr data-role="${p.role || 'user'}" data-email="${(p.email || '').toLowerCase()}" data-id="${p.id}">
        <td>${i + 1}</td>
        <td>
          <div class="user-email-cell">
            <span>${p.email || '—'}</span>
            <code class="user-id-code">${p.id.substring(0, 8)}...</code>
          </div>
        </td>
        <td>
          <select class="role-select ${p.role === 'admin' ? 'role-admin' : p.role === 'employee' ? 'role-employee' : 'role-user'}" data-user-id="${p.id}" data-current="${p.role || 'user'}">
            <option value="user"     ${(!p.role || p.role==='user')     ? 'selected' : ''}>👤 User</option>
            <option value="employee" ${p.role==='employee'              ? 'selected' : ''}>🛠️ Nhân viên</option>
            <option value="admin"    ${p.role==='admin'                 ? 'selected' : ''}>👑 Admin</option>
          </select>
        </td>
        <td>${formatDate(p.created_at)}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn-sm btn-success assign-plan-btn" data-user-id="${p.id}" data-email="${p.email}">📦 Gán gói</button>
            <button class="btn btn-sm btn-primary assign-acc-btn" data-user-id="${p.id}" data-email="${p.email}">🔗 Gán TK</button>
            <button class="btn btn-sm btn-primary view-user-btn" data-user-id="${p.id}" data-email="${p.email}">👁️</button>
            <button class="btn btn-sm btn-danger delete-user-btn" data-user-id="${p.id}" data-email="${p.email}">🗑️</button>
          </div>
        </td>
      </tr>
    `
  })

  html += '</tbody></table></div></div>'

  // ===== ASSIGN PLAN MODAL =====
  html += `
    <div class="user-modal-overlay" id="assignPlanModal" style="display:none;">
      <div class="user-modal" style="max-width:500px;">
        <div class="user-modal-header">
          <h2 id="assignPlanTitle">📦 Gán gói cho người dùng</h2>
          <button class="btn btn-sm btn-outline close-assign-plan">✕</button>
        </div>
        <div class="user-modal-body">
          <form id="assignPlanForm" class="assign-form">
            <input type="hidden" id="assignPlanUserId">
            <div class="form-group">
              <label>Email</label>
              <input type="text" id="assignPlanEmail" readonly class="form-readonly">
            </div>
            <div class="form-group">
              <label>Chọn gói</label>
              <select id="assignPlanSelect" required>
                <option value="">-- Chọn gói --</option>
              </select>
            </div>
            <div class="form-group">
              <label>Link đăng nhập (tuỳ chọn)</label>
              <input type="text" id="assignPlanLink" placeholder="https://netflix.com/...">
            </div>
            <div id="assignPlanError" class="form-error"></div>
            <div id="assignPlanSuccess" class="form-success"></div>
            <button type="submit" class="btn btn-primary btn-block">✅ Gán gói + Kích hoạt</button>
          </form>
        </div>
      </div>
    </div>
  `

  // ===== ASSIGN ACCOUNT MODAL =====
  html += `
    <div class="user-modal-overlay" id="assignAccModal" style="display:none;">
      <div class="user-modal" style="max-width:500px;">
        <div class="user-modal-header">
          <h2 id="assignAccTitle">🔗 Gán tài khoản cho người dùng</h2>
          <button class="btn btn-sm btn-outline close-assign-acc">✕</button>
        </div>
        <div class="user-modal-body">
          <div class="form-group">
            <label>Email</label>
            <input type="text" id="assignAccEmail" readonly class="form-readonly">
          </div>
          <div class="form-group">
            <label>Chọn đăng ký (subscription)</label>
            <select id="assignAccSubSelect" required>
              <option value="">-- Đang tải... --</option>
            </select>
          </div>
          <div class="form-group">
            <label>Link đăng nhập Netflix</label>
            <input type="text" id="assignAccLink" placeholder="https://netflix.com/?nftoken=..." required>
          </div>
          <div id="assignAccError" class="form-error"></div>
          <div id="assignAccSuccess" class="form-success"></div>
          <button class="btn btn-primary btn-block" id="assignAccSubmit">💾 Gán tài khoản</button>
        </div>
      </div>
    </div>
  `

  // ===== USER DETAIL MODAL =====
  html += `
    <div class="user-modal-overlay" id="userModal" style="display:none;">
      <div class="user-modal">
        <div class="user-modal-header">
          <h2 id="modalTitle">Chi tiết người dùng</h2>
          <button class="btn btn-sm btn-outline" id="closeModal">✕</button>
        </div>
        <div class="user-modal-tabs">
          <button class="modal-tab active" data-tab="modal-subs">📦 Đăng ký</button>
          <button class="modal-tab" data-tab="modal-pays">💳 Thanh toán</button>
        </div>
        <div class="user-modal-body" id="modalSubsPanel">
          <div class="loading"><div class="spinner"></div></div>
        </div>
        <div class="user-modal-body" id="modalPaysPanel" style="display:none;">
          <div class="loading"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `

  panel.innerHTML = html

  // ============ SEARCH & FILTER ============
  const searchInput = panel.querySelector('#searchUser')
  const roleFilter = panel.querySelector('#filterRole')
  const filterRows = () => {
    const query = (searchInput?.value || '').toLowerCase()
    const role = roleFilter?.value || ''
    const rows = panel.querySelectorAll('#usersTable tbody tr')
    rows.forEach(row => {
      const matchEmail = !query || row.dataset.email.includes(query)
      const matchRole = !role || row.dataset.role === role
      row.style.display = (matchEmail && matchRole) ? '' : 'none'
    })
  }
  searchInput?.addEventListener('input', filterRows)
  roleFilter?.addEventListener('change', filterRows)

  // ============ ROLE CHANGE ============
  panel.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const userId = sel.dataset.userId
      const newRole = sel.value
      const oldRole = sel.dataset.current
      if (newRole === oldRole) return
      if (newRole === 'admin' && !confirm('Xác nhận cấp quyền ADMIN cho user này?')) {
        sel.value = oldRole; return
      }
      sel.disabled = true
      try {
        await adminUpdateProfile(userId, { role: newRole })
        sel.dataset.current = newRole
        sel.className = `role-select ${newRole === 'admin' ? 'role-admin' : newRole === 'employee' ? 'role-employee' : 'role-user'}`
        sel.closest('tr').dataset.role = newRole
      } catch (err) { alert('Lỗi: ' + err.message); sel.value = oldRole }
      finally { sel.disabled = false }
    })
  })

  // ============ DELETE USER ============
  panel.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.email
      if (!confirm(`⚠️ XÓA tài khoản ${email}?\nKhông thể hoàn tác!`)) return
      btn.disabled = true; btn.textContent = '⏳'
      try {
        await adminDeleteUser(btn.dataset.userId)
        btn.closest('tr').remove()
      } catch (err) { alert('Lỗi: ' + err.message); btn.disabled = false; btn.textContent = '🗑️' }
    })
  })

  // ============ ASSIGN PLAN MODAL ============
  const assignPlanModal = panel.querySelector('#assignPlanModal')
  const assignPlanForm = panel.querySelector('#assignPlanForm')
  const assignPlanSelect = panel.querySelector('#assignPlanSelect')
  let plansCache = null

  panel.querySelector('.close-assign-plan')?.addEventListener('click', () => { assignPlanModal.style.display = 'none' })
  assignPlanModal?.addEventListener('click', (e) => { if (e.target === assignPlanModal) assignPlanModal.style.display = 'none' })

  panel.querySelectorAll('.assign-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId
      const email = btn.dataset.email

      panel.querySelector('#assignPlanUserId').value = userId
      panel.querySelector('#assignPlanEmail').value = email
      panel.querySelector('#assignPlanLink').value = ''
      panel.querySelector('#assignPlanError').textContent = ''
      panel.querySelector('#assignPlanSuccess').textContent = ''
      panel.querySelector('#assignPlanTitle').textContent = `📦 Gán gói → ${email}`

      // Load plans
      if (!plansCache) {
        try { plansCache = await getPlans() } catch { plansCache = [] }
      }
      assignPlanSelect.innerHTML = '<option value="">-- Chọn gói --</option>'
      plansCache.forEach(p => {
        assignPlanSelect.innerHTML += `<option value="${p.id}">${p.name} — ${formatVND(p.price)} (${p.duration_days} ngày)</option>`
      })

      assignPlanModal.style.display = 'flex'
    })
  })

  assignPlanForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const userId = panel.querySelector('#assignPlanUserId').value
    const planId = assignPlanSelect.value
    const link = panel.querySelector('#assignPlanLink').value.trim()
    const errEl = panel.querySelector('#assignPlanError')
    const sucEl = panel.querySelector('#assignPlanSuccess')
    const submitBtn = assignPlanForm.querySelector('button[type="submit"]')

    errEl.textContent = ''; sucEl.textContent = ''
    if (!planId) { errEl.textContent = 'Vui lòng chọn gói'; return }

    submitBtn.disabled = true; submitBtn.textContent = '⏳ Đang xử lý...'
    try {
      const sub = await adminAssignPlan(userId, planId, link)
      sucEl.textContent = `✅ Đã gán gói thành công! Sub ID: ${sub.id.substring(0, 8)}...`
      assignPlanSelect.value = ''
      panel.querySelector('#assignPlanLink').value = ''
    } catch (err) {
      errEl.textContent = 'Lỗi: ' + err.message
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = '✅ Gán gói + Kích hoạt'
    }
  })

  // ============ ASSIGN ACCOUNT MODAL ============
  const assignAccModal = panel.querySelector('#assignAccModal')
  const assignAccSubSelect = panel.querySelector('#assignAccSubSelect')
  const assignAccSubmit = panel.querySelector('#assignAccSubmit')
  let assignAccUserId = null

  panel.querySelector('.close-assign-acc')?.addEventListener('click', () => { assignAccModal.style.display = 'none' })
  assignAccModal?.addEventListener('click', (e) => { if (e.target === assignAccModal) assignAccModal.style.display = 'none' })

  panel.querySelectorAll('.assign-acc-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId
      const email = btn.dataset.email
      assignAccUserId = userId

      panel.querySelector('#assignAccEmail').value = email
      panel.querySelector('#assignAccLink').value = ''
      panel.querySelector('#assignAccError').textContent = ''
      panel.querySelector('#assignAccSuccess').textContent = ''
      panel.querySelector('#assignAccTitle').textContent = `🔗 Gán TK → ${email}`

      assignAccSubSelect.innerHTML = '<option value="">⏳ Đang tải...</option>'
      assignAccModal.style.display = 'flex'

      try {
        const subs = await adminGetUserSubscriptions(userId)
        assignAccSubSelect.innerHTML = '<option value="">-- Chọn subscription --</option>'
        if (!subs || subs.length === 0) {
          assignAccSubSelect.innerHTML = '<option value="">Không có subscription nào</option>'
        } else {
          subs.forEach(s => {
            const plan = s.plans || {}
            const status = s.status === 'active' ? '🟢' : s.status === 'pending' ? '🟡' : '🔴'
            const link = s.login_link ? ' ✅link' : ' ❌no link'
            assignAccSubSelect.innerHTML += `<option value="${s.id}">${status} ${plan.name || planLabel(s.plan)} — ${statusLabel(s.status)}${link}</option>`
          })
        }
      } catch (err) {
        assignAccSubSelect.innerHTML = `<option value="">Lỗi: ${err.message}</option>`
      }
    })
  })

  assignAccSubmit?.addEventListener('click', async () => {
    const subId = assignAccSubSelect.value
    const link = panel.querySelector('#assignAccLink').value.trim()
    const errEl = panel.querySelector('#assignAccError')
    const sucEl = panel.querySelector('#assignAccSuccess')

    errEl.textContent = ''; sucEl.textContent = ''
    if (!subId) { errEl.textContent = 'Vui lòng chọn subscription'; return }
    if (!link) { errEl.textContent = 'Vui lòng nhập link đăng nhập'; return }

    assignAccSubmit.disabled = true; assignAccSubmit.textContent = '⏳ Đang lưu...'
    try {
      await adminAssignAccount(subId, link)
      sucEl.textContent = '✅ Đã gán tài khoản thành công!'
      panel.querySelector('#assignAccLink').value = ''
    } catch (err) {
      errEl.textContent = 'Lỗi: ' + err.message
    } finally {
      assignAccSubmit.disabled = false; assignAccSubmit.textContent = '💾 Gán tài khoản'
    }
  })

  // ============ VIEW USER DETAIL MODAL ============
  const modal = panel.querySelector('#userModal')
  const closeBtn = panel.querySelector('#closeModal')
  const subsPanel = panel.querySelector('#modalSubsPanel')
  const paysPanel = panel.querySelector('#modalPaysPanel')
  const modalTabs = panel.querySelectorAll('.modal-tab')

  closeBtn?.addEventListener('click', () => { modal.style.display = 'none' })
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none' })

  modalTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modalTabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      if (tab.dataset.tab === 'modal-subs') {
        subsPanel.style.display = 'block'; paysPanel.style.display = 'none'
      } else {
        subsPanel.style.display = 'none'; paysPanel.style.display = 'block'
      }
    })
  })

  panel.querySelectorAll('.view-user-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId
      const email = btn.dataset.email

      modal.style.display = 'flex'
      panel.querySelector('#modalTitle').textContent = `👤 ${email}`
      subsPanel.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
      paysPanel.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
      modalTabs.forEach(t => t.classList.remove('active'))
      modalTabs[0]?.classList.add('active')
      subsPanel.style.display = 'block'; paysPanel.style.display = 'none'

      try {
        const [subs, pays] = await Promise.all([
          adminGetUserSubscriptions(userId),
          adminGetUserPayments(userId)
        ])
        renderModalSubs(subsPanel, subs)
        renderModalPays(paysPanel, pays)
      } catch (err) {
        subsPanel.innerHTML = `<p class="error-text">${err.message}</p>`
        paysPanel.innerHTML = `<p class="error-text">${err.message}</p>`
      }
    })
  })
}

function renderModalSubs(panel, subs) {
  if (!subs || subs.length === 0) {
    panel.innerHTML = '<div class="admin-empty" style="padding:var(--sp-8);"><p style="margin:0;color:var(--text-secondary);">Chưa có đăng ký.</p></div>'
    return
  }
  let html = '<div class="modal-list">'
  subs.forEach(sub => {
    const plan = sub.plans || {}
    const days = daysLeft(sub.end_at)
    html += `
      <div class="modal-item">
        <div class="modal-item-header">
          <strong>${plan.name || planLabel(sub.plan)}</strong>
          <span class="status-badge ${statusClass(sub.status)}">${statusLabel(sub.status)}</span>
        </div>
        <div class="modal-item-details">
          <span>Giá: ${formatVND(plan.price || 0)}</span>
          <span>Tạo: ${formatDate(sub.created_at)}</span>
          ${sub.start_at ? `<span>Bắt đầu: ${formatDate(sub.start_at)}</span>` : ''}
          ${sub.end_at ? `<span>Hết hạn: ${formatDate(sub.end_at)} (${days} ngày)</span>` : ''}
          ${sub.login_link ? `<span class="text-success">🔗 Có link đăng nhập</span>` : '<span class="text-warning">⏳ Chưa có link</span>'}
        </div>
      </div>
    `
  })
  html += '</div>'
  panel.innerHTML = html
}

function renderModalPays(panel, pays) {
  if (!pays || pays.length === 0) {
    panel.innerHTML = '<div class="admin-empty" style="padding:var(--sp-8);"><p style="margin:0;color:var(--text-secondary);">Chưa có thanh toán.</p></div>'
    return
  }
  let html = '<div class="modal-list">'
  pays.forEach(p => {
    const plan = p.plans || {}
    html += `
      <div class="modal-item">
        <div class="modal-item-header">
          <strong>${formatVND(p.amount)} — ${plan.name || planLabel(p.plan)}</strong>
          <span class="status-badge ${statusClass(p.status)}">${statusLabel(p.status)}</span>
        </div>
        <div class="modal-item-details">
          <span>Phương thức: ${p.method || '—'}</span>
          <span>Nội dung CK: <code>${p.transfer_content || '—'}</code></span>
          <span>Thời gian: ${formatDate(p.created_at)}</span>
        </div>
      </div>
    `
  })
  html += '</div>'
  panel.innerHTML = html
}

// ============================================================
// PLANS MANAGEMENT
// ============================================================
function renderPlans(panel, plans) {
  panel.innerHTML = `
    <div class="admin-plans">
      <div class="admin-form-card">
        <h3 class="admin-section-title">Thêm gói mới</h3>
        <div class="admin-plans-add-grid">
          <div class="form-group">
            <label>ID (duy nhất)</label>
            <input type="text" id="newPlanId" placeholder="vd: month_3" class="admin-filter" style="width:100%;">
          </div>
          <div class="form-group">
            <label>Tên hiển thị</label>
            <input type="text" id="newPlanName" placeholder="vd: 3 Tháng" class="admin-filter" style="width:100%;">
          </div>
          <div class="form-group">
            <label>Giá (VNĐ)</label>
            <input type="number" id="newPlanPrice" placeholder="150000" class="admin-filter" style="width:100%;">
          </div>
          <div class="form-group">
            <label>Số ngày</label>
            <input type="number" id="newPlanDays" placeholder="90" class="admin-filter" style="width:100%;">
          </div>
          <button type="button" class="btn btn-success" id="btnAddPlan">Thêm gói</button>
        </div>
        <div id="planAddResult" class="admin-quick__result" style="margin-top:var(--sp-3);"></div>
      </div>
      <div class="admin-table-wrap">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>ID</th><th>Tên gói</th><th>Giá</th><th>Số ngày</th><th>Giá/ngày</th><th>Hành động</th></tr>
            </thead>
            <tbody id="plansBody">${renderPlanRows(plans)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `
  panel.querySelector('#btnAddPlan')?.addEventListener('click', async () => {
    const id    = panel.querySelector('#newPlanId').value.trim()
    const name  = panel.querySelector('#newPlanName').value.trim()
    const price = parseInt(panel.querySelector('#newPlanPrice').value)
    const days  = parseInt(panel.querySelector('#newPlanDays').value)
    const res   = panel.querySelector('#planAddResult')
    if (!id || !name || !price || !days) {
      res.innerHTML = '<span class="text-danger">Vui lòng điền đầy đủ.</span>'; return
    }
    const btn = panel.querySelector('#btnAddPlan')
    btn.disabled = true; btn.textContent = '⏳'
    try {
      await adminCreatePlan({ id, name, price, duration_days: days })
      res.innerHTML = '<span class="text-success">Đã thêm gói.</span>'
      ;['#newPlanId','#newPlanName','#newPlanPrice','#newPlanDays'].forEach(s => { panel.querySelector(s).value = '' })
      const fresh = await getPlans()
      panel.querySelector('#plansBody').innerHTML = renderPlanRows(fresh)
      attachPlanHandlers(panel)
    } catch (err) { res.innerHTML = `<span class="text-danger">${err.message}</span>` }
    finally { btn.disabled = false; btn.textContent = 'Thêm gói' }
  })
  attachPlanHandlers(panel)
}

function renderPlanRows(plans) {
  if (!plans?.length) return '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">Chưa có gói nào.</td></tr>'
  return plans.map(p => {
    const perDay = p.duration_days ? Math.round(p.price / p.duration_days) : 0
    return `<tr>
      <td><code style="font-size:12px;background:var(--primary-light);color:var(--primary);padding:2px 7px;border-radius:4px;">${p.id}</code></td>
      <td><input type="text"   class="plan-edit-name  admin-filter" value="${p.name  || ''}" style="width:120px;"></td>
      <td><input type="number" class="plan-edit-price admin-filter" value="${p.price || 0}"  style="width:110px;"></td>
      <td><input type="number" class="plan-edit-days  admin-filter" value="${p.duration_days || 0}" style="width:80px;"></td>
      <td style="color:var(--secondary-hover);font-weight:600;">${formatVND(perDay)}/ngày</td>
      <td><div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-primary save-plan-btn" data-id="${p.id}">💾 Lưu</button>
        <button class="btn btn-sm btn-danger  del-plan-btn"  data-id="${p.id}">🗑️</button>
      </div></td>
    </tr>`
  }).join('')
}

function attachPlanHandlers(panel) {
  panel.querySelectorAll('.save-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row   = btn.closest('tr')
      const id    = btn.dataset.id
      const name  = row.querySelector('.plan-edit-name').value.trim()
      const price = parseInt(row.querySelector('.plan-edit-price').value)
      const days  = parseInt(row.querySelector('.plan-edit-days').value)
      btn.disabled = true; btn.textContent = '⏳'
      try {
        await adminUpdatePlan(id, { name, price, duration_days: days })
        row.querySelectorAll('td')[4].textContent = formatVND(days ? Math.round(price/days) : 0) + '/ngày'
        btn.textContent = '✅'
        setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Lưu' }, 1500)
      } catch (err) { alert('Lỗi: ' + err.message); btn.disabled = false; btn.textContent = '💾 Lưu' }
    })
  })
  panel.querySelectorAll('.del-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Xóa gói "${btn.dataset.id}"?`)) return
      btn.disabled = true
      try { await adminDeletePlan(btn.dataset.id); btn.closest('tr').remove() }
      catch (err) { alert('Lỗi: ' + err.message); btn.disabled = false }
    })
  })
}

// ============================================================
// SETTINGS / SEO
// ============================================================
function renderSettings(panel, settings) {
  const s = settings || {}

  const field = (id, label, val = '', ph = '', hint = '') => `
    <div class="form-group">
      <label for="cfg_${id}">${label}${hint ? `<span class="cfg-hint">${hint}</span>` : ''}</label>
      <input type="text" id="cfg_${id}" class="cfg-input"
        value="${escapeAttr(val)}" placeholder="${escapeAttr(ph)}">
    </div>`

  const card = (title, desc, content, btnId, btnLabel, resultId) => `
    <div class="cfg-card">
      <div class="cfg-card-header">
        <h3 class="cfg-card-title">${title}</h3>
        ${desc ? `<p class="cfg-card-desc">${desc}</p>` : ''}
      </div>
      <div class="cfg-card-body">${content}</div>
      <div class="cfg-card-footer">
        <button type="button" class="btn btn-primary" id="${btnId}">${btnLabel}</button>
        <span class="cfg-result" id="${resultId}"></span>
      </div>
    </div>`

  panel.innerHTML = `
    <div class="admin-settings">
      <p class="admin-settings__lead">Dữ liệu lưu qua server (cùng DB với tự động xử lý đơn). Cần chạy <code>node server.cjs</code> và đăng nhập admin.</p>
      <nav class="cfg-subnav" role="tablist" aria-label="Nhóm cài đặt">
        <button type="button" class="cfg-subnav__btn active" data-cfg-tab="seo" role="tab" aria-selected="true">SEO &amp; trang chủ</button>
        <button type="button" class="cfg-subnav__btn" data-cfg-tab="payment" role="tab" aria-selected="false">Thanh toán</button>
        <button type="button" class="cfg-subnav__btn" data-cfg-tab="integrations" role="tab" aria-selected="false">Tích hợp</button>
        <button type="button" class="cfg-subnav__btn" data-cfg-tab="presence" role="tab" aria-selected="false">Liên hệ &amp; hiển thị</button>
      </nav>

      <div class="cfg-subpanels">
        <div class="cfg-subpanel active" data-cfg-panel="seo" role="tabpanel">
          ${card(
    'SEO & Thông tin trang',
    'Ảnh hưởng đến Google và khi chia sẻ link.',
    `${field('site_name', 'Tên website', s.site_name, 'Netflix Store')}
          ${field('site_title', 'Tiêu đề trang (title tag)', s.site_title, 'Netflix Store — Mua tài khoản...', '50–60 ký tự')}
          <div class="form-group">
            <label for="cfg_meta_description">Mô tả trang (meta description)<span class="cfg-hint">120–160 ký tự</span></label>
            <textarea id="cfg_meta_description" class="cfg-input cfg-textarea" rows="3" placeholder="Mô tả ngắn về trang web...">${escapeHtml(s.meta_description || '')}</textarea>
          </div>
          ${field('meta_keywords', 'Từ khoá (keywords)', s.meta_keywords, 'netflix, mua netflix, giá rẻ')}
          ${field('hero_title', 'Tiêu đề Hero (trang chủ)', s.hero_title, 'Netflix Premium')}
          ${field('hero_subtitle', 'Mô tả Hero', s.hero_subtitle, 'Xem phim không giới hạn...')}`,
    'btnSaveSeo', 'Lưu SEO', 'seoResult')}
        </div>

        <div class="cfg-subpanel" data-cfg-panel="payment" role="tabpanel">
          ${card(
    'Thông tin thanh toán',
    'Hiển thị trên trang thanh toán khi khách chuyển khoản.',
    `<div class="cfg-grid-2">
            ${field('bank_name', 'Tên ngân hàng', s.bank_name, 'MB Bank')}
            ${field('bank_account', 'Số tài khoản', s.bank_account, '321336')}
            ${field('bank_owner', 'Chủ tài khoản', s.bank_owner, 'PHAM VAN VIET')}
          </div>`,
    'btnSaveBank', 'Lưu thanh toán', 'bankResult')}
        </div>

        <div class="cfg-subpanel" data-cfg-panel="integrations" role="tabpanel">
          ${card(
    'Telegram Bot',
    'Thông báo đơn mới, kho, health check. Bot tạo tại @BotFather.',
    `<div class="cfg-grid-2">
            ${field('telegram_bot_token', 'Bot Token', s.telegram_bot_token || '', '123456789:ABC...')}
            ${field('telegram_chat_id', 'Chat ID', s.telegram_chat_id || '', '-100123456789')}
          </div>
          <div class="cfg-tip">Chat ID: nhắn cho bot, mở <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code></div>`,
    'btnSaveTelegram', 'Lưu Telegram', 'telegramResult')}
          ${card(
    'Email (Resend)',
    'Xác nhận đơn, nhắc gia hạn. Đăng ký tại resend.com',
    `<div class="cfg-grid-2">
            ${field('resend_api_key', 'Resend API Key', s.resend_api_key || '', 're_xxxxxxxx')}
            ${field('email_from', 'Email gửi đi', s.email_from || '', 'noreply@yourdomain.com')}
          </div>`,
    'btnSaveEmail', 'Lưu email', 'emailResult')}
        </div>

        <div class="cfg-subpanel" data-cfg-panel="presence" role="tabpanel">
          ${card(
    'Liên hệ & hỗ trợ',
    'Link hiển thị cho khách.',
    `<div class="cfg-grid-2">
            ${field('contact_telegram', 'Telegram', s.contact_telegram, 'https://t.me/username')}
            ${field('contact_zalo', 'Zalo', s.contact_zalo, '0336636315')}
          </div>`,
    'btnSaveContact', 'Lưu liên hệ', 'contactResult')}
          ${card(
    'Mạng xã hội',
    'Footer — để trống nếu không dùng.',
    `<div class="cfg-grid-2">
            ${field('social_facebook', 'Facebook', s.social_facebook, 'https://facebook.com/yourpage')}
            ${field('social_youtube', 'YouTube', s.social_youtube, 'https://youtube.com/channel/...')}
            ${field('social_tiktok', 'TikTok', s.social_tiktok, 'https://tiktok.com/@yourpage')}
          </div>`,
    'btnSaveSocial', 'Lưu mạng xã hội', 'socialResult')}
          ${card(
    'Footer',
    'Dòng copyright cuối trang.',
    field('footer_text', 'Nội dung copyright',
      s.footer_text,
      `© ${new Date().getFullYear()} Netflix Store. All rights reserved.`,
      'Để trống = tự động theo năm'),
    'btnSaveFooter', 'Lưu footer', 'footerResult')}
        </div>
      </div>
    </div>
  `

  panel.querySelectorAll('.cfg-subnav__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.cfgTab
      panel.querySelectorAll('.cfg-subnav__btn').forEach(b => {
        b.classList.toggle('active', b === btn)
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false')
      })
      panel.querySelectorAll('.cfg-subpanel').forEach(p => {
        p.classList.toggle('active', p.dataset.cfgPanel === tab)
      })
    })
  })

  async function saveCfg(keys, resultId, btnId) {
    const resEl = panel.querySelector(`#${resultId}`)
    const btn = btnId ? panel.querySelector(`#${btnId}`) : null
    const label = btn ? btn.textContent : ''
    const obj = {}
    keys.forEach(k => {
      const el = panel.querySelector(`#cfg_${k}`)
      if (el) obj[k] = el.tagName === 'TEXTAREA' ? el.value.trim() : el.value.trim()
    })
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Đang lưu…'
    }
    resEl.innerHTML = ''
    try {
      await adminPatchSettings(obj)
      resEl.innerHTML = '<span class="text-success" style="font-weight:600;">Đã lưu.</span>'
      window.__siteSettings = { ...(window.__siteSettings || {}), ...obj }
      if (obj.site_title) document.title = obj.site_title
      window.dispatchEvent(new Event('siteSettingsLoaded'))
      setTimeout(() => { resEl.innerHTML = '' }, 3200)
    } catch (err) {
      resEl.innerHTML = `<span class="text-danger">${escapeHtml(err.message)}</span>`
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = label
      }
    }
  }

  panel.querySelector('#btnSaveSeo')?.addEventListener('click', () =>
    saveCfg(['site_name', 'site_title', 'meta_description', 'meta_keywords', 'hero_title', 'hero_subtitle'], 'seoResult', 'btnSaveSeo'))
  panel.querySelector('#btnSaveBank')?.addEventListener('click', () =>
    saveCfg(['bank_name', 'bank_account', 'bank_owner'], 'bankResult', 'btnSaveBank'))
  panel.querySelector('#btnSaveTelegram')?.addEventListener('click', () =>
    saveCfg(['telegram_bot_token', 'telegram_chat_id'], 'telegramResult', 'btnSaveTelegram'))
  panel.querySelector('#btnSaveEmail')?.addEventListener('click', () =>
    saveCfg(['resend_api_key', 'email_from'], 'emailResult', 'btnSaveEmail'))
  panel.querySelector('#btnSaveContact')?.addEventListener('click', () =>
    saveCfg(['contact_telegram', 'contact_zalo'], 'contactResult', 'btnSaveContact'))
  panel.querySelector('#btnSaveSocial')?.addEventListener('click', () =>
    saveCfg(['social_facebook', 'social_youtube', 'social_tiktok'], 'socialResult', 'btnSaveSocial'))
  panel.querySelector('#btnSaveFooter')?.addEventListener('click', () =>
    saveCfg(['footer_text'], 'footerResult', 'btnSaveFooter'))
}
