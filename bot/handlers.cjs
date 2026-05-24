'use strict'

const {
  col, getOrCreateBotUser, getNetflixPlans, getPlanById,
  getBankSettings, createBotPayment, checkPaymentStatus,
  getUserSubscriptions, cancelPayment, callServerAPI, getUserActiveSubs,
} = require('./db.cjs')

const {
  STATUS_BADGE, fmtDate, fmtMoney,
  mainMenuKeyboard, planListKeyboard, planDetailKeyboard, paymentKeyboard,
  activeSubsKeyboard, warrantyActionKeyboard,
} = require('./keyboards.cjs')

const POLL_INTERVAL_MS = 15000
const PAYMENT_TIMEOUT_MS = 10 * 60 * 1000

// ── State ──
const userState = new Map()

function setState(chatId, partial) {
  userState.set(chatId, { ...(userState.get(chatId) || { step: 'IDLE' }), ...partial })
}

function clearState(chatId) {
  const st = userState.get(chatId)
  if (st?.pollTimer) clearInterval(st.pollTimer)
  if (st?.timeoutTimer) clearTimeout(st.timeoutTimer)
  userState.set(chatId, { step: 'IDLE' })
}

// ── Poller ──
function startPoller(bot, chatId, transferContent) {
  const pollTimer = setInterval(async () => {
    try {
      const result = await checkPaymentStatus(transferContent)
      if (!result.confirmed) return

      clearState(chatId)
      const plan = await getPlanById(result.planId).catch(() => null)

      if (result.loginLink) {
        await bot.sendMessage(chatId,
          `✅ <b>Thanh toán thành công!</b>\n\n` +
          `📦 Gói: <b>${plan?.name || result.planId}</b>\n` +
          `🔑 Thông tin đăng nhập:\n<code>${result.loginLink}</code>\n` +
          `📅 Hết hạn: <b>${fmtDate(result.endAt)}</b>\n\n` +
          `Gõ /myorders để xem lại.`,
          { parse_mode: 'HTML' }
        )
      } else {
        await bot.sendMessage(chatId,
          `✅ <b>Đã nhận thanh toán!</b>\n` +
          `📦 Gói: <b>${plan?.name || ''}</b>\n\n` +
          `Tài khoản đang được kích hoạt, thông báo ngay khi xong.\n` +
          `Gõ /myorders để theo dõi.`,
          { parse_mode: 'HTML' }
        )
      }
    } catch (err) {
      console.error('[poller]', err.message)
    }
  }, POLL_INTERVAL_MS)

  const timeoutTimer = setTimeout(async () => {
    clearState(chatId)
    await bot.sendMessage(chatId,
      `⏰ <b>Hết thời gian chờ xác nhận.</b>\n\n` +
      `Nếu đã chuyển tiền, liên hệ hỗ trợ kèm nội dung CK.\n` +
      `Gõ /start để tiếp tục.`,
      { parse_mode: 'HTML' }
    )
  }, PAYMENT_TIMEOUT_MS)

  setState(chatId, { pollTimer, timeoutTimer })
}

// ── Handlers ──
async function sendMain(bot, chatId) {
  await bot.sendMessage(chatId,
    '🎬 <b>Netflix Store</b>\n\nChào mừng! Chọn thao tác:',
    { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
  )
}

async function sendPlans(bot, chatId) {
  const plans = await getNetflixPlans()
  if (!plans.length) return bot.sendMessage(chatId, '⚠️ Hiện chưa có gói nào. Thử lại sau.')
  await bot.sendMessage(chatId, '📋 <b>Chọn gói Netflix:</b>', {
    parse_mode: 'HTML',
    reply_markup: planListKeyboard(plans),
  })
}

async function sendPlanDetail(bot, chatId, planId) {
  const plan = await getPlanById(planId)
  if (!plan) return bot.sendMessage(chatId, '❌ Gói không tồn tại.')

  const features = (plan.features || []).map(f => `• ${f}`).join('\n')
  const text = [
    `🎬 <b>${plan.name}</b>`,
    `💰 Giá: <b>${fmtMoney(plan.price)}</b>`,
    `⏱ Thời hạn: <b>${plan.duration_days} ngày</b>`,
    `⚡ <i>Giao tự động ngay sau thanh toán</i>`,
    features ? `\n📌 Tính năng:\n${features}` : '',
  ].filter(Boolean).join('\n')

  await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: planDetailKeyboard(planId),
  })
}

