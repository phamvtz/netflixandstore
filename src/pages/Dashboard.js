import { getUser } from '../utils/auth.js'
import {
  getUserSubscriptions, getUserPayments, getPlans, claimWarranty, reportCannotViewToAdmin,
  getMyViewerReportNotices
} from '../utils/api.js'
import { apiGetLink, apiCheckPlanStatus, apiTvInit, apiTvSubmit } from '../utils/netflix.js'
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

export async function renderDashboard(container) {
  const user = getUser()
  if (!user) return

  container.innerHTML = `
    <section class="dashboard-section">
      <div class="page-container">
        <h1 class="page-title">Tài khoản của tôi</h1>
        <p class="page-desc">Quản lý đăng ký dịch vụ và lịch sử thanh toán</p>
        <div class="dash-tabs-wrap">
          <div class="dash-tabs">
            <div class="dash-tab-indicator" id="dashTabIndicator"></div>
            <button class="dash-tab active" data-tab="subs">📦 Đăng ký</button>
            <button class="dash-tab" data-tab="payments">💳 Thanh toán</button>
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
    const [subs, payments, renewPlans, noticesMap] = await Promise.all([
      getUserSubscriptions(user.id),
      getUserPayments(user.id),
      getPlans().catch(() => []),
      fetchViewerNoticesBySubId()
    ])
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
        <div class="empty-icon">📦</div>
        <h3>Chưa có đăng ký nào</h3>
        <p>Mua gói dịch vụ để bắt đầu sử dụng</p>
        <a href="#/products" class="btn btn-primary">Xem dịch vụ</a>
      </div>`
    return
  }

  let html = '<div class="sub-list">'
  /** Kết quả /api/check-plan-status theo subscription — dùng chặn Get Link / TV khi cần bảo hành */
  const planCheckBySub = new Map()

  subs.forEach(sub => {
    const days = daysLeft(sub.end_at)
    const plan = sub.plans || {}
    const service = plan.service || 'netflix'
    const fulfillment = plan.fulfillment_type || (service === 'netflix' ? 'netflix' : 'manual')
    const isNetflix = service === 'netflix'
    const isManual  = fulfillment === 'manual'
    const isStock   = fulfillment === 'stock'
    const isActive  = sub.status === 'active'
    const expired   = subscriptionAccessExpired(sub)

    // Netflix: cần parse account từ login_link
    const hasAccount = isNetflix && isActive && sub.login_link && !expired
    const acc = hasAccount ? parseAccount(sub.login_link) : null
    const cookie = acc ? (acc.cookie || '') : ''
    const vrRejected = noticesBySubId.get(sub.id)

    // Non-Netflix: nội dung giao trong login_link
    const deliveredContent = !isNetflix && sub.login_link ? sub.login_link : null

    const cardClass = (isActive && !expired)
      ? 'sub-card sub-card--active'
      : (sub.status === 'expired' || expired) ? 'sub-card sub-card--expired'
      : sub.status === 'pending' ? 'sub-card sub-card--pending'
      : 'sub-card'

    // Service label
    const svcName = plan.name || planLabel(sub.plan)

    const orderCode = sub.id ? '#' + sub.id.replace(/-/g,'').substring(0,8).toUpperCase() : ''

    html += `
    <div class="${cardClass}" data-sub-id="${sub.id}" data-plan="${sub.plan || ''}">
      <div class="sub-header">
        <div>
          <span class="sub-plan">${svcName}</span>
          ${orderCode ? `<span class="sub-order-code">${orderCode}</span>` : ''}
        </div>
        <span class="status-badge ${statusClass(sub.status)}">${statusLabel(sub.status)}</span>
      </div>
      <div class="sub-details">
        <div class="sub-detail"><span class="label">Dịch vụ:</span><span style="text-transform:capitalize;">${service}</span></div>
        <div class="sub-detail"><span class="label">Giá:</span><span>${formatVND(plan.price || 0)}</span></div>
        ${sub.start_at ? `<div class="sub-detail"><span class="label">Bắt đầu:</span><span>${formatDate(sub.start_at)}</span></div>` : ''}
        ${sub.end_at ? `
          <div class="sub-detail"><span class="label">Hết hạn:</span><span>${formatDate(sub.end_at)}</span></div>
          <div class="sub-detail"><span class="label">Còn lại:</span>
            <span class="${days !== null && days <= 3 ? 'text-danger' : 'text-success'}">${days ?? '—'} ngày</span>
          </div>` : ''}
        <div class="sub-detail"><span class="label">Tạo lúc:</span><span>${formatDate(sub.created_at)}</span></div>
      </div>

      ${/* ── Non-Netflix: Manual service ── */ ''}
      ${!isNetflix && isManual ? `
      <div class="account-section">
        ${sub.status === 'pending' ? `
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
            <p style="font-weight:700;color:#92400e;margin:0 0 6px;">⏳ Đang chờ admin xử lý</p>
            <p style="font-size:13px;color:#78350f;margin:0;">Admin sẽ xử lý đơn của bạn trong thời gian sớm nhất.</p>
          </div>
        ` : sub.status === 'active' ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;">
            <p style="font-weight:700;color:#15803d;margin:0 0 6px;">✅ Đã xử lý</p>
            ${sub.notes ? `<p style="font-size:13px;color:#166534;margin:0;">${sub.notes}</p>` : ''}
          </div>
        ` : ''}
      </div>` : ''}

      ${/* ── Non-Netflix: Stock product ── */ ''}
      ${!isNetflix && isStock ? `
      <div class="account-section">
        ${deliveredContent ? `
          <h4>📦 Nội dung sản phẩm</h4>
          <div class="account-info-box">
            <div class="acc-info-row">
              <span class="acc-info-label">📋 Nội dung</span>
              <span class="acc-info-val" style="word-break:break-all;font-family:var(--mono);font-size:12px;">${deliveredContent}</span>
              <button class="btn-copy" data-copy="${deliveredContent}" title="Copy">📋</button>
            </div>
          </div>
        ` : sub.status === 'pending' ? `
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
            <p style="font-weight:700;color:#92400e;margin:0 0 6px;">⏳ Đang chuẩn bị sản phẩm</p>
            <p style="font-size:13px;color:#78350f;margin:0;">Sản phẩm sẽ được giao tự động hoặc bởi admin.</p>
          </div>
        ` : ''}
      </div>` : ''}

      ${/* ── Netflix only ── */ ''}
      ${hasAccount && acc ? `
      <!-- ===== ACCOUNT INFO ===== -->
      <div class="account-section">
        <h4>🔐 Thông tin tài khoản Netflix</h4>
        ${sub.end_at ? `
        <div class="account-validity-banner">
          📅 Gói đang hiệu lực đến <strong>${formatDate(sub.end_at)}</strong>${days !== null ? ` · còn <strong>${days}</strong> ngày` : ''}.
          Các nút <strong>Get link</strong>, <strong>TV</strong>, <strong>Bảo hành</strong> dùng được trong thời gian này.
        </div>` : ''}
        ${vrRejected ? `
        <div class="viewer-report-user-notice" role="status">
          <strong>Phan hoi shop (bao khong xem duoc)</strong>
          <p class="viewer-report-user-notice__text">${escHtml(vrRejected.admin_note)}</p>
          ${vrRejected.resolved_at ? `<p class="viewer-report-user-notice__meta">${formatDate(vrRejected.resolved_at)}</p>` : ''}
        </div>` : ''}
        <div class="account-info-box">
          ${acc.email ? `
          <div class="acc-info-row">
            <span class="acc-info-label">📧 Email</span>
            <span class="acc-info-val">${acc.email}</span>
            <button class="btn-copy" data-copy="${acc.email}" title="Copy">📋</button>
          </div>` : ''}
          ${acc.password ? `
          <div class="acc-info-row">
            <span class="acc-info-label">🔑 Mật khẩu</span>
            <span class="acc-info-val acc-pass-masked" id="pass-${sub.id}">${maskPassword(acc.password)}</span>
            <button class="btn-toggle-pass acc-icon-btn" data-sub="${sub.id}" data-pass="${encodeURIComponent(acc.password)}" title="Hiện/Ẩn">👁️</button>
            <button class="btn-copy" data-copy="${acc.password}" title="Copy">📋</button>
          </div>` : ''}
        </div>

        <!-- Trạng thái gói (sẽ được cập nhật bởi auto-check) -->
        <div class="acc-plan-status" id="plan-status-${sub.id}">
          <span class="acc-plan-checking">⏳ Đang kiểm tra gói...</span>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="account-actions">
          <button class="btn btn-sm btn-primary acc-get-link-btn"
            data-sub="${sub.id}"
            data-cookie="${encodeURIComponent(cookie)}">
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
            🚨 Báo lỗi — không xem được
          </button>
        </div>

        <!-- GET LINK RESULT -->
        <div class="acc-result-box" id="result-link-${sub.id}" style="display:none;"></div>

        <!-- TV FORM (hidden until button clicked) -->
        <div class="tv-login-box" id="tv-box-${sub.id}" style="display:none;">
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
        <div class="acc-result-box" id="result-warranty-${sub.id}" style="display:none;"></div>
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

      ${isActive && !sub.login_link && !expired ? `
      <div class="acc-pending-notice" id="pending-notice-${sub.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span style="display:flex;align-items:center;gap:8px;"><span class="link-pulse"></span> Tài khoản đang được chuẩn bị — hệ thống sẽ tự gán trong ít phút...</span>
        </div>
        <div style="font-size:12px;margin-top:6px;color:var(--warning);opacity:.75;">Tự động kiểm tra mỗi 20 giây</div>
      </div>
      ` : ''}
      ${sub.status === 'pending' ? (() => {
        const CANCEL_AFTER_MS = 30 * 60 * 1000 // 30 phút
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
        if (res.success) {
          showResult(resultEl, 'success', `🎉 ${res.message || 'TV đã được đăng nhập!'}`)
          if (codeInput) codeInput.value = ''
          setTimeout(() => {
            clearTvSession(subId)
            const box = panel.querySelector(`#tv-box-${subId}`)
            if (box) box.style.display = 'none'
          }, 3000)
        } else {
          showResult(resultEl, 'error', `❌ ${res.message || 'Netflix từ chối mã'}`)
        }
      } catch (err) {
        showResult(resultEl, 'error', `❌ Lỗi: ${err.message}`)
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

    // Kiểm tra nền sau 1s để không block render
    setTimeout(async () => {
      try {
        const check = await apiCheckPlanStatus(cookie)
        if (!check.alive) {
          planStatusEl.innerHTML = `
            <div class="acc-plan-alert acc-plan-alert--dead">
              ❌ Cookie đã die — tài khoản không truy cập được
              <button class="btn btn-xs btn-danger acc-warranty-btn-inline" data-sub="${subId}" data-cookie="${encodeURIComponent(cookie)}" style="margin-left:8px;">Bảo hành ngay</button>
            </div>`
        } else if (!check.hasPremium) {
          planStatusEl.innerHTML = `
            <div class="acc-plan-alert acc-plan-alert--noPlan">
              ⚠️ Cookie sống nhưng <strong>mất gói Premium</strong> (hiện: ${check.plan || 'không có gói'})
              <button class="btn btn-xs btn-warning acc-warranty-btn-inline" data-sub="${subId}" data-cookie="${encodeURIComponent(cookie)}" style="margin-left:8px;">Bảo hành ngay</button>
            </div>`
        } else {
          planStatusEl.innerHTML = `
            <div class="acc-plan-alert acc-plan-alert--ok">
              ✅ Gói: <strong>${check.plan || 'Premium'}</strong>
              ${check.screens ? ` · ${check.screens} màn hình` : ''}
            </div>`
        }

        planCheckBySub.set(subId, { alive: !!check.alive, hasPremium: !!check.hasPremium })
        const needWarranty = !check.alive || !check.hasPremium
        const getLinkBtn = panel.querySelector(`.acc-get-link-btn[data-sub="${subId}"]`)
        const tvBtnEl = panel.querySelector(`.acc-tv-btn[data-sub="${subId}"]`)
        for (const b of [getLinkBtn, tvBtnEl]) {
          if (!b) continue
          b.disabled = needWarranty
          b.setAttribute('aria-disabled', needWarranty ? 'true' : 'false')
          if (needWarranty) {
            b.title = !check.alive
              ? 'Cookie hết hiệu lực — bấm Bảo hành để đổi tài khoản trước khi lấy link / TV.'
              : 'Tài khoản mất gói Premium — bấm Bảo hành để đổi tài khoản trước khi lấy link / TV.'
            b.classList.add('acc-action-needs-warranty')
          } else {
            b.removeAttribute('title')
            b.classList.remove('acc-action-needs-warranty')
          }
        }

        // Bind inline warranty buttons
        planStatusEl.querySelectorAll('.acc-warranty-btn-inline').forEach(b => {
          b.addEventListener('click', () => triggerWarranty(b.dataset.sub, decodeURIComponent(b.dataset.cookie), panel, renewPlans))
        })
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

  // ===== Bảo hành: cookie die / mất gói → claim_warranty tự động =====
  async function triggerWarranty(subId, cookie, panel, renewPlans) {
    const resultEl = panel.querySelector(`#result-warranty-${subId}`)
    const warrantyBtn = panel.querySelector(`.acc-warranty-btn[data-sub="${subId}"]`)
    if (warrantyBtn) warrantyBtn.disabled = true

    try {
      let reason = 'unknown'

      if (cookie) {
        showResult(resultEl, 'loading', '\u23f3 \u0110ang ki\u1ec3m tra t\u00ecnh tr\u1ea1ng t\u00e0i kho\u1ea3n...')
        try {
          const check = await apiCheckPlanStatus(cookie)
          if (check.alive && check.hasPremium) {
            showResult(resultEl, 'success', `\u2705 T\u00e0i kho\u1ea3n OK \u2014 g\u00f3i ${check.plan || 'Premium'} \u0111ang ho\u1ea1t \u0111\u1ed9ng b\u00ecnh th\u01b0\u1eddng.`)
            if (warrantyBtn) warrantyBtn.disabled = false
            return
          }
          reason = check.reason || (!check.alive ? 'cookie_dead' : 'plan_lost')
        } catch {
        }

        const reasonMsg = reason === 'plan_lost'
          ? '\u23f3 Ph\u00e1t hi\u1ec7n m\u1ea5t g\u00f3i Premium. \u0110ang \u0111\u1ed5i t\u00e0i kho\u1ea3n m\u1edbi...'
          : '\u23f3 Cookie \u0111\u00e3 die. \u0110ang x\u1eed l\u00fd b\u1ea3o h\u00e0nh...'
        showResult(resultEl, 'loading', reasonMsg)
      } else {
        showResult(resultEl, 'loading', '\u23f3 \u0110ang x\u1eed l\u00fd b\u1ea3o h\u00e0nh...')
      }

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
