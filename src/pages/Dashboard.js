import { getUser } from '../utils/auth.js'
import {
  getUserSubscriptions, getUserPayments, getPlans, claimWarranty, reportCannotViewToAdmin,
  getMyViewerReportNotices, getWalletBalance
} from '../utils/api.js'
import { apiGetLink, apiCheckPlanStatus, apiTvInit, apiTvSubmit, apiNetflixAccountInfo } from '../utils/netflix.js'
import {
  formatVND, formatDate, statusLabel, statusClass,
  daysLeft, planLabel, parseAccount, maskPassword
} from '../utils/format.js'

/** Gói không còn quyền xem thông tin tài khoản (hết hạn / huỷ / quá end_at) */
function subscriptionAccessExpired(sub) {
  if (!sub) return true
  if (sub.status === 'expired' || sub.status === 'cancelled') return true
  if (!sub.end_at) return false
  return new Date(sub.end_at).getTime() <= Date.now()
}

const RENEW_PLAN_ORDER = [
  { id: 'day', label: '1 ngày' },
  { id: 'month', label: '1 tháng' },
  { id: 'half_year', label: '6 tháng' },
  { id: 'year', label: '1 năm' }
]

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

const DASH_SUB_FILTERS_KEY = 'dashSubFilters_v1'

function loadDashSubFilters() {
  try {
    const j = JSON.parse(sessionStorage.getItem(DASH_SUB_FILTERS_KEY) || 'null')
    if (!j || typeof j !== 'object') return { q: '', status: 'all', service: 'all' }
    return {
      q: String(j.q || ''),
      status: String(j.status || 'all'),
      service: String(j.service || 'all')
    }
  } catch {
    return { q: '', status: 'all', service: 'all' }
  }
}

function saveDashSubFilters(fs) {
  try {
    sessionStorage.setItem(DASH_SUB_FILTERS_KEY, JSON.stringify(fs))
  } catch {
    /* ignore */
  }
}

async function fetchViewerNoticesBySubId() {
  try {
    const j = await getMyViewerReportNotices()
    return new Map((j.notices || []).map((n) => [n.subscription_id, n]))
  } catch {
    return new Map()
  }
}

function buildRenewOptionsHtml(plansList) {
  const byId = new Map((plansList || []).map(p => [p.id, p]))
  const chips = []
  for (const { id, label } of RENEW_PLAN_ORDER) {
    const p = byId.get(id)
    if (!p) continue
    chips.push(
      `<a href="#/payment/${id}" class="renew-chip"><span class="renew-chip__lbl">${label}</span><span class="renew-chip__px">${formatVND(p.price ?? 0)}</span></a>`
    )
  }
  if (chips.length === 0) {
    return `<div class="renew-options"><a href="#/plans" class="renew-chip renew-chip--solo"><span class="renew-chip__lbl">Xem bảng giá</span></a></div>`
  }
  return `<div class="renew-options">${chips.join('')}</div>`
}

/** Kiểm tra nếu kết quả API trả về lỗi thanh toán */
function hasPaymentIssue(data) {
  if (!data || typeof data !== 'object') return false
  return !!(data.paymentError || data.paymentFailed || data.payment_error || data.payment_failed)
}

function getLoginLinkErrorMessage(res = {}) {
  if (res.reason === 'cookie_dead') {
    return 'Tài khoản bị mất phiên đăng nhập. Vui lòng bấm <strong>Bảo hành</strong> để được cấp lại.'
  }
  if (res.reason === 'plan_lost') {
    return 'Gói dịch vụ không còn hiệu lực. Vui lòng bấm <strong>Bảo hành</strong> để kiểm tra.'
  }
  return 'Không thể lấy link lúc này. Vui lòng bấm <strong>Bảo hành</strong> nếu lỗi tiếp tục.'
}

function getWarrantyErrorMessage(res = {}) {
  if (res.reason === 'already_used') return 'Đơn đã được bảo hành trước đó.'
  if (res.reason === 'expired') return 'Đơn đã hết hạn, không đủ điều kiện bảo hành.'
  if (res.reason === 'out_of_scope' || res.aliveAndHasPlan) {
    return 'Lỗi không thuộc phạm vi bảo hành, vui lòng liên hệ hỗ trợ.'
  }
  return res.message || 'Không thể bảo hành. Vui lòng liên hệ hỗ trợ.'
}

function updateDashboardStats(container, subs = []) {
  const now = Date.now()
  const active = subs.filter(s => s.status === 'active' && !subscriptionAccessExpired(s)).length
  const pending = subs.filter(s => s.status === 'pending' || s.status === 'processing').length
  const expiring = subs.filter((s) => {
    if (!s.end_at || s.status !== 'active') return false
    const diff = new Date(s.end_at).getTime() - now
    return diff > 0 && diff <= 3 * 86400000
  }).length
  const set = (id, value) => {
    const el = container.querySelector(id)
    if (el) el.textContent = String(value)
  }
  set('#dashStatTotal', subs.length)
  set('#dashStatActive', active)
  set('#dashStatPending', pending)
  set('#dashStatExpiring', expiring)
}

export async function renderDashboard(container) {
  const user = getUser()
  if (!user) return
  const avatarLetter = (user?.email || 'U')[0].toUpperCase()

  container.innerHTML = `
    <section class="dashboard-section">
      <div class="page-container dash-shell">
        <header class="dash-hero">
          <div class="dash-hero__identity">
            <div class="dash-hero__avatar">${avatarLetter}</div>
            <div>
              <p class="dash-eyebrow">Khu vực khách hàng</p>
              <h1 class="dash-title">Tài khoản của tôi</h1>
              <p class="dash-desc">${escHtml(user.email || 'Quản lý đơn hàng và thanh toán')}</p>
            </div>
          </div>

          <div class="dash-wallet-summary">
            <span class="dash-wallet-summary__label">Số dư ví</span>
            <strong id="dashWalletBalance">Đang tải...</strong>
            <a href="#/wallet" class="dash-wallet-summary__link">Nạp tiền</a>
          </div>
        </header>

        <div class="dash-summary-grid" id="dashSummaryGrid">
          <div class="dash-summary-card">
            <span class="dash-summary-card__label">Tổng đơn</span>
            <strong id="dashStatTotal">-</strong>
          </div>
          <div class="dash-summary-card dash-summary-card--ok">
            <span class="dash-summary-card__label">Đang hoạt động</span>
            <strong id="dashStatActive">-</strong>
          </div>
          <div class="dash-summary-card dash-summary-card--wait">
            <span class="dash-summary-card__label">Chờ xử lý</span>
            <strong id="dashStatPending">-</strong>
          </div>
          <div class="dash-summary-card dash-summary-card--warn">
            <span class="dash-summary-card__label">Sắp hết hạn</span>
            <strong id="dashStatExpiring">-</strong>
          </div>
        </div>

        <div class="dash-workspace">
          <div class="dash-tabs-wrap">
            <div class="dash-tabs">
              <div class="dash-tab-indicator" id="dashTabIndicator"></div>
              <button class="dash-tab active" data-tab="subs">
                <span class="dash-tab-icon" aria-hidden="true">▦</span>
                Đơn hàng
              </button>
              <button class="dash-tab" data-tab="payments">
                <span class="dash-tab-icon" aria-hidden="true">◱</span>
                Thanh toán
              </button>
            </div>
          </div>
          <div class="dash-panel" id="panelSubs">
            <div class="sub-list">
              <div class="skeleton dash-skeleton"></div>
              <div class="skeleton dash-skeleton"></div>
              <div class="skeleton dash-skeleton"></div>
            </div>
          </div>
          <div class="dash-panel" id="panelPayments" style="display:none;">
            <div class="loading"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    </section>
  `

  const tabs = container.querySelectorAll('.dash-tab')
  const panelSubs = container.querySelector('#panelSubs')
  const panelPayments = container.querySelector('#panelPayments')
  const indicator = container.querySelector('#dashTabIndicator')

  const moveIndicator = (activeTab) => {
    if (!indicator || !activeTab) return
    const tabsEl = activeTab.closest('.dash-tabs')
    const tabsRect = tabsEl?.getBoundingClientRect()
    const activeRect = activeTab.getBoundingClientRect()
    if (!tabsRect) return
    indicator.style.left = (activeRect.left - tabsRect.left) + 'px'
    indicator.style.width = activeRect.width + 'px'
    indicator.style.top = '3px'
    indicator.style.height = (activeRect.height) + 'px'
  }

  // Initial indicator position
  requestAnimationFrame(() => moveIndicator(container.querySelector('.dash-tab.active')))

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      moveIndicator(tab)
      panelSubs.style.display = tab.dataset.tab === 'subs' ? 'block' : 'none'
      panelPayments.style.display = tab.dataset.tab === 'payments' ? 'block' : 'none'
    })
  })

  let linkPollerTimer    = null
  let countdownTimer     = null
  let pendingPollTimer   = null

  const stopPoller = () => {
    if (linkPollerTimer)  { clearInterval(linkPollerTimer);  linkPollerTimer  = null }
    if (countdownTimer)   { clearInterval(countdownTimer);   countdownTimer   = null }
    if (pendingPollTimer) { clearInterval(pendingPollTimer); pendingPollTimer = null }
  }

  try {
    const [subs, payments, renewPlans, noticesMap, walletData] = await Promise.all([
      getUserSubscriptions(user.id),
      getUserPayments(user.id),
      getPlans().catch(() => []),
      fetchViewerNoticesBySubId(),
      getWalletBalance().catch(() => ({ balance: window.__walletBalance || 0 }))
    ])
    const walletBalance = Number(walletData?.balance || 0)
    window.__walletBalance = walletBalance
    window.dispatchEvent(new CustomEvent('walletUpdated', { detail: { balance: walletBalance } }))
    const walletEl = container.querySelector('#dashWalletBalance')
    if (walletEl) walletEl.textContent = formatVND(walletBalance)
    updateDashboardStats(container, subs)
    renderSubscriptions(panelSubs, subs, renewPlans, noticesMap)
    renderPayments(panelPayments, payments)

    // ── Countdown timer cho đơn pending ──────────────────────
    const pendingPaymentSubs = subs.filter(s => s.status === 'pending')
    if (pendingPaymentSubs.length > 0) {
      countdownTimer = setInterval(() => {
        pendingPaymentSubs.forEach(sub => {
          const el = panelSubs.querySelector(`#cdt-${sub.id}`)
          if (!el) return
          const cdEl = panelSubs.querySelector(`#countdown-${sub.id}`)
          const deadline = cdEl ? parseInt(cdEl.dataset.deadline) : 0
          const remaining = Math.max(0, deadline - Date.now())
          const min = Math.floor(remaining / 60000)
          const sec = Math.floor((remaining % 60000) / 1000)
          el.textContent = `${min}:${String(sec).padStart(2,'0')}`
          if (remaining === 0) {
            el.closest('.acc-pending-countdown')?.classList.add('acc-pending-countdown--urgent')
          }
        })
      }, 1000)

      // Poll mỗi 30s để detect nếu server đã hủy → re-render
      pendingPollTimer = setInterval(async () => {
        try {
          const fresh = await getUserSubscriptions(user.id)
          const wasCancelled = pendingPaymentSubs.some(s => {
            const updated = fresh.find(f => f.id === s.id)
            return updated && updated.status === 'cancelled'
          })
          if (wasCancelled) {
            const nm = await fetchViewerNoticesBySubId()
            renderSubscriptions(panelSubs, fresh, renewPlans, nm)
            clearInterval(pendingPollTimer); pendingPollTimer = null
            clearInterval(countdownTimer);   countdownTimer   = null
          }
        } catch {}
      }, 30000)
    }

    // ── Poll link cho active subs ─────────────────────────────
    let pendingIds = new Set(
      subs.filter(s => s.status === 'active' && !s.login_link && !subscriptionAccessExpired(s)).map(s => s.id)
    )

    const pollPendingLoginLinks = async () => {
      if (pendingIds.size === 0) { clearInterval(linkPollerTimer); linkPollerTimer = null; return }
      let newSubs
      try { newSubs = await getUserSubscriptions(user.id) } catch { return }
      let gained = false
      for (const id of pendingIds) {
        const row = newSubs.find(s => s.id === id)
        if (row?.login_link) gained = true
      }
      if (gained) {
        const nm = await fetchViewerNoticesBySubId()
        renderSubscriptions(panelSubs, newSubs, renewPlans, nm)
        pendingIds = new Set(
          newSubs.filter(s => s.status === 'active' && !s.login_link && !subscriptionAccessExpired(s)).map(s => s.id)
        )
      }
      if (pendingIds.size === 0) { clearInterval(linkPollerTimer); linkPollerTimer = null }
    }

    if (pendingIds.size > 0) {
      pollPendingLoginLinks()
      linkPollerTimer = setInterval(pollPendingLoginLinks, 20000)
    }

  } catch (err) {
    panelSubs.innerHTML = `<p class="error-text">Lỗi: ${err.message}</p>`
    panelPayments.innerHTML = `<p class="error-text">Lỗi: ${err.message}</p>`
  }

  return stopPoller
}