async function sendPaymentInstructions(bot, chatId, tgUser, planId) {
  try {
    const userId = await getOrCreateBotUser(tgUser)
    const bank = await getBankSettings()
    const { subId, transferContent, plan } = await createBotPayment(userId, chatId, String(tgUser.id), planId)

    setState(chatId, { step: 'AWAITING_PAYMENT', subId, transferContent, userId })

    const qrUrl =
      `https://img.vietqr.io/image/${bank.bankName}-${bank.bankAccount}-compact2.png` +
      `?amount=${plan.price}&addInfo=${transferContent}&accountName=${encodeURIComponent(bank.bankOwner)}`

    const text = [
      `💳 <b>Thông tin thanh toán</b>`,
      `📦 Gói: <b>${plan.name}</b> — ${plan.duration_days} ngày`,
      ``,
      `🏦 Ngân hàng: <b>${bank.bankName}</b>`,
      `💳 STK: <code>${bank.bankAccount}</code>`,
      `👤 Chủ TK: <b>${bank.bankOwner}</b>`,
      `💰 Số tiền: <b>${fmtMoney(plan.price)}</b>`,
      `📝 Nội dung CK: <b><code>${transferContent}</code></b>`,
      ``,
      `⚠️ Chuyển <b>ĐÚNG nội dung CK</b> để hệ thống tự xác nhận.`,
      `⏳ Bot kiểm tra mỗi 15 giây, hết hạn sau 10 phút.`,
    ].join('\n')

    const opts = { parse_mode: 'HTML', reply_markup: paymentKeyboard(transferContent) }
    await bot.sendPhoto(chatId, qrUrl, { caption: text, ...opts })
      .catch(() => bot.sendMessage(chatId, text, opts))

    startPoller(bot, chatId, transferContent)
  } catch (err) {
    console.error('[sendPaymentInstructions]', err.message)
    await bot.sendMessage(chatId, `❌ Lỗi tạo đơn: ${err.message}`)
  }
}

async function sendMyOrders(bot, chatId, tgUserId) {
  try {
    const profile = await col('profiles').findOne({ tg_user_id: String(tgUserId) })
    if (!profile) {
      return bot.sendMessage(chatId, '📭 Bạn chưa có đơn nào.', { reply_markup: mainMenuKeyboard() })
    }

    const subs = await getUserSubscriptions(profile.id)
    if (!subs.length) {
      return bot.sendMessage(chatId, '📭 Bạn chưa có đơn nào.', { reply_markup: mainMenuKeyboard() })
    }

    const lines = subs.map((s, i) => {
      const badge = STATUS_BADGE[s.status] || '❓'
      const parts = [`${i + 1}. ${badge} <b>${s.plan_name}</b>`, `   Hết hạn: ${fmtDate(s.end_at)}`]
      if (s.login_link && s.status === 'active') parts.push(`   🔑 <code>${s.login_link}</code>`)
      return parts.join('\n')
    })

    await bot.sendMessage(chatId,
      `📋 <b>Đơn của bạn (${subs.length} gần nhất):</b>\n\n${lines.join('\n\n')}`,
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
    )
  } catch (err) {
    console.error('[sendMyOrders]', err.message)
    await bot.sendMessage(chatId, '❌ Có lỗi xảy ra.')
  }
}

// ── Warranty handlers ──
async function sendWarrantyMenu(bot, chatId, tgUserId) {
  try {
    const profile = await col('profiles').findOne({ tg_user_id: String(tgUserId) })
    if (!profile) {
      return bot.sendMessage(chatId, '📭 Bạn chưa có đơn active nào.', { reply_markup: mainMenuKeyboard() })
    }
    const subs = await getUserActiveSubs(profile.id)
    if (!subs.length) {
      return bot.sendMessage(chatId,
        '📭 Bạn không có đơn nào còn hạn.',
        { reply_markup: mainMenuKeyboard() }
      )
    }
    await bot.sendMessage(chatId,
      '🔧 <b>Bảo hành / Báo lỗi</b>\n\nChọn đơn cần xử lý:',
      { parse_mode: 'HTML', reply_markup: activeSubsKeyboard(subs) }
    )
  } catch (err) {
    console.error('[sendWarrantyMenu]', err.message)
    await bot.sendMessage(chatId, '❌ Có lỗi xảy ra.')
  }
}

async function handleClaimWarranty(bot, chatId, subId, userId) {
  await bot.sendMessage(chatId, '⏳ Đang kiểm tra tài khoản...')
  try {
    const data = await callServerAPI('POST', '/api/claim-warranty', { subscription_id: subId }, userId)
    if (data.login_link) {
      await bot.sendMessage(chatId,
        `✅ <b>Đã đổi tài khoản mới!</b>\n\n🔑 <code>${data.login_link}</code>\n\nGõ /myorders để xem chi tiết.`,
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
      )
    } else {
      await bot.sendMessage(chatId,
        `ℹ️ ${data.message || 'Tài khoản vẫn hoạt động tốt, không cần đổi.'}`,
        { reply_markup: mainMenuKeyboard() }
      )
    }
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Lỗi không xác định'
    await bot.sendMessage(chatId, `❌ ${msg}`, { reply_markup: mainMenuKeyboard() })
  }
}

