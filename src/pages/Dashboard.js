import { getUser } from '../utils/auth.js'
import { getUserSubscriptions, getUserPayments, getPlans, claimWarranty } from '../utils/api.js'
import { apiGetLink, apiCheckCookie, apiTvInit, apiTvSubmit } from '../utils/netflix.js'
import {
  formatVND, formatDate, statusLabel, statusClass,
  daysLeft, planLabel, parseAccount, maskPassword, shortCookie
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
        <p class="page-desc">Quản lý đăng ký và tài khoản Netflix</p>
        <div class="dash-tabs">
          <button class="dash-tab active" data-tab="subs">📦 Đăng ký</button>
          <button class="dash-tab" data-tab="payments">💳 Thanh toán</button>
        </div>
        <div class="dash-panel" id="panelSubs">
          <div class="loading"><div class="spinner"></div></div>
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

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      panelSubs.style.display = tab.dataset.tab === 'subs' ? 'block' : 'none'
      panelPayments.style.display = tab.dataset.tab === 'payments' ? 'block' : 'none'
    })
  })

  let linkPollerTimer = null

  // Dừng poller khi rời trang
  const stopPoller = () => { if (linkPollerTimer) { clearInterval(linkPollerTimer); linkPollerTimer = null } }

  try {
    const [subs, payments, renewPlans] = await Promise.all([
      getUserSubscriptions(user.id),
      getUserPayments(user.id),
      getPlans().catch(() => [])
    ])
    renderSubscriptions(panelSubs, subs, renewPlans)
    renderPayments(panelPayments, payments)

    // Auto-poll: sub active chưa có login_link → khi có link thì render lại cả thẻ (hiện Get link / TV / Bảo hành)
    let pendingIds = new Set(
      subs.filter(s => s.status === 'active' && !s.login_link && !subscriptionAccessExpired(s)).map(s => s.id)
    )

    const pollPendingLoginLinks = async () => {
      if (pendingIds.size === 0) { stopPoller(); return }
      let newSubs
      try {
        newSubs = await getUserSubscriptions(user.id)
      } catch {
        return
      }
      let gained = false
      for (const id of pendingIds) {
        const row = newSubs.find(s => s.id === id)
        if (row?.login_link) gained = true
      }
      if (gained) {
        renderSubscriptions(panelSubs, newSubs, renewPlans)
        pendingIds = new Set(
          newSubs.filter(s => s.status === 'active' && !s.login_link && !subscriptionAccessExpired(s)).map(s => s.id)
        )
      }
      if (pendingIds.size === 0) stopPoller()
    }

    if (pendingIds.size > 0) {
      pollPendingLoginLinks()
      linkPollerTimer = setInterval(pollPendingLoginLinks, 20000)
    }

  } catch (err) {
    panelSubs.innerHTML = `<p class="error-text">Lỗi: ${err.message}</p>`
    panelPayments.innerHTML = `<p class="error-text">Lỗi: ${err.message}</p>`
  }

  // Cleanup khi navigate ra khỏi trang
  return stopPoller
}

