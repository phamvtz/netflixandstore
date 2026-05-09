import {
  adminApiFetch,
  adminGetAllSubscriptions,
  adminGetAllPayments,
  adminGetAllProfiles,
  adminGetAllAccounts,
  adminGetSettings,
  adminPatchSettings,
  adminUpdateSubscription,
  adminSetLoginLink,
  adminUpdatePayment,
  adminConfirmPayment,
  adminUpdateProfile,
  adminDeleteUser,
  adminAddAccount,
  adminAddAccountsBulk,
  adminUpdateAccount,
  adminDeleteAccount,
  adminCreatePlan,
  adminUpdatePlan,
  adminDeletePlan,
  adminListViewerReports,
  adminResolveViewerReport,
  adminAssignViewerReportFromPool,
  adminGetWallets,
  adminGetWalletTopups,
  adminCreditWallet,
  adminConfirmWalletTopup,
  adminCheckAccountPlan,
  adminCheckViewerReportAccount,
  adminGetSupportChats,
  adminGetSupportChat,
  adminSendSupportMessage,
  getPlans
} from '../utils/api.js'
import { formatVND, formatDate, daysLeft } from '../utils/format.js'
import { apiCheckCookie, apiNetflixAccountInfo } from '../utils/netflix.js'
import { getUser } from '../utils/auth.js'
import { renderAdminGuides } from './AdminGuides.js'
import { showConfirmModal, showInputModal, showDetailModal, showFormModal, closeModal } from './admin/ui.js'
import { mountCatalogAdmin } from './admin/catalog.js'
import { renderSettings, saveSettings } from './admin/settings.js'
import { renderPlans, handlePlansAction } from './admin/plans.js'

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',      label: 'Dashboard Netflix',    group: 'Netflix',         icon: iconGrid() },
  { id: 'orders',        label: 'Đơn hàng',              group: 'Netflix',         icon: iconFile() },
  { id: 'accounts',      label: 'Kho tài khoản',         group: 'Netflix',         icon: iconDatabase() },
  { id: 'nfstock',       label: 'Nhập kho',              group: 'Netflix',         icon: iconInbox() },
  { id: 'viewerReports', label: 'Bảo hành / Báo lỗi',   group: 'Netflix',         icon: iconBell() },
  { id: 'payments',      label: 'Thanh toán',             group: 'Netflix',         icon: iconCard() },
  { id: 'plans',         label: 'Gói Netflix',             group: 'Netflix',         icon: iconList() },
  { id: 'categories',    label: 'Sản phẩm / Dịch vụ',     group: 'Dịch vụ số',     icon: iconFolder() },
  { id: 'spOrders',      label: 'Đơn sản phẩm tự động',   group: 'Dịch vụ số',     icon: iconFile() },
  { id: 'dvOrders',      label: 'Đơn hàng dịch vụ',       group: 'Dịch vụ số',     icon: iconList() },
  { id: 'users',         label: 'Người dùng',              group: 'Hệ thống',        icon: iconUsers() },
  { id: 'wallet',        label: 'Ví khách hàng',          group: 'Hệ thống',        icon: iconWallet() },
  { id: 'guides',        label: 'Hướng dẫn',               group: 'Hệ thống',        icon: iconBook() },
  { id: 'settings',      label: 'Cài đặt',                 group: 'Hệ thống',        icon: iconSettings() },
  { id: 'supportChat',   label: 'Chat hỗ trợ',             group: 'Hệ thống',        icon: iconSend() },
]

const EMPTY_DATA = {
  subscriptions: [],
  payments: [],
  profiles: [],
  accounts: [],
  plans: [],
  viewerReports: [],
  wallets: [],
  walletTopups: [],
  supportThreads: [],
  supportChat: null,
  catalogCategories: [],
  catalogProducts: [],
  settings: {},
  stats: { revenue: {}, orders: {}, inventory: {}, customers: 0, users: {}, visitors: {}, revenueByMonth: [] },
}

const PAGE_SIZE = 25

