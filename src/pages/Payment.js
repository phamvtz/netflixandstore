import {
  getPlan, createSubscription, createPayment, getSettings, getCheckoutQuote
} from '../utils/api.js'
import { getUser } from '../utils/auth.js'
import { formatVND, generateTransferContent, planLabel } from '../utils/format.js'
import { navigate } from '../router.js'
import { getCheckoutStore, clearCheckoutStore } from '../utils/storeContext.js'
import { isPlanHiddenFromStorefront } from '../utils/catalog.js'

export async function renderPayment(container, params) {
  const user = getUser()
  if (!user) { navigate('/login'); return }

  const planId = params.id
  if (!planId) { navigate('/plans'); return }

  const checkoutStore = getCheckoutStore()
  const sellerStoreId = checkoutStore?.id ?? null
  const payOpts = sellerStoreId ? { sellerStoreId } : {}

  let plan
  let paymentCfg
  try {
    const quote = await getCheckoutQuote(planId, sellerStoreId)
    plan = quote.plan
    paymentCfg = quote.payment
  } catch {
    try {
      const cfg = await getSettings()
      plan = await getPlan(planId)
      paymentCfg = {
        source: 'site',
        bank_name: cfg.bank_name || 'MB Bank',
        bank_account: cfg.bank_account || '321336',
        bank_owner: cfg.bank_owner || 'PHAM VAN VIET',
        momo_number: cfg.momo_number || '0336636315',
        momo_name: cfg.momo_name || 'PHAM VAN VIET',
        vietqr_bank_bin: '970422'
      }
    } catch {
      container.innerHTML = `
        <div class="page-container" style="text-align:center;padding:100px 20px;">
          <h1>Gói không tồn tại</h1>
          <a href="#/plans" class="btn btn-primary">Xem bảng giá</a>
        </div>
      `
      return
    }
  }
  if (!plan) {
    container.innerHTML = `<div class="page-container" style="text-align:center;padding:100px 20px;"><h1>Gói không tồn tại</h1><a href="#/plans" class="btn btn-primary">Xem bảng giá</a></div>`
    return
  }

  let paySettings = {}
  try { paySettings = await getSettings() } catch (_) {}
  if (isPlanHiddenFromStorefront(plan, paySettings)) {
    container.innerHTML = `
      <div class="page-container" style="text-align:center;padding:100px 20px;">
        <h1>Gói không còn mở bán</h1>
        <p style="color:var(--text-secondary);margin:12px 0;">Gói đã được ẩn hoặc ngừng hiển thị trên cửa hàng.</p>
        <a href="#/plans" class="btn btn-primary">Xem bảng giá</a>
      </div>`
    return
  }

  const bankName    = paymentCfg.bank_name    || 'MB Bank'
  const bankAccount = paymentCfg.bank_account || ''
  const bankOwner   = paymentCfg.bank_owner   || ''
  const momoNumber  = paymentCfg.momo_number  || ''
  const momoName    = paymentCfg.momo_name    || ''
  const vietqrBin   = paymentCfg.vietqr_bank_bin || '970422'

  // ── Session key: persist transferContent across iOS page reloads ────────────
  // iOS Safari can fully reload the page when the user returns from the banking
  // app.  Without sessionStorage the page would generate a new transferContent,
  // show a new QR, and the webhook that already fired for the OLD code would
  // never match a DB record → payment confirmed in bank but "pending" forever.
  const SESSION_KEY = `nf_pay_${user.id}_${planId}_${sellerStoreId || 'main'}`

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
        showWaitingUI(container, plan, planId, savedSession.transferContent, SESSION_KEY, {
          bankName,
          bankAccount,
          bankOwner,
          vietqrBin,
          momoNumber,
          momoName,
          orderCode: savedSession.orderCode || '',
          storeSlug: checkoutStore?.slug || '',
          paymentSource: paymentCfg.source || 'site',
          sellerStoreId
        })
        return
      }
      // still pending — keep using the same transferContent / QR
    } catch (_) {
      savedSession = null
    }
  }

  const transferContent = savedSession?.transferContent ?? generateTransferContent()

  // ── Create DB records IMMEDIATELY so the SePay webhook can match them ───────
  // BUG FIX: previously the subscription + payment rows were created only after
  // a manual step. If the user went to the banking
  // app first, the webhook fired while no DB record existed → silently discarded
  // → payment forever stuck at "pending".
  //
  // We create the records NOW (on page load) and persist them in sessionStorage.
  // Trang tự poll SePay — không cần nút xác nhận.
  if (!savedSession) {
    try {
      container.innerHTML = `
        <section class="payment-section">
          <div class="page-container">
            <div class="payment-grid">
              <div class="skeleton payment-skeleton"></div>
              <div class="skeleton payment-skeleton"></div>
            </div>
          </div>
        </section>`
      const sub = await createSubscription(user.id, planId, payOpts)
      await createPayment(user.id, sub.id, plan.price, planId, 'bank', transferContent, payOpts)
      savedSession = { transferContent, subscriptionId: sub.id, orderCode: sub.id.replace(/-/g,'').substring(0,8).toUpperCase() }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(savedSession))
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:80px 20px;"><p style="color:red;">Lỗi khởi tạo: ${err.message}</p><a href="#/plans" class="btn btn-primary" style="margin-top:12px;">Thử lại</a></div>`
      return
    }
  }

  showWaitingUI(container, plan, planId, transferContent, SESSION_KEY, {
    bankName,
    bankAccount,
    bankOwner,
    vietqrBin,
    momoNumber,
    momoName,
    orderCode: savedSession?.orderCode || '',
    storeSlug: checkoutStore?.slug || '',
    paymentSource: paymentCfg.source || 'site',
    sellerStoreId
  })
}

