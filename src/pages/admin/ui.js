/**
 * admin/ui.js — Pure HTML generator functions for admin UI
 * Vietnamese Netflix Store Admin Panel
 * No DOM manipulation (except modals), no framework imports.
 */

// ── String helpers ───────────────────────────────────────────────────────────

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function attr(v) {
  return esc(v).replace(/"/g, '&quot;')
}

export function shortText(v, n = 48) {
  const s = String(v || '')
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_MAP = {
  active:    { label: 'Hoạt động',    cls: 'status-active'    },
  pending:   { label: 'Chờ xử lý',   cls: 'status-pending'   },
  expired:   { label: 'Hết hạn',     cls: 'status-expired'   },
  cancelled: { label: 'Đã huỷ',      cls: 'status-cancelled' },
  success:   { label: 'Thành công',  cls: 'status-success'   },
  fail:      { label: 'Thất bại',    cls: 'status-fail'      },
  dead:      { label: 'Hỏng',        cls: 'status-dead'      },
  available: { label: 'Còn trống',   cls: 'status-available' },
  full:      { label: 'Đầy',         cls: 'status-full'      },
  assigned:  { label: 'Đã gán',      cls: 'status-active'    },
  open:      { label: 'Mở',          cls: 'status-open'      },
  resolved:  { label: 'Đã giải quyết', cls: 'status-resolved' },
  rejected:  { label: 'Từ chối',     cls: 'status-rejected'  },
}

export function badge(status) {
  const s = String(status || '').toLowerCase()
  const entry = STATUS_MAP[s] || { label: esc(status) || 'Không rõ', cls: '' }
  return `<span class="status-badge ${entry.cls}">${entry.label}</span>`
}

// ── Spinner ──────────────────────────────────────────────────────────────────

export function spinner(text = 'Đang tải...') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 0;gap:12px;">
      <div style="width:32px;height:32px;border:3px solid rgba(148,163,184,0.2);border-top-color:#0A84FF;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <span class="admin-v2-muted" style="font-size:13px;">${esc(text)}</span>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `.trim()
}

// ── Empty & error states ─────────────────────────────────────────────────────

export function emptyBox(title = 'Không có dữ liệu', msg = '', action = '') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 24px;gap:8px;text-align:center;">
      <div style="font-size:36px;margin-bottom:4px;">📭</div>
      <div style="font-size:15px;font-weight:700;color:#f8fafc;">${esc(title)}</div>
      ${msg ? `<div class="admin-v2-muted" style="font-size:13px;max-width:320px;">${esc(msg)}</div>` : ''}
      ${action ? `<div style="margin-top:12px;">${action}</div>` : ''}
    </div>
  `.trim()
}

export function errorBox(msg, retryAction = '') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 24px;gap:8px;text-align:center;">
      <div style="font-size:36px;margin-bottom:4px;">⚠️</div>
      <div style="font-size:15px;font-weight:700;color:#ef4444;">Có lỗi xảy ra</div>
      <div class="admin-v2-muted" style="font-size:13px;max-width:360px;">${esc(msg)}</div>
      ${retryAction ? `<div style="margin-top:12px;">${retryAction}</div>` : ''}
    </div>
  `.trim()
}

// ── Metric card ──────────────────────────────────────────────────────────────

const TONE_ICONS = {
  blue:   '📊',
  green:  '✅',
  amber:  '⏳',
  violet: '🔵',
  red:    '❌',
}

export function metric(label, value, tone = 'blue', icon = '') {
  const ic = icon || TONE_ICONS[tone] || '📊'
  return `
    <div class="admin-v2-metric admin-v2-metric--${attr(tone)}">
      <div class="admin-v2-metric-icon">${ic}</div>
      <div class="admin-v2-metric-body">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">${esc(label)}</div>
        <div style="font-size:22px;font-weight:800;color:#f8fafc;line-height:1.2;">${esc(String(value))}</div>
      </div>
    </div>
  `.trim()
}