function renderSubscriptions(panel, subs, renewPlans = [], noticesBySubId = new Map()) {
  const renewGridHtml = buildRenewOptionsHtml(renewPlans)

  if (!subs || subs.length === 0) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#x1F4E6;</div>
        <h3>Chưa có đăng ký nào</h3>
        <p>Mua gói dịch vụ để bắt đầu sử dụng</p>
        <a href="#/products" class="btn btn-primary">Xem dịch vụ</a>
      </div>`
    return
  }

  const serviceSet = new Set()
  subs.forEach((sub) => {
    const plan = sub.plans || {}
    serviceSet.add(String(plan.service || 'netflix').toLowerCase())
  })
  const serviceOpts = [...serviceSet]
    .sort()
    .map((s) => '<option value="' + escapeAttr(s) + '">' + escHtml(s) + '</option>')
    .join('')

  const fs0 = loadDashSubFilters()

  let html = `
  <div class="dash-sub-toolbar">
    <div class="dash-sub-toolbar__row">
      <div class="dash-sub-field dash-sub-field--search">
        <label class="dash-sub-toolbar__label" for="dashSubSearch">Tìm kiếm</label>
        <input type="search" id="dashSubSearch" class="dash-sub-search-input"
          placeholder="Mã đơn, tên gói, dịch vụ…" autocomplete="off"
          value="${escapeAttr(fs0.q)}" />
      </div>
      <div class="dash-sub-field">
        <label class="dash-sub-toolbar__label" for="dashSubFilterStatus">Trạng thái</label>
        <select id="dashSubFilterStatus" class="dash-sub-select" aria-label="Lọc trạng thái">
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="expired">Hết hạn</option>
          <option value="pending">Chờ thanh toán</option>
          <option value="processing">Chờ admin</option>
          <option value="cancelled">Đã hủy</option>
        </select>
      </div>
      <div class="dash-sub-field">
        <label class="dash-sub-toolbar__label" for="dashSubFilterService">Dịch vụ</label>
        <select id="dashSubFilterService" class="dash-sub-select" aria-label="Lọc dịch vụ">
          <option value="all">Tất cả dịch vụ</option>
          ${serviceOpts}
        </select>
      </div>
    </div>
    <p class="dash-sub-toolbar__meta" id="dashSubFilterMeta" aria-live="polite"></p>
  </div>
  <div id="dashSubEmptyFiltered" class="dash-sub-empty-filtered" style="display:none;" role="status">
    <p>Không có đăng ký nào khớp bộ lọc hoặc từ khóa.</p>
  </div>
  <div class="sub-list" id="dashSubList">`

  subs.forEach(sub => {
    html += buildSubCardHtml(sub, renewGridHtml, noticesBySubId)
  })

  html += '</div>'
  panel.innerHTML = html

  function applySubscriptionFilters() {
    const rawQ = panel.querySelector('#dashSubSearch')?.value || ''
    const q = rawQ.trim().toLowerCase().replace(/^#/, '').replace(/-/g, '')
    const st = panel.querySelector('#dashSubFilterStatus')?.value || 'all'
    const sv = panel.querySelector('#dashSubFilterService')?.value || 'all'
    const listEl = panel.querySelector('#dashSubList')
    const cards = listEl ? listEl.querySelectorAll(':scope > .sub-card') : []
    let visible = 0
    cards.forEach((card) => {
      const id = card.dataset.subId
      const sub = subs.find((s) => s.id === id)
      if (!sub) {
        card.style.display = 'none'
        return
      }
      const plan = sub.plans || {}
      const service = String(plan.service || 'netflix').toLowerCase()
      const svcName = String(plan.name || planLabel(sub.plan) || '').toLowerCase()
      const code = String(id).replace(/-/g, '').substring(0, 8).toLowerCase()
      const planSlug = String(sub.plan || '').toLowerCase()
      const idNorm = String(id).replace(/-/g, '').toLowerCase()
      const expired = subscriptionAccessExpired(sub)

      let okStatus = true
      if (st === 'active') okStatus = sub.status === 'active' && !expired
      else if (st === 'expired') okStatus = sub.status === 'expired' || expired
      else if (st === 'pending') okStatus = sub.status === 'pending'
      else if (st === 'processing') okStatus = sub.status === 'processing'
      else if (st === 'cancelled') okStatus = sub.status === 'cancelled'

      const okService = sv === 'all' || service === sv

      const hay = code + ' ' + svcName + ' ' + service + ' ' + planSlug + ' ' + idNorm
      const okSearch = !q || hay.includes(q)

      const show = okStatus && okService && okSearch
      card.style.display = show ? '' : 'none'
      if (show) visible++
    })
    const emptyF = panel.querySelector('#dashSubEmptyFiltered')
    const meta = panel.querySelector('#dashSubFilterMeta')
    const total = subs.length
    if (emptyF) emptyF.style.display = visible === 0 && total > 0 ? 'block' : 'none'
    if (meta) {
      const plain = !q && st === 'all' && sv === 'all'
      meta.textContent = plain ? (total + ' đơn') : ('Hiển thị ' + visible + ' / ' + total + ' đơn')
    }
  }

  const inp = panel.querySelector('#dashSubSearch')
  const selSt = panel.querySelector('#dashSubFilterStatus')
  const selSv = panel.querySelector('#dashSubFilterService')
  const stOk = ['all', 'active', 'expired', 'pending', 'processing', 'cancelled'].includes(fs0.status)
  if (selSt && stOk) selSt.value = fs0.status
  if (selSv && (fs0.service === 'all' || serviceSet.has(fs0.service))) selSv.value = fs0.service

  const persistAndApply = () => {
    saveDashSubFilters({
      q: inp?.value || '',
      status: selSt?.value || 'all',
      service: selSv?.value || 'all'
    })
    applySubscriptionFilters()
  }
  inp?.addEventListener('input', persistAndApply)
  selSt?.addEventListener('change', persistAndApply)
  selSv?.addEventListener('change', persistAndApply)
  applySubscriptionFilters()

  // ===== COPY =====
  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return } catch {}
    }
    copyFallback(text)
  }
  function copyFallback(text) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
    return Promise.resolve()
  }

  panel.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      copyToClipboard(btn.dataset.copy)
      const orig = btn.innerHTML
      btn.innerHTML = '&#x2705;'
      setTimeout(() => btn.innerHTML = orig, 1500)
    })
  })

  // ===== TOGGLE PASSWORD =====
  panel.querySelectorAll('.btn-toggle-pass').forEach(btn => {
    let shown = false
    btn.addEventListener('click', () => {
      shown = !shown
      const el = panel.querySelector('#pass-' + btn.dataset.sub)
      const pass = decodeURIComponent(btn.dataset.pass)
      el.textContent = shown ? pass : maskPassword(pass)
      btn.textContent = shown ? '&#x1F648;' : '&#x1F441;&#xFE0F;'
    })
  })

  // ===== GET LOGIN LINK =====
  panel.querySelectorAll('.acc-get-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subId = btn.dataset.sub
      const cookie = decodeURIComponent(btn.dataset.cookie)
      const resultEl = panel.querySelector('#result-link-' + subId)

      if (!cookie) {
        showResult(resultEl, 'error', '&#x274C; Tài khoản bị mất phiên đăng nhập. Vui lòng bấm <strong>Bảo hành</strong> để được cấp lại.')
        return
      }

      showResult(resultEl, 'loading', '&#x23F3; Đang lấy login link...')
      btn.disabled = true

      try {
        const res = await apiGetLink(cookie)
        if (res.success && res.link) {
          resultEl.innerHTML = '<div class="result-success"><div class="result-title">&#x2705; Login Link của bạn:</div><div class="result-link-row"><input type="text" value="' + res.link + '" readonly class="result-link-input" id="final-link-' + subId + '"><button class="btn btn-sm btn-primary copy-final-link" data-link="' + res.link + '">&#x1F4CB; Copy</button></div><a href="' + res.link + '" target="_blank" rel="noopener" class="btn btn-sm btn-outline" style="margin-top:8px;display:inline-block;">&#x1F680; Mở link đăng nhập</a></div>'
          resultEl.style.display = 'block'
          resultEl.querySelector('.copy-final-link')?.addEventListener('click', e => {
            copyToClipboard(e.target.dataset.link)
            e.target.textContent = '&#x2705; Copied!'
            setTimeout(() => e.target.textContent = '&#x1F4CB; Copy', 2000)
          })
        } else {
          showResult(resultEl, 'error', '&#x274C; ' + getLoginLinkErrorMessage(res))
        }
      } catch (err) {
        showResult(resultEl, 'error', '&#x274C; Không thể lấy link lúc này. Vui lòng bấm <strong>Bảo hành</strong> nếu lỗi tiếp tục.')
      } finally {
        btn.disabled = false
      }
    })
  })

  // TV LOGIN handlers → xem block đầy đủ bên dưới (tránh duplicate event listener)

  async function submitViewerReport(subId, panel) {
    const resultEl = panel.querySelector('#result-warranty-' + subId)
    const reportBtn = panel.querySelector('.acc-report-view-btn[data-sub="' + subId + '"]')
    if (reportBtn) reportBtn.disabled = true
    try {
      showResult(resultEl, 'loading', '\u23f3 \u0110ang g\u1eedi b\u00e1o t\u1edbi admin...')
      await reportCannotViewToAdmin(subId)
      showResult(resultEl, 'success', '\u2705 \u0110\u00e3 g\u1eedi b\u00e1o cho admin. Admin s\u1ebd ki\u1ec3m tra th\u1ee7 c\u00f4ng.<br><small>N\u1ebfu <strong>cookie die</strong> ho\u1eb7c <strong>m\u1ea5t Premium</strong>, d\u00f9ng <strong>B\u1ea3o h\u00e0nh</strong> \u0111\u1ec3 h\u1ec7 th\u1ed1ng t\u1ef1 \u0111\u1ed5i.</small>')
    } catch (err) {
      showResult(resultEl, 'error', '\u274c ' + err.message)
    } finally {
      if (reportBtn) reportBtn.disabled = false
    }
  }

  async function triggerWarranty(subId, cookie, panel, renewPlans, preReason) {
    const resultEl = panel.querySelector('#result-warranty-' + subId)
    const warrantyBtn = panel.querySelector('.acc-warranty-btn[data-sub="' + subId + '"]')
    if (warrantyBtn) warrantyBtn.disabled = true

    try {
      let reason = preReason || 'unknown'

      if (!preReason && cookie) {
        showResult(resultEl, 'loading', '\u23f3 \u0110ang ki\u1ec3m tra t\u00ecnh tr\u1ea1ng t\u00e0i kho\u1ea3n...')
        try {
          const check = await apiCheckPlanStatus(cookie)
          if (check.alive && check.hasPremium) {
            let payErr = hasPaymentIssue(check) || hasPaymentIssue(check.raw)
            if (!payErr) {
              try {
                const acct = await apiNetflixAccountInfo(cookie)
                payErr = hasPaymentIssue(acct)
              } catch {}
            }
            if (!payErr) {
              showResult(resultEl, 'success', '\u2705 T\u00e0i kho\u1ea3n OK \u2014 g\u00f3i ' + (check.plan || 'Premium') + ' \u0111ang ho\u1ea1t \u0111\u1ed9ng b\u00ecnh th\u01b0\u1eddng.')
              if (warrantyBtn) warrantyBtn.disabled = false
              return
            }
            reason = 'payment_error'
          } else {
            reason = check.reason || (!check.alive ? 'cookie_dead' : 'plan_lost')
          }
        } catch {}
      }

      const reasonMsg = reason === 'payment_error'
        ? '\u23f3 Ph\u00e1t hi\u1ec7n l\u1ed7i thanh to\u00e1n. \u0110ang \u0111\u1ed5i t\u00e0i kho\u1ea3n m\u1edbi...'
        : reason === 'plan_lost'
          ? '\u23f3 Ph\u00e1t hi\u1ec7n m\u1ea5t g\u00f3i Premium. \u0110ang \u0111\u1ed5i t\u00e0i kho\u1ea3n m\u1edbi...'
          : '\u23f3 Cookie \u0111\u00e3 die. \u0110ang x\u1eed l\u00fd b\u1ea3o h\u00e0nh...'
      showResult(resultEl, 'loading', reasonMsg)

      const warranty = await claimWarranty(subId)

      if (warranty && warranty.success) {
        const u = getUser()
        if (u) {
          const [fresh, nm] = await Promise.all([getUserSubscriptions(u.id), fetchViewerNoticesBySubId()])
          renderSubscriptions(panel, fresh, renewPlans, nm)
          showResult(
            panel.querySelector('#result-warranty-' + subId),
            'success',
            '\u2705 Bảo hành thành công! Tài khoản đã được cấp lại.'
          )
        } else {
          showResult(resultEl, 'success', '\u2705 Bảo hành thành công! Tài khoản đã được cấp lại.')
        }
      } else {
        showResult(resultEl, 'error', '\u274c ' + getWarrantyErrorMessage(warranty))
      }
    } catch (err) {
      showResult(resultEl, 'error', '\u274c ' + (err.message || 'Lỗi không thuộc phạm vi bảo hành, vui lòng liên hệ hỗ trợ.'))
    } finally {
      if (warrantyBtn) warrantyBtn.disabled = false
    }
  }

  panel.querySelectorAll('.acc-warranty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerWarranty(btn.dataset.sub, decodeURIComponent(btn.dataset.cookie), panel, renewPlans)
    })
  })

  panel.querySelectorAll('.acc-report-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      submitViewerReport(btn.dataset.sub, panel)
    })
  })
}



  function buildSubCardHtml(sub, renewGridHtml, noticesBySubId) {
    const days = daysLeft(sub.end_at)
    const plan = sub.plans || {}
    const service = plan.service || 'netflix'
    const fulfillment = plan.fulfillment_type || (service === 'netflix' ? 'netflix' : 'manual')
    const isNetflix = service === 'netflix'
    const isManual  = fulfillment === 'manual'
    const isStock   = fulfillment === 'stock'
    const isActive  = sub.status === 'active'
    const isProcessing = sub.status === 'processing'
    const expired   = subscriptionAccessExpired(sub)

    const hasAccount = isNetflix && isActive && sub.login_link && !expired
    const acc = hasAccount ? parseAccount(sub.login_link) : null
    const cookie = acc ? (acc.cookie || '') : ''
    const vrRejected = noticesBySubId.get(sub.id)
    const deliveredContent = !isNetflix && sub.login_link ? sub.login_link : null
    const planDescription = String(
      plan.description ||
      plan.shortDescription ||
      plan.longDescription ||
      plan.instructions ||
      ''
    ).trim()
    const guideText = String(
      plan.usage_guide ||
      plan.guide ||
      plan.instruction ||
      plan.instructions ||
      plan.admin_note ||
      ''
    ).trim()

    const cardClass = (isActive && !expired)
      ? 'sub-card sub-card--active'
      : (sub.status === 'expired' || expired) ? 'sub-card sub-card--expired'
      : (sub.status === 'pending' || isProcessing) ? 'sub-card sub-card--pending'
      : 'sub-card'

    const svcName = plan.name || planLabel(sub.plan)
    const orderCode = sub.id ? '#' + sub.id.replace(/-/g,'').substring(0,8).toUpperCase() : ''
    const badgeService = !isNetflix
      ? '<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(66,133,244,0.12);color:#4285f4;margin-left:4px;text-transform:uppercase;">' + (isStock ? 'Sản phẩm cấp sẵn' : 'Dịch vụ') + '</span>'
      : '<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(229,9,20,0.12);color:#E50914;margin-left:4px;">Netflix Auto</span>'

    let cardHtml = '<div class="' + cardClass + '" data-sub-id="' + sub.id + '" data-plan="' + escapeAttr(sub.plan || '') + '">'

    // ── Header ──
    cardHtml += '<div class="sub-header">'
    cardHtml += '<div>'
    cardHtml += '<span class="sub-plan">' + svcName + '</span>'
    if (orderCode) cardHtml += '<span class="sub-order-code">' + orderCode + '</span>'
    cardHtml += badgeService
    cardHtml += '</div>'
    cardHtml += '<span class="status-badge ' + statusClass(sub.status) + '">' + statusLabel(sub.status) + '</span>'
    cardHtml += '</div>'

    // ── Details ──
    cardHtml += '<div class="sub-details">'
    cardHtml += '<div class="sub-detail"><span class="label">Dịch vụ:</span><span style="text-transform:capitalize;">' + service + '</span></div>'
    cardHtml += '<div class="sub-detail"><span class="label">Giá:</span><span>' + formatVND(plan.price || 0) + '</span></div>'
    if (sub.start_at) cardHtml += '<div class="sub-detail"><span class="label">Bắt đầu:</span><span>' + formatDate(sub.start_at) + '</span></div>'
    if (sub.end_at) {
      cardHtml += '<div class="sub-detail"><span class="label">Hết hạn:</span><span>' + formatDate(sub.end_at) + '</span></div>'
      const dangerCls = (days !== null && days <= 3) ? 'text-danger' : 'text-success'
      cardHtml += '<div class="sub-detail"><span class="label">Còn lại:</span><span class="' + dangerCls + '">' + (days !== null ? days : '—') + ' ngày</span></div>'
    }
    cardHtml += '<div class="sub-detail"><span class="label">Tạo lúc:</span><span>' + formatDate(sub.created_at) + '</span></div>'
    cardHtml += '</div>'

    // ── Manual service block ──
    if (!isNetflix && isManual) {
      cardHtml += '<div class="dash-premium-acc-box">'
      if (sub.status === 'pending' || isProcessing) {
        cardHtml += '<div class="dash-premium-pending"><div class="pending-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-slow"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div><div class="pending-text"><h4>Đang chờ admin xác nhận</h4><p>Đơn dịch vụ đã ghi nhận. Admin sẽ xác nhận hoặc từ chối nếu đơn không thành công.</p></div></div>'
      } else if (sub.status === 'active') {
        cardHtml += '<div style="display:flex;flex-direction:column;gap:12px;">'
        if (sub.login_link) {
          cardHtml += '<div class="premium-card premium-card--delivered">'
          cardHtml += '<div class="premium-card-header"><div class="premium-card-title"><span class="icon">&#x1F4E6;</span><span>Nội dung giao hàng</span></div><span class="premium-badge premium-badge--success">&#x2705; Đã giao</span></div>'
          cardHtml += '<div class="premium-card-body"><div class="content-display-box"><pre>' + escHtml(sub.login_link) + '</pre>'
          cardHtml += '<button class="premium-copy-btn btn-copy" data-copy="' + escapeAttr(sub.login_link) + '" title="Copy nội dung"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Sao chép</span></button>'
          cardHtml += '</div></div></div>'
        } else {
          cardHtml += '<div class="dash-premium-pending"><div class="pending-text"><p style="margin:0;font-size:14px;"><span class="link-pulse"></span> Đang chuẩn bị nội dung giao hàng...</p></div></div>'
        }
        if (sub.admin_note) {
          cardHtml += '<div class="premium-card premium-card--note"><div class="premium-card-header"><div class="premium-card-title"><span class="icon">&#x1F4AC;</span><span>Lời nhắn từ Shop</span></div></div><div class="premium-card-body"><p class="admin-message">' + escHtml(sub.admin_note) + '</p></div></div>'
        }
        cardHtml += '</div>'
      }
      cardHtml += '</div>'
    }

    // ── Stock product block ──
    if (!isNetflix && isStock) {
      cardHtml += '<div class="dash-premium-acc-box">'
      if (deliveredContent) {
        cardHtml += '<div class="premium-card premium-card--delivered"><div class="premium-card-header"><div class="premium-card-title"><span class="icon">&#x1F4E6;</span><span>Nội dung sản phẩm</span></div></div>'
        cardHtml += '<div class="premium-card-body"><div class="content-display-box"><pre>' + deliveredContent + '</pre>'
        cardHtml += '<button class="premium-copy-btn btn-copy" data-copy="' + escapeAttr(deliveredContent) + '" title="Copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Sao chép</span></button>'
        cardHtml += '</div></div></div>'
        if (planDescription || guideText || sub.admin_note) {
          cardHtml += '<div class="premium-card premium-card--note"><div class="premium-card-header"><div class="premium-card-title"><span class="icon">&#x1F4D8;</span><span>Hướng dẫn sử dụng</span></div></div><div class="premium-card-body">'
          if (planDescription) cardHtml += '<p class="admin-message">' + escHtml(planDescription) + '</p>'
          if (guideText) cardHtml += '<p class="admin-message">' + escHtml(guideText) + '</p>'
          if (sub.admin_note) cardHtml += '<p class="admin-message">' + escHtml(sub.admin_note) + '</p>'
          cardHtml += '</div></div>'
        }
      } else if (sub.status === 'pending' || isProcessing || sub.status === 'active') {
        cardHtml += '<div class="dash-premium-pending"><div class="pending-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-slow"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div><div class="pending-text"><h4>Đang chuẩn bị sản phẩm</h4><p>Sản phẩm sẽ được giao tự động hoặc bởi admin.</p></div></div>'
      }
      cardHtml += '</div>'
    }

    // ── Netflix account info block ──
    if (hasAccount && acc) {
      cardHtml += '<div class="dash-premium-acc-box"><div class="premium-card">'
      cardHtml += '<div class="premium-card-header" style="background:rgba(229,9,20,0.05);"><div class="premium-card-title"><span class="icon" style="color:#E50914;background:rgba(229,9,20,0.15);border:1px solid rgba(229,9,20,0.2)">&#x1F3AC;</span><span>Thông tin tài khoản Netflix</span></div>'
      if (sub.end_at) cardHtml += '<span class="premium-badge" style="background:rgba(255,255,255,0.08);color:#cbd5e1;border:1px solid rgba(255,255,255,0.15)">Hết hạn: ' + formatDate(sub.end_at) + '</span>'
      cardHtml += '</div>'
      cardHtml += '<div class="premium-card-body">'
      if (sub.end_at) cardHtml += '<div class="account-validity-banner" style="margin-bottom:16px;">Các nút <strong>Get link</strong>, <strong>TV</strong>, <strong>Bảo hành</strong> dùng được trong thời gian này.</div>'
      if (vrRejected) {
        cardHtml += '<div class="viewer-report-user-notice" role="status"><strong>Phan hoi tu shop</strong><p class="viewer-report-user-notice__text">' + escHtml(vrRejected.admin_note) + '</p>'
        if (vrRejected.resolved_at) cardHtml += '<p class="viewer-report-user-notice__meta">' + formatDate(vrRejected.resolved_at) + '</p>'
        cardHtml += '</div>'
      }
      const showCreds = ['1','true','yes','on','enabled'].includes(String(window.__siteSettings?.show_netflix_credentials || '').toLowerCase())
      cardHtml += '<div style="display:flex;flex-direction:column;">'
      if (showCreds && acc.email) cardHtml += '<div class="premium-acc-row"><span class="premium-acc-label">Email</span><span class="premium-acc-val">' + acc.email + '</span><button class="premium-copy-btn btn-copy" data-copy="' + acc.email + '" title="Copy" style="padding:4px 8px;font-size:11px;">&#x1F4CB; Copy</button></div>'
      if (showCreds && acc.password) cardHtml += '<div class="premium-acc-row"><span class="premium-acc-label">Mật khẩu</span><span class="premium-acc-val acc-pass-masked" id="pass-' + sub.id + '">' + maskPassword(acc.password) + '</span><button class="premium-copy-btn btn-toggle-pass acc-icon-btn" data-sub="' + sub.id + '" data-pass="' + encodeURIComponent(acc.password) + '" title="Hiện/Ẩn" style="padding:4px 8px;font-size:11px;">&#x1F441;&#xFE0F; Ẩn/Hiện</button><button class="premium-copy-btn btn-copy" data-copy="' + acc.password + '" title="Copy" style="padding:4px 8px;font-size:11px;">&#x1F4CB; Copy</button></div>'
      if (showCreds && cookie) cardHtml += '<div class="premium-acc-row" style="align-items:flex-start;gap:8px;"><span class="premium-acc-label" style="padding-top:6px;white-space:nowrap;">Cookie</span><textarea readonly style="flex:1;font-size:11px;font-family:monospace;padding:6px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text-primary);resize:none;height:56px;word-break:break-all;line-height:1.4;">' + escHtml(cookie) + '</textarea><button class="premium-copy-btn btn-copy" data-copy="' + escapeAttr(cookie) + '" title="Copy cookie" style="padding:4px 8px;font-size:11px;white-space:nowrap;">&#x1F4CB; Copy</button></div>'
      cardHtml += '</div>'
      cardHtml += '<div class="premium-actions-row">'
      cardHtml += '<button class="btn btn-sm btn-primary acc-get-link-btn" data-sub="' + sub.id + '" data-cookie="' + encodeURIComponent(cookie) + '" style="background:linear-gradient(135deg,#E50914 0%,#B80710 100%)">&#x1F517; Get Login Link</button>'
      cardHtml += '<button class="btn btn-sm btn-outline acc-tv-btn" data-sub="' + sub.id + '" data-cookie="' + encodeURIComponent(cookie) + '">&#x1F4FA; Nhập mã TV</button>'
      cardHtml += '<button class="btn btn-sm btn-warning acc-warranty-btn" data-sub="' + sub.id + '" data-cookie="' + encodeURIComponent(cookie) + '" title="Cookie die hoặc mất Premium">&#x1F527; Bảo hành</button>'
      cardHtml += '<button type="button" class="btn btn-sm btn-outline acc-report-view-btn" data-sub="' + sub.id + '" data-cookie="' + encodeURIComponent(cookie) + '" title="Vẫn không xem được dù tài khoản OK">&#x1F6A8; Báo lỗi</button>'
      cardHtml += '</div>'
      cardHtml += '<div class="acc-result-box" id="result-link-' + sub.id + '" style="display:none;margin-top:16px;"></div>'
      cardHtml += '<div class="tv-login-box" id="tv-box-' + sub.id + '" style="display:none;margin-top:16px;"><div class="acc-result-box tv-login-status" id="result-tv-' + sub.id + '" style="display:none;" aria-live="polite"></div><div class="tv-login-body"><p class="tv-instruction">Nhập mã số hiển thị trên TV Netflix (6-10 chữ số).</p><div class="tv-input-row"><input type="text" class="tv-code-input" id="tv-code-' + sub.id + '" placeholder="32148294" maxlength="10" inputmode="numeric" autocomplete="one-time-code"><div class="tv-actions"><button type="button" class="btn btn-primary acc-tv-submit-btn" data-sub="' + sub.id + '">Gửi mã</button><button type="button" class="btn btn-outline acc-tv-cancel-btn" data-sub="' + sub.id + '">Hủy</button></div></div></div></div>'
      cardHtml += '<div class="acc-result-box" id="result-warranty-' + sub.id + '" style="display:none;margin-top:16px;"></div>'
      cardHtml += '</div></div></div>'
    }

    // ── Expired block ──
    if (expired) {
      cardHtml += '<div class="sub-expired-box"><h4>Gói đã hết hạn</h4><p class="sub-expired-lead">Đăng nhập đã ẩn. Chọn gói gia hạn để nhận tài khoản sau thanh toán.</p>' + renewGridHtml + '<p class="sub-expired-hint">Nếu không gia hạn, slot share được hệ thống tự giải phóng sau ngày hết hạn.</p></div>'
    }

    // ── Netflix pending auto-assign ──
    if (isActive && isNetflix && !sub.login_link && !expired) {
      cardHtml += '<div class="acc-pending-notice" id="pending-notice-' + sub.id + '"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;"><span style="display:flex;align-items:center;gap:8px;"><span class="link-pulse"></span> Tài khoản Netflix đang được chuẩn bị — hệ thống sẽ tự gán trong ít phút...</span></div><div style="font-size:12px;margin-top:6px;color:var(--warning);opacity:.75;">Tự động kiểm tra mỗi 20 giây</div></div>'
    }

    // ── Payment pending countdown ──
    if (sub.status === 'pending' && !isProcessing) {
      const CANCEL_AFTER_MS = 30 * 60 * 1000
      const createdMs = sub.created_at ? new Date(sub.created_at).getTime() : Date.now()
      const remainingMs = Math.max(0, createdMs + CANCEL_AFTER_MS - Date.now())
      const remainingMin = Math.floor(remainingMs / 60000)
      const remainingSec = Math.floor((remainingMs % 60000) / 1000)
      const isExpiring = remainingMin < 5
      const urgentCls = isExpiring ? ' acc-pending-countdown--urgent' : ''
      cardHtml += '<div class="acc-pending-notice" id="pending-notice-' + sub.id + '"><div class="acc-pending-main">&#x23F3; Đang chờ xác nhận thanh toán từ ngân hàng...</div>'
      if (remainingMs > 0) {
        cardHtml += '<div class="acc-pending-countdown' + urgentCls + '" id="countdown-' + sub.id + '" data-deadline="' + (createdMs + CANCEL_AFTER_MS) + '">'
        cardHtml += (isExpiring ? '&#x26A0;&#xFE0F;' : '&#x1F550;') + ' Tu huy sau: <strong id="cdt-' + sub.id + '">' + remainingMin + ':' + String(remainingSec).padStart(2,'0') + '</strong></div>'
      } else {
        cardHtml += '<div class="acc-pending-countdown acc-pending-countdown--urgent">&#x26A0;&#xFE0F; Đơn này sẽ bị hủy ngay — vui lòng liên hệ admin nếu đã chuyển tiền.</div>'
      }
      cardHtml += '</div>'
    }

    cardHtml += '</div>'
    return cardHtml
  }
/*
  subs.forEach(sub => {
    html += buildSubCardHtml(sub, renewGridHtml, noticesBySubId)
  })


            ${sub.login_link ? `
              <div class="premium-card premium-card--delivered">
                <div class="premium-card-header">
                  <div class="premium-card-title">
                    <span class="icon">📦</span>
                    <span>Nội dung giao hàng</span>
                  </div>
                  <span class="premium-badge premium-badge--success">✅ Đã giao</span>
                </div>
                <div class="premium-card-body">
                  <div class="content-display-box">
                    <pre>${escHtml(sub.login_link)}</pre>
                    <button class="premium-copy-btn btn-copy" data-copy="${escapeAttr(sub.login_link)}" title="Copy nội dung">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      <span>Sao chép</span>
                    </button>
                  </div>
                </div>
              </div>
            ` : `
               <div class="dash-premium-pending">
                  <div class="pending-text">
                    <p style="margin:0;font-size:14px;"><span class="link-pulse"></span> Đang chuẩn bị nội dung giao hàng...</p>
                  </div>
               </div>
            `}
            ${sub.admin_note ? `
              <div class="premium-card premium-card--note">
                <div class="premium-card-header">
                  <div class="premium-card-title">
                    <span class="icon">💬</span>
                    <span>Lời nhắn từ Shop</span>
                  </div>
                </div>
                <div class="premium-card-body">
                  <p class="admin-message">${escHtml(sub.admin_note)}</p>
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>` : ''}


      ${/* ── Non-Netflix: Stock product ── * / ''}
      ${!isNetflix && isStock ? `
      <div class="dash-premium-acc-box">
        ${deliveredContent ? `
          <div class="premium-card premium-card--delivered">
            <div class="premium-card-header">
              <div class="premium-card-title">
                <span class="icon">📦</span>
                <span>Nội dung sản phẩm</span>
              </div>
            </div>
            <div class="premium-card-body">
              <div class="content-display-box">
                <pre>${deliveredContent}</pre>
                <button class="premium-copy-btn btn-copy" data-copy="${escapeAttr(deliveredContent)}" title="Copy">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>Sao chép</span>
                </button>
              </div>
            </div>
          </div>
        ` : sub.status === 'pending' ? `
          <div class="dash-premium-pending">
            <div class="pending-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-slow"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            </div>
            <div class="pending-text">
              <h4>Đang chuẩn bị sản phẩm</h4>
              <p>Sản phẩm sẽ được giao tự động hoặc bởi admin.</p>
            </div>
          </div>
        ` : ''}
      </div>` : ''}

      ${/* ── Netflix only ── * / ''}
      ${hasAccount && acc ? `
      <!-- ===== ACCOUNT INFO ===== -->
      <div class="dash-premium-acc-box">
        <div class="premium-card">
          <div class="premium-card-header" style="background:rgba(229,9,20,0.05);">
            <div class="premium-card-title">
              <span class="icon" style="color:#E50914;background:rgba(229,9,20,0.15);border:1px solid rgba(229,9,20,0.2)">🎬</span>
              <span>Thông tin tài khoản Netflix</span>
            </div>
            ${sub.end_at ? '<span class="premium-badge" style="background:rgba(255,255,255,0.08);color:#cbd5e1;border:1px solid rgba(255,255,255,0.15)">Hết hạn: ' + formatDate(sub.end_at) + '</span>' : ''}
          </div>
          <div class="premium-card-body">
            ${sub.end_at ? `
            <div class="account-validity-banner" style="margin-bottom:16px;">
              Các nút <strong>Get link</strong>, <strong>TV</strong>, <strong>Bảo hành</strong> dùng được trong thời gian này.
            </div>` : ''}
            ${vrRejected ? `
            <div class="viewer-report-user-notice" role="status">
              <strong>Phản hồi từ shop</strong>
              <p class="viewer-report-user-notice__text">${escHtml(vrRejected.admin_note)}</p>
              ${vrRejected.resolved_at ? '<p class="viewer-report-user-notice__meta">' + formatDate(vrRejected.resolved_at) + '</p>' : ''}
            </div>` : ''}
            
            <div style="display:flex;flex-direction:column;">
              ${acc.email ? `
              <div class="premium-acc-row">
                <span class="premium-acc-label">Email</span>
                <span class="premium-acc-val">${acc.email}</span>
                <button class="premium-copy-btn btn-copy" data-copy="${acc.email}" title="Copy" style="padding:4px 8px;font-size:11px;">📋 Copy</button>
              </div>` : ''}
              ${acc.password ? `
              <div class="premium-acc-row">
                <span class="premium-acc-label">Mật khẩu</span>
                <span class="premium-acc-val acc-pass-masked" id="pass-${sub.id}">${maskPassword(acc.password)}</span>
                <button class="premium-copy-btn btn-toggle-pass acc-icon-btn" data-sub="${sub.id}" data-pass="${encodeURIComponent(acc.password)}" title="Hiện/Ẩn" style="padding:4px 8px;font-size:11px;">👁️ Ẩn/Hiện</button>
                <button class="premium-copy-btn btn-copy" data-copy="${acc.password}" title="Copy" style="padding:4px 8px;font-size:11px;">📋 Copy</button>
              </div>` : ''}
              ${cookie ? `
              <div class="premium-acc-row" style="align-items:flex-start;gap:8px;">
                <span class="premium-acc-label" style="padding-top:6px;white-space:nowrap;">Cookie</span>
                <textarea readonly style="flex:1;font-size:11px;font-family:monospace;padding:6px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text-primary);resize:none;height:56px;word-break:break-all;line-height:1.4;">${escHtml(cookie)}</textarea>
                <button class="premium-copy-btn btn-copy" data-copy="${escapeAttr(cookie)}" title="Copy cookie" style="padding:4px 8px;font-size:11px;white-space:nowrap;">📋 Copy</button>
              </div>` : ''}
            </div>

            <!-- Trạng thái gói (sẽ được cập nhật bởi auto-check) -->
            <div class="acc-plan-status" id="plan-status-${sub.id}" style="margin:12px 0;">
              <span class="acc-plan-checking">⏳ Đang kiểm tra gói...</span>
            </div>

            <!-- ACTION BUTTONS -->
            <div class="premium-actions-row">
              <button class="btn btn-sm btn-primary acc-get-link-btn"
                data-sub="${sub.id}"
                data-cookie="${encodeURIComponent(cookie)}"
                style="background:linear-gradient(135deg, #E50914 0%, #B80710 100%);">
                🔗 Get Login Link
              </button>
              <button class="btn btn-sm btn-outline acc-tv-btn"
                data-sub="${sub.id}"
                data-cookie="${encodeURIComponent(cookie)}">
                📺 Nhập mã TV
              </button>
              <button class="btn btn-sm btn-warning acc-warranty-btn"
                data-sub="${sub.id}"
                data-cookie="${encodeURIComponent(cookie)}"
                title="Cookie die hoặc mất Premium — hệ thống tự động đổi tài khoản (Bảo hành / claim_warranty)">
                🔧 Bảo hành
              </button>
              <button type="button" class="btn btn-sm btn-outline acc-report-view-btn"
                data-sub="${sub.id}"
                data-cookie="${encodeURIComponent(cookie)}"
                title="Vẫn không xem được dù tài khoản OK — gửi admin kiểm tra tay. Cookie die / mất gói → Bảo hành.">
                🚨 Báo lỗi
              </button>
            </div>

            <!-- GET LINK RESULT -->
            <div class="acc-result-box" id="result-link-${sub.id}" style="display:none;margin-top:16px;"></div>

            <!-- TV FORM (hidden until button clicked) -->
            <div class="tv-login-box" id="tv-box-${sub.id}" style="display:none;margin-top:16px;">
              <div class="acc-result-box tv-login-status" id="result-tv-${sub.id}" style="display:none;" aria-live="polite"></div>
              <div class="tv-login-body">
                <p class="tv-instruction">Nhập mã số hiển thị trên TV Netflix (6–10 chữ số).</p>
                <div class="tv-input-row">
                  <input type="text" class="tv-code-input" id="tv-code-${sub.id}"
                    placeholder="32148294" maxlength="10" inputmode="numeric" autocomplete="one-time-code">
                  <div class="tv-actions">
                    <button type="button" class="btn btn-primary acc-tv-submit-btn" data-sub="${sub.id}">Gửi mã</button>
                    <button type="button" class="btn btn-outline acc-tv-cancel-btn" data-sub="${sub.id}">Huỷ</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- WARRANTY RESULT -->
            <div class="acc-result-box" id="result-warranty-${sub.id}" style="display:none;margin-top:16px;"></div>
          </div>
        </div>
      </div>
      ` : ''}

      ${expired ? `
      <div class="sub-expired-box">
        <h4>Gói đã hết hạn</h4>
        <p class="sub-expired-lead">Đăng nhập đã ẩn. Chọn gói gia hạn để nhận tài khoản sau thanh toán.</p>
        ${renewGridHtml}
        <p class="sub-expired-hint">Nếu không gia hạn, slot share được hệ thống tự giải phóng sau ngày hết hạn (job server) để phân bổ cho người khác.</p>
      </div>
      ` : ''}

      ${/* Chỉ hiện cho Netflix: active nhưng chưa có login_link (đang chờ auto-assign) * /}
      ${isActive && isNetflix && !sub.login_link && !expired ? `
      <div class="acc-pending-notice" id="pending-notice-${sub.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span style="display:flex;align-items:center;gap:8px;"><span class="link-pulse"></span> Tài khoản Netflix đang được chuẩn bị — hệ thống sẽ tự gán trong ít phút...</span>
        </div>
        <div style="font-size:12px;margin-top:6px;color:var(--warning);opacity:.75;">Tự động kiểm tra mỗi 20 giây</div>
      </div>
      ` : ''}
      ${sub.status === 'pending' ? (() => {
        const CANCEL_AFTER_MS = 30 * 60 * 1000 /* 30 phút * /
        const createdMs = sub.created_at ? new Date(sub.created_at).getTime() : Date.now()
        const remainingMs = Math.max(0, createdMs + CANCEL_AFTER_MS - Date.now())
        const remainingMin = Math.floor(remainingMs / 60000)
        const remainingSec = Math.floor((remainingMs % 60000) / 1000)
        const isExpiring = remainingMin < 5
        return `
        <div class="acc-pending-notice" id="pending-notice-${sub.id}">
          <div class="acc-pending-main">
            ⏳ Đang chờ xác nhận thanh toán từ ngân hàng...
          </div>
          ${remainingMs > 0 ? `
          <div class="acc-pending-countdown ${isExpiring ? 'acc-pending-countdown--urgent' : ''}" id="countdown-${sub.id}"
               data-deadline="${createdMs + CANCEL_AFTER_MS}">
            ${isExpiring ? '⚠️' : '🕐'} Tự hủy sau: <strong id="cdt-${sub.id}">${remainingMin}:${String(remainingSec).padStart(2,'0')}</strong>
          </div>
          ` : `
          <div class="acc-pending-countdown acc-pending-countdown--urgent">
            ⚠️ Đơn này sẽ bị hủy ngay — vui lòng liên hệ admin nếu đã chuyển tiền.
          </div>
          `}
        </div>`
      })() : ''}
    </div>`
  })

  html += '</div>'
  panel.innerHTML = html

  function applySubscriptionFilters() {
    const rawQ = panel.querySelector('#dashSubSearch')?.value || ''
    const q = rawQ.trim().toLowerCase().replace(/^#/, '').replace(/-/g, '')
    const st = panel.querySelector('#dashSubFilterStatus')?.value || 'all'
    const sv = panel.querySelector('#dashSubFilterService')?.value || 'all'
    const listEl = panel.querySelector('#dashSubList')
    const cards = listEl ? listEl.querySelectorAll(':scope > .sub-card') : []
    let visible = 0
    cards.forEach((card) => {
      const id = card.dataset.subId
      const sub = subs.find((s) => s.id === id)
      if (!sub) {
        card.style.display = 'none'
        return
      }
      const plan = sub.plans || {}
      const service = String(plan.service || 'netflix').toLowerCase()
      const svcName = String(plan.name || planLabel(sub.plan) || '').toLowerCase()
      const code = String(id).replace(/-/g, '').substring(0, 8).toLowerCase()
      const planSlug = String(sub.plan || '').toLowerCase()
      const idNorm = String(id).replace(/-/g, '').toLowerCase()
      const expired = subscriptionAccessExpired(sub)

      let okStatus = true
      if (st === 'active') okStatus = sub.status === 'active' && !expired
      else if (st === 'expired') okStatus = sub.status === 'expired' || expired
      else if (st === 'pending') okStatus = sub.status === 'pending'
      else if (st === 'cancelled') okStatus = sub.status === 'cancelled'

      const okService = sv === 'all' || service === sv

      const hay = `${code} ${svcName} ${service} ${planSlug} ${idNorm}`
      const okSearch = !q || hay.includes(q)

      const show = okStatus && okService && okSearch
      card.style.display = show ? '' : 'none'
      if (show) visible++
    })
    const emptyF = panel.querySelector('#dashSubEmptyFiltered')
    const meta = panel.querySelector('#dashSubFilterMeta')
    const total = subs.length
    if (emptyF) emptyF.style.display = visible === 0 && total > 0 ? 'block' : 'none'
    if (meta) {
      const plain = !q && st === 'all' && sv === 'all'
      meta.textContent = plain ? `${total} đơn` : `Hiển thị ${visible} / ${total} đơn`
    }
  }

  const inp = panel.querySelector('#dashSubSearch')
  const selSt = panel.querySelector('#dashSubFilterStatus')
  const selSv = panel.querySelector('#dashSubFilterService')
  const stOk = ['all', 'active', 'expired', 'pending', 'cancelled'].includes(fs0.status)
  if (selSt && stOk) selSt.value = fs0.status
  if (selSv && (fs0.service === 'all' || serviceSet.has(fs0.service))) selSv.value = fs0.service

  const persistAndApply = () => {
    saveDashSubFilters({
      q: inp?.value || '',
      status: selSt?.value || 'all',
      service: selSv?.value || 'all'
    })
    applySubscriptionFilters()
  }
  inp?.addEventListener('input', persistAndApply)
  selSt?.addEventListener('change', persistAndApply)
  selSv?.addEventListener('change', persistAndApply)
  applySubscriptionFilters()

  // ===== COPY =====
  panel.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy)
      const orig = btn.textContent
      btn.textContent = '✅'
      setTimeout(() => btn.textContent = orig, 1500)
    })
  })

  // ===== TOGGLE PASSWORD =====
  panel.querySelectorAll('.btn-toggle-pass').forEach(btn => {
    let shown = false
    btn.addEventListener('click', () => {
      shown = !shown
      const el = panel.querySelector(`#pass-${btn.dataset.sub}`)
      const pass = decodeURIComponent(btn.dataset.pass)
      el.textContent = shown ? pass : maskPassword(pass)
      btn.textContent = shown ? '🙈' : '👁️'
    })
  })

  // ===== GET LOGIN LINK =====
  panel.querySelectorAll('.acc-get-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subId = btn.dataset.sub
      const cookie = decodeURIComponent(btn.dataset.cookie)
      const resultEl = panel.querySelector(`#result-link-${subId}`)

      if (!cookie) {
        showResult(resultEl, 'error', '❌ Tài khoản này chỉ có email/mật khẩu, không có cookie Netflix. Không thể tạo login link.')
        return
      }

      const stLink = planCheckBySub.get(subId)
      if (stLink && stLink.alive === false) {
        showResult(
          resultEl,
          'error',
          '❌ <strong>Không thể xem / lấy link đăng nhập:</strong> cookie Netflix đã hết hiệu lực. Bấm <strong>Bảo hành</strong> để hệ thống đổi tài khoản mới.'
        )
        return
      }
      if (stLink && stLink.hasPremium === false) {
        showResult(
          resultEl,
          'error',
          '❌ <strong>Không thể xem / lấy link đăng nhập:</strong> tài khoản không còn gói Premium trên Netflix. Bấm <strong>Bảo hành</strong> để đổi slot.'
        )
        return
      }

      showResult(resultEl, 'loading', '⏳ Đang lấy login link...')
      btn.disabled = true

      try {
        const res = await apiGetLink(cookie)
        if (res.success && res.link) {
          resultEl.innerHTML = `
            <div class="result-success">
              <div class="result-title">✅ Login Link của bạn:</div>
              <div class="result-link-row">
                <input type="text" value="${res.link}" readonly class="result-link-input" id="final-link-${subId}">
                <button class="btn btn-sm btn-primary copy-final-link" data-link="${res.link}">📋 Copy</button>
              </div>
              <a href="${res.link}" target="_blank" rel="noopener" class="btn btn-sm btn-outline" style="margin-top:8px;display:inline-block;">
                🚀 Mở link đăng nhập
              </a>
              ${res.info ? `<div class="result-info">
                ${res.info.plan ? `<span>📦 ${res.info.plan}</span>` : ''}
                ${res.info.quality ? `<span>🎬 ${res.info.quality}</span>` : ''}
                ${res.info.country ? `<span>🌍 ${res.info.country}</span>` : ''}
              </div>` : ''}
            </div>`
          resultEl.style.display = 'block'
          resultEl.querySelector('.copy-final-link')?.addEventListener('click', e => {
            navigator.clipboard.writeText(e.target.dataset.link)
            e.target.textContent = '✅ Copied!'
            setTimeout(() => e.target.textContent = '📋 Copy', 2000)
          })
        } else {
          showResult(resultEl, 'error', `❌ ${res.message || 'Cookie die hoặc không hợp lệ'}`)
        }
      } catch (err) {
        showResult(resultEl, 'error', `❌ Lỗi kết nối: ${err.message}`)
      } finally {
        const st = planCheckBySub.get(subId)
        const stillBlocked = st && (st.alive === false || st.hasPremium === false)
        btn.disabled = !!stillBlocked
      }
    })
  })

  // ===== TV LOGIN — show form =====
  function clearTvSession(subId) {
    const submitBtn = panel.querySelector(`.acc-tv-submit-btn[data-sub="${subId}"]`)
    if (!submitBtn) return
    delete submitBtn.dataset.authUrl
    delete submitBtn.dataset.cookie
  }

  panel.querySelectorAll('.acc-tv-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subId = btn.dataset.sub
      let cookie
      try {
        cookie = decodeURIComponent(btn.dataset.cookie || '')
      } catch {
        cookie = ''
      }
      const tvBox = panel.querySelector(`#tv-box-${subId}`)
      const resultEl = panel.querySelector(`#result-tv-${subId}`)
      if (!tvBox || !resultEl) return

      if (!cookie) {
        tvBox.style.display = 'block'
        clearTvSession(subId)
        showResult(resultEl, 'error', '❌ Tài khoản này chỉ có email/mật khẩu, không có cookie Netflix. Không thể đăng nhập TV.')
        return
      }

      if (tvBox.style.display !== 'none') {
        tvBox.style.display = 'none'
        clearTvSession(subId)
        return
      }

      const stTv = planCheckBySub.get(subId)
      if (stTv && stTv.alive === false) {
        tvBox.style.display = 'block'
        clearTvSession(subId)
        showResult(
          resultEl,
          'error',
          '❌ <strong>Không thể đăng nhập TV:</strong> cookie đã hết hiệu lực. Bấm <strong>Bảo hành</strong> trước.'
        )
        return
      }
      if (stTv && stTv.hasPremium === false) {
        tvBox.style.display = 'block'
        clearTvSession(subId)
        showResult(
          resultEl,
          'error',
          '❌ <strong>Không thể đăng nhập TV:</strong> tài khoản không còn gói Premium. Bấm <strong>Bảo hành</strong> trước.'
        )
        return
      }

      tvBox.style.display = 'block'
      clearTvSession(subId)
      btn.disabled = true
      btn.textContent = '⏳'
      showResult(resultEl, 'loading', '⏳ Đang kết nối Netflix...')

      try {
        const init = await apiTvInit(cookie)
        if (!init.success) {
          showResult(resultEl, 'error', `❌ ${init.message || 'Không khởi tạo được phiên TV'}`)
          return
        }
        const authUrl = init.authUrl
        if (!authUrl || typeof authUrl !== 'string') {
          showResult(resultEl, 'error', '❌ Server không trả về authURL hợp lệ.')
          return
        }
        const submitBtn = panel.querySelector(`.acc-tv-submit-btn[data-sub="${subId}"]`)
        if (submitBtn) {
          submitBtn.dataset.authUrl = authUrl
          submitBtn.dataset.cookie = encodeURIComponent(cookie)
        }
        showResult(resultEl, 'success', '✅ Đã kết nối Netflix. Nhập mã trên TV vào ô bên dưới rồi bấm Gửi mã.')
      } catch (err) {
        showResult(resultEl, 'error', `❌ Lỗi: ${err.message}`)
      } finally {
        const st = planCheckBySub.get(subId)
        const stillBlocked = st && (st.alive === false || st.hasPremium === false)
        btn.disabled = !!stillBlocked
        btn.textContent = '📺 Nhập mã TV'
      }
    })
  })

  // ===== TV LOGIN — cancel =====
  panel.querySelectorAll('.acc-tv-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.dataset.sub
      clearTvSession(subId)
      const tvBoxEl = panel.querySelector(`#tv-box-${subId}`)
      if (tvBoxEl) tvBoxEl.style.display = 'none'
      const codeIn = panel.querySelector(`#tv-code-${subId}`)
      if (codeIn) codeIn.value = ''
      const resultEl = panel.querySelector(`#result-tv-${subId}`)
      if (resultEl) resultEl.style.display = 'none'
    })
  })

  // ===== TV LOGIN — submit code =====
  panel.querySelectorAll('.acc-tv-submit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subId = btn.dataset.sub
      const authUrl = btn.dataset.authUrl
      let cookie
      try {
        cookie = decodeURIComponent(btn.dataset.cookie || '')
      } catch {
        cookie = ''
      }
      const codeInput = panel.querySelector(`#tv-code-${subId}`)
      const resultEl = panel.querySelector(`#result-tv-${subId}`)
      if (!resultEl) return

      const code = ((codeInput?.value || '').replace(/\D/g, ''))
      if (!code.match(/^\d{6,10}$/)) {
        showResult(resultEl, 'error', '❌ Mã TV phải là 6–10 chữ số (có thể dán cả khoảng trắng).')
        return
      }
      if (!authUrl) {
        showResult(resultEl, 'error', '❌ Phiên TV chưa sẵn sàng. Đóng khung và bấm "Nhập mã TV" lại.')
        return
      }
      if (!cookie) {
        showResult(resultEl, 'error', '❌ Thiếu cookie phiên. Bấm "Nhập mã TV" để kết nối lại.')
        return
      }

      btn.disabled = true
      showResult(resultEl, 'loading', '⏳ Đang gửi mã TV lên Netflix...')

      try {
        const res = await apiTvSubmit(cookie, authUrl, code)
        const safeMsg = (s) => String(s || '').replace(/<[^>]*>/g, '').trim()
        if (res.success) {
          showResult(resultEl, 'success', `🎉 ${safeMsg(res.message) || 'TV đã được đăng nhập!'}`)
          if (codeInput) codeInput.value = ''
          setTimeout(() => {
            clearTvSession(subId)
            const box = panel.querySelector(`#tv-box-${subId}`)
            if (box) box.style.display = 'none'
          }, 3000)
        } else {
          showResult(resultEl, 'error', `❌ ${safeMsg(res.message) || 'Netflix từ chối mã'}`)
        }
      } catch (err) {
        showResult(resultEl, 'error', `❌ Lỗi kết nối, vui lòng thử lại.`)
      } finally {
        btn.disabled = false
      }
    })
  })

  // ===== AUTO CHECK PLAN STATUS (chạy nền khi có cookie) =====
  panel.querySelectorAll('.acc-warranty-btn').forEach(btn => {
    const subId  = btn.dataset.sub
    const cookie = decodeURIComponent(btn.dataset.cookie)
    const planStatusEl = panel.querySelector(`#plan-status-${subId}`)
    if (!cookie || !planStatusEl) { if (planStatusEl) planStatusEl.innerHTML = ''; return }

    // Kiểm tra nền sau 1.2s để không block render
    setTimeout(async () => {
      try {
        // BƯỚC 1: Check nhanh via nftoken.site
        const check = await apiCheckPlanStatus(cookie)

        if (!check.alive) {
          // Cookie chết → tự động bảo hành ngay
          planStatusEl.innerHTML = `<div class="acc-plan-alert acc-plan-alert--dead">❌ Cookie đã die — đang tự động đổi tài khoản...</div>`
          planCheckBySub.set(subId, { alive: false, hasPremium: false, paymentError: false })
          await triggerWarranty(subId, cookie, panel, renewPlans, 'cookie_dead')
          return
        }

        if (!check.hasPremium) {
          // Mất gói → tự động bảo hành
          planStatusEl.innerHTML = `<div class="acc-plan-alert acc-plan-alert--noPlan">⚠️ Mất gói Premium (${check.plan || '—'}) — đang tự động đổi tài khoản...</div>`
          planCheckBySub.set(subId, { alive: true, hasPremium: false, paymentError: false })
          await triggerWarranty(subId, cookie, panel, renewPlans, 'plan_lost')
          return
        }

        // BƯỚC 2: Cookie OK + có gói → deep check via /api/netflix-account-info
        // (server sẽ fetch /account + /browse để detect popup "Your account is on hold")
        let paymentError = hasPaymentIssue(check) || hasPaymentIssue(check.raw)
        let deepPlan = check.plan || 'Premium'

        if (!paymentError) {
          try {
            const acct = await apiNetflixAccountInfo(cookie)
            if (hasPaymentIssue(acct)) {
              paymentError = true
              if (acct.plan) deepPlan = acct.plan
            }
          } catch {
            // Bỏ qua lỗi mạng khi deep check
          }
        }

        if (paymentError) {
          // Lỗi thanh toán → tự động bảo hành
          planStatusEl.innerHTML = `
            <div class="acc-plan-alert acc-plan-alert--paymentError">
              🚫 <strong>Lỗi thanh toán</strong> — tài khoản bị hold, đang tự động đổi tài khoản mới...
            </div>`
          planCheckBySub.set(subId, { alive: true, hasPremium: true, paymentError: true })
          await triggerWarranty(subId, cookie, panel, renewPlans, 'payment_error')
          return
        }

        // Tất cả OK
        planStatusEl.innerHTML = `
          <div class="acc-plan-alert acc-plan-alert--ok">
            ✅ Gói: <strong>${deepPlan}</strong>
            ${check.screens ? ` · ${check.screens} màn hình` : ''}
          </div>`

        planCheckBySub.set(subId, { alive: true, hasPremium: true, paymentError: false })
        const getLinkBtn = panel.querySelector(`.acc-get-link-btn[data-sub="${subId}"]`)
        const tvBtnEl = panel.querySelector(`.acc-tv-btn[data-sub="${subId}"]`)
        for (const b of [getLinkBtn, tvBtnEl]) {
          if (!b) continue
          b.disabled = false
          b.removeAttribute('title')
          b.classList.remove('acc-action-needs-warranty')
        }
      } catch {
        planStatusEl.innerHTML = '' // Lỗi mạng → ẩn đi
      }
    }, 1200)
  })


  async function submitViewerReport(subId, panel) {
    const resultEl = panel.querySelector(`#result-warranty-${subId}`)
    const reportBtn = panel.querySelector(`.acc-report-view-btn[data-sub="${subId}"]`)
    if (reportBtn) reportBtn.disabled = true
    try {
      showResult(resultEl, 'loading', '\u23f3 \u0110ang g\u1eedi b\u00e1o t\u1edbi admin...')
      await reportCannotViewToAdmin(subId)
      showResult(
        resultEl,
        'success',
        '\u2705 \u0110\u00e3 g\u1eedi b\u00e1o cho admin. Admin s\u1ebd ki\u1ec3m tra th\u1ee7 c\u00f4ng v\u00e0 c\u00f3 th\u1ec3 g\u00e1n t\u00e0i kho\u1ea3n kh\u00e1c n\u1ebfu c\u1ea7n.<br><small>N\u1ebfu <strong>cookie die</strong> ho\u1eb7c <strong>m\u1ea5t Premium</strong>, d\u00f9ng <strong>B\u1ea3o h\u00e0nh</strong> \u0111\u1ec3 h\u1ec7 th\u1ed1ng t\u1ef1 \u0111\u1ed5i.</small>'
      )
    } catch (err) {
      showResult(resultEl, 'error', `\u274c ${err.message}`)
    } finally {
      if (reportBtn) reportBtn.disabled = false
    }
  }

  // ===== Bảo hành: cookie die / mất gói / lỗi TT → claim_warranty tự động =====
  // preReason: nếu auto-check đã xác định lý do → truyền vào để bỏ qua bước re-check
  async function triggerWarranty(subId, cookie, panel, renewPlans, preReason) {
    const resultEl = panel.querySelector(`#result-warranty-${subId}`)
    const warrantyBtn = panel.querySelector(`.acc-warranty-btn[data-sub="${subId}"]`)
    if (warrantyBtn) warrantyBtn.disabled = true

    try {
      let reason = preReason || 'unknown'

      // Nếu không có preReason → check lại để xác nhận (khi bấm nút thủ công)
      if (!preReason && cookie) {
        showResult(resultEl, 'loading', '\u23f3 \u0110ang ki\u1ec3m tra t\u00ecnh tr\u1ea1ng t\u00e0i kho\u1ea3n...')
        try {
          const check = await apiCheckPlanStatus(cookie)
          if (check.alive && check.hasPremium) {
            // Nftoken OK → deep check lỗi TT qua /browse
            let payErr = hasPaymentIssue(check) || hasPaymentIssue(check.raw)
            if (!payErr) {
              try {
                const acct = await apiNetflixAccountInfo(cookie)
                payErr = hasPaymentIssue(acct)
              } catch {}
            }
            if (!payErr) {
              showResult(resultEl, 'success', `\u2705 T\u00e0i kho\u1ea3n OK \u2014 g\u00f3i ${check.plan || 'Premium'} \u0111ang ho\u1ea1t \u0111\u1ed9ng b\u00ecnh th\u01b0\u1eddng.`)
              if (warrantyBtn) warrantyBtn.disabled = false
              return
            }
            reason = 'payment_error'
          } else {
            reason = check.reason || (!check.alive ? 'cookie_dead' : 'plan_lost')
          }
        } catch {}
      }

      const reasonMsg = reason === 'payment_error'
        ? '\u23f3 Ph\u00e1t hi\u1ec7n l\u1ed7i thanh to\u00e1n (t\u00e0i kho\u1ea3n b\u1ecb hold). \u0110ang \u0111\u1ed5i t\u00e0i kho\u1ea3n m\u1edbi...'
        : reason === 'plan_lost'
          ? '\u23f3 Ph\u00e1t hi\u1ec7n m\u1ea5t g\u00f3i Premium. \u0110ang \u0111\u1ed5i t\u00e0i kho\u1ea3n m\u1edbi...'
          : '\u23f3 Cookie \u0111\u00e3 die. \u0110ang x\u1eed l\u00fd b\u1ea3o h\u00e0nh...'
      showResult(resultEl, 'loading', reasonMsg)

      const warranty = await claimWarranty(subId)

      if (warranty && warranty.success) {
        const u = getUser()
        if (u) {
          const [fresh, nm] = await Promise.all([getUserSubscriptions(u.id), fetchViewerNoticesBySubId()])
          renderSubscriptions(panel, fresh, renewPlans, nm)
        } else {
          showResult(resultEl, 'success', '\u2705 \u0110\u00e3 \u0111\u1ed5i t\u00e0i kho\u1ea3n. Vui l\u00f2ng t\u1ea3i l\u1ea1i trang.')
        }
      } else {
        showResult(resultEl, 'error', `\u274c ${warranty?.message || 'Kh\u00f4ng th\u1ec3 b\u1ea3o h\u00e0nh. Vui l\u00f2ng li\u00ean h\u1ec7 admin.'}`)
      }
    } catch (err) {
      showResult(resultEl, 'error', `\u274c L\u1ed7i: ${err.message}`)
    } finally {
      if (warrantyBtn) warrantyBtn.disabled = false
    }
  }

  // Nút bảo hành thủ công (cũ)
  panel.querySelectorAll('.acc-warranty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerWarranty(btn.dataset.sub, decodeURIComponent(btn.dataset.cookie), panel, renewPlans)
    })
  })

  panel.querySelectorAll('.acc-report-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      submitViewerReport(btn.dataset.sub, panel)
    })
  })
}
*/

