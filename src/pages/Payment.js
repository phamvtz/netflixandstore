import { getPlan, createSubscription, createPayment, getSettings } from '../utils/api.js'
import { getUser } from '../utils/auth.js'
import { formatVND, generateTransferContent, planLabel } from '../utils/format.js'
import { navigate } from '../router.js'

export async function renderPayment(container, params) {
  const user = getUser()
  if (!user) { navigate('/login'); return }

  const planId = params.id
  if (!planId) { navigate('/plans'); return }

  let plan, cfg
  try {
    ;[plan, cfg] = await Promise.all([getPlan(planId), getSettings()])
  } catch {
    try { plan = await getPlan(planId); cfg = {} } catch {
      container.innerHTML = `
        <div class="page-container" style="text-align:center;padding:100px 20px;">
          <h1>Gói không tồn tại</h1>
          <a href="#/plans" class="btn btn-primary">Xem bảng giá</a>
        </div>
      `
      return
    }
  }
  if (!plan) { container.innerHTML = `<div class="page-container" style="text-align:center;padding:100px 20px;"><h1>Gói không tồn tại</h1><a href="#/plans" class="btn btn-primary">Xem bảng giá</a></div>`; return }

  // Thông tin ngân hàng từ settings (fallback về hardcode nếu chưa cấu hình)
  const bankName    = cfg.bank_name    || 'MB Bank'
  const bankAccount = cfg.bank_account || '321336'
  const bankOwner   = cfg.bank_owner   || 'PHAM VAN VIET'
  const momoNumber  = cfg.momo_number  || '0336636315'
  const momoName    = cfg.momo_name    || 'PHAM VAN VIET'

  // ── Session key: persist transferContent across iOS page reloads ────────────
  // iOS Safari can fully reload the page when the user returns from the banking
  // app.  Without sessionStorage the page would generate a new transferContent,
  // show a new QR, and the webhook that already fired for the OLD code would
  // never match a DB record → payment confirmed in bank but "pending" forever.
  const SESSION_KEY = `nf_pay_${user.id}_${planId}`

  // Try to reuse an existing pending session (same transferContent = same QR)
  let savedSession = null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) savedSession = JSON.parse(raw)
  } catch (_) {}

  // If the previous session is already confirmed, clear it and start fresh
  if (savedSession) {
    try {
      const check = await fetch(`/api/payment-status/${encodeURIComponent(savedSession.transferContent)}`)
      const checkData = await check.json()
      if (checkData.confirmed) {
        sessionStorage.removeItem(SESSION_KEY)
        showWaitingUI(container, plan, planId, savedSession.transferContent, SESSION_KEY,
          { bankName, bankAccount, bankOwner })
        return
      }
      // still pending — keep using the same transferContent / QR
    } catch (_) {
      savedSession = null
    }
  }

  const transferContent = savedSession?.transferContent ?? generateTransferContent()

  // ── Create DB records IMMEDIATELY so the SePay webhook can match them ───────
  // BUG FIX: previously the subscription + payment rows were created only when
  // the user clicked "Tôi đã chuyển khoản".  If the user went to the banking
  // app first, the webhook fired while no DB record existed → silently discarded
  // → payment forever stuck at "pending".
  //
  // We create the records NOW (on page load) and persist them in sessionStorage.
  // The confirm button becomes a simple "show waiting UI" action.
  if (!savedSession) {
    try {
      container.innerHTML = `<div style="text-align:center;padding:80px 20px;"><div class="spinner" style="margin:0 auto 16px;"></div><p>Đang khởi tạo...</p></div>`
      const sub = await createSubscription(user.id, planId)
      await createPayment(user.id, sub.id, plan.price, planId, 'bank', transferContent)
      savedSession = { transferContent, subscriptionId: sub.id }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(savedSession))
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:80px 20px;"><p style="color:red;">Lỗi khởi tạo: ${err.message}</p><a href="#/plans" class="btn btn-primary" style="margin-top:12px;">Thử lại</a></div>`
      return
    }
  }

  container.innerHTML = `
    <section class="payment-section">
      <div class="page-container">
        <h1 class="page-title">Thanh toán</h1>

        <div class="payment-grid">
          <!-- ORDER SUMMARY -->
          <div class="payment-card order-summary">
            <h2>📦 Đơn hàng</h2>
            <div class="order-detail">
              <span>Gói:</span>
              <strong>${plan.name || planLabel(plan.id)}</strong>
            </div>
            <div class="order-detail">
              <span>Thời hạn:</span>
              <strong>${plan.duration_days} ngày</strong>
            </div>
            <div class="order-detail total">
              <span>Tổng tiền:</span>
              <strong class="price-highlight">${formatVND(plan.price)}</strong>
            </div>
            <div class="order-detail">
              <span>Nội dung CK:</span>
              <strong class="transfer-code">${transferContent}</strong>
            </div>
          </div>

          <!-- PAYMENT METHODS -->
          <div class="payment-card payment-methods">
            <h2>🏦 Thông tin chuyển khoản</h2>

            <!-- BANK INFO -->
            <div class="bank-info">
              <div class="bank-row">
                <span>Ngân hàng:</span>
                <strong>${bankName}</strong>
              </div>
              <div class="bank-row">
                <span>Số tài khoản:</span>
                <strong class="copyable" id="bankAccount">${bankAccount}</strong>
                <button class="btn-copy" data-copy="${bankAccount}">📋</button>
              </div>
              <div class="bank-row">
                <span>Chủ tài khoản:</span>
                <strong>${bankOwner}</strong>
              </div>
              <div class="bank-row">
                <span>Số tiền:</span>
                <strong class="copyable">${formatVND(plan.price)}</strong>
                <button class="btn-copy" data-copy="${plan.price}">📋</button>
              </div>
              <div class="bank-row highlight">
                <span>Nội dung CK:</span>
                <strong class="copyable" id="transferCode">${transferContent}</strong>
                <button class="btn-copy" data-copy="${transferContent}">📋</button>
              </div>
            </div>
            <div class="bank-qr">
              <img src="https://img.vietqr.io/image/970422-${bankAccount}-compact.jpg?amount=${plan.price}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(bankOwner)}"
                   alt="QR Code" class="qr-img" onerror="this.style.display='none'">
              <p class="qr-note">Quét mã QR để chuyển khoản nhanh</p>
            </div>

            <div class="payment-warning">
              ⚠️ <strong>Quan trọng:</strong> Nhập đúng nội dung chuyển khoản <code>${transferContent}</code> để được xử lý tự động!
            </div>

            <button class="btn btn-primary btn-lg btn-block" id="btnConfirmPayment">
              ✅ Tôi đã chuyển khoản
            </button>
          </div>
        </div>
      </div>
    </section>
  `

  // Copy buttons
  container.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy)
      btn.textContent = '✅'
      setTimeout(() => btn.textContent = '📋', 1500)
    })
  })

  // Confirm button — DB records already exist, just show the waiting UI
  const btnConfirm = container.querySelector('#btnConfirmPayment')
  btnConfirm.addEventListener('click', () => {
    showWaitingUI(container, plan, planId, transferContent, SESSION_KEY, { bankName, bankAccount, bankOwner })
  })
}

