const path = require('path')
const dns = require('dns')
try { dns.setDefaultResultOrder('ipv4first') } catch (_) {}

require('dotenv').config({ path: path.join(__dirname, '.env') })

const express = require('express')
const https = require('https')
const http = require('http')
const { Pool } = require('pg')
const axios = require('axios')
const nodemailer = require('nodemailer')

// ===================== DEBUG ENV =====================
function maskDbUrl(url) {
  if (!url) return '(empty)'
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')
}
console.log('[BOOT] .env path =', path.join(__dirname, '.env'))
console.log('[BOOT] DATABASE_URL =', maskDbUrl(process.env.DATABASE_URL))

// ===================== CONFIG =====================
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ''

const GMAIL_USER = process.env.GMAIL_USER || ''
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || ''
const EMAIL_FROM = process.env.EMAIL_FROM || GMAIL_USER

const SEPAY_API_TOKEN = process.env.SEPAY_API_TOKEN || ''
const ADMIN_SECRET = process.env.ADMIN_SECRET || ''
const SEPAY_WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET || ''

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''

// ===================== EXPRESS =====================
const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'dist')))

// ===================== DB =====================
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
})

async function testDbConnection() {
  let client
  try {
    client = await dbPool.connect()
    const r = await client.query('SELECT NOW() AS now')
    console.log('[DB] ✅ Connected OK at', r.rows[0].now)
  } catch (err) {
    console.error('[DB] ❌ Connect failed:', err.message)
  } finally {
    if (client) client.release()
  }
}
testDbConnection()

// ===================== TELEGRAM =====================
async function sendTelegram(message) {
  if (!TG_TOKEN || !TG_CHAT_ID) return
  try {
    await axios.post(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      {
        chat_id: TG_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      },
      { timeout: 8000 }
    )
  } catch (err) {
    console.error('[Telegram]', err.message)
  }
}

// ===================== EMAIL =====================
let _transporter = null
function getTransporter() {
  if (!GMAIL_USER || !GMAIL_PASS) return null
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    })
  }
  return _transporter
}

async function sendEmail(to, subject, html) {
  if (!to) return
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[Email] ⚠️ Chưa cấu hình GMAIL_USER / GMAIL_APP_PASSWORD')
    return
  }
  try {
    const displayName = EMAIL_FROM || GMAIL_USER
    await transporter.sendMail({
      from: `"${displayName}" <${GMAIL_USER}>`,
      to,
      subject,
      html
    })
    console.log(`[Email] ✅ Sent to ${to}`)
  } catch (err) {
    console.error('[Email] ❌', err.message)
  }
}

// ===================== SETTINGS =====================
async function getSetting(key) {
  const client = await dbPool.connect()
  try {
    const r = await client.query(`SELECT value FROM settings WHERE key = $1`, [key])
    return r.rows[0]?.value || ''
  } catch {
    return ''
  } finally {
    client.release()
  }
}

async function getAllSettings() {
  const client = await dbPool.connect()
  try {
    const r = await client.query(`SELECT key, value FROM settings`)
    return Object.fromEntries(r.rows.map(row => [row.key, row.value]))
  } catch {
    return {}
  } finally {
    client.release()
  }
}

const ALLOWED_SETTING_KEYS = new Set([
  'site_name', 'site_title', 'meta_description', 'meta_keywords', 'hero_title', 'hero_subtitle',
  'bank_name', 'bank_account', 'bank_owner',
  'telegram_bot_token', 'telegram_chat_id',
  'resend_api_key', 'email_from',
  'contact_telegram', 'contact_zalo',
  'social_facebook', 'social_youtube', 'social_tiktok',
  'footer_text'
])

// ===================== HELPERS =====================
function nodeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const isPost = (options.method || 'GET').toUpperCase() === 'POST'
    const body = options.body || ''
    const bodyBuf = Buffer.from(body, 'utf8')

    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        ...(isPost ? { 'Content-Length': bodyBuf.length } : {})
      }
    }

    const req = lib.request(reqOpts, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve({
          status: res.statusCode,
          headers: res.headers,
          buffer: buf,
          text: () => buf.toString('utf8'),
          json: () => {
            const text = buf.toString('utf8').replace(/^\uFEFF/, '')
            return JSON.parse(text)
          }
        })
      })
    })
    req.on('error', reject)
    if (isPost) req.write(bodyBuf)
    req.end()
  })
}

function parseCookieString(raw) {
  const result = {}
  raw.split(';').forEach(pair => {
    const eq = pair.indexOf('=')
    if (eq === -1) return
    const k = pair.substring(0, eq).trim()
    const v = pair.substring(eq + 1).trim()
    if (k) result[k] = v
  })
  return result
}

function buildCookieHeader(cookieObj) {
  return Object.entries(cookieObj).map(([k, v]) => `${k}=${v}`).join('; ')
}

const NETFLIX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en,en-US;q=0.9,vi;q=0.8',
  'Upgrade-Insecure-Requests': '1',
}