// Helper: show result with state
function showResult(el, state, message) {
  if (!el) return
  const safe = state === 'loading' || state === 'success' || state === 'error' || state === 'info' ? state : 'info'
  el.style.display = 'block'
  el.innerHTML = `<span class="acc-result-msg acc-result-msg--${safe}">${message}</span>`
}

function renderPayments(panel, payments) {
  if (!payments || payments.length === 0) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <h3>Chưa có thanh toán nào</h3>
        <p>Lịch sử thanh toán sẽ hiển thị ở đây</p>
      </div>`
    return
  }

  let html = `
    <div class="table-responsive">
      <table class="data-table">
        <thead><tr>
          <th>Thời gian</th><th>Gói</th><th>Số tiền</th>
          <th>Phương thức</th><th>Nội dung CK</th><th>Trạng thái</th>
        </tr></thead><tbody>`

  payments.forEach(p => {
    const plan = p.plans || {}
    html += `<tr>
      <td>${formatDate(p.created_at)}</td>
      <td>${plan.name || planLabel(p.plan)}</td>
      <td>${formatVND(p.amount)}</td>
      <td>${p.method || '—'}</td>
      <td><code>${p.transfer_content || '—'}</code></td>
      <td><span class="status-badge ${statusClass(p.status)}">${statusLabel(p.status)}</span></td>
    </tr>`
  })

  html += '</tbody></table></div>'
  panel.innerHTML = html
}