const SVC_META = {
  youtube: { label: 'YouTube Premium', color: '#FF0000', bg: 'rgba(255,0,0,0.10)' },
  spotify: { label: 'Spotify Premium', color: '#1DB954', bg: 'rgba(29,185,84,0.10)' },
  capcut:  { label: 'CapCut Pro',      color: '#FE2C55', bg: 'rgba(254,44,85,0.10)' },
  kling:   { label: 'KLING AI',        color: '#FF6B35', bg: 'rgba(255,107,53,0.10)' },
  claude:  { label: 'Claude Pro',      color: '#CC785C', bg: 'rgba(204,120,92,0.10)' },
  grok:    { label: 'SuperGrok',       color: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
  chatgpt: { label: 'ChatGPT',         color: '#10A37F', bg: 'rgba(16,163,127,0.10)' },
  gemini:  { label: 'Gemini Advanced', color: '#4285F4', bg: 'rgba(66,133,244,0.10)' },
  hmavpn:  { label: 'HMA VPN',         color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  tiktok:  { label: 'TikTok',          color: '#69C9D0', bg: 'rgba(105,201,208,0.10)' },
  canva:   { label: 'Canva Pro',       color: '#7D2AE8', bg: 'rgba(125,42,232,0.10)' },
  other:   { label: 'Khác',            color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
}

// ── State ─────────────────────────────────────────────────────────────────────

let state = null

// ── Entry point ───────────────────────────────────────────────────────────────

export async function renderAdmin(container) {
  const navbar = document.getElementById('navbar')
  const footer = document.getElementById('footer')
  const oldNavbar = navbar?.style.display || ''
  const oldFooter = footer?.style.display || ''
  if (navbar) navbar.style.display = 'none'
  if (footer) footer.style.display = 'none'
  document.body.classList.add('admin-mode')

  state = {
    tab: initialAdminTab(),
    data: structuredCloneSafe(EMPTY_DATA),
    maps: {},
    pag: {},        // { [tabId]: { page: 1, size: PAGE_SIZE } }
    flt: {},        // { [tabId]: { search: '', status: '' } }
    walletLoaded: false,
    container,
    content: null,
    pageTitle: null,
    loading: false,
    catalogDirty: false,
    catalogCleanup: null,
  }

  container.innerHTML = renderShell()
  state.content  = container.querySelector('#adminV2Content')
  state.pageTitle = container.querySelector('#adminV2Title')

  container.addEventListener('click',  onClick)
  container.addEventListener('input',  onInput)
  container.addEventListener('change', onChange)

  await reloadAll()
  scrollToInitialAdminSection()

  return () => {
    if (state?.catalogCleanup) state.catalogCleanup()
    container.removeEventListener('click',  onClick)
    container.removeEventListener('input',  onInput)
    container.removeEventListener('change', onChange)
    if (navbar) navbar.style.display = oldNavbar
    if (footer) footer.style.display = oldFooter
    document.body.classList.remove('admin-mode')
    state = null
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function reloadAll() {
  if (!state) return
  state.loading = true
  state.content.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
  try {
    const data = await fetchBootstrap()
    state.data  = normalizeAdminData(data)
    state.maps  = buildMaps(state.data)
    state.walletLoaded = false
    state.supportChatLoaded = false
    state.loading = false
    await renderCurrent()
  } catch (err) {
    state.loading = false
    state.content.innerHTML = emptyState('Không tải được admin', err.message, 'Thử lại', 'refresh')
  }
}

async function fetchBootstrap() {
  // Always fetch variant plans in parallel regardless of bootstrap outcome
  const variantPlansPromise = adminApiFetch('/api/admin/variant-plans')
    .then(r => r.ok ? r.json() : { plans: [] })
    .then(d => d.plans || [])
    .catch(() => [])

  let data
  try {
    const res = await adminApiFetch('/api/admin/bootstrap')
    if (res.ok) {
      data = await res.json()
    }
  } catch { /* fall through */ }

  if (!data) {
    const statsRes = await adminApiFetch('/api/admin/stats')
    const [subscriptions, payments, profiles, accounts, plans, settings, viewerReports, stats, catalogCategories, catalogProducts] = await Promise.all([
      adminGetAllSubscriptions(),
      adminGetAllPayments(),
      adminGetAllProfiles(),
      adminGetAllAccounts(),
      getPlans(),
      adminGetSettings().catch(() => ({})),
      adminListViewerReports('all').then(r => r.reports || []).catch(() => []),
      statsRes.ok ? statsRes.json() : Promise.resolve(EMPTY_DATA.stats),
      adminApiFetch('/api/admin/catalog/categories?limit=1000').then(r => r.ok ? r.json() : { data: { categories: [] } }).then(d => d.data?.categories || d.categories || []).catch(() => []),
      adminApiFetch('/api/admin/catalog/products?limit=1000').then(r => r.ok ? r.json() : { data: { products: [] } }).then(d => d.data?.products || d.products || []).catch(() => []),
    ])
    data = { subscriptions, payments, profiles, accounts, plans, settings, viewerReports, stats, catalogCategories, catalogProducts }
  }

  // Merge variant plans so buildMaps can resolve non-Netflix plan IDs
  const variantPlans = await variantPlansPromise
  const existingPlanIds = new Set(array(data.plans).map(p => p.id))
  data.plans = [...array(data.plans), ...array(variantPlans).filter(p => !existingPlanIds.has(p.id))]

  return data
}



async function loadWalletData() {
  if (state.walletLoaded) return
  state.content.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
  try {
    const [wallets, walletTopups] = await Promise.all([
      adminGetWallets(),
      adminGetWalletTopups(),
    ])
    state.data.wallets     = array(wallets)
    state.data.walletTopups = array(walletTopups)
    state.walletLoaded = true
    await renderCurrent()
  } catch (err) {
    state.content.innerHTML = emptyState('Không tải được ví', err.message, 'Thử lại', 'refresh')
  }
}

async function loadSupportChatData(selectedUserId = null) {
  if (!state) return
  state.content.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
  try {
    const threads = await adminGetSupportChats()
    state.data.supportThreads = array(threads)
    const currentUserId = selectedUserId || getFlt('supportChat').userId || threads[0]?.user_id || ''
    getFlt('supportChat').userId = currentUserId
    if (currentUserId) {
      state.data.supportChat = await adminGetSupportChat(currentUserId)
    } else {
      state.data.supportChat = null
    }
    state.supportChatLoaded = true
    await renderCurrent()
  } catch (err) {
    state.content.innerHTML = emptyState('Không tải được chat', err.message, 'Thử lại', 'refresh-support-chat')
  }
}

function normalizeAdminData(data) {
  return {
    ...structuredCloneSafe(EMPTY_DATA),
    ...data,
    subscriptions:  array(data.subscriptions),
    payments:       array(data.payments),
    profiles:       array(data.profiles),
    accounts:       array(data.accounts),
    plans:          array(data.plans),
    viewerReports:  array(data.viewerReports || data.viewer_reports || data.reports),
    wallets:        [],
    walletTopups:   [],
    supportThreads: array(data.supportThreads || data.support_threads),
    supportChat:    data.supportChat || null,
    catalogCategories: array(data.catalogCategories || data.catalog_categories),
    catalogProducts:   array(data.catalogProducts || data.catalog_products),
    settings:       data.settings || {},
    stats:          data.stats || EMPTY_DATA.stats,
  }
}

function buildMaps(data) {
  // Start with the base plans (Netflix plans from /api/plans)
  const planMap = new Map(data.plans.map(r => [r.id, r]))
  // Merge in any plan info embedded in subscriptions (product_variants, etc.)
  for (const sub of data.subscriptions) {
    if (sub.plans && sub.plans.id && !planMap.has(sub.plans.id)) {
      planMap.set(sub.plans.id, sub.plans)
    }
  }
  return {
    profiles:      new Map(data.profiles.map(r => [r.id, r])),
    plans:         planMap,
    subscriptions: new Map(data.subscriptions.map(r => [r.id, r])),
  }
}

// ── Pagination helpers ────────────────────────────────────────────────────────

function getPag(tab) {
  if (!state.pag[tab]) state.pag[tab] = { page: 1, size: PAGE_SIZE }
  return state.pag[tab]
}

function getFlt(tab) {
  if (!state.flt[tab]) state.flt[tab] = { search: '', status: '' }
  return state.flt[tab]
}

function paginate(rows, tab) {
  const { page, size } = getPag(tab)
  const { search, status } = getFlt(tab)
  let filtered = rows
  if (search || status) {
    const q = search.toLowerCase()
    filtered = rows.filter(row => {
      const rowText = (row._searchText || JSON.stringify(row)).toLowerCase()
      const okSearch = !q || rowText.includes(q)
      const okStatus = !status || (status === 'payment' ? accountHasPaymentIssue(row) : (row.status || '') === status)
      return okSearch && okStatus
    })
  }
  const total = filtered.length
  const start = (page - 1) * size
  const items = filtered.slice(start, start + size)
  return { items, total, page, size }
}

function paginationBar(tab, total) {
  const { page, size } = getPag(tab)
  if (total <= size && page === 1) return ''
  const totalPages = Math.ceil(total / size)
  const from = Math.min((page - 1) * size + 1, total)
  const to   = Math.min(page * size, total)
  return `
    <div class="admin-v2-pagination" data-pag-tab="${attr(tab)}">
      <span class="admin-v2-muted" style="font-size:12px;">
        ${from}–${to} / <strong>${total}</strong>
      </span>
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:11px;color:#64748b;">Hiển thị:</span>
        <select data-pag-size="${attr(tab)}" class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:12px;">
          ${[25, 50, 100].map(n => `<option value="${n}"${n === size ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-outline" data-pag-prev="${attr(tab)}"${page <= 1 ? ' disabled' : ''}>← Trước</button>
        <span style="font-size:12px;">${page} / ${totalPages}</span>
        <button class="btn btn-sm btn-outline" data-pag-next="${attr(tab)}"${page >= totalPages ? ' disabled' : ''}>Sau →</button>
      </div>
    </div>
  `.trim()
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function renderShell() {
  const user = getUser()
  const siteName = window.__siteSettings?.site_name || 'Netflix Store'
  const grouped = TABS.reduce((acc, item) => {
    ;(acc[item.group] ||= []).push(item)
    return acc
  }, {})

  return `
    <div class="admin-v2">
      <aside class="admin-v2-sidebar">
        <div class="admin-v2-brand">
          <div class="admin-v2-brand-mark">N</div>
          <div>
            <div class="admin-v2-brand-title">${esc(siteName)}</div>
            <div class="admin-v2-brand-sub">Admin console</div>
          </div>
        </div>
        <nav class="admin-v2-nav">
          ${Object.entries(grouped).map(([group, items]) => `
            <section class="admin-v2-nav-group">
              <div class="admin-v2-nav-label">${esc(group)}</div>
              ${items.map(item => `
                <button type="button" class="admin-v2-nav-item${item.id === 'overview' ? ' active' : ''}" data-admin-tab="${item.id}">
                  <span class="admin-v2-nav-icon">${item.icon}</span>
                  <span>${esc(item.label)}</span>
                </button>
              `).join('')}
            </section>
          `).join('')}
        </nav>
        <div class="admin-v2-user">
          <div class="admin-v2-avatar">${esc((user?.email || 'A')[0].toUpperCase())}</div>
          <div class="admin-v2-user-meta">
            <strong>${esc(user?.email || 'Admin')}</strong>
            <span>Quản trị viên</span>
          </div>
          <a class="admin-v2-exit" href="#/" title="Về trang chủ">${iconLogOut()}</a>
        </div>
      </aside>
      <main class="admin-v2-main">
        <header class="admin-v2-topbar">
          <div>
            <span class="admin-v2-kicker">Admin</span>
            <strong id="adminV2Title">Dashboard</strong>
          </div>
          <div class="admin-v2-top-actions">
            <span class="admin-v2-health"><i></i> Online</span>
            <button type="button" class="btn btn-sm btn-outline" data-action="refresh">${iconRefresh()} Tải lại</button>
          </div>
        </header>
        <section class="admin-v2-content" id="adminV2Content">
          <div class="loading"><div class="spinner"></div></div>
        </section>
      </main>
    </div>
  `
}

// ── Tab routing ───────────────────────────────────────────────────────────────

async function renderCurrent() {
  if (!state) return
  if (state.catalogCleanup) {
    state.catalogCleanup()
    state.catalogCleanup = null
  }
  const tab = TABS.find(t => t.id === state.tab) || TABS[0]
  state.pageTitle.textContent = tab.label
  state.container.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.adminTab === state.tab)
  })

  if (state.tab === 'guides') {
    state.content.innerHTML = panelHeader('Hướng dẫn', 'Quản lý bài viết và video hướng dẫn cho khách hàng.')
    const mount = document.createElement('div')
    state.content.appendChild(mount)
    await renderAdminGuides(mount, state.data.settings, {
      onSaved(nextConfig) {
        state.data.settings.guides_config = JSON.stringify(nextConfig)
      },
    })
    return
  }

  if (state.tab === 'wallet') {
    if (!state.walletLoaded) {
      await loadWalletData()
      return
    }
    state.content.innerHTML = renderWallet()
    return
  }

  if (state.tab === 'supportChat') {
    if (!state.supportChatLoaded) {
      await loadSupportChatData()
      return
    }
    state.content.innerHTML = renderSupportChatAdmin()
    requestAnimationFrame(() => {
      const box = state?.content?.querySelector('#adminChatMessages')
      if (box) box.scrollTop = box.scrollHeight
    })
    return
  }

  if (state.tab === 'nfstock' && state.catalogDirty) {
    state.catalogDirty = false
    await reloadAll()
    return
  }

  // Service catalog: categories contain sellable variants directly.
  if (state.tab === 'categories') {
    state.content.innerHTML = '<div id="adminCatalogMount" style="min-height:400px"></div>'
    const mount = state.content.querySelector('#adminCatalogMount')
    if (mount) {
      state.catalogCleanup = mountCatalogAdmin(mount, {
        embedded: false,
        onChanged() {
          if (state) state.catalogDirty = true
        },
      })
    }
    return
  }

  const view = {
    overview:      renderOverviewV3,
    orders:        renderOrders,
    payments:      renderPayments,
    accounts:      renderAccountsV3,
    nfstock:       renderNfStockV2,
    users:         renderUsers,
    plans:         () => renderPlans(state, { esc, attr, panelHeader, table }),
    viewerReports: renderViewerReports,
    settings:      () => renderSettings(state, { esc, attr, panelHeader }),
    spOrders:      renderSpOrders,
    dvOrders:      renderDvOrdersV2,
  }[state.tab] || renderOverviewV3

  state.content.innerHTML = view()
}

// ── Overview ──────────────────────────────────────────────────────────────────

function _renderOverviewLegacy() {
  const { stats, subscriptions, payments, accounts } = state.data
  const revenue       = stats.revenue       || {}
  const orders        = stats.orders        || {}
  const inventory     = stats.inventory     || {}
  const users         = stats.users         || {}
  const visitors      = stats.visitors      || {}
  const revenueByMonth = stats.revenueByMonth || []
  const activeOrders  = orders.active  ?? subscriptions.filter(r => r.status === 'active').length
  const pendingOrders = orders.pending ?? subscriptions.filter(r => r.status === 'pending').length
  const paidPayments  = payments.filter(r => r.status === 'success').length

  // Revenue bar chart (last 6 months)
  const maxAmt = Math.max(1, ...revenueByMonth.map(m => m.amount))
  const revChart = revenueByMonth.length ? `
    <div class="dash-rev-chart">
      ${revenueByMonth.map(m => {
        const pct = Math.round((m.amount / maxAmt) * 100)
        return `
          <div class="dash-rev-col">
            <div class="dash-rev-bar-wrap">
              <div class="dash-rev-bar" style="height:${pct}%" title="${formatVND(m.amount)}"></div>
            </div>
            <div class="dash-rev-label">${esc(m.label)}</div>
            <div class="dash-rev-val">${m.amount > 0 ? formatVND(m.amount) : '—'}</div>
          </div>
        `
      }).join('')}
    </div>
  ` : ''

  // Visitor chart (last 30 days)
  const byDay = (visitors.byDay || []).slice(-14)
  const maxPv = Math.max(1, ...byDay.map(d => d.count))
  const pvChart = byDay.length ? `
    <div class="dash-pv-chart">
      ${byDay.map(d => {
        const pct = Math.round((d.count / maxPv) * 100)
        const label = d.date ? d.date.slice(5) : ''
        return `
          <div class="dash-pv-col">
            <div class="dash-pv-bar-wrap">
              <div class="dash-pv-bar" style="height:${pct}%" title="${d.count} lượt — ${d.date}"></div>
            </div>
            <div class="dash-pv-label">${esc(label)}</div>
          </div>
        `
      }).join('')}
    </div>
  ` : '<div class="admin-v2-muted" style="padding:16px;font-size:12px">Chưa có dữ liệu truy cập — sẽ tích lũy khi khách ghé site.</div>'

  const now = new Date()
  const todayStr  = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`
  const monthStr  = `Tháng ${now.getMonth()+1}/${now.getFullYear()}`
  const yearStr   = `Năm ${now.getFullYear()}`

  return `
    ${panelHeader('Dashboard', 'Tổng quan doanh thu, người dùng, lưu lượng truy cập và vận hành.')}

    <!-- Revenue metrics -->
    <div class="admin-v2-metrics">
      ${metric('Doanh thu hôm nay', formatVND(revenue.today || 0), 'blue', '💰')}
      ${metric('Doanh thu 30 ngày', formatVND(revenue.month || 0), 'violet', '📅')}
      ${metric('Đơn active', activeOrders, 'green', '✅')}
      ${metric('Đơn đang chờ', pendingOrders, 'amber', '⏳')}
    </div>

    <!-- Users + Visitors -->
    <div class="admin-v2-grid-2">
      <section class="admin-v2-card">
        <div class="admin-v2-card-head">
          <h3>👤 Người dùng</h3>
          <span class="admin-v2-muted">${users.total || state.data.profiles.length} tổng cộng</span>
        </div>
        <div class="dash-stat-rows">
          <div class="dash-stat-row">
            <span>Hôm nay <span class="admin-v2-muted">(${todayStr})</span></span>
            <strong class="tone-good">+${users.today || 0}</strong>
          </div>
          <div class="dash-stat-row">
            <span>7 ngày qua</span>
            <strong class="tone-good">+${users.week || 0}</strong>
          </div>
          <div class="dash-stat-row">
            <span>${monthStr}</span>
            <strong class="tone-good">+${users.month || 0}</strong>
          </div>
          <div class="dash-stat-row">
            <span>Tổng tài khoản</span>
            <strong>${users.total || state.data.profiles.length}</strong>
          </div>
          <div class="dash-stat-row">
            <span>Khách mua hàng</span>
            <strong>${stats.customers || 0}</strong>
          </div>
        </div>
      </section>

      <section class="admin-v2-card">
        <div class="admin-v2-card-head">
          <h3>🌐 Lượt truy cập</h3>
          <span class="admin-v2-muted">Page views</span>
        </div>
        <div class="dash-stat-rows">
          <div class="dash-stat-row">
            <span>Hôm nay <span class="admin-v2-muted">(${todayStr})</span></span>
            <strong class="tone-good">${visitors.today || 0}</strong>
          </div>
          <div class="dash-stat-row">
            <span>7 ngày qua</span>
            <strong>${visitors.week || 0}</strong>
          </div>
          <div class="dash-stat-row">
            <span>${monthStr}</span>
            <strong>${visitors.month || 0}</strong>
          </div>
          <div class="dash-stat-row">
            <span>${yearStr}</span>
            <strong>${visitors.year || 0}</strong>
          </div>
        </div>
        ${pvChart}
      </section>
    </div>

    <!-- Revenue chart + Inventory + Quick actions -->
    <div class="admin-v2-grid-2">
      <section class="admin-v2-card">
        <div class="admin-v2-card-head">
          <h3>📊 Doanh thu theo tháng</h3>
          <span class="admin-v2-muted">6 tháng gần nhất</span>
        </div>
        ${revChart || '<div class="admin-v2-muted" style="padding:16px;font-size:12px">Chưa có dữ liệu</div>'}
      </section>

      <section class="admin-v2-card">
        <div class="admin-v2-card-head">
          <h3>Kho hệ thống</h3>
          <span class="admin-v2-muted">${accounts.length} tài nguyên</span>
        </div>
        <div class="admin-v2-list">
          ${infoRow('Netflix sẵn sàng', inventory.netflix_available ?? inventory.available ?? 0, 'good')}
          ${infoRow('Stock sẵn sàng',   inventory.stock_available ?? 0, 'good')}
          ${infoRow('Đầy slot / đã giao', Number(inventory.full||0)+Number(inventory.assigned||0), 'info')}
          ${infoRow('Lỗi / chết',       inventory.dead || 0, 'bad')}
        </div>
        <div class="admin-v2-card-head" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(148,163,184,0.08)">
          <h3>Thao tác nhanh</h3>
          <span id="adminQuickResult"></span>
        </div>
        <div class="admin-v2-quick">
          <button class="admin-v2-quick-btn" data-action="run-health">${iconSearch()} Kiểm tra kho</button>
          <button class="admin-v2-quick-btn" data-action="run-expiry">${iconClock()} Chạy hết hạn</button>
          <button class="admin-v2-quick-btn" data-action="cancel-pending">${iconTrash()} Huỷ đơn chờ</button>
          <button class="admin-v2-quick-btn" data-action="test-telegram">${iconSend()} Test Telegram</button>
        </div>
      </section>
    </div>

    <!-- Recent orders -->
    <section class="admin-v2-card">
      <div class="admin-v2-card-head">
        <h3>Đơn gần đây</h3>
        <span class="admin-v2-muted">${paidPayments} thanh toán thành công</span>
      </div>
      ${table(['Mã đơn', 'Khách', 'Gói', 'Trạng thái', 'Tạo lúc'], subscriptions.slice(0, 8).map(r => [
        code(r.id),
        customerEmail(r.user_id, r.user_email),
        planName(r.plan),
        badge(r.status),
        formatDate(r.created_at),
      ]))}
    </section>
  `
}

// ── Orders ────────────────────────────────────────────────────────────────────

function renderOverviewV3() {
  const { stats, subscriptions, payments, accounts, profiles } = state.data
  const revenue = stats.revenue || {}
  const orders = stats.orders || {}
  const inventory = stats.inventory || {}
  const users = stats.users || {}
  const visitors = stats.visitors || {}
  const revenueByMonth = array(stats.revenueByMonth).slice(-6)
  const visitorsByDay = array(visitors.byDay).slice(-14)
  const activeOrders = orders.active ?? subscriptions.filter(row => row.status === 'active').length
  const pendingOrders = orders.pending ?? subscriptions.filter(row => row.status === 'pending' || row.status === 'processing').length
  const cancelledOrders = orders.cancelled ?? subscriptions.filter(row => row.status === 'cancelled').length
  const successPayments = payments.filter(row => row.status === 'success').length
  const today = new Date()
  const todayLabel = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`
  const monthLabel = `Tháng ${today.getMonth() + 1}/${today.getFullYear()}`
  const availableStock = Number(inventory.netflix_available ?? inventory.available ?? accounts.filter(isReadyNetflixAccount).length)
  const deadStock = Number(inventory.dead ?? accounts.filter(row => row.status === 'dead').length)
  const assignedStock = Number(inventory.full || 0) + Number(inventory.assigned || 0)
  const paymentIssueStock = accounts.filter(accountHasPaymentIssue).length
  const recentOrders = subscriptions
    .slice()
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 8)

  const maxRevenue = Math.max(1, ...revenueByMonth.map(row => Number(row.amount || 0)))
  const revenueChart = revenueByMonth.length ? `
    <div class="overview-chart overview-chart--revenue">
      ${revenueByMonth.map(row => {
        const amount = Number(row.amount || 0)
        const pct = Math.max(4, Math.round((amount / maxRevenue) * 100))
        return `
          <div class="overview-chart-col">
            <div class="overview-chart-value">${amount ? formatVND(amount) : '-'}</div>
            <div class="overview-chart-track"><span style="height:${pct}%"></span></div>
            <div class="overview-chart-label">${esc(row.label || '')}</div>
          </div>
        `
      }).join('')}
    </div>
  ` : '<div class="overview-empty-note">Chưa có dữ liệu doanh thu.</div>'

  const maxVisitor = Math.max(1, ...visitorsByDay.map(row => Number(row.count || 0)))
  const visitorChart = visitorsByDay.length ? `
    <div class="overview-spark-bars">
      ${visitorsByDay.map(row => {
        const count = Number(row.count || 0)
        const pct = Math.max(5, Math.round((count / maxVisitor) * 100))
        return `<span style="height:${pct}%" title="${attr(count)} lượt - ${attr(row.date || '')}"></span>`
      }).join('')}
    </div>
  ` : '<div class="overview-empty-note">Chưa có dữ liệu truy cập.</div>'

  return `
    <div class="overview-page">
      <div class="overview-hero">
        <div>
          <span class="admin-v2-kicker">Dashboard</span>
          <h1>Tổng quan vận hành</h1>
          <p>Theo dõi doanh thu, đơn hàng, khách hàng, truy cập và tình trạng kho trong một màn hình.</p>
        </div>
        <div class="overview-hero-actions">
          <span class="overview-date">${esc(todayLabel)}</span>
          <button type="button" class="btn btn-sm btn-outline" data-action="refresh">${iconRefresh()} Làm mới</button>
        </div>
      </div>

      <div class="overview-kpi-grid">
        ${overviewKpi('Doanh thu hôm nay', formatVND(revenue.today || 0), 'blue', iconCard(), 'Trong ngày hiện tại')}
        ${overviewKpi('Doanh thu 30 ngày', formatVND(revenue.month || 0), 'violet', iconGrid(), monthLabel)}
        ${overviewKpi('Đơn đang active', activeOrders, 'green', iconInbox(), `${pendingOrders} đơn đang chờ`)}
        ${overviewKpi('Người dùng', users.total || profiles.length, 'amber', iconUsers(), `+${users.today || 0} hôm nay`)}
      </div>

      <div class="overview-layout">
        <section class="overview-card overview-card--wide">
          <div class="overview-card-head">
            <div>
              <h3>Doanh thu theo tháng</h3>
              <span>6 tháng gần nhất</span>
            </div>
            <strong>${formatVND(revenue.month || 0)}</strong>
          </div>
          ${revenueChart}
        </section>

        <section class="overview-card">
          <div class="overview-card-head">
            <div>
              <h3>Lượt truy cập</h3>
              <span>14 ngày gần nhất</span>
            </div>
            <strong>${visitors.today || 0}</strong>
          </div>
          <div class="overview-mini-stats">
            <div><span>7 ngày</span><strong>${visitors.week || 0}</strong></div>
            <div><span>${monthLabel}</span><strong>${visitors.month || 0}</strong></div>
            <div><span>Năm nay</span><strong>${visitors.year || 0}</strong></div>
          </div>
          ${visitorChart}
        </section>

        <section class="overview-card">
          <div class="overview-card-head">
            <div>
              <h3>Kho hệ thống</h3>
              <span>${accounts.length} tài nguyên</span>
            </div>
            <strong>${availableStock}</strong>
          </div>
          <div class="overview-inventory">
            ${overviewInventoryRow('Sẵn sàng', availableStock, accounts.length, 'good')}
            ${overviewInventoryRow('Đã giao / đầy slot', assignedStock, accounts.length, 'info')}
            ${overviewInventoryRow('Lỗi thanh toán', paymentIssueStock, accounts.length, 'warn')}
            ${overviewInventoryRow('Dead / mất gói', deadStock, accounts.length, 'bad')}
          </div>
        </section>

        <section class="overview-card">
          <div class="overview-card-head">
            <div>
              <h3>Người dùng</h3>
              <span>Tăng trưởng tài khoản</span>
            </div>
            <strong>${users.total || profiles.length}</strong>
          </div>
          <div class="overview-mini-stats overview-mini-stats--stack">
            <div><span>Hôm nay</span><strong>+${users.today || 0}</strong></div>
            <div><span>7 ngày qua</span><strong>+${users.week || 0}</strong></div>
            <div><span>${monthLabel}</span><strong>+${users.month || 0}</strong></div>
            <div><span>Khách mua hàng</span><strong>${stats.customers || 0}</strong></div>
          </div>
        </section>

        <section class="overview-card">
          <div class="overview-card-head">
            <div>
              <h3>Thao tác nhanh</h3>
              <span id="adminQuickResult">Chọn tác vụ cần chạy</span>
            </div>
          </div>
          <div class="admin-v2-quick overview-quick">
            <button class="admin-v2-quick-btn" data-action="run-health">${iconSearch()} Kiểm tra kho</button>
            <button class="admin-v2-quick-btn" data-action="run-expiry">${iconClock()} Chạy hết hạn</button>
            <button class="admin-v2-quick-btn" data-action="cancel-pending">${iconTrash()} Huỷ đơn chờ</button>
            <button class="admin-v2-quick-btn" data-action="test-telegram">${iconSend()} Test Telegram</button>
          </div>
        </section>
      </div>

      <section class="overview-card overview-orders-card">
        <div class="overview-card-head">
          <div>
            <h3>Đơn gần đây</h3>
            <span>${successPayments} thanh toán thành công, ${cancelledOrders} đơn đã huỷ</span>
          </div>
        </div>
        ${table(['Mã đơn', 'Khách', 'Gói', 'Trạng thái', 'Tạo lúc'], recentOrders.map(row => [
          code(row.id),
          customerEmail(row.user_id, row.user_email),
          planName(row.plan),
          badge(row.status),
          formatDate(row.created_at),
        ]))}
      </section>
    </div>
  `
}

function overviewKpi(label, value, tone, icon, hint) {
  return `
    <div class="overview-kpi overview-kpi--${attr(tone)}">
      <div class="overview-kpi-icon">${icon}</div>
      <div>
        <span>${esc(label)}</span>
        <strong>${esc(String(value))}</strong>
        <small>${esc(hint || '')}</small>
      </div>
    </div>
  `
}

function overviewInventoryRow(label, value, total, tone) {
  const pct = total ? Math.min(100, Math.round((Number(value || 0) / total) * 100)) : 0
  return `
    <div class="overview-inventory-row overview-inventory-row--${attr(tone)}">
      <div><span>${esc(label)}</span><strong>${esc(String(value || 0))}</strong></div>
      <div class="overview-inventory-track"><span style="width:${pct}%"></span></div>
    </div>
  `
}

function renderOrders() {
  const flt  = getFlt('orders')
  const all  = state.data.subscriptions
    .filter(r => {
      // Use embedded plan info first, then fall back to map lookup
      const planInfo = r.plans || state.maps.plans.get(r.plan)
      if (!planInfo) return true  // Unknown plan → legacy Netflix order
      return (planInfo.service || 'netflix') === 'netflix'
    })
    .map(r => ({ ...r, _searchText: `${r.id} ${customerEmail(r.user_id, r.user_email)} ${planName(r.plan)}` }))
  const { items, total } = paginate(all, 'orders')

  return `
    ${panelHeader('Đơn hàng', 'Lọc, kích hoạt, đánh dấu hết hạn và cập nhật login link cho subscription.')}
    <div class="admin-v2-panel-block">
      <div class="admin-v2-toolbar">
        <input data-tab-search="orders" placeholder="Tìm mã đơn / email" value="${attr(flt.search)}" style="min-width:200px;">
        <select data-tab-status="orders">
          ${tabStatusOptions(flt.status, [['', 'Tất cả trạng thái'], ['pending', 'Chờ xử lý'], ['active', 'Đang active'], ['expired', 'Hết hạn'], ['cancelled', 'Đã huỷ']])}
        </select>
      </div>
    </div>
    ${table(
      ['Mã đơn', 'Khách', 'Gói', 'Trạng thái', 'Tạo lúc', 'Hết hạn', 'Còn lại', 'Login link', 'Hành động'],
      items.map(r => {
        const left = daysLeft(r.end_at)
        return [
          code(r.id),
          customerEmail(r.user_id, r.user_email),
          planName(r.plan),
          badge(r.status),
          formatDate(r.created_at),
          formatDate(r.end_at),
          left == null ? '-' : `${left} ngày`,
          `<input class="admin-v2-inline-input" data-sub-link="${attr(r.id)}" value="${attr(r.login_link || '')}" placeholder="Nhập link">`,
          `<div class="admin-v2-row-actions">
            <button class="btn btn-sm btn-primary" data-action="save-link" data-id="${attr(r.id)}">Lưu link</button>
            ${r.status === 'pending' ? `<button class="btn btn-sm btn-success" data-action="activate-sub" data-id="${attr(r.id)}">Kích hoạt</button>` : ''}
            ${r.status === 'active' ? `<button class="btn btn-sm btn-danger" data-action="expire-sub" data-id="${attr(r.id)}">Hết hạn</button>` : ''}
            <button class="btn btn-sm btn-outline" data-action="view-order" data-id="${attr(r.id)}">Chi tiết</button>
          </div>`,
        ]
      })
    )}
    ${paginationBar('orders', total)}
  `
}

function renderSpOrders() {
  const flt  = getFlt('spOrders')
  const all  = state.data.subscriptions
    .filter(r => {
      const planInfo = r.plans || state.maps.plans.get(r.plan)
      return planInfo && (planInfo.service || 'netflix') !== 'netflix' && ['stock', 'key'].includes(planInfo.fulfillment_type)
    })
    .map(r => ({ ...r, _searchText: `${r.id} ${customerEmail(r.user_id, r.user_email)} ${planName(r.plan)}` }))
  const { items, total } = paginate(all, 'spOrders')

  return `
    ${panelHeader('Đơn sản phẩm tự động (Stock/Key)', 'Quản lý các đơn mua mã Code, Key, Link giao tự động từ kho.')}
    <div class="admin-v2-panel-block">
      <div class="admin-v2-toolbar">
        <input data-tab-search="spOrders" placeholder="Tìm mã đơn / email" value="${attr(flt.search)}" style="min-width:200px;">
        <select data-tab-status="spOrders">
          ${tabStatusOptions(flt.status, [['', 'Tất cả trạng thái'], ['pending', 'Chờ thanh toán'], ['processing', 'Chờ admin'], ['active', 'Đã giao'], ['expired', 'Hết hạn'], ['cancelled', 'Đã huỷ']])}
        </select>
      </div>
    </div>
    ${table(
      ['Mã đơn', 'Khách', 'Gói', 'Trạng thái', 'Tạo lúc', 'Nội dung giao', 'Hành động'],
      items.map(r => {
        return [
          code(r.id),
          customerEmail(r.user_id, r.user_email),
          planName(r.plan),
          badge(r.status),
          formatDate(r.created_at),
          `<input class="admin-v2-inline-input" data-sub-link="${attr(r.id)}" value="${attr(r.login_link || '')}" placeholder="Chưa giao (tự động điền)">`,
          `<div class="admin-v2-row-actions">
            ${r.status === 'processing' || r.status === 'pending'
              ? `<button class="btn btn-sm btn-success" data-action="deliver-sp-order" data-id="${attr(r.id)}">Giao</button>`
              : `<button class="btn btn-sm btn-primary" data-action="save-link" data-id="${attr(r.id)}">Lưu</button>`}
            <button class="btn btn-sm btn-outline" data-action="view-order" data-id="${attr(r.id)}">Chi tiết</button>
          </div>`,
        ]
      })
    )}
    ${paginationBar('spOrders', total)}
  `
}

function renderDvOrders() {
  const flt  = getFlt('dvOrders')
  const all  = state.data.subscriptions
    .filter(r => {
      const planInfo = r.plans || state.maps.plans.get(r.plan)
      return planInfo && (planInfo.service || 'netflix') !== 'netflix' && !['stock', 'key'].includes(planInfo.fulfillment_type)
    })
    .map(r => ({ ...r, _searchText: `${r.id} ${customerEmail(r.user_id, r.user_email)} ${planName(r.plan)}` }))
  const { items, total } = paginate(all, 'dvOrders')

  return `
    ${panelHeader('Đơn hàng dịch vụ', 'Quản lý các đơn hàng dịch vụ (cấp tài khoản, gia hạn...).')}
    <div class="admin-v2-panel-block">
      <div class="admin-v2-toolbar">
        <input data-tab-search="dvOrders" placeholder="Tìm mã đơn / email" value="${attr(flt.search)}" style="min-width:200px;">
        <select data-tab-status="dvOrders">
          ${tabStatusOptions(flt.status, [['', 'Tất cả trạng thái'], ['pending', 'Chờ thanh toán'], ['processing', 'Chờ admin'], ['active', 'Đã giao'], ['expired', 'Hết hạn'], ['cancelled', 'Đã huỷ']])}
        </select>
      </div>
    </div>
    ${table(
      ['Mã đơn', 'Khách', 'Gói', 'Trạng thái', 'Tạo lúc', 'Hết hạn', 'Còn lại', 'Nội dung giao', 'Ghi chú admin', 'Hành động'],
      items.map(r => {
        const left = daysLeft(r.end_at)
        const isPending = r.status === 'pending' || r.status === 'processing'
        return [
          code(r.id),
          customerEmail(r.user_id, r.user_email),
          planName(r.plan),
          badge(r.status),
          formatDate(r.created_at),
          formatDate(r.end_at),
          left == null ? '-' : `${left} ngày`,
          // Delivery content
          isPending
            ? `<span class="admin-v2-muted" style="font-size:11px;">Chưa giao</span>`
            : `<input class="admin-v2-inline-input" data-sub-link="${attr(r.id)}" value="${attr(r.login_link || '')}" placeholder="Link / Tài khoản">`,
          // Admin note to customer
          isPending
            ? `<span class="admin-v2-muted" style="font-size:11px;">—</span>`
            : `<input class="admin-v2-inline-input" data-sub-note="${attr(r.id)}" value="${attr(r.admin_note || '')}" placeholder="Lời nhắn cho khách">`,
          // Actions
          `<div class="admin-v2-row-actions">
            ${isPending ? `
              <button class="btn btn-sm btn-success" data-action="deliver-dv-order" data-id="${attr(r.id)}" style="background:#16a34a;color:#fff;">
                🚀 Giao hàng
              </button>
              <button class="btn btn-sm btn-danger" data-action="reject-dv-order" data-id="${attr(r.id)}" style="background:#dc2626;color:#fff;">
                ❌ Từ chối
              </button>
            ` : `
              <button class="btn btn-sm btn-primary" data-action="save-dv-delivery" data-id="${attr(r.id)}">Lưu</button>
              <button class="btn btn-sm btn-danger" data-action="expire-sub" data-id="${attr(r.id)}">Hết hạn</button>
            `}
            <button class="btn btn-sm btn-outline" data-action="view-order" data-id="${attr(r.id)}">Chi tiết</button>
          </div>`,
        ]
      })
    )}
    ${paginationBar('dvOrders', total)}
  `
}

// ── Payments ──────────────────────────────────────────────────────────────────

function renderDvOrdersV2() {
  const flt = getFlt('dvOrders')
  const all = state.data.subscriptions
    .filter(r => {
      const planInfo = r.plans || state.maps.plans.get(r.plan)
      return planInfo && (planInfo.service || 'netflix') !== 'netflix' && !['stock', 'key'].includes(planInfo.fulfillment_type)
    })
    .map(r => {
      const planInfo = r.plans || state.maps.plans.get(r.plan) || {}
      return {
        ...r,
        _planInfo: planInfo,
        _searchText: `${r.id} ${customerEmail(r.user_id, r.user_email)} ${planName(r.plan)} ${planInfo.service || ''} ${r.login_link || ''} ${r.admin_note || ''}`
      }
    })
    .sort((a, b) => {
      const rank = { processing: 0, pending: 1, active: 2, expired: 3, cancelled: 4 }
      const ar = rank[a.status] ?? 9
      const br = rank[b.status] ?? 9
      if (ar !== br) return ar - br
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    })
  const { items, total } = paginate(all, 'dvOrders')
  const counts = all.reduce((acc, r) => {
    acc.total++
    acc[r.status || 'unknown'] = (acc[r.status || 'unknown'] || 0) + 1
    return acc
  }, { total: 0, pending: 0, processing: 0, active: 0, expired: 0, cancelled: 0 })

  return `
    ${panelHeader('Đơn hàng dịch vụ', 'Xử lý đơn thủ công: kiểm tra thanh toán, giao nội dung, ghi chú cho khách và hết hạn dịch vụ.')}
    <div class="admin-service-metrics">
      ${metric('Cần giao', counts.processing, 'amber', iconInbox())}
      ${metric('Chờ thanh toán', counts.pending, 'violet', iconCard())}
      ${metric('Đã giao', counts.active, 'green', iconBox())}
      ${metric('Hết hạn / hủy', (counts.expired || 0) + (counts.cancelled || 0), 'red', iconBell())}
    </div>
    <div class="admin-v2-panel-block admin-service-toolbar">
      <div class="admin-v2-toolbar">
        <input data-tab-search="dvOrders" placeholder="Tìm mã đơn, email, gói, nội dung..." value="${attr(flt.search)}" style="min-width:260px;">
        <select data-tab-status="dvOrders">
          ${tabStatusOptions(flt.status, [['', 'Tất cả trạng thái'], ['processing', 'Cần giao'], ['pending', 'Chờ thanh toán'], ['active', 'Đã giao'], ['expired', 'Hết hạn'], ['cancelled', 'Đã hủy']])}
        </select>
        <span class="admin-v2-muted admin-service-toolbar__meta">Đang hiển thị ${items.length} / ${total} đơn khớp bộ lọc</span>
      </div>
    </div>
    <div class="admin-service-orders">
      ${items.length ? items.map(renderDvOrderCard).join('') : `
        <div class="admin-v2-empty admin-service-empty">
          <h2>Không có đơn phù hợp</h2>
          <p>Thử bộ lọc trạng thái hoặc tìm theo email/mã đơn khác.</p>
        </div>
      `}
    </div>
    ${paginationBar('dvOrders', total)}
  `
}

function renderDvOrderCard(r) {
  const planInfo = r._planInfo || r.plans || state.maps.plans.get(r.plan) || {}
  const left = daysLeft(r.end_at)
  const status = String(r.status || '').toLowerCase()
  const isProcessing = status === 'processing'
  const isPending = status === 'pending'
  const isActive = status === 'active'
  const isClosed = status === 'expired' || status === 'cancelled'
  const service = planInfo.service || 'service'
  const delivered = String(r.login_link || '').trim()
  const note = String(r.admin_note || '').trim()
  const customerContact = String(r.customer_contact_email || '').trim()
  const customerNote = String(r.customer_note || '').trim()
  const actionHint = isPending
    ? 'Đơn chưa sẵn sàng giao. Chỉ giao khi đã xác nhận thanh toán hoặc chuyển sang Chờ admin.'
    : isProcessing
      ? 'Nhập nội dung giao cho khách rồi bấm Giao hàng.'
      : isActive
        ? 'Có thể chỉnh nội dung giao hoặc ghi chú, sau đó bấm Lưu.'
        : 'Đơn đã đóng. Nội dung chỉ để đối soát.'

  return `
    <article class="admin-service-card admin-service-card--${attr(status || 'unknown')}">
      <div class="admin-service-card__main">
        <div class="admin-service-card__head">
          <div class="admin-service-card__title">
            ${code(r.id)}
            <strong>${planName(r.plan)}</strong>
            <span class="admin-service-chip">${esc(service)}</span>
          </div>
          ${badge(r.status)}
        </div>
        <div class="admin-service-meta">
          <div><span>Khách</span><strong>${customerEmail(r.user_id, r.user_email)}</strong></div>
          <div><span>Tạo lúc</span><strong>${formatDate(r.created_at)}</strong></div>
          <div><span>Bắt đầu</span><strong>${formatDate(r.start_at)}</strong></div>
          <div><span>Hết hạn</span><strong>${formatDate(r.end_at)}</strong></div>
          <div><span>Còn lại</span><strong>${left == null ? '-' : `${left} ngày`}</strong></div>
        </div>
        ${(customerContact || customerNote) ? `
          <div class="admin-service-customer-note">
            <span>Yêu cầu từ khách</span>
            ${customerContact ? `<strong>${esc(customerContact)}</strong>` : ''}
            ${customerNote ? `<p>${esc(customerNote)}</p>` : ''}
          </div>
        ` : ''}
        <div class="admin-service-hint">${esc(actionHint)}</div>
      </div>
      <div class="admin-service-card__work">
        <label class="admin-service-field">
          <span>Nội dung giao cho khách</span>
          <textarea class="admin-v2-inline-input admin-service-textarea" data-sub-link="${attr(r.id)}" rows="4" ${isClosed ? 'readonly' : ''} placeholder="Email / mật khẩu / link / mã kích hoạt...">${esc(delivered)}</textarea>
        </label>
        <label class="admin-service-field">
          <span>Ghi chú / hướng dẫn cho khách</span>
          <textarea class="admin-v2-inline-input admin-service-textarea admin-service-textarea--note" data-sub-note="${attr(r.id)}" rows="3" ${isClosed ? 'readonly' : ''} placeholder="Ví dụ: Không đổi mật khẩu. Liên hệ shop nếu gặp lỗi.">${esc(note)}</textarea>
        </label>
        <div class="admin-service-actions">
          ${isProcessing ? `<button class="btn btn-sm btn-success" data-action="deliver-dv-order" data-id="${attr(r.id)}">Giao hàng</button>` : ''}
          ${isPending ? `<button class="btn btn-sm btn-outline" data-action="move-dv-processing" data-id="${attr(r.id)}">Chuyển cho admin</button>` : ''}
          ${isActive ? `<button class="btn btn-sm btn-primary" data-action="save-dv-delivery" data-id="${attr(r.id)}">Lưu thay đổi</button>` : ''}
          ${isPending || isProcessing ? `<button class="btn btn-sm btn-danger" data-action="reject-dv-order" data-id="${attr(r.id)}">Hủy / từ chối</button>` : ''}
          ${isActive ? `<button class="btn btn-sm btn-outline" data-action="expire-sub" data-id="${attr(r.id)}">Hết hạn</button>` : ''}
          <button class="btn btn-sm btn-outline" data-action="view-order" data-id="${attr(r.id)}">Chi tiết</button>
        </div>
      </div>
    </article>
  `
}

function renderPayments() {
  const flt  = getFlt('payments')
  const all  = state.data.payments.map(r => ({ ...r, _searchText: `${customerEmail(r.user_id, r.user_email)} ${r.transfer_content || ''}` }))
  const { items, total } = paginate(all, 'payments')

  return `
    ${panelHeader('Thanh toán', 'Đối soát giao dịch và xử lý trạng thái thanh toán.')}
    <div class="admin-v2-panel-block">
      <div class="admin-v2-toolbar">
        <input data-tab-search="payments" placeholder="Tìm email / nội dung CK" value="${attr(flt.search)}" style="min-width:200px;">
        <select data-tab-status="payments">
          ${tabStatusOptions(flt.status, [['', 'Tất cả trạng thái'], ['pending', 'Chờ xử lý'], ['success', 'Thành công'], ['fail', 'Thất bại']])}
        </select>
      </div>
    </div>
    ${table(
      ['Khách', 'Gói', 'Số tiền', 'Nội dung CK', 'Trạng thái', 'Thời gian', 'Hành động'],
      items.map(r => [
        customerEmail(r.user_id, r.user_email),
        planName(r.plan),
        formatVND(r.amount || 0),
        `<code>${esc(r.transfer_content || '-')}</code>`,
        badge(r.status),
        formatDate(r.created_at),
        r.status === 'pending'
          ? `<div class="admin-v2-row-actions">
              <button class="btn btn-sm btn-success" data-action="confirm-pay" data-id="${attr(r.id)}">Xác nhận</button>
              <button class="btn btn-sm btn-danger" data-action="reject-pay" data-id="${attr(r.id)}">Từ chối</button>
            </div>`
          : `<span class="admin-v2-muted">Đã xử lý</span>`,
      ])
    )}
    ${paginationBar('payments', total)}
  `
}

// ── Accounts ──────────────────────────────────────────────────────────────────

const NF_META = { label: 'Netflix', color: '#E50914', bg: 'rgba(229,9,20,0.10)' }
const ALL_SVC_META = { netflix: NF_META, ...SVC_META }

function isNetflixAccountResource(row) {
  return (row?.service || 'netflix') === 'netflix' && (row?.account_type || 'shared') !== 'stock'
}

function isProductStockResource(row, stockPlanIds = null) {
  if (!row || row.account_type !== 'stock') return false
  if ((row.service || 'other') === 'netflix') return false
  if (row.stock_mode === 'quantity' || /^QTY:/i.test(String(row.value || ''))) return false
  return !stockPlanIds || !row.plan_id || stockPlanIds.has(row.plan_id)
}

function isReadyNetflixAccount(row) {
  return isNetflixAccountResource(row) && row.status === 'available' && !accountHasPaymentIssue(row)
}

function _renderAccountsLegacy() {
  const flt    = getFlt('accounts')
  const svcFlt = flt.svc === 'netflix' ? 'netflix' : 'all'
  const allAcc = state.data.accounts.filter(isNetflixAccountResource)

  // Service breakdown
  const svcBreak = {}
  for (const r of allAcc) {
    const sv = r.service || 'netflix'
    if (!svcBreak[sv]) svcBreak[sv] = { avail: 0, dead: 0, total: 0 }
    svcBreak[sv].total++
    if (isReadyNetflixAccount(r)) svcBreak[sv].avail++
    if (r.status === 'dead')      svcBreak[sv].dead++
  }

  // Filtered rows
  let rows = svcFlt === 'all' ? allAcc : allAcc.filter(r => (r.service || 'netflix') === svcFlt)
  const all = rows.map(r => ({
    ...r,
    _searchText: `${r.value || ''} ${r.note || ''} ${r.account_email || ''} ${r.service || ''}`,
  }))
  const { items, total } = paginate(all, 'accounts')

  const svcList = [...new Set(allAcc.map(r => r.service || 'netflix'))]
  const svcSelectOpts = [
    `<option value="netflix">Netflix</option>`,
    ...Object.entries(SVC_META).filter(([k]) => k !== 'other').map(([k,m]) => `<option value="${attr(k)}">${esc(m.label)}</option>`),
    `<option value="other">Khác</option>`,
  ].join('')

  return `
    ${panelHeader('Kho tài khoản', 'Quản lý cookie/account và tài nguyên stock để cấp phát cho khách.')}

    <div class="admin-v2-metrics">
      ${metric('Tổng tài nguyên', allAcc.length, 'blue', '🗄️')}
      ${metric('Sẵn sàng', allAcc.filter(isReadyNetflixAccount).length, 'green', '🟢')}
      ${metric('Đã giao', allAcc.filter(r=>r.status==='assigned'||r.status==='full').length, 'violet', '🔵')}
      ${metric('Lỗi TT', allAcc.filter(r=>accountHasPaymentIssue(r)).length, 'amber', '🚫')}
      ${metric('Lỗi / chết', allAcc.filter(r=>r.status==='dead').length, 'red', '💀')}
    </div>

    <!-- Service breakdown strip -->
    <div class="acc-svc-strip">
      <button class="acc-svc-chip${svcFlt === 'all' ? ' active' : ''}" data-action="acc-svc-filter" data-svc="all">
        Tất cả <span class="acc-chip-count">${allAcc.length}</span>
      </button>
      ${svcList.map(sv => {
        const m  = ALL_SVC_META[sv] || SVC_META.other
        const st = svcBreak[sv] || {}
        return `
          <button class="acc-svc-chip${svcFlt === sv ? ' active' : ''}"
            data-action="acc-svc-filter" data-svc="${attr(sv)}"
            style="--ac:${m.color}">
            ${esc(m.label)}
            <span class="acc-chip-count">
              <span style="color:#4ade80">${st.avail||0}</span>/<span>${st.total||0}</span>
            </span>
          </button>`
      }).join('')}
    </div>

    <!-- Add forms -->
    <div class="admin-v2-grid-2">
      <section class="admin-v2-card">
        <div class="admin-v2-card-head">
          <h3>Thêm tài khoản</h3>
          <span class="admin-v2-muted">Netflix: tự động kiểm tra live + có gói</span>
        </div>
        <div class="admin-v2-form">
          <textarea id="accValue" rows="3" placeholder="Cookie Netflix hoặc email:pass:cookie..."></textarea>
          <div class="acc-add-row">
            <select id="accService" class="select" style="width:auto">${svcSelectOpts}</select>
            <select id="accAccountType" class="select" style="width:auto">
              <option value="shared">Shared</option>
              <option value="private">Private</option>
            </select>
            <input id="accSlots" type="number" min="1" max="20" value="5" class="input" style="width:70px" placeholder="Slots">
            <input id="accNote" class="input" style="flex:1" placeholder="Ghi chú (tuỳ chọn)">
          </div>
          <button class="btn btn-primary" data-action="add-account">Kiểm tra và thêm vào kho</button>
          <div id="accAddResult" class="admin-v2-check-result"></div>
        </div>
      </section>
      <section class="admin-v2-card">
        <div class="admin-v2-card-head">
          <h3>Import hàng loạt</h3>
          <span class="admin-v2-muted">Mỗi dòng 1 giá trị — Netflix tự lọc dead/không gói</span>
        </div>
        <div class="admin-v2-form">
          <textarea id="accBulkValues" rows="4" placeholder="Mỗi dòng một tài khoản..."></textarea>
          <div style="display:flex;gap:8px">
            <select id="accBulkService" class="select" style="width:auto">${svcSelectOpts}</select>
            <button class="btn btn-outline" style="flex:1" data-action="bulk-account">Import + Kiểm tra tất cả</button>
          </div>
          <div id="accBulkResult" class="admin-v2-check-result"></div>
        </div>
      </section>
    </div>

    <!-- Toolbar: filters + batch actions -->
    <div class="acc-toolbar-wrap">
      <div class="acc-toolbar-left">
        <input class="input" style="max-width:220px" data-tab-search="accounts"
          placeholder="Tìm cookie / email / ghi chú" value="${attr(flt.search)}">
        <select class="select" data-tab-status="accounts" style="width:auto">
          ${tabStatusOptions(flt.status, [['','Tất cả trạng thái'],['available','Sẵn sàng'],['payment','Lỗi TT'],['full','Đầy slot'],['assigned','Đã giao'],['dead','Lỗi/chết']])}
        </select>
        <span class="admin-v2-muted" style="font-size:12px">${total} kết quả</span>
      </div>
      <div class="acc-batch-bar">
        <label class="acc-select-all-label">
          <input type="checkbox" id="accSelectAll" data-action="select-all-accounts">
          <span id="accSelCount" class="admin-v2-muted" style="font-size:12px;white-space:nowrap">Chọn tất cả</span>
        </label>
        <button class="btn btn-sm btn-outline" data-action="batch-check-accounts" title="Kiểm tra live tài khoản đã chọn">🔍 Kiểm tra</button>
        <button class="btn btn-sm btn-outline" data-action="batch-mark-dead-accounts" title="Đánh dấu dead các tài khoản đã chọn">💀 Đánh lỗi</button>
        <button class="btn btn-sm btn-danger" data-action="batch-delete-accounts">🗑 Xoá</button>
        <div class="acc-batch-sep"></div>
        <button class="btn btn-sm btn-primary" data-action="check-all-available" title="Kiểm tra live tất cả tài khoản đang sẵn sàng">✅ Kiểm tra kho</button>
        <div id="accBatchProgress" style="font-size:11px;color:#94a3b8"></div>
      </div>
    </div>

    ${table(
      ['☐', 'Tài nguyên / Email', 'Service', 'Slots', 'Trạng thái', 'Hết hạn / Gói', 'Hành động'],
      items.map(r => {
        const m = ALL_SVC_META[r.service || 'netflix'] || SVC_META.other
        return [
          `<input type="checkbox" class="acc-row-check" data-select-row="${attr(r.id)}">`,
          `<div class="acc-val-cell">
            <div class="acc-cookie-row">
              <code class="acc-cookie-code" title="${attr(r.value||'')}">${esc(shortText(r.value, 34))}</code>
              <button class="btn-icon" data-action="copy-account" data-value="${attr(r.value||'')}" title="Copy cookie">📋</button>
              <button class="btn-icon" data-action="view-account" data-id="${attr(r.id)}" title="Chi tiết">👁</button>
            </div>
            ${r.account_email ? `<span class="admin-v2-muted" style="font-size:11px">${esc(r.account_email)}</span>` : ''}
            ${r.note ? `<span class="admin-v2-muted" style="font-size:11px"> · ${esc(r.note)}</span>` : ''}
          </div>`,
          `<span class="acc-svc-label" style="--c:${m.color};--bg:${m.bg}">${esc(m.label)}</span>`,
          `${Number(r.assigned_count||0)} / ${Number(r.max_slots||1)}`,
          `<span id="acc-status-${attr(r.id)}">${accountStatusBadge(r)}</span>`,
          r.billing_text
            ? `<div style="font-size:12px"><span class="tone-good">${esc(r.billing_text)}</span>${r.plan_name?`<br><span class="admin-v2-muted">${esc(r.plan_name)}</span>`:''}</div>`
            : `<span class="admin-v2-muted">${r.plan_name?esc(r.plan_name):'—'}</span>`,
          `<div class="admin-v2-row-actions">
            <button class="btn btn-sm btn-outline" data-action="check-account" data-id="${attr(r.id)}" title="Kiểm tra live + gói">🔍</button>
            ${r.status !== 'available' ? `<button class="btn btn-sm btn-success" data-action="account-status" data-id="${attr(r.id)}" data-status="available" title="Mở lại">✅</button>` : ''}
            ${r.status !== 'dead' ? `<button class="btn btn-sm btn-outline" data-action="account-status" data-id="${attr(r.id)}" data-status="dead" title="Đánh lỗi">💀</button>` : ''}
            <button class="btn btn-sm btn-danger" data-action="delete-account" data-id="${attr(r.id)}">Xoá</button>
          </div>`,
        ]
      })
    )}
    ${paginationBar('accounts', total)}
  `
}

function getSelectedAccountIds() {
  return [...(state.content?.querySelectorAll('.acc-row-check:checked') || [])]
    .map(el => el.dataset.selectRow).filter(Boolean)
}

function renderAccountsV3() {
  const flt = getFlt('accounts')
  const svcFlt = flt.svc === 'netflix' ? 'netflix' : 'all'
  const allAcc = (state.data.accounts || []).filter(isNetflixAccountResource)
  const svcBreak = {}
  for (const row of allAcc) {
    const svc = row.service || 'netflix'
    if (!svcBreak[svc]) svcBreak[svc] = { total: 0, avail: 0, dead: 0 }
    svcBreak[svc].total++
    if (isReadyNetflixAccount(row)) svcBreak[svc].avail++
    if (row.status === 'dead') svcBreak[svc].dead++
  }

  const rows = svcFlt === 'all' ? allAcc : allAcc.filter(row => (row.service || 'netflix') === svcFlt)
  const indexed = rows.map(row => ({
    ...row,
    _searchText: `${row.value || ''} ${row.note || ''} ${row.account_email || ''} ${row.service || ''} ${row.plan_name || ''}`,
  }))
  const { items, total } = paginate(indexed, 'accounts')
  const svcList = [...new Set(allAcc.map(row => row.service || 'netflix'))]
  return `
    <div class="accounts-page">
      <div class="accounts-hero">
        <div>
          <span class="admin-v2-kicker">Inventory</span>
          <h1>Kho tài khoản</h1>
          <p>Quản lý cookie/account, kiểm tra gói Netflix và cấp phát tài nguyên cho đơn hàng.</p>
        </div>
        <button type="button" class="btn btn-sm btn-outline" data-action="refresh">${iconRefresh()} Làm mới</button>
      </div>

      <div class="admin-v2-metrics accounts-metrics">
        ${metric('Tổng tài nguyên', allAcc.length, 'blue', iconDatabase())}
        ${metric('Sẵn sàng', allAcc.filter(isReadyNetflixAccount).length, 'green', iconInbox())}
        ${metric('Đã giao', allAcc.filter(row => row.status === 'assigned' || row.status === 'full').length, 'violet', iconUsers())}
        ${metric('Lỗi thanh toán', allAcc.filter(accountHasPaymentIssue).length, 'amber', iconCard())}
        ${metric('Lỗi / chết', allAcc.filter(row => row.status === 'dead').length, 'red', iconBell())}
      </div>

      <div class="acc-svc-strip accounts-service-strip">
        <button class="acc-svc-chip${svcFlt === 'all' ? ' active' : ''}" data-action="acc-svc-filter" data-svc="all">
          Tất cả <span class="acc-chip-count">${allAcc.length}</span>
        </button>
        ${svcList.map(svc => {
          const meta = ALL_SVC_META[svc] || SVC_META.other
          const count = svcBreak[svc] || {}
          return `
            <button class="acc-svc-chip${svcFlt === svc ? ' active' : ''}" data-action="acc-svc-filter" data-svc="${attr(svc)}" style="--ac:${meta.color}">
              ${esc(meta.label)}
              <span class="acc-chip-count"><span class="acc-chip-count-ok">${count.avail || 0}</span>/<span>${count.total || 0}</span></span>
            </button>
          `
        }).join('')}
      </div>

      <div class="acc-toolbar-wrap accounts-toolbar">
        <div class="acc-toolbar-left">
          <input class="input" data-tab-search="accounts" placeholder="Tìm cookie / email / ghi chú" value="${attr(flt.search)}">
          <select class="select" data-tab-status="accounts">
            ${tabStatusOptions(flt.status, [['','Tất cả trạng thái'],['available','Sẵn sàng'],['payment','Lỗi thanh toán'],['full','Đầy slot'],['assigned','Đã giao'],['dead','Lỗi/chết']])}
          </select>
          <span class="accounts-result-count">${total} kết quả</span>
        </div>
        <div class="acc-batch-bar">
          <label class="acc-select-all-label">
            <input type="checkbox" id="accSelectAll" data-action="select-all-accounts">
            <span id="accSelCount">Chọn tất cả</span>
          </label>
          <button class="btn btn-sm btn-outline" data-action="batch-check-accounts" title="Kiểm tra live tài khoản đã chọn">${iconSearch()} Kiểm tra</button>
          <button class="btn btn-sm btn-outline" data-action="batch-mark-dead-accounts" title="Đánh dấu dead các tài khoản đã chọn">${iconBell()} Đánh lỗi</button>
          <button class="btn btn-sm btn-danger" data-action="batch-delete-accounts">${iconTrash()} Xoá</button>
          <div class="acc-batch-sep"></div>
          <button class="btn btn-sm btn-primary" data-action="check-all-available" title="Kiểm tra live tài khoản Netflix đang sẵn sàng">Kiểm tra kho</button>
          <div id="accBatchProgress"></div>
        </div>
      </div>

      ${table(
        ['', 'Tài nguyên / Email', 'Service', 'Slots', 'Trạng thái', 'Hết hạn / Gói', 'Hành động'],
        items.map(row => {
          const meta = ALL_SVC_META[row.service || 'netflix'] || SVC_META.other
          return [
            `<input type="checkbox" class="acc-row-check" data-select-row="${attr(row.id)}">`,
            `<div class="acc-val-cell">
              <div class="acc-cookie-row">
                <code class="acc-cookie-code" title="${attr(row.value || '')}">${esc(shortText(row.value, 34))}</code>
                <button class="btn-icon" data-action="copy-account" data-value="${attr(row.value || '')}" title="Copy cookie">${iconFile()}</button>
                <button class="btn-icon" data-action="view-account" data-id="${attr(row.id)}" title="Chi tiết">${iconSearch()}</button>
              </div>
              ${row.account_email ? `<span class="admin-v2-muted">${esc(row.account_email)}</span>` : ''}
              ${row.note ? `<span class="admin-v2-muted">${esc(row.note)}</span>` : ''}
            </div>`,
            `<span class="acc-svc-label" style="--c:${meta.color};--bg:${meta.bg}">${esc(meta.label)}</span>`,
            `<span class="accounts-slot">${Number(row.assigned_count || 0)} / ${Number(row.max_slots || 1)}</span>`,
            `<span id="acc-status-${attr(row.id)}">${accountStatusBadge(row)}</span>`,
            row.billing_text
              ? `<div class="accounts-plan-cell"><span class="tone-good">${esc(row.billing_text)}</span>${row.plan_name ? `<span class="admin-v2-muted">${esc(row.plan_name)}</span>` : ''}</div>`
              : `<span class="admin-v2-muted">${row.plan_name ? esc(row.plan_name) : '-'}</span>`,
            `<div class="admin-v2-row-actions">
              <button class="btn btn-sm btn-outline" data-action="check-account" data-id="${attr(row.id)}" title="Kiểm tra live + gói">${iconSearch()}</button>
              ${row.status !== 'available' ? `<button class="btn btn-sm btn-success" data-action="account-status" data-id="${attr(row.id)}" data-status="available" title="Mở lại">Mở</button>` : ''}
              ${row.status !== 'dead' ? `<button class="btn btn-sm btn-outline" data-action="account-status" data-id="${attr(row.id)}" data-status="dead" title="Đánh lỗi">${iconBell()}</button>` : ''}
              <button class="btn btn-sm btn-danger" data-action="delete-account" data-id="${attr(row.id)}">Xoá</button>
            </div>`,
          ]
        })
      )}
      ${paginationBar('accounts', total)}
    </div>
  `
}

function updateAccBatchCount() {
  const count = state.content?.querySelectorAll('.acc-row-check:checked').length || 0
  const el = state.content?.querySelector('#accSelCount')
  if (el) el.textContent = count > 0 ? `${count} đã chọn` : 'Chọn tất cả'
  const allCb = state.content?.querySelector('#accSelectAll')
  const total = state.content?.querySelectorAll('.acc-row-check').length || 0
  if (allCb) allCb.indeterminate = count > 0 && count < total
}

// ── Users ─────────────────────────────────────────────────────────────────────

function renderUsers() {
  const flt  = getFlt('users')
  const rows = state.data.profiles
  const adminCount    = rows.filter(r => r.role === 'admin').length
  const employeeCount = rows.filter(r => r.role === 'employee').length
  const userCount     = rows.length - adminCount - employeeCount
  const all = rows.map(r => ({ ...r, _searchText: `${r.email || ''} ${r.id || ''}`, status: r.role || 'user' }))
  const { items, total } = paginate(all, 'users')

  return `
    ${panelHeader('Người dùng', 'Quản lý vai trò và xử lý tài khoản khách hàng.')}
    <div class="admin-v2-metrics">
      ${metric('Tổng user', rows.length, 'blue', '👥')}
      ${metric('Admin', adminCount, 'amber', '👑')}
      ${metric('Nhân viên', employeeCount, 'violet', '🛠️')}
      ${metric('Khách hàng', userCount, 'green', '👤')}
    </div>
    <div class="admin-v2-panel-block">
      <div class="admin-v2-toolbar">
        <input data-tab-search="users" placeholder="Tìm email" value="${attr(flt.search)}" style="min-width:200px;">
        <select data-tab-status="users">
          ${tabStatusOptions(flt.status, [['', 'Tất cả role'], ['admin', 'Admin'], ['employee', 'Nhân viên'], ['user', 'User']])}
        </select>
      </div>
    </div>
    ${table(
      ['Email', 'Role', 'Ngày tạo', 'Hành động'],
      items.map(r => [
        `<div><strong>${esc(r.email || '-')}</strong><br><code style="font-size:11px;">${esc(shortText(r.id, 14))}</code></div>`,
        `<select class="admin-v2-select" data-action="change-role" data-id="${attr(r.id)}">
          ${['user', 'employee', 'admin'].map(role => `<option value="${role}"${(r.role || 'user') === role ? ' selected' : ''}>${role}</option>`).join('')}
        </select>`,
        formatDate(r.created_at),
        `<button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${attr(r.id)}">Xoá</button>`,
      ])
    )}
    ${paginationBar('users', total)}
  `
}

// ── Plans ─────────────────────────────────────────────────────────────────────

function renderNfStock() {
  const svcSelectOpts = [
    `<option value="netflix">Netflix</option>`,
    ...Object.entries(SVC_META).filter(([k]) => k !== 'other').map(([k,m]) => `<option value="${attr(k)}">${esc(m.label)}</option>`),
    `<option value="other">Khác</option>`,
  ].join('')

  return `
    ${panelHeader('Nhập kho', 'Thêm tài khoản Netflix hoặc stock cho các dịch vụ khác.')}

    <div class="admin-v2-grid-2">
      <section class="admin-v2-card">
        <div class="admin-v2-card-head">
          <h3>Thêm tài khoản</h3>
          <span class="admin-v2-muted">Netflix: tự động kiểm tra live + có gói</span>
        </div>
        <div class="admin-v2-form">
          <textarea id="accValue" rows="4" placeholder="Cookie Netflix hoặc email:pass:cookie..."></textarea>
          <div class="acc-add-row">
            <select id="accService" class="select" style="width:auto">${svcSelectOpts}</select>
            <select id="accAccountType" class="select" style="width:auto">
              <option value="shared">Shared</option>
              <option value="private">Private</option>
            </select>
            <input id="accSlots" type="number" min="1" max="20" value="5" class="input" style="width:70px" placeholder="Slots">
            <input id="accNote" class="input" style="flex:1" placeholder="Ghi chú (tuỳ chọn)">
          </div>
          <button class="btn btn-primary" data-action="add-account">Kiểm tra và thêm vào kho</button>
          <div id="accAddResult" class="admin-v2-check-result"></div>
        </div>
      </section>

      <section class="admin-v2-card">
        <div class="admin-v2-card-head">
          <h3>Nhập hàng loạt</h3>
          <span class="admin-v2-muted">Mỗi dòng 1 giá trị</span>
        </div>
        <div class="admin-v2-form">
          <textarea id="bulkAccValue" rows="8"
            placeholder="cookie1&#10;cookie2&#10;email:pass:cookie&#10;..."></textarea>
          <div class="acc-add-row">
            <select id="bulkAccService" class="select" style="width:auto">${svcSelectOpts}</select>
            <select id="bulkAccAccountType" class="select" style="width:auto">
              <option value="shared">Shared</option>
              <option value="private">Private</option>
            </select>
            <input id="bulkAccSlots" type="number" min="1" max="20" value="5" class="input" style="width:70px" placeholder="Slots">
          </div>
          <button class="btn btn-primary" data-action="bulk-add-accounts">Nhập hàng loạt</button>
          <div id="bulkAccResult" class="admin-v2-check-result"></div>
        </div>
      </section>
    </div>
  `
}

function renderNfStockV2() {
  const accounts = state.data.accounts || []
  const stockPlans = getStockImportPlans()
  const stockPlanIds = new Set(stockPlans.map(plan => plan.id))
  const stockParams = adminHashParams()

  const stockGroups = stockPlanGroups(stockPlans)
  const resolveStockGroup = (key) => stockGroups.some(group => group.key === key) ? key : (stockGroups[0]?.key || '')
  const stockFilterState = getFlt('nfstock')
  const stockGroupFilter = resolveStockGroup(stockFilterState.stockGroup || stockParams.get('stockProduct'))
  const stockVariantFilter = stockFilterState.stockPlan || stockParams.get('stockVariant') || ''
  stockFilterState.stockGroup = stockGroupFilter
  const visibleStockPlans = stockPlans.filter(plan => stockPlanGroupKey(plan) === stockGroupFilter)
  const selectedStockPlanId = resolveStockPlanId(visibleStockPlans, stockVariantFilter)
  stockFilterState.stockPlan = selectedStockPlanId

  const productPlanOptions = stockPlanOptions(visibleStockPlans, selectedStockPlanId)
  const productServiceOptions = stockProductOptions(stockGroups, stockGroupFilter)

  const netflixReady = accounts.filter(isReadyNetflixAccount).length
  const productStockAccounts = accounts.filter(a => isProductStockResource(a, stockPlanIds))
  const selectedStockPlan = stockPlans.find(plan => plan.id === selectedStockPlanId) || visibleStockPlans[0] || null
  const selectedStockCounts = stockPlanStockCounts(productStockAccounts, selectedStockPlan)
  const showLegacyProductStock = Boolean(window.__showLegacyProductStockImport)
  const productImportCard = showLegacyProductStock ? `
      <section class="admin-v2-card stock-import-card stock-import-card--product">
        <div class="admin-v2-card-head">
          <div>
            <h3>Kho sản phẩm Stock/Key</h3>
            <p class="stock-import-sub">Chọn đúng sản phẩm và biến thể một lần, sau đó nhập một giá trị hoặc nhiều dòng vào cùng kho cấp phát.</p>
          </div>
          <span class="stock-import-badge">Stock/Key</span>
        </div>
        <div class="admin-v2-form stock-import-form">
          <div class="stock-import-context">
            <div class="stock-import-field">
              <label for="stockServiceFilter">Sản phẩm</label>
              <select id="stockServiceFilter" class="select" data-stock-product-filter data-target-plan="stockPlan" aria-label="Sản phẩm" title="Sản phẩm">${productServiceOptions}</select>
            </div>
            <div class="stock-import-field">
              <label for="stockPlan">Biến thể</label>
              <select id="stockPlan" class="select" aria-label="Biến thể" title="Biến thể">${productPlanOptions}</select>
            </div>
            <input type="hidden" id="stockAccountType" value="stock">
            <input type="hidden" id="stockSlots" value="1">
            <div class="stock-import-field">
              <label for="stockNote">Ghi chú chung</label>
              <input id="stockNote" class="input" placeholder="Áp dụng cho giá trị nhập">
            </div>
          </div>
          <div class="stock-import-selection" data-stock-selection-summary>
            ${stockSelectionSummaryContent(selectedStockPlan, selectedStockCounts)}
          </div>
          <div class="stock-import-split">
            <div class="stock-import-column">
              <label class="stock-import-label" for="stockValue">Thêm 1 giá trị</label>
              <textarea id="stockValue" rows="6" placeholder="Email / mật khẩu / link / mã kích hoạt..."></textarea>
              <button class="btn btn-primary stock-import-action" data-action="add-product-stock">Thêm 1 giá trị</button>
              <div id="stockAddResult" class="admin-v2-check-result"></div>
            </div>
            <div class="stock-import-column">
              <div class="stock-import-bulk-head">
                <label class="stock-import-label" for="bulkStockValues">Nhập nhiều giá trị</label>
                <span id="bulkStockCount" class="stock-import-count">0 dòng hợp lệ</span>
              </div>
              <textarea id="bulkStockValues" rows="6" placeholder="Mỗi dòng 1 giá trị&#10;yt-account-1@email.com / pass...&#10;KEY-XXXX-XXXX&#10;https://link-kich-hoat..."></textarea>
              <div class="stock-import-actions">
                <button class="btn btn-sm btn-outline" type="button" data-action="clear-bulk-stock">Xóa nội dung</button>
                <button class="btn btn-primary stock-import-action" data-action="bulk-product-stock">Thêm hàng loạt</button>
              </div>
              <div id="bulkStockResult" class="admin-v2-check-result"></div>
            </div>
          </div>
        </div>
      </section>
  ` : `
      <section class="admin-v2-card stock-import-card stock-import-card--product stock-import-card--empty">
        <div class="admin-v2-card-head">
          <div>
            <h3>Sản phẩm cấp tự động</h3>
            <p class="stock-import-sub">Chưa có sản phẩm dạng Stock/Key. Sản phẩm dịch vụ xử lý thủ công không cần nhập kho.</p>
          </div>
          <span class="stock-import-badge">Không cần nhập</span>
        </div>
        <div class="admin-v2-empty" style="margin:0;border:0;background:transparent;">
          Vào Sản phẩm để tạo sản phẩm có fulfillment Stock/Key nếu cần cấp phát tự động.
        </div>
      </section>
  `

  return `
    ${panelHeader('Nhập kho Netflix', 'Chỉ nhập tài khoản Netflix. Kho dịch vụ số nằm trong tab Dịch vụ.')}

    <div class="stock-import-metrics">
      ${metric('Netflix sẵn sàng', netflixReady, 'green', iconDatabase())}
    </div>

    <div class="stock-import-grid">
      <section class="admin-v2-card stock-import-card stock-import-card--netflix">
        <div class="admin-v2-card-head">
          <div>
            <h3>Netflix</h3>
            <p class="stock-import-sub">Cookie hoặc email:pass:cookie. Hệ thống kiểm tra live và gói Premium trước khi nhập.</p>
          </div>
          <span class="stock-import-badge stock-import-badge--netflix">Kiểm tra tự động</span>
        </div>
        <div class="admin-v2-form stock-import-form">
          <label class="stock-import-label" for="accValue">Một tài khoản</label>
          <textarea id="accValue" rows="5" placeholder="Cookie Netflix hoặc email:pass:cookie..."></textarea>
          <div class="acc-add-row stock-import-row">
            <input type="hidden" id="accService" value="netflix">
            <select id="accAccountType" class="select" style="width:auto">
              <option value="shared">Shared</option>
              <option value="private">Private</option>
            </select>
            <input id="accSlots" type="number" min="1" max="20" value="5" class="input" style="width:84px" placeholder="Slots">
            <input id="accNote" class="input" style="flex:1" placeholder="Ghi chú (tuỳ chọn)">
          </div>
          <button class="btn btn-primary" data-action="add-account">Kiểm tra và thêm Netflix</button>
          <div id="accAddResult" class="admin-v2-check-result"></div>

          <details class="stock-import-bulk">
            <summary>Nhập Netflix hàng loạt</summary>
            <textarea id="bulkAccValue" rows="7" placeholder="Mỗi dòng 1 cookie hoặc email:pass:cookie&#10;cookie1&#10;cookie2"></textarea>
            <div class="acc-add-row stock-import-row">
              <input type="hidden" id="bulkAccService" value="netflix">
              <select id="bulkAccAccountType" class="select" style="width:auto">
                <option value="shared">Shared</option>
                <option value="private">Private</option>
              </select>
              <input id="bulkAccSlots" type="number" min="1" max="20" value="5" class="input" style="width:84px" placeholder="Slots">
              <button class="btn btn-outline" data-action="bulk-add-accounts">Import + kiểm tra</button>
            </div>
            <div id="bulkAccResult" class="admin-v2-check-result"></div>
          </details>
        </div>
      </section>

      ${productImportCard}
    </div>
  `
}

function isStockImportPlan(plan) {
  return (
    (plan.service || 'netflix') !== 'netflix' &&
    ['stock', 'key'].includes(plan.fulfillment_type) &&
    Boolean(plan.variant_id || plan.product_id) &&
    plan.active !== false
  )
}

function getStockImportPlans() {
  return (state?.data?.plans || [])
    .filter(isStockImportPlan)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'))
}

function stockPlanProductName(plan) {
  const rawName = String(plan.name || '').replace(/\s+/g, ' ').trim()
  const productName = rawName.split(/\s+-\s+/)[0]?.trim()
  if (productName && productName.length < rawName.length) return productName
  const meta = SVC_META[plan.service || 'other'] || SVC_META.other
  return productName || meta.label || plan.service || 'Khác'
}

function stockPlanGroupKey(plan) {
  return String(plan.product_id || stockPlanProductName(plan) || plan.service || 'other')
}

function stockPlanGroups(plans = getStockImportPlans()) {
  const groups = new Map()
  for (const plan of plans) {
    const key = stockPlanGroupKey(plan)
    if (!groups.has(key)) groups.set(key, { key, label: stockPlanProductName(plan), count: 0 })
    groups.get(key).count += 1
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'))
}

function stockProductOptions(groups, selectedKey) {
  return groups.map(group => (
    `<option value="${attr(group.key)}"${group.key === selectedKey ? ' selected' : ''}>${esc(group.label)} (${group.count})</option>`
  )).join('')
}

function resolveStockPlanId(plans, preferredId = '') {
  const preferred = String(preferredId || '')
  if (preferred && plans.some(plan => plan.id === preferred)) return preferred
  return plans[0]?.id || ''
}

function stockPlanVariantLabel(plan, productName = stockPlanProductName(plan)) {
  const rawName = String(plan.name || plan.id || '').replace(/\s+/g, ' ').trim()
  const days = Number(plan.duration_days || 0)
  const explicitProductDays = Number(String(productName || '').toLowerCase().match(/(?:^|[^\d])(\d{1,4})\s*(?:d|day|days|ngày|ngay)(?=$|[^\p{L}\d])/iu)?.[1] || 0)
  const withDays = (label) => {
    if (!days) return label
    const lower = String(label || '').toLowerCase()
    if (new RegExp(`(^|[^\\d])${days}\\s*(d|day|days|ngày|ngay)($|[^\\p{L}\\d])`, 'iu').test(lower)) return label
    if (explicitProductDays === days && /(?:^|[^\d])\d{1,3}\s*(m|month|months|tháng|thang|y|year|years|năm|nam)(?=$|[^\p{L}\d])/iu.test(lower)) {
      return `${days} ngày`
    }
    return `${label} · ${days} ngày`
  }
  if (!productName) return withDays(rawName)
  if (rawName.toLowerCase().startsWith(productName.toLowerCase())) {
    const stripped = rawName.slice(productName.length).replace(/^\s*[-:·]\s*/, '').trim()
    if (stripped) return withDays(stripped)
  }
  return withDays(rawName)
}

function stockPlanOptions(plans = getStockImportPlans(), selectedPlanId = '') {
  return plans.map(plan => (
    `<option value="${attr(plan.id)}"${selectedPlanId === plan.id ? ' selected' : ''}>${esc(stockPlanVariantLabel(plan))}</option>`
  )).join('')
}

function stockResourceMatchesPlan(row, plan) {
  if (!row || !plan) return false
  const planIds = new Set([plan.id, plan.variant_id].filter(Boolean).map(String))
  const productIds = new Set([plan.product_id].filter(Boolean).map(String))
  if (row.plan_id && planIds.has(String(row.plan_id))) return true
  if (row.variant_id && planIds.has(String(row.variant_id))) return true
  return !row.plan_id && !row.variant_id && row.product_id && productIds.has(String(row.product_id))
}

function stockPlanStockCounts(accounts, plan) {
  const rows = plan ? accounts.filter(row => stockResourceMatchesPlan(row, plan)) : []
  return {
    total: rows.length,
    available: rows.filter(row => row.status === 'available').length,
    assigned: rows.filter(row => row.status === 'assigned').length,
    dead: rows.filter(row => row.status === 'dead').length,
  }
}

function stockSelectionSummaryContent(plan, counts = null) {
  if (!plan) return '<span class="admin-v2-muted">Chọn biến thể sản phẩm để nhập kho.</span>'
  const c = counts || stockPlanStockCounts(state?.data?.accounts || [], plan)
  return `
    <div class="stock-import-selection-main">
      <span>Đang nhập vào</span>
      <strong>${esc(stockPlanProductName(plan))} · ${esc(stockPlanVariantLabel(plan))}</strong>
    </div>
    <div class="stock-import-selection-stats">
      <span><b>${esc(c.available)}</b> sẵn sàng</span>
      <span><b>${esc(c.assigned)}</b> đã giao</span>
      <span><b>${esc(c.dead)}</b> lỗi</span>
      <span><b>${esc(c.total)}</b> tổng</span>
    </div>
  `
}

function updateStockSelectionSummary() {
  const plan = getStockImportPlans().find(item => item.id === valueOf('#stockPlan'))
  const summary = state?.content?.querySelector('[data-stock-selection-summary]')
  if (summary) summary.innerHTML = stockSelectionSummaryContent(plan)
}

function parseStockImportLines(raw) {
  const values = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const seen = new Set()
  const lines = []
  let duplicates = 0
  for (const value of values) {
    if (seen.has(value)) {
      duplicates += 1
      continue
    }
    seen.add(value)
    lines.push(value)
  }
  return { lines, duplicates, total: values.length }
}

function updateBulkStockCount() {
  const target = state?.content?.querySelector('#bulkStockCount')
  if (!target) return
  const { lines, duplicates, total } = parseStockImportLines(valueOf('#bulkStockValues'))
  target.textContent = `${lines.length} dòng hợp lệ${duplicates ? ` · ${duplicates} trùng` : ''}${total ? ` / ${total} dòng` : ''}`
}

function getSelectedStockPlan(selector) {
  const planId = valueOf(selector)
  const plan = getStockImportPlans().find(item => item.id === planId)
  if (!plan) throw new Error('Chọn đúng biến thể sản phẩm dạng Stock/Key để nhập kho.')
  return plan
}

function stockResourcePayload(plan) {
  return {
    service: plan.service || 'other',
    plan_id: plan.id,
    variant_id: plan.variant_id || plan.id,
    product_id: plan.product_id || null,
    resource_kind: 'product_stock',
  }
}

function renderProducts() {
  const svcFlt  = getFlt('products').svc    || 'all'
  const srch    = (getFlt('products').search || '').toLowerCase()

  const allPlans = state.data.plans.filter(r => (r.service || 'netflix') !== 'netflix')
  const stockPlans = getStockImportPlans()
  const stockPlanIds = new Set(stockPlans.map(plan => plan.id))
  const stockPlanMap = new Map(stockPlans.map(plan => [plan.id, plan]))
  const allStock = state.data.accounts.filter(r => isProductStockResource(r, stockPlanIds))

  let plans = allPlans
  if (svcFlt !== 'all') plans = plans.filter(r => (r.service || 'other') === svcFlt)
  if (srch)             plans = plans.filter(r => `${r.name} ${r.service}`.toLowerCase().includes(srch))

  // Stock stats per service
  const stockStats = {}
  for (const s of allStock) {
    const sv = s.service || 'other'
    if (!stockStats[sv]) stockStats[sv] = { available: 0, assigned: 0, dead: 0 }
    stockStats[sv][s.status] = (stockStats[sv][s.status] || 0) + 1
  }

  // Stock table data
  const stockStatusFlt = getFlt('productStock').status || ''
  let stockRows = (svcFlt !== 'all')
    ? allStock.filter(r => (r.service || 'other') === svcFlt)
    : allStock
  if (stockStatusFlt) stockRows = stockRows.filter(r => r.status === stockStatusFlt)
  const { items: stockItems, total: stockTotal } = paginate(
    stockRows.map(r => ({ ...r, _searchText: `${r.value} ${r.note || ''} ${r.service}` })),
    'productStock'
  )

  const svcList = [...new Set(allPlans.map(r => r.service || 'other'))]

  const svcOptions = [...Object.entries(SVC_META).filter(([k]) => k !== 'other'), ['other', SVC_META.other]]
    .map(([k, m]) => `<option value="${attr(k)}">${esc(m.label)}</option>`).join('')
  const stockPlanOpts = stockPlanOptions(stockPlans)

  return `
    ${panelHeader('Gói dịch vụ', 'Quản lý gói giá và kho hàng cho các dịch vụ ngoài Netflix.')}

    <div class="admin-v2-metrics">
      ${metric('Gói dịch vụ', allPlans.length, 'blue', iconBox())}
      ${metric('Kho sẵn sàng', allStock.filter(r => r.status === 'available').length, 'green', '🟢')}
      ${metric('Đã giao', allStock.filter(r => r.status === 'assigned').length, 'violet', '📬')}
      ${metric('Hết / lỗi', allStock.filter(r => r.status === 'dead').length, 'red', '❌')}
    </div>

    <div class="prod-svc-tabs">
      ${[{ svc: 'all', label: 'Tất cả', count: allPlans.length },
         ...svcList.map(s => ({ svc: s, label: (SVC_META[s] || SVC_META.other).label, count: allPlans.filter(r => (r.service || 'other') === s).length }))
        ].map(({ svc, label, count }) => `
        <button class="prod-svc-tab${svcFlt === svc ? ' active' : ''}"
          data-action="prod-svc-filter" data-svc="${attr(svc)}">
          ${esc(label)}
          <span class="prod-tab-count">${count}</span>
        </button>
      `).join('')}
    </div>

    <div class="admin-v2-toolbar">
      <input type="search" class="input" style="max-width:260px"
        placeholder="Tìm tên gói..." data-tab-search="products"
        value="${attr(getFlt('products').search || '')}">
      <div style="flex:1"></div>
      <button class="btn btn-sm btn-outline" data-action="toggle-add-product-form">
        ${iconPlus()} Thêm gói mới
      </button>
    </div>

    <section class="admin-v2-card" id="addProductPlanForm" style="display:none">
      <div class="admin-v2-card-head"><h3>Thêm gói mới</h3></div>
      <div class="prod-add-form">
        <div class="prod-add-field">
          <label>Dịch vụ</label>
          <select id="add-product-planService" class="select">${svcOptions}</select>
        </div>
        <div class="prod-add-field" style="flex:2">
          <label>Tên gói</label>
          <input id="add-product-planName" class="input" placeholder="YouTube Premium 1 Tháng">
        </div>
        <div class="prod-add-field prod-add-field--sm">
          <label>Giá (VND)</label>
          <input id="add-product-planPrice" type="number" class="input" placeholder="25000">
        </div>
        <div class="prod-add-field prod-add-field--sm">
          <label>Số ngày</label>
          <input id="add-product-planDays" type="number" class="input" placeholder="30">
        </div>
        <div class="prod-add-field">
          <label>Fulfillment</label>
          <select id="add-product-planFulfillment" class="select">
            <option value="manual">Xử lý thủ công</option>
            <option value="stock">Giao stock</option>
            <option value="key">Giao key/code</option>
          </select>
        </div>
        <div class="prod-add-field" style="flex:2">
          <label>Mô tả ngắn</label>
          <input id="add-product-planDesc" class="input" placeholder="Mô tả hiển thị cho khách (tùy chọn)">
        </div>
        <div class="prod-add-field prod-add-field--sm">
          <label>ID (tùy chọn)</label>
          <input id="add-product-planId" class="input" placeholder="auto">
        </div>
        <div class="prod-add-field" style="align-self:flex-end">
          <button class="btn btn-primary" data-action="add-product-plan">Thêm gói</button>
        </div>
      </div>
    </section>

    ${plans.length === 0
      ? `<div class="admin-v2-empty">Không có gói nào${svcFlt !== 'all' ? ' cho dịch vụ đã chọn' : ''}. <button class="btn btn-sm btn-outline" data-action="toggle-add-product-form">${iconPlus()} Thêm gói</button></div>`
      : `<div class="prod-grid">${plans.map(r => productCard(r, stockStats[r.service || 'other'] || {})).join('')}</div>`
    }

    <section class="admin-v2-card">
      <div class="admin-v2-card-head">
        <h3>Kho hàng dịch vụ <span class="admin-v2-muted" style="font-weight:400">(${stockRows.length})</span></h3>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="select" style="width:auto;font-size:13px" data-tab-status="productStock">
            <option value="">Tất cả trạng thái</option>
            <option value="available"${stockStatusFlt === 'available' ? ' selected' : ''}>Có sẵn</option>
            <option value="assigned"${stockStatusFlt === 'assigned' ? ' selected' : ''}>Đã giao</option>
            <option value="dead"${stockStatusFlt === 'dead' ? ' selected' : ''}>Hết/lỗi</option>
          </select>
        </div>
      </div>

      <div class="prod-stock-add" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="stockPlan" class="select" style="width:auto">${stockPlanOpts}</select>
        <input type="hidden" id="stockAccountType" value="stock">
        <input type="hidden" id="stockSlots" value="1">
        <input id="stockValue" class="input" style="flex:1;min-width:200px"
          placeholder="Giá trị (link, mã key, cookie...)">
        <input id="stockNote" class="input" style="width:160px" placeholder="Ghi chú (tuỳ chọn)">
        <button class="btn btn-primary btn-sm" data-action="add-product-stock">+ Thêm</button>
        <button class="btn btn-outline btn-sm" data-action="toggle-bulk-stock">Bulk</button>
      </div>
      <div id="bulkStockPanel" class="prod-stock-bulk" style="display:none">
        <textarea id="bulkStockValues" class="input" rows="4"
          placeholder="Mỗi dòng 1 giá trị (tài khoản, mã key, link...)&#10;Nhấn Bulk để nhập nhanh nhiều dòng."></textarea>
        <div class="prod-stock-bulk-row" style="display:flex;gap:8px;align-items:center;margin-top:8px;">
          <select id="bulkStockPlan" class="select" style="width:auto">${stockPlanOpts}</select>
          <input type="hidden" id="bulkStockAccountType" value="stock">
          <input type="hidden" id="bulkStockSlots" value="1">
          <button class="btn btn-primary btn-sm" data-action="bulk-product-stock">Thêm hàng loạt</button>
          <div id="bulkStockResult" class="admin-v2-muted" style="font-size:12px"></div>
        </div>
      </div>

      ${table(
        ['Biến thể', 'Giá trị', 'Trạng thái', 'Ghi chú', 'Ngày thêm', ''],
        stockItems.map(s => {
          const m = SVC_META[s.service || 'other'] || SVC_META.other
          const plan = stockPlanMap.get(s.plan_id)
          return [
            `<div><span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:${m.bg};color:${m.color}">${esc(m.label)}</span><br><span class="admin-v2-muted">${esc(plan?.name || s.plan_id || 'Chưa gắn biến thể')}</span></div>`,
            `<code style="font-size:11px;max-width:240px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${attr(s.value || '')}">${esc(s.value || '')}</code>`,
            badge(s.status || 'available'),
            `<span class="admin-v2-muted">${esc(s.note || '—')}</span>`,
            `<span class="admin-v2-muted" style="white-space:nowrap;font-size:11px">${s.created_at ? new Date(s.created_at).toLocaleDateString('vi-VN') : '—'}</span>`,
            s.status === 'available'
              ? `<button class="btn btn-sm btn-danger" data-action="delete-resource" data-id="${attr(s.id)}">Xoá</button>`
              : '<span class="admin-v2-muted">—</span>',
          ]
        })
      )}
      ${paginationBar('productStock', stockTotal)}
    </section>
  `
}

function productAdminSubnav(activeMode = 'services') {
  const items = [
    ['services', 'Dịch vụ & kho'],
    ['catalogCategories', 'Danh mục'],
    ['catalogProducts', 'Sản phẩm chi tiết'],
  ]
  return `
    <div class="catalog-product-mode">
      <div>
        <strong>Dịch vụ số</strong>
        <span>Quản lý sản phẩm, gói bán, nhập kho và đơn hàng ngoài Netflix.</span>
      </div>
      <div class="catalog-product-mode-actions">
        ${items.map(([mode, label]) => `
          <button class="catalog-section-btn${activeMode === mode ? ' active' : ''}"
            data-action="product-admin-mode" data-mode="${attr(mode)}">
            ${esc(label)}
          </button>
        `).join('')}
        <button class="btn btn-sm btn-outline" data-action="refresh">${iconRefresh()} Làm mới</button>
      </div>
    </div>
  `
}

function productCard(plan, sts = {}) {
  const svc  = plan.service || 'other'
  const m    = SVC_META[svc] || SVC_META.other
  const avail = sts.available || 0
  const total = (sts.available || 0) + (sts.assigned || 0)
  const pct   = total > 0 ? Math.min(100, Math.round(avail / total * 100)) : 0
  const isActive = plan.active !== false
  const days = plan.duration_days || 0
  const dayLabel = days >= 365 ? `${Math.round(days/365)} năm`
                 : days >= 30  ? `${Math.round(days/30)} tháng`
                 : `${days} ngày`
  const isStock = ['stock', 'key'].includes(plan.fulfillment_type)
  const FT_LABEL = { manual: 'Thủ công', stock: 'Từ kho', key: 'Giao key' }
  const ftLabel = FT_LABEL[plan.fulfillment_type]
    || (plan.account_type === 'private' ? 'Riêng' : 'Chia sẻ')

  return `
    <div class="prod-card${isActive ? '' : ' prod-card--off'}">
      <div class="prod-card-stripe" style="background:${m.color}"></div>
      <div class="prod-card-inner">
        <div class="prod-card-top">
          <span class="prod-svc-chip" style="background:${m.bg};color:${m.color}">${esc(m.label)}</span>
          <label class="prod-active-toggle" title="${isActive ? 'Đang hiện — click để ẩn' : 'Đang ẩn — click để hiện'}">
            <input type="checkbox" ${isActive ? 'checked' : ''}
              data-action="toggle-plan-active" data-id="${attr(plan.id)}">
            <span class="prod-toggle-track${isActive ? ' on' : ''}" style="${isActive ? `--tc:${m.color}` : ''}"></span>
          </label>
        </div>

        <div class="prod-card-name">${esc(plan.name)}</div>
        ${plan.description ? `<div class="prod-card-desc">${esc(plan.description)}</div>` : ''}

        <div class="prod-card-pills">
          <span class="prod-pill prod-pill--price">${formatVND(plan.price || 0)}</span>
          <span class="prod-pill">${dayLabel}</span>
          <span class="prod-pill prod-pill--muted">${esc(ftLabel)}</span>
        </div>

        ${isStock ? `
          <div class="prod-stock-bar-wrap">
            <div class="prod-stock-bar-bg">
              <div class="prod-stock-bar-fill" style="width:${pct}%;background:${m.color}20;outline:2px solid ${m.color}"></div>
            </div>
            <div class="prod-stock-text">
              <span style="color:${avail > 0 ? '#4ade80' : '#f87171'}">${avail} có sẵn</span>
              <span class="admin-v2-muted"> / ${total} tổng</span>
            </div>
          </div>
        ` : ''}

        <div class="prod-card-foot">
          <code class="admin-v2-muted" style="font-size:10px">${esc(plan.id)}</code>
          <div class="prod-card-actions">
            <button class="btn btn-sm btn-outline" data-action="edit-plan-modal" data-id="${attr(plan.id)}">Sửa</button>
            <button class="btn btn-sm btn-danger" data-action="delete-plan" data-id="${attr(plan.id)}">Xoá</button>
          </div>
        </div>
      </div>
    </div>
  `
}

// ── Viewer Reports ────────────────────────────────────────────────────────────

function renderViewerReports() {
  const flt = getFlt('viewerReports')
  const all = state.data.viewerReports.map(r => ({
    ...r,
    _searchText: `${r.user_email || ''} ${customerEmail(r.user_id, r.user_email)} ${r.subscription_id || ''}`,
  }))
  const { items, total } = paginate(all, 'viewerReports')

  const openCount     = state.data.viewerReports.filter(r => (r.status || 'open') === 'open').length
  const resolvedCount = state.data.viewerReports.filter(r => r.status === 'resolved').length

  return `
    ${panelHeader('Báo lỗi xem', 'Kiểm tra acc, gán acc mới và xử lý yêu cầu không xem được.')}
    <div class="admin-v2-metrics">
      ${metric('Đang chờ xử lý', openCount, 'amber', '🔔')}
      ${metric('Đã giải quyết', resolvedCount, 'green', '✅')}
      ${metric('Tổng báo cáo', state.data.viewerReports.length, 'blue', '📋')}
    </div>
    <div class="admin-v2-panel-block">
      <div class="admin-v2-toolbar">
        <input data-tab-search="viewerReports" placeholder="Tìm email / mã đơn" value="${attr(flt.search)}" style="min-width:200px;">
        <select data-tab-status="viewerReports">
          ${tabStatusOptions(flt.status, [['', 'Tất cả trạng thái'], ['open', 'Đang chờ'], ['resolved', 'Đã xử lý'], ['rejected', 'Từ chối']])}
        </select>
      </div>
    </div>
    <div class="admin-v2-table-wrap">
      <table class="admin-v2-table">
        <thead><tr>
          <th>Thời gian</th>
          <th>Khách / Gói</th>
          <th>Acc hiện tại</th>
          <th>Trạng thái báo</th>
          <th>Ghi chú admin</th>
          <th>Hành động</th>
        </tr></thead>
        <tbody>
          ${items.length ? items.map(r => vrRow(r)).join('') : `<tr><td colspan="6" class="admin-v2-empty-cell">Không có dữ liệu</td></tr>`}
        </tbody>
      </table>
    </div>
    ${paginationBar('viewerReports', total)}
  `
}

function vrRow(r) {
  const loginLink = r.sub_login_link || ''
  const linkShort = loginLink
    ? (loginLink.includes('NetflixId=')
        ? 'NetflixId=' + loginLink.split('NetflixId=')[1].slice(0, 14) + '…'
        : loginLink.slice(0, 24) + '…')
    : '—'

  const isOpen = (r.status || 'open') === 'open'

  const accCell = `
    <div>
      <code style="font-size:10.5px;color:#94a3b8;" title="${attr(loginLink)}">${esc(linkShort)}</code>
      <div id="vr-acc-status-${attr(r.id)}" class="vr-acc-status"></div>
    </div>
  `

  const actions = isOpen ? `
    <div class="admin-v2-row-actions" style="flex-wrap:wrap;gap:4px;">
      <button class="btn btn-sm btn-outline" data-action="vr-check" data-id="${attr(r.id)}" title="Kiểm tra acc hiện tại">🔍 Kiểm tra</button>
      <button class="btn btn-sm btn-primary" data-action="vr-assign" data-id="${attr(r.id)}" title="Đánh dấu acc cũ dead → gán acc mới verified">🔄 Gán acc mới</button>
      <button class="btn btn-sm btn-success" data-action="report-resolve" data-id="${attr(r.id)}" title="Đóng case, không gán acc mới">✅ Đóng</button>
      <button class="btn btn-sm btn-danger" data-action="report-reject" data-id="${attr(r.id)}" title="Từ chối với lý do">❌ Từ chối</button>
    </div>
  ` : `
    <button class="btn btn-sm btn-outline" data-action="report-reopen" data-id="${attr(r.id)}">🔓 Mở lại</button>
  `

  return `
    <tr>
      <td style="white-space:nowrap;font-size:12px;">${formatDate(r.created_at)}</td>
      <td>
        <div style="font-size:13px;">${esc(r.user_email || customerEmail(r.user_id, r.user_email))}</div>
        <div style="margin-top:3px;">${badge(r.sub_status || 'pending')} <span class="admin-v2-muted" style="font-size:11px;">${esc(planName(r.sub_plan))} · ${code(r.subscription_id)}</span></div>
      </td>
      <td>${accCell}</td>
      <td>${badge(r.status || 'open')}</td>
      <td style="font-size:12px;color:#94a3b8;max-width:180px;">${esc(r.admin_note || '—')}</td>
      <td>${actions}</td>
    </tr>
  `
}

// ── Wallet ────────────────────────────────────────────────────────────────────

function renderWallet() {
  const wallets  = state.data.wallets
  const topups   = state.data.walletTopups
  const fltW     = getFlt('wallets')
  const fltT     = getFlt('walletTopups')

  const totalBalance = wallets.reduce((s, w) => s + (w.balance || 0), 0)
  const pendingTopups = topups.filter(t => t.status === 'pending').length

  const allW = wallets.map(r => ({ ...r, _searchText: `${r.email || ''} ${r.user_id || ''}`, status: '' }))
  const allT = topups.map(r => ({ ...r, _searchText: `${r.email || ''} ${r.user_id || ''} ${r.content || ''}` }))
  const { items: walletItems, total: walletTotal } = paginate(allW, 'wallets')
  const { items: topupItems, total: topupTotal }   = paginate(allT, 'walletTopups')

  return `
    ${panelHeader('Ví khách hàng', 'Quản lý số dư ví, nạp tiền thủ công và duyệt topup.')}
    <div class="admin-v2-metrics">
      ${metric('Tổng số dư hệ thống', formatVND(totalBalance), 'blue', '💳')}
      ${metric('Topup đang chờ', pendingTopups, 'amber', '⏳')}
      ${metric('Tổng tài khoản ví', wallets.length, 'violet', '👤')}
      ${metric('Topup hôm nay', topups.filter(t => new Date(t.created_at) > new Date(Date.now() - 86400000)).length, 'green', '📥')}
    </div>

    <section class="admin-v2-card">
      <div class="admin-v2-card-head">
        <h3>Nạp / trừ ví thủ công</h3>
        <span class="admin-v2-muted">Nhập số âm để trừ tiền</span>
      </div>
      <div class="admin-v2-form">
        <div class="admin-v2-form-grid">
          <input id="walletCreditUserId" placeholder="User ID hoặc email">
          <input id="walletCreditAmount" type="number" placeholder="Số tiền (VND, âm để trừ)">
          <input id="walletCreditNote" placeholder="Ghi chú (tuỳ chọn)">
        </div>
        <button class="btn btn-primary" data-action="wallet-credit">Thực hiện nạp / trừ ví</button>
        <div id="walletCreditResult" class="admin-v2-check-result"></div>
      </div>
    </section>

    <section class="admin-v2-card">
      <div class="admin-v2-card-head"><h3>Yêu cầu nạp tiền (Topup)</h3></div>
      <div class="admin-v2-panel-block" style="padding:0 0 12px;">
        <div class="admin-v2-toolbar">
          <input data-tab-search="walletTopups" placeholder="Tìm email / nội dung" value="${attr(fltT.search)}" style="min-width:200px;">
          <select data-tab-status="walletTopups">
            ${tabStatusOptions(fltT.status, [['', 'Tất cả'], ['pending', 'Đang chờ'], ['success', 'Đã duyệt'], ['fail', 'Từ chối']])}
          </select>
        </div>
      </div>
      ${table(
        ['Thời gian', 'Khách', 'Số tiền', 'Nội dung', 'Trạng thái', 'Hành động'],
        topupItems.map(r => [
          formatDate(r.created_at),
          esc(r.email || r.user_id || '-'),
          formatVND(r.amount || 0),
          `<code>${esc(r.content || r.transfer_content || '-')}</code>`,
          badge(r.status),
          r.status === 'pending'
            ? `<button class="btn btn-sm btn-success" data-action="confirm-topup" data-id="${attr(r.id)}">Duyệt</button>`
            : `<span class="admin-v2-muted">Đã xử lý</span>`,
        ])
      )}
      ${paginationBar('walletTopups', topupTotal)}
    </section>

    <section class="admin-v2-card">
      <div class="admin-v2-card-head"><h3>Số dư theo khách hàng</h3></div>
      <div class="admin-v2-panel-block" style="padding:0 0 12px;">
        <div class="admin-v2-toolbar">
          <input data-tab-search="wallets" placeholder="Tìm email" value="${attr(fltW.search)}" style="min-width:200px;">
        </div>
      </div>
      ${table(
        ['Khách', 'Số dư', 'Cập nhật'],
        walletItems.map(r => [
          esc(r.email || r.user_id || '-'),
          `<strong style="color:#4ade80;">${formatVND(r.balance || 0)}</strong>`,
          formatDate(r.updated_at || r.created_at),
        ])
      )}
      ${paginationBar('wallets', walletTotal)}
    </section>
  `
}

// ── Shared sub-components ─────────────────────────────────────────────────────


// ── Event handlers ────────────────────────────────────────────────────────────

function renderSupportChatAdmin() {
  const threads = array(state.data.supportThreads)
  const chat = state.data.supportChat || {}
  const selectedUserId = getFlt('supportChat').userId || chat.thread?.user_id || ''
  const messages = array(chat.messages)
  const q = String(getFlt('supportChat').search || '').toLowerCase().trim()
  const unreadTotal = threads.reduce((sum, t) => sum + Number(t.unread_admin || 0), 0)
  const visibleThreads = q
    ? threads.filter((t) => [
        t.user_email,
        t.user_id,
        t.last_message,
      ].some((value) => String(value || '').toLowerCase().includes(q)))
    : threads
  return `
    ${panelHeader('Chat hỗ trợ', 'Quản lý hội thoại khách hàng, lọc nhanh và phản hồi ngay trong admin.')}
    <div class="admin-chat-summary">
      <div>
        <span>Tổng hội thoại</span>
        <strong>${threads.length}</strong>
      </div>
      <div>
        <span>Tin chưa đọc</span>
        <strong>${unreadTotal}</strong>
      </div>
      <div>
        <span>Đang chọn</span>
        <strong>${selectedUserId ? '1' : '0'}</strong>
      </div>
    </div>
    <div class="admin-chat-shell">
      <aside class="admin-chat-list">
        <div class="admin-chat-list__head">
          <div>
            <strong>Khách hàng</strong>
            <span>${visibleThreads.length} / ${threads.length} hội thoại</span>
          </div>
          <button type="button" class="btn btn-sm btn-outline" data-action="refresh-support-chat">${iconRefresh()} Làm mới</button>
        </div>
        <div class="admin-chat-search">
          <input type="search" data-admin-chat-search value="${attr(getFlt('supportChat').search || '')}" placeholder="Tìm email, user id, nội dung..." autocomplete="off">
        </div>
        <div class="admin-chat-thread-list">
        ${visibleThreads.length ? visibleThreads.map((t) => {
          const active = String(t.user_id) === String(selectedUserId)
          const initial = String(t.user_email || t.user_id || '?').trim()[0]?.toUpperCase() || '?'
          return `
            <button type="button" class="admin-chat-thread${active ? ' active' : ''}" data-action="open-support-chat" data-user="${attr(t.user_id)}">
              <span class="admin-chat-thread__avatar">${esc(initial)}</span>
              <span class="admin-chat-thread__body">
                <span class="admin-chat-thread__row">
                  <span class="admin-chat-thread__email">${esc(t.user_email || t.user_id)}</span>
                  ${t.unread_admin ? `<b>${Number(t.unread_admin)}</b>` : ''}
                </span>
                <span class="admin-chat-thread__last">${esc(t.last_message || 'Chưa có tin nhắn')}</span>
                <span class="admin-chat-thread__meta">
                  <span>${t.unread_admin ? 'Chưa đọc' : 'Đã đọc'}</span>
                  <time>${t.updated_at ? formatDate(t.updated_at) : ''}</time>
                </span>
              </span>
            </button>
          `
        }).join('') : `<div class="admin-chat-empty">${threads.length ? 'Không tìm thấy hội thoại phù hợp.' : 'Chưa có cuộc chat nào.'}</div>`}
        </div>
      </aside>
      <section class="admin-chat-panel">
        ${selectedUserId ? `
          <div class="admin-chat-panel__head">
            <div class="admin-chat-panel__identity">
              <span class="admin-chat-panel__avatar">${esc(String(chat.thread?.user_email || selectedUserId || '?')[0].toUpperCase())}</span>
              <div>
                <strong>${esc(chat.thread?.user_email || selectedUserId)}</strong>
                <span>${messages.length} tin nhắn · ${chat.thread?.updated_at ? `Cập nhật ${formatDate(chat.thread.updated_at)}` : 'Sẵn sàng trả lời'}</span>
              </div>
            </div>
          </div>
          <div class="admin-chat-messages" id="adminChatMessages">
            ${messages.length ? messages.map((m) => `
              <div class="admin-chat-msg ${m.sender === 'admin' ? 'admin-chat-msg--admin' : 'admin-chat-msg--user'}">
                <div class="admin-chat-msg__bubble">
                  <p>${esc(m.content).replace(/\n/g, '<br>')}</p>
                  <span>${m.sender === 'admin' ? 'Admin' : 'Khách'} · ${formatDate(m.created_at)}</span>
                </div>
              </div>
            `).join('') : '<div class="admin-chat-empty">Chưa có nội dung.</div>'}
          </div>
          <div class="admin-chat-compose">
            <textarea id="adminSupportReply" rows="3" maxlength="2000" placeholder="Nhập phản hồi cho khách..."></textarea>
            <button type="button" class="admin-chat-send" data-action="send-support-reply">Gửi</button>
          </div>
        ` : `
          <div class="admin-chat-empty admin-chat-empty--panel">
            <h3>Chưa có chat</h3>
            <p>Khi khách gửi tin nhắn, cuộc chat sẽ xuất hiện ở đây.</p>
          </div>
        `}
      </section>
    </div>
  `
}

async function onClick(event) {
  // Tab navigation
  const tabBtn = event.target.closest('[data-admin-tab]')
  if (tabBtn && state?.container.contains(tabBtn)) {
    state.tab = tabBtn.dataset.adminTab
    await renderCurrent()
    scrollAdminToTop()
    return
  }

  // Pagination
  const prevBtn = event.target.closest('[data-pag-prev]')
  if (prevBtn) {
    const t = prevBtn.dataset.pagPrev
    const p = getPag(t)
    if (p.page > 1) { p.page--; await renderCurrent() }
    return
  }
  const nextBtn = event.target.closest('[data-pag-next]')
  if (nextBtn) {
    const t = nextBtn.dataset.pagNext
    const p = getPag(t)
    p.page++
    await renderCurrent()
    return
  }

  // Action buttons
  const actionEl = event.target.closest('[data-action]')
  if (!actionEl || !state?.container.contains(actionEl)) return
  const action = actionEl.dataset.action

  if (action === 'settings-jump') {
    const targetId = actionEl.dataset.target || ''
    const target = targetId ? state.content.querySelector(`#${cssEscape(targetId)}`) : null
    state.content.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn === actionEl)
    })
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  if (action === 'refresh') return reloadAll()
  if (action === 'run-health')     return runQuick('/api/admin/health-check',  'Đang kiểm tra kho...')
  if (action === 'run-expiry')     return runQuick('/api/admin/run-expiry',    'Đang chạy hết hạn...')
  if (action === 'cancel-pending') return runQuick('/api/admin/cancel-pending','Đang huỷ đơn chờ...')
  if (action === 'test-telegram')  return runQuick('/api/admin/test-telegram', 'Đang gửi Telegram...')
  if (action === 'clear-bulk-stock') {
    const input = state.content.querySelector('#bulkStockValues')
    if (input) input.value = ''
    updateBulkStockCount()
    return
  }
  if (action === 'refresh-support-chat') {
    state.supportChatLoaded = false
    await loadSupportChatData(getFlt('supportChat').userId)
    return
  }
  if (action === 'open-support-chat') {
    getFlt('supportChat').userId = actionEl.dataset.user || ''
    state.supportChatLoaded = false
    await loadSupportChatData(getFlt('supportChat').userId)
    return
  }
  if (action === 'product-admin-mode') {
    getFlt('products').mode = actionEl.dataset.mode || 'services'
    await renderCurrent()
    return
  }

  await runMutation(async () => {

    // ─ Orders ─
    if (action === 'send-support-reply') {
      const userId = getFlt('supportChat').userId
      const input = state.content.querySelector('#adminSupportReply')
      const content = input?.value?.trim() || ''
      if (!userId) throw new Error('Chọn khách cần trả lời')
      if (!content) throw new Error('Nhập nội dung phản hồi')
      await adminSendSupportMessage(userId, content)
      state.supportChatLoaded = false
      await loadSupportChatData(userId)
      return false

    } else if (action === 'save-link') {
      const input = state.content.querySelector(`[data-sub-link="${cssEscape(actionEl.dataset.id)}"]`)
      await adminSetLoginLink(actionEl.dataset.id, input?.value?.trim() || '')

    } else if (action === 'deliver-sp-order') {
      const id = actionEl.dataset.id
      const input = state.content.querySelector(`[data-sub-link="${cssEscape(id)}"]`)
      const content = input?.value?.trim() || ''
      if (!content) throw new Error('Nhập nội dung giao hàng cho khách')
      await adminUpdateSubscription(id, {
        status: 'active',
        start_at: new Date().toISOString(),
        login_link: content,
        delivered_at: new Date().toISOString()
      })

    } else if (action === 'save-dv-delivery') {
      // Save delivery content + admin note together for service orders
      const id = actionEl.dataset.id
      const linkInput = state.content.querySelector(`[data-sub-link="${cssEscape(id)}"]`)
      const noteInput = state.content.querySelector(`[data-sub-note="${cssEscape(id)}"]`)
      await adminUpdateSubscription(id, {
        login_link: linkInput?.value?.trim() || '',
        admin_note: noteInput?.value?.trim() || ''
      })

    } else if (action === 'move-dv-processing') {
      await adminUpdateSubscription(actionEl.dataset.id, { status: 'processing' })

    } else if (action === 'deliver-dv-order') {
      // Modal: admin fills delivery content + note, then delivers
      // Dùng Promise để runMutation có thể await kết quả
      const id = actionEl.dataset.id
      const sub = state.maps.subscriptions.get(id) || state.data.subscriptions.find(r => r.id === id) || {}
      const planInfo = sub.plans || state.maps.plans.get(sub.plan) || {}
      const svcLabel = planInfo.name || planName(sub.plan)
      const inlineContent = state.content.querySelector(`[data-sub-link="${cssEscape(id)}"]`)?.value?.trim() || ''
      const inlineNote = state.content.querySelector(`[data-sub-note="${cssEscape(id)}"]`)?.value?.trim() || ''

      if (inlineContent) {
        const now = new Date().toISOString()
        await adminUpdateSubscription(id, {
          status: 'active',
          start_at: now,
          login_link: inlineContent,
          admin_note: inlineNote || null,
          delivered_at: now,
        })
        return
      }

      return new Promise((resolve, reject) => {
        showFormModal(state.container, {
          title: `🚀 Giao hàng — ${svcLabel}`,
          bodyHtml: `
            <div style="display:flex;flex-direction:column;gap:14px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;font-size:13px;">
                <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">Khách hàng</span><br><strong>${esc(sub.user_email || sub.user_id || '—')}</strong></div>
                <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">Dịch vụ</span><br><strong>${esc(svcLabel)}</strong></div>
              </div>
              <div>
                <label for="dvDeliverContent" style="font-size:12px;font-weight:600;color:#94a3b8;display:block;margin-bottom:6px;">📦 Nội dung / Tài khoản giao cho khách <span style="color:#ef4444">*</span></label>
                <textarea id="dvDeliverContent" rows="4" style="width:100%;box-sizing:border-box;background:#0a0f1a;border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:10px;color:#e2e8f0;font-size:13px;font-family:monospace;resize:vertical;" placeholder="Email / mật khẩu / link / mã kích hoạt...&#10;Ví dụ:&#10;Email: abc@gmail.com&#10;Password: 123456"></textarea>
              </div>
              <div>
                <label for="dvDeliverNote" style="font-size:12px;font-weight:600;color:#94a3b8;display:block;margin-bottom:6px;">💬 Lời nhắn / hướng dẫn cho khách (tuỳ chọn)</label>
                <textarea id="dvDeliverNote" rows="2" style="width:100%;box-sizing:border-box;background:#0a0f1a;border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:10px;color:#e2e8f0;font-size:13px;resize:vertical;" placeholder="Ví dụ: Không đổi mật khẩu. Liên hệ shop nếu gặp vấn đề."></textarea>
              </div>
            </div>
          `,
          confirmLabel: '🚀 Xác nhận giao hàng',
          onConfirm: async (overlay) => {
            const content = overlay.querySelector('#dvDeliverContent')?.value?.trim()
            if (!content) throw new Error('Vui lòng nhập nội dung giao hàng cho khách')
            const note = overlay.querySelector('#dvDeliverNote')?.value?.trim() || ''
            const now = new Date().toISOString()
            // API — throw nếu lỗi, showFormModal sẽ hiện lỗi và giữ modal mở
            await adminUpdateSubscription(id, {
              status: 'active',
              start_at: now,
              login_link: content,
              admin_note: note || null,
              delivered_at: now,
            })
            resolve('Đã giao hàng thành công ✅')
          },
          onClose: () => resolve(false), // user bấm Huỷ → bỏ qua, không reload
        })
      })


    } else if (action === 'activate-sub') {
      await adminUpdateSubscription(actionEl.dataset.id, { status: 'active', start_at: new Date().toISOString() })

    } else if (action === 'expire-sub') {
      return new Promise(resolve => showConfirmModal(state.container, {
        title: 'Hết hạn đơn hàng',
        body: 'Đánh dấu đơn này là hết hạn? Khách sẽ không truy cập được dịch vụ.',
        confirmLabel: 'Hết hạn',
        danger: true,
        onConfirm: async () => { await adminUpdateSubscription(actionEl.dataset.id, { status: 'expired' }); resolve('Đã đánh dấu hết hạn') },
      })).then(res => res || false)

    } else if (action === 'reject-dv-order') {
      return new Promise(resolve => showConfirmModal(state.container, {
        title: 'Từ chối đơn hàng',
        body: 'Bạn muốn từ chối và huỷ đơn hàng này do lỗi hoặc không thành công?',
        confirmLabel: 'Từ chối đơn',
        danger: true,
        onConfirm: async () => { await adminUpdateSubscription(actionEl.dataset.id, { status: 'cancelled', admin_note: 'Đơn hàng bị từ chối / không thành công.' }); resolve('Đã từ chối đơn hàng') },
      })).then(res => res || false)

    } else if (action === 'view-order') {
      const sub = state.maps.subscriptions.get(actionEl.dataset.id) || state.data.subscriptions.find(r => r.id === actionEl.dataset.id) || {}
      showDetailModal(state.container, {
        title: `Đơn #${code(sub.id)}`,
        wide: true,
        body: `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;">
            <div><span class="admin-v2-muted">Khách:</span> ${customerEmail(sub.user_id, sub.user_email)}</div>
            <div><span class="admin-v2-muted">Gói:</span> ${planName(sub.plan)}</div>
            <div><span class="admin-v2-muted">Trạng thái:</span> ${badge(sub.status)}</div>
            <div><span class="admin-v2-muted">Tạo lúc:</span> ${formatDate(sub.created_at)}</div>
            <div><span class="admin-v2-muted">Bắt đầu:</span> ${formatDate(sub.start_at)}</div>
            <div><span class="admin-v2-muted">Hết hạn:</span> ${formatDate(sub.end_at)}</div>
            <div style="grid-column:span 2"><span class="admin-v2-muted">Login link:</span><br>
              <code style="word-break:break-all;">${esc(sub.login_link || 'Chưa có')}</code>
            </div>
            ${sub.notes ? `<div style="grid-column:span 2"><span class="admin-v2-muted">Ghi chú:</span> ${esc(sub.notes)}</div>` : ''}
          </div>
        `,
      })
      return false

    // ─ Payments ─
    } else if (action === 'confirm-pay') {
      await adminConfirmPayment(actionEl.dataset.id)

    } else if (action === 'reject-pay') {
      return new Promise(resolve => showConfirmModal(state.container, {
        title: 'Từ chối thanh toán',
        body: 'Đánh dấu giao dịch này là thất bại? Thao tác không thể hoàn tác.',
        confirmLabel: 'Từ chối',
        danger: true,
        onConfirm: async () => { await adminUpdatePayment(actionEl.dataset.id, { status: 'fail' }); resolve('Đã từ chối thanh toán') },
      })).then(res => res || false)

    // ─ Accounts ─
    } else if (action === 'add-account') {
      const value = valueOf('#accValue')
      if (!value) throw new Error('Nhập cookie/tài khoản trước')
      const svc = valueOf('#accService') || 'netflix'
      const accountType = valueOf('#accAccountType') || 'shared'
      const slots = Math.max(1, Number(valueOf('#accSlots') || 5))
      if (svc === 'netflix' && accountType === 'stock') throw new Error('Netflix phải nhập dạng Shared hoặc Private')
      let note = valueOf('#accNote')
      const feedback = startImportFeedback(actionEl, '#accAddResult', 'Đang kiểm tra và nhập kho...')
      try {
        const paymentIssue = await inspectNetflixPaymentIssue(value, svc)
        if (paymentIssue) {
          throw new Error(`Cookie có lỗi thanh toán (${paymentIssue.plan || 'Premium'}) — không thêm vào kho`)
        }
        await adminAddAccount('account', value, note, slots, accountType, svc)
        finishImportFeedback(feedback, 'success', 'Đã thêm 1 tài khoản vào kho')
        const accValueEl = state.content.querySelector('#accValue')
        if (accValueEl) accValueEl.value = ''
        return 'Nhập kho thành công: đã thêm 1 tài khoản'
      } catch (err) {
        finishImportFeedback(feedback, 'error', err.message)
        window.showToast?.(err.message, 'error')
        return false
      }

    } else if (action === 'bulk-account') {
      const lines = valueOf('#accBulkValues').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (!lines.length) throw new Error('Nhập danh sách tài khoản')
      const bulkSvc = valueOf('#accBulkService') || 'netflix'
      const feedback = startImportFeedback(actionEl, '#accBulkResult', `Đang kiểm tra ${lines.length} tài khoản...`)
      const resultEl = feedback.resultEl
      let paymentErrors = 0
      const payload = []
      for (let i = 0; i < lines.length; i++) {
        const value = lines[i]
        if (resultEl && bulkSvc === 'netflix') {
          setImportFeedbackMessage(resultEl, 'loading', `Đang kiểm tra ${i + 1}/${lines.length} tài khoản...`)
        }
        const paymentIssue = await inspectNetflixPaymentIssue(value, bulkSvc)
        if (paymentIssue) { paymentErrors++; continue }
        payload.push({
          type: 'account',
          value,
          service: bulkSvc,
          max_slots: 5,
          account_type: 'shared',
          note: null,
        })
      }
      if (!payload.length) {
        finishImportFeedback(feedback, 'error', `Không thêm được dòng nào · Lỗi TT đã bỏ qua: ${paymentErrors}`)
        window.showToast?.('Nhập kho thất bại: không có tài khoản hợp lệ', 'error')
        return false
      }
      const result = await adminAddAccountsBulk(payload)
      const resultPaymentErrors = paymentErrors + Number(result.payment_error || 0)
      if (resultEl) {
        const failed = Number(result.dead || 0) + Number(result.no_plan || 0) + Number(result.errors || 0) + resultPaymentErrors
        resultEl.innerHTML = [
          `<span class="admin-v2-muted">Tổng: ${lines.length}</span>`,
          result.added    ? `<span class="tone-good">Sẵn sàng: ${result.added}</span>` : '<span class="tone-bad">❌ Không thêm được</span>',
          resultPaymentErrors ? `<span class="tone-bad">Lỗi TT đã bỏ qua: ${resultPaymentErrors}</span>` : '',
          failed ? `<span class="tone-bad">Lỗi/Chết: ${failed}</span>` : '',
          result.duplicates ? `<span class="admin-v2-muted">🔁 Trùng: ${result.duplicates}</span>` : '',
          (result.dead   || 0) ? `<span class="tone-bad">💀 Cookie chết: ${result.dead}</span>` : '',
          (result.no_plan || 0) ? `<span class="tone-warn">⚠️ Không gói: ${result.no_plan}</span>` : '',
          result.errors   ? `<span class="tone-bad">❌ Lỗi: ${result.errors}</span>` : '',
        ].filter(Boolean).join('<span class="admin-v2-muted"> · </span>')
      }
      if (!result.added) {
        finishImportFeedback(feedback, 'error', `Không thêm được dòng nào trong ${lines.length} dòng`)
        window.showToast?.('Nhập kho thất bại: không có dòng nào được thêm', 'error')
        return false
      }
      const parts = [`Thêm: ${result.added}`]
      if (result.dead)       parts.push(`Dead: ${result.dead}`)
      if (result.no_plan)    parts.push(`Không gói: ${result.no_plan}`)
      if (resultPaymentErrors) parts.push(`Lỗi TT bỏ qua: ${resultPaymentErrors}`)
      if (result.duplicates) parts.push(`Trùng: ${result.duplicates}`)
      const summary = `Nhập kho thành công: ${parts.join(' · ')}`
      finishImportFeedback(feedback, 'success', summary)
      return summary

    } else if (action === 'bulk-add-accounts') {
      const lines = valueOf('#bulkAccValue').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (!lines.length) throw new Error('Nhập danh sách tài khoản')
      const bulkSvc = valueOf('#bulkAccService') || 'netflix'
      const bulkAccountType = valueOf('#bulkAccAccountType') || 'shared'
      const bulkSlots = Math.max(1, Number(valueOf('#bulkAccSlots') || 5))
      if (bulkSvc === 'netflix' && bulkAccountType === 'stock') throw new Error('Netflix phải nhập dạng Shared hoặc Private')
      const feedback = startImportFeedback(actionEl, '#bulkAccResult', `Đang kiểm tra ${lines.length} tài khoản...`)
      const resultEl = feedback.resultEl
      let paymentErrors = 0
      const payload = []
      for (let i = 0; i < lines.length; i++) {
        const value = lines[i]
        if (resultEl && bulkSvc === 'netflix') {
          setImportFeedbackMessage(resultEl, 'loading', `Đang kiểm tra ${i + 1}/${lines.length} tài khoản...`)
        }
        const paymentIssue = await inspectNetflixPaymentIssue(value, bulkSvc)
        if (paymentIssue) { paymentErrors++; continue }
        payload.push({
          type: 'account',
          value,
          service: bulkSvc,
          max_slots: bulkSlots,
          account_type: bulkAccountType,
          note: null,
      })
      }
      if (!payload.length) {
        finishImportFeedback(feedback, 'error', `Không thêm được dòng nào · Lỗi TT đã bỏ qua: ${paymentErrors}`)
        window.showToast?.('Nhập kho thất bại: không có tài khoản hợp lệ', 'error')
        return false
      }
      const result = await adminAddAccountsBulk(payload)
      const resultPaymentErrors = paymentErrors + Number(result.payment_error || 0)
      if (resultEl) {
        const failed = Number(result.dead || 0) + Number(result.no_plan || 0) + Number(result.errors || 0) + resultPaymentErrors
        resultEl.innerHTML = [
          `<span class="admin-v2-muted">Tổng: ${lines.length}</span>`,
          result.added ? `<span class="tone-good">Sẵn sàng: ${result.added}</span>` : '<span class="tone-bad">❌ Không thêm được</span>',
          resultPaymentErrors ? `<span class="tone-bad">Lỗi TT đã bỏ qua: ${resultPaymentErrors}</span>` : '',
          failed ? `<span class="tone-bad">Lỗi/Chết: ${failed}</span>` : '',
          result.duplicates ? `<span class="admin-v2-muted">🔁 Trùng: ${result.duplicates}</span>` : '',
        ].filter(Boolean).join('<span class="admin-v2-muted"> · </span>')
      }
      if (!result.added) {
        finishImportFeedback(feedback, 'error', `Không thêm được dòng nào trong ${lines.length} dòng`)
        window.showToast?.('Nhập kho thất bại: không có dòng nào được thêm', 'error')
        return false
      }
      const bulkValueEl = state.content.querySelector('#bulkAccValue')
      if (bulkValueEl) bulkValueEl.value = ''
      const summary = `Nhập kho thành công: thêm ${result.added}/${lines.length}${resultPaymentErrors ? ` · Lỗi TT bỏ qua: ${resultPaymentErrors}` : ''}`
      finishImportFeedback(feedback, 'success', summary)
      return summary

    } else if (action === 'check-account') {
      const id = actionEl.dataset.id
      actionEl.textContent = '⏳'
      actionEl.disabled = true
      try {
        const result = await adminCheckAccountPlan(id, false)
        const current = state.data.accounts.find(a => a.id === id) || {}
        const paymentIssue = !result.effectivelyDead && hasPaymentIssue(result)
        const planInfo = result.billingText ? `${result.billingText}` : (result.plan || '—')
        if (paymentIssue || result.deleted) {
          window.showToast?.(`Đã xóa khỏi kho vì lỗi thanh toán — ${planInfo}`, 'warning')
          await reloadAll()
          return false
        }
        const status   = result.effectivelyDead
          ? `❌ Dead (${result.alive ? 'mất gói' : 'cookie chết'})`
          : paymentIssue
            ? `⚠️ Lỗi TT — ${planInfo}`
          : `✅ OK — ${planInfo}`
        window.showToast?.(status, result.effectivelyDead ? 'error' : paymentIssue ? 'warning' : 'success')
        const updates = {
          billing_text: result.billingText || null,
          plan_name: result.plan || null,
          last_checked_at: new Date().toISOString(),
        }
        if (result.effectivelyDead) {
          updates.status = 'dead'
        } else if (paymentIssue) {
          updates.status = 'available'
          updates.note = paymentNote(stripPaymentNote(current.note), result.plan)
        } else {
          updates.status = current.status === 'dead' ? 'available' : (current.status || 'available')
          if (accountHasPaymentIssue(current)) {
            updates.note = stripPaymentNote(current.note) || null
          }
        }
        await adminUpdateAccount(id, updates)
        await reloadAll()
      } catch (err) {
        window.showToast?.(err.message, 'error')
        actionEl.textContent = '🔍'
        actionEl.disabled = false
      }
      return false

    } else if (action === 'acc-svc-filter') {
      getFlt('accounts').svc = actionEl.dataset.svc || 'all'
      getPag('accounts').page = 1
      await renderCurrent()
      return false

    } else if (action === 'select-all-accounts') {
      const checked = actionEl.checked
      state.content.querySelectorAll('.acc-row-check').forEach(cb => { cb.checked = checked })
      updateAccBatchCount()
      return false

    } else if (action === 'copy-account') {
      await navigator.clipboard.writeText(actionEl.dataset.value || '').catch(() => {})
      window.showToast?.('Đã copy cookie', 'success')
      return false

    } else if (action === 'view-account') {
      const r = state.data.accounts.find(a => a.id === actionEl.dataset.id) || {}
      const m = ALL_SVC_META[r.service || 'netflix'] || SVC_META.other
      showDetailModal(state.container, {
        title: 'Chi tiết tài nguyên',
        wide: true,
        body: `
          <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px">
              <div><span class="admin-v2-muted">Dịch vụ:</span> <span style="color:${m.color};font-weight:700">${esc(m.label)}</span></div>
              <div><span class="admin-v2-muted">Trạng thái:</span> ${accountStatusBadge(r)}</div>
              <div><span class="admin-v2-muted">Email:</span> ${esc(r.account_email||'—')}</div>
              <div><span class="admin-v2-muted">Gói:</span> ${esc(r.plan_name||'—')}</div>
              <div><span class="admin-v2-muted">Slots:</span> ${r.assigned_count||0} / ${r.max_slots||1}</div>
              <div><span class="admin-v2-muted">Hết hạn:</span> <span class="tone-good">${esc(r.billing_text||'—')}</span></div>
              <div><span class="admin-v2-muted">Ghi chú:</span> ${esc(r.note||'—')}</div>
              <div><span class="admin-v2-muted">Kiểm tra lần cuối:</span> ${r.last_checked_at?new Date(r.last_checked_at).toLocaleString('vi-VN'):'—'}</div>
            </div>
            <div>
              <div class="admin-v2-muted" style="margin-bottom:4px">Cookie / Giá trị:</div>
              <textarea readonly style="width:100%;box-sizing:border-box;font-family:monospace;font-size:11px;background:#0f172a;border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:10px;color:#94a3b8;resize:vertical;min-height:80px">${esc(r.value||'')}</textarea>
            </div>
            <div><span class="admin-v2-muted">Ngày thêm:</span> ${r.created_at?new Date(r.created_at).toLocaleString('vi-VN'):'—'}</div>
          </div>
        `,
      })
      return false

    } else if (action === 'batch-check-accounts') {
      const ids = getSelectedAccountIds()
      if (!ids.length) { window.showToast?.('Chọn ít nhất 1 tài khoản', 'error'); return false }
      const progEl = state.content.querySelector('#accBatchProgress')
      let done = 0, dead = 0, paymentErrors = 0
      for (const id of ids) {
        if (progEl) progEl.textContent = `Đang kiểm tra ${done+1}/${ids.length}...`
        try {
          const result = await adminCheckAccountPlan(id, false)
          const current = state.data.accounts.find(a => a.id === id) || {}
          const paymentIssue = !result.effectivelyDead && hasPaymentIssue(result)
          const statusEl = state.content.querySelector(`#acc-status-${CSS.escape(id)}`)
          if (paymentIssue || result.deleted) {
            paymentErrors++
            if (statusEl) statusEl.innerHTML = paymentIssueBadge()
            done++
            continue
          }
          const updates = {
            billing_text: result.billingText || null,
            plan_name: result.plan || null,
            last_checked_at: new Date().toISOString(),
          }
          if (result.effectivelyDead) {
            updates.status = 'dead'
            dead++
          } else if (paymentIssue) {
            updates.status = 'available'
            updates.note = paymentNote(stripPaymentNote(current.note), result.plan)
            paymentErrors++
          } else {
            updates.status = current.status === 'dead' ? 'available' : (current.status || 'available')
            if (accountHasPaymentIssue(current)) {
              updates.note = stripPaymentNote(current.note) || null
            }
          }
          await adminUpdateAccount(id, updates)
          if (statusEl) statusEl.innerHTML = result.effectivelyDead ? badge('dead') : paymentIssue ? paymentIssueBadge() : badge('available')
        } catch { dead++ }
        done++
      }
      if (progEl) progEl.textContent = `✅ Xong: ${done} đã kiểm tra, ${paymentErrors} lỗi TT, ${dead} dead`
      window.showToast?.(`Kiểm tra xong ${done} tài khoản — ${paymentErrors} lỗi TT, ${dead} dead`, dead > 0 ? 'error' : paymentErrors > 0 ? 'warning' : 'success')
      await reloadAll()
      return false

    } else if (action === 'batch-mark-dead-accounts') {
      const ids = getSelectedAccountIds()
      if (!ids.length) { window.showToast?.('Chọn ít nhất 1 tài khoản', 'error'); return false }
      return new Promise(resolve => showConfirmModal(state.container, {
        title: `Đánh dấu ${ids.length} tài khoản là lỗi`,
        body: `Đánh dấu ${ids.length} tài khoản đã chọn là dead?`,
        confirmLabel: 'Đánh dấu lỗi',
        danger: true,
        onConfirm: async () => {
          await Promise.all(ids.map(id => adminUpdateAccount(id, { status: 'dead' }).catch(() => {})))
          resolve(`Đã đánh dấu ${ids.length} tài khoản là dead`)
        },
      })).then(res => res || false)

    } else if (action === 'batch-delete-accounts') {
      const ids = getSelectedAccountIds()
      if (!ids.length) { window.showToast?.('Chọn ít nhất 1 tài khoản', 'error'); return false }
      return new Promise(resolve => showConfirmModal(state.container, {
        title: `Xoá ${ids.length} tài khoản`,
        body: `Xoá ${ids.length} tài khoản đã chọn? Thao tác không thể hoàn tác.`,
        confirmLabel: 'Xoá tất cả',
        danger: true,
        onConfirm: async () => {
          await Promise.all(ids.map(id => adminDeleteAccount(id).catch(() => {})))
          resolve(`Đã xoá ${ids.length} tài khoản`)
        },
      })).then(res => res || false)

    } else if (action === 'check-all-available') {
      const svcFlt = getFlt('accounts').svc || 'all'
      const targets = state.data.accounts.filter(r =>
        isNetflixAccountResource(r) &&
        r.status === 'available' &&
        (svcFlt === 'all' || (r.service || 'netflix') === svcFlt)
      )
      if (!targets.length) { window.showToast?.('Không có tài khoản Netflix để kiểm tra', 'error'); return false }
      const progEl = state.content.querySelector('#accBatchProgress')
      let done = 0, dead = 0, paymentErrors = 0
      for (const r of targets) {
        if (progEl) progEl.textContent = `Kiểm tra kho ${done+1}/${targets.length}...`
        try {
          const result = await adminCheckAccountPlan(r.id, false)
          const paymentIssue = !result.effectivelyDead && hasPaymentIssue(result)
          if (paymentIssue || result.deleted) {
            paymentErrors++
            done++
            continue
          }
          const updates = {
            billing_text: result.billingText || null,
            plan_name: result.plan || null,
            last_checked_at: new Date().toISOString(),
          }
          if (result.effectivelyDead) {
            updates.status = 'dead'
            dead++
          } else if (paymentIssue) {
            updates.status = 'available'
            updates.note = paymentNote(stripPaymentNote(r.note), result.plan)
            paymentErrors++
          } else {
            updates.status = 'available'
            if (accountHasPaymentIssue(r)) {
              updates.note = stripPaymentNote(r.note) || null
            }
          }
          await adminUpdateAccount(r.id, updates)
        } catch { dead++ }
        done++
      }
      if (progEl) progEl.textContent = `✅ Xong: ${done} kiểm tra, ${paymentErrors} lỗi TT, ${dead} dead`
      window.showToast?.(`Kiểm tra kho xong — ${done} tài khoản, ${paymentErrors} lỗi TT, ${dead} dead`, dead > 0 ? 'error' : paymentErrors > 0 ? 'warning' : 'success')
      await reloadAll()
      return false

    } else if (action === 'account-status') {
      await adminUpdateAccount(actionEl.dataset.id, { status: actionEl.dataset.status })

    } else if (action === 'delete-account') {
      await new Promise(resolve => showConfirmModal(state.container, {
        title: 'Xoá tài nguyên kho',
        body: 'Xoá tài nguyên này khỏi kho? Thao tác không thể hoàn tác.',
        confirmLabel: 'Xoá',
        danger: true,
        onConfirm: async () => { await adminDeleteAccount(actionEl.dataset.id); resolve(true) },
      }))
      return false

    // ─ Users ─
    } else if (action === 'delete-user') {
      return new Promise(resolve => showConfirmModal(state.container, {
        title: 'Xoá người dùng',
        body: 'Xoá tài khoản user này? Toàn bộ dữ liệu liên quan sẽ bị xoá.',
        confirmLabel: 'Xoá',
        danger: true,
        onConfirm: async () => { await adminDeleteUser(actionEl.dataset.id); resolve('Đã xoá người dùng') },
      })).then(res => res || false)

    // ─ Plans ─
    } else if (action === 'add-plan' || action === 'save-plan' || action === 'delete-plan') {
      const msg = await handlePlansAction(action, actionEl, state)
      if (msg) return msg

    } else if (action === 'add-product-plan') {
      await createPlanFromForm(action)

    // ─ Products page extra actions ─
    } else if (action === 'prod-svc-filter') {
      getFlt('products').svc = actionEl.dataset.svc || 'all'
      getPag('productStock').page = 1
      await renderCurrent()
      return false

    } else if (action === 'toggle-add-product-form') {
      const form = state.content.querySelector('#addProductPlanForm')
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none'
      return false

    } else if (action === 'toggle-bulk-stock') {
      const panel = state.content.querySelector('#bulkStockPanel')
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
      return false

    } else if (action === 'edit-plan-modal') {
      const plan = state.data.plans.find(r => r.id === actionEl.dataset.id)
      if (!plan) return
      const svcOptions = [...Object.entries(SVC_META).filter(([k]) => k !== 'other'), ['other', SVC_META.other]]
        .map(([k, m]) => `<option value="${attr(k)}"${plan.service === k ? ' selected' : ''}>${esc(m.label)}</option>`).join('')
      showFormModal(state.container, {
        title: `Sửa gói — ${plan.name}`,
        confirmLabel: 'Lưu thay đổi',
        bodyHtml: `
          <div class="prod-add-form" style="gap:12px">
            <div class="prod-add-field">
              <label style="color:#94a3b8;font-size:12px;font-weight:600">Dịch vụ</label>
              <select id="editPlanService" class="select">${svcOptions}</select>
            </div>
            <div class="prod-add-field" style="flex:2">
              <label style="color:#94a3b8;font-size:12px;font-weight:600">Tên gói</label>
              <input id="editPlanName" class="input" value="${attr(plan.name || '')}">
            </div>
            <div class="prod-add-field prod-add-field--sm">
              <label style="color:#94a3b8;font-size:12px;font-weight:600">Giá (VND)</label>
              <input id="editPlanPrice" type="number" class="input" value="${attr(plan.price || 0)}">
            </div>
            <div class="prod-add-field prod-add-field--sm">
              <label style="color:#94a3b8;font-size:12px;font-weight:600">Số ngày</label>
              <input id="editPlanDays" type="number" class="input" value="${attr(plan.duration_days || 0)}">
            </div>
            <div class="prod-add-field">
              <label style="color:#94a3b8;font-size:12px;font-weight:600">Fulfillment</label>
              <select id="editPlanFulfillment" class="select">
                ${['manual','stock','key','netflix'].map(f =>
                  `<option value="${f}"${(plan.fulfillment_type || 'manual') === f ? ' selected' : ''}>${f}</option>`
                ).join('')}
              </select>
            </div>
            <div class="prod-add-field" style="flex:2">
              <label style="color:#94a3b8;font-size:12px;font-weight:600">Mô tả</label>
              <input id="editPlanDesc" class="input" value="${attr(plan.description || '')}" placeholder="Mô tả ngắn (tuỳ chọn)">
            </div>
            <div class="prod-add-field">
              <label style="color:#94a3b8;font-size:12px;font-weight:600">URL ảnh</label>
              <input id="editPlanImg" class="input" value="${attr(plan.image_url || '')}" placeholder="https://... (tuỳ chọn)">
            </div>
            <div class="prod-add-field prod-add-field--sm">
              <label style="color:#94a3b8;font-size:12px;font-weight:600">Thứ tự</label>
              <input id="editPlanSort" type="number" class="input" value="${attr(plan.sort_order ?? 0)}" placeholder="0">
            </div>
          </div>
        `,
        onConfirm: async (overlay) => {
          const q = (id) => overlay.querySelector(id)
          const updates = {
            name:             q('#editPlanName')?.value?.trim(),
            service:          q('#editPlanService')?.value || 'other',
            price:            Number(q('#editPlanPrice')?.value || 0),
            duration_days:    Number(q('#editPlanDays')?.value || 0),
            fulfillment_type: q('#editPlanFulfillment')?.value || 'manual',
            description:      q('#editPlanDesc')?.value?.trim() || null,
            image_url:        q('#editPlanImg')?.value?.trim() || null,
            sort_order:       Number(q('#editPlanSort')?.value ?? 0),
          }
          if (!updates.name) return window.showToast?.('Nhập tên gói', 'error')
          await runMutation(() => adminUpdatePlan(plan.id, updates))
        },
      })
      return false

    } else if (action === 'add-product-stock') {
      const plan  = getSelectedStockPlan('#stockPlan')
      const meta  = stockResourcePayload(plan)
      const type  = 'stock'
      const slots = 1
      const value = valueOf('#stockValue')
      const note  = valueOf('#stockNote')
      if (!value.trim()) throw new Error('Nhập giá trị stock')
      const feedback = startImportFeedback(actionEl, '#stockAddResult', 'Đang thêm vào kho cấp phát...')
      try {
        await adminAddAccount('account', value.trim(), note.trim() || null, slots, type, meta.service, meta)
        finishImportFeedback(feedback, 'success', `Đã thêm 1 giá trị cho ${stockPlanProductName(plan)} · ${stockPlanVariantLabel(plan)}`)
        const stockValueEl = state.content.querySelector('#stockValue')
        const stockNoteEl = state.content.querySelector('#stockNote')
        if (stockValueEl) stockValueEl.value = ''
        if (stockNoteEl) stockNoteEl.value = ''
        return `Nhập kho thành công: đã thêm 1 giá trị`
      } catch (err) {
        finishImportFeedback(feedback, 'error', err.message)
        window.showToast?.(`Nhập kho thất bại: ${err.message}`, 'error')
        return false
      }

    } else if (action === 'bulk-product-stock') {
      const planSelector = state.content.querySelector('#stockPlan') ? '#stockPlan' : '#bulkStockPlan'
      const plan   = getSelectedStockPlan(planSelector)
      const meta   = stockResourcePayload(plan)
      const type   = 'stock'
      const slots  = 1
      const raw    = valueOf('#bulkStockValues')
      const parsed = parseStockImportLines(raw)
      const lines  = parsed.lines
      const note   = valueOf('#stockNote').trim() || null
      if (!lines.length) throw new Error('Nhập ít nhất 1 dòng')
      const feedback = startImportFeedback(actionEl, '#bulkStockResult', `Đang thêm ${lines.length} dòng...`)
      try {
        const result = await adminAddAccountsBulk(lines.map(v => ({ value: v, service: meta.service, type: 'account', account_type: type, max_slots: slots, note, ...meta })))
        const added = Number(result.added ?? result.length ?? 0)
        const duplicates = Number(result.duplicates || 0)
        const errors = Number(result.errors || 0)
        if (!added) {
          const reason = duplicates ? `Trùng ${duplicates} dòng` : (errors ? `Lỗi ${errors} dòng` : 'không có dòng nào được thêm')
          finishImportFeedback(feedback, 'error', `Nhập kho thất bại: ${reason}`)
          window.showToast?.(`Nhập kho thất bại: ${reason}`, 'error')
          return false
        }
        const summary = `Nhập kho thành công: thêm ${added}/${lines.length}${parsed.duplicates ? ` · Bỏ qua trùng trong ô: ${parsed.duplicates}` : ''}${duplicates ? ` · Trùng trong kho: ${duplicates}` : ''}${errors ? ` · Lỗi: ${errors}` : ''}`
        finishImportFeedback(feedback, 'success', summary)
        state.content.querySelector('#bulkStockValues').value = ''
        updateBulkStockCount()
        return summary
      } catch (err) {
        finishImportFeedback(feedback, 'error', err.message)
        window.showToast?.(`Nhập kho thất bại: ${err.message}`, 'error')
        return false
      }

    } else if (action === 'delete-resource') {
      await new Promise(resolve => showConfirmModal(state.container, {
        title: 'Xoá stock item',
        body: 'Xoá item này khỏi kho? Thao tác không thể hoàn tác.',
        confirmLabel: 'Xoá',
        danger: true,
        onConfirm: async () => { await adminDeleteAccount(actionEl.dataset.id); resolve(true) },
      }))
      return false

    // ─ Settings ─
    } else if (action === 'save-settings') {
      return await saveSettings(state, actionEl.dataset.group)

    // ─ Viewer Reports ─
    } else if (action === 'report-resolve') {
      await adminResolveViewerReport(actionEl.dataset.id, { status: 'resolved' })

    } else if (action === 'report-reopen') {
      await adminResolveViewerReport(actionEl.dataset.id, { status: 'open' })

    } else if (action === 'report-reject') {
      const rId = actionEl.dataset.id
      await new Promise(resolve => showInputModal(state.container, {
        title: 'Từ chối báo lỗi',
        label: 'Lý do từ chối (hiển thị cho khách):',
        placeholder: 'Nhập lý do...',
        confirmLabel: 'Từ chối',
        onConfirm: async (note) => {
          if (!note.trim()) return
          await adminResolveViewerReport(rId, { status: 'rejected', admin_note: note.trim() })
          resolve(true)
        },
      }))
      return false

    } else if (action === 'vr-check') {
      // Kiểm tra acc hiện tại của đơn — hiện kết quả inline, không reload
      const rId = actionEl.dataset.id
      const statusEl = state.content.querySelector(`#vr-acc-status-${CSS.escape(rId)}`)
      if (statusEl) statusEl.innerHTML = '<span class="admin-v2-muted" style="font-size:11px;">⏳ Đang kiểm tra...</span>'
      actionEl.disabled = true
      try {
        const result = await adminCheckViewerReportAccount(rId)
        if (!result.checked) {
          if (statusEl) statusEl.innerHTML = `<span class="tone-warn" style="font-size:11px;">⚠️ ${esc(result.message || 'Không có login link')}</span>`
        } else if (result.status === 'ok') {
          const expire = result.billingText ? ` · ${result.billingText}` : ''
          if (statusEl) statusEl.innerHTML = `<span class="tone-good" style="font-size:11px;">✅ Sống + còn gói${esc(expire)}</span>`
        } else if (result.status === 'no_plan') {
          if (statusEl) statusEl.innerHTML = `<span class="tone-warn" style="font-size:11px;">⚠️ Cookie sống nhưng MẤT GÓI — nên gán acc mới</span>`
        } else {
          if (statusEl) statusEl.innerHTML = `<span class="tone-bad" style="font-size:11px;">💀 Cookie đã chết — nên gán acc mới</span>`
        }
      } catch (err) {
        if (statusEl) statusEl.innerHTML = `<span class="tone-bad" style="font-size:11px;">❌ ${esc(err.message)}</span>`
      } finally {
        actionEl.disabled = false
      }
      return false

    } else if (action === 'vr-assign') {
      // Admin force gán acc mới từ kho (đánh dấu cũ dead, gán mới verified)
      const rId = actionEl.dataset.id
      await new Promise(resolve => showConfirmModal(state.container, {
        title: 'Gán tài khoản mới từ kho',
        body: 'Hệ thống sẽ:<br>1. Đánh dấu tài khoản hiện tại là <strong>dead</strong><br>2. Tìm và gán tài khoản mới đã kiểm tra live + còn gói từ kho<br>3. Đóng case báo lỗi này',
        confirmLabel: 'Gán acc mới',
        onConfirm: async () => {
          await adminAssignViewerReportFromPool(rId, {})
          resolve(true)
        },
      }))
      return false

    // ─ Wallet ─
    } else if (action === 'wallet-credit') {
      const userId = valueOf('#walletCreditUserId')
      const amount = Number(valueOf('#walletCreditAmount'))
      const note   = valueOf('#walletCreditNote')
      if (!userId) throw new Error('Nhập User ID hoặc email')
      if (!amount || isNaN(amount)) throw new Error('Nhập số tiền hợp lệ')
      const resultEl = state.content.querySelector('#walletCreditResult')
      if (resultEl) resultEl.innerHTML = '<span class="admin-v2-muted">⏳ Đang thực hiện...</span>'
      try {
        const res = await adminCreditWallet(userId, amount, note)
        if (resultEl) resultEl.innerHTML = `<span class="tone-good">✅ Thành công — số dư mới: ${formatVND(res.balance_after || 0)}</span>`
        state.walletLoaded = false
      } catch (err) {
        if (resultEl) resultEl.innerHTML = `<span class="tone-bad">❌ ${esc(err.message)}</span>`
        window.showToast?.(err.message, 'error')
        return false
      }

    } else if (action === 'confirm-topup') {
      await new Promise(resolve => showConfirmModal(state.container, {
        title: 'Duyệt nạp tiền',
        body: 'Xác nhận duyệt yêu cầu nạp tiền này? Số dư khách sẽ được cộng ngay.',
        confirmLabel: 'Duyệt',
        onConfirm: async () => {
          await adminConfirmWalletTopup(actionEl.dataset.id)
          state.walletLoaded = false
          resolve(true)
        },
      }))
      return false
    }

    return true
  })
}

async function onChange(event) {
  const el = event.target

  // Pagination size change
  if (el.matches('[data-pag-size]')) {
    const t = el.dataset.pagSize
    getPag(t).size = Number(el.value) || PAGE_SIZE
    getPag(t).page = 1
    await renderCurrent()
    return
  }

  // Tab filters
  if (el.matches('[data-tab-search]') || el.matches('[data-tab-status]')) {
    const tab = el.dataset.tabSearch || el.dataset.tabStatus
    const flt = getFlt(tab)
    if (el.matches('[data-tab-status]')) {
      flt.status = el.value
    }
    getPag(tab).page = 1
    await renderCurrent()
    return
  }

  if (el.matches('[data-stock-product-filter]')) {
    const targetPlan = el.dataset.targetPlan || 'stockPlan'
    getFlt('nfstock')[targetPlan === 'bulkStockPlan' ? 'bulkStockGroup' : 'stockGroup'] = el.value || ''
    const plans = getStockImportPlans().filter(plan => stockPlanGroupKey(plan) === (el.value || ''))
    const selectedPlanId = resolveStockPlanId(plans)
    getFlt('nfstock')[targetPlan === 'bulkStockPlan' ? 'bulkStockPlan' : 'stockPlan'] = selectedPlanId
    const productPlanOptions = stockPlanOptions(plans, selectedPlanId)
    const planSelect = state.content.querySelector(`#${cssEscape(targetPlan)}`)
    if (planSelect) {
      planSelect.innerHTML = productPlanOptions
      planSelect.value = selectedPlanId
    }
    updateStockSelectionSummary()
    return
  }

  if (el.matches('#stockPlan')) {
    getFlt('nfstock').stockPlan = el.value || ''
    updateStockSelectionSummary()
    return
  }

  if (el.matches('#bulkStockPlan')) {
    getFlt('nfstock').bulkStockPlan = el.value || ''
    return
  }

  if (el.dataset.action === 'change-role') {
    await runMutation(async () => {
      if (el.value === 'admin') {
        return new Promise(resolve => showConfirmModal(state.container, {
          title: 'Cấp quyền Admin',
          body: 'Cấp quyền admin cho user này? Họ sẽ có toàn quyền trên hệ thống.',
          confirmLabel: 'Xác nhận',
          danger: true,
          onConfirm: async () => {
            await adminUpdateProfile(el.dataset.id, { role: 'admin' })
            resolve('Đã cấp quyền admin')
          },
        })).then(res => res || false)
      }
      await adminUpdateProfile(el.dataset.id, { role: el.value })
      return true
    })
    return
  }

  if (el.dataset.action === 'toggle-plan-active') {
    const planId   = el.dataset.id
    const newActive = el.checked
    await runMutation(() => adminUpdatePlan(planId, { active: newActive }))
    return
  }

  if (el.matches('[data-select-row]')) {
    updateAccBatchCount()
    return
  }
}

function onInput(event) {
  const el = event.target
  if (el.matches('[data-tab-search]')) {
    const tab = el.dataset.tabSearch
    getFlt(tab).search = el.value
    // Debounced re-render: clear previous timer
    clearTimeout(el._searchTimer)
    el._searchTimer = setTimeout(async () => {
      getPag(tab).page = 1
      await renderCurrent()
    }, 280)
  }

  if (el.matches('[data-admin-chat-search]')) {
    getFlt('supportChat').search = el.value
    clearTimeout(el._chatSearchTimer)
    el._chatSearchTimer = setTimeout(async () => {
      await renderCurrent()
      state?.content?.querySelector('[data-admin-chat-search]')?.focus()
    }, 180)
  }

  if (el.matches('#bulkStockValues')) {
    updateBulkStockCount()
  }
}

// ── Quick actions (dashboard) ─────────────────────────────────────────────────

async function runQuick(url, pendingText) {
  const result = state.content.querySelector('#adminQuickResult')
  if (result) result.textContent = pendingText
  try {
    const res  = await adminApiFetch(url, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.message || `Lỗi ${res.status}`)
    if (result) result.textContent = data.message || 'Đã xong'
    window.showToast?.(data.message || 'Đã xong', 'success')
    await reloadAll()
  } catch (err) {
    if (result) result.textContent = err.message
    window.showToast?.(err.message, 'error')
  }
}

// ── runMutation ───────────────────────────────────────────────────────────────

async function runMutation(work) {
  try {
    const changed = await work()
    if (changed !== false) {
      window.showToast?.(typeof changed === 'string' ? changed : 'Đã lưu thay đổi', 'success')
      if (state.tab === 'wallet') {
        state.walletLoaded = false
      }
      await reloadAll()
    }
  } catch (err) {
    finishPendingImportFeedback(err.message)
    window.showToast?.(err.message, 'error')
  }
}

function startImportFeedback(actionEl, resultSelector, message) {
  const button = actionEl || null
  const card = button?.closest?.('.stock-import-card, .admin-v2-card') || null
  const resultEl = resultSelector ? state.content.querySelector(resultSelector) : findImportResultForButton(button)

  if (button) {
    button.dataset.idleHtml = button.innerHTML
    button.disabled = true
    button.classList.add('stock-import-btn--busy')
    button.innerHTML = `<span class="stock-import-spinner" aria-hidden="true"></span><span>${esc(message)}</span>`
  }

  if (card) {
    card.classList.remove('stock-import-card--success', 'stock-import-card--error')
    card.classList.add('stock-import-card--busy')
  }

  setImportFeedbackMessage(resultEl, 'loading', message)
  return { button, card, resultEl }
}

function setImportFeedbackMessage(resultEl, type, message) {
  if (!resultEl) return
  const icon = type === 'success' ? '✓' : type === 'error' ? '!' : ''
  resultEl.classList.remove('stock-import-result--loading', 'stock-import-result--success', 'stock-import-result--error')
  resultEl.classList.add(`stock-import-result--${type}`)
  resultEl.innerHTML = `
    ${type === 'loading' ? '<span class="stock-import-spinner" aria-hidden="true"></span>' : `<span class="stock-import-result-icon">${icon}</span>`}
    <span>${esc(message)}</span>
  `
}

function finishImportFeedback(feedback, type, message) {
  if (!feedback) return
  const { button, card, resultEl } = feedback
  if (button) {
    button.disabled = false
    button.classList.remove('stock-import-btn--busy')
    if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml
    delete button.dataset.idleHtml
  }
  if (card) {
    card.classList.remove('stock-import-card--busy', 'stock-import-card--success', 'stock-import-card--error')
    card.classList.add(type === 'success' ? 'stock-import-card--success' : 'stock-import-card--error')
    window.setTimeout(() => {
      card.classList.remove('stock-import-card--success', 'stock-import-card--error')
    }, 1200)
  }
  setImportFeedbackMessage(resultEl, type, message)
}

function finishPendingImportFeedback(message) {
  state?.content?.querySelectorAll('.stock-import-btn--busy').forEach(button => {
    const resultEl = findImportResultForButton(button)
    button.disabled = false
    button.classList.remove('stock-import-btn--busy')
    if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml
    delete button.dataset.idleHtml
    setImportFeedbackMessage(resultEl, 'error', message || 'Nhập kho thất bại')
  })

  state?.content?.querySelectorAll('.stock-import-card--busy').forEach(card => {
    card.classList.remove('stock-import-card--busy', 'stock-import-card--success')
    card.classList.add('stock-import-card--error')
    window.setTimeout(() => card.classList.remove('stock-import-card--error'), 1200)
  })
}

function findImportResultForButton(button) {
  if (!button) return null
  if (button.nextElementSibling?.classList?.contains('admin-v2-check-result')) return button.nextElementSibling
  const row = button.closest('.acc-add-row')
  if (row?.nextElementSibling?.classList?.contains('admin-v2-check-result')) return row.nextElementSibling
  return button.closest('.stock-import-card, .admin-v2-card')?.querySelector('.admin-v2-check-result') || null
}

// ── Sub-helpers ───────────────────────────────────────────────────────────────

async function createPlanFromForm(prefix) {
  const name        = valueOf(`#${prefix}Name`)
  const price       = Number(valueOf(`#${prefix}Price`))
  const durationDays = Number(valueOf(`#${prefix}Days`))
  if (!name || !price || !durationDays) throw new Error('Nhập tên, giá và số ngày')
  const id   = valueOf(`#${prefix}Id`)
  const desc = valueOf(`#${prefix}Desc`)
  await adminCreatePlan({
    ...(id   ? { id }              : {}),
    ...(desc ? { description: desc } : {}),
    name,
    price,
    duration_days:    durationDays,
    service:          valueOf(`#${prefix}Service`) || 'netflix',
    fulfillment_type: valueOf(`#${prefix}Fulfillment`) || 'netflix',
    active: true,
  })
}

// ── HTML utilities ────────────────────────────────────────────────────────────

function panelHeader(title, subtitle) {
  return `
    <div class="admin-v2-panel-header">
      <div>
        <h1>${esc(title)}</h1>
        <p>${esc(subtitle || '')}</p>
      </div>
      <button type="button" class="btn btn-sm btn-outline" data-action="refresh">${iconRefresh()} Làm mới</button>
    </div>
  `
}

function metric(label, value, tone = 'blue', icon = '') {
  const ICONS = { blue: '📊', green: '✅', amber: '⏳', violet: '🔵', red: '❌' }
  const ic = icon || ICONS[tone] || '📋'
  return `
    <div class="admin-v2-metric admin-v2-metric--${esc(tone)}">
      <div class="admin-v2-metric-icon">${ic}</div>
      <div class="admin-v2-metric-body">
        <span>${esc(label)}</span>
        <strong>${esc(String(value))}</strong>
      </div>
    </div>
  `
}

function infoRow(label, value, tone) {
  return `<div class="admin-v2-info-row"><span>${esc(label)}</span><strong class="tone-${esc(tone)}">${esc(value)}</strong></div>`
}

function table(headers, rows) {
  const body = rows.length
    ? rows.map(cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n')
    : `<tr><td colspan="${headers.length}" class="admin-v2-empty-cell">Không có dữ liệu</td></tr>`
  return `
    <div class="admin-v2-table-wrap">
      <table class="admin-v2-table">
        <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `
}

function tabStatusOptions(selected, options) {
  return options.map(([val, text]) => `<option value="${attr(val)}"${val === selected ? ' selected' : ''}>${esc(text)}</option>`).join('')
}

function settingField(key, label, value, placeholder, type) {
  const inputType = type && type !== 'textarea' ? type : 'text'
  const common = `data-setting-key="${attr(key)}" placeholder="${attr(placeholder || '')}"`
  if (type === 'checkbox') {
    const checked = ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').toLowerCase())
    return `
      <label class="admin-v2-field admin-v2-field--check" style="grid-column:1/-1;background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);margin-top:4px;">
        <input type="checkbox" ${common} ${checked ? 'checked' : ''}>
        <span style="font-weight:600;font-size:14px">${esc(label)}</span>
      </label>
    `
  }
  return `
    <label class="admin-v2-field"${type === 'textarea' ? ' style="grid-column:1/-1"' : ''}>
      <span style="font-weight:600;color:#94a3b8;font-size:12px;margin-bottom:2px">${esc(label)}</span>
      ${type === 'textarea'
        ? `<textarea class="input" rows="3" ${common} style="resize:vertical;min-height:80px">${esc(value || '')}</textarea>`
        : `<input class="input" type="${attr(inputType)}" ${common} value="${attr(value || '')}" autocomplete="off">`
      }
    </label>
  `
}

function customerEmail(userId, fallback) {
  return esc(fallback || state.maps.profiles.get(userId)?.email || userId || '-')
}

function planName(planId) {
  return esc(state.maps.plans.get(planId)?.name || planId || '-')
}

function badge(status) {
  const STATUS = {
    active:    ['Hoạt động',      'status-active'],
    pending:   ['Chờ xử lý',      'status-pending'],
    expired:   ['Hết hạn',        'status-expired'],
    cancelled: ['Đã huỷ',         'status-cancelled'],
    success:   ['Thành công',     'status-success'],
    fail:      ['Thất bại',       'status-fail'],
    dead:      ['Hỏng',           'status-dead'],
    payment:   ['Lỗi TT',         'status-payment'],
    available: ['Còn trống',      'status-available'],
    full:      ['Đầy slot',       'status-full'],
    assigned:  ['Đã gán',         'status-active'],
    open:      ['Mở',             'status-open'],
    resolved:  ['Đã giải quyết', 'status-resolved'],
    rejected:  ['Từ chối',        'status-rejected'],
  }
  const s = String(status || '').toLowerCase()
  const [label, cls] = STATUS[s] || [esc(status) || 'Không rõ', '']
  return `<span class="status-badge ${cls}">${label}</span>`
}

function hasPaymentIssue(data) {
  if (!data || typeof data !== 'object') return false
  return !!(data.paymentError || data.paymentFailed || data.payment_error || data.payment_failed)
}

function paymentIssueBadge() {
  return `<span class="status-badge status-payment" title="Cookie sống, có gói nhưng payment đang fail">Lỗi TT</span>`
}

function stripPaymentNote(note) {
  return String(note || '').replace(/^\[Lỗi TT\]\s*[^·\n\r]*(?:·\s*)?/i, '').trim()
}

function paymentNote(note, plan) {
  const rest = stripPaymentNote(note)
  const base = `[Lỗi TT] ${plan || 'Premium'}`
  return rest ? `${base} · ${rest}` : base
}

function accountHasPaymentIssue(row) {
  if (!row || typeof row !== 'object') return false
  return hasPaymentIssue(row) || /^\[Lỗi TT\]/i.test(String(row.note || ''))
}

function accountStatusBadge(row) {
  if (accountHasPaymentIssue(row) && String(row.status || 'available') === 'available') return paymentIssueBadge()
  return badge(row?.status)
}

async function inspectNetflixPaymentIssue(value, service = 'netflix') {
  if ((service || 'netflix') !== 'netflix') return null
  try {
    const [cookieCheck, acct] = await Promise.all([
      apiCheckCookie(value),
      apiNetflixAccountInfo(value)
    ])
    const paymentError = hasPaymentIssue(cookieCheck) || hasPaymentIssue(cookieCheck?.raw) || hasPaymentIssue(acct)
    if (!paymentError) return null
    if (cookieCheck?.alive === false) return null
    if (acct?.reachable && acct?.hasPlan === false) return null
    return {
      paymentError: true,
      plan: acct?.plan || cookieCheck?.raw?.plan || cookieCheck?.raw?.subscription || 'Premium',
      billingText: acct?.billingText || null,
      profiles: acct?.profiles || [],
    }
  } catch {
    return null
  }
}

function code(value) {
  const text = value ? String(value).replace(/-/g, '').slice(0, 8).toUpperCase() : '-'
  return `<code>${esc(text)}</code>`
}

function valueOf(selector) {
  return state.content.querySelector(selector)?.value?.trim() || ''
}

function emptyState(title, text, actionLabel, action) {
  return `
    <div class="admin-v2-empty">
      <h2>${esc(title)}</h2>
      <p>${esc(text || '')}</p>
      ${action ? `<button type="button" class="btn btn-primary" data-action="${attr(action)}">${esc(actionLabel || 'Thử lại')}</button>` : ''}
    </div>
  `
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function attr(value) {
  return esc(value).replace(/"/g, '&quot;')
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function shortText(value, size = 48) {
  const s = String(value || '-')
  return s.length > size ? `${s.slice(0, size)}…` : s
}

function structuredCloneSafe(value) {
  try { return structuredClone(value) } catch { return JSON.parse(JSON.stringify(value)) }
}

function cssEscape(value) {
  return String(value || '').replace(/["\\]/g, '\\$&')
}

function adminHashParams() {
  const raw = window.location.hash.slice(1)
  const query = raw.includes('?') ? raw.split('?').slice(1).join('?') : ''
  return new URLSearchParams(query)
}

function initialAdminTab() {
  const tab = adminHashParams().get('tab')
  if (tab === 'products') return 'categories'
  return TABS.some(item => item.id === tab) ? tab : 'overview'
}

function scrollToInitialAdminSection() {
  const section = adminHashParams().get('section')
  if (!section) return
  requestAnimationFrame(() => {
    const target = state?.content?.querySelector(`#${cssEscape(section)}`)
    state?.content?.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === section)
    })
    if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' })
  })
}

function scrollAdminToTop() {
  const main = state?.container?.querySelector('.admin-v2-main')
  if (main) main.scrollTop = 0
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}



// ── SVG icons ─────────────────────────────────────────────────────────────────

function iconSvg(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}
function iconGrid()     { return iconSvg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>') }
function iconFile()     { return iconSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/>') }
function iconBell()     { return iconSvg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>') }
function iconCard()     { return iconSvg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>') }
function iconDatabase() { return iconSvg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>') }
function iconBox()      { return iconSvg('<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>') }
function iconList()     { return iconSvg('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>') }
function iconUsers()    { return iconSvg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>') }
function iconWallet()   { return iconSvg('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><path d="M2 12h20"/>') }
function iconBook()     { return iconSvg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') }
function iconSettings() { return iconSvg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7.1 4l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 20 7.1l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>') }
function iconLogOut()   { return iconSvg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>') }
function iconRefresh()  { return iconSvg('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 16v5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 8V3h-5"/>') }
function iconPlus()     { return iconSvg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>') }
function iconInbox()    { return iconSvg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>') }
function iconFolder()   { return iconSvg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>') }
function iconSearch()   { return iconSvg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>') }
function iconClock()    { return iconSvg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>') }
function iconTrash()    { return iconSvg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>') }
function iconSend()     { return iconSvg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>') }