// ===================== ADMIN AUTH =====================
async function verifySupabaseAdminAccessToken(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !accessToken) return null
  try {
    const r = await axios.get(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY
      },
      timeout: 12000
    })
    const userId = r.data?.id
    if (!userId) return null

    const client = await dbPool.connect()
    try {
      const pr = await client.query(
        `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
        [userId]
      )
      if (pr.rows[0]?.role === 'admin') return userId
    } finally {
      client.release()
    }
  } catch (err) {
    console.warn('[requireAdmin] JWT verify failed:', err.message)
  }
  return null
}

function requireAdmin(req, res, next) {
  if (ADMIN_SECRET) {
    const provided = req.headers['x-admin-secret'] || req.query.secret
    if (provided === ADMIN_SECRET) return next()
  }

  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: ADMIN_SECRET
        ? 'Cần Bearer token (đăng nhập admin) hoặc x-admin-secret đúng'
        : 'Cần đăng nhập tài khoản admin (Bearer token)'
    })
  }

  verifySupabaseAdminAccessToken(m[1])
    .then((userId) => {
      if (!userId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Chỉ profiles.role = admin mới gọi được API này'
        })
      }
      req.adminUserId = userId
      next()
    })
    .catch(() => res.status(401).json({ error: 'Unauthorized' }))
}

// ===================== PAYMENT / RESOURCE =====================
async function activatePayment(transferContent, amount) {
  const client = await dbPool.connect()
  try {
    const r = await client.query(
      `SELECT auto_process_payment($1, $2) AS result`,
      [transferContent, amount]
    )
    return r.rows[0].result
  } catch (err) {
    console.error('[activatePayment]', err.message)
    return { success: false, reason: err.message }
  } finally {
    client.release()
  }
}

async function checkAccountAlive(resourceValue) {
  try {
    let cookie = resourceValue
    const idx = resourceValue.indexOf('NetflixId=')
    if (idx !== -1) cookie = resourceValue.substring(idx)

    const bodyStr = new URLSearchParams({
      raw_cookie: cookie.trim(),
      ajax: '1',
      is_bulk: '1'
    }).toString()

    const result = await nodeRequest('https://nftoken.site/cookies/index.php', {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': 'https://nftoken.site',
        'referer': 'https://nftoken.site/cookies/',
        'user-agent': 'Mozilla/5.0',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: bodyStr
    })

    let data
    try { data = result.json() } catch { return false }
    return data?.status === 'SUCCESS'
  } catch {
    return false
  }
}

async function countAvailableAccounts() {
  const client = await dbPool.connect()
  try {
    const r = await client.query(
      `SELECT COUNT(*) AS cnt FROM resources
       WHERE status = 'available'
       AND COALESCE(assigned_count,0) < COALESCE(max_slots,5)`
    )
    return parseInt(r.rows[0].cnt) || 0
  } catch {
    return 0
  } finally {
    client.release()
  }
}

async function sendActivationEmail(subId, loginLink, planLabel, days, cfg) {
  const client = await dbPool.connect()
  try {
    const r = await client.query(
      `SELECT p.email
       FROM subscriptions s
       JOIN auth.users p ON p.id = s.user_id
       WHERE s.id = $1`,
      [subId]
    )
    const email = r.rows[0]?.email
    if (!email) return

    const siteName = cfg?.site_name || 'Netflix Store'
    const tg = cfg?.contact_telegram || ''
    const endAt = new Date(Date.now() + days * 86400000).toLocaleDateString('vi-VN')

    await sendEmail(email, `✅ Tài khoản Netflix của bạn đã sẵn sàng — ${siteName}`, `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#4F46E5;padding:28px 32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">🎬 ${siteName}</h1>
          <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px;">Tài khoản Netflix Premium của bạn đã sẵn sàng!</p>
        </div>
        <div style="padding:32px;">
          <p style="color:#374151;font-size:15px;margin:0 0 20px;">Xin chào! Đơn hàng <b>${planLabel}</b> đã được kích hoạt thành công.</p>
          <div style="background:#F0FDF4;border:1.5px solid #22C55E;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;">
            <p style="color:#166534;font-size:13px;margin:0 0 12px;font-weight:600;">🔗 LINK ĐĂNG NHẬP NETFLIX</p>
            <a href="${loginLink}" style="display:inline-block;background:#4F46E5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
              Đăng nhập ngay →
            </a>
            <p style="color:#6B7280;font-size:12px;margin:12px 0 0;">Hoặc copy link: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:11px;">${loginLink}</code></p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 0;color:#6B7280;font-size:14px;">Gói</td>
              <td style="padding:10px 0;color:#111827;font-weight:600;text-align:right;font-size:14px;">${planLabel}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 0;color:#6B7280;font-size:14px;">Thời hạn</td>
              <td style="padding:10px 0;color:#111827;font-weight:600;text-align:right;font-size:14px;">${days} ngày</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#6B7280;font-size:14px;">Hết hạn</td>
              <td style="padding:10px 0;color:#EF4444;font-weight:700;text-align:right;font-size:14px;">${endAt}</td>
            </tr>
          </table>
          ${tg ? `<p style="font-size:13px;color:#6B7280;text-align:center;">Cần hỗ trợ? <a href="${tg}" style="color:#4F46E5;">Liên hệ Telegram</a></p>` : ''}
        </div>
        <div style="background:#F9FAFB;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="color:#9CA3AF;font-size:12px;margin:0;">© ${new Date().getFullYear()} ${siteName}. Cảm ơn bạn đã tin tưởng sử dụng dịch vụ!</p>
        </div>
      </div>
    `)
  } catch (err) {
    console.error('[Email activation]', err.message)
  } finally {
    client.release()
  }
}

async function assignVerifiedAccount(subId) {
  let alreadyUsedValues = []
  {
    const client = await dbPool.connect()
    try {
      const r = await client.query(
        `SELECT s.user_id, s2.login_link
         FROM subscriptions s
         LEFT JOIN subscriptions s2
           ON s2.user_id = s.user_id
          AND s2.login_link IS NOT NULL
          AND s2.status = 'active'
          AND s2.id != s.id
         WHERE s.id = $1`,
        [subId]
      )
      if (r.rows.length > 0) {
        alreadyUsedValues = r.rows
          .map(row => row.login_link)
          .filter(Boolean)
      }
    } finally {
      client.release()
    }
  }

  let candidates = []
  {
    const client = await dbPool.connect()
    try {
      let query = `
        SELECT id, value, assigned_count, COALESCE(max_slots, 5) AS max_slots
        FROM resources
        WHERE status = 'available'
          AND COALESCE(assigned_count, 0) < COALESCE(max_slots, 5)
      `
      const params = []
      if (alreadyUsedValues.length > 0) {
        params.push(alreadyUsedValues)
        query += ` AND value != ALL($${params.length}::text[])`
      }
      query += ` ORDER BY assigned_count DESC NULLS LAST, created_at ASC LIMIT 10`
      const r = await client.query(query, params)
      candidates = r.rows
    } finally {
      client.release()
    }
  }

  for (const res of candidates) {
    const maxSlots = res.max_slots || 5
    console.log(`[Auto-Pay] Checking ${res.id.substring(0,8)} (${res.assigned_count || 0}/${maxSlots} slots)...`)
    const alive = await checkAccountAlive(res.value)

    if (alive) {
      const client = await dbPool.connect()
      try {
        const newCount = (res.assigned_count || 0) + 1
        const newStatus = newCount >= maxSlots ? 'full' : 'available'
        const upd = await client.query(
          `UPDATE resources
           SET assigned_count = $1, status = $2, assigned_to = $3
           WHERE id = $4 AND status = 'available'
           RETURNING id`,
          [newCount, newStatus, subId, res.id]
        )
        if (upd.rowCount > 0) {
          await client.query(
            `UPDATE subscriptions SET login_link = $1 WHERE id = $2`,
            [res.value, subId]
          )
          console.log(`[Auto-Pay] ✅ Assigned (${newCount}/${maxSlots} slots used)`)
          return res.value
        }
      } finally {
        client.release()
      }
    } else {
      const client = await dbPool.connect()
      try {
        await client.query(`UPDATE resources SET status = 'dead' WHERE id = $1`, [res.id])
        console.log('[Auto-Pay] ❌ Account dead, trying next...')
      } finally {
        client.release()
      }
    }
  }

  return null
}

async function processConfirmedPayment(transferContent, amount) {
  const outcome = await activatePayment(transferContent, Math.round(amount || 0))
  console.log(`[Auto-Pay] ${transferContent} →`, JSON.stringify(outcome))
  if (!outcome.success) return outcome

  const loginLink = await assignVerifiedAccount(outcome.subscription_id)
  if (!loginLink) {
    console.warn(`[Auto-Pay] ⚠️ No alive account for sub ${outcome.subscription_id}`)
  }

  const cfg = await getAllSettings()
  const siteName = cfg.site_name || 'Netflix Store'
  const planLabel = outcome.plan || '?'
  const days = outcome.duration_days || '?'
  const availCount = await countAvailableAccounts()

  sendTelegram(
    `🛒 <b>Đơn mới!</b> — ${siteName}\n` +
    `📦 Gói: <b>${planLabel}</b> (${days} ngày)\n` +
    `💰 Số tiền: <b>${Number(amount).toLocaleString('vi-VN')}₫</b>\n` +
    `🔑 Nội dung CK: <code>${transferContent}</code>\n` +
    `${loginLink ? '✅ Đã gán tài khoản tự động' : '⚠️ Chưa gán — kho trống!'}\n` +
    `📦 Kho còn lại: <b>${availCount}</b> tài khoản`
  )

  if (availCount <= 3) {
    sendTelegram(
      `⚠️ <b>CẢNH BÁO KHO!</b>\n` +
      `Chỉ còn <b>${availCount}</b> tài khoản sẵn sàng.\n` +
      `Hãy bổ sung ngay để tránh gián đoạn!`
    )
  }

  if (loginLink) {
    await sendActivationEmail(outcome.subscription_id, loginLink, planLabel, days, cfg)
  }

  return { ...outcome, login_link: loginLink }
}

// ===================== SEPAY POLLING =====================
let lastSePayTxId = 0
let sepayAuthFailStreak = 0
let sepayPollPausedUntil = 0

const SEPAY_AUTH_FAIL_CAP = 3
const SEPAY_POLL_PAUSE_MS = 30 * 60 * 1000

function sepayResponseText(data) {
  if (data == null) return ''
  if (typeof data === 'string') return data
  try { return JSON.stringify(data) } catch { return String(data) }
}

function sepayIsAuthOrCircuitProblem(httpStatus, bodyText, errMsg) {
  const t = `${httpStatus || ''} ${bodyText || ''} ${errMsg || ''}`.toLowerCase()
  return (
    httpStatus === 401 ||
    httpStatus === 403 ||
    t.includes('authentication') ||
    t.includes('unauthor') ||
    t.includes('circuit breaker') ||
    t.includes('invalid token') ||
    t.includes('access denied')
  )
}

function sepayIsDatabaseOrConnError(errMsg) {
  const m = String(errMsg || '').toLowerCase()
  return (
    m.includes('password authentication failed') ||
    m.includes('no password supplied') ||
    m.includes('could not connect to server') ||
    m.includes('connect econnrefused') ||
    m.includes('getaddrinfo enotfound') ||
    m.includes('too many connections') ||
    m.includes('connection pool') ||
    m.includes('pgbouncer') ||
    m.includes('connection terminated') ||
    m.includes('remaining connection slots') ||
    (m.includes('ssl connection') && m.includes('error'))
  )
}

function sepayNoteAuthFailure(detail) {
  sepayAuthFailStreak++
  if (sepayAuthFailStreak < SEPAY_AUTH_FAIL_CAP) {
    console.warn(`[SePay Poll] Lỗi xác thực (${sepayAuthFailStreak}/${SEPAY_AUTH_FAIL_CAP}). Kiểm tra SEPAY_API_TOKEN.`)
    return
  }
  sepayAuthFailStreak = 0
  sepayPollPausedUntil = Date.now() + SEPAY_POLL_PAUSE_MS
  console.error(
    '[SePay Poll] Tạm dừng 30 phút — token SePay không hợp lệ hoặc API đang chặn (circuit breaker).',
    'Sửa SEPAY_API_TOKEN trong .env rồi: pm2 restart netflix-store.',
    detail ? `Gợi ý: ${String(detail).slice(0, 280)}` : ''
  )
}

function sepayClearAuthFailure() {
  sepayAuthFailStreak = 0
}

async function checkSePayTransactions() {
  if (!SEPAY_API_TOKEN) return

  const now = Date.now()
  if (sepayPollPausedUntil && now < sepayPollPausedUntil) return
  if (sepayPollPausedUntil && now >= sepayPollPausedUntil) {
    console.log('[SePay Poll] Hết thời gian tạm dừng — thử kết nối lại.')
    sepayPollPausedUntil = 0
    sepayClearAuthFailure()
  }

  try {
    const response = await axios.get('https://my.sepay.vn/userapi/transactions/list', {
      params: { limit: 100 },
      headers: {
        Authorization: `Bearer ${SEPAY_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    })

    const data = response.data
    const bodyStr = sepayResponseText(data)

    if (data?.status !== 200) {
      if (sepayIsAuthOrCircuitProblem(response.status, bodyStr, '')) {
        sepayNoteAuthFailure(bodyStr.slice(0, 400))
      } else {
        console.warn('[SePay Poll] API trả lỗi:', bodyStr.slice(0, 200))
      }
      return
    }

    sepayClearAuthFailure()
    const transactions = data.transactions || []

    for (const tx of transactions) {
      const txId = parseInt(tx.id) || 0
      if (txId <= lastSePayTxId) continue

      const amountIn = parseFloat(tx.amount_in || 0)
      if (amountIn <= 0) continue

      const txContent = tx.transaction_content || ''
      let client
      try {
        client = await dbPool.connect()
        const matches = await client.query(
          `SELECT transfer_content, amount
           FROM payments
           WHERE status = 'pending'
             AND UPPER($1) LIKE '%' || UPPER(transfer_content) || '%'
             AND $2 >= amount
           LIMIT 1`,
          [txContent, amountIn]
        )
        if (matches.rows.length > 0) {
          console.log(`[SePay] ✅ MATCHED tx=${tx.id} content="${txContent}"`)
          await processConfirmedPayment(matches.rows[0].transfer_content, amountIn)
        }
      } catch (dbErr) {
        console.error('[SePay Poll] ❌ Lỗi DB khi xử lý tx', tx.id, '—', dbErr.message.slice(0, 200))
        console.error('[SePay Poll] Kiểm tra DATABASE_URL trong .env trên máy chạy PM2.')
      } finally {
        if (client) client.release()
      }
    }

    if (transactions.length > 0) {
      const maxId = Math.max(...transactions.map(t => parseInt(t.id) || 0))
      if (maxId > lastSePayTxId) lastSePayTxId = maxId
    }
  } catch (err) {
    const st = err.response?.status
    const bodyStr = sepayResponseText(err.response?.data)
    const msg = String(err.message || '')

    if (sepayIsDatabaseOrConnError(msg)) {
      console.error(
        '[SePay Poll] ❌ Lỗi Postgres / kết nối DB (không phải lỗi token SePay).',
        'Kiểm tra DATABASE_URL trong .env trên máy PM2.',
        msg.slice(0, 220)
      )
      return
    }

    if (err.response && sepayIsAuthOrCircuitProblem(st, bodyStr, err.message)) {
      sepayNoteAuthFailure(bodyStr || err.message)
    } else if (!err.response) {
      console.error('[SePay Poll] ❌ Network/timeout/unknown error:', msg.slice(0, 200))
    } else {
      console.error('[SePay Poll]', err.message)
    }
  }
}

