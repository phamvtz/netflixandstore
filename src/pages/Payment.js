import {
  getPlan, createSubscription, createPayment, getSettings, getCheckoutQuote
} from '../utils/api.js'
import { getUser } from '../utils/auth.js'
import { formatVND, generateTransferContent, planLabel } from '../utils/format.js'
import { navigate } from '../router.js'
import { getCheckoutStore, clearCheckoutStore } from '../utils/storeContext.js'
import { isPlanHiddenFromStorefront } from '../utils/catalog.js'

async function fetchPaymentStatus(transferContent) {
  const response = await fetch(`/api/payment-status/${encodeURIComponent(transferContent)}`)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || data.message || `Payment status failed (${response.status})`)
  return data
}

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
    container.innerHTML = `
      <div class="page-container" style="text-align:center;padding:100px 20px;">
        <h1>Gói không tồn tại</h1>
        <a href="#/plans" class="btn btn-primary">Xem bảng giá</a>
      </div>
    `
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
      </div>
    `
    return
  }

  const bankName = paymentCfg.bank_name || 'MB Bank'
  const bankAccount = paymentCfg.bank_account || ''
  const bankOwner = paymentCfg.bank_owner || ''
  const momoNumber = paymentCfg.momo_number || ''
  const momoName = paymentCfg.momo_name || ''
  const vietqrBin = paymentCfg.vietqr_bank_bin || '970422'

  const sessionKey = `nf_pay_${user.id}_${planId}_${sellerStoreId || 'main'}`

  let savedSession = null
  try {
    const raw = sessionStorage.getItem(sessionKey)
    if (raw) savedSession = JSON.parse(raw)
  } catch (_) {}

  if (savedSession?.transferContent) {
    try {
      const status = await fetchPaymentStatus(savedSession.transferContent)
      if (status.confirmed) {
        sessionStorage.removeItem(sessionKey)
        showWaitingUI(container, plan, planId, savedSession.transferContent, sessionKey, {
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
      if (status.status === 'not_found') {
        savedSession = null
        sessionStorage.removeItem(sessionKey)
      }
    } catch (_) {
      // Keep the existing transfer content on transient errors so QR/code stay stable.
    }
  }

  const transferContent = savedSession?.transferContent ?? generateTransferContent()

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
      const subscription = await createSubscription(user.id, planId, payOpts)
      await createPayment(user.id, subscription.id, plan.price, planId, 'bank', transferContent, payOpts)
      savedSession = {
        transferContent,
        subscriptionId: subscription.id,
        orderCode: subscription.id.replace(/-/g, '').substring(0, 8).toUpperCase()
      }
      sessionStorage.setItem(sessionKey, JSON.stringify(savedSession))
    } catch (error) {
      container.innerHTML = `
        <div style="text-align:center;padding:80px 20px;">
          <p style="color:red;">Lỗi khởi tạo thanh toán: ${error.message}</p>
          <a href="#/plans" class="btn btn-primary" style="margin-top:12px;">Thử lại</a>
        </div>`
      return
    }
  }

  showWaitingUI(container, plan, planId, transferContent, sessionKey, {
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

function showWaitingUI(container, plan, planId, transferContent, sessionKey, bankInfo = {}) {
  const bankName = bankInfo.bankName || window.__siteSettings?.bank_name || 'MB Bank'
  const bankAccount = bankInfo.bankAccount || window.__siteSettings?.bank_account || '321336'
  const bankOwner = bankInfo.bankOwner || window.__siteSettings?.bank_owner || ''
  const vietqrBin = bankInfo.vietqrBin || '970422'
  const momoNumber = bankInfo.momoNumber || ''
  const momoName = bankInfo.momoName || ''
  const orderCode = bankInfo.orderCode || ''
  const storeSlug = bankInfo.storeSlug || ''
  const paymentSource = bankInfo.paymentSource || 'site'
  const sellerStoreId = bankInfo.sellerStoreId

  const planService = plan.service || 'netflix'
  const planFulfillment = plan.fulfillment_type || (planService === 'netflix' ? 'netflix' : 'manual')
  const isNetflixPlan = planService === 'netflix'
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
              ${sellerStoreId && storeSlug ? `<div style="font-size:13px;color:var(--text-secondary);padding-top:8px;">Gian hàng: <strong>#/s/${storeSlug}</strong>${paymentSource === 'seller' ? ' · Thanh toán về tài khoản đại lý' : ''}</div>` : ''}
            </div>

            <div id="transferReminder" style="background:var(--primary-light);border:1.5px solid rgba(79,70,229,.2);border-radius:12px;text-align:left;padding:16px 20px;margin-bottom:20px;">
              <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">
                Thông tin chuyển khoản
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
                  <button class="btn-copy" id="tcCopy" data-copy="${transferContent}" style="background:none;border:1.5px solid var(--primary);color:var(--primary);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">
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
              <strong>Quan trọng:</strong> Nhập đúng nội dung chuyển khoản <code style="font-family:var(--mono);">${transferContent}</code>. Sau khi chuyển, trang sẽ tự nhận, không cần bấm thêm.
            </div>
          </div>

          <div class="waiting-spinner" id="waitSpinner">
            <div class="spinner" style="margin:0 auto 20px;"></div>
          </div>
          <div id="waitIcon" class="success-icon" style="display:none;font-size:64px;margin-bottom:16px;">✓</div>

          <h2 id="waitTitle" style="font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">
            Đang chờ xác nhận chuyển khoản...
          </h2>
          <p id="waitDesc" style="color:var(--text-secondary);font-size:14px;margin:0 0 24px;line-height:1.7;">
            Chuyển khoản theo thông tin trên. Hệ thống tự động kiểm tra giao dịch khoảng mỗi 10 giây.<br>
            Vui lòng <strong style="color:var(--text-primary);">không tắt trang</strong> sau khi đã chuyển khoản.
          </p>

          <div style="background:var(--bg-muted);border-radius:99px;height:5px;margin-bottom:12px;overflow:hidden;">
            <div id="progressBar" style="height:100%;background:var(--primary);width:0%;transition:width 0.5s ease;border-radius:99px;"></div>
          </div>

          <div id="elapsedText" style="font-size:13px;color:var(--text-muted);margin-bottom:24px;">
            Đã chờ: <span id="elapsedSec">0</span> giây
          </div>

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
              <a href="#/dashboard" class="btn btn-primary btn-lg">Xem đơn hàng</a>
              <a href="#/" class="btn btn-outline btn-lg" style="margin-left:10px;">Về trang chủ</a>
            </div>
          </div>

          <div id="timeoutSection" style="display:none;margin-top:16px;">
            <p style="color:#f59e0b;margin-bottom:12px;">Chưa phát hiện giao dịch sau 15 phút.</p>
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
              Nếu bạn đã chuyển khoản, liên hệ admin để xác nhận thủ công.
            </p>
            <button id="btnRecheck" class="btn btn-primary">Kiểm tra lại</button>
            <a href="#/dashboard" class="btn btn-outline" style="margin-left:10px;">Xem đơn hàng</a>
          </div>
        </div>
      </div>
    </section>
  `

  const copyButton = container.querySelector('#tcCopy')
  if (copyButton) {
    copyButton.addEventListener('click', () => {
      navigator.clipboard.writeText(transferContent)
      copyButton.textContent = 'Đã copy'
      copyButton.style.background = 'var(--secondary)'
      copyButton.style.borderColor = 'var(--secondary)'
      copyButton.style.color = '#fff'
      setTimeout(() => {
        copyButton.textContent = 'Copy'
        copyButton.style.background = 'none'
        copyButton.style.borderColor = 'var(--primary)'
        copyButton.style.color = 'var(--primary)'
      }, 1800)
    })
  }

  const maxWaitMs = 900_000
  const pollInterval = 10_000
  let startTime = Date.now()
  let lastCheckTime = 0
  let polling = true
  let pollTimer = null
  let tickTimer = null

  const progressBar = container.querySelector('#progressBar')
  const elapsedSpan = container.querySelector('#elapsedSec')
  const elapsedText = container.querySelector('#elapsedText')
  const waitTitle = container.querySelector('#waitTitle')
  const waitDesc = container.querySelector('#waitDesc')
  const waitSpinner = container.querySelector('#waitSpinner')
  const waitIcon = container.querySelector('#waitIcon')
  const successInfo = container.querySelector('#successInfo')
  const timeoutSection = container.querySelector('#timeoutSection')

  function updateElapsed() {
    const sec = Math.floor((Date.now() - startTime) / 1000)
    if (elapsedSpan) elapsedSpan.textContent = String(sec)
    if (progressBar) progressBar.style.width = `${Math.min(sec / (maxWaitMs / 1000) * 100, 100)}%`
  }

  function startTick() {
    if (tickTimer) return
    tickTimer = setInterval(updateElapsed, 1000)
  }

  function stopTick() {
    if (!tickTimer) return
    clearInterval(tickTimer)
    tickTimer = null
  }

  function scheduleNextCheck() {
    if (!polling) return
    if (pollTimer) clearTimeout(pollTimer)
    const elapsed = Date.now() - lastCheckTime
    const delay = Math.max(0, pollInterval - elapsed)
    pollTimer = setTimeout(checkStatus, delay)
  }

  let linkPollTimer = null

  function showSuccess(data) {
    if (sessionKey) {
      try { sessionStorage.removeItem(sessionKey) } catch (_) {}
    }
    clearCheckoutStore()

    waitSpinner.style.display = 'none'
    waitIcon.style.display = 'block'
    progressBar.style.width = '100%'
    container.querySelector('#payDetailsWrap')?.style.setProperty('display', 'none')
    if (elapsedText) elapsedText.style.display = 'none'

    if (isManualService) {
      waitTitle.textContent = 'Thanh toán thành công'
      waitDesc.innerHTML = `Đơn <strong>${plan.name}</strong> đã được ghi nhận.<br>
        Admin sẽ xử lý và liên hệ bạn trong thời gian sớm nhất.<br>
        <small style="color:var(--text-secondary)">Kiểm tra trạng thái tại mục Tài khoản.</small>`
      successInfo.style.display = 'block'
      return
    }

    if (data.loginLink) {
      if (isNetflixPlan) {
        waitTitle.textContent = 'Thanh toán và kích hoạt thành công'
        waitDesc.textContent = 'Tài khoản Netflix của bạn đã sẵn sàng.'
      } else {
        waitTitle.textContent = 'Thanh toán thành công'
        waitDesc.textContent = 'Sản phẩm của bạn đã sẵn sàng.'
      }
      const row = container.querySelector('#loginLinkRow')
      const anchor = container.querySelector('#loginLinkAnchor')
      if (row && anchor) {
        row.style.display = 'flex'
        anchor.href = data.loginLink
        anchor.textContent = data.loginLink
      }
      successInfo.style.display = 'block'
      return
    }

    waitTitle.textContent = 'Thanh toán thành công'
    waitDesc.innerHTML = isNetflixPlan
      ? 'Hệ thống đang chọn tài khoản phù hợp...<br><small style="color:var(--text-secondary)">Tự động kiểm tra mỗi 15 giây</small>'
      : 'Hệ thống đang chuẩn bị sản phẩm...<br><small style="color:var(--text-secondary)">Tự động kiểm tra mỗi 15 giây</small>'
    successInfo.style.display = 'block'

    const maxLinkWait = Date.now() + 30 * 60 * 1000
    linkPollTimer = setInterval(async () => {
      if (Date.now() > maxLinkWait) {
        clearInterval(linkPollTimer)
        waitDesc.innerHTML = 'Chưa có sản phẩm khả dụng. Vui lòng liên hệ admin hoặc kiểm tra tại <a href="#/dashboard">Tài khoản</a>.'
        return
      }

      try {
        const info = await fetchPaymentStatus(transferContent)
        if (!info.loginLink) return
        clearInterval(linkPollTimer)

        if (isNetflixPlan) {
          waitTitle.textContent = 'Tài khoản Netflix đã sẵn sàng'
          waitDesc.textContent = 'Nhấn vào link dưới đây để đăng nhập:'
        } else {
          waitTitle.textContent = 'Sản phẩm đã sẵn sàng'
          waitDesc.textContent = 'Nội dung sản phẩm của bạn:'
        }

        const row = container.querySelector('#loginLinkRow')
        const anchor = container.querySelector('#loginLinkAnchor')
        if (row && anchor) {
          row.style.display = 'flex'
          anchor.href = info.loginLink
          anchor.textContent = info.loginLink
        }
      } catch (_) {}
    }, 15000)
  }

  function stopPolling() {
    polling = false
    if (pollTimer) clearTimeout(pollTimer)
    if (linkPollTimer) clearInterval(linkPollTimer)
    pollTimer = null
    linkPollTimer = null
    stopTick()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onWindowFocus)
    window.removeEventListener('pageshow', onPageShow)
  }

  async function checkStatus() {
    if (!polling) return
    lastCheckTime = Date.now()
    updateElapsed()

    if (Date.now() - startTime >= maxWaitMs) {
      stopPolling()
      waitSpinner.style.display = 'none'
      waitTitle.textContent = 'Hết thời gian tự động'
      if (timeoutSection) timeoutSection.style.display = 'block'
      return
    }

    try {
      const data = await fetchPaymentStatus(transferContent)
      if (data.confirmed) {
        stopPolling()
        showSuccess(data)
        return
      }
    } catch (_) {}

    scheduleNextCheck()
  }

  function resumePolling() {
    if (!polling) return
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }

    const overdue = Date.now() - lastCheckTime >= pollInterval
    if (overdue) {
      waitTitle.textContent = 'Đang kiểm tra...'
      checkStatus()
    } else {
      scheduleNextCheck()
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') resumePolling()
  }

  function onPageShow(event) {
    if (event.persisted) resumePolling()
  }

  function onWindowFocus() {
    resumePolling()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onWindowFocus)

  const recheckButton = container.querySelector('#btnRecheck')
  if (recheckButton) {
    recheckButton.addEventListener('click', async () => {
      recheckButton.disabled = true
      recheckButton.textContent = 'Đang kiểm tra...'
      polling = true
      startTime = Date.now()
      lastCheckTime = 0
      timeoutSection.style.display = 'none'
      waitSpinner.style.display = 'block'
      waitTitle.textContent = 'Đang kiểm tra lại...'
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('pageshow', onPageShow)
      window.addEventListener('focus', onWindowFocus)
      startTick()
      await checkStatus()
      recheckButton.disabled = false
      recheckButton.textContent = 'Kiểm tra lại'
    })
  }

  startTick()
  checkStatus()
}
