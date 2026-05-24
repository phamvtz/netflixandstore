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
          [
            `🎉 <b>THANH TOÁN THÀNH CÔNG!</b>`,
            DIV,
            `📦 Gói: <b>${plan?.name || result.planId}</b>`,
            `📅 Hết hạn: <b>${fmtDate(result.endAt)}</b>`,
            DIV,
            `🔑 <b>Thông tin đăng nhập:</b>`,
            `<code>${result.loginLink}</code>`,
            DIV,
            `<i>Nhấn vào thông tin để copy. Lưu lại cẩn thận!</i>`,
          ].join('\n'),
          { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
        )
      } else {
        await bot.sendMessage(chatId,
          [
            `✅ <b>ĐÃ NHẬN THANH TOÁN</b>`,
            DIV,
            `Tài khoản đang được kích hoạt.`,
            `Bạn sẽ nhận thông báo ngay khi xong.`,
          ].join('\n'),
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
const DIV = '─────────────────────'

function planIcon(days) {
  if (days <= 1) return '⚡'
  if (days <= 30) return '🌟'
  if (days <= 180) return '💫'
  return '🏆'
}

async function sendMain(bot, chatId, firstName) {
  const greeting = firstName ? `Chào <b>${firstName}</b>! 👋` : 'Chào mừng! 👋'
  const text = [
    `🎬 <b>NETFLIX STORE</b>`,
    DIV,
    greeting,
    ``,
    `⚡ Giao tài khoản <b>tự động 24/7</b>`,
    `🛡️ Bảo hành đổi acc miễn phí`,
    `💳 Thanh toán qua MB Bank`,
    DIV,
  ].join('\n')
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() })
}

async function sendPlans(bot, chatId) {
  const plans = await getNetflixPlans()
  if (!plans.length) return bot.sendMessage(chatId, '⚠️ Hiện chưa có gói nào. Thử lại sau.')
  const text = [
    `📋 <b>CHỌN GÓI NETFLIX</b>`,
    DIV,
    `Chọn gói phù hợp với nhu cầu của bạn:`,
  ].join('\n')
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: planListKeyboard(plans) })
}

async function sendPlanDetail(bot, chatId, planId) {
  const plan = await getPlanById(planId)
  if (!plan) return bot.sendMessage(chatId, '❌ Gói không tồn tại.')

  const features = (plan.features || []).map(f => `  ✔️ ${f}`).join('\n')
  const icon = planIcon(plan.duration_days)
  const text = [
    `${icon} <b>${plan.name.toUpperCase()}</b>`,
    DIV,
    `💰 Giá: <b>${fmtMoney(plan.price)}</b>`,
    `📅 Thời hạn: <b>${plan.duration_days} ngày</b>`,
    `⚡ Giao tự động ngay sau thanh toán`,
    features ? `${DIV}\n📌 <b>Bao gồm:</b>\n${features}` : '',
    DIV,
  ].filter(Boolean).join('\n')

  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: planDetailKeyboard(planId) })
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

    const caption = [
      `💳 <b>THANH TOÁN ĐƠN HÀNG</b>`,
      DIV,
      `📦 <b>${plan.name}</b> — ${plan.duration_days} ngày`,
      `💰 Số tiền: <b>${fmtMoney(plan.price)}</b>`,
      DIV,
      `<b>① Chuyển khoản tới:</b>`,
      `   🏦 ${bank.bankName}`,
      `   💳 <code>${bank.bankAccount}</code>`,
      `   👤 ${bank.bankOwner}`,
      ``,
      `<b>② Nội dung chuyển khoản:</b>`,
      `   📝 <code>${transferContent}</code>`,
      `   <i>(Nhấn để copy)</i>`,
      DIV,
      `⚠️ Chuyển <b>ĐÚNG nội dung</b> — hệ thống tự xác nhận trong ~20 giây.`,
    ].join('\n')

    const opts = { parse_mode: 'HTML', reply_markup: paymentKeyboard(transferContent) }
    await bot.sendPhoto(chatId, qrUrl, { caption, ...opts })
      .catch(() => bot.sendMessage(chatId, caption, opts))

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
      return bot.sendMessage(chatId,
        `📭 <b>Chưa có đơn nào</b>\n\nMua gói đầu tiên ngay!`,
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
      )
    }

    const subs = await getUserSubscriptions(profile.id)
    if (!subs.length) {
      return bot.sendMessage(chatId,
        `📭 <b>Chưa có đơn nào</b>\n\nMua gói đầu tiên ngay!`,
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
      )
    }

    const lines = subs.map((s, i) => {
      const badge = STATUS_BADGE[s.status] || '❓'
      const days = s.end_at ? Math.ceil((new Date(s.end_at) - Date.now()) / 86400000) : 0
      const daysText = days > 0 ? `còn <b>${days} ngày</b>` : `<i>hết hạn</i>`
      const parts = [`${i + 1}. ${badge} <b>${s.plan_name}</b> — ${daysText}`]
      if (s.login_link && s.status === 'active') {
        parts.push(`   🔑 <code>${s.login_link}</code>`)
      }
      return parts.join('\n')
    })

    await bot.sendMessage(chatId,
      [`📋 <b>ĐƠN CỦA BẠN</b>`, DIV, lines.join('\n\n'), DIV].join('\n'),
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
      return bot.sendMessage(chatId,
        `📭 <b>Không có đơn active</b>\n\nMua gói trước để sử dụng tính năng này.`,
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
      )
    }
    const subs = await getUserActiveSubs(profile.id)
    if (!subs.length) {
      return bot.sendMessage(chatId,
        `📭 <b>Không có đơn active</b>\n\nTất cả đơn của bạn đã hết hạn.`,
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
      )
    }
    await bot.sendMessage(chatId,
      [`🔧 <b>BẢO HÀNH / BÁO LỖI</b>`, DIV, `Chọn đơn cần xử lý:`].join('\n'),
      { parse_mode: 'HTML', reply_markup: activeSubsKeyboard(subs) }
    )
  } catch (err) {
    console.error('[sendWarrantyMenu]', err.message)
    await bot.sendMessage(chatId, '❌ Có lỗi xảy ra.')
  }
}