// ===================== EXPIRY / REMINDER / HEALTH =====================
async function runExpiryJob() {
  let client
  try {
    client = await dbPool.connect()

    const result = await client.query(`
      UPDATE subscriptions
      SET status = 'expired'
      WHERE status = 'active'
        AND end_at IS NOT NULL
        AND end_at < NOW()
      RETURNING id
    `)

    if (result.rowCount > 0) {
      console.log(`[Expiry] ✅ Expired ${result.rowCount} subscription(s)`)

      const expiredIds = result.rows.map(r => r.id)
      const linkResult = await client.query(
        `SELECT login_link
         FROM subscriptions
         WHERE id = ANY($1::uuid[])
           AND login_link IS NOT NULL`,
        [expiredIds]
      )
      const expiredLinks = linkResult.rows.map(r => r.login_link).filter(Boolean)

      if (expiredLinks.length > 0) {
        await client.query(`
          UPDATE resources
          SET assigned_count = GREATEST(0, COALESCE(assigned_count, 1) - 1),
              status = CASE
                WHEN GREATEST(0, COALESCE(assigned_count, 1) - 1) < COALESCE(max_slots, 5)
                  AND status = 'full' THEN 'available'
                ELSE status
              END
          WHERE value = ANY($1::text[])
            AND status != 'dead'
        `, [expiredLinks])
        console.log(`[Expiry] Released slots for ${expiredLinks.length} resource(s)`)
      }
    }

    return result.rowCount
  } catch (err) {
    console.error('[Expiry] ❌', err.message)
    return 0
  } finally {
    if (client) client.release()
  }
}

