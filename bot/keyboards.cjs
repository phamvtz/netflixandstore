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
      [{ text: '💬 Hỗ trợ', callback_data: 'cb_support' }],
    ],
  }
}

function planListKeyboard(plans) {
  const rows = plans.map(p => ([{
    text: `${p.name}  —  ${fmtMoney(p.price)}`,
    callback_data: `cb_plan_${p.id}`,
  }]))
  rows.push([{ text: '🔙 Quay lại', callback_data: 'cb_home' }])
  return { inline_keyboard: rows }
}

function planDetailKeyboard(planId) {
  return {
    inline_keyboard: [
      [{ text: '🛒 Mua ngay', callback_data: `cb_buy_${planId}` }],
      [{ text: '🔙 Danh sách gói', callback_data: 'cb_plans' }],
    ],
  }
}

function paymentKeyboard(transferContent) {
  return {
    inline_keyboard: [
      [{ text: '✅ Kiểm tra thanh toán', callback_data: `cb_check_${transferContent}` }],
      [{ text: '❌ Huỷ đơn', callback_data: `cb_cancel_${transferContent}` }],
    ],
  }
}

module.exports = { STATUS_BADGE, fmtDate, fmtMoney, mainMenuKeyboard, planListKeyboard, planDetailKeyboard, paymentKeyboard }