async function handleClaimWarranty(bot, chatId, subId, userId) {
  const loading = await bot.sendMessage(chatId, '⏳ Đang kiểm tra tài khoản...')
  try {
    const data = await callServerAPI('POST', '/api/claim-warranty', { subscription_id: subId }, userId)
    await bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    if (data.login_link) {
      await bot.sendMessage(chatId,
        [`✅ <b>ĐÃ ĐỔI TÀI KHOẢN MỚI!</b>`, DIV, `🔑 <code>${data.login_link}</code>`, DIV, `<i>Nhấn vào thông tin đăng nhập để copy</i>`].join('\n'),
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
      )
    } else {
      await bot.sendMessage(chatId,
        [`ℹ️ <b>Không thể đổi tài khoản</b>`, DIV, data.message || 'Tài khoản vẫn hoạt động tốt.'].join('\n'),
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
      )
    }
  } catch (err) {
    await bot.deleteMessage(chatId, loading.message_id).catch(() => {})
    const msg = err.response?.data?.error || 'Lỗi không xác định'
    await bot.sendMessage(chatId,
      [`❌ <b>Không thể xử lý</b>`, DIV, msg].join('\n'),
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
    )
  }
}

async function handleReportIssue(bot, chatId, subId, userId) {
  try {
    await callServerAPI('POST', '/api/report-cannot-view', { subscription_id: subId }, userId)
    await bot.sendMessage(chatId,
      [`✅ <b>ĐÃ GỬI BÁO CÁO</b>`, DIV, `Admin sẽ kiểm tra và phản hồi trong <b>24h</b>.`, ``, `Bạn sẽ nhận thông báo khi có kết quả.`].join('\n'),
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
    )
  } catch (err) {
    const msg = err.response?.data?.error || 'Lỗi không xác định'
    await bot.sendMessage(chatId,
      [`❌ <b>Không thể gửi báo cáo</b>`, DIV, msg].join('\n'),
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
    )
  }
}

// ── Register all bot event listeners ──
function registerHandlers(bot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id)
    clearState(chatId)
    await sendMain(bot, chatId, msg.from?.first_name)
  })

  bot.onText(/\/myorders/, async (msg) => {
    await sendMyOrders(bot, String(msg.chat.id), msg.from.id)
  })

  bot.on('callback_query', async (query) => {
    const chatId = String(query.message.chat.id)
    const data = query.data || ''
    await bot.answerCallbackQuery(query.id).catch(() => {})

    if (data === 'noop') return
    if (data === 'cb_home') return sendMain(bot, chatId, query.from?.first_name)
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