async function runExpiryReminder() {
  let client
  try {
    client = await dbPool.connect()
    const result = await client.query(`
      SELECT s.id, s.plan, s.end_at, u.email
      FROM subscriptions s
      JOIN auth.users u ON u.id = s.user_id
      WHERE s.status = 'active'
        AND s.end_at BETWEEN NOW() AND NOW() + INTERVAL '3 days'
        AND (s.reminder_sent IS NULL OR s.reminder_sent = false)
    `)

    const cfg = await getAllSettings()

    for (const sub of result.rows) {
      const endDate = new Date(sub.end_at).toLocaleDateString('vi-VN')
      await sendEmail(sub.email, `⏰ Gói Netflix của bạn sắp hết hạn — ${cfg.site_name || 'Netflix Store'}`, `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <div style="background:#F59E0B;padding:24px 32px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:20px;">⏰ Sắp hết hạn!</h1>
          </div>
          <div style="padding:28px 32px;">
            <p style="color:#374151;font-size:15px;">Gói <b>${sub.plan}</b> của bạn sẽ hết hạn vào <b style="color:#EF4444;">${endDate}</b>.</p>
            <p style="color:#6B7280;font-size:14px;">Gia hạn ngay để tiếp tục xem phim không gián đoạn!</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="#/plans" style="background:#4F46E5;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;">
                Gia hạn ngay →
              </a>
            </div>
          </div>
        </div>
      `)
      await client.query(`UPDATE subscriptions SET reminder_sent = true WHERE id = $1`, [sub.id]).catch(() => {})
    }

    if (result.rowCount > 0) console.log(`[Reminder] Sent ${result.rowCount} expiry reminder(s)`)
  } catch (err) {
    const msg = String(err.message || '').toLowerCase()
    if (msg.includes('password authentication failed') || msg.includes('no password supplied')) {
      console.error('[Reminder] ❌ Postgres từ chối đăng nhập — sửa DATABASE_URL trong .env rồi pm2 restart.')
    } else if (
      msg.includes('circuit breaker') ||
      msg.includes('too many connections') ||
      msg.includes('connection pool') ||
      msg.includes('connect econnrefused') ||
      msg.includes('could not connect to server') ||
      msg.includes('connection terminated')
    ) {
      console.error('[Reminder] ❌ Lỗi kết nối DB (Supabase pooler / DB timeout) — kiểm tra DATABASE_URL và trạng thái DB.')
    } else {
      console.error('[Reminder] ❌', err.message)
    }
  } finally {
    if (client) client.release()
  }
}