// ── Panel header ─────────────────────────────────────────────────────────────

export function panelHeader(title, subtitle = '', extra = '') {
  return `
    <div class="admin-v2-panel-header">
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:800;color:#f8fafc;">${esc(title)}</div>
        ${subtitle ? `<div class="admin-v2-muted" style="font-size:12px;margin-top:2px;">${esc(subtitle)}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
        ${extra}
        <button class="btn btn-sm btn-outline" data-action="refresh">Làm mới</button>
      </div>
    </div>
  `.trim()
}

// ── Table ────────────────────────────────────────────────────────────────────

export function table(headers, rows, opts = {}) {
  const { id = '', emptyText = 'Không có dữ liệu', rowAttrs } = opts
  const idAttr = id ? ` id="${attr(id)}"` : ''

  const thead = `
    <thead>
      <tr>
        ${headers.map(h => `<th>${esc(h)}</th>`).join('')}
      </tr>
    </thead>
  `.trim()

  let tbody
  if (!rows || rows.length === 0) {
    tbody = `
      <tbody>
        <tr>
          <td colspan="${headers.length}" class="admin-v2-empty-cell">${esc(emptyText)}</td>
        </tr>
      </tbody>
    `.trim()
  } else {
    const trRows = rows.map(cells => {
      const extra = typeof rowAttrs === 'function' ? rowAttrs(cells) : ''
      const tds = cells.map(cell => `<td>${cell}</td>`).join('')
      return `<tr ${extra}>${tds}</tr>`
    }).join('\n')
    tbody = `<tbody>${trRows}</tbody>`
  }

  return `
    <div class="admin-v2-table-wrap">
      <table class="admin-v2-table"${idAttr}>
        ${thead}
        ${tbody}
      </table>
    </div>
  `.trim()
}

// ── Pagination bar ────────────────────────────────────────────────────────────

export function pagination(page, totalItems, pageSize = 25) {
  if (!totalItems || totalItems <= pageSize) return ''

  const totalPages = Math.ceil(totalItems / pageSize)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)
  const isFirst = page <= 1
  const isLast = page >= totalPages

  const pageSizeOptions = [25, 50, 100]
    .map(n => `<option value="${n}"${n === pageSize ? ' selected' : ''}>${n}</option>`)
    .join('')

  return `
    <div class="admin-v2-pagination">
      <div class="admin-v2-pagination-info">
        Hiển thị <strong>${from}–${to}</strong> / ${totalItems} kết quả
      </div>
      <div class="admin-v2-pagination-controls">
        <span style="font-size:12px;color:#64748b;">Hiển thị:</span>
        <select class="btn btn-sm btn-outline" data-page-size style="padding:2px 6px;font-size:12px;">
          ${pageSizeOptions}
        </select>
        <button class="btn btn-sm btn-outline" data-page="prev"${isFirst ? ' disabled' : ''}>
          ← Trước
        </button>
        <span style="font-size:12px;white-space:nowrap;">${page} / ${totalPages}</span>
        <button class="btn btn-sm btn-outline" data-page="next"${isLast ? ' disabled' : ''}>
          Sau →
        </button>
      </div>
    </div>
  `.trim()
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

export function toolbar(tableId, controls) {
  const tableAttr = attr(tableId)
  const items = (controls || []).map(ctrl => {
    const kind = ctrl[0]
    if (kind === 'search') {
      const placeholder = ctrl[1] || 'Tìm kiếm...'
      return `
        <input
          type="search"
          class="btn btn-sm btn-outline"
          placeholder="${attr(placeholder)}"
          data-filter-table="${tableAttr}"
          data-filter-kind="search"
          style="min-width:200px;padding:4px 10px;font-size:13px;"
        />
      `.trim()
    }
    if (kind === 'select') {
      const label = ctrl[1] || ''
      const options = ctrl.slice(2).map(([val, text]) =>
        `<option value="${attr(val)}">${esc(text)}</option>`
      ).join('')
      return `
        <select
          class="btn btn-sm btn-outline"
          data-filter-table="${tableAttr}"
          data-filter-kind="select"
          style="padding:4px 8px;font-size:13px;"
          title="${attr(label)}"
        >
          <option value="">${esc(label)}</option>
          ${options}
        </select>
      `.trim()
    }
    return ''
  }).join('\n')

  return `
    <div class="admin-v2-panel-block">
      <div class="admin-v2-toolbar">
        ${items}
      </div>
    </div>
  `.trim()
}

// ── Form field ────────────────────────────────────────────────────────────────

export function field(key, label, value = '', placeholder = '', type = 'text') {
  const keyAttr = attr(key)
  const valAttr = attr(value)
  const phAttr  = attr(placeholder)

  const input = type === 'textarea'
    ? `<textarea
          data-setting-key="${keyAttr}"
          placeholder="${phAttr}"
          style="resize:vertical;min-height:80px;"
        >${esc(value)}</textarea>`
    : `<input
          type="${attr(type)}"
          value="${valAttr}"
          placeholder="${phAttr}"
          data-setting-key="${keyAttr}"
        />`

  return `
    <label class="admin-v2-field">
      <span>${esc(label)}</span>
      ${input}
    </label>
  `.trim()
}

// ── Code badge ────────────────────────────────────────────────────────────────

export function codeId(value) {
  const cleaned = String(value || '').replace(/-/g, '').toUpperCase().slice(0, 8)
  return `<code style="font-family:monospace;font-size:12px;letter-spacing:0.04em;">${esc(cleaned)}</code>`
}

// ── Modal helpers (writes to DOM) ─────────────────────────────────────────────

const OVERLAY_STYLE = [
  'position:fixed',
  'inset:0',
  'background:rgba(0,0,0,0.7)',
  'z-index:9000',
  'display:flex',
  'align-items:center',
  'justify-content:center',
].join(';')

const MODAL_STYLE = [
  'background:#0f172a',
  'border:1px solid rgba(148,163,184,0.2)',
  'border-radius:12px',
  'padding:24px',
  'min-width:360px',
  'max-width:540px',
  'width:100%',
  'box-shadow:0 24px 80px rgba(0,0,0,0.6)',
  'box-sizing:border-box',
].join(';')

const MODAL_WIDE_STYLE = [
  'background:#0f172a',
  'border:1px solid rgba(148,163,184,0.2)',
  'border-radius:12px',
  'padding:24px',
  'min-width:360px',
  'max-width:760px',
  'width:100%',
  'box-shadow:0 24px 80px rgba(0,0,0,0.6)',
  'box-sizing:border-box',
].join(';')

const HEAD_STYLE = [
  'display:flex',
  'justify-content:space-between',
  'align-items:center',
  'margin-bottom:16px',
  'padding-bottom:12px',
  'border-bottom:1px solid rgba(148,163,184,0.12)',
].join(';')

const TITLE_STYLE = [
  'font-size:16px',
  'font-weight:800',
  'color:#f8fafc',
  'margin:0',
].join(';')

const CLOSE_BTN_STYLE = [
  'background:none',
  'border:none',
  'color:#64748b',
  'font-size:20px',
  'cursor:pointer',
  'padding:0 4px',
  'line-height:1',
].join(';')

const BODY_STYLE = [
  'color:#94a3b8',
  'font-size:14px',
  'line-height:1.6',
  'margin-bottom:20px',
].join(';')

const FOOT_STYLE = [
  'display:flex',
  'gap:8px',
  'justify-content:flex-end',
].join(';')

export function closeModal(container) {
  const el = container && container.querySelector('.admin-v2-modal-overlay')
  if (el) el.remove()
}

export function showConfirmModal(container, {
  title = 'Xác nhận',
  body = '',
  confirmLabel = 'Xác nhận',
  danger = false,
  onConfirm,
} = {}) {
  closeModal(container)

  const overlay = document.createElement('div')
  overlay.className = 'admin-v2-modal-overlay'
  overlay.setAttribute('style', OVERLAY_STYLE)

  const confirmBtnCls = danger ? 'btn btn-danger' : 'btn btn-primary'

  overlay.innerHTML = `
    <div class="admin-v2-modal" style="${MODAL_STYLE}">
      <div class="admin-v2-modal-head" style="${HEAD_STYLE}">
        <h3 class="admin-v2-modal-title" style="${TITLE_STYLE}">${esc(title)}</h3>
        <button class="admin-v2-modal-close js-modal-close" style="${CLOSE_BTN_STYLE}" aria-label="Đóng">×</button>
      </div>
      <div class="admin-v2-modal-body" style="${BODY_STYLE}">${body}</div>
      <div class="admin-v2-modal-foot" style="${FOOT_STYLE}">
        <button class="btn btn-outline js-modal-close">Huỷ</button>
        <button class="btn ${confirmBtnCls} js-modal-confirm">${esc(confirmLabel)}</button>
      </div>
    </div>
  `.trim()

  const doClose = () => overlay.remove()

  overlay.addEventListener('click', e => {
    if (e.target === overlay) doClose()
  })

  overlay.querySelectorAll('.js-modal-close').forEach(btn => {
    btn.addEventListener('click', doClose)
  })

  const confirmBtn = overlay.querySelector('.js-modal-confirm')
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (typeof onConfirm === 'function') onConfirm()
      doClose()
    })
  }

  container.appendChild(overlay)
}

export function showInputModal(container, {
  title = 'Nhập thông tin',
  label = '',
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Xác nhận',
  onConfirm,
} = {}) {
  closeModal(container)

  const overlay = document.createElement('div')
  overlay.className = 'admin-v2-modal-overlay'
  overlay.setAttribute('style', OVERLAY_STYLE)

  overlay.innerHTML = `
    <div class="admin-v2-modal" style="${MODAL_STYLE}">
      <div class="admin-v2-modal-head" style="${HEAD_STYLE}">
        <h3 class="admin-v2-modal-title" style="${TITLE_STYLE}">${esc(title)}</h3>
        <button class="admin-v2-modal-close js-modal-close" style="${CLOSE_BTN_STYLE}" aria-label="Đóng">×</button>
      </div>
      <div class="admin-v2-modal-body" style="${BODY_STYLE}">
        ${label ? `<label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:#94a3b8;">${esc(label)}</label>` : ''}
        <input
          class="js-modal-input"
          type="text"
          value="${attr(defaultValue)}"
          placeholder="${attr(placeholder)}"
          style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid rgba(148,163,184,0.2);border-radius:6px;padding:8px 10px;color:#f8fafc;font-size:14px;outline:none;"
        />
      </div>
      <div class="admin-v2-modal-foot" style="${FOOT_STYLE}">
        <button class="btn btn-outline js-modal-close">Huỷ</button>
        <button class="btn btn-primary js-modal-confirm">${esc(confirmLabel)}</button>
      </div>
    </div>
  `.trim()

  const doClose = () => overlay.remove()

  overlay.addEventListener('click', e => { if (e.target === overlay) doClose() })
  overlay.querySelectorAll('.js-modal-close').forEach(btn => btn.addEventListener('click', doClose))

  const input = overlay.querySelector('.js-modal-input')
  const confirmBtn = overlay.querySelector('.js-modal-confirm')
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (typeof onConfirm === 'function') onConfirm(input?.value || '')
      doClose()
    })
  }
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmBtn?.click()
      if (e.key === 'Escape') doClose()
    })
  }

  container.appendChild(overlay)
  setTimeout(() => input?.focus(), 50)
}

export function showFormModal(container, {
  title = 'Chỉnh sửa',
  bodyHtml = '',
  confirmLabel = 'Lưu',
  onConfirm,
  onClose,
} = {}) {
  closeModal(container)

  const overlay = document.createElement('div')
  overlay.className = 'admin-v2-modal-overlay'
  overlay.setAttribute('style', OVERLAY_STYLE)

  overlay.innerHTML = `
    <div class="admin-v2-modal admin-v2-modal--wide" style="${MODAL_WIDE_STYLE}">
      <div class="admin-v2-modal-head" style="${HEAD_STYLE}">
        <h3 class="admin-v2-modal-title" style="${TITLE_STYLE}">${esc(title)}</h3>
        <button class="admin-v2-modal-close js-modal-close" style="${CLOSE_BTN_STYLE}" aria-label="Đóng">×</button>
      </div>
      <div class="admin-v2-modal-body" style="${BODY_STYLE};margin-bottom:0">${bodyHtml}</div>
      <div class="admin-v2-modal-foot" style="${FOOT_STYLE};margin-top:20px;padding-top:16px;border-top:1px solid rgba(148,163,184,0.12)">
        <p class="js-modal-err" style="color:#ef4444;font-size:13px;margin:0;flex:1;display:none;"></p>
        <button class="btn btn-outline js-modal-close">Huỷ</button>
        <button class="btn btn-primary js-modal-confirm">${esc(confirmLabel)}</button>
      </div>
    </div>
  `.trim()

  const doClose = () => { overlay.remove(); onClose?.() }

  overlay.addEventListener('click', e => { if (e.target === overlay) doClose() })
  overlay.querySelectorAll('.js-modal-close').forEach(btn => btn.addEventListener('click', doClose))

  const confirmBtn = overlay.querySelector('.js-modal-confirm')
  const errEl      = overlay.querySelector('.js-modal-err')

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (typeof onConfirm !== 'function') return
      // Loading state
      confirmBtn.disabled = true
      const origLabel = confirmBtn.textContent
      confirmBtn.textContent = '⏳ Đang xử lý...'
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = '' }

      try {
        await onConfirm(overlay)
        doClose() // chỉ đóng khi thành công
      } catch (err) {
        // Giữ modal mở, hiện lỗi
        if (errEl) {
          errEl.textContent = '❌ ' + (err.message || 'Có lỗi xảy ra, thử lại.')
          errEl.style.display = 'block'
        }
        confirmBtn.disabled = false
        confirmBtn.textContent = origLabel
      }
    })
  }

  container.appendChild(overlay)
}


export function showDetailModal(container, {
  title = '',
  body = '',
  wide = false,
} = {}) {
  closeModal(container)

  const overlay = document.createElement('div')
  overlay.className = 'admin-v2-modal-overlay'
  overlay.setAttribute('style', OVERLAY_STYLE)

  const modalStyle = wide ? MODAL_WIDE_STYLE : MODAL_STYLE
  const wideCls = wide ? ' admin-v2-modal--wide' : ''

  overlay.innerHTML = `
    <div class="admin-v2-modal${wideCls}" style="${modalStyle}">
      <div class="admin-v2-modal-head" style="${HEAD_STYLE}">
        <h3 class="admin-v2-modal-title" style="${TITLE_STYLE}">${esc(title)}</h3>
        <button class="admin-v2-modal-close js-modal-close" style="${CLOSE_BTN_STYLE}" aria-label="Đóng">×</button>
      </div>
      <div class="admin-v2-modal-body" style="${BODY_STYLE}">${body}</div>
      <div class="admin-v2-modal-foot" style="${FOOT_STYLE}">
        <button class="btn btn-outline js-modal-close">Đóng</button>
      </div>
    </div>
  `.trim()

  const doClose = () => overlay.remove()

  overlay.addEventListener('click', e => {
    if (e.target === overlay) doClose()
  })

  overlay.querySelectorAll('.js-modal-close').forEach(btn => {
    btn.addEventListener('click', doClose)
  })

  container.appendChild(overlay)
}
