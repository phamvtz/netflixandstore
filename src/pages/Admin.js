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
  adminConfirmPayment,
  adminConfirmServiceOrder, adminDeliverFromStock, adminGetAvailableStock
} from '../utils/api.js'
import { formatVND, formatDate, statusLabel, statusClass, planLabel, daysLeft } from '../utils/format.js'
import { SERVICES } from '../utils/services.js'
import { parseCatalogConfig } from '../utils/catalog.js'
import { showConfirm } from '../utils/confirm.js'
import { renderAdminGuides } from './AdminGuides.js'
import { getUser } from '../utils/auth.js'

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
// Alias dùng trong renderOtherProducts
const esc = escapeHtml

// ── Nav config ──────────────────────────────────────────────
const ADMIN_GROUPS = [
  {
    label: 'Tổng quan',
    items: [
      { tab:'stats', label:'Dashboard', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
    ]
  },
  {
    label: 'Netflix',
    items: [
      { tab:'orders',   label:'Đơn hàng',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
      { tab:'payments', label:'Thanh toán',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' },
      { tab:'accounts', label:'Kho tài khoản', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>' },
    ]
  },
  {
    label: 'Sản phẩm',
    items: [
      { tab:'products', label:'Sản phẩm khác', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' },
      { tab:'plans',    label:'Gói dịch vụ',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' },
    ]
  },
  {
    label: 'Hệ thống',
    items: [
      { tab:'users',    label:'Người dùng',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
      { tab:'guides',   label:'Hướng dẫn',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>' },
      { tab:'settings', label:'Cài đặt',       icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>' },
    ]
  }
]
// Flat list for compatibility
const ADMIN_NAV = ADMIN_GROUPS.flatMap(g => g.items)

export async function renderAdmin(container) {
  const s   = window.__siteSettings || {}
  const siteName = s.site_name || 'Netflix Store'
  const user = getUser()

  // Ẩn navbar + footer → admin chiếm toàn màn hình
  const _navbar = document.getElementById('navbar')
  const _footer = document.getElementById('footer')
  if (_navbar) _navbar.style.display = 'none'
  if (_footer) _footer.style.display = 'none'
  document.body.classList.add('admin-mode')

  container.innerHTML = `
    <div class="adm-shell">

      <!-- ═══ SIDEBAR ═══ -->
      <aside class="adm-sb">
        <!-- Logo -->
        <div class="adm-sb-top">
          <div class="adm-sb-logo-wrap">
            <div class="adm-sb-logo-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
              </svg>
            </div>
            <div>
              <div class="adm-sb-site-name">${siteName}</div>
              <div class="adm-sb-badge">Admin</div>
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="adm-sb-nav" role="tablist">
          ${ADMIN_GROUPS.map(group => `
            <div class="adm-sb-group">
              <p class="adm-sb-group-label">${group.label}</p>
              ${group.items.map(item => `
                <button type="button"
                  class="adm-sb-item${item === ADMIN_GROUPS[0].items[0] ? ' active' : ''}"
                  data-tab="${item.tab}" role="tab">
                  <span class="adm-sb-item-icon">${item.icon}</span>
                  <span class="adm-sb-item-label">${item.label}</span>
                </button>
              `).join('')}
            </div>
          `).join('')}
        </nav>

        <!-- Footer -->
        <div class="adm-sb-bottom">
          <div class="adm-sb-user">
            <div class="adm-sb-avatar">${(user?.email || 'A')[0].toUpperCase()}</div>
            <div class="adm-sb-user-info">
              <div class="adm-sb-user-email">${user?.email || 'Admin'}</div>
              <div class="adm-sb-user-role">● Quyền admin</div>
            </div>
          </div>
          <a href="#/" class="adm-sb-exit" title="Về trang chủ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </a>
        </div>
      </aside>

      <!-- ═══ MAIN ═══ -->
      <div class="adm-main">

        <!-- Top bar -->
        <header class="adm-topbar">
          <div class="adm-topbar-left">
            <span class="adm-topbar-section" id="adm-breadcrumb-section">Tổng quan</span>
            <span class="adm-topbar-sep">›</span>
            <span class="adm-topbar-page" id="adminPageTitle">Dashboard</span>
          </div>
          <div class="adm-topbar-right">
            <span class="adm-status-dot"></span>
            <span style="font-size:12px;color:#64748b;font-weight:600;">Hệ thống hoạt động</span>
          </div>
        </header>

        <!-- Content -->
        <div class="adm-content">
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
            <div class="admin-panel admin-panel-surface" id="adminProducts">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div class="admin-panel admin-panel-surface" id="adminGuides">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div class="admin-panel admin-panel-surface" id="adminSettings">
              <div class="loading"><div class="spinner"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  const tabs = container.querySelectorAll('.adm-sb-item')
  const pageTitle = container.querySelector('#adminPageTitle')
  const breadcrumbSection = container.querySelector('#adm-breadcrumb-section')
  const panels = {
    stats:    container.querySelector('#adminStats'),
    orders:   container.querySelector('#adminOrders'),
    payments: container.querySelector('#adminPayments'),
    accounts: container.querySelector('#adminAccounts'),
    users:    container.querySelector('#adminUsers'),
    plans:    container.querySelector('#adminPlans'),
    products: container.querySelector('#adminProducts'),
    guides:   container.querySelector('#adminGuides'),
    settings: container.querySelector('#adminSettings'),
  }
  const loaded = { stats: false, orders: false, payments: false, accounts: false, users: false, plans: false, products: false, guides: false, settings: false }

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
      if (name === 'products') { await renderOtherProducts(panels.products) }
      if (name === 'guides') { const d = await adminGetSettings(); renderAdminGuides(panels.guides, d) }
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
      // Update breadcrumb + title
      const navItem = ADMIN_NAV.find(n => n.tab === name)
      if (navItem && pageTitle) pageTitle.textContent = navItem.label
      if (navItem && breadcrumbSection) {
        const group = ADMIN_GROUPS.find(g => g.items.some(i => i.tab === name))
        if (group) breadcrumbSection.textContent = group.label
      }
      await loadTab(name)
    })
  })

  // Load tab thống kê mặc định
  await loadTab('stats')

  return () => {
    container.removeEventListener('click', onAdminRetryClick)
    // Restore navbar & footer khi rời admin
    const nb = document.getElementById('navbar')
    const ft = document.getElementById('footer')
    if (nb) nb.style.display = ''
    if (ft) ft.style.display = ''
    document.body.classList.remove('admin-mode')
  }
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
          <h3 class="admin-section-title">Kho (Netflix + Sản phẩm)</h3>
          <div class="admin-inventory-card">
            ${invRow('Sẵn sàng (Netflix)', inv.netflix_available ?? inv.available ?? 0, 'ok')}
            ${invRow('Sẵn sàng (Sản phẩm)', inv.stock_available ?? 0, 'ok')}
            ${invRow('Đầy slot', inv.full || 0, 'info')}
            ${invRow('Đã chết / Hết', inv.dead || 0, 'bad')}
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
            <button type="button" class="admin-quick__btn" id="btnCancelPending">
              <span class="admin-quick__btn-icon">🗑️</span>
              <span>Hủy đơn chờ quá 30 phút</span>
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
      if (!res.ok) { resultEl.innerHTML = '<span class="text-danger">Không có quyền hoặc phiên đăng nhập hết hạn.</span>'; return }
      const d = await res.json()
      resultEl.innerHTML = `<span class="text-success">${d.message}</span>`
    } catch { resultEl.innerHTML = '<span class="text-danger">Lỗi</span>' }
  })

  panel.querySelector('#btnCancelPending')?.addEventListener('click', async () => {
    resultEl.textContent = '⏳ Đang hủy đơn chờ...'
    try {
      const res = await adminApiFetch('/api/admin/cancel-pending', { method: 'POST' })
      if (!res.ok) { resultEl.innerHTML = '<span class="text-danger">Không có quyền.</span>'; return }
      const d = await res.json()
      resultEl.innerHTML = `<span class="text-success">${d.message}</span>`
    } catch { resultEl.innerHTML = '<span class="text-danger">Lỗi kết nối</span>' }
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

  // ── Tạo shortcode từ UUID (8 ký tự đầu)
  const orderCode = id => id ? id.replace(/-/g, '').substring(0, 8).toUpperCase() : '—'

  panel.innerHTML = `
    <!-- ── Search & Filter bar ── -->
    <div class="ord-search-bar">
      <div class="ord-search-group">
        <div class="ord-search-input-wrap">
          <svg class="ord-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="searchOrderCode" class="ord-search-input" placeholder="Mã đơn (VD: A1B2C3D4)">
        </div>
        <div class="ord-search-input-wrap">
          <svg class="ord-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <input type="text" id="searchOrderEmail" class="ord-search-input" placeholder="Email khách hàng">
        </div>
        <select id="filterOrderStatus" class="ord-search-select">
          <option value="">Tất cả trạng thái</option>
          <option value="pending">⏳ Chờ xử lý</option>
          <option value="active">✅ Đang hoạt động</option>
          <option value="expired">❌ Hết hạn</option>
          <option value="cancelled">🚫 Đã huỷ</option>
        </select>
      </div>
      <div class="ord-search-group">
        <div class="ord-date-wrap">
          <label class="ord-date-label">Từ ngày</label>
          <input type="date" id="searchDateFrom" class="ord-date-input">
        </div>
        <div class="ord-date-wrap">
          <label class="ord-date-label">Đến ngày</label>
          <input type="date" id="searchDateTo" class="ord-date-input">
        </div>
        <button class="btn btn-outline btn-sm" id="btnClearSearch">Xóa lọc</button>
      </div>
    </div>

    <!-- ── Summary chips ── -->
    <div class="ord-chips" id="ordChips">
      <span class="ord-chip ord-chip--total">Tổng: <strong>${subs.length}</strong></span>
      <span class="ord-chip ord-chip--pending">Chờ: <strong>${subs.filter(s=>s.status==='pending').length}</strong></span>
      <span class="ord-chip ord-chip--active">Active: <strong>${subs.filter(s=>s.status==='active').length}</strong></span>
      <span class="ord-chip ord-chip--expired">Hết hạn: <strong>${subs.filter(s=>s.status==='expired').length}</strong></span>
      <span class="ord-result-count" id="ordResultCount"></span>
    </div>

    <!-- ── Table ── -->
    <div class="admin-table-wrap"><div class="table-responsive">
      <table class="data-table" id="ordersTable">
        <thead>
          <tr>
            <th>Mã đơn</th>
            <th>Email khách</th>
            <th>Gói</th>
            <th>Trạng thái</th>
            <th>Ngày tạo</th>
            <th>Hết hạn</th>
            <th>Còn lại</th>
            <th>Giá trị</th>
            <th>Login Link</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody id="ordersBody">
          ${subs.map(sub => {
            const plan = sub.plans || {}
            const days = daysLeft(sub.end_at)
            const code = orderCode(sub.id)
            const price = plan.price ? formatVND(plan.price) : '—'
            const createdAt = sub.created_at ? sub.created_at.substring(0, 10) : ''
            return `<tr data-status="${sub.status}" data-id="${sub.id}"
                data-code="${code.toLowerCase()}"
                data-email="${(sub.user_email || '').toLowerCase()}"
                data-created="${createdAt}">
              <td><code class="ord-code">${code}</code></td>
              <td class="ord-email">${sub.user_email || '—'}</td>
              <td>${plan.name || planLabel(sub.plan)}</td>
              <td><span class="status-badge ${statusClass(sub.status)}">${statusLabel(sub.status)}</span></td>
              <td>${formatDate(sub.created_at)}</td>
              <td>${formatDate(sub.end_at)}</td>
              <td class="${days !== null && days <= 3 ? 'text-danger' : ''}">${days !== null ? days + ' ngày' : '—'}</td>
              <td class="ord-price">${price}</td>
              <td>
                <div class="admin-link-cell">
                  <input type="text" class="admin-link-input" value="${sub.login_link || ''}"
                         placeholder="Nhập link..." data-sub-id="${sub.id}">
                  <button class="btn btn-sm btn-primary save-link-btn" data-sub-id="${sub.id}">💾</button>
                </div>
              </td>
              <td>
                <div class="admin-actions">
                  ${sub.status === 'pending' ? `<button class="btn btn-sm btn-success activate-btn" data-sub-id="${sub.id}" data-plan="${sub.plan}">✅ Kích hoạt</button>` : ''}
                  ${sub.status === 'active'  ? `<button class="btn btn-sm btn-danger expire-btn" data-sub-id="${sub.id}">❌ Hết hạn</button>` : ''}
                </div>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div></div>

    <!-- No results -->
    <div id="ordNoResult" style="display:none;text-align:center;padding:40px;color:var(--text-muted);">
      <div style="font-size:40px;margin-bottom:12px;">🔍</div>
      <p style="font-size:14px;">Không tìm thấy đơn hàng nào khớp với điều kiện lọc.</p>
      <button class="btn btn-outline btn-sm" id="btnClearSearch2" style="margin-top:12px;">Xóa bộ lọc</button>
    </div>
  `

  // ── Search & filter logic ──────────────────────────────────
  const rows        = () => [...panel.querySelectorAll('#ordersBody tr')]
  const inCode      = () => panel.querySelector('#searchOrderCode')
  const inEmail     = () => panel.querySelector('#searchOrderEmail')
  const selStatus   = () => panel.querySelector('#filterOrderStatus')
  const inDateFrom  = () => panel.querySelector('#searchDateFrom')
  const inDateTo    = () => panel.querySelector('#searchDateTo')
  const resultCount = panel.querySelector('#ordResultCount')
  const noResult    = panel.querySelector('#ordNoResult')

  function applySearch() {
    const code   = (inCode()?.value   || '').trim().toLowerCase()
    const email  = (inEmail()?.value  || '').trim().toLowerCase()
    const status = selStatus()?.value || ''
    const from   = inDateFrom()?.value || ''
    const to     = inDateTo()?.value   || ''

    let visible = 0
    rows().forEach(row => {
      const matchCode   = !code   || row.dataset.code.includes(code)
      const matchEmail  = !email  || row.dataset.email.includes(email)
      const matchStatus = !status || row.dataset.status === status
      const created     = row.dataset.created || ''
      const matchFrom   = !from || created >= from
      const matchTo     = !to   || created <= to
      const show = matchCode && matchEmail && matchStatus && matchFrom && matchTo
      row.style.display = show ? '' : 'none'
      if (show) visible++
    })

    const hasFilter = code || email || status || from || to
    if (resultCount) {
      resultCount.textContent = hasFilter ? `Kết quả: ${visible} đơn` : ''
      resultCount.style.display = hasFilter ? '' : 'none'
    }
    if (noResult) noResult.style.display = visible === 0 ? 'block' : 'none'
  }

  // Bind search inputs
  ;['#searchOrderCode','#searchOrderEmail','#filterOrderStatus','#searchDateFrom','#searchDateTo']
    .forEach(sel => panel.querySelector(sel)?.addEventListener('input', applySearch))
  panel.querySelector('#filterOrderStatus')?.addEventListener('change', applySearch)

  const clearSearch = () => {
    ;['#searchOrderCode','#searchOrderEmail','#searchDateFrom','#searchDateTo']
      .forEach(sel => { const el = panel.querySelector(sel); if(el) el.value='' })
    const st = panel.querySelector('#filterOrderStatus')
    if(st) st.value = ''
    applySearch()
  }
  panel.querySelector('#btnClearSearch')?.addEventListener('click', clearSearch)
  panel.querySelector('#btnClearSearch2')?.addEventListener('click', clearSearch)

  // ── Action handlers ───────────────────────────────────────
  panel.querySelectorAll('.activate-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '⏳'
      try {
        await adminActivateSubscription(btn.dataset.subId, btn.dataset.plan)
        const row = panel.querySelector(`tr[data-id="${btn.dataset.subId}"]`)
        if (row) {
          row.querySelector('.status-badge').textContent = '✅ Hoạt động'
          row.querySelector('.status-badge').className   = 'status-badge status-active'
          row.dataset.status = 'active'
          btn.closest('.admin-actions').innerHTML =
            `<button class="btn btn-sm btn-danger expire-btn" data-sub-id="${btn.dataset.subId}">❌ Hết hạn</button>`
          attachExpireBtn(panel, row.querySelector('.expire-btn'))
        }
        applySearch()
      } catch (err) { window.showToast?.('Lỗi: ' + err.message, 'error'); btn.disabled = false; btn.textContent = '✅ Kích hoạt' }
    })
  })

  panel.querySelectorAll('.expire-btn').forEach(b => attachExpireBtn(panel, b))

  panel.querySelectorAll('.save-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = panel.querySelector(`.admin-link-input[data-sub-id="${btn.dataset.subId}"]`)
      if (!input) return
      btn.disabled = true; btn.textContent = '⏳'
      try {
        await adminSetLoginLink(btn.dataset.subId, input.value.trim())
        btn.textContent = '✅'
        setTimeout(() => { btn.textContent = '💾'; btn.disabled = false }, 1500)
      } catch (err) { window.showToast?.('Lỗi: ' + err.message, 'error'); btn.textContent = '💾'; btn.disabled = false }
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
            <button class="btn btn-sm btn-success assign-combined-btn" data-user-id="${p.id}" data-email="${p.email}">📦 Gán gói + TK</button>
            <button class="btn btn-sm btn-primary view-user-btn" data-user-id="${p.id}" data-email="${p.email}">👁️</button>
            <button class="btn btn-sm btn-danger delete-user-btn" data-user-id="${p.id}" data-email="${p.email}">🗑️</button>
          </div>
        </td>
      </tr>
    `
  })

  html += '</tbody></table></div></div>'

  // ===== MODAL GỘP: GÁN GÓI + GÁN TK =====
  html += `
    <div class="user-modal-overlay" id="assignCombinedModal" style="display:none;">
      <div class="user-modal" style="max-width:640px;">
        <div class="user-modal-header">
          <h2 id="assignCombinedTitle">📦 Gán gói + Tài khoản</h2>
          <button class="btn btn-sm btn-outline close-assign-combined">✕</button>
        </div>
        <div class="user-modal-body">
          <input type="hidden" id="assignCombinedUserId">

          <div class="form-group">
            <label>👤 Khách hàng</label>
            <input type="text" id="assignCombinedEmail" readonly class="form-readonly">
          </div>

          <!-- STEP 1: Chọn gói -->
          <div class="assign-step">
            <div class="assign-step-label">Bước 1 — Chọn gói dịch vụ <span class="assign-req">*</span></div>
            <select id="assignCombinedPlan" required>
              <option value="">-- Đang tải gói... --</option>
            </select>
            <div id="assignCombinedPlanInfo" style="font-size:12px;color:var(--text-muted);margin-top:4px;"></div>
          </div>

          <!-- STEP 2: Gán tài khoản (tuỳ chọn) -->
          <div class="assign-step">
            <div class="assign-step-label">Bước 2 — Gán tài khoản từ kho <span style="color:var(--text-muted);font-size:12px;">(tuỳ chọn)</span></div>

            <div class="assign-acc-modes" style="margin-bottom:var(--sp-3);">
              <button type="button" class="assign-mode-btn active" data-mode="pool">🗄 Chọn từ kho</button>
              <button type="button" class="assign-mode-btn" data-mode="manual">✏️ Nhập thủ công</button>
              <button type="button" class="assign-mode-btn" data-mode="none">⏭ Bỏ qua</button>
            </div>

            <!-- Pool -->
            <div id="assignCombinedModePool">
              <div style="display:flex;gap:8px;margin-bottom:var(--sp-2);">
                <select id="assignCombinedPoolFilter" class="admin-filter" style="flex:1;">
                  <option value="">Tất cả (còn slot)</option>
                  <option value="shared">👥 Dùng chung</option>
                  <option value="private">👤 Dùng riêng</option>
                </select>
                <button class="btn btn-sm btn-outline" id="btnRefreshCombinedPool">🔄</button>
              </div>
              <div id="assignCombinedPoolList" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-lg);">
                <div style="padding:16px;text-align:center;color:var(--text-muted);">⏳ Đang tải...</div>
              </div>
              <div id="assignCombinedPoolSelected" style="display:none;margin-top:var(--sp-2);padding:8px 12px;background:var(--primary-muted);border:1px solid var(--primary-ring);border-radius:var(--r-lg);font-size:13px;"></div>
            </div>

            <!-- Manual -->
            <div id="assignCombinedModeManual" style="display:none;">
              <textarea id="assignCombinedManualVal" rows="3" class="acc-textarea"
                placeholder="email:pass:cookie  HOẶC  link nftoken  HOẶC  bỏ trống để gán sau"></textarea>
            </div>

            <!-- None -->
            <div id="assignCombinedModeNone" style="display:none;">
              <div style="padding:10px 12px;background:var(--bg-muted);border-radius:var(--r-lg);font-size:13px;color:var(--text-secondary);">
                Gói sẽ được kích hoạt nhưng chưa có tài khoản — gán sau khi có hàng.
              </div>
            </div>
          </div>

          <div id="assignCombinedError" class="form-error" style="margin-top:var(--sp-3);"></div>
          <div id="assignCombinedSuccess" class="form-success" style="margin-top:var(--sp-3);"></div>
          <button class="btn btn-primary btn-block" id="assignCombinedSubmit" style="margin-top:var(--sp-4);">
            ✅ Gán gói + Kích hoạt
          </button>
        </div>
      </div>
    </div>
  `

  // ===== ASSIGN ACCOUNT MODAL (viết lại — chọn từ kho hoặc nhập tay) =====
  html += `
    <div class="user-modal-overlay" id="assignAccModal" style="display:none;">
      <div class="user-modal" style="max-width:620px;">
        <div class="user-modal-header">
          <h2 id="assignAccTitle">🔗 Gán tài khoản</h2>
          <button class="btn btn-sm btn-outline close-assign-acc">✕</button>
        </div>
        <div class="user-modal-body">

          <!-- Step 1: Chọn subscription -->
          <div class="form-group">
            <label>👤 Khách hàng</label>
            <input type="text" id="assignAccEmail" readonly class="form-readonly">
          </div>
          <div class="form-group">
            <label>📦 Đăng ký cần gán tài khoản</label>
            <select id="assignAccSubSelect">
              <option value="">-- Đang tải... --</option>
            </select>
            <small id="assignAccSubInfo" style="color:var(--text-muted);font-size:12px;margin-top:4px;display:block;"></small>
          </div>

          <!-- Mode toggle -->
          <div class="assign-acc-modes">
            <button type="button" class="assign-mode-btn active" data-mode="pool">🗄 Chọn từ kho</button>
            <button type="button" class="assign-mode-btn" data-mode="manual">✏️ Nhập thủ công</button>
          </div>

          <!-- MODE A: Chọn từ kho -->
          <div id="assignModePool">
            <div class="form-group">
              <label>Lọc kho theo loại</label>
              <div style="display:flex;gap:8px;">
                <select id="assignPoolFilter" class="admin-filter" style="flex:1;">
                  <option value="">Tất cả (shared + available)</option>
                  <option value="shared">👥 Dùng chung còn slot</option>
                  <option value="private">👤 Dùng riêng</option>
                </select>
                <button class="btn btn-sm btn-outline" id="btnRefreshPool">🔄</button>
              </div>
            </div>
            <div id="assignPoolList" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-lg);">
              <div style="padding:20px;text-align:center;color:var(--text-muted);">⏳ Đang tải kho...</div>
            </div>
            <div id="assignPoolSelected" style="display:none;margin-top:var(--sp-3);padding:10px 12px;background:var(--primary-muted);border:1px solid var(--primary-ring);border-radius:var(--r-lg);font-size:13px;"></div>
          </div>

          <!-- MODE B: Nhập thủ công -->
          <div id="assignModeManual" style="display:none;">
            <div class="form-group">
              <label>Nội dung gán (email:pass:cookie hoặc link nftoken)</label>
              <textarea id="assignAccManualValue" rows="4" class="acc-textarea"
                placeholder="email@gmail.com:password:NetflixId=xxx;SecureNetflixId=xxx...&#10;hoặc: https://netflix.com/?nftoken=..."></textarea>
              <small style="color:var(--text-muted);font-size:12px;">Hỗ trợ: email:pass:cookie · chỉ cookie · link nftoken</small>
            </div>
          </div>

          <div id="assignAccError" class="form-error" style="margin-top:var(--sp-3);"></div>
          <div id="assignAccSuccess" class="form-success" style="margin-top:var(--sp-3);"></div>
          <button class="btn btn-primary btn-block" id="assignAccSubmit" style="margin-top:var(--sp-4);">
            💾 Gán tài khoản
          </button>
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

  // ============ MODAL GỘP: GÁN GÓI + TK ============
  const combinedModal   = panel.querySelector('#assignCombinedModal')
  const combinedPlanSel = panel.querySelector('#assignCombinedPlan')
  const combinedSubmit  = panel.querySelector('#assignCombinedSubmit')
  let combinedUserId    = null
  let combinedMode      = 'pool'   // 'pool' | 'manual' | 'none'
  let combinedPoolSel   = null     // { id, value }
  let combinedPlansCache= null

  panel.querySelector('.close-assign-combined')?.addEventListener('click', () => { combinedModal.style.display = 'none' })
  combinedModal?.addEventListener('click', e => { if (e.target === combinedModal) combinedModal.style.display = 'none' })

  // Mode toggle
  panel.querySelectorAll('[data-mode]').forEach(btn => {
    if (!btn.closest('#assignCombinedModal')) return
    btn.addEventListener('click', () => {
      panel.querySelectorAll('#assignCombinedModal .assign-mode-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      combinedMode = btn.dataset.mode
      panel.querySelector('#assignCombinedModePool').style.display   = combinedMode === 'pool'   ? '' : 'none'
      panel.querySelector('#assignCombinedModeManual').style.display = combinedMode === 'manual' ? '' : 'none'
      panel.querySelector('#assignCombinedModeNone').style.display   = combinedMode === 'none'   ? '' : 'none'
    })
  })

  // Plan select → show info
  combinedPlanSel?.addEventListener('change', () => {
    const plan = (combinedPlansCache || []).find(p => p.id === combinedPlanSel.value)
    const infoEl = panel.querySelector('#assignCombinedPlanInfo')
    if (infoEl) infoEl.textContent = plan ? `${formatVND(plan.price)} · ${plan.duration_days} ngày · ${plan.service || 'netflix'}` : ''
  })

  // Load pool for combined modal
  async function loadCombinedPool() {
    const listEl   = panel.querySelector('#assignCombinedPoolList')
    const filterEl = panel.querySelector('#assignCombinedPoolFilter')
    if (!listEl) return
    listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);">⏳ Đang tải...</div>'
    try {
      const allAccs  = await adminGetAllAccounts()
      const filterVal= filterEl?.value || ''
      const filtered = allAccs.filter(r => {
        if (r.status === 'dead') return false
        const slots = r.max_slots || 5, used = r.assigned_count || 0
        if (filterVal === 'shared')  return r.status === 'available' && (!r.account_type || r.account_type === 'shared') && used < slots
        if (filterVal === 'private') return r.account_type === 'private'
        return r.status === 'available' && used < slots
      })
      if (!filtered.length) {
        listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);">Kho trống.</div>'; return
      }
      listEl.innerHTML = filtered.map(r => {
        const raw = r.value || ''
        let email = '—', preview = raw.length > 70 ? raw.substring(0,70)+'…' : raw
        if (raw.includes('@')) { const fc = raw.indexOf(':'); email = fc > -1 ? raw.substring(0, fc) : raw }
        const used = r.assigned_count || 0, slots = r.max_slots || 5
        const type = r.account_type === 'private' ? '👤' : '👥'
        return `<div class="pool-item" data-id="${r.id}" data-value="${escapeAttr(raw)}">
          <div class="pool-item-top">
            <span class="pool-item-email">${type} ${escapeHtml(email)}</span>
            <span class="pool-item-slots">${used}/${slots}</span>
          </div>
          <div class="pool-item-preview">${escapeHtml(preview)}</div>
        </div>`
      }).join('')
      listEl.querySelectorAll('.pool-item').forEach(item => {
        item.addEventListener('click', () => {
          listEl.querySelectorAll('.pool-item').forEach(i => i.classList.remove('selected'))
          item.classList.add('selected')
          combinedPoolSel = { id: item.dataset.id, value: item.dataset.value }
          const selEl = panel.querySelector('#assignCombinedPoolSelected')
          if (selEl) { selEl.style.display='block'; selEl.innerHTML = `✅ Đã chọn: <strong>${escapeHtml(item.querySelector('.pool-item-email').textContent)}</strong>` }
        })
      })
    } catch (err) {
      listEl.innerHTML = `<div style="padding:14px;color:var(--danger);">❌ ${err.message}</div>`
    }
  }

  panel.querySelector('#assignCombinedPoolFilter')?.addEventListener('change', loadCombinedPool)
  panel.querySelector('#btnRefreshCombinedPool')?.addEventListener('click', loadCombinedPool)

  // Open modal
  panel.querySelectorAll('.assign-combined-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId, email = btn.dataset.email
      combinedUserId  = userId
      combinedPoolSel = null
      combinedMode    = 'pool'

      panel.querySelector('#assignCombinedUserId').value = userId
      panel.querySelector('#assignCombinedEmail').value  = email
      panel.querySelector('#assignCombinedTitle').textContent = `📦 Gán gói + TK → ${email}`
      panel.querySelector('#assignCombinedError').textContent   = ''
      panel.querySelector('#assignCombinedSuccess').textContent = ''
      panel.querySelector('#assignCombinedManualVal').value     = ''
      panel.querySelector('#assignCombinedPoolSelected').style.display = 'none'
      // Reset mode to pool
      panel.querySelectorAll('#assignCombinedModal .assign-mode-btn').forEach((b,i) => b.classList.toggle('active', i===0))
      panel.querySelector('#assignCombinedModePool').style.display   = ''
      panel.querySelector('#assignCombinedModeManual').style.display = 'none'
      panel.querySelector('#assignCombinedModeNone').style.display   = 'none'

      combinedModal.style.display = 'flex'

      // Load plans
      if (!combinedPlansCache) {
        combinedPlanSel.innerHTML = '<option value="">⏳ Đang tải...</option>'
        try { combinedPlansCache = await getPlans() } catch { combinedPlansCache = [] }
      }
      combinedPlanSel.innerHTML = '<option value="">-- Chọn gói --</option>'
      combinedPlansCache.forEach(p => {
        combinedPlanSel.innerHTML += `<option value="${p.id}">${p.name} — ${formatVND(p.price)} (${p.duration_days} ngày)</option>`
      })
      panel.querySelector('#assignCombinedPlanInfo').textContent = ''

      // Load pool
      loadCombinedPool()
    })
  })

  // Submit
  combinedSubmit?.addEventListener('click', async () => {
    const userId = combinedUserId
    const planId = combinedPlanSel.value
    const errEl  = panel.querySelector('#assignCombinedError')
    const sucEl  = panel.querySelector('#assignCombinedSuccess')
    errEl.textContent = ''; sucEl.textContent = ''

    if (!planId) { errEl.textContent = 'Vui lòng chọn gói.'; return }

    // Xác định tài khoản gán kèm
    let accountValue = null
    let resourceId   = null

    if (combinedMode === 'pool') {
      // Có thể không chọn → bỏ qua
      if (combinedPoolSel) { accountValue = combinedPoolSel.value; resourceId = combinedPoolSel.id }
    } else if (combinedMode === 'manual') {
      accountValue = panel.querySelector('#assignCombinedManualVal').value.trim() || null
    }
    // mode 'none' → accountValue stays null

    combinedSubmit.disabled = true
    combinedSubmit.textContent = '⏳ Đang xử lý...'
    try {
      // Bước 1: Gán gói + tạo subscription (kích hoạt luôn)
      const sub = await adminAssignPlan(userId, planId, accountValue || null)

      // Bước 2: Nếu chọn từ kho → cập nhật assigned_count của resource
      if (resourceId) {
        try { await adminAssignAccountFromPool(resourceId, sub.id) }
        catch (e) { console.warn('[AssignPool]', e.message) }
      }

      const hasAcc = accountValue ? '+ tài khoản đã gán' : '(chưa có tài khoản)'
      sucEl.innerHTML = `✅ Gán gói thành công! ${hasAcc}<br><small style="color:var(--text-muted)">Sub: ${sub.id.substring(0,8)}…</small>`
      combinedPlanSel.value = ''; combinedPoolSel = null
      panel.querySelector('#assignCombinedPoolSelected').style.display = 'none'
      panel.querySelector('#assignCombinedPoolList').querySelectorAll('.pool-item').forEach(i=>i.classList.remove('selected'))
      panel.querySelector('#assignCombinedManualVal').value = ''
      await loadCombinedPool() // reload slot counts
    } catch (err) {
      errEl.textContent = '❌ Lỗi: ' + err.message
    } finally {
      combinedSubmit.disabled = false
      combinedSubmit.textContent = '✅ Gán gói + Kích hoạt'
    }
  })

  // ============ ASSIGN ACCOUNT MODAL (viết lại) ============
  const assignAccModal    = panel.querySelector('#assignAccModal')
  const assignAccSubSel   = panel.querySelector('#assignAccSubSelect')
  const assignAccSubmit   = panel.querySelector('#assignAccSubmit')
  let selectedPoolResource= null   // resource được chọn từ kho
  let accMode             = 'pool' // 'pool' | 'manual'
  let poolCache           = []

  panel.querySelector('.close-assign-acc')?.addEventListener('click', () => { assignAccModal.style.display = 'none' })
  assignAccModal?.addEventListener('click', e => { if (e.target === assignAccModal) assignAccModal.style.display = 'none' })

  // Mode toggle
  panel.querySelectorAll('.assign-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.assign-mode-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      accMode = btn.dataset.mode
      panel.querySelector('#assignModePool').style.display   = accMode === 'pool'   ? '' : 'none'
      panel.querySelector('#assignModeManual').style.display = accMode === 'manual' ? '' : 'none'
    })
  })

  // Render pool list
  async function loadPoolList() {
    const listEl   = panel.querySelector('#assignPoolList')
    const filterEl = panel.querySelector('#assignPoolFilter')
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">⏳ Đang tải kho...</div>'

    try {
      const allAccs = await adminGetAllAccounts()
      const filterVal = filterEl?.value || ''

      // Filter: available + not dead + match account_type
      poolCache = allAccs.filter(r => {
        if (r.status === 'dead') return false
        const slots = r.max_slots || 5
        const used  = r.assigned_count || 0
        if (filterVal === 'shared')  return r.status === 'available' && (!r.account_type || r.account_type === 'shared') && used < slots
        if (filterVal === 'private') return r.account_type === 'private'
        // default: available + còn slot
        return r.status === 'available' && used < slots
      })

      if (!poolCache.length) {
        listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Kho không có tài khoản phù hợp.</div>'
        return
      }

      listEl.innerHTML = poolCache.map(r => {
        const raw = r.value || ''
        // Parse email
        let email = '—'
        let preview
        if (raw.includes('@')) {
          const fc = raw.indexOf(':')
          email = fc > -1 ? raw.substring(0, fc) : raw
          preview = raw.length > 80 ? raw.substring(0, 80) + '…' : raw
        } else {
          preview = raw.length > 80 ? raw.substring(0, 80) + '…' : raw
        }
        const used  = r.assigned_count || 0
        const slots = r.max_slots || 5
        const type  = r.account_type === 'private' ? '👤' : '👥'
        return `<div class="pool-item" data-id="${r.id}" data-value="${escapeAttr(raw)}">
          <div class="pool-item-top">
            <span class="pool-item-email">${type} ${escapeHtml(email)}</span>
            <span class="pool-item-slots">${used}/${slots} slot</span>
          </div>
          <div class="pool-item-preview">${escapeHtml(preview)}</div>
        </div>`
      }).join('')

      // Click to select
      listEl.querySelectorAll('.pool-item').forEach(item => {
        item.addEventListener('click', () => {
          listEl.querySelectorAll('.pool-item').forEach(i => i.classList.remove('selected'))
          item.classList.add('selected')
          selectedPoolResource = { id: item.dataset.id, value: item.dataset.value }
          const selEl = panel.querySelector('#assignPoolSelected')
          selEl.style.display = 'block'
          selEl.innerHTML = `✅ Đã chọn: <strong>${escapeHtml(item.querySelector('.pool-item-email').textContent)}</strong>`
        })
      })
    } catch (err) {
      listEl.innerHTML = `<div style="padding:16px;color:var(--danger);">❌ ${err.message}</div>`
    }
  }

  // Filter change
  panel.querySelector('#assignPoolFilter')?.addEventListener('change', loadPoolList)
  panel.querySelector('#btnRefreshPool')?.addEventListener('click', loadPoolList)

  // Subscription select — show current link info
  assignAccSubSel?.addEventListener('change', () => {
    // No-op for now, could show current link status
  })

  // Open modal
  panel.querySelectorAll('.assign-acc-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId
      const email  = btn.dataset.email
      selectedPoolResource  = null
      accMode               = 'pool'

      // Reset UI
      panel.querySelector('#assignAccEmail').value      = email
      panel.querySelector('#assignAccError').textContent = ''
      panel.querySelector('#assignAccSuccess').textContent = ''
      panel.querySelector('#assignAccTitle').textContent = `🔗 Gán TK → ${email}`
      panel.querySelector('#assignAccManualValue').value = ''
      panel.querySelector('#assignPoolSelected').style.display = 'none'
      panel.querySelector('#assignModePool').style.display   = ''
      panel.querySelector('#assignModeManual').style.display = 'none'
      panel.querySelectorAll('.assign-mode-btn').forEach((b,i) => b.classList.toggle('active', i===0))

      assignAccModal.style.display = 'flex'

      // Load subscriptions
      assignAccSubSel.innerHTML = '<option value="">⏳ Đang tải...</option>'
      try {
        const subs = await adminGetUserSubscriptions(userId)
        assignAccSubSel.innerHTML = '<option value="">-- Chọn subscription --</option>'
        if (!subs?.length) {
          assignAccSubSel.innerHTML += '<option value="" disabled>Không có subscription</option>'
        } else {
          subs.forEach(s => {
            const plan   = s.plans || {}
            const status = s.status === 'active' ? '🟢' : s.status === 'pending' ? '🟡' : '🔴'
            const hasLink= s.login_link ? '✅ có link' : '❌ chưa có link'
            assignAccSubSel.innerHTML += `<option value="${s.id}" data-has-link="${!!s.login_link}">
              ${status} ${plan.name || planLabel(s.plan)} — ${statusLabel(s.status)} (${hasLink})
            </option>`
          })
          // Auto-select first active/pending without link
          const best = subs.find(s => ['active','pending'].includes(s.status) && !s.login_link)
          if (best) assignAccSubSel.value = best.id
        }
      } catch (err) {
        assignAccSubSel.innerHTML = `<option value="">Lỗi: ${err.message}</option>`
      }

      // Load pool
      loadPoolList()
    })
  })

  // Submit
  assignAccSubmit?.addEventListener('click', async () => {
    const subId = assignAccSubSel.value
    const errEl = panel.querySelector('#assignAccError')
    const sucEl = panel.querySelector('#assignAccSuccess')
    errEl.textContent = ''; sucEl.textContent = ''

    if (!subId) { errEl.textContent = 'Vui lòng chọn subscription.'; return }

    let value
    let resourceId = null

    if (accMode === 'pool') {
      if (!selectedPoolResource) { errEl.textContent = 'Vui lòng chọn tài khoản từ kho.'; return }
      value      = selectedPoolResource.value
      resourceId = selectedPoolResource.id
    } else {
      value = panel.querySelector('#assignAccManualValue').value.trim()
      if (!value) { errEl.textContent = 'Vui lòng nhập nội dung tài khoản.'; return }
    }

    assignAccSubmit.disabled = true; assignAccSubmit.textContent = '⏳ Đang gán...'
    try {
      if (resourceId) {
        // Gán từ kho — cập nhật cả resource lẫn subscription
        await adminAssignAccountFromPool(resourceId, subId)
        sucEl.innerHTML = `✅ Đã gán từ kho thành công!<br><small style="color:var(--text-muted);">${escapeHtml(value.substring(0, 60))}${value.length>60?'…':''}</small>`
      } else {
        // Nhập thủ công
        await adminAssignAccount(subId, value)
        sucEl.textContent = '✅ Đã gán tài khoản thủ công!'
      }
      selectedPoolResource = null
      panel.querySelector('#assignPoolSelected').style.display = 'none'
      panel.querySelector('#assignPoolList').querySelectorAll('.pool-item').forEach(i => i.classList.remove('selected'))
      panel.querySelector('#assignAccManualValue').value = ''
      // Reload pool (cập nhật slot count)
      await loadPoolList()
    } catch (err) {
      errEl.textContent = '❌ Lỗi: ' + err.message
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
      const ok = await showConfirm('Xóa gói', `Xóa gói "${btn.dataset.id}"?\nLưu ý: không xóa được nếu còn đơn hàng dùng gói này.`, 'Xóa', 'Huỷ', 'danger')
      if (!ok) return
      btn.disabled = true; btn.textContent = '⏳'
      try {
        await adminDeletePlan(btn.dataset.id)
        btn.closest('tr').remove()
        window.showToast?.('Đã xóa gói', 'success')
      } catch (err) {
        window.showToast?.(err.message, 'error')
        btn.disabled = false; btn.textContent = '🗑️'
      }
    })
  })
}