// ========== WAITING UI (polls server every 10s for auto-confirmation) ==========
function showWaitingUI(container, plan, planId, transferContent, SESSION_KEY, bankInfo = {}) {
  const bankName    = bankInfo.bankName    || window.__siteSettings?.bank_name    || 'MB Bank'
  const bankAccount = bankInfo.bankAccount || window.__siteSettings?.bank_account || '321336'
  const bankOwner   = bankInfo.bankOwner   || window.__siteSettings?.bank_owner   || ''
  const vietqrBin   = bankInfo.vietqrBin || '970422'
  const momoNumber  = bankInfo.momoNumber  || ''
  const momoName    = bankInfo.momoName    || ''
  const orderCode   = bankInfo.orderCode   || ''
  const storeSlug   = bankInfo.storeSlug   || ''
  const paymentSource = bankInfo.paymentSource || 'site'
  const sellerStoreIdInfo = bankInfo.sellerStoreId

  const planService     = plan.service          || 'netflix'
  const planFulfillment = plan.fulfillment_type || (planService === 'netflix' ? 'netflix' : 'manual')
  const isNetflixPlan   = planService === 'netflix'
  const isManualService = planFulfillment === 'manual'

  container.innerHTML = `
    <section class="payment-section">
      <div class="page-container" style="max-width:600px;margin:0 auto;padding:40px 20px;">

        <div class="payment-card" style="text-align:center;">

          <div id="payDetailsWrap" style="text-align:left;">
            <h1 class="page-title" style="text-align:center;margin-bottom:20px;">Thanh toán</h1>
            <div style="margin-bottom:20px;padding:16px 18px;border:1px solid var(--border);border-radius:12px;background:var(--surface-elevated, var(--bg-muted));">
              <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Đơn hàng</div>
              ${orderCode ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:2px solid var(--primary-ring);margin-bottom:6px;font-size:14px;">
                <span>Mã đơn</span>
                <strong style="font-family:var(--mono);color:var(--primary);">#${orderCode}</strong>
              </div>` : ''}
              <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;"><span style="color:var(--text-secondary);">Gói</span><strong>${plan.name || planLabel(plan.id)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;"><span style="color:var(--text-secondary);">Thời hạn</span><strong>${plan.duration_days} ngày</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:15px;"><span style="color:var(--text-secondary);">Tổng</span><strong class="price-highlight">${formatVND(plan.price)}</strong></div>
              ${sellerStoreIdInfo && storeSlug ? `<div style="font-size:13px;color:var(--text-secondary);padding-top:8px;">Gian hàng: <strong>#/s/${storeSlug}</strong>${paymentSource === 'seller' ? ' · Thanh toán về TK đại lý' : ''}</div>` : ''}
            </div>

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
              <span style="color:var(--text-secondary);">Nội dung chuyển khoản</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <strong id="tcDisplay" style="font-family:var(--mono);color:var(--secondary-hover);font-size:15px;letter-spacing:1px;">${transferContent}</strong>
                <button class="btn-copy" id="tcCopy" data-copy="${transferContent}"
                  style="background:none;border:1.5px solid var(--primary);color:var(--primary);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">
                  Copy
                </button>
              </div>
            </div>
          </div>

          ${bankAccount ? `<div class="bank-qr" style="text-align:center;margin-bottom:18px;">
              <img src="https://img.vietqr.io/image/${vietqrBin}-${bankAccount}-compact.jpg?amount=${plan.price}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(bankOwner)}" alt="VietQR" class="qr-img" style="max-width:280px;width:100%;border-radius:8px;" onerror="this.style.display='none'">
              <p style="font-size:13px;color:var(--text-secondary);margin:8px 0 0;">Quét mã QR để chuyển khoản nhanh</p>
            </div>` : ''}
          ${momoNumber ? `<div style="margin-bottom:18px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;">
              <div style="font-weight:600;margin-bottom:8px;">MoMo</div>
              <div style="font-size:14px;"><span style="color:var(--text-secondary);">Số: </span><strong>${momoNumber}</strong></div>
              <div style="font-size:14px;"><span style="color:var(--text-secondary);">Tên: </span><strong>${momoName}</strong></div>
            </div>` : ''}
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:22px;line-height:1.55;">
            <strong>Quan trọng:</strong> Nhập đúng nội dung chuyển khoản <code style="font-family:var(--mono);">${transferContent}</code>. Sau khi chuyển, trang tự nhận — không cần bấm thêm.
          </div>
          </div>

          <!-- Spinner / Success icon -->
          <div class="waiting-spinner" id="waitSpinner">
            <div class="spinner" style="margin:0 auto 20px;"></div>
          </div>
          <div id="waitIcon" class="success-icon" style="display:none;font-size:64px;margin-bottom:16px;">🎉</div>

          <h2 id="waitTitle" style="font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">
            ⏳ Đang chờ xác nhận chuyển khoản...
          </h2>
          <p id="waitDesc" style="color:var(--text-secondary);font-size:14px;margin:0 0 24px;line-height:1.7;">
            Chuyển khoản theo thông tin trên. Hệ thống tự động kiểm tra giao dịch khoảng mỗi 10 giây.<br>
            Vui lòng <strong style="color:var(--text-primary);">không tắt trang</strong> sau khi đã chuyển khoản.
          </p>

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
                <span>${isNetflixPlan ? 'Link đăng nhập:' : 'Nội dung:'}</span>
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
    clearCheckoutStore()

    waitSpinner.style.display   = 'none'
    waitIcon.style.display      = 'block'
    progressBar.style.width     = '100%'
    const payDetails = container.querySelector('#payDetailsWrap')
    if (payDetails) payDetails.style.display = 'none'
    else if (transferRem) transferRem.style.display = 'none'
    if (elapsedText_el) elapsedText_el.style.display = 'none'

    // ── Manual service: admin xử lý tay ──
    if (isManualService) {
      waitTitle.textContent = '✅ Thanh toán thành công!'
      waitDesc.innerHTML    = `Đơn <strong>${plan.name}</strong> đã được ghi nhận.<br>
        Admin sẽ xử lý và liên hệ bạn trong thời gian sớm nhất.<br>
        <small style="color:var(--text-secondary)">Kiểm tra trạng thái tại mục Tài khoản.</small>`
      successInfo.style.display = 'block'
      return
    }

    if (data.loginLink) {
      // Có link/nội dung ngay → hiện luôn
      if (isNetflixPlan) {
        waitTitle.textContent = '🎉 Thanh toán & kích hoạt thành công!'
        waitDesc.textContent  = 'Tài khoản Netflix của bạn đã sẵn sàng.'
      } else {
        waitTitle.textContent = '🎉 Thanh toán thành công! Sản phẩm đã sẵn sàng.'
        waitDesc.textContent  = 'Nội dung sản phẩm của bạn bên dưới.'
      }
      const lr = container.querySelector('#loginLinkRow')
      const la = container.querySelector('#loginLinkAnchor')
      if (lr && la) { lr.style.display = 'flex'; la.href = data.loginLink; la.textContent = data.loginLink }
      successInfo.style.display = 'block'
    } else {
      // Thanh toán OK nhưng hệ thống chưa gán (kho đang bổ sung)
      waitTitle.textContent = '✅ Thanh toán thành công!'
      if (isNetflixPlan) {
        waitDesc.innerHTML = 'Hệ thống đang chọn tài khoản phù hợp...<br><small style="color:var(--text-secondary)">Tự động kiểm tra mỗi 15 giây</small>'
      } else {
        waitDesc.innerHTML = 'Hệ thống đang chuẩn bị sản phẩm...<br><small style="color:var(--text-secondary)">Tự động kiểm tra mỗi 15 giây</small>'
      }
      successInfo.style.display = 'block'

      const maxWait = Date.now() + 30 * 60 * 1000

      linkPollTimer = setInterval(async () => {
        if (Date.now() > maxWait) {
          clearInterval(linkPollTimer)
          waitDesc.innerHTML = '⚠️ Chưa có sản phẩm khả dụng. Vui lòng liên hệ admin hoặc kiểm tra tại <a href="#/dashboard">Tài khoản</a>.'
          return
        }
        try {
          const r    = await fetch(`/api/payment-status/${encodeURIComponent(transferContent)}`)
          const info = await r.json()
          if (info.loginLink) {
            clearInterval(linkPollTimer)
            if (isNetflixPlan) {
              waitTitle.textContent = '🎉 Tài khoản Netflix đã sẵn sàng!'
              waitDesc.textContent  = 'Nhấn vào link dưới đây để đăng nhập:'
            } else {
              waitTitle.textContent = '🎉 Sản phẩm đã sẵn sàng!'
              waitDesc.textContent  = 'Nội dung sản phẩm của bạn:'
            }
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

