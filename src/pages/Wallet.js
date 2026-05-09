import { getUser } from '../utils/auth.js'
import { navigate } from '../router.js'
import { formatVND } from '../utils/format.js'
import {
  getWalletBalance, getWalletTransactions,
  createWalletTopup, cancelWalletTopup, getWalletTopupStatus
} from '../utils/api.js'

/* ── Helpers ─────────────────────────────────────────────────── */
const TX_META = {
  topup:        { label: 'Nạp tiền',     icon: '↑', color: 'var(--secondary)', bg: 'rgba(34,197,94,0.12)' },
  spend:        { label: 'Mua gói',      icon: '↓', color: 'var(--danger)',    bg: 'rgba(239,68,68,0.12)' },
  refund:       { label: 'Hoàn tiền',    icon: '↩', color: 'var(--secondary)', bg: 'rgba(34,197,94,0.12)' },
  admin_credit: { label: 'Admin cộng',   icon: '+', color: 'var(--secondary)', bg: 'rgba(34,197,94,0.12)' },
  admin_debit:  { label: 'Admin trừ',    icon: '−', color: 'var(--danger)',    bg: 'rgba(239,68,68,0.12)' },
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function statusBadge(status) {
  const map = {
    pending:   { label: 'Đang xử lý', cls: 'badge-warning' },
    completed: { label: 'Thành công', cls: 'badge-success' },
    failed:    { label: 'Thất bại',   cls: 'badge-danger'  },
    cancelled: { label: 'Đã hủy',     cls: 'badge-muted'   },
  }
  const s = map[status] || { label: status, cls: 'badge-muted' }
  return `<span class="badge ${s.cls}">${s.label}</span>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function cleanBankAccount(value) {
  return String(value || '').replace(/\s+/g, '').trim()
}

/* ── Main render ─────────────────────────────────────────────── */
export async function renderWallet(container) {
  const user = getUser()
  if (!user) { navigate('/login'); return }

  container.innerHTML = `
    <div class="wlt-page page-container">

      <!-- Page header -->
      <div class="wlt-header">
        <div>
          <h1 class="wlt-title">Ví của tôi</h1>
          <p class="wlt-sub">Nạp tiền vào ví để mua gói nhanh hơn, không cần chuyển khoản mỗi lần.</p>
        </div>
      </div>

      <!-- Balance card -->
      <div class="wlt-balance-card" id="balanceCard">
        <div class="wlt-bal-glow"></div>
        <div class="wlt-bal-inner">
          <div class="wlt-bal-left">
            <div class="wlt-bal-label">Số dư ví</div>
            <div class="wlt-bal-amount" id="balanceAmt">
              <span class="wlt-bal-skeleton">Loading…</span>
            </div>
            <div class="wlt-bal-actions">
              <button class="btn btn-primary" id="btnOpenTopup">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nạp tiền
              </button>
              <a href="#/products" class="btn btn-outline">Mua gói ngay</a>
            </div>
          </div>
          <div class="wlt-bal-icon" aria-hidden="true">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"><rect x="1" y="4" width="22" height="16" rx="3"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
        </div>
      </div>

      <!-- Pending topup notice -->
      <div class="wlt-pending" id="pendingWrap" style="display:none">
        <div class="wlt-pending-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Đang chờ xác nhận nạp tiền
        </div>
        <div id="pendingList"></div>
      </div>

      <!-- Topup form -->
      <div class="wlt-form-card" id="topupForm" style="display:none">
        <div class="wlt-form-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Tạo lệnh nạp tiền
        </div>
        <div class="wlt-presets" id="presets">
          ${[50000,100000,200000,500000].map(v => `
            <button class="wlt-preset" data-val="${v}">${formatVND(v)}</button>
          `).join('')}
        </div>
        <div class="wlt-form-row">
          <input id="topupAmt" type="number" min="10000" step="10000"
            placeholder="Hoặc nhập số tiền (VND)" class="input wlt-amt-input" />
          <button id="btnCreateTopup" class="btn btn-primary">Tạo lệnh</button>
        </div>
        <p class="wlt-form-hint">Tối thiểu 10.000₫ · Tối đa 50.000.000₫</p>
      </div>

      <!-- Transfer info -->
      <div class="wlt-transfer-card" id="transferInfo" style="display:none">
        <div class="wlt-transfer-head">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          Thông tin chuyển khoản
        </div>
        <div class="wlt-transfer-body">
          <div id="transferRows" class="wlt-transfer-rows"></div>
          <div id="qrWrap" class="wlt-qr"></div>
        </div>

        <!-- Waiting state -->
        <div id="waitingState" class="wlt-waiting" style="display:none">
          <div class="wlt-waiting-ring">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="wlt-waiting-text">
            <span class="wlt-waiting-title">Đang chờ xác nhận...</span>
            <span class="wlt-waiting-sub">Hệ thống tự động kiểm tra mỗi vài giây</span>
          </div>
          <div class="wlt-waiting-dots">
            <span></span><span></span><span></span>
          </div>
        </div>

        <div class="wlt-transfer-note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Nhập <strong>đúng nội dung</strong> chuyển khoản. Số dư cộng tự động trong vài giây sau khi xác nhận.
        </div>
        <button class="wlt-cancel-btn" id="btnCancelTopup">Hủy lệnh nạp này</button>
      </div>

      <!-- Transaction history -->
      <div class="wlt-history-card">
        <div class="wlt-history-head">
          <span class="wlt-history-title">Lịch sử giao dịch</span>
          <div class="wlt-history-filter">
            <select class="select wlt-filter-sel" id="txFilter">
              <option value="">Tất cả</option>
              <option value="topup">Nạp tiền</option>
              <option value="spend">Mua gói</option>
              <option value="refund">Hoàn tiền</option>
            </select>
          </div>
        </div>
        <div id="txList" class="wlt-tx-list">
          <div class="wlt-loading">
            <div class="spinner"></div>
          </div>
        </div>
      </div>

    </div>
  `

  let currentTopupId = null
  let topupPollTimer = null
  let allTxs = []

  function stopTopupPolling() {
    if (topupPollTimer) clearInterval(topupPollTimer)
    topupPollTimer = null
  }

  /* ── Toast helper ────────────────────────────────────────────── */
  function showWalletToast(msg, type = 'success') {
    const t = document.createElement('div')
    t.className = `wlt-toast wlt-toast--${type}`
    const icon = type === 'success'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    t.innerHTML = `${icon}<span>${msg}</span>`
    document.body.appendChild(t)
    requestAnimationFrame(() => t.classList.add('wlt-toast--in'))
    setTimeout(() => {
      t.classList.remove('wlt-toast--in')
      t.addEventListener('transitionend', () => t.remove(), { once: true })
    }, 3500)
  }

  /* ── Polling waiting state ───────────────────────────────────── */
  function setWaitingState(active) {
    const box = container.querySelector('#waitingState')
    if (!box) return
    box.style.display = active ? 'flex' : 'none'
  }

  function startTopupPolling(transferContent) {
    stopTopupPolling()
    if (!transferContent) return
    setWaitingState(true)
    const tick = async () => {
      try {
        const status = await getWalletTopupStatus(transferContent)
        if (!status.confirmed) return
        stopTopupPolling()
        setWaitingState(false)
        // Show success banner
        const amount = status.amount || status.topup?.amount || ''
        const amtStr = amount ? ' +' + formatVND(Number(amount)) : ''
        showWalletToast(`Nạp tiền thành công!${amtStr} đã vào ví của bạn 🎉`, 'success')
        showSuccessBanner(amount)
        await loadData()
      } catch (_) {}
    }
    tick()
    topupPollTimer = setInterval(tick, 3000)
  }

  function showSuccessBanner(amount) {
    const old = container.querySelector('.wlt-success-banner')
    if (old) old.remove()
    const banner = document.createElement('div')
    banner.className = 'wlt-success-banner'
    banner.innerHTML = `
      <div class="wsb-inner">
        <div class="wsb-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="wsb-text">
          <strong>Nạp tiền thành công!</strong>
          <span>${amount ? formatVND(Number(amount)) + ' đã được cộng vào ví' : 'Số dư đã được cập nhật'}</span>
        </div>
        <button class="wsb-close" aria-label="Đóng">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `
    banner.querySelector('.wsb-close').addEventListener('click', () => banner.remove())
    const histCard = container.querySelector('.wlt-history-card')
    histCard?.parentNode?.insertBefore(banner, histCard)
    requestAnimationFrame(() => banner.classList.add('wsb--in'))
    setTimeout(() => banner.remove(), 8000)
  }

  /* ── Load data ─────────────────────────────────────────────── */
  async function loadData() {
    try {
      const [walletData, txData] = await Promise.all([
        getWalletBalance(),
        getWalletTransactions(100)
      ])

      // Balance
      const bal = walletData.balance || 0
      window.__walletBalance = bal
      container.querySelector('#balanceAmt').innerHTML =
        `<span class="wlt-bal-num">${formatVND(bal)}</span>`

      // Dispatch for navbar
      window.dispatchEvent(new CustomEvent('walletUpdated', { detail: { balance: bal } }))

      // Pending topups
      const pending = walletData.pending_topups || []
      if (pending.length > 0) {
        const pw = container.querySelector('#pendingWrap')
        const pl = container.querySelector('#pendingList')
        pw.style.display = 'block'
        pl.innerHTML = pending.map(t => `
          <div class="wlt-pending-row">
            <div class="wlt-pending-info">
              <span class="wlt-pending-amt">${formatVND(t.amount)}</span>
              <code class="wlt-pending-code">${t.transfer_content}</code>
            </div>
            <span class="badge badge-warning">Đang chờ</span>
          </div>
        `).join('')
        const first = pending[0]
        currentTopupId = first.id
        showTransferInfo(first, walletData)
      } else {
        stopTopupPolling()
        currentTopupId = null
        container.querySelector('#pendingWrap').style.display = 'none'
        container.querySelector('#transferInfo').style.display = 'none'
      }

      // Transactions
      allTxs = txData.transactions || []
      renderTxList(allTxs, '')

    } catch (err) {
      container.querySelector('#balanceAmt').innerHTML =
        `<span style="color:var(--danger);font-size:1.2rem">Lỗi tải dữ liệu</span>`
      console.error('[Wallet]', err)
    }
  }

  function renderTxList(txs, filter) {
    const list = container.querySelector('#txList')
    const filtered = filter ? txs.filter(t => t.type === filter) : txs

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="wlt-empty">
          <div class="wlt-empty-icon">💸</div>
          <p>Chưa có giao dịch nào</p>
          <button class="btn btn-primary" onclick="document.getElementById('btnOpenTopup').click()">Nạp tiền ngay</button>
        </div>
      `
      return
    }

    list.innerHTML = filtered.map(t => {
      const meta  = TX_META[t.type] || { label: t.type, icon: '·', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' }
      const isPos = t.amount > 0
      return `
        <div class="wlt-tx-row">
          <div class="wlt-tx-icon" style="background:${meta.bg};color:${meta.color}">${meta.icon}</div>
          <div class="wlt-tx-info">
            <div class="wlt-tx-label">${meta.label}</div>
            <div class="wlt-tx-meta">${t.note || '—'} · ${fmtDate(t.created_at)}</div>
          </div>
          <div class="wlt-tx-right">
            <div class="wlt-tx-amount" style="color:${isPos ? 'var(--secondary)' : 'var(--danger)'}">
              ${isPos ? '+' : ''}${formatVND(Math.abs(t.amount))}
            </div>
            ${statusBadge(t.status || 'completed')}
          </div>
        </div>
      `
    }).join('')
  }

  /* ── Transfer info card ────────────────────────────────────── */
  function showTransferInfo(topup, bankInfo) {
    const info = container.querySelector('#transferInfo')
    info.style.display = 'block'
    currentTopupId = topup.id

    const siteSettings = window.__siteSettings || {}
    const accountRaw = String(bankInfo?.bank_account || siteSettings.bank_account || '321336').trim()
    const account = cleanBankAccount(accountRaw)
    const owner = String(bankInfo?.bank_owner || siteSettings.bank_owner || 'PHAM VAN VIET').trim()
    const bank = String(bankInfo?.bank_name || siteSettings.bank_name || 'MB Bank').trim()
    const binRaw = String(bankInfo?.vietqr_bank_bin || siteSettings.vietqr_bank_bin || '970422').trim()
    const bin = /^\d{6}$/.test(binRaw) ? binRaw : '970422'
    const qrWrap = container.querySelector('#qrWrap')

    const rows = [
      ['Ngân hàng',    escapeHtml(bank)],
      ['Số tài khoản', accountRaw ? `<strong class="wlt-tf-val">${escapeHtml(accountRaw)}</strong>` : '<span class="wlt-tf-missing">Chưa cấu hình</span>'],
      ['Chủ TK',       owner ? escapeHtml(owner) : '<span class="wlt-tf-missing">Chưa cấu hình</span>'],
      ['Số tiền',      `<strong class="wlt-tf-amt">${formatVND(topup.amount)}</strong>`],
      ['Nội dung CK',  `<code class="wlt-tf-code">${escapeHtml(topup.transfer_content)}</code>`],
    ]
    container.querySelector('#transferRows').innerHTML = rows.map(([l, v]) => `
      <div class="wlt-tf-row">
        <span class="wlt-tf-label">${l}</span>
        <span class="wlt-tf-value">${v}</span>
      </div>
    `).join('')

    qrWrap.style.display = 'flex'
    qrWrap.innerHTML = ''
    startTopupPolling(topup.transfer_content)
    if (account) {
      const qrUrl = `https://img.vietqr.io/image/${bin}-${encodeURIComponent(account)}-compact.jpg?amount=${encodeURIComponent(topup.amount)}&addInfo=${encodeURIComponent(topup.transfer_content)}&accountName=${encodeURIComponent(owner)}`
      qrWrap.innerHTML = `
        <img src="${escapeAttr(qrUrl)}"
          alt="VietQR"
          class="wlt-qr-img"
          loading="lazy" />
        <p class="wlt-qr-hint">Quét QR để nạp nhanh</p>
      `
      qrWrap.querySelector('.wlt-qr-img')?.addEventListener('error', () => {
        qrWrap.innerHTML = '<div class="wlt-qr-empty">Không tải được QR</div>'
      })
    } else {
      qrWrap.innerHTML = '<div class="wlt-qr-empty">Chưa có số tài khoản để tạo QR</div>'
    }
  }

  /* ── Events ─────────────────────────────────────────────────── */
  // Toggle form
  container.querySelector('#btnOpenTopup').addEventListener('click', () => {
    const f = container.querySelector('#topupForm')
    const open = f.style.display === 'none' || !f.style.display
    f.style.display = open ? 'block' : 'none'
    if (open) f.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })

  // Preset buttons
  container.querySelectorAll('.wlt-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelector('#topupAmt').value = btn.dataset.val
      container.querySelectorAll('.wlt-preset').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  // Create topup
  container.querySelector('#btnCreateTopup').addEventListener('click', async () => {
    const btn = container.querySelector('#btnCreateTopup')
    const amt = parseInt(container.querySelector('#topupAmt').value)
    if (!amt || amt < 10000) {
      showWalletToast('Vui lòng nhập số tiền tối thiểu 10.000₫', 'error')
      container.querySelector('#topupAmt').focus()
      return
    }
    btn.disabled = true
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> Đang tạo…'
    try {
      const data = await createWalletTopup(amt)
      container.querySelector('#topupForm').style.display = 'none'
      showTransferInfo(data.topup, data)
    } catch (err) {
      showWalletToast('Lỗi: ' + (err.message || 'Không thể tạo lệnh'), 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Tạo lệnh'
    }
  })

  // Cancel topup
  container.querySelector('#btnCancelTopup').addEventListener('click', async () => {
    if (!currentTopupId) return
    const cancelBtn = container.querySelector('#btnCancelTopup')
    if (!confirm('Hủy lệnh nạp tiền này?')) return
    cancelBtn.disabled = true
    cancelBtn.textContent = 'Đang hủy...'
    try {
      await cancelWalletTopup(currentTopupId)
      container.querySelector('#transferInfo').style.display = 'none'
      container.querySelector('#pendingWrap').style.display = 'none'
      stopTopupPolling()
      currentTopupId = null
      showWalletToast('Đã hủy lệnh nạp tiền', 'error')
    } catch (err) {
      showWalletToast('Lỗi: ' + err.message, 'error')
    } finally {
      cancelBtn.disabled = false
      cancelBtn.textContent = 'Hủy lệnh nạp này'
    }
  })

  // Filter
  container.querySelector('#txFilter').addEventListener('change', e => {
    renderTxList(allTxs, e.target.value)
  })

  loadData()
  return () => stopTopupPolling()
}