function renderSubscriptions(panel, subs, renewPlans = []) {
  const renewGridHtml = buildRenewOptionsHtml(renewPlans)

  if (!subs || subs.length === 0) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>Chưa có đăng ký nào</h3>
        <p>Mua gói Netflix để bắt đầu xem phim</p>
        <a href="#/plans" class="btn btn-primary">Xem bảng giá</a>
      </div>`
    return
  }

  let html = '<div class="sub-list">'

  subs.forEach(sub => {
    const days = daysLeft(sub.end_at)
    const plan = sub.plans || {}
    const isActive = sub.status === 'active'
    const expired = subscriptionAccessExpired(sub)
    const hasAccount = isActive && sub.login_link && !expired
    const acc = hasAccount ? parseAccount(sub.login_link) : null
    const cookie = acc ? (acc.cookie || '') : ''

    html += `
    <div class="sub-card" data-sub-id="${sub.id}" data-plan="${sub.plan || ''}">
      <div class="sub-header">
        <span class="sub-plan">${plan.name || planLabel(sub.plan)}</span>
        <span class="status-badge ${statusClass(sub.status)}">${statusLabel(sub.status)}</span>
      </div>
      <div class="sub-details">
        <div class="sub-detail"><span class="label">Giá:</span><span>${formatVND(plan.price || 0)}</span></div>
        ${sub.start_at ? `<div class="sub-detail"><span class="label">Bắt đầu:</span><span>${formatDate(sub.start_at)}</span></div>` : ''}
        ${sub.end_at ? `
          <div class="sub-detail"><span class="label">Hết hạn:</span><span>${formatDate(sub.end_at)}</span></div>
          <div class="sub-detail"><span class="label">Còn lại:</span>
            <span class="${days !== null && days <= 3 ? 'text-danger' : 'text-success'}">${days ?? '—'} ngày</span>
          </div>` : ''}
        <div class="sub-detail"><span class="label">Tạo lúc:</span><span>${formatDate(sub.created_at)}</span></div>
      </div>

      ${hasAccount && acc ? `
      <!-- ===== ACCOUNT INFO ===== -->
      <div class="account-section">
        <h4>🔐 Thông tin tài khoản Netflix</h4>
        ${sub.end_at ? `
        <div class="account-validity-banner">
          📅 Gói đang hiệu lực đến <strong>${formatDate(sub.end_at)}</strong>${days !== null ? ` · còn <strong>${days}</strong> ngày` : ''}.
          Các nút <strong>Get link</strong>, <strong>TV</strong>, <strong>Bảo hành</strong> dùng được trong thời gian này.
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
          ${acc.cookie ? `
          <div class="acc-info-row">
            <span class="acc-info-label">🍪 Cookie</span>
            <span class="acc-info-val acc-cookie-val" title="${acc.cookie}">${shortCookie(acc.cookie)}</span>
            <button class="btn-copy" data-copy="${acc.cookie}" title="Copy cookie đầy đủ">📋</button>
          </div>` : ''}
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
            data-cookie="${encodeURIComponent(cookie)}">
            🔧 Bảo hành
          </button>
        </div>

        <!-- GET LINK RESULT -->
        <div class="acc-result-box" id="result-link-${sub.id}" style="display:none;"></div>

        <!-- TV FORM (hidden until button clicked) -->
        <div class="tv-login-box" id="tv-box-${sub.id}" style="display:none;">
          <p class="tv-instruction">Nhập mã số hiển thị trên TV Netflix của bạn:</p>
          <div class="tv-input-row">
            <input type="text" class="tv-code-input" id="tv-code-${sub.id}"
              placeholder="VD: 32148294" maxlength="10" inputmode="numeric">
            <button class="btn btn-sm btn-primary acc-tv-submit-btn" data-sub="${sub.id}">📺 Gửi mã</button>
            <button class="btn btn-sm btn-outline acc-tv-cancel-btn" data-sub="${sub.id}">Huỷ</button>
          </div>
          <div class="acc-result-box" id="result-tv-${sub.id}" style="display:none;margin-top:8px;"></div>
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
          <span>⏳ Tài khoản đang được chuẩn bị — hệ thống sẽ tự gán trong ít phút...</span>
          <button onclick="window.location.reload()" class="btn btn-sm btn-warning" style="flex-shrink:0;">🔄 Tải lại</button>
        </div>
        <div style="font-size:12px;margin-top:6px;color:var(--warning);opacity:.75;">Tự động kiểm tra mỗi 20 giây</div>
      </div>
      ` : ''}
      ${sub.status === 'pending' ? `
      <div class="acc-pending-notice">⏳ Đang chờ xác nhận thanh toán từ ngân hàng...</div>
      ` : ''}
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
        btn.disabled = false
      }
    })
  })

  // ===== TV LOGIN — show form =====
  panel.querySelectorAll('.acc-tv-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subId = btn.dataset.sub
      const cookie = decodeURIComponent(btn.dataset.cookie)
      const tvBox = panel.querySelector(`#tv-box-${subId}`)
      const resultEl = panel.querySelector(`#result-tv-${subId}`)

      if (!cookie) {
        showResult(resultEl, 'error', '❌ Tài khoản này chỉ có email/mật khẩu, không có cookie Netflix. Không thể đăng nhập TV.')
        resultEl.style.display = 'block'
        return
      }

      if (tvBox.style.display !== 'none') {
        tvBox.style.display = 'none'
        return
      }

      // Pre-fetch authUrl in background
      btn.disabled = true
      btn.textContent = '⏳'
      showResult(resultEl, 'loading', '⏳ Đang kết nối Netflix...')
      resultEl.style.display = 'block'

      try {
        const init = await apiTvInit(cookie)
        if (!init.success) {
          showResult(resultEl, 'error', `❌ ${init.message}`)
          return
        }
        // Store authUrl on the submit button
        const submitBtn = panel.querySelector(`.acc-tv-submit-btn[data-sub="${subId}"]`)
        submitBtn.dataset.authUrl = init.authUrl
        submitBtn.dataset.cookie = encodeURIComponent(cookie)
        showResult(resultEl, 'info', '✅ Kết nối thành công! Nhập mã TV bên dưới:')
        tvBox.style.display = 'block'
      } catch (err) {
        showResult(resultEl, 'error', `❌ Lỗi: ${err.message}`)
      } finally {
        btn.disabled = false
        btn.textContent = '📺 Login TV'
      }
    })
  })

  // ===== TV LOGIN — cancel =====
  panel.querySelectorAll('.acc-tv-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.dataset.sub
      panel.querySelector(`#tv-box-${subId}`).style.display = 'none'
      panel.querySelector(`#tv-code-${subId}`).value = ''
      const resultEl = panel.querySelector(`#result-tv-${subId}`)
      resultEl.style.display = 'none'
    })
  })

  // ===== TV LOGIN — submit code =====
  panel.querySelectorAll('.acc-tv-submit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subId = btn.dataset.sub
      const authUrl = btn.dataset.authUrl
      const cookie = decodeURIComponent(btn.dataset.cookie || '')
      const codeInput = panel.querySelector(`#tv-code-${subId}`)
      const code = (codeInput?.value || '').trim()
      const resultEl = panel.querySelector(`#result-tv-${subId}`)

      if (!code.match(/^\d{6,10}$/)) {
        showResult(resultEl, 'error', '❌ Mã TV phải là 6-10 chữ số')
        return
      }
      if (!authUrl) {
        showResult(resultEl, 'error', '❌ Chưa có authUrl. Nhấn "Login TV" lại.')
        return
      }

      btn.disabled = true
      showResult(resultEl, 'loading', '⏳ Đang gửi mã TV lên Netflix...')

      try {
        const res = await apiTvSubmit(cookie, authUrl, code)
        if (res.success) {
          showResult(resultEl, 'success', `🎉 ${res.message || 'TV đã được đăng nhập!'}`)
          codeInput.value = ''
          // Close TV box after 3s
          setTimeout(() => {
            panel.querySelector(`#tv-box-${subId}`).style.display = 'none'
          }, 3000)
        } else {
          showResult(resultEl, 'error', `❌ ${res.message}`)
        }
      } catch (err) {
        showResult(resultEl, 'error', `❌ Lỗi: ${err.message}`)
      } finally {
        btn.disabled = false
      }
    })
  })

  // ===== WARRANTY =====
  panel.querySelectorAll('.acc-warranty-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subId = btn.dataset.sub
      const cookie = decodeURIComponent(btn.dataset.cookie)
      const resultEl = panel.querySelector(`#result-warranty-${subId}`)
      showResult(resultEl, 'loading', '⏳ Đang kiểm tra tình trạng cookie...')
      btn.disabled = true

      try {
        // Step 1: Check cookie alive (only if cookie exists)
        if (cookie) {
          const check = await apiCheckCookie(cookie)
          if (check.alive) {
            showResult(resultEl, 'success', '✅ Cookie vẫn còn sống! Tài khoản hoạt động bình thường.')
            btn.disabled = false
            return
          }
          // Cookie dead → fall through to warranty
          showResult(resultEl, 'loading', '⏳ Cookie đã die. Đang xử lý bảo hành...')
        } else {
          // No cookie (email:password account) → go straight to warranty
          showResult(resultEl, 'loading', '⏳ Đang xử lý bảo hành...')
        }

        // Step 2: Claim warranty
        const warranty = await claimWarranty(subId)

        if (warranty && warranty.success) {
          const u = getUser()
          if (u) {
            const fresh = await getUserSubscriptions(u.id)
            renderSubscriptions(panel, fresh, renewPlans)
          } else {
            showResult(resultEl, 'success', '✅ Đã đổi tài khoản. Vui lòng tải lại trang.')
          }
        } else {
          showResult(resultEl, 'error', `❌ ${warranty?.message || 'Không thể bảo hành. Liên hệ admin.'}`)
        }
      } catch (err) {
        showResult(resultEl, 'error', `❌ Lỗi: ${err.message}`)
      } finally {
        btn.disabled = false
      }
    })
  })
}

// Helper: show result with state
function showResult(el, state, message) {
  const colors = {
    loading: 'var(--warning)',
    success: 'var(--secondary)',
    error:   'var(--danger)',
    info:    'var(--primary)'
  }
  el.style.display = 'block'
  el.innerHTML = `<span style="color:${colors[state] || 'var(--text-secondary)'}">${message}</span>`
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