async function runHealthCheck() {
  console.log('[HealthCheck] Starting inventory health check...')
  let client
  let candidates = []

  try {
    client = await dbPool.connect()
    const r = await client.query(
      `SELECT id, value FROM resources WHERE status = 'available' ORDER BY created_at ASC`
    )
    candidates = r.rows
  } catch (err) {
    console.error('[HealthCheck]', err.message)
    return { alive: 0, dead: 0, total: 0 }
  } finally {
    if (client) client.release()
  }

  let alive = 0
  let dead = 0

  for (const res of candidates) {
    const isAlive = await checkAccountAlive(res.value)
    if (!isAlive) {
      dead++
      let c
      try {
        c = await dbPool.connect()
        await c.query(`UPDATE resources SET status = 'dead' WHERE id = $1`, [res.id])
      } catch (e) {
        console.error('[HealthCheck]', e.message)
      } finally {
        if (c) c.release()
      }
    } else {
      alive++
    }
    await new Promise(r => setTimeout(r, 500))
  }

  const total = candidates.length
  console.log(`[HealthCheck] ✅ Done: ${alive} alive, ${dead} dead / ${total} total`)

  sendTelegram(
    `🔍 <b>Kiểm tra sức khoẻ kho</b>\n` +
    `✅ Còn sống: <b>${alive}</b>\n` +
    `💀 Đã die: <b>${dead}</b>\n` +
    `📦 Tổng: <b>${total}</b> tài khoản\n` +
    `${dead > 0 ? '⚠️ Nên bổ sung tài khoản mới!' : '👍 Kho ổn định!'}`
  )

  return { alive, dead, total }
}