// ============================================================
// SETTINGS / SEO
// ============================================================
// ============================================================
// OTHER PRODUCTS — Full CRUD: Dịch vụ + Sản phẩm
// ============================================================
async function renderOtherProducts(panel, activeTab) {
  activeTab = activeTab || 'service'
  panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
  let allSubs
  let allResources
  let allPlans
  let catalogSettings
  try {
    ;[allSubs, allResources, allPlans, catalogSettings] = await Promise.all([
      adminGetAllSubscriptions(),
      adminGetAllAccounts(),
      getPlans(),
      adminGetSettings().catch(() => ({}))
    ])
  } catch (err) {
    panel.innerHTML = '<div class="admin-alert admin-alert--danger">Lỗi tải: ' + err.message + '</div>'
    return
  }

  // ── Data filters ──
  const otherPlans    = allPlans.filter(p => (p.service || 'netflix') !== 'netflix')
  const otherPlanIds  = new Set(otherPlans.map(p => p.id))
  const otherSubs     = allSubs.filter(s => otherPlanIds.has(s.plan))
  const otherResources= allResources.filter(r => (r.service || 'netflix') !== 'netflix')

  const svcPlans  = otherPlans.filter(p => p.fulfillment_type !== 'stock')
  const prodPlans = otherPlans.filter(p => p.fulfillment_type === 'stock')
  const svcPlanIds  = new Set(svcPlans.map(p => p.id))
  const prodPlanIds = new Set(prodPlans.map(p => p.id))
  const svcSubs     = otherSubs.filter(s => svcPlanIds.has(s.plan))
  const prodSubs    = otherSubs.filter(s => prodPlanIds.has(s.plan))
  const prodStock   = otherResources.filter(r => r.account_type === 'stock')

  const svcPending  = svcSubs.filter(s => s.status === 'pending').length
  const prodPending = prodSubs.filter(s => s.status === 'pending').length
  const stockAvail    = prodStock.filter(r => r.status === 'available').length
  const stockAssigned = prodStock.filter(r => r.status === 'assigned').length
  const stockFull     = prodStock.filter(r => r.status === 'full').length
  const stockDead     = prodStock.filter(r => r.status === 'dead').length

  const stockStatusUi = st => {
    const m = {
      available: ['status-active', '🟢 Sẵn sàng'],
      assigned: ['status-pending', '🔵 Đã giao'],
      full: ['status-expired', '⏹ Hết slot'],
      dead: ['status-expired', '💀 Hỏng']
    }
    const x = m[st] || ['status-expired', esc(st || '—')]
    return { cls: x[0], label: x[1] }
  }

  const catalogCfg = parseCatalogConfig(catalogSettings)

  // ── Helpers ──
  const svcBadge = id => {
    let sv = SERVICES.find(s => s.id === id)
    if (!sv) {
      const c = (catalogCfg.customServices || []).find(x => x.id === id)
      sv = c ? { name: c.name || id, color: c.color || '#6366f1' } : { name: id, color: '#6366f1' }
    }
    return '<span class="op-svc-badge" style="background:' + sv.color + '22;color:' + sv.color + ';">' + escapeHtml(sv.name) + '</span>'
  }
  const planName = id => allPlans.find(p => p.id === id)?.name || id
  const planSvc  = id => allPlans.find(p => p.id === id)?.service || ''
  const fmtVND   = n => formatVND(n || 0)

  const adminSvcRows = []
  for (const s of SERVICES) {
    if (s.id !== 'netflix') adminSvcRows.push({ id: s.id, name: s.name })
  }
  for (const c of (catalogCfg.customServices || [])) {
    if (!c || !c.id) continue
    if (SERVICES.find(x => x.id === c.id)) continue
    adminSvcRows.push({ id: c.id, name: c.name || c.id })
  }
  const svcOptions = adminSvcRows.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('')
  const stockSvcOptions = '<option value="">Tất cả danh mục</option>' +
    adminSvcRows.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('')

  const hiddenCatSet = new Set(catalogCfg.hiddenServices || [])
  let catRows = ''
  for (const s of SERVICES) {
    const hid = hiddenCatSet.has(s.id)
    catRows += '<tr><td>' + svcBadge(s.id) + ' <code class="cat-slug">' + esc(s.id) + '</code></td>' +
      '<td><span class="cat-state' + (hid ? ' cat-state--off' : ' cat-state--on') + '">' + (hid ? 'Ẩn' : 'Hiện') + '</span></td>' +
      '<td><div class="admin-actions cat-shop-actions">' +
      '<button type="button" class="btn btn-sm btn-outline" disabled title="Danh mục hệ thống — chỉ ẩn/hiện trên cửa hàng">Sửa</button>' +
      '<button type="button" class="btn btn-sm ' + (hid ? 'btn-primary' : 'btn-outline') + ' cat-svc-toggle" data-svc="' + esc(s.id) + '">' +
      (hid ? 'Hiện' : 'Ẩn') + '</button></div></td></tr>'
  }
  for (const c of (catalogCfg.customServices || [])) {
    if (!c || !c.id) continue
    if (SERVICES.find(x => x.id === c.id)) continue
    const hid = hiddenCatSet.has(c.id)
    catRows += '<tr><td>' + svcBadge(c.id) + ' <code>' + esc(c.id) + '</code> <span class="cat-pill">Custom</span></td>' +
      '<td><span class="cat-state' + (hid ? ' cat-state--off' : ' cat-state--on') + '">' + (hid ? 'Ẩn' : 'Hiện') + '</span></td>' +
      '<td><div class="admin-actions cat-shop-actions">' +
      '<button type="button" class="btn btn-sm btn-outline cat-edit-custom" data-cat-id="' + esc(c.id) + '" data-cat-label="' + escapeAttr(c.name || '') + '">Sửa</button>' +
      '<button type="button" class="btn btn-sm ' + (hid ? 'btn-primary' : 'btn-outline') + ' cat-svc-toggle" data-svc="' + esc(c.id) + '">' +
      (hid ? 'Hiện' : 'Ẩn') + '</button>' +
      '<button type="button" class="btn btn-sm btn-danger cat-del-custom" data-id="' + esc(c.id) + '">Xóa</button></div></td></tr>'
  }

  const catSectionHtml = '<div class="admin-form-card op-section cat-shop-card">' +
    '<div class="op-section-header"><div><h3 class="admin-section-title" style="margin:0;">Cửa hàng — Danh mục & ẩn hiện</h3>' +
    '<p class="cat-shop-lead">Ẩn cả nhóm khỏi trang Dịch vụ / Bảng giá. Thêm danh mục tùy chỉnh (slug latin, không dấu) để gán cho gói mới.</p></div></div>' +
    '<div class="admin-table-wrap"><table class="data-table cat-shop-table"><thead><tr><th>Danh mục</th><th>Trên site</th><th>Thao tác</th></tr></thead><tbody>' +
    catRows +
    '</tbody></table></div>' +
    '<div class="cat-add-box">' +
    '<div class="op-form-grid" style="margin-top:var(--sp-4);align-items:end;">' +
    '<div class="form-group" style="margin:0;"><label class="op-label">ID danh mục (slug)</label>' +
    '<input type="text" id="customCatId" class="admin-filter" placeholder="vd: adobe_cc" autocomplete="off"></div>' +
    '<div class="form-group" style="margin:0;"><label class="op-label">Tên hiển thị</label>' +
    '<input type="text" id="customCatName" class="admin-filter" placeholder="Adobe Creative Cloud"></div>' +
    '</div>' +
    '<input type="hidden" id="customCatEditId" value="">' +
    '<div class="cat-add-actions" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:var(--sp-3);">' +
    '<button type="button" class="btn btn-success" id="btnAddCustomCat">➕ Thêm danh mục</button>' +
    '<button type="button" class="btn btn-outline" id="btnCancelCustomCatEdit" hidden>Huỷ sửa</button></div>' +
    '<p id="customCatResult" style="font-size:13px;margin-top:8px;color:var(--danger);"></p></div></div>'

  // ══════════════════════════════════════════════════════════
  // BUILD HTML
  // ══════════════════════════════════════════════════════════
  panel.innerHTML =
    // Stats row
    '<div class="op-stats">' +
    '<div class="op-stat-card" style="border-color:#6366f1;">' +
      '<div class="op-stat-num" style="color:#6366f1;">' + svcPlans.length + '</div>' +
      '<div class="op-stat-lbl">Dịch vụ</div>' +
      '<div class="op-stat-sub">' + svcPending + ' đơn chờ</div>' +
    '</div>' +
    '<div class="op-stat-card" style="border-color:#3b82f6;">' +
      '<div class="op-stat-num" style="color:#3b82f6;">' + prodPlans.length + '</div>' +
      '<div class="op-stat-lbl">Sản phẩm</div>' +
      '<div class="op-stat-sub">' + stockAvail + ' kho sẵn · ' + prodPending + ' đơn chờ</div>' +
    '</div>' +
    '<div class="op-stat-card" style="border-color:#10b981;">' +
      '<div class="op-stat-num" style="color:#10b981;">' + otherSubs.length + '</div>' +
      '<div class="op-stat-lbl">Tổng đơn</div>' +
      '<div class="op-stat-sub">' + (svcPending + prodPending) + ' chờ xử lý</div>' +
    '</div>' +
    '</div>' +

    catSectionHtml +

    // Sub-tabs
    '<div class="op-tabs">' +
    '<button class="op-tab' + (activeTab==='service'?' active':'') + '" data-tab="service">🔧 Dịch vụ' +
    (svcPending > 0 ? ' <span class="op-tab-badge">' + svcPending + '</span>' : '') + '</button>' +
    '<button class="op-tab' + (activeTab==='product'?' active':'') + '" data-tab="product">📦 Sản phẩm' +
    (prodPending > 0 ? ' <span class="op-tab-badge">' + prodPending + '</span>' : '') + '</button>' +
    '</div>' +

    // ── Dịch vụ panel ──
    '<div id="opPanelService" class="op-panel"' + (activeTab==='service'?'':' style="display:none;"') + '>' +

      // Danh mục dịch vụ
      '<div class="admin-form-card op-section">' +
      '<div class="op-section-header">' +
        '<h3 class="admin-section-title" style="margin:0;">📋 Danh mục dịch vụ</h3>' +
        '<button class="btn btn-sm btn-success" id="btnAddSvcPlan">➕ Thêm dịch vụ</button>' +
      '</div>' +

      // Add/Edit form (hidden by default)
      '<div id="svcPlanForm" class="op-inline-form" style="display:none;">' +
        '<div class="op-form-grid">' +
          '<div class="form-group" style="margin:0;"><label class="op-label">Dịch vụ</label>' +
            '<select id="sfService" class="admin-filter" style="width:100%;">' + svcOptions + '</select></div>' +
          '<div class="form-group" style="margin:0;"><label class="op-label">ID gói</label>' +
            '<input type="text" id="sfId" class="admin-filter" style="width:100%;" placeholder="yt_month"></div>' +
          '<div class="form-group" style="margin:0;"><label class="op-label">Tên gói</label>' +
            '<input type="text" id="sfName" class="admin-filter" style="width:100%;" placeholder="YouTube 1 tháng"></div>' +
          '<div class="form-group" style="margin:0;"><label class="op-label">Giá (VNĐ)</label>' +
            '<input type="number" id="sfPrice" class="admin-filter" style="width:100%;" placeholder="50000"></div>' +
          '<div class="form-group" style="margin:0;"><label class="op-label">Số ngày</label>' +
            '<input type="number" id="sfDays" class="admin-filter" style="width:100%;" placeholder="30"></div>' +
        '</div>' +
        '<div id="sfResult" style="font-size:13px;margin:8px 0;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-primary" id="sfSubmit">💾 Lưu</button>' +
          '<button class="btn btn-outline" id="sfCancel">Huỷ</button>' +
        '</div>' +
      '</div>' +

      // Plans table
      (svcPlans.length
        ? '<div class="admin-table-wrap"><div class="table-responsive"><table class="data-table"><thead><tr>' +
          '<th>Dịch vụ</th><th>ID</th><th>Tên gói</th><th>Giá</th><th>Số ngày</th><th>Đơn</th><th>Cửa hàng</th><th>Hành động</th>' +
          '</tr></thead><tbody>' +
          svcPlans.map(p => {
            const orderCount = svcSubs.filter(s => s.plan === p.id).length
            const vis = p.is_visible !== false
            return '<tr data-plan-id="' + p.id + '">' +
              '<td>' + svcBadge(p.service||'other') + '</td>' +
              '<td><code style="font-size:11px;background:var(--bg-muted);padding:2px 6px;border-radius:4px;">' + p.id + '</code></td>' +
              '<td><strong>' + escapeHtml(p.name||p.id) + '</strong></td>' +
              '<td style="color:var(--primary);font-weight:700;">' + fmtVND(p.price) + '</td>' +
              '<td>' + (p.duration_days||'—') + '</td>' +
              '<td><span style="font-weight:700;">' + orderCount + '</span></td>' +
              '<td><button type="button" class="btn btn-sm other-plan-vis" data-id="' + p.id + '" data-vis="' + (vis ? '1' : '0') + '">' + (vis ? 'Hiện' : 'Ẩn') + '</button></td>' +
              '<td><div class="admin-actions">' +
                '<button class="btn btn-sm btn-primary edit-svc-plan-btn" data-id="' + p.id + '" data-service="' + (p.service||'') + '" data-name="' + escapeAttr(p.name||'') + '" data-price="' + (p.price||0) + '" data-days="' + (p.duration_days||0) + '">✏️</button>' +
                '<button class="btn btn-sm btn-danger del-svc-plan-btn" data-id="' + p.id + '">🗑️</button>' +
              '</div></td>' +
            '</tr>'
          }).join('') +
          '</tbody></table></div></div>'
        : '<div class="op-empty">Chưa có dịch vụ nào. Nhấn <strong>Thêm dịch vụ</strong> để tạo.</div>') +
      '</div>' +

      // Đơn hàng dịch vụ
      '<div class="admin-form-card op-section">' +
      '<div class="op-section-header"><h3 class="admin-section-title" style="margin:0;">🛒 Đơn hàng dịch vụ</h3>' +
      '<div style="display:flex;gap:6px;">' +
        '<button class="btn btn-sm btn-outline svc-filter-btn active" data-filter="">Tất cả (' + svcSubs.length + ')</button>' +
        '<button class="btn btn-sm btn-outline svc-filter-btn" data-filter="pending">Chờ (' + svcPending + ')</button>' +
        '<button class="btn btn-sm btn-outline svc-filter-btn" data-filter="active">Đang làm</button>' +
        '<button class="btn btn-sm btn-outline svc-filter-btn" data-filter="expired">Xong</button>' +
      '</div></div>' +
      (svcSubs.length
        ? '<div class="admin-table-wrap"><div class="table-responsive"><table class="data-table"><thead><tr>' +
          '<th>Email khách</th><th>Dịch vụ</th><th>Gói</th><th>Trạng thái</th><th>Ngày mua</th><th>Ghi chú</th><th>Hành động</th>' +
          '</tr></thead><tbody id="svcOrderBody">' + renderSvcOrderRows(svcSubs) + '</tbody></table></div></div>'
        : '<div class="op-empty">Chưa có đơn hàng dịch vụ.</div>') +
      '</div>' +
    '</div>' +

    // ── Sản phẩm panel ──
    '<div id="opPanelProduct" class="op-panel"' + (activeTab==='product'?'':' style="display:none;"') + '>' +

      // Danh mục sản phẩm
      '<div class="admin-form-card op-section">' +
      '<div class="op-section-header">' +
        '<h3 class="admin-section-title" style="margin:0;">📋 Danh mục sản phẩm</h3>' +
        '<button class="btn btn-sm btn-success" id="btnAddProdPlan">➕ Thêm sản phẩm</button>' +
      '</div>' +

      '<div id="prodPlanForm" class="op-inline-form" style="display:none;">' +
        '<div class="op-form-grid">' +
          '<div class="form-group" style="margin:0;"><label class="op-label">Danh mục</label>' +
            '<select id="pfService" class="admin-filter" style="width:100%;">' + svcOptions + '</select></div>' +
          '<div class="form-group" style="margin:0;"><label class="op-label">ID sản phẩm</label>' +
            '<input type="text" id="pfId" class="admin-filter" style="width:100%;" placeholder="capcut_pro_1m"></div>' +
          '<div class="form-group" style="margin:0;"><label class="op-label">Tên sản phẩm</label>' +
            '<input type="text" id="pfName" class="admin-filter" style="width:100%;" placeholder="CapCut Pro 1 tháng"></div>' +
          '<div class="form-group" style="margin:0;"><label class="op-label">Giá (VNĐ)</label>' +
            '<input type="number" id="pfPrice" class="admin-filter" style="width:100%;" placeholder="80000"></div>' +
          '<div class="form-group" style="margin:0;"><label class="op-label">Số ngày</label>' +
            '<input type="number" id="pfDays" class="admin-filter" style="width:100%;" placeholder="30"></div>' +
        '</div>' +
        '<div id="pfResult" style="font-size:13px;margin:8px 0;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-primary" id="pfSubmit">💾 Lưu</button>' +
          '<button class="btn btn-outline" id="pfCancel">Huỷ</button>' +
        '</div>' +
      '</div>' +

      (prodPlans.length
        ? '<div class="admin-table-wrap"><div class="table-responsive"><table class="data-table"><thead><tr>' +
          '<th>Danh mục</th><th>ID</th><th>Tên sản phẩm</th><th>Giá</th><th>Kho sẵn</th><th>Đã bán</th><th>Cửa hàng</th><th>Hành động</th>' +
          '</tr></thead><tbody>' +
          prodPlans.map(p => {
            const inStock  = prodStock.filter(r => r.service === p.service && r.status === 'available').length
            const sold     = prodSubs.filter(s => s.plan === p.id).length
            const vis = p.is_visible !== false
            return '<tr>' +
              '<td>' + svcBadge(p.service||'other') + '</td>' +
              '<td><code style="font-size:11px;background:var(--bg-muted);padding:2px 6px;border-radius:4px;">' + p.id + '</code></td>' +
              '<td><strong>' + escapeHtml(p.name||p.id) + '</strong></td>' +
              '<td style="color:var(--primary);font-weight:700;">' + fmtVND(p.price) + '</td>' +
              '<td><span style="font-weight:700;color:' + (inStock>0?'var(--secondary-hover)':'var(--danger)') + ';">' + inStock + '</span></td>' +
              '<td>' + sold + '</td>' +
              '<td><button type="button" class="btn btn-sm other-plan-vis" data-id="' + p.id + '" data-vis="' + (vis ? '1' : '0') + '">' + (vis ? 'Hiện' : 'Ẩn') + '</button></td>' +
              '<td><div class="admin-actions">' +
                '<button class="btn btn-sm btn-outline nhap-kho-btn" data-id="' + p.id + '" data-svc="' + (p.service||'other') + '" data-name="' + escapeAttr(p.name||'') + '">📦 Nhập kho</button>' +
                '<button class="btn btn-sm btn-primary edit-prod-plan-btn" data-id="' + p.id + '" data-service="' + (p.service||'') + '" data-name="' + escapeAttr(p.name||'') + '" data-price="' + (p.price||0) + '" data-days="' + (p.duration_days||0) + '">✏️</button>' +
                '<button class="btn btn-sm btn-danger del-prod-plan-btn" data-id="' + p.id + '">🗑️</button>' +
              '</div></td>' +
            '</tr>'
          }).join('') +
          '</tbody></table></div></div>'
        : '<div class="op-empty">Chưa có sản phẩm nào.</div>') +
      '</div>' +

      // Kho sản phẩm
      '<div class="admin-form-card op-section stock-wh" id="stockSection">' +
        '<header class="op-section-header stock-wh__header">' +
        '<div class="stock-wh__titles">' +
          '<h3 class="admin-section-title stock-wh__title">Kho sản phẩm · nhập key</h3>' +
          '<p class="stock-wh-lead">Mỗi <strong>danh mục</strong> (service) có một kho chung cho mọi gói cùng loại. Giao tự động trừ key theo danh mục. Ẩn danh mục / gói ở bảng phía trên không xóa kho.</p>' +
        '</div>' +
        '<div class="stock-wh__stat-pill"><span class="stock-wh__stat-num">' + stockAvail + '</span><span class="stock-wh__stat-lbl">sẵn sàng</span></div>' +
      '</header>' +

      '<div class="stock-wh-form">' +
        '<div class="stock-wh__plan">' +
          '<label class="op-label" for="stockPlan">Chọn gói (danh mục kho)</label>' +
          '<select id="stockPlan" class="admin-filter stock-wh__select">' +
            '<option value="">— Chọn gói —</option>' +
            prodPlans.map(p => '<option value="' + p.id + '" data-svc="' + (p.service||'other') + '">' + escapeAttr(p.name||p.id) + '</option>').join('') +
          '</select>' +
          '<p id="stockPlanHint" class="stock-plan-hint"></p>' +
        '</div>' +

        '<section class="stock-bulk-import" aria-label="Nhập hàng loạt">' +
          '<div class="stock-bulk-import__head">' +
            '<h4 class="stock-bulk-import__title">Nhập hàng loạt</h4>' +
            '<span class="stock-bulk-import__badge">1 dòng · 1 key</span>' +
          '</div>' +
          '<p class="stock-bulk-import__hint">File <strong>.txt</strong> UTF-8 hoặc dán trực tiếp. Bỏ qua dòng trống.</p>' +

          '<input type="file" id="stockBulkFile" class="stock-bulk-file-input" accept=".txt,text/plain" tabindex="-1" aria-hidden="true">' +
          '<div class="stock-bulk-grid">' +
            '<div class="stock-bulk-upload-col">' +
              '<span class="stock-bulk-col-label">Tệp hoặc kéo thả</span>' +
              '<div class="stock-bulk-drop" id="stockBulkDropZone" role="button" tabindex="0" aria-label="Kéo thả hoặc chọn file txt">' +
                '<span class="stock-bulk-drop__icon" aria-hidden="true">📄</span>' +
                '<p class="stock-bulk-drop__line1">Thả <strong>.txt</strong> vào đây</p>' +
                '<button type="button" class="btn btn-sm btn-primary stock-bulk-drop__btn" id="btnStockPickTxt">Chọn tệp</button>' +
                '<p class="stock-bulk-drop__hint">Hoặc bấm vùng trống để mở hộp thoại</p>' +
              '</div>' +
            '</div>' +
            '<div class="stock-bulk-editor-col">' +
              '<label class="op-label" for="stockBulkText">Danh sách (sửa trước khi nhập)</label>' +
              '<textarea id="stockBulkText" class="acc-textarea stock-bulk-textarea" rows="12" ' +
                'placeholder="Mỗi dòng một key…&#10;&#10;XXXX-YYYY&#10;email|pass&#10;cookie…"></textarea>' +
            '</div>' +
          '</div>' +

          '<footer class="stock-bulk-footer">' +
            '<div class="stock-bulk-meta">' +
              '<span id="stockBulkLineCount" class="stock-bulk-count">0 dòng hợp lệ</span>' +
              '<button type="button" class="btn btn-sm btn-outline" id="btnStockBulkClear">Xóa danh sách</button>' +
            '</div>' +
            '<div class="stock-bulk-note-wrap">' +
              '<label class="op-label" for="stockBulkNote">Ghi chú chung (cả lô)</label>' +
              '<input type="text" id="stockBulkNote" class="admin-filter stock-bulk-note-input" placeholder="VD: Lô A · NCC…">' +
            '</div>' +
            '<div class="stock-bulk-actions">' +
              '<button type="button" class="btn btn-success stock-bulk-submit" id="btnBulkImport">📦 Nhập vào kho</button>' +
            '</div>' +
          '</footer>' +
        '</section>' +

        '<details class="stock-wh-single">' +
          '<summary>Nhập <strong>một</strong> key lẻ</summary>' +
          '<div class="op-form-grid stock-wh-single-grid">' +
            '<div class="form-group" style="margin:0;flex:1;min-width:200px;">' +
              '<label class="op-label">Key / nội dung</label>' +
              '<input type="text" id="stockValue" class="admin-filter" style="width:100%;" placeholder="license, email:pass…">' +
            '</div>' +
            '<div class="form-group" style="margin:0;min-width:140px;">' +
              '<label class="op-label">Ghi chú</label>' +
              '<input type="text" id="stockNote" class="admin-filter" style="width:100%;">' +
            '</div>' +
            '<button type="button" class="btn btn-outline" id="btnAddStock" style="align-self:flex-end;">➕ Thêm 1 dòng</button>' +
          '</div>' +
        '</details>' +

        '<div id="stockAddResult" class="stock-wh-result"></div>' +
      '</div>' +

      (prodStock.length
        ? '<div class="stock-wh-toolbar">' +
          '<div class="stock-wh-stats">' +
            '<span class="stock-wh-stat stock-wh-stat--ok" title="Có thể giao"><b>' + stockAvail + '</b> sẵn sàng</span>' +
            '<span class="stock-wh-stat"><b>' + stockAssigned + '</b> đã giao</span>' +
            '<span class="stock-wh-stat"><b>' + stockFull + '</b> hết slot</span>' +
            '<span class="stock-wh-stat stock-wh-stat--bad"><b>' + stockDead + '</b> hỏng</span>' +
          '</div>' +
          '<div class="stock-wh-filters">' +
            '<span class="stock-wh-flabel">Trạng thái</span>' +
            '<button type="button" class="stock-flt btn btn-sm btn-outline active" data-st="">Tất cả · ' + prodStock.length + '</button>' +
            '<button type="button" class="stock-flt btn btn-sm btn-outline" data-st="available">Sẵn sàng · ' + stockAvail + '</button>' +
            '<button type="button" class="stock-flt btn btn-sm btn-outline" data-st="assigned">Đã giao · ' + stockAssigned + '</button>' +
            '<button type="button" class="stock-flt btn btn-sm btn-outline" data-st="full">Hết slot · ' + stockFull + '</button>' +
            '<button type="button" class="stock-flt btn btn-sm btn-outline" data-st="dead">Hỏng · ' + stockDead + '</button>' +
          '</div>' +
          '<div class="stock-wh-row2">' +
            '<select id="stockSvcFilter" class="admin-filter">' +
              stockSvcOptions +
            '</select>' +
            '<input type="search" id="stockSearchInput" class="admin-filter stock-wh-search" placeholder="Tìm trong key hoặc ghi chú…" autocomplete="off">' +
            '<button type="button" class="btn btn-sm btn-outline" id="btnExportStock">⬇ Xuất TXT (sẵn sàng, đang lọc)</button>' +
          '</div>' +
        '</div>' +
        '<p id="stockFilterEmpty" class="stock-wh-empty-filter" style="display:none;">Không có bản ghi nào khớp bộ lọc.</p>' +
        (prodStock.length > 120 ? '<p class="stock-wh-note">Hiển thị toàn bộ ' + prodStock.length + ' dòng — dùng tìm kiếm để thu hẹp.</p>' : '') +
        '<div class="admin-table-wrap"><div class="table-responsive"><table class="data-table stock-wh-table"><thead><tr>' +
          '<th>#</th><th>Danh mục</th><th>Gói · cùng kho</th><th>Nội dung</th><th>Ghi chú</th><th>Ngày nhập</th><th>Trạng thái</th><th></th>' +
          '</tr></thead><tbody id="stockTableBody">' +
          prodStock.map((r, i) => {
            const val = r.value || ''
            const note = (r.note || '').trim()
            const long = val.length > 48
            const preview = long ? val.substring(0, 48) + '…' : val
            const su = stockStatusUi(r.status)
            const hayRaw = ((val + ' ' + note).toLowerCase())
            const sameSvcPlans = prodPlans.filter(p => (p.service || '') === (r.service || ''))
            const planHint = sameSvcPlans.length
              ? sameSvcPlans.slice(0, 4).map(p => escapeHtml(p.name || p.id)).join(', ') + (sameSvcPlans.length > 4 ? '…' : '')
              : '—'
            const noteCell = note
              ? (note.length > 36 ? escapeHtml(note.substring(0, 36)) + '…' : escapeHtml(note))
              : '—'
            const valCell = long
              ? '<div class="stock-val-cell">' +
                '<code class="acc-value-code stock-val-preview" title="Rút gọn">' + escapeHtml(preview) + '</code>' +
                '<code class="acc-value-code stock-val-full" hidden title="Đầy đủ">' + escapeHtml(val) + '</code>' +
                '<button type="button" class="btn btn-xs btn-outline stock-reveal-btn">Hiện đủ</button>' +
                '<button type="button" class="btn btn-xs btn-outline stock-copy-btn" data-copy="' + escapeAttr(val) + '">📋</button></div>'
              : '<div class="stock-val-cell"><code class="acc-value-code" title="Đầy đủ">' + escapeHtml(val) + '</code>' +
                '<button type="button" class="btn btn-xs btn-outline stock-copy-btn" data-copy="' + escapeAttr(val) + '">📋</button></div>'
            return '<tr class="stock-data-row" data-status="' + esc(r.status || '') + '" data-service="' + esc(r.service || '') + '" data-hay="' + escapeAttr(hayRaw) + '" data-full-copy="' + encodeURIComponent(val) + '">' +
              '<td>' + (i + 1) + '</td>' +
              '<td>' + svcBadge(r.service || 'other') + '</td>' +
              '<td style="font-size:12px;color:var(--text-secondary);max-width:160px;line-height:1.35;">' + planHint + '</td>' +
              '<td style="min-width:200px;">' + valCell + '</td>' +
              '<td style="font-size:12px;max-width:140px;" title="' + escapeAttr(note) + '">' + noteCell + '</td>' +
              '<td style="font-size:11px;color:var(--text-muted);white-space:nowrap;">' + (r.created_at ? formatDate(r.created_at) : '—') + '</td>' +
              '<td><span class="status-badge ' + su.cls + '">' + su.label + '</span></td>' +
              '<td><button type="button" class="btn btn-sm btn-danger stock-del-btn" data-id="' + r.id + '">🗑️</button></td></tr>'
          }).join('') +
          '</tbody></table></div></div>'
        : '<div class="op-empty stock-wh-empty">Kho trống. Chọn gói, dán danh sách hoặc file .txt ở form phía trên, hoặc dùng <strong>Nhập kho</strong> trên từng dòng trong danh mục.</div>') +
      '</div>' +

      // Đơn hàng sản phẩm
      '<div class="admin-form-card op-section">' +
      '<div class="op-section-header"><h3 class="admin-section-title" style="margin:0;">🛒 Đơn hàng sản phẩm</h3></div>' +
      (prodSubs.length
        ? '<div class="admin-table-wrap"><div class="table-responsive"><table class="data-table"><thead><tr>' +
          '<th>Email khách</th><th>Sản phẩm</th><th>Gói</th><th>Trạng thái</th><th>Ngày mua</th><th>Nội dung giao</th>' +
          '</tr></thead><tbody>' +
          prodSubs.map(s => {
            const svcId = planSvc(s.plan)
            const delivered = s.login_link || s.notes || ''
            const actionCell = s.status === 'pending'
              ? '<div class="admin-actions"><button class="btn btn-sm btn-success prod-auto-deliver-btn" data-id="' + s.id + '" data-svc="' + svcId + '">⚡ Giao từ kho</button> <button class="btn btn-sm btn-outline prod-manual-deliver-btn" data-id="' + s.id + '">✏ Giao tay</button></div>'
              : delivered
              ? '<div class="acc-value-cell"><code class="acc-value-code">' + delivered.substring(0,40) + (delivered.length>40?'…':'') + '</code><button class="btn-copy-sm" data-copy="' + escapeAttr(delivered) + '">📋</button></div>'
              : '—'
            return '<tr><td>' + esc(s.user_email||'—') + '</td><td>' + svcBadge(svcId) + '</td><td>' + esc(planName(s.plan)) + '</td>' +
              '<td><span class="status-badge ' + statusClass(s.status) + '">' + statusLabel(s.status) + '</span></td>' +
              '<td style="font-size:12px;">' + formatDate(s.created_at) + '</td><td>' + actionCell + '</td></tr>'
          }).join('') +
          '</tbody></table></div></div>'
        : '<div class="op-empty">Chưa có đơn hàng sản phẩm.</div>') +
      '</div>' +
    '</div>' +

    // ── Modals ──
    '<div class="user-modal-overlay" id="svcConfirmModal" style="display:none;">' +
    '<div class="user-modal" style="max-width:460px;">' +
    '<div class="user-modal-header"><h2>✅ Xác nhận đơn dịch vụ</h2><button class="btn btn-sm btn-outline" id="closeSvcConfirm">✕</button></div>' +
    '<div class="user-modal-body"><input type="hidden" id="svcConfirmId">' +
    '<div class="form-group"><label>Email khách</label><input type="text" id="svcConfirmEmail" readonly class="form-readonly"></div>' +
    '<div class="form-group"><label>Ghi chú đã xử lý</label><textarea id="svcConfirmNote" rows="3" class="sl-textarea" placeholder="VD: Đã nâng cấp cho tài khoản bạn..."></textarea></div>' +
    '<div id="svcConfirmErr" class="form-error"></div>' +
    '<button class="btn btn-primary btn-block" id="submitSvcConfirm">✅ Xác nhận</button></div></div></div>' +

    '<div class="user-modal-overlay" id="manualDeliverModal" style="display:none;">' +
    '<div class="user-modal" style="max-width:460px;">' +
    '<div class="user-modal-header"><h2>✏️ Giao sản phẩm thủ công</h2><button class="btn btn-sm btn-outline" id="closeManualDeliver">✕</button></div>' +
    '<div class="user-modal-body"><input type="hidden" id="manualDeliverId">' +
    '<div class="form-group"><label>Nội dung giao cho khách</label><textarea id="manualDeliverContent" rows="4" class="acc-textarea" placeholder="Key, link, hướng dẫn..."></textarea></div>' +
    '<div id="manualDeliverErr" class="form-error"></div>' +
    '<button class="btn btn-primary btn-block" id="submitManualDeliver">✅ Xác nhận giao hàng</button></div></div></div>' +

    '<div class="user-modal-overlay" id="nhapKhoModal" style="display:none;">' +
    '<div class="user-modal" style="max-width:520px;">' +
    '<div class="user-modal-header"><h2 id="nhapKhoTitle">📦 Nhập kho</h2><button class="btn btn-sm btn-outline" id="closeNhapKho">✕</button></div>' +
    '<div class="user-modal-body"><input type="hidden" id="nhapKhoPlanId"><input type="hidden" id="nhapKhoSvc">' +
    '<div class="form-group"><label>Nhập hàng loạt (mỗi dòng 1 item)</label>' +
    '<textarea id="nhapKhoValues" rows="8" class="acc-textarea" placeholder="key1&#10;key2&#10;email:pass&#10;..."></textarea></div>' +
    '<div id="nhapKhoResult" style="font-size:13px;margin-bottom:8px;"></div>' +
    '<button class="btn btn-primary btn-block" id="submitNhapKho">📦 Nhập kho</button></div></div></div>'

  // ──────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ──────────────────────────────────────────────────────────

  // Sub-tab switch
  panel.querySelectorAll('.op-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.op-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const name = tab.dataset.tab
      panel.querySelector('#opPanelService').style.display = name==='service' ? '' : 'none'
      panel.querySelector('#opPanelProduct').style.display = name==='product' ? '' : 'none'
    })
  })

  // ── Service plan CRUD ──
  function renderSvcOrderRows(subs, filterStatus) {
    const list = filterStatus ? subs.filter(s => s.status === filterStatus) : subs
    if (!list.length) return '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Không có đơn nào.</td></tr>'
    return list.map(s => {
      const svcId = planSvc(s.plan)
      const actions = s.status==='pending'
        ? '<button class="btn btn-sm btn-success svc-confirm-btn" data-id="' + s.id + '" data-email="' + escapeAttr(s.user_email||'') + '">✅ Xác nhận</button> <button class="btn btn-sm btn-danger svc-reject-btn" data-id="' + s.id + '">✗ Từ chối</button>'
        : s.status==='active' ? '<button class="btn btn-sm btn-outline svc-done-btn" data-id="' + s.id + '">☑ Hoàn thành</button>' : '—'
      return '<tr><td>' + esc(s.user_email||'—') + '</td><td>' + svcBadge(svcId) + '</td><td>' + esc(planName(s.plan)) + '</td>' +
        '<td><span class="status-badge ' + statusClass(s.status) + '">' + statusLabel(s.status) + '</span></td>' +
        '<td style="font-size:12px;">' + formatDate(s.created_at) + '</td>' +
        '<td style="font-size:12px;color:var(--text-muted);">' + esc(s.notes||'—') + '</td>' +
        '<td><div class="admin-actions">' + actions + '</div></td></tr>'
    }).join('')
  }

  // Add service plan
  let svcPlanEditId = null
  panel.querySelector('#btnAddSvcPlan')?.addEventListener('click', () => {
    svcPlanEditId = null
    ;['sfId','sfName','sfPrice','sfDays'].forEach(id => { const el = panel.querySelector('#'+id); if(el) el.value='' })
    panel.querySelector('#sfResult').textContent = ''
    panel.querySelector('#svcPlanForm').style.display = ''
    panel.querySelector('#sfId').disabled = false
    panel.querySelector('#sfId').focus()
  })
  panel.querySelectorAll('.edit-svc-plan-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      svcPlanEditId = btn.dataset.id
      panel.querySelector('#sfService').value  = btn.dataset.service || ''
      panel.querySelector('#sfId').value       = btn.dataset.id
      panel.querySelector('#sfId').disabled    = true
      panel.querySelector('#sfName').value     = btn.dataset.name
      panel.querySelector('#sfPrice').value    = btn.dataset.price
      panel.querySelector('#sfDays').value     = btn.dataset.days
      panel.querySelector('#sfResult').textContent = ''
      panel.querySelector('#svcPlanForm').style.display = ''
      panel.querySelector('#sfName').focus()
    })
  })
  panel.querySelector('#sfCancel')?.addEventListener('click', () => { panel.querySelector('#svcPlanForm').style.display='none' })
  panel.querySelector('#sfSubmit')?.addEventListener('click', async () => {
    const service = panel.querySelector('#sfService').value
    const id      = panel.querySelector('#sfId').value.trim()
    const name    = panel.querySelector('#sfName').value.trim()
    const price   = parseInt(panel.querySelector('#sfPrice').value)
    const days    = parseInt(panel.querySelector('#sfDays').value)
    const res     = panel.querySelector('#sfResult')
    if (!name || !price || !days) { res.innerHTML='<span class="text-danger">Điền đầy đủ.</span>'; return }
    if (!svcPlanEditId && !id) { res.innerHTML='<span class="text-danger">Nhập ID gói.</span>'; return }
    const btn = panel.querySelector('#sfSubmit'); btn.disabled=true; btn.textContent='⏳'
    try {
      if (svcPlanEditId) { await adminUpdatePlan(svcPlanEditId, { name, price, duration_days: days }) }
      else { await adminCreatePlan({ id, name, price, duration_days: days, service, fulfillment_type: 'manual' }) }
      window.showToast?.('Đã lưu dịch vụ', 'success')
      await renderOtherProducts(panel, 'service')
    } catch(e) { res.innerHTML='<span class="text-danger">❌ '+e.message+'</span>' }
    finally { btn.disabled=false; btn.textContent='💾 Lưu' }
  })
  panel.querySelectorAll('.del-svc-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm('Xóa dịch vụ','Xóa gói "'+btn.dataset.id+'"?','Xóa','Huỷ','danger')
      if(!ok) return; btn.disabled=true
      try { await adminDeletePlan(btn.dataset.id); await renderOtherProducts(panel,'service') }
      catch(e) { window.showToast?.(e.message,'error'); btn.disabled=false }
    })
  })

  // Add product plan
  let prodPlanEditId = null
  panel.querySelector('#btnAddProdPlan')?.addEventListener('click', () => {
    prodPlanEditId = null
    ;['pfId','pfName','pfPrice','pfDays'].forEach(id => { const el=panel.querySelector('#'+id); if(el) el.value='' })
    panel.querySelector('#pfResult').textContent = ''
    panel.querySelector('#prodPlanForm').style.display = ''
    panel.querySelector('#pfId').disabled = false
    panel.querySelector('#pfId').focus()
  })
  panel.querySelectorAll('.edit-prod-plan-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      prodPlanEditId = btn.dataset.id
      panel.querySelector('#pfService').value  = btn.dataset.service || ''
      panel.querySelector('#pfId').value       = btn.dataset.id
      panel.querySelector('#pfId').disabled    = true
      panel.querySelector('#pfName').value     = btn.dataset.name
      panel.querySelector('#pfPrice').value    = btn.dataset.price
      panel.querySelector('#pfDays').value     = btn.dataset.days
      panel.querySelector('#pfResult').textContent = ''
      panel.querySelector('#prodPlanForm').style.display = ''
      panel.querySelector('#pfName').focus()
    })
  })
  panel.querySelector('#pfCancel')?.addEventListener('click', () => { panel.querySelector('#prodPlanForm').style.display='none' })
  panel.querySelector('#pfSubmit')?.addEventListener('click', async () => {
    const service = panel.querySelector('#pfService').value
    const id      = panel.querySelector('#pfId').value.trim()
    const name    = panel.querySelector('#pfName').value.trim()
    const price   = parseInt(panel.querySelector('#pfPrice').value)
    const days    = parseInt(panel.querySelector('#pfDays').value)
    const res     = panel.querySelector('#pfResult')
    if (!name || !price || !days) { res.innerHTML='<span class="text-danger">Điền đầy đủ.</span>'; return }
    if (!prodPlanEditId && !id) { res.innerHTML='<span class="text-danger">Nhập ID.</span>'; return }
    const btn = panel.querySelector('#pfSubmit'); btn.disabled=true; btn.textContent='⏳'
    try {
      if (prodPlanEditId) { await adminUpdatePlan(prodPlanEditId, { name, price, duration_days: days }) }
      else { await adminCreatePlan({ id, name, price, duration_days: days, service, fulfillment_type: 'stock' }) }
      window.showToast?.('Đã lưu sản phẩm', 'success')
      await renderOtherProducts(panel, 'product')
    } catch(e) { res.innerHTML='<span class="text-danger">❌ '+e.message+'</span>' }
    finally { btn.disabled=false; btn.textContent='💾 Lưu' }
  })
  panel.querySelectorAll('.del-prod-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm('Xóa sản phẩm','Xóa "'+btn.dataset.id+'"?','Xóa','Huỷ','danger')
      if(!ok) return; btn.disabled=true
      try { await adminDeletePlan(btn.dataset.id); await renderOtherProducts(panel,'product') }
      catch(e) { window.showToast?.(e.message,'error'); btn.disabled=false }
    })
  })

  // Nhập kho modal (quick access from product row)
  const nhapKhoModal = panel.querySelector('#nhapKhoModal')
  panel.querySelector('#closeNhapKho')?.addEventListener('click', () => { nhapKhoModal.style.display='none' })
  nhapKhoModal?.addEventListener('click', e => { if(e.target===nhapKhoModal) nhapKhoModal.style.display='none' })
  panel.querySelectorAll('.nhap-kho-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelector('#nhapKhoPlanId').value = btn.dataset.id
      panel.querySelector('#nhapKhoSvc').value    = btn.dataset.svc
      panel.querySelector('#nhapKhoTitle').textContent = '📦 Nhập kho: ' + btn.dataset.name
      panel.querySelector('#nhapKhoValues').value = ''
      panel.querySelector('#nhapKhoResult').textContent = ''
      nhapKhoModal.style.display = 'flex'
    })
  })
  panel.querySelector('#submitNhapKho')?.addEventListener('click', async () => {
    const svcId = panel.querySelector('#nhapKhoSvc').value
    const lines = (panel.querySelector('#nhapKhoValues').value||'').split('\n').map(l=>l.trim()).filter(Boolean)
    const res   = panel.querySelector('#nhapKhoResult')
    const btn   = panel.querySelector('#submitNhapKho')
    if (!lines.length) { res.innerHTML='<span class="text-danger">Nhập ít nhất 1 dòng.</span>'; return }
    btn.disabled=true; btn.textContent='⏳'
    try {
      await adminAddAccountsBulk(lines.map(v => ({ type:'account', value:v, account_type:'stock', service:svcId })))
      res.innerHTML = '<span class="text-success">✅ Đã nhập ' + lines.length + ' item.</span>'
      panel.querySelector('#nhapKhoValues').value = ''
      setTimeout(async () => { nhapKhoModal.style.display='none'; await renderOtherProducts(panel,'product') }, 800)
    } catch(e) { res.innerHTML='<span class="text-danger">❌ '+e.message+'</span>' }
    finally { btn.disabled=false; btn.textContent='📦 Nhập kho' }
  })

  function getBulkStockLines() {
    const raw = panel.querySelector('#stockBulkText')?.value || ''
    return raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  }
  function refreshStockBulkLineCount() {
    const n = getBulkStockLines().length
    const el = panel.querySelector('#stockBulkLineCount')
    const btn = panel.querySelector('#btnBulkImport')
    if (el) el.textContent = n === 1 ? '1 dòng hợp lệ' : (n + ' dòng hợp lệ')
    if (btn) btn.textContent = n ? ('📦 Nhập ' + n + ' dòng vào kho') : '📦 Nhập vào kho'
  }

  // Add single stock (key lẻ)
  panel.querySelector('#btnAddStock')?.addEventListener('click', async () => {
    const planId = panel.querySelector('#stockPlan').value
    const val    = panel.querySelector('#stockValue').value.trim()
    const note   = panel.querySelector('#stockNote').value.trim()
    const opt    = panel.querySelector('#stockPlan option[value="' + planId + '"]')
    const svcId  = opt?.dataset.svc || 'other'
    const res    = panel.querySelector('#stockAddResult')
    if (!planId) { res.innerHTML='<span class="text-danger">Chọn gói.</span>'; return }
    if (!val)    { res.innerHTML='<span class="text-danger">Nhập nội dung.</span>'; return }
    const btn = panel.querySelector('#btnAddStock'); btn.disabled=true; btn.textContent='⏳'
    try {
      await adminAddAccount('account', val, note, 1, 'stock', svcId)
      res.innerHTML='<span class="text-success">✅ Đã thêm 1 dòng.</span>'
      panel.querySelector('#stockValue').value=''
      await renderOtherProducts(panel,'product')
    } catch (e) { res.innerHTML='<span class="text-danger">❌ '+e.message+'</span>' }
    finally { btn.disabled=false; btn.textContent='➕ Thêm 1 dòng' }
  })

  // Hàng loạt: file .txt hoặc textarea
  const stockBulkTA = panel.querySelector('#stockBulkText')
  const stockBulkFile = panel.querySelector('#stockBulkFile')
  const stockBulkDrop = panel.querySelector('#stockBulkDropZone')
  stockBulkTA?.addEventListener('input', refreshStockBulkLineCount)
  refreshStockBulkLineCount()

  panel.querySelector('#btnStockPickTxt')?.addEventListener('click', e => {
    e.preventDefault()
    e.stopPropagation()
    stockBulkFile?.click()
  })
  stockBulkDrop?.addEventListener('click', e => {
    if (e.target.closest('button')) return
    stockBulkFile?.click()
  })
  stockBulkDrop?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      stockBulkFile?.click()
    }
  })

  function applyTxtToBulkText(text) {
    if (stockBulkTA && text != null) {
      stockBulkTA.value = text.replace(/\r\n/g, '\n')
      refreshStockBulkLineCount()
    }
  }

  stockBulkFile?.addEventListener('change', () => {
    const f = stockBulkFile.files?.[0]
    if (!f) return
    const read = () => f.text().then(applyTxtToBulkText).catch(() => {
      const res = panel.querySelector('#stockAddResult')
      if (res) res.innerHTML = '<span class="text-danger">Không đọc được file.</span>'
    })
    read().finally(() => { stockBulkFile.value = '' })
  })

  stockBulkDrop?.addEventListener('dragover', e => { e.preventDefault(); stockBulkDrop.classList.add('stock-bulk-drop--active') })
  stockBulkDrop?.addEventListener('dragleave', () => stockBulkDrop.classList.remove('stock-bulk-drop--active'))
  stockBulkDrop?.addEventListener('drop', e => {
    e.preventDefault()
    stockBulkDrop.classList.remove('stock-bulk-drop--active')
    const f = e.dataTransfer?.files?.[0]
    if (!f) return
    const ok = f.name.toLowerCase().endsWith('.txt') || (f.type && f.type.startsWith('text/'))
    if (!ok) {
      const res = panel.querySelector('#stockAddResult')
      if (res) res.innerHTML = '<span class="text-danger">Chỉ hỗ trợ file .txt hoặc text/plain.</span>'
      return
    }
    f.text().then(applyTxtToBulkText).catch(() => {
      const res = panel.querySelector('#stockAddResult')
      if (res) res.innerHTML = '<span class="text-danger">Không đọc được file.</span>'
    })
  })

  panel.querySelector('#btnStockBulkClear')?.addEventListener('click', () => {
    if (stockBulkTA) stockBulkTA.value = ''
    refreshStockBulkLineCount()
    const clearRes = panel.querySelector('#stockAddResult')
    if (clearRes) clearRes.innerHTML = ''
  })

  panel.querySelector('#btnBulkImport')?.addEventListener('click', async () => {
    const planId = panel.querySelector('#stockPlan').value
    const lines  = getBulkStockLines()
    const bulkNote = (panel.querySelector('#stockBulkNote')?.value || '').trim()
    const opt    = panel.querySelector('#stockPlan option[value="' + planId + '"]')
    const svcId  = opt?.dataset.svc || 'other'
    const res    = panel.querySelector('#stockAddResult')
    if (!planId) { res.innerHTML='<span class="text-danger">Chọn gói.</span>'; return }
    if (!lines.length) { res.innerHTML='<span class="text-danger">Dán hoặc chọn file .txt — cần ít nhất 1 dòng.</span>'; return }
    const btn = panel.querySelector('#btnBulkImport')
    btn.disabled=true; btn.textContent='⏳ Đang nhập…'
    try {
      await adminAddAccountsBulk(lines.map(v => ({
        type: 'account',
        value: v,
        note: bulkNote || null,
        account_type: 'stock',
        service: svcId
      })))
      res.innerHTML='<span class="text-success">✅ Đã nhập '+lines.length+' dòng.</span>'
      if (stockBulkTA) stockBulkTA.value=''
      const nEl = panel.querySelector('#stockBulkNote')
      if (nEl) nEl.value = ''
      refreshStockBulkLineCount()
      await renderOtherProducts(panel,'product')
    } catch (e) { res.innerHTML='<span class="text-danger">❌ '+e.message+'</span>' }
    finally {
      btn.disabled=false
      refreshStockBulkLineCount()
    }
  })

  // Kho sản phẩm: gợi ý gói, lọc, xuất, copy/xóa (ủy quyền)
  const stockSection = panel.querySelector('#stockSection')
  function updateStockPlanHint() {
    const sel = panel.querySelector('#stockPlan')
    const hint = panel.querySelector('#stockPlanHint')
    if (!sel || !hint) return
    const id = sel.value
    if (!id) { hint.textContent = ''; return }
    const svc = prodPlans.find(p => p.id === id)?.service || ''
    const names = prodPlans.filter(p => (p.service || '') === svc).map(p => p.name || p.id).join(', ')
    hint.textContent = names ? ('Cùng kho cho các gói: ' + names + '.') : ''
  }
  function applyStockWarehouseFilters() {
    const chip = stockSection?.querySelector('.stock-flt.active')
    const st = chip?.dataset?.st ?? ''
    const svc = panel.querySelector('#stockSvcFilter')?.value ?? ''
    const q = (panel.querySelector('#stockSearchInput')?.value || '').trim().toLowerCase()
    const rows = panel.querySelectorAll('#stockTableBody .stock-data-row')
    let n = 0
    rows.forEach(tr => {
      const okSt = !st || (tr.dataset.status || '') === st
      const okSv = !svc || (tr.dataset.service || '') === svc
      const hay = (tr.dataset.hay || '').toLowerCase()
      const okQ = !q || hay.includes(q)
      const show = okSt && okSv && okQ
      tr.style.display = show ? '' : 'none'
      if (show) n++
    })
    const fe = panel.querySelector('#stockFilterEmpty')
    if (fe) fe.style.display = (rows.length && n === 0) ? 'block' : 'none'
  }
  updateStockPlanHint()
  panel.querySelector('#stockPlan')?.addEventListener('change', () => {
    updateStockPlanHint()
  })
  stockSection?.querySelectorAll('.stock-flt').forEach(btn => {
    btn.addEventListener('click', () => {
      stockSection.querySelectorAll('.stock-flt').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      applyStockWarehouseFilters()
    })
  })
  panel.querySelector('#stockSvcFilter')?.addEventListener('change', applyStockWarehouseFilters)
  panel.querySelector('#stockSearchInput')?.addEventListener('input', applyStockWarehouseFilters)
  panel.querySelector('#btnExportStock')?.addEventListener('click', () => {
    const lines = []
    panel.querySelectorAll('#stockTableBody .stock-data-row').forEach(tr => {
      if (tr.style.display === 'none') return
      if ((tr.dataset.status || '') !== 'available') return
      try {
        const v = decodeURIComponent(tr.dataset.fullCopy || '')
        if (v) lines.push(v)
      } catch (_) { /* ignore */ }
    })
    if (!lines.length) {
      window.showToast?.('Không có dòng sẵn sàng để xuất (hoặc bị lọc hết).', 'error')
      return
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'kho-san-sang-' + Date.now() + '.txt'
    a.click()
    URL.revokeObjectURL(a.href)
    window.showToast?.('Đã tải ' + lines.length + ' dòng', 'success')
  })
  stockSection?.addEventListener('click', async (e) => {
    const rev = e.target.closest('.stock-reveal-btn')
    if (rev && stockSection.contains(rev)) {
      const row = rev.closest('tr')
      const prev = row?.querySelector('.stock-val-preview')
      const full = row?.querySelector('.stock-val-full')
      if (prev && full) {
        const open = row.classList.toggle('stock-reveal-open')
        prev.hidden = open
        full.hidden = !open
        rev.textContent = open ? 'Ẩn bớt' : 'Hiện đủ'
      }
      return
    }
    const copyB = e.target.closest('.stock-copy-btn')
    if (copyB && stockSection.contains(copyB)) {
      const v = copyB.dataset.copy || ''
      navigator.clipboard.writeText(v)
      copyB.textContent = '✓'
      setTimeout(() => { copyB.textContent = '📋' }, 1200)
      return
    }
    const delB = e.target.closest('.stock-del-btn')
    if (delB && stockSection.contains(delB)) {
      const ok = await showConfirm('Xóa khỏi kho', 'Xóa bản ghi này vĩnh viễn?', 'Xóa', 'Huỷ', 'danger')
      if (!ok) return
      delB.disabled = true
      try {
        await adminDeleteAccount(delB.dataset.id)
        window.showToast?.('Đã xóa', 'success')
        await renderOtherProducts(panel, 'product')
      } catch (err) {
        window.showToast?.(err.message, 'error')
        delB.disabled = false
      }
    }
  })

  panel.querySelectorAll('.btn-copy-sm').forEach(btn => {
    btn.addEventListener('click', () => { navigator.clipboard.writeText(btn.dataset.copy); btn.textContent='✅'; setTimeout(()=>btn.textContent='📋',1500) })
  })

  // Service order filter
  panel.querySelectorAll('.svc-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.svc-filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const tbody = panel.querySelector('#svcOrderBody')
      if (tbody) tbody.innerHTML = renderSvcOrderRows(svcSubs, btn.dataset.filter)
      bindSvcBtns()
    })
  })

  function bindSvcBtns() {
    panel.querySelectorAll('.svc-confirm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelector('#svcConfirmId').value = btn.dataset.id
        panel.querySelector('#svcConfirmEmail').value = btn.dataset.email
        panel.querySelector('#svcConfirmNote').value = ''
        panel.querySelector('#svcConfirmErr').textContent = ''
        panel.querySelector('#svcConfirmModal').style.display = 'flex'
      })
    })
    panel.querySelectorAll('.svc-reject-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await showConfirm('Từ chối','Xác nhận từ chối?','Từ chối','Huỷ','danger')
        if(!ok) return; btn.disabled=true
        try { await adminUpdateSubscription(btn.dataset.id,{status:'cancelled'}); await renderOtherProducts(panel,'service') }
        catch(e) { window.showToast?.(e.message,'error'); btn.disabled=false }
      })
    })
    panel.querySelectorAll('.svc-done-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled=true
        try { await adminUpdateSubscription(btn.dataset.id,{status:'expired'}); await renderOtherProducts(panel,'service') }
        catch(e) { window.showToast?.(e.message,'error'); btn.disabled=false }
      })
    })
  }
  bindSvcBtns()

  // Danh mục cửa hàng (catalog_config) + ẩn/hiện từng gói
  const refreshPanel = t => renderOtherProducts(panel, t || activeTab)
  function resetCustomCatEditor() {
    const idEl = panel.querySelector('#customCatId')
    const nameEl = panel.querySelector('#customCatName')
    const editHid = panel.querySelector('#customCatEditId')
    const addBtn = panel.querySelector('#btnAddCustomCat')
    const cancelBtn = panel.querySelector('#btnCancelCustomCatEdit')
    const resEl = panel.querySelector('#customCatResult')
    if (editHid) editHid.value = ''
    if (idEl) { idEl.value = ''; idEl.readOnly = false; idEl.removeAttribute('readonly'); idEl.removeAttribute('readOnly') }
    if (nameEl) nameEl.value = ''
    if (addBtn) { addBtn.textContent = '➕ Thêm danh mục'; delete addBtn.dataset.editing }
    if (cancelBtn) cancelBtn.hidden = true
    if (resEl) resEl.textContent = ''
  }
  panel.querySelector('#btnCancelCustomCatEdit')?.addEventListener('click', () => resetCustomCatEditor())
  panel.querySelectorAll('.cat-edit-custom').forEach(btn => {
    btn.addEventListener('click', () => {
      const idEl = panel.querySelector('#customCatId')
      const nameEl = panel.querySelector('#customCatName')
      const editHid = panel.querySelector('#customCatEditId')
      const addBtn = panel.querySelector('#btnAddCustomCat')
      const cancelBtn = panel.querySelector('#btnCancelCustomCatEdit')
      const resEl = panel.querySelector('#customCatResult')
      if (resEl) resEl.textContent = ''
      /* data-name / data-id trên <button> có thể trùng thuộc tính DOM (name, id) → dùng data-cat-* + getAttribute */
      const cid = (btn.getAttribute('data-cat-id') || '').trim()
      const clabel = btn.getAttribute('data-cat-label') || ''
      if (!cid) return
      if (editHid) editHid.value = cid
      if (idEl) { idEl.value = cid; idEl.readOnly = true; idEl.setAttribute('readonly', 'readonly') }
      if (nameEl) nameEl.value = clabel
      if (addBtn) { addBtn.textContent = '💾 Cập nhật'; addBtn.dataset.editing = '1' }
      if (cancelBtn) cancelBtn.hidden = false
      panel.querySelector('.cat-add-box')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      nameEl?.focus()
    })
  })
  panel.querySelectorAll('.cat-svc-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.svc
      let cur
      try { cur = parseCatalogConfig(await adminGetSettings()) } catch (e) { window.showToast?.(e.message, 'error'); return }
      const hidden = new Set(cur.hiddenServices || [])
      const wasHidden = hidden.has(sid)
      if (wasHidden) hidden.delete(sid)
      else hidden.add(sid)
      try {
        await adminPatchSettings({ catalog_config: JSON.stringify({ ...cur, hiddenServices: [...hidden] }) })
        window.showToast?.(wasHidden ? 'Đã hiện danh mục trên cửa hàng' : 'Đã ẩn danh mục', 'success')
        await refreshPanel(activeTab)
      } catch (e) { window.showToast?.(e.message, 'error') }
    })
  })
  panel.querySelectorAll('.cat-del-custom').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm('Xóa danh mục tùy chỉnh', 'Gói đang dùng ID này vẫn hoạt động trong admin; chỉ xóa nhãn danh mục custom.', 'Xóa', 'Huỷ', 'danger')
      if (!ok) return
      const id = btn.dataset.id
      let cur
      try { cur = parseCatalogConfig(await adminGetSettings()) } catch { return }
      const customServices = (cur.customServices || []).filter(c => c.id !== id)
      const hiddenServices = (cur.hiddenServices || []).filter(h => h !== id)
      try {
        await adminPatchSettings({ catalog_config: JSON.stringify({ ...cur, customServices, hiddenServices }) })
        window.showToast?.('Đã xóa danh mục custom', 'success')
        await refreshPanel(activeTab)
      } catch (e) { window.showToast?.(e.message, 'error') }
    })
  })
  panel.querySelector('#btnAddCustomCat')?.addEventListener('click', async () => {
    const idEl = panel.querySelector('#customCatId')
    const nameEl = panel.querySelector('#customCatName')
    const editHid = panel.querySelector('#customCatEditId')
    const resEl = panel.querySelector('#customCatResult')
    const editId = (editHid?.value || '').trim().toLowerCase()
    const idRaw = (idEl?.value || '').trim().toLowerCase()
    const name = (nameEl?.value || '').trim()
    if (resEl) resEl.textContent = ''
    if (editId) {
      if (!name) { if (resEl) resEl.textContent = 'Nhập tên hiển thị.'; return }
      let cur
      try { cur = parseCatalogConfig(await adminGetSettings()) } catch (e) { if (resEl) resEl.textContent = e.message; return }
      const list = [...(cur.customServices || [])]
      const ix = list.findIndex(c => String(c.id || '').trim().toLowerCase() === editId)
      if (ix < 0) { if (resEl) resEl.textContent = 'Không tìm thấy danh mục.'; return }
      list[ix] = { ...list[ix], name }
      try {
        await adminPatchSettings({ catalog_config: JSON.stringify({ ...cur, customServices: list }) })
        window.showToast?.('Đã cập nhật tên danh mục', 'success')
        resetCustomCatEditor()
        await refreshPanel(activeTab)
      } catch (e) { if (resEl) resEl.textContent = e.message }
      return
    }
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(idRaw)) {
      if (resEl) resEl.textContent = 'ID: 1–24 ký tự, chữ thường/số/gạch dưới, bắt đầu bằng chữ.'
      return
    }
    if (!name) { if (resEl) resEl.textContent = 'Nhập tên hiển thị.'; return }
    let cur
    try { cur = parseCatalogConfig(await adminGetSettings()) } catch (e) { if (resEl) resEl.textContent = e.message; return }
    if (SERVICES.find(s => s.id === idRaw)) { if (resEl) resEl.textContent = 'ID trùng dịch vụ có sẵn.'; return }
    if ((cur.customServices || []).some(c => c.id === idRaw)) { if (resEl) resEl.textContent = 'ID đã tồn tại.'; return }
    const next = { ...cur, customServices: [...(cur.customServices || []), { id: idRaw, name, tagline: '', color: '#6366f1', bg: '#f0edff' }] }
    try {
      await adminPatchSettings({ catalog_config: JSON.stringify(next) })
      if (idEl) idEl.value = ''
      if (nameEl) nameEl.value = ''
      window.showToast?.('Đã thêm danh mục', 'success')
      await refreshPanel(activeTab)
    } catch (e) { if (resEl) resEl.textContent = e.message }
  })
  panel.querySelectorAll('.other-plan-vis').forEach(btn => {
    btn.addEventListener('click', async () => {
      const curVis = btn.dataset.vis === '1'
      btn.disabled = true
      try {
        await adminUpdatePlan(btn.dataset.id, { is_visible: !curVis })
        window.showToast?.(curVis ? 'Đã ẩn gói trên cửa hàng' : 'Đã hiện gói', 'success')
        await refreshPanel(activeTab)
      } catch (e) {
        window.showToast?.(e.message, 'error')
        btn.disabled = false
      }
    })
  })

  const svcModal = panel.querySelector('#svcConfirmModal')
  panel.querySelector('#closeSvcConfirm')?.addEventListener('click', () => { svcModal.style.display='none' })
  svcModal?.addEventListener('click', e => { if(e.target===svcModal) svcModal.style.display='none' })
  panel.querySelector('#submitSvcConfirm')?.addEventListener('click', async () => {
    const id=panel.querySelector('#svcConfirmId').value, note=panel.querySelector('#svcConfirmNote').value.trim()
    const err=panel.querySelector('#svcConfirmErr'), btn=panel.querySelector('#submitSvcConfirm')
    err.textContent=''; btn.disabled=true; btn.textContent='⏳'
    try { await adminConfirmServiceOrder(id, note); svcModal.style.display='none'; window.showToast?.('Đã xác nhận','success'); await renderOtherProducts(panel,'service') }
    catch(e) { err.textContent=e.message }
    finally { btn.disabled=false; btn.textContent='✅ Xác nhận' }
  })

  // Auto deliver
  panel.querySelectorAll('.prod-auto-deliver-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const svcId = btn.dataset.svc
      // Ưu tiên dùng adminGetAvailableStock từ API
      const avail = await adminGetAvailableStock(svcId) || prodStock.find(r => r.service===svcId && r.status==='available')
      if (!avail) { window.showToast?.('Kho hết hàng!','error'); return }
      const ok = await showConfirm('Giao từ kho', 'Nội dung: "' + avail.value.substring(0,60) + '"\nGiao cho khách?', 'Giao', 'Huỷ', 'primary')
      if(!ok) return; btn.disabled=true; btn.textContent='⏳'
      try { await adminDeliverFromStock(btn.dataset.id, avail.value); await adminUpdateAccount(avail.id,{status:'assigned'}); window.showToast?.('✅ Đã giao!','success'); await renderOtherProducts(panel,'product') }
      catch(e) { window.showToast?.(e.message,'error'); btn.disabled=false; btn.textContent='⚡ Giao từ kho' }
    })
  })

  const manualModal = panel.querySelector('#manualDeliverModal')
  panel.querySelector('#closeManualDeliver')?.addEventListener('click', () => { manualModal.style.display='none' })
  manualModal?.addEventListener('click', e => { if(e.target===manualModal) manualModal.style.display='none' })
  panel.querySelectorAll('.prod-manual-deliver-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelector('#manualDeliverId').value = btn.dataset.id
      panel.querySelector('#manualDeliverContent').value = ''
      panel.querySelector('#manualDeliverErr').textContent = ''
      manualModal.style.display = 'flex'
    })
  })
  panel.querySelector('#submitManualDeliver')?.addEventListener('click', async () => {
    const id=panel.querySelector('#manualDeliverId').value, content=panel.querySelector('#manualDeliverContent').value.trim()
    const err=panel.querySelector('#manualDeliverErr'), btn=panel.querySelector('#submitManualDeliver')
    if(!content){err.textContent='Nhập nội dung.';return}; err.textContent=''; btn.disabled=true; btn.textContent='⏳'
    try { await adminDeliverFromStock(id, content); manualModal.style.display='none'; window.showToast?.('✅ Đã giao!','success'); await renderOtherProducts(panel,'product') }
    catch(e) { err.textContent=e.message }
    finally { btn.disabled=false; btn.textContent='✅ Xác nhận giao hàng' }
  })
// OLD_PLACEHOLDER_END
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
