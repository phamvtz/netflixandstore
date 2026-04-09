export function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + '₫'
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}


export function statusLabel(status) {
  const map = {
    active:    '✅ Hoạt động',
    pending:   '⏳ Chờ xử lý',
    expired:   '❌ Hết hạn',
    cancelled: '🚫 Đã hủy',
    success:   '✅ Thành công',
    fail:      '❌ Thất bại',
    failed:    '❌ Thất bại',  // alias
    dead:      '💀 Đã chết',
    full:      '🔵 Đầy slot',
  }
  return map[status] || status || '—'
}

export function statusClass(status) {
  const map = {
    active:    'status-active',
    pending:   'status-pending',
    expired:   'status-expired',
    cancelled: 'status-expired',
    success:   'status-active',
    fail:      'status-expired',
    failed:    'status-expired',
    dead:      'status-expired',
    full:      'status-pending',
  }
  return map[status] || ''
}

export function daysLeft(endAt) {
  if (!endAt) return null
  const diff = new Date(endAt) - new Date()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function planLabel(planId) {
  const map = {
    day: '1 Ngày',
    month: '1 Tháng',
    quarter: '3 Tháng',
    half_year: '6 Tháng',
    year: '1 Năm',
  }
  return map[planId] || planId
}

export function generateTransferContent() {
  const chars = 'abcdef0123456789'
  let result = 'SEVQR '
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Parse account string — supports 3 formats:
 *   1. email:pass:cookie   (has @ and 2+ colons before cookie part)
 *   2. email:pass          (has @ and 1 colon, no cookie)
 *   3. cookie_string_only  (no @ sign — raw Netflix cookie)
 */
export function parseAccount(value) {
  if (!value) return { email: '', password: '', cookie: '', raw: '' }
  const raw = value.trim()

  // Chuẩn hoá TAB → dấu hai chấm trước khi parse
  // (phòng trường hợp dữ liệu cũ lưu dạng tab-separated)
  let normalized = raw
  if (raw.includes('\t')) {
    const parts = raw.split('\t').map(p => p.trim()).filter(Boolean)
    if (parts.length >= 3) normalized = `${parts[0]}:${parts[1]}:${parts[2]}`
    else if (parts.length === 2) normalized = `${parts[0]}:${parts[1]}`
    else normalized = parts[0] || raw
  }

  // If it contains '@', it's email-based format
  if (normalized.includes('@')) {
    const firstColon = normalized.indexOf(':')
    if (firstColon === -1) return { email: normalized, password: '', cookie: '', raw }

    const secondColon = normalized.indexOf(':', firstColon + 1)
    if (secondColon === -1) {
      return { email: normalized.substring(0, firstColon), password: normalized.substring(firstColon + 1), cookie: '', raw }
    }
    return {
      email:    normalized.substring(0, firstColon),
      password: normalized.substring(firstColon + 1, secondColon),
      cookie:   normalized.substring(secondColon + 1),
      raw
    }
  }

  // No @ → pure cookie string
  return { email: '', password: '', cookie: normalized, raw }
}

export function maskPassword(pass) {
  if (!pass) return '••••••••'
  return '•'.repeat(Math.min(pass.length, 14))
}

export function shortCookie(cookie, len = 50) {
  if (!cookie) return '—'
  return cookie.length > len ? cookie.substring(0, len) + '…' : cookie
}
