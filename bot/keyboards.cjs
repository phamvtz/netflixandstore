'use strict'

const STATUS_BADGE = { active: '✅', pending: '⏳', processing: '🔄', expired: '❌', cancelled: '🚫' }

function fmtDate(d) {
  if (!d) return 'N/A'
  return new Date(d).toLocaleDateString('vi-VN')
}

function fmtMoney(n) {
  return Number(n).toLocaleString('vi-VN') + '₫'
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎬 Mua Netflix', callback_data: 'cb_plans' }],
      [{ text: '📋 Đơn của tôi', callback_data: 'cb_status' }],
      [{ text: '🔧 Bảo hành / Báo lỗi', callback_data: 'cb_warranty_menu' }],
      [{ text: '💬 Hỗ trợ', callback_data: 'cb_support' }],
    ],
  }
}

function activeSubsKeyboard(subs) {
  if (!subs.length) return null
  const rows = subs.map(s => {
    const days = Math.ceil((new Date(s.end_at) - Date.now()) / 86400000)
    return [{ text: `📦 ${s.plan_name} — còn ${days} ngày`, callback_data: `cb_wh_sub_${s.id}` }]
  })
  rows.push([{ text: '🔙 Quay lại', callback_data: 'cb_home' }])
  return { inline_keyboard: rows }
}

function warrantyActionKeyboard(subId) {
  return {
    inline_keyboard: [
      [{ text: '🔄 Đổi tài khoản (bảo hành)', callback_data: `cb_warranty_${subId}` }],
      [{ text: '📋 Báo không xem được', callback_data: `cb_report_${subId}` }],
      [{ text: '🔙 Danh sách đơn', callback_data: 'cb_warranty_menu' }],
    ],
  }
}

function planIcon(days) {
  if (days <= 1) return '⚡'
  if (days <= 30) return '🌟'
  if (days <= 180) return '💫'
  return '🏆'
}

function planListKeyboard(plans) {
  const rows = plans.map(p => ([{
    text: `${planIcon(p.duration_days)} ${p.name}  ·  ${fmtMoney(p.price)}`,
    callback_data: `cb_plan_${p.id}`,
  }]))
  rows.push([{ text: '🏠 Menu chính', callback_data: 'cb_home' }])
  return { inline_keyboard: rows }
}

function planDetailKeyboard(planId) {
  return {
    inline_keyboard: [
      [{ text: '🛒 Mua ngay — Thanh toán ngay', callback_data: `cb_buy_${planId}` }],
      [{ text: '◀️ Xem gói khác', callback_data: 'cb_plans' }],
    ],
  }
}

function paymentKeyboard(transferContent) {
  return {
    inline_keyboard: [
      [{ text: '🔄 Kiểm tra thanh toán', callback_data: `cb_check_${transferContent}` }],
      [{ text: '✖️ Huỷ đơn', callback_data: `cb_cancel_${transferContent}` }],
    ],
  }
}

module.exports = { STATUS_BADGE, fmtDate, fmtMoney, mainMenuKeyboard, planListKeyboard, planDetailKeyboard, paymentKeyboard, activeSubsKeyboard, warrantyActionKeyboard }
