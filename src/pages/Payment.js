import {
  getPlan, createSubscription, createPayment, getSettings, getCheckoutQuote,
  getWalletBalance, payWithWallet
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

function isManualServicePlan(plan) {
  const service = plan?.service || 'netflix'
  const fulfillment = plan?.fulfillment_type || (service === 'netflix' ? 'netflix' : 'manual')
  return service !== 'netflix' && fulfillment === 'manual'
}

function getManualServiceRequest(container) {
  const note = container.querySelector('#manualServiceNote')?.value?.trim() || ''
  const email = container.querySelector('#manualServiceEmail')?.value?.trim() || ''
  return { customerNote: note, customerContactEmail: email }
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
        vietqr_bank_bin: cfg.vietqr_bank_bin || '970422'
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

  // ── Luôn hiển thị tuỳ chọn Ví TRƯỚC khi tạo subscription qua Bank ──
  if (!savedSession) {
    let walletBalance = 0
    try {
      const wd = await getWalletBalance()
      walletBalance = wd.balance || 0
    } catch (_) {}

    showWalletPayOption(container, plan, planId, walletBalance, checkoutStore?.id ?? null, {
      bankName, bankAccount, bankOwner, vietqrBin, momoNumber, momoName,
      storeSlug: checkoutStore?.slug || '', paymentSource: paymentCfg.source || 'site',
      sellerStoreId: checkoutStore?.id ?? null, sessionKey, transferContent, payOpts
    })
    return
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
            Chuyển khoản theo thông tin trên. Hệ thống tự động kiểm tra giao dịch mỗi 3 giây.<br>
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
                <div class="payment-login-content">
                  <a id="loginLinkAnchor" href="#" target="_blank" rel="noopener" class="payment-login-link"></a>
                  <button type="button" class="btn-copy payment-login-copy" id="loginLinkCopy">Copy</button>
                </div>
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

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => copyFallback(text))
    }
    return copyFallback(text)
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

  const copyButton = container.querySelector('#tcCopy')
  if (copyButton) {
    copyButton.addEventListener('click', () => {
      copyToClipboard(transferContent)
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

  container.addEventListener('click', event => {
    const copyLinkButton = event.target.closest?.('#loginLinkCopy')
    if (!copyLinkButton) return

    const value = copyLinkButton.dataset.copy || container.querySelector('#loginLinkAnchor')?.textContent || ''
    if (!value) return

    copyToClipboard(value)
    copyLinkButton.textContent = 'Đã copy'
    setTimeout(() => {
      copyLinkButton.textContent = 'Copy'
    }, 1800)
  })

  const maxWaitMs = 900_000
  const pollInterval = 3_000
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
      waitTitle.textContent = 'Thanh toán thành công! 🎉'
      const cfg = window.__siteSettings || {}
      const tgLink  = cfg.contact_telegram  || cfg.telegram_link  || ''
      const zaloLink = cfg.contact_zalo     || cfg.zalo_link      || ''
      const tgContactHtml = tgLink
        ? `<a href="${tgLink}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;
                     background:#229ED9;color:#fff;border-radius:10px;font-weight:700;
                     font-size:14px;text-decoration:none;margin:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.95 8.15l-2.02 9.54c-.15.68-.54.84-1.09.52l-3-2.21-1.45 1.39c-.16.16-.29.29-.6.29l.21-3.02 5.51-4.98c.24-.21-.05-.33-.37-.12L5.93 13.6 2.97 12.7c-.66-.21-.67-.66.14-.97l11.64-4.49c.55-.2 1.03.13.86.91z"/></svg>
              Liên hệ Telegram
           </a>`
        : ''
      const zaloContactHtml = zaloLink
        ? `<a href="${zaloLink}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;
                     background:#0068FF;color:#fff;border-radius:10px;font-weight:700;
                     font-size:14px;text-decoration:none;margin:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12"/><path fill="#fff" d="M17 8.5c0-2.49-2.24-4.5-5-4.5S7 6.01 7 8.5c0 1.68.99 3.14 2.5 3.95-.1.37-.33.98-.75 1.55 1.1-.22 1.95-.8 2.48-1.31.26.03.51.05.77.05 2.76 0 5-2.01 5-4.24z"/></svg>
              Liên hệ Zalo
           </a>`
        : ''
      waitDesc.innerHTML = `
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:14px;padding:18px;margin-bottom:16px;">
          <div style="font-size:22px;margin-bottom:8px;">&#127881;</div>
          <strong style="font-size:15px;color:var(--text-primary);">&#272;ơn <em>${plan.name}</em> đã được ghi nhận!</strong><br>
          <span style="font-size:13px;color:var(--text-secondary);">Admin sẽ tiếp nhận và cấp dịch vụ sớm nhất có thể.</span>
        </div>
        <div style="margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px;">&#128172; Liên hệ admin để nhận dịch vụ:</div>
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;">
            ${tgContactHtml}
            ${zaloContactHtml}
            ${!tgContactHtml && !zaloContactHtml ? '<span style="color:var(--text-muted);font-size:13px;">Liên hệ admin qua kênh hỗ trợ của shop</span>' : ''}
          </div>
        </div>
      `
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
      const copy = container.querySelector('#loginLinkCopy')
      if (row && anchor) {
        row.style.display = 'flex'
        anchor.href = data.loginLink
        anchor.textContent = data.loginLink
        if (copy) copy.dataset.copy = data.loginLink
      }
      successInfo.style.display = 'block'
      return
    }

    waitTitle.textContent = 'Thanh toán thành công'
    waitDesc.innerHTML = isNetflixPlan
      ? 'Hệ thống đang chọn tài khoản phù hợp...<br><small style="color:var(--text-secondary)">Tự động kiểm tra mỗi 3 giây</small>'
      : 'Hệ thống đang chuẩn bị sản phẩm...<br><small style="color:var(--text-secondary)">Tự động kiểm tra mỗi 3 giây</small>'
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
        const copy = container.querySelector('#loginLinkCopy')
        if (row && anchor) {
          row.style.display = 'flex'
          anchor.href = info.loginLink
          anchor.textContent = info.loginLink
          if (copy) copy.dataset.copy = info.loginLink
        }
      } catch (_) {}
    }, 3000)
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