// ========== WAITING UI (polls server every 10s for auto-confirmation) ==========
function showWaitingUI(container, plan, planId, transferContent, SESSION_KEY, bankInfo = {}) {
  const bankName    = bankInfo.bankName    || window.__siteSettings?.bank_name    || 'MB Bank'
  const bankAccount = bankInfo.bankAccount || window.__siteSettings?.bank_account || '321336'
  const bankOwner   = bankInfo.bankOwner   || window.__siteSettings?.bank_owner   || ''

  container.innerHTML = `
    <section class="payment-section">
      <div class="page-container" style="max-width:600px;margin:0 auto;padding:40px 20px;">

        <div class="payment-card" style="text-align:center;">

          <!-- Spinner / Success icon -->
          <div class="waiting-spinner" id="waitSpinner">
            <div class="spinner" style="margin:0 auto 20px;"></div>
          </div>
          <div id="waitIcon" style="display:none;font-size:60px;margin-bottom:16px;">🎉</div>

          <h2 id="waitTitle" style="font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">
            ⏳ Đang chờ xác nhận thanh toán...
          </h2>
          <p id="waitDesc" style="color:var(--text-secondary);font-size:14px;margin:0 0 24px;line-height:1.7;">
            Hệ thống tự động kiểm tra giao dịch ngân hàng mỗi 10 giây.<br>
            Vui lòng <strong style="color:var(--text-primary);">không tắt trang</strong> này.
          </p>

          <!-- Transfer reminder -->
          <div id="transferReminder"
            style="background:var(--primary-light);border:1.5px solid rgba(79,70,229,.2);border-radius:12px;text-align:left;padding:16px 20px;margin-bottom:20px;">
            <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">
              📋 Thông tin chuyển khoản
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(79,70,229,.1);font-size:14px;">
              <span style="color:var(--text-secondary);">Ngân hàng</span>
              <strong style="color:var(--text-primary);">${bankName}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(79,70,229,.1);font-size:14px;">
              <span style="color:var(--text-secondary);">Số tài khoản</span>
              <strong style="color:var(--text-primary);">${bankAccount}</strong>
            </div>
            ${bankOwner ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(79,70,229,.1);font-size:14px;">
              <span style="color:var(--text-secondary);">Chủ tài khoản</span>
              <strong style="color:var(--text-primary);">${bankOwner}</strong>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(79,70,229,.1);font-size:14px;">
              <span style="color:var(--text-secondary);">Số tiền</span>
              <strong style="color:var(--primary);font-size:18px;font-weight:800;">${formatVND(plan.price)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:14px;">
              <span style="color:var(--text-secondary);">Nội dung CK</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <strong id="tcDisplay" style="font-family:var(--mono);color:var(--secondary-hover);font-size:15px;letter-spacing:1px;">${transferContent}</strong>
                <button class="btn-copy" id="tcCopy" data-copy="${transferContent}"
                  style="background:none;border:1.5px solid var(--primary);color:var(--primary);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">
                  Copy
                </button>
              </div>
            </div>
          </div>

          <!-- Progress bar -->
          <div style="background:var(--bg-muted);border-radius:99px;height:5px;margin-bottom:12px;overflow:hidden;">
            <div id="progressBar" style="height:100%;background:var(--primary);width:0%;transition:width 0.5s ease;border-radius:99px;"></div>
          </div>

          <div id="elapsedText" style="font-size:13px;color:var(--text-muted);margin-bottom:24px;">
            Đã chờ: <span id="elapsedSec">0</span> giây
          </div>

          <!-- Success info (hidden until confirmed) -->
          <div id="successInfo" style="display:none;">
            <div class="success-info" style="margin-bottom:20px;">
              <div class="order-detail"><span>Gói:</span><strong>${plan.name || planLabel(planId)}</strong></div>
              <div class="order-detail"><span>Số tiền:</span><strong>${formatVND(plan.price)}</strong></div>
              <div class="order-detail" id="loginLinkRow" style="display:none;">
                <span>Link đăng nhập:</span>
                <a id="loginLinkAnchor" href="#" target="_blank" class="price-highlight" style="word-break:break-all;"></a>
              </div>
            </div>
            <div style="margin-top:24px;">
              <a href="#/dashboard" class="btn btn-primary btn-lg">📦 Xem đơn hàng</a>
              <a href="#/" class="btn btn-outline btn-lg" style="margin-left:10px;">Về trang chủ</a>
            </div>
          </div>

          <!-- Timeout / manual check -->
          <div id="timeoutSection" style="display:none;margin-top:16px;">
            <p style="color:#f59e0b;margin-bottom:12px;">⏰ Chưa phát hiện giao dịch sau 15 phút.</p>
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
              Nếu bạn đã chuyển khoản, liên hệ admin để xác nhận thủ công.
            </p>
            <button id="btnRecheck" class="btn btn-primary">🔄 Kiểm tra lại</button>
            <a href="#/dashboard" class="btn btn-outline" style="margin-left:10px;">Xem đơn hàng</a>
          </div>
        </div>

      </div>
    </section>
  `

  // Copy button
  const tcCopy = container.querySelector('#tcCopy')
  if (tcCopy) {
    tcCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(transferContent)
      tcCopy.textContent = '✅ Đã copy'
      tcCopy.style.background = 'var(--secondary)'
      tcCopy.style.borderColor = 'var(--secondary)'
      tcCopy.style.color = '#fff'
      setTimeout(() => {
        tcCopy.textContent = 'Copy'
        tcCopy.style.background = 'none'
        tcCopy.style.borderColor = 'var(--primary)'
        tcCopy.style.color = 'var(--primary)'
      }, 1800)
    })
  }

  // ── Polling logic ──────────────────────────────────────────────────────────
  // iOS Safari kills/freezes setTimeout when the tab is backgrounded.
  // Robust fix:
  //   1. Track lastCheckTime with Date.now() so we always know whether a check
  //      is overdue, regardless of timer state.
  //   2. scheduleNextCheck() calculates the *remaining* delay from wall-clock
  //      instead of blindly using POLL_INTERVAL — so on resume we fire
  //      immediately if overdue.
  //   3. Listen to visibilitychange, window focus AND pageshow (iOS bfcache)
  //      so we catch every possible "user returned to this tab" event.
  const MAX_WAIT_MS    = 900_000   // 15 phút
  const POLL_INTERVAL  = 10_000    // 10 giây
  let   startTime      = Date.now() // let để recheck có thể reset
  let   lastCheckTime  = 0
  let   polling        = true
  let   pollTimer      = null
  let   tickTimer      = null      // 1-second ticker for elapsed display

  const progressBar    = container.querySelector('#progressBar')
  const elapsedSpan    = container.querySelector('#elapsedSec')
  const elapsedText_el = container.querySelector('#elapsedText')
  const waitTitle      = container.querySelector('#waitTitle')
  const waitDesc       = container.querySelector('#waitDesc')
  const waitSpinner    = container.querySelector('#waitSpinner')
  const waitIcon       = container.querySelector('#waitIcon')
  const successInfo    = container.querySelector('#successInfo')
  const timeoutSec     = container.querySelector('#timeoutSection')
  const transferRem    = container.querySelector('#transferReminder')

  // Cập nhật elapsed dựa vào wall-clock (không bị ảnh hưởng khi tab bị suspend)
  function updateElapsed() {
    const sec = Math.floor((Date.now() - startTime) / 1000)
    if (elapsedSpan)  elapsedSpan.textContent = sec
    if (progressBar)  progressBar.style.width = Math.min(sec / (MAX_WAIT_MS / 1000) * 100, 100) + '%'
  }

  // Tick every second so the elapsed counter updates even between polls
  function startTick() {
    if (tickTimer) return
    tickTimer = setInterval(updateElapsed, 1000)
  }
  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
  }

  // Schedule the next poll using the wall-clock so that after a long suspension
  // we fire immediately instead of waiting a full POLL_INTERVAL.
  function scheduleNextCheck() {
    if (!polling) return
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    const elapsed = Date.now() - lastCheckTime
    const delay   = Math.max(0, POLL_INTERVAL - elapsed)
    pollTimer = setTimeout(checkStatus, delay)
  }

  let linkPollTimer = null

  function showSuccess(data) {
    if (SESSION_KEY) { try { sessionStorage.removeItem(SESSION_KEY) } catch (_) {} }

    waitSpinner.style.display   = 'none'
    waitIcon.style.display      = 'block'
    progressBar.style.width     = '100%'
    transferRem.style.display   = 'none'
    if (elapsedText_el) elapsedText_el.style.display = 'none'

    if (data.loginLink) {
      // Có link ngay → hiện luôn
      waitTitle.textContent = '🎉 Thanh toán & kích hoạt thành công!'
      waitDesc.textContent  = 'Tài khoản Netflix của bạn đã sẵn sàng.'
      const lr = container.querySelector('#loginLinkRow')
      const la = container.querySelector('#loginLinkAnchor')
      if (lr && la) { lr.style.display = 'flex'; la.href = data.loginLink; la.textContent = data.loginLink }
      successInfo.style.display = 'block'
    } else {
      // Thanh toán OK nhưng hệ thống chưa gán tài khoản (kho đang bổ sung)
      waitTitle.textContent = '✅ Thanh toán thành công!'
      waitDesc.innerHTML    = 'Hệ thống đang chọn tài khoản phù hợp cho bạn...<br><small style="color:var(--text-secondary)">Tự động kiểm tra mỗi 15 giây</small>'
      successInfo.style.display = 'block'

      // Poll cho đến khi có loginLink (tối đa 30 phút)
      const subId   = data.subId || data.subscription_id
      const maxWait = Date.now() + 30 * 60 * 1000

      linkPollTimer = setInterval(async () => {
        if (Date.now() > maxWait) {
          clearInterval(linkPollTimer)
          waitDesc.innerHTML = '⚠️ Chưa có tài khoản khả dụng. Vui lòng liên hệ admin hoặc kiểm tra lại trong mục <a href="#/dashboard">Tài khoản</a>.'
          return
        }
        try {
          const r    = await fetch(`/api/payment-status/${encodeURIComponent(transferContent)}`)
          const info = await r.json()
          if (info.loginLink) {
            clearInterval(linkPollTimer)
            waitTitle.textContent = '🎉 Tài khoản đã sẵn sàng!'
            waitDesc.textContent  = 'Nhấn vào link dưới đây để đăng nhập Netflix ngay:'
            const lr = container.querySelector('#loginLinkRow')
            const la = container.querySelector('#loginLinkAnchor')
            if (lr && la) { lr.style.display = 'flex'; la.href = info.loginLink; la.textContent = info.loginLink }
          }
        } catch {}
      }, 15000)
    }
  }

  function stopPolling() {
    polling = false
    if (pollTimer)    { clearTimeout(pollTimer);     pollTimer    = null }
    if (linkPollTimer){ clearInterval(linkPollTimer); linkPollTimer = null }
    stopTick()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onWindowFocus)
    window.removeEventListener('pageshow', onPageShow)
  }

  async function checkStatus() {
    if (!polling) return

    lastCheckTime = Date.now()
    updateElapsed()

    // Timeout check (dùng wall-clock)
    if (Date.now() - startTime >= MAX_WAIT_MS) {
      stopPolling()
      waitSpinner.style.display = 'none'
      waitTitle.textContent     = '⏰ Hết thời gian tự động'
      if (timeoutSec) timeoutSec.style.display = 'block'
      return
    }

    try {
      const resp = await fetch(`/api/payment-status/${encodeURIComponent(transferContent)}`)
      const data = await resp.json()

      if (data.confirmed) {
        stopPolling()
        showSuccess(data)
        return
      }
    } catch (_) { /* lỗi mạng, thử lại sau */ }

    // Lên lịch lần kiểm tra tiếp theo (wall-clock aware)
    scheduleNextCheck()
  }

  // ── iOS Safari fix ─────────────────────────────────────────────────────────
  // Khi user chuyển sang app ngân hàng rồi quay lại, tab bị suspend và
  // setTimeout bị đóng băng / hủy.  Ba sự kiện dưới đây phủ hết các trường hợp:
  //   • visibilitychange  – tab được đưa lên foreground (Android, desktop, iOS ≥ 14)
  //   • pageshow          – iOS bfcache: trang được khôi phục từ cache (e.persisted = true)
  //   • focus             – fallback cho một số trình duyệt
  //
  // resumePolling() kiểm tra lastCheckTime: nếu đã quá POLL_INTERVAL thì check
  // ngay lập tức, nếu chưa thì re-schedule với thời gian còn lại.
  function resumePolling() {
    if (!polling) return
    // Cancel any stale/frozen timer
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }

    const overdue = Date.now() - lastCheckTime >= POLL_INTERVAL
    if (overdue) {
      waitTitle.textContent = '🔄 Đang kiểm tra...'
      checkStatus()
    } else {
      // Not overdue yet — just re-schedule with the remaining delay
      scheduleNextCheck()
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') resumePolling()
  }

  // pageshow fires on iOS when the page is restored from bfcache after the
  // user returns from the banking app. visibilitychange alone is NOT enough.
  function onPageShow(e) {
    // e.persisted === true  →  restored from bfcache (iOS)
    // e.persisted === false →  normal page load (already handled by checkStatus())
    if (e.persisted) resumePolling()
  }

  function onWindowFocus() { resumePolling() }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onWindowFocus)

  // ── Recheck button ─────────────────────────────────────────────────────────
  const btnRecheck = container.querySelector('#btnRecheck')
  if (btnRecheck) {
    btnRecheck.addEventListener('click', async () => {
      btnRecheck.disabled    = true
      btnRecheck.textContent = '⏳ Đang kiểm tra...'
      polling = true
      // Reset startTime để timeout 15 phút tính lại từ đầu
      startTime = Date.now()
      lastCheckTime = 0
      timeoutSec.style.display  = 'none'
      waitSpinner.style.display = 'block'
      waitTitle.textContent     = '⏳ Đang kiểm tra lại...'
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('pageshow', onPageShow)
      window.addEventListener('focus', onWindowFocus)
      startTick()
      await checkStatus()
      btnRecheck.disabled    = false
      btnRecheck.textContent = '🔄 Kiểm tra lại'
    })
  }

  // Bắt đầu ticker + polling ngay lập tức.
  // ⚡ Quan trọng: nếu webhook SePay đã kích hoạt trong khi user đang dùng app
  // ngân hàng, lần poll ĐẦU TIÊN này sẽ trả về confirmed=true ngay lập tức.
  startTick()
  checkStatus()
}