// ===================== ROUTES =====================
app.get('/api/test-db', async (req, res) => {
  try {
    const r = await dbPool.query('SELECT NOW() AS now')
    res.json({ success: true, now: r.rows[0].now })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/get-link', async (req, res) => {
  try {
    const { cookie } = req.body
    if (!cookie) return res.status(400).json({ success: false, message: 'Missing cookie' })

    const bodyStr = new URLSearchParams({
      raw_cookie: cookie.trim(),
      ajax: '1',
      is_bulk: '1'
    }).toString()

    const result = await nodeRequest('https://nftoken.site/cookies/index.php', {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': 'https://nftoken.site',
        'referer': 'https://nftoken.site/cookies/',
        'user-agent': 'Mozilla/5.0',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: bodyStr
    })

    if (result.status !== 200) {
      return res.json({ success: false, message: `nftoken.site returned ${result.status}` })
    }

    let data
    try { data = result.json() } catch { return res.json({ success: false, message: 'Invalid JSON from nftoken.site' }) }

    if (!data || data.status !== 'SUCCESS') {
      return res.json({ success: false, message: 'Cookie die hoặc không hợp lệ', raw: data })
    }

    let link = null
    const nftoken = data.nftoken || data.token
    if (nftoken) {
      link = `https://netflix.com/?nftoken=${nftoken}`
    } else {
      const full = data.full_data_string || ''
      const m = full.match(/https?:\/\/netflix\.com\/\?nftoken=[^\s"]+/)
      if (m) link = m[0]
    }

    res.json({
      success: true,
      link,
      info: {
        email: data.email,
        plan: data.plan,
        quality: data.video_quality || data.quality,
        screens: data.max_streams || data.screens,
        country: data.country
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

app.post('/api/check-cookie', async (req, res) => {
  try {
    const { cookie } = req.body
    if (!cookie) return res.status(400).json({ success: false, message: 'Missing cookie' })

    const bodyStr = new URLSearchParams({
      raw_cookie: cookie.trim(),
      ajax: '1',
      is_bulk: '1'
    }).toString()

    const result = await nodeRequest('https://nftoken.site/cookies/index.php', {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': 'https://nftoken.site',
        'referer': 'https://nftoken.site/cookies/',
        'user-agent': 'Mozilla/5.0',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: bodyStr
    })

    if (result.status !== 200) return res.json({ alive: false })

    let data
    try { data = result.json() } catch { return res.json({ alive: false }) }

    res.json({ alive: data && data.status === 'SUCCESS', raw: data })
  } catch (err) {
    res.status(500).json({ alive: false, message: err.message })
  }
})

app.post('/api/tv-init', async (req, res) => {
  try {
    const { cookie } = req.body
    if (!cookie) return res.status(400).json({ success: false, message: 'Missing cookie' })

    const cookieHeader = buildCookieHeader(parseCookieString(cookie))

    const result = await nodeRequest('https://www.netflix.com/tv8', {
      method: 'GET',
      headers: {
        ...NETFLIX_HEADERS,
        Cookie: cookieHeader
      }
    })

    const html = result.text()
    let authUrl = null

    let m = html.match(/name=["']authURL["'][^>]*value=["']([^"']+)["']/)
    if (m) authUrl = m[1]
    if (!authUrl) {
      m = html.match(/"authURL"\s*:\s*"([^"]+)"/)
      if (m) authUrl = m[1]
    }

    if (!authUrl) {
      return res.json({ success: false, message: 'Không lấy được authURL — cookie có thể đã hết hạn hoặc chưa đăng nhập Netflix' })
    }

    res.json({ success: true, authUrl })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

app.post('/api/tv-submit', async (req, res) => {
  try {
    const { cookie, authUrl, code } = req.body
    if (!cookie || !authUrl || !code) {
      return res.status(400).json({ success: false, message: 'Missing cookie, authUrl or code' })
    }

    const cookieHeader = buildCookieHeader(parseCookieString(cookie))
    const formBody = new URLSearchParams({
      flow: 'websiteSignUp',
      authURL: authUrl,
      flowMode: 'enterTvLoginRendezvousCode',
      withFields: 'tvLoginRendezvousCode,isTvUrl2',
      code,
      tvLoginRendezvousCode: code,
      action: 'nextAction',
    }).toString()

    const result = await nodeRequest('https://www.netflix.com/tv8', {
      method: 'POST',
      headers: {
        ...NETFLIX_HEADERS,
        Cookie: cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://www.netflix.com',
        Referer: 'https://www.netflix.com/tv8',
      },
      body: formBody
    })

    const location = result.headers['location'] || ''

    if ((result.status === 301 || result.status === 302) && location.toLowerCase().includes('success')) {
      return res.json({ success: true, message: '🎉 TV đã được đăng nhập thành công!' })
    }

    if (result.status === 200) {
      const body = result.text()
      if (body.toLowerCase().includes('success') && body.includes('tv/out/success')) {
        return res.json({ success: true, message: '🎉 TV đã được đăng nhập thành công!' })
      }
      const errM = body.match(/data-uia=["']tv\+error["'][^>]*>([^<]+)/)
      if (errM) return res.json({ success: false, message: errM[1].trim() })
      return res.json({ success: false, message: 'Netflix không chấp nhận mã này (có thể sai mã hoặc cookie hết hạn)' })
    }

    res.json({ success: false, message: `HTTP ${result.status} — ${location || 'Không có redirect'}` })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

app.post('/sepay-webhook', async (req, res) => {
  if (SEPAY_WEBHOOK_SECRET) {
    const provided = req.headers['x-sepay-signature'] || req.headers['x-webhook-secret'] || ''
    if (provided !== SEPAY_WEBHOOK_SECRET) {
      console.warn('[SePay Webhook] ⚠️ Invalid signature, rejected')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  }

  try {
    console.log('[SePay Webhook] Received:', JSON.stringify(req.body))
    const txData = req.body
    const amountIn = parseFloat(txData.amount_in || txData.transferAmount || 0)
    const txContent = txData.transaction_content || txData.content || txData.description || ''

    if (amountIn <= 0) return res.json({ success: true, message: 'Not an incoming transaction' })

    const client = await dbPool.connect()
    try {
      const matches = await client.query(
        `SELECT transfer_content, amount
         FROM payments
         WHERE status = 'pending'
           AND UPPER($1) LIKE '%' || UPPER(transfer_content) || '%'
           AND $2 >= amount
         LIMIT 1`,
        [txContent, amountIn]
      )
      if (matches.rows.length > 0) {
        console.log(`[SePay Webhook] ✅ Matched: ${matches.rows[0].transfer_content}`)
        await processConfirmedPayment(matches.rows[0].transfer_content, amountIn)
      } else {
        console.log(`[SePay Webhook] No match for content="${txContent}" amount=${amountIn}`)
      }
    } finally {
      client.release()
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[SePay Webhook] Error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/payment-status/:transferContent', async (req, res) => {
  try {
    const { transferContent } = req.params
    const client = await dbPool.connect()
    try {
      const result = await client.query(
        `SELECT p.status AS pay_status,
                s.status AS sub_status,
                s.id AS sub_id,
                s.login_link,
                s.start_at,
                s.end_at,
                s.plan
         FROM payments p
         LEFT JOIN subscriptions s ON s.id = p.subscription_id
         WHERE p.transfer_content = $1
         ORDER BY p.created_at DESC
         LIMIT 1`,
        [transferContent]
      )

      if (result.rows.length === 0) {
        return res.json({ confirmed: false, status: 'not_found' })
      }

      const row = result.rows[0]
      res.json({
        confirmed: row.pay_status === 'success',
        status: row.pay_status,
        subStatus: row.sub_status,
        subId: row.sub_id,
        loginLink: row.login_link,
        startAt: row.start_at,
        endAt: row.end_at,
        plan: row.plan
      })
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ confirmed: false, error: err.message })
  }
})

app.post('/api/admin/confirm-payment', requireAdmin, async (req, res) => {
  try {
    const { paymentId } = req.body
    if (!paymentId) return res.status(400).json({ success: false, message: 'Thiếu paymentId' })

    const client = await dbPool.connect()
    let payment
    try {
      const r = await client.query(
        `SELECT transfer_content, amount FROM payments WHERE id = $1 LIMIT 1`,
        [paymentId]
      )
      payment = r.rows[0]
    } finally {
      client.release()
    }

    if (!payment) return res.status(404).json({ success: false, message: 'Không tìm thấy payment' })
    const result = await processConfirmedPayment(payment.transfer_content, payment.amount)
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

app.post('/api/admin/run-expiry', requireAdmin, async (req, res) => {
  try {
    const count = await runExpiryJob()
    res.json({ success: true, expired: count, message: `Đã expire ${count} subscription` })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/admin/health-check', requireAdmin, async (req, res) => {
  try {
    const result = await runHealthCheck()
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [revenue, orders, users, inventory] = await Promise.all([
      dbPool.query(`
        SELECT
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '1 day'  THEN amount ELSE 0 END) AS today,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN amount ELSE 0 END) AS week,
          SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN amount ELSE 0 END) AS month,
          SUM(amount) AS total
        FROM payments WHERE status = 'success'
      `),
      dbPool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') AS today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS month,
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'expired') AS expired
        FROM subscriptions
      `),
      dbPool.query(`SELECT COUNT(DISTINCT user_id) AS total FROM subscriptions`),
      dbPool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'available') AS available,
          COUNT(*) FILTER (WHERE status = 'full') AS full,
          COUNT(*) FILTER (WHERE status = 'dead') AS dead,
          COUNT(*) AS total
        FROM resources
      `)
    ])

    res.json({
      revenue: revenue.rows[0],
      orders: orders.rows[0],
      customers: users.rows[0].total,
      inventory: inventory.rows[0]
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/admin/test-telegram', requireAdmin, async (req, res) => {
  try {
    await sendTelegram('✅ Test kết nối Telegram thành công từ Netflix Store!')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const cfg = await getAllSettings()
    res.json(cfg)
  } catch (err) {
    res.status(500).json({ message: err.message || 'Không đọc được settings' })
  }
})

app.patch('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ message: 'Body phải là object JSON' })
    }

    const client = await dbPool.connect()
    try {
      await client.query('BEGIN')
      for (const [key, raw] of Object.entries(body)) {
        if (!ALLOWED_SETTING_KEYS.has(key)) continue
        const value = raw == null ? '' : String(raw)
        await client.query(
          `INSERT INTO settings (key, value, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (key)
           DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, value]
        )
      }
      await client.query('COMMIT')
    } catch (e) {
      try { await client.query('ROLLBACK') } catch (_) {}
      throw e
    } finally {
      client.release()
    }

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: err.message || 'Lỗi lưu cài đặt' })
  }
})

app.get('/api/sepay-debug', requireAdmin, async (req, res) => {
  try {
    const response = await axios.get('https://my.sepay.vn/userapi/transactions/list', {
      params: { limit: 10 },
      headers: {
        Authorization: `Bearer ${SEPAY_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    })

    res.json({
      success: true,
      sePayStatus: response.data?.status,
      totalTransactions: (response.data?.transactions || []).length,
      latestTransactions: (response.data?.transactions || []).slice(0, 5).map(t => ({
        id: t.id,
        date: t.transaction_date,
        amount_in: t.amount_in,
        content: t.transaction_content
      }))
    })
  } catch (error) {
    res.json({ success: false, error: error.message, response: error.response?.data })
  }
})

// ===================== SCHEDULERS =====================
setTimeout(() => {
  checkSePayTransactions()
  setInterval(checkSePayTransactions, 5000)
}, 3000)

setTimeout(() => {
  const tick = () => runExpiryJob().catch(err => console.error('[Expiry]', err.message))
  tick()
  setInterval(tick, 60 * 60 * 1000)
}, 5000)

setTimeout(() => {
  const tick = () => runExpiryReminder().catch(err => console.error('[Reminder]', err.message))
  tick()
  setInterval(tick, 6 * 60 * 60 * 1000)
}, 10000)

function scheduleHealthCheck() {
  const now = new Date()
  const next2 = new Date(now)
  next2.setHours(2, 0, 0, 0)
  if (next2 <= now) next2.setDate(next2.getDate() + 1)
  const msUntil = next2 - now

  console.log(`[HealthCheck] Scheduled at 02:00 (in ${Math.round(msUntil / 60000)}min)`)

  setTimeout(() => {
    const tick = () => runHealthCheck().catch(err => console.error('[HealthCheck]', err.message))
    tick()
    setInterval(tick, 24 * 60 * 60 * 1000)
  }, msUntil)
}
scheduleHealthCheck()

// ===================== SPA FALLBACK =====================
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).send('Build not found. Run: npm run build')
  })
})

// ===================== START =====================
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🚀 Netflix Store server → http://localhost:${PORT}`)
  console.log(`   POST /api/get-link`)
  console.log(`   POST /api/check-cookie`)
  console.log(`   POST /api/tv-init`)
  console.log(`   POST /api/tv-submit`)
  console.log(`   POST /sepay-webhook`)
  console.log(`   GET  /api/payment-status/:code`)
  console.log(`   GET  /api/sepay-debug`)
  console.log(`   GET  /api/test-db`)
  console.log(`   SePay polling: every 5s ${SEPAY_API_TOKEN ? '✅ ACTIVE' : '❌ NO TOKEN'}`)
})