/** Hiển thị màn hình chọn phương thức thanh toán khi có đủ số dư ví */
function showWalletPayOption(container, plan, planId, walletBalance, sellerStoreId, opts = {}) {
  const { bankName, bankAccount, bankOwner, vietqrBin, momoNumber, momoName,
          storeSlug, paymentSource, sessionKey, transferContent, payOpts } = opts

  const isEnough = walletBalance >= plan.price
  const user = getUser()
  const needsManualRequest = isManualServicePlan(plan)
  const manualRequestHtml = needsManualRequest ? `
          <div class="manual-service-request">
            <div class="manual-service-request__head">
              <strong>Thông tin để admin xử lý</strong>
              <span>Không bắt buộc</span>
            </div>
            <label class="manual-service-field">
              <span>Email / tài khoản muốn nâng cấp</span>
              <input id="manualServiceEmail" type="email" value="${escapeAttr(user?.email || '')}" placeholder="email@example.com" autocomplete="email">
            </label>
            <label class="manual-service-field">
              <span>Ghi chú cho admin</span>
              <textarea id="manualServiceNote" rows="4" maxlength="2000" placeholder="Ví dụ: Nâng cấp email này, giữ tên kênh, cần gói gia đình, liên hệ qua Telegram @username..."></textarea>
            </label>
          </div>
  ` : ''
  
  container.innerHTML = `
    <section class="payment-section">
      <div class="page-container" style="max-width:560px;margin:0 auto;padding:40px 16px;">
        <div class="payment-card" style="text-align:center;">
          <div style="font-size:42px;margin-bottom:12px;">💳</div>
          <h1 style="font-size:22px;font-weight:800;margin-bottom:6px;">Chọn phương thức thanh toán</h1>
          <p style="color:var(--text-secondary);font-size:14px;margin-bottom:24px;">
            Gói <strong>${plan.name}</strong> — ${formatVND(plan.price)}
          </p>

          ${manualRequestHtml}

          <!-- Wallet option -->
          <div id="walletOption" style="border:2px solid ${isEnough ? '#4F46E5' : 'var(--border)'};border-radius:16px;padding:22px;margin-bottom:16px;transition:background .2s;" ${isEnough ? 'onclick="this.style.background=\'var(--primary-light,#EEF2FF)\'"' : ''}>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="font-size:16px;font-weight:700;color:${isEnough ? '#4F46E5' : 'var(--text-primary)'};">💰 Thanh toán bằng ví</div>
              <span style="font-size:11px;background:${isEnough ? '#4F46E5' : 'var(--text-muted)'};color:#fff;padding:2px 8px;border-radius:99px;font-weight:700;">ƯU TIÊN</span>
            </div>
            <div style="font-size:14px;color:var(--text-secondary);margin-bottom:14px;text-align:left;">
              Số dư hiện có: <strong style="${isEnough ? 'color:#10B981;' : ''}font-size:16px;">${formatVND(walletBalance)}</strong>
              &nbsp;→&nbsp; ${isEnough ? `Còn lại: <strong>${formatVND(walletBalance - plan.price)}</strong>` : `<span style="color:var(--danger)">Thiếu: <strong>${formatVND(plan.price - walletBalance)}</strong></span>`}
            </div>
            ${isEnough 
              ? `<button id="btnWalletPay" class="btn btn-primary" style="width:100%;padding:13px;font-size:16px;font-weight:700;border-radius:10px;">
                  ⚡ Thanh toán ngay ${formatVND(plan.price)}
                 </button>`
              : `<a href="#/wallet" class="btn btn-outline" style="display:block;width:100%;padding:13px;font-size:15px;border-radius:10px;">
                  Nạp thêm tiền vào ví
                 </a>`
            }
          </div>

          <!-- Separator -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;color:var(--text-muted);font-size:13px;">
            <div style="flex:1;height:1px;background:var(--border);"></div>
            hoặc
            <div style="flex:1;height:1px;background:var(--border);"></div>
          </div>

          <!-- Bank option -->
          <button id="btnUseBankTransfer" class="btn btn-outline" style="width:100%;padding:13px;font-size:15px;border-radius:10px;">
            🏦 Chuyển khoản ngân hàng
          </button>

          <div style="margin-top:16px;">
            ${!isEnough ? `<a href="#/wallet" style="font-size:13px;color:var(--primary);">Quản lý ví →</a>` : `<a href="#/wallet" style="font-size:13px;color:var(--primary);">Nạp thêm tiền vào ví →</a>`}
          </div>

          <div id="walletPayMsg" style="display:none;margin-top:16px;padding:12px;border-radius:10px;font-size:14px;"></div>
        </div>
      </div>
    </section>
  `

  // Wallet pay handler
  const btnWallet = container.querySelector('#btnWalletPay')
  if (btnWallet) {
    btnWallet.addEventListener('click', async () => {
      const msg = container.querySelector('#walletPayMsg')
      btnWallet.disabled = true
      btnWallet.textContent = '⏳ Đang xử lý...'
      msg.style.display = 'none'

      try {
        const result = await payWithWallet(planId, sellerStoreId, getManualServiceRequest(container))
        // Clear session nếu có
        if (sessionKey) { try { sessionStorage.removeItem(sessionKey) } catch (_) {} }

        const isManual = !result.login_link && plan.fulfillment_type === 'manual'
        if (result.login_link) {
          container.querySelector('.payment-card').innerHTML = `
            <div style="font-size:56px;margin-bottom:14px;">&#9989;</div>
            <h2 style="font-size:20px;font-weight:800;color:var(--text-primary);margin-bottom:8px;">Thanh toán thành công!</h2>
            <p style="color:var(--text-secondary);margin-bottom:18px;">Tài khoản của bạn đã sẵn sàng.</p>
            <div style="background:var(--bg-muted);border-radius:10px;padding:14px;margin-bottom:20px;word-break:break-all;font-size:14px;">
              <strong>Link / Nội dung:</strong><br>
              <a href="${result.login_link}" target="_blank" style="color:var(--primary);font-weight:600;">${result.login_link}</a>
            </div>
            <div style="display:flex;gap:10px;justify-content:center;">
              <a href="#/dashboard" class="btn btn-primary">Xem đơn hàng</a>
              <a href="#/" class="btn btn-outline">Về trang chủ</a>
            </div>
            <p style="margin-top:14px;font-size:13px;color:var(--text-muted);">Số dư còn lại: ${formatVND(result.balance_after)}</p>
          `
        } else {
          // Manual service OR no link yet — show contact info
          const cfg = window.__siteSettings || {}
          const tgLink   = cfg.contact_telegram || cfg.telegram_link || ''
          const zaloLink = cfg.contact_zalo     || cfg.zalo_link     || ''
          const tgHtml = tgLink
            ? `<a href="${tgLink}" target="_blank" rel="noopener"
                  style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;
                         background:#229ED9;color:#fff;border-radius:10px;font-weight:700;
                         font-size:14px;text-decoration:none;margin:4px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.95 8.15l-2.02 9.54c-.15.68-.54.84-1.09.52l-3-2.21-1.45 1.39c-.16.16-.29.29-.6.29l.21-3.02 5.51-4.98c.24-.21-.05-.33-.37-.12L5.93 13.6 2.97 12.7c-.66-.21-.67-.66.14-.97l11.64-4.49c.55-.2 1.03.13.86.91z"/></svg>
                  Liên hệ Telegram
               </a>` : ''
          const zaloHtml = zaloLink
            ? `<a href="${zaloLink}" target="_blank" rel="noopener"
                  style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;
                         background:#0068FF;color:#fff;border-radius:10px;font-weight:700;
                         font-size:14px;text-decoration:none;margin:4px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12"/><path fill="#fff" d="M17 8.5c0-2.49-2.24-4.5-5-4.5S7 6.01 7 8.5c0 1.68.99 3.14 2.5 3.95-.1.37-.33.98-.75 1.55 1.1-.22 1.95-.8 2.48-1.31.26.03.51.05.77.05 2.76 0 5-2.01 5-4.24z"/></svg>
                  Liên hệ Zalo
               </a>` : ''
          container.querySelector('.payment-card').innerHTML = `
            <div style="font-size:56px;margin-bottom:14px;">&#127881;</div>
            <h2 style="font-size:20px;font-weight:800;color:var(--text-primary);margin-bottom:8px;">Thanh toán thành công!</h2>
            <p style="color:var(--text-secondary);margin-bottom:18px;line-height:1.6;">
              Đơn <strong>${plan.name}</strong> đã được ghi nhận.<br>
              Vui lòng liên hệ admin để nhận dịch vụ:
            </p>
            <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-bottom:20px;">
              ${tgHtml}
              ${zaloHtml}
              ${!tgHtml && !zaloHtml ? '<p style="color:var(--text-muted);font-size:13px;">Liên hệ admin qua kênh hỗ trợ của shop</p>' : ''}
            </div>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Số dư còn lại: ${formatVND(result.balance_after)}</p>
            <div style="display:flex;gap:10px;justify-content:center;">
              <a href="#/dashboard" class="btn btn-primary">Xem đơn hàng</a>
              <a href="#/" class="btn btn-outline">Về trang chủ</a>
            </div>
          `
        }
      } catch (err) {
        btnWallet.disabled = false
        btnWallet.textContent = `⚡ Thanh toán ngay ${formatVND(plan.price)}`
        msg.style.display = 'block'
        msg.style.background = '#FEF2F2'
        msg.style.color = '#DC2626'
        msg.textContent = '❌ ' + (err.message || 'Thanh toán thất bại')
      }
    })
  }

  // Switch to bank transfer
  container.querySelector('#btnUseBankTransfer').addEventListener('click', async () => {
    const user = getUser()
    if (!user) { navigate('/login'); return }
    const manualRequest = getManualServiceRequest(container)
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
    try {
      const subscription = await createSubscription(user.id, planId, {
        ...(payOpts || {}),
        ...manualRequest
      })
      const tc = transferContent || generateTransferContent()
      await createPayment(user.id, subscription.id, plan.price, planId, 'bank', tc, payOpts || {})
      const newSession = {
        transferContent: tc,
        subscriptionId: subscription.id,
        orderCode: subscription.id.replace(/-/g, '').substring(0, 8).toUpperCase()
      }
      if (sessionKey) sessionStorage.setItem(sessionKey, JSON.stringify(newSession))
      showWaitingUI(container, plan, planId, tc, sessionKey, {
        bankName, bankAccount, bankOwner, vietqrBin, momoNumber, momoName,
        orderCode: newSession.orderCode, storeSlug: storeSlug || '',
        paymentSource: paymentSource || 'site', sellerStoreId
      })
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:80px 20px;">
        <p style="color:red;">Lỗi: ${err.message}</p>
        <a href="#/plans" class="btn btn-primary" style="margin-top:12px;">Thử lại</a>
      </div>`
    }
  })
}