async function handleReportIssue(bot, chatId, subId, userId) {
  try {
    await callServerAPI('POST', '/api/report-cannot-view', { subscription_id: subId }, userId)
    await bot.sendMessage(chatId,
      `✅ <b>Đã gửi báo cáo!</b>\n\nAdmin sẽ kiểm tra và phản hồi trong vòng 24h.\nGõ /start để quay lại menu.`,
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
    )
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Lỗi không xác định'
    await bot.sendMessage(chatId, `❌ ${msg}`, { reply_markup: mainMenuKeyboard() })
  }
}

// ── Register all bot event listeners ──
function registerHandlers(bot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id)
    clearState(chatId)
    await sendMain(bot, chatId)
  })

  bot.onText(/\/myorders/, async (msg) => {
    await sendMyOrders(bot, String(msg.chat.id), msg.from.id)
  })

  bot.on('callback_query', async (query) => {
    const chatId = String(query.message.chat.id)
    const data = query.data || ''
    await bot.answerCallbackQuery(query.id).catch(() => {})

    if (data === 'noop') return
    if (data === 'cb_home') return sendMain(bot, chatId)
    if (data === 'cb_plans') { clearState(chatId); return sendPlans(bot, chatId) }
    if (data === 'cb_status') return sendMyOrders(bot, chatId, query.from.id)
    if (data === 'cb_warranty_menu') return sendWarrantyMenu(bot, chatId, query.from.id)

    if (data.startsWith('cb_wh_sub_')) {
      const subId = data.slice('cb_wh_sub_'.length)
      const sub = await col('subscriptions').findOne({ id: subId })
      const plan = sub ? await col('plans').findOne({ id: sub.plan }) : null
      const days = sub?.end_at ? Math.ceil((new Date(sub.end_at) - Date.now()) / 86400000) : 0
      return bot.sendMessage(chatId,
        `📦 <b>${plan?.name || subId}</b>\n📅 Còn <b>${days} ngày</b>\n\nChọn thao tác:`,
        { parse_mode: 'HTML', reply_markup: warrantyActionKeyboard(subId) }
      )
    }

    if (data.startsWith('cb_warranty_')) {
      const subId = data.slice('cb_warranty_'.length)
      const profile = await col('profiles').findOne({ tg_user_id: String(query.from.id) })
      if (!profile) return bot.sendMessage(chatId, '❌ Không tìm thấy tài khoản.')
      return handleClaimWarranty(bot, chatId, subId, profile.id)
    }

    if (data.startsWith('cb_report_')) {
      const subId = data.slice('cb_report_'.length)
      const profile = await col('profiles').findOne({ tg_user_id: String(query.from.id) })
      if (!profile) return bot.sendMessage(chatId, '❌ Không tìm thấy tài khoản.')
      return handleReportIssue(bot, chatId, subId, profile.id)
    }

    if (data === 'cb_support') {
      const bank = await getBankSettings()
      const contact = bank.contactTelegram || 'Liên hệ admin để được hỗ trợ.'
      return bot.sendMessage(chatId, `💬 <b>Hỗ trợ</b>\n\n${contact}`, {
        parse_mode: 'HTML', reply_markup: mainMenuKeyboard(),
      })
    }

    if (data.startsWith('cb_plan_')) {
      const planId = data.slice('cb_plan_'.length)
      setState(chatId, { planId })
      return sendPlanDetail(bot, chatId, planId)
    }

    if (data.startsWith('cb_buy_')) {
      const planId = data.slice('cb_buy_'.length)
      setState(chatId, { step: 'CONFIRMING', planId })
      return sendPaymentInstructions(bot, chatId, query.from, planId)
    }

    if (data.startsWith('cb_check_')) {
      const transferContent = data.slice('cb_check_'.length)
      const result = await checkPaymentStatus(transferContent)
      if (!result.confirmed) {
        return bot.sendMessage(chatId, '⏳ Chưa nhận được thanh toán. Thử lại sau khi chuyển khoản.')
      }
      clearState(chatId)
      if (result.loginLink) {
        return bot.sendMessage(chatId,
          `✅ Đã xác nhận!\n🔑 <code>${result.loginLink}</code>\n📅 Hết hạn: ${fmtDate(result.endAt)}`,
          { parse_mode: 'HTML' }
        )
      }
      return bot.sendMessage(chatId, '✅ Đã nhận tiền! Tài khoản đang được kích hoạt.')
    }

    if (data.startsWith('cb_cancel_')) {
      const transferContent = data.slice('cb_cancel_'.length)
      await cancelPayment(transferContent)
      clearState(chatId)
      return bot.sendMessage(chatId, '❌ Đã huỷ đơn.', { reply_markup: mainMenuKeyboard() })
    }
  })

  bot.on('polling_error', (err) => {
    console.error('[Bot polling error]', err.message)
  })
}

module.exports = { registerHandlers }
