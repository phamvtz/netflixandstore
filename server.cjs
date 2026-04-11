const path = require('path')
const fs = require('fs')
const dns = require('dns')
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  /* optional on older Node */
}

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

/** Cảnh báo nếu chỉ chạy `node server.cjs` mà quên `npm run build` — UI vẫn là bundle cũ (thiếu link API, v.v.). */
function warnIfDistBundleStale() {
  try {
    const assetsDir = path.join(__dirname, 'dist', 'assets')
    if (!fs.existsSync(assetsDir)) {
      console.warn(
        '\n[netflixauto] Chưa có dist/assets. Frontend chưa build. Chạy: npm run build\n'
      )
      return
    }
    const jsFiles = fs
      .readdirSync(assetsDir)
      .filter((f) => f.endsWith('.js') && /^index-/.test(f))
    const hasApiDocs = jsFiles.some((f) => {
      const s = fs.readFileSync(path.join(assetsDir, f), 'utf8')
      return s.includes('api-docs') || s.includes('renderApiDocs')
    })
    if (!hasApiDocs) {
      console.warn(
        '\n[netflixauto] dist/ có vẻ CŨ (bundle không chứa trang API). Giao diện sẽ thiếu nút/link API.\n' +
          '    → Chạy: npm run build   rồi khởi động lại server.\n' +
          '    → Hoặc dùng: npm start   (đã gồm build + node server.cjs)\n'
      )
    }
  } catch {
    /* ignore */
  }
}
warnIfDistBundleStale()

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

async function sendTelegramWithToken(botToken, chatId, message) {
  if (!botToken || !chatId) return
  try {
    await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      { chat_id: chatId, text: message, parse_mode: 'HTML' },
      { timeout: 8000 }
    )
  } catch (err) {
    console.error('[Telegram seller]', err.message)
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
  'footer_text',
  'catalog_config',
  'guides_config'
])

/** Mặc định khi chưa cấu hình guides_config trong DB (chỉ dùng cho GET /api/guides) */
const GUIDES_PUBLIC_FALLBACK = {
  introTitle: 'Hướng dẫn sử dụng',
  introSubtitle:
    'Các bài hướng dẫn chi tiết giúp bạn sử dụng dịch vụ dễ dàng và hiệu quả nhất.',
  posts: [
    {
      id: 'mua-hang-thanh-toan',
      slug: 'mua-hang-thanh-toan',
      title: 'Mua hàng và thanh toán',
      order: 0,
      published: true,
      bodyMd:
        '## Chọn gói dịch vụ\n\n' +
        'Vào **Dịch vụ** hoặc **Bảng giá**, chọn gói phù hợp rồi làm theo bước thanh toán.\n\n' +
        '## Chuyển khoản\n\n' +
        '- Chuyển đúng **số tài khoản** và **nội dung CK** hiển thị trên trang thanh toán.\n' +
        '- Sau khi ngân hàng ghi nhận, hệ thống sẽ **tự kích hoạt** đơn trong vài phút.\n\n' +
        '## Lưu ý\n\n' +
        'Giữ **mã đơn / nội dung CK** để tra cứu khi cần hỗ trợ.'
    },
    {
      id: 'nhan-tai-khoan-netflix',
      slug: 'nhan-tai-khoan-netflix',
      title: 'Nhận tài khoản Netflix sau khi mua',
      order: 1,
      published: true,
      bodyMd:
        '## Xem trong Tài khoản\n\n' +
        'Đăng nhập → **Tài khoản** (Dashboard). Khi đơn ở trạng thái **Đang hoạt động**, bạn sẽ thấy **email và mật khẩu** (và các nút tiện ích nếu có).\n\n' +
        '## Get Login Link / TV\n\n' +
        '- **Get Login Link**: tạo link đăng nhập nhanh (nếu gói hỗ trợ).\n' +
        '- **Nhập mã TV**: làm theo hướng dẫn trên màn hình để nhập mã từ TV Netflix.\n\n' +
        '## Bảo hành\n\n' +
        'Nếu không đăng nhập được hoặc mất gói, dùng nút **Bảo hành** trong Dashboard (trong thời gian hiệu lực gói).'
    },
    {
      id: 'lien-he-ho-tro',
      slug: 'lien-he-ho-tro',
      title: 'Liên hệ hỗ trợ',
      order: 2,
      published: true,
      bodyMd:
        '## Kênh hỗ trợ\n\n' +
        'Xem **Telegram / Zalo** (hoặc thông tin liên hệ) ở chân trang website hoặc trang **Cài đặt** cửa hàng.\n\n' +
        '## Khi gửi tin\n\n' +
        '- Ghi rõ **email đăng ký** và **mã đơn** (hoặc ảnh chụp thanh toán).\n' +
        '- Mô tả lỗi: không đăng nhập được, sai mật khẩu, v.v.'
    }
  ]
}

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

// ===================== AUTH (Supabase JWT + profiles.role) =====================

/** Decode JWT payload mà không cần gọi HTTP — nhanh hơn, không phụ thuộc Supabase API */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    // Kiểm tra hết hạn
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      console.warn('[JWT] Token expired')
      return null
    }
    return payload
  } catch {
    return null
  }
}

/** @returns {{ userId: string, role: string } | null} */
async function verifySupabaseAccessToken(accessToken) {
  if (!accessToken) return null

  // Bước 1: Decode JWT cục bộ — không cần HTTP đến Supabase
  const payload = decodeJwtPayload(accessToken)
  const userId = payload?.sub
  if (!userId) {
    // Fallback: gọi Supabase REST API nếu không decode được
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
    try {
      const r = await axios.get(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
        timeout: 8000
      })
      const uid = r.data?.id
      if (!uid) return null
      const client = await dbPool.connect()
      try {
        const pr = await client.query(`SELECT role FROM profiles WHERE id = $1 LIMIT 1`, [uid])
        return { userId: uid, role: pr.rows[0]?.role || 'user' }
      } finally { client.release() }
    } catch (err) {
      console.warn('[verifyToken fallback] failed:', err.message)
      return null
    }
  }

  // Bước 2: Query profiles table bằng userId từ JWT
  try {
    const client = await dbPool.connect()
    try {
      const pr = await client.query(
        `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
        [userId]
      )
      const role = pr.rows[0]?.role || 'user'
      return { userId, role }
    } finally {
      client.release()
    }
  } catch (err) {
    console.warn('[verifyToken] DB query failed:', err.message)
    return null
  }
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

  verifySupabaseAccessToken(m[1])
    .then((u) => {
      if (!u || u.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Chỉ profiles.role = admin mới gọi được API này'
        })
      }
      req.adminUserId = u.userId
      next()
    })
    .catch(() => res.status(401).json({ error: 'Unauthorized' }))
}

/** Seller hoặc admin — dùng cho API quản lý web con */
function requireSellerOrAdmin(req, res, next) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Cần Bearer token (đăng nhập)' })
  }
  verifySupabaseAccessToken(m[1])
    .then((u) => {
      if (!u) return res.status(401).json({ error: 'Unauthorized' })
      if (u.role !== 'seller' && u.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Chỉ tài khoản seller (hoặc admin) mới dùng được API này'
        })
      }
      req.sellerUserId = u.userId
      req.sellerRole = u.role
      next()
    })
    .catch(() => res.status(401).json({ error: 'Unauthorized' }))
}

/** User đã đăng nhập (JWT Supabase) */
function requireUser(req, res, next) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Cần Bearer token (đăng nhập)' })
  }
  verifySupabaseAccessToken(m[1])
    .then((u) => {
      if (!u) return res.status(401).json({ error: 'Unauthorized' })
      req.authUserId = u.userId
      next()
    })
    .catch(() => res.status(401).json({ error: 'Unauthorized' }))
}

const SELLER_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/

function normalizeSellerSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

/** Hostname chữ thường, bỏ port và tiền tố www. */
function canonicalHost(h) {
  if (!h) return ''
  const x = String(h).toLowerCase().split(':')[0].trim()
  return x.startsWith('www.') ? x.slice(4) : x
}

const MAIN_DOMAINS_RAW = process.env.MAIN_DOMAINS || 'localhost,127.0.0.1'
const MAIN_DOMAIN_SET = new Set(
  MAIN_DOMAINS_RAW.split(/[\s,]+/)
    .map((s) => canonicalHost(s.trim()))
    .filter(Boolean)
)

function normalizeRequestHost(req) {
  const raw = (req.headers['x-forwarded-host'] || req.headers.host || '').toString()
  const first = raw.split(',')[0].trim()
  return canonicalHost(first)
}

function isMainDomainHost(host) {
  return MAIN_DOMAIN_SET.has(canonicalHost(host))
}

/** Chuẩn hoá tên miền riêng (seller): shop.example.com */
function normalizeCustomDomainInput(raw) {
  if (raw == null || String(raw).trim() === '') return { value: null }
  let x = String(raw).trim().toLowerCase()
  x = x.replace(/^https?:\/\//, '')
  x = x.split('/')[0].split('?')[0]
  x = x.split(':')[0]
  if (x.startsWith('www.')) x = x.slice(4)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(x)) {
    return { error: 'Tên miền không hợp lệ (vd: shop.example.com)' }
  }
  return { value: x }
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

/** Kiểm tra xem gói có phải Premium không (không phải Free/Ads) */
function isNetflixPremiumPlan(planStr) {
  if (!planStr || typeof planStr !== 'string') return false
  const lower = planStr.toLowerCase().trim()
  if (!lower) return false
  // Các gói KHÔNG phải premium
  const nonPremium = ['ads', 'free', 'with ads', 'standard with ads', 'basic with ads']
  if (nonPremium.some(kw => lower.includes(kw))) return false
  // Nếu không chứa keyword free/ads → coi là premium
  return true
}

/**
 * Kiểm tra chi tiết tài khoản: alive + thông tin gói
 * @returns {{ alive: boolean, hasPremium: boolean, plan: string, email: string, screens: number|null, raw: object }}
 */
async function checkAccountDetails(resourceValue) {
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
    try { data = result.json() } catch { return { alive: false, hasPremium: false, plan: null, email: null, screens: null, raw: null } }

    const alive      = data?.status === 'SUCCESS'
    const plan       = data?.plan || data?.subscription || null
    const hasPremium = alive && isNetflixPremiumPlan(plan)
    const email      = data?.email || null
    const screens    = data?.max_streams != null ? parseInt(data.max_streams) : null

    return { alive, hasPremium, plan, email, screens, raw: data }
  } catch {
    return { alive: false, hasPremium: false, plan: null, email: null, screens: null, raw: null }
  }
}

/** Backward-compat wrapper — chỉ trả true/false */
async function checkAccountAlive(resourceValue) {
  const details = await checkAccountDetails(resourceValue)
  return details.alive
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

  let candidates
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
    console.log(`[Auto-Pay] Checking ${res.id.substring(0, 8)} (${res.assigned_count || 0}/${maxSlots} slots)...`)
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

// ── Assign stock product (non-Netflix auto-delivery) ──────────────
async function assignStockProduct(subId, service) {
  const client = await dbPool.connect()
  try {
    // Find first available stock resource for this service
    const r = await client.query(
      `SELECT id, value FROM resources
       WHERE account_type = 'stock'
         AND service = $1
         AND status = 'available'
       ORDER BY created_at ASC LIMIT 1`,
      [service]
    )
    if (!r.rows.length) return null
    const resource = r.rows[0]

    // Mark resource as assigned
    await client.query(
      `UPDATE resources SET status = 'assigned', assigned_count = COALESCE(assigned_count,0) + 1
       WHERE id = $1`,
      [resource.id]
    )
    // Set delivery content on subscription
    await client.query(
      `UPDATE subscriptions SET login_link = $1 WHERE id = $2`,
      [resource.value, subId]
    )
    return resource.value
  } catch (err) {
    console.error('[assignStockProduct]', err.message)
    return null
  } finally {
    client.release()
  }
}

// ── Get plan service & fulfillment_type ───────────────────────────
async function getPlanMeta(planId) {
  const client = await dbPool.connect()
  try {
    const r = await client.query(
      `SELECT service, fulfillment_type FROM plans WHERE id = $1 LIMIT 1`,
      [planId]
    )
    return r.rows[0] || { service: 'netflix', fulfillment_type: 'netflix' }
  } catch {
    return { service: 'netflix', fulfillment_type: 'netflix' }
  } finally {
    client.release()
  }
}

async function processConfirmedPayment(transferContent, amount) {
  const outcome = await activatePayment(transferContent, Math.round(amount || 0))
  console.log(`[Auto-Pay] ${transferContent} →`, JSON.stringify(outcome))
  if (!outcome.success) return outcome

  const planMeta = await getPlanMeta(outcome.plan)
  const service = planMeta.service || 'netflix'
  const fulfillment = planMeta.fulfillment_type || 'netflix'
  const isNetflix = service === 'netflix'
  const isStock   = fulfillment === 'stock'
  const isManual  = fulfillment === 'manual'

  const cfg = await getAllSettings()
  const siteName = cfg.site_name || 'Netflix Store'
  const planLabel = outcome.plan || '?'
  const days = outcome.duration_days || '?'

  let loginLink = null

  if (isNetflix) {
    // ── Netflix: assign from verified account pool ──
    loginLink = await assignVerifiedAccount(outcome.subscription_id)
    if (!loginLink) {
      console.warn(`[Auto-Pay] ⚠️ No alive account for sub ${outcome.subscription_id}`)
    }
    const availCount = await countAvailableAccounts()

    sendTelegram(
      `🛒 <b>Đơn Netflix mới!</b> — ${siteName}\n` +
      `📦 Gói: <b>${planLabel}</b> (${days} ngày)\n` +
      `💰 Số tiền: <b>${Number(amount).toLocaleString('vi-VN')}₫</b>\n` +
      `🔑 Nội dung CK: <code>${transferContent}</code>\n` +
      `${loginLink ? '✅ Đã gán tài khoản tự động' : '⚠️ Chưa gán — kho trống!'}\n` +
      `📦 Kho còn lại: <b>${availCount}</b> tài khoản`
    )
    if (loginLink) {
      await sendActivationEmail(outcome.subscription_id, loginLink, planLabel, days, cfg)
    }

  } else if (isStock) {
    // ── Sản phẩm (stock): auto-assign từ kho sản phẩm ──
    loginLink = await assignStockProduct(outcome.subscription_id, service)
    if (!loginLink) {
      console.warn(`[Auto-Pay] ⚠️ Kho sản phẩm ${service} trống cho sub ${outcome.subscription_id}`)
    }
    sendTelegram(
      `🛒 <b>Đơn sản phẩm mới!</b> — ${siteName}\n` +
      `📦 Gói: <b>${planLabel}</b> (${service})\n` +
      `💰 Số tiền: <b>${Number(amount).toLocaleString('vi-VN')}₫</b>\n` +
      `🔑 Nội dung CK: <code>${transferContent}</code>\n` +
      `${loginLink ? '✅ Đã giao từ kho tự động' : '⚠️ Kho trống — cần giao tay!'}`
    )

  } else if (isManual) {
    // ── Dịch vụ (manual): thông báo admin xử lý tay ──
    sendTelegram(
      `🔧 <b>Đơn dịch vụ cần xử lý!</b> — ${siteName}\n` +
      `📦 Gói: <b>${planLabel}</b> (${service})\n` +
      `💰 Số tiền: <b>${Number(amount).toLocaleString('vi-VN')}₫</b>\n` +
      `🔑 Nội dung CK: <code>${transferContent}</code>\n` +
      `⚠️ <b>Cần admin xử lý thủ công:</b> Vào Admin → Sản phẩm khác → Dịch vụ → Xác nhận đơn này.`
    )
    console.log(`[Auto-Pay] Manual service order: sub=${outcome.subscription_id}, plan=${planLabel}`)
  }

  const availCount = await countAvailableAccounts()

  // Notify seller store if applicable
  try {
    const pg = await dbPool.connect()
    try {
      const sr = await pg.query(
        `SELECT s.telegram_bot_token, s.telegram_chat_id, s.display_name
         FROM payments p
         JOIN seller_stores s ON s.id = p.seller_store_id
         WHERE p.transfer_content = $1 AND p.seller_store_id IS NOT NULL
         LIMIT 1`,
        [transferContent]
      )
      const row = sr.rows[0]
      if (row?.telegram_bot_token && row.telegram_chat_id) {
        await sendTelegramWithToken(
          row.telegram_bot_token,
          row.telegram_chat_id,
          `🛒 <b>Đơn từ gian hàng của bạn</b> — ${row.display_name || ''}\n` +
            `📦 Gói: <b>${planLabel}</b>\n` +
            `💰 <b>${Number(amount).toLocaleString('vi-VN')}₫</b>\n` +
            `🔑 CK: <code>${transferContent}</code>`
        )
      }
    } finally {
      pg.release()
    }
  } catch (e) {
    console.warn('[Seller TG notify]', e.message)
  }

  if (isNetflix && availCount <= 3) {
    sendTelegram(
      `⚠️ <b>CẢNH BÁO KHO NETFLIX!</b>\n` +
      `Chỉ còn <b>${availCount}</b> tài khoản sẵn sàng.\n` +
      `Hãy bổ sung ngay!`
    )
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
/**
 * Tự động hủy đơn pending quá 30 phút chưa thanh toán.
 * Chạy mỗi 5 phút.
 */
async function runPendingCancellationJob() {
  let client
  try {
    client = await dbPool.connect()

    // Tìm subscriptions pending quá 30 phút
    const subs = await client.query(`
      SELECT s.id, s.user_id, s.plan, s.created_at,
             u.email AS user_email
      FROM subscriptions s
      LEFT JOIN auth.users u ON u.id = s.user_id
      WHERE s.status = 'pending'
        AND s.created_at < NOW() - INTERVAL '30 minutes'
    `)

    if (subs.rowCount === 0) return 0

    const ids = subs.rows.map(r => r.id)
    console.log(`[AutoCancel] Cancelling ${ids.length} pending subscription(s) older than 30min`)

    // Hủy subscriptions
    await client.query(`
      UPDATE subscriptions
      SET status = 'cancelled'
      WHERE id = ANY($1::uuid[])
        AND status = 'pending'
    `, [ids])

    // Hủy payments liên quan
    await client.query(`
      UPDATE payments
      SET status = 'failed'
      WHERE subscription_id = ANY($1::uuid[])
        AND status = 'pending'
    `, [ids])

    // Telegram notify admin (tổng hợp)
    if (ids.length > 0) {
      sendTelegram(
        `🗑️ <b>Tự động hủy ${ids.length} đơn hàng</b>\n` +
        `Lý do: Chưa thanh toán sau 30 phút.\n` +
        subs.rows.slice(0, 5).map(r =>
          `• ${r.user_email || r.user_id} — ${r.plan} (${new Date(r.created_at).toLocaleString('vi-VN')})`
        ).join('\n') +
        (ids.length > 5 ? `\n... và ${ids.length - 5} đơn khác.` : '')
      )
    }

    return ids.length
  } catch (err) {
    console.error('[AutoCancel] ❌', err.message)
    return 0
  } finally {
    if (client) client.release()
  }
}

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
      await client.query(`UPDATE subscriptions SET reminder_sent = true WHERE id = $1`, [sub.id]).catch(() => { })
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
  let candidates

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
    const details = await checkAccountDetails(cookie)
    res.json({ alive: details.alive, raw: details.raw })
  } catch (err) {
    res.status(500).json({ alive: false, message: err.message })
  }
})

/**
 * POST /api/check-plan-status
 * Kiểm tra cookie còn sống VÀ có gói Premium hay không.
 * Body: { cookie: string }
 * Response: { alive, hasPremium, plan, email, screens, needsWarranty, reason }
 */
app.post('/api/check-plan-status', async (req, res) => {
  try {
    const { cookie } = req.body
    if (!cookie) return res.status(400).json({ success: false, message: 'Missing cookie' })

    const details = await checkAccountDetails(cookie)

    let needsWarranty = false
    let reason = null

    if (!details.alive) {
      needsWarranty = true
      reason = 'cookie_dead'          // Cookie hết hạn / die
    } else if (!details.hasPremium) {
      needsWarranty = true
      reason = 'plan_lost'            // Cookie sống nhưng mất gói Premium
    }

    res.json({
      alive:          details.alive,
      hasPremium:     details.hasPremium,
      plan:           details.plan,
      email:          details.email,
      screens:        details.screens,
      needsWarranty,
      reason,         // 'cookie_dead' | 'plan_lost' | null
    })
  } catch (err) {
    res.status(500).json({ alive: false, hasPremium: false, needsWarranty: true, reason: 'error', message: err.message })
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

/** Công khai: bài hướng dẫn (đã xuất bản). Dữ liệu lưu settings.guides_config (JSON). */
app.get('/api/guides', async (req, res) => {
  try {
    const raw = await getSetting('guides_config')
    let cfg = null
    if (raw && String(raw).trim()) {
      try {
        cfg = JSON.parse(String(raw))
      } catch {
        cfg = null
      }
    }
    const useFallback = !cfg || !Array.isArray(cfg.posts)
    const introTitle = (cfg && typeof cfg.introTitle === 'string' && cfg.introTitle.trim())
      ? cfg.introTitle.trim()
      : GUIDES_PUBLIC_FALLBACK.introTitle
    const introSubtitle = (cfg && typeof cfg.introSubtitle === 'string')
      ? cfg.introSubtitle
      : GUIDES_PUBLIC_FALLBACK.introSubtitle
    let posts = useFallback ? GUIDES_PUBLIC_FALLBACK.posts : cfg.posts
    if (!Array.isArray(posts)) posts = []

    const out = posts
      .filter((p) => p && typeof p === 'object' && p.published !== false)
      .map((p) => {
        const slug = String(p.slug || p.id || '')
          .trim()
          .replace(/^\/+|\/+$/g, '')
        return {
          id: String(p.id || slug || ''),
          slug,
          title: String(p.title || '').trim(),
          bodyMd: String(p.bodyMd || p.body || ''),
          youtubeUrl: String(p.youtubeUrl || '').trim(),
          updatedAt: p.updatedAt || null,
          order: Number.isFinite(Number(p.order)) ? Number(p.order) : 0
        }
      })
      .filter((p) => p.slug && p.title)
      .sort((a, b) => a.order - b.order)

    res.json({
      introTitle,
      introSubtitle,
      posts: out
    })
  } catch (err) {
    res.status(500).json({ message: err.message || 'Lỗi guides' })
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

/** Khách báo không xem được — lưu DB + Telegram admin (xử lý tay). Cookie die → dùng Bảo hành / claim_warranty. */
app.post('/api/report-cannot-view', requireUser, async (req, res) => {
  const subscriptionId = req.body?.subscriptionId
  if (!subscriptionId) {
    return res.status(400).json({ success: false, message: 'Thiếu subscriptionId' })
  }
  const client = await dbPool.connect()
  try {
    const subR = await client.query(
      `SELECT id, user_id, plan, status FROM subscriptions WHERE id = $1 LIMIT 1`,
      [subscriptionId]
    )
    if (subR.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' })
    }
    const sub = subR.rows[0]
    if (String(sub.user_id) !== String(req.authUserId)) {
      return res.status(403).json({ success: false, message: 'Không phải đơn của bạn' })
    }

    const ins = await client.query(
      `INSERT INTO viewer_reports (subscription_id, user_id, kind, status)
       VALUES ($1, $2, 'cannot_view', 'open')
       RETURNING id, created_at`,
      [subscriptionId, req.authUserId]
    )

    sendTelegram(
      `\u{1F6A8} <b>Báo không xem được</b> (admin xử lý tay)\n` +
      `Đơn: <code>${subscriptionId}</code>\n` +
      `Gói: ${sub.plan} · Trạng thái: ${sub.status}\n` +
      `<i>Cookie die / mất gói → user dùng Bảo hành tự động.</i>`
    )

    res.json({ success: true, id: ins.rows[0].id, createdAt: ins.rows[0].created_at })
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(500).json({
        success: false,
        message: 'Chưa tạo bảng viewer_reports — chạy supabase/viewer_reports.sql trên database.'
      })
    }
    console.error('[report-cannot-view]', err)
    res.status(500).json({ success: false, message: err.message })
  } finally {
    client.release()
  }
})

app.get('/api/admin/viewer-reports', requireAdmin, async (req, res) => {
  const status = req.query.status
  const client = await dbPool.connect()
  try {
    const r = await client.query(
      `SELECT vr.id, vr.subscription_id, vr.user_id, vr.kind, vr.status, vr.created_at, vr.resolved_at, vr.admin_note,
              p.email AS user_email,
              s.plan AS sub_plan, s.status AS sub_status, s.end_at AS sub_end_at
       FROM viewer_reports vr
       LEFT JOIN profiles p ON p.id = vr.user_id
       LEFT JOIN subscriptions s ON s.id = vr.subscription_id
       WHERE ($1::text IS NULL OR $1 = '' OR $1 = 'all' OR vr.status = $1)
       ORDER BY vr.created_at DESC
       LIMIT 300`,
      [status || 'open']
    )
    res.json({ reports: r.rows })
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ reports: [], hint: 'Chạy supabase/viewer_reports.sql' })
    }
    console.error('[admin/viewer-reports]', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

app.patch('/api/admin/viewer-reports/:id', requireAdmin, async (req, res) => {
  const id = req.params.id
  const { status, admin_note } = req.body || {}
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu id' })
  if (status !== 'resolved' && status !== 'open' && status !== 'rejected') {
    return res.status(400).json({ success: false, message: 'status phải là resolved, rejected hoặc open' })
  }
  if (status === 'rejected') {
    const note = String(admin_note || '').trim()
    if (!note) {
      return res.status(400).json({ success: false, message: 'Tu choi can kem ghi chu gui khach (admin_note).' })
    }
  }
  const client = await dbPool.connect()
  try {
    const noteParam =
      status === 'rejected'
        ? String(admin_note).trim()
        : admin_note != null
          ? String(admin_note)
          : null
    const resolvedAt = status === 'resolved' || status === 'rejected' ? new Date().toISOString() : null
    const r = await client.query(
      `UPDATE viewer_reports
       SET status = $2,
           admin_note = CASE
             WHEN $2 = 'rejected' THEN $3::text
             WHEN $3::text IS NOT NULL THEN $3::text
             ELSE admin_note
           END,
           resolved_at = CASE WHEN $2 IN ('resolved', 'rejected') THEN COALESCE($4::timestamptz, now()) ELSE NULL END
       WHERE id = $1
       RETURNING id, status, resolved_at, admin_note, user_id, subscription_id`,
      [id, status, noteParam, resolvedAt]
    )
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo' })
    const row = r.rows[0]
    if (status === 'rejected') {
      const pr = await client.query(`SELECT email FROM profiles WHERE id = $1 LIMIT 1`, [row.user_id])
      const to = pr.rows[0]?.email
      const site = (await getSetting('site_name')) || 'Dịch vụ'
      await sendEmail(
        to,
        `${site} — Phan hoi bao khong xem duoc`,
        `<p>Xin chào,</p>
         <p>Chúng tôi đã kiểm tra yêu cầu <strong>báo không xem được</strong> liên quan đơn của bạn.</p>
         <p style="padding:12px 14px;background:#f4f4f5;border-radius:8px;border-left:4px solid #6366f1;">
           ${String(row.admin_note || '')
             .replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/\n/g, '<br>')}
         </p>
         <p>Neu ban van gap kho khan, vui long lien he ho tro.</p>`
      )
    }
    res.json({ success: true, row })
  } catch (err) {
    console.error('[admin/viewer-reports patch]', err)
    res.status(500).json({ success: false, message: err.message })
  } finally {
    client.release()
  }
})

/** Admin: gan acc tu kho cho don (claim_warranty hoac body.resourceId). */
app.post('/api/admin/viewer-reports/:id/assign-from-pool', requireAdmin, async (req, res) => {
  const id = req.params.id
  const resourceIdRaw = req.body?.resourceId
  const adminNote = req.body?.admin_note != null ? String(req.body.admin_note) : null
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu id' })
  const client = await dbPool.connect()
  try {
    await client.query('BEGIN')
    const rep = await client.query(
      `SELECT id, subscription_id, user_id, status FROM viewer_reports WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (rep.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo' })
    }
    const vr = rep.rows[0]
    if (vr.status !== 'open') {
      await client.query('ROLLBACK')
      return res.status(400).json({ success: false, message: 'Bao cao khong con o trang thai cho xu ly.' })
    }
    const subId = vr.subscription_id
    const resourceId = resourceIdRaw && String(resourceIdRaw).trim() ? String(resourceIdRaw).trim() : null

    if (resourceId) {
      const subR = await client.query(
        `SELECT id, user_id, status, login_link FROM subscriptions WHERE id = $1 FOR UPDATE`,
        [subId]
      )
      if (subR.rowCount === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' })
      }
      const sub = subR.rows[0]
      if (sub.status !== 'active') {
        await client.query('ROLLBACK')
        return res.status(400).json({ success: false, message: 'Don khong o trang thai active.' })
      }
      const resR = await client.query(
        `SELECT id, value, status, assigned_count, COALESCE(max_slots, 5) AS max_slots
         FROM resources WHERE id = $1 FOR UPDATE`,
        [resourceId]
      )
      if (resR.rowCount === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản kho' })
      }
      const resRow = resR.rows[0]
      if (resRow.status !== 'available') {
        await client.query('ROLLBACK')
        return res.status(400).json({ success: false, message: 'Tài khoản kho không còn trạng thái available' })
      }
      const maxSlots = resRow.max_slots || 5
      const used = resRow.assigned_count || 0
      if (used >= maxSlots) {
        await client.query('ROLLBACK')
        return res.status(400).json({ success: false, message: 'Tài khoản kho đã hết slot' })
      }
      const dup = await client.query(
        `SELECT 1 FROM subscriptions
         WHERE user_id = $1 AND status = 'active' AND id != $2 AND login_link IS NOT NULL AND login_link = $3
         LIMIT 1`,
        [sub.user_id, subId, resRow.value]
      )
      if (dup.rowCount > 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          success: false,
          message: 'Khách đã có đơn active khác trùng tài khoản này — chọn acc khác.'
        })
      }
      const newCount = used + 1
      const newStatus = newCount >= maxSlots ? 'full' : 'available'
      await client.query(
        `UPDATE resources SET assigned_count = $1, status = $2, assigned_to = $3 WHERE id = $4`,
        [newCount, newStatus, subId, resourceId]
      )
      await client.query(`UPDATE subscriptions SET login_link = $1, updated_at = NOW() WHERE id = $2`, [
        resRow.value,
        subId
      ])
    } else {
      const w = await client.query(`SELECT claim_warranty($1::uuid) AS j`, [subId])
      let j = w.rows[0]?.j
      if (j && typeof j === 'string') {
        try {
          j = JSON.parse(j)
        } catch {
          j = { success: false, message: j }
        }
      }
      if (!j || !j.success) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          success: false,
          message: (j && j.message) || 'Khong gan duoc tu kho (claim_warranty that bai)'
        })
      }
    }

    const resolvedAt = new Date().toISOString()
    await client.query(
      `UPDATE viewer_reports
       SET status = 'resolved',
           admin_note = COALESCE($2::text, admin_note),
           resolved_at = COALESCE($3::timestamptz, now())
       WHERE id = $1`,
      [id, adminNote, resolvedAt]
    )
    await client.query('COMMIT')

    sendTelegram(
      `\u2705 <b>Admin da gan acc tu kho</b> (bao khong xem)\n` +
        `Bao cao: <code>${id}</code>\nDon: <code>${subId}</code>`
    )
    res.json({ success: true, message: 'Da gan tai khoan tu kho va danh dau bao cao da xu ly.' })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    if (err.code === '42883') {
      return res.status(500).json({
        success: false,
        message: 'Thiếu hàm claim_warranty trên database — chạy supabase_functions.sql (hoặc buyer_schema).'
      })
    }
    console.error('[admin/viewer-reports assign-from-pool]', err)
    res.status(500).json({ success: false, message: err.message })
  } finally {
    client.release()
  }
})

/** User: latest rejected viewer_report note per subscription (dashboard). */
app.get('/api/viewer-report-notices', requireUser, async (req, res) => {
  const client = await dbPool.connect()
  try {
    const r = await client.query(
      `SELECT DISTINCT ON (subscription_id)
         id, subscription_id, admin_note, resolved_at
       FROM viewer_reports
       WHERE user_id = $1
         AND status = 'rejected'
         AND admin_note IS NOT NULL
         AND trim(admin_note) <> ''
       ORDER BY subscription_id, resolved_at DESC NULLS LAST`,
      [req.authUserId]
    )
    res.json({ notices: r.rows })
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ notices: [] })
    }
    console.error('[viewer-report-notices]', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
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

app.post('/api/admin/cancel-pending', requireAdmin, async (req, res) => {
  try {
    const count = await runPendingCancellationJob()
    res.json({ success: true, cancelled: count, message: `Đã hủy ${count} đơn chờ quá 30 phút` })
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
          COUNT(*) FILTER (WHERE status = 'available'
            AND COALESCE(account_type,'shared') != 'stock') AS netflix_available,
          COUNT(*) FILTER (WHERE status = 'available'
            AND account_type = 'stock') AS stock_available,
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
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ROLLBACK có thể lỗi nếu kết nối đứt */
      }
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

// ===================== SELLER PUBLIC BUNDLE (giá + thanh toán) =====================
async function fetchMergedPlansForStore(client, storeId) {
  const r = await client.query(
    `SELECT p.id, p.name, p.duration_days, p.price AS base_price,
            COALESCE(sp.price, p.price)::int AS price
     FROM plans p
     LEFT JOIN seller_store_plan_prices sp
       ON sp.plan_id = p.id AND sp.seller_store_id = $1
     ORDER BY p.price ASC`,
    [storeId]
  )
  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    duration_days: row.duration_days,
    price: row.price,
    base_price: row.base_price
  }))
}

function resolvePaymentDisplay(storeRow, settings) {
  const s = settings || {}
  const useSeller = storeRow && storeRow.bank_account && String(storeRow.bank_account).trim() !== ''
  const bin = (v) => {
    const t = v && String(v).trim()
    return t && /^\d{6}$/.test(t) ? t : '970422'
  }
  return {
    source: useSeller ? 'seller' : 'site',
    bank_name: useSeller ? (storeRow.bank_name || 'Ngân hàng') : (s.bank_name || 'MB Bank'),
    bank_account: useSeller ? storeRow.bank_account : (s.bank_account || ''),
    bank_owner: useSeller ? (storeRow.bank_owner || '') : (s.bank_owner || ''),
    momo_number: useSeller ? (storeRow.momo_number || '') : (s.momo_number || ''),
    momo_name: useSeller ? (storeRow.momo_name || '') : (s.momo_name || ''),
    vietqr_bank_bin: useSeller ? bin(storeRow.vietqr_bank_bin) : bin(s.vietqr_bank_bin)
  }
}

function pickPublicStoreFields(row) {
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    display_name: row.display_name,
    tagline: row.tagline,
    theme_primary: row.theme_primary,
    custom_domain: row.custom_domain,
    created_at: row.created_at
  }
}

async function buildPublicStoreBundle(client, storeRow) {
  const settings = await getAllSettings()
  let plans
  try {
    plans = await fetchMergedPlansForStore(client, storeRow.id)
  } catch (e) {
    if (e.message && e.message.includes('seller_store_plan_prices')) {
      plans = []
    } else throw e
  }
  const payment = resolvePaymentDisplay(storeRow, settings)
  return { store: pickPublicStoreFields(storeRow), plans, payment }
}

function maskSellerStoreResponse(row) {
  if (!row) return null
  const o = { ...row }
  if (o.gmail_app_password) {
    o.has_gmail_password = true
    delete o.gmail_app_password
  }
  if (o.telegram_bot_token) {
    o.has_telegram_bot_token = true
    delete o.telegram_bot_token
  }
  return o
}

// ===================== SELLER STORES (web con) =====================
/** Phải đặt TRƯỚC /api/store/:slug — nhận diện gian hàng theo Host (tên miền riêng) */
app.get('/api/store/by-host', async (req, res) => {
  try {
    const host = normalizeRequestHost(req)
    if (!host || isMainDomainHost(host)) {
      return res.status(404).json({ error: 'not_custom_domain' })
    }
    const client = await dbPool.connect()
    try {
      const r = await client.query(
        `SELECT * FROM seller_stores
         WHERE lower(trim(custom_domain)) = $1 AND is_active = true
         LIMIT 1`,
        [host]
      )
      if (r.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy gian hàng cho tên miền này' })
      const bundle = await buildPublicStoreBundle(client, r.rows[0])
      res.json(bundle)
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.message && err.message.includes('custom_domain')) {
      return res.status(503).json({ error: 'Chạy supabase/fix_seller_custom_domain.sql' })
    }
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/checkout/quote', async (req, res) => {
  try {
    const planId = String(req.query.planId || '').trim()
    const sellerStoreId = String(req.query.sellerStoreId || '').trim()
    if (!planId) return res.status(400).json({ message: 'Thiếu planId' })
    const client = await dbPool.connect()
    try {
      const pr = await client.query(`SELECT * FROM plans WHERE id = $1`, [planId])
      if (!pr.rows[0]) return res.status(404).json({ message: 'Gói không tồn tại' })
      const base = pr.rows[0]
      let price = base.price
      let payment
      if (sellerStoreId) {
        const sp = await client.query(
          `SELECT price FROM seller_store_plan_prices WHERE seller_store_id = $1 AND plan_id = $2`,
          [sellerStoreId, planId]
        )
        if (sp.rows[0]) price = sp.rows[0].price
        const st = await client.query(
          `SELECT * FROM seller_stores WHERE id = $1 AND is_active = true`,
          [sellerStoreId]
        )
        if (!st.rows[0]) return res.status(404).json({ message: 'Gian hàng không tồn tại' })
        payment = resolvePaymentDisplay(st.rows[0], await getAllSettings())
      } else {
        payment = resolvePaymentDisplay(null, await getAllSettings())
      }
      res.json({
        plan: {
          id: base.id,
          name: base.name,
          duration_days: base.duration_days,
          price,
          base_price: base.price
        },
        payment
      })
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

app.get('/api/public/plans', async (req, res) => {
  try {
    const sellerStoreId = String(req.query.sellerStoreId || '').trim()
    if (!sellerStoreId) return res.status(400).json({ message: 'Thiếu sellerStoreId' })
    const client = await dbPool.connect()
    try {
      const plans = await fetchMergedPlansForStore(client, sellerStoreId)
      res.json({ plans })
    } catch (e) {
      if (e.message && e.message.includes('seller_store_plan_prices')) {
        return res.status(503).json({ message: 'Chạy supabase/fix_seller_reseller_config.sql' })
      }
      throw e
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

app.get('/api/store/:slug', async (req, res) => {
  try {
    const slug = normalizeSellerSlug(req.params.slug)
    if (!SELLER_SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'Slug không hợp lệ' })
    }
    const client = await dbPool.connect()
    try {
      const r = await client.query(`SELECT * FROM seller_stores WHERE slug = $1 AND is_active = true LIMIT 1`, [slug])
      if (r.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy gian hàng' })
      const bundle = await buildPublicStoreBundle(client, r.rows[0])
      res.json(bundle)
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.message && err.message.includes('seller_stores')) {
      return res.status(503).json({ error: 'Chưa cấu hình bảng seller_stores (chạy supabase/fix_seller_stores.sql)' })
    }
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/seller/store', requireSellerOrAdmin, async (req, res) => {
  try {
    const client = await dbPool.connect()
    try {
      const r = await client.query(`SELECT * FROM seller_stores WHERE owner_id = $1 LIMIT 1`, [req.sellerUserId])
      res.json(maskSellerStoreResponse(r.rows[0] || null))
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.message && err.message.includes('seller_stores')) {
      return res.status(503).json({ message: 'Chưa có bảng seller_stores' })
    }
    res.status(500).json({ message: err.message })
  }
})

app.post('/api/seller/store', requireSellerOrAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const slug = normalizeSellerSlug(body.slug)
    const display_name = String(body.display_name || '').trim().slice(0, 120)
    const tagline = String(body.tagline || '').trim().slice(0, 240)
    const theme_primary = String(body.theme_primary || '#E50914').trim().slice(0, 32)
    let custom_domain = null
    if (body.custom_domain != null && String(body.custom_domain).trim() !== '') {
      const d = normalizeCustomDomainInput(body.custom_domain)
      if (d.error) return res.status(400).json({ message: d.error })
      custom_domain = d.value
      if (isMainDomainHost(custom_domain)) {
        return res.status(400).json({ message: 'Không dùng tên miền chính của hệ thống làm tên miền gian hàng' })
      }
    }

    if (!SELLER_SLUG_RE.test(slug)) {
      return res.status(400).json({ message: 'Slug 3–32 ký tự, chữ thường, số và dấu gạch ngang' })
    }
    if (!display_name) return res.status(400).json({ message: 'Thiếu tên hiển thị (display_name)' })

    const client = await dbPool.connect()
    try {
      const ex = await client.query(`SELECT id FROM seller_stores WHERE owner_id = $1 LIMIT 1`, [req.sellerUserId])
      if (ex.rows.length > 0) {
        return res.status(409).json({ message: 'Bạn đã có gian hàng — dùng PATCH để sửa' })
      }
      const taken = await client.query(`SELECT id FROM seller_stores WHERE slug = $1 LIMIT 1`, [slug])
      if (taken.rows.length > 0) return res.status(409).json({ message: 'Slug đã được dùng' })

      const ins = await client.query(
        `INSERT INTO seller_stores (owner_id, slug, display_name, tagline, theme_primary, custom_domain)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, slug, display_name, tagline, theme_primary, is_active, created_at, custom_domain`,
        [req.sellerUserId, slug, display_name, tagline, theme_primary, custom_domain]
      )
      res.status(201).json(ins.rows[0])
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.code === '23505') {
      const m = String(err.message || '')
      if (m.includes('custom_domain')) return res.status(409).json({ message: 'Tên miền này đã được dùng' })
      return res.status(409).json({ message: 'Slug trùng' })
    }
    if (err.message && err.message.includes('seller_stores')) {
      return res.status(503).json({ message: 'Chưa có bảng seller_stores' })
    }
    if (err.message && err.message.includes('custom_domain')) {
      return res.status(503).json({ message: 'Chạy supabase/fix_seller_custom_domain.sql' })
    }
    res.status(500).json({ message: err.message })
  }
})

app.patch('/api/seller/store', requireSellerOrAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const client = await dbPool.connect()
    try {
      const cur = await client.query(`SELECT id FROM seller_stores WHERE owner_id = $1 LIMIT 1`, [req.sellerUserId])
      if (cur.rows.length === 0) return res.status(404).json({ message: 'Chưa có gian hàng — dùng POST để tạo' })

      const updates = []
      const vals = []
      let n = 1

      if (body.slug != null) {
        const slug = normalizeSellerSlug(body.slug)
        if (!SELLER_SLUG_RE.test(slug)) {
          return res.status(400).json({ message: 'Slug không hợp lệ' })
        }
        updates.push(`slug = $${n++}`)
        vals.push(slug)
      }
      if (body.display_name != null) {
        updates.push(`display_name = $${n++}`)
        vals.push(String(body.display_name).trim().slice(0, 120))
      }
      if (body.tagline != null) {
        updates.push(`tagline = $${n++}`)
        vals.push(String(body.tagline).trim().slice(0, 240))
      }
      if (body.theme_primary != null) {
        updates.push(`theme_primary = $${n++}`)
        vals.push(String(body.theme_primary).trim().slice(0, 32))
      }
      if (body.is_active != null) {
        updates.push(`is_active = $${n++}`)
        vals.push(!!body.is_active)
      }
      if (body.custom_domain !== undefined) {
        const d = normalizeCustomDomainInput(body.custom_domain)
        if (d.error) return res.status(400).json({ message: d.error })
        if (d.value && isMainDomainHost(d.value)) {
          return res.status(400).json({ message: 'Không dùng tên miền chính của hệ thống làm tên miền gian hàng' })
        }
        updates.push(`custom_domain = $${n++}`)
        vals.push(d.value)
      }
      if (body.bank_name != null) {
        updates.push(`bank_name = $${n++}`)
        vals.push(String(body.bank_name).trim().slice(0, 120))
      }
      if (body.bank_account != null) {
        updates.push(`bank_account = $${n++}`)
        vals.push(String(body.bank_account).trim().slice(0, 64))
      }
      if (body.bank_owner != null) {
        updates.push(`bank_owner = $${n++}`)
        vals.push(String(body.bank_owner).trim().slice(0, 120))
      }
      if (body.momo_number != null) {
        updates.push(`momo_number = $${n++}`)
        vals.push(String(body.momo_number).trim().slice(0, 32))
      }
      if (body.momo_name != null) {
        updates.push(`momo_name = $${n++}`)
        vals.push(String(body.momo_name).trim().slice(0, 120))
      }
      if (body.vietqr_bank_bin != null) {
        const b = String(body.vietqr_bank_bin).trim()
        if (b && !/^\d{6}$/.test(b)) return res.status(400).json({ message: 'Mã BIN VietQR phải đúng 6 chữ số' })
        updates.push(`vietqr_bank_bin = $${n++}`)
        vals.push(b || null)
      }
      if (body.gmail_user != null) {
        updates.push(`gmail_user = $${n++}`)
        vals.push(String(body.gmail_user).trim().slice(0, 200))
      }
      if (body.gmail_app_password !== undefined) {
        const gp = body.gmail_app_password
        if (gp === null || gp === '') {
          updates.push(`gmail_app_password = $${n++}`)
          vals.push(null)
        } else if (String(gp).trim()) {
          updates.push(`gmail_app_password = $${n++}`)
          vals.push(String(gp).slice(0, 128))
        }
      }
      if (body.telegram_bot_token !== undefined) {
        const t = body.telegram_bot_token
        if (t === null || t === '') {
          updates.push(`telegram_bot_token = $${n++}`)
          vals.push(null)
        } else if (String(t).trim()) {
          updates.push(`telegram_bot_token = $${n++}`)
          vals.push(String(t).slice(0, 256))
        }
      }
      if (body.telegram_chat_id != null) {
        updates.push(`telegram_chat_id = $${n++}`)
        vals.push(String(body.telegram_chat_id).trim().slice(0, 64))
      }
      if (body.reseller_guide != null) {
        updates.push(`reseller_guide = $${n++}`)
        vals.push(String(body.reseller_guide).slice(0, 20000))
      }

      if (updates.length === 0) return res.status(400).json({ message: 'Không có trường cập nhật' })

      updates.push(`updated_at = now()`)
      vals.push(req.sellerUserId)
      const whereIdx = vals.length

      const q = `UPDATE seller_stores SET ${updates.join(', ')} WHERE owner_id = $${whereIdx} RETURNING *`
      const r = await client.query(q, vals)
      res.json(maskSellerStoreResponse(r.rows[0]))
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.code === '23505') {
      const m = String(err.message || '')
      if (m.includes('custom_domain')) return res.status(409).json({ message: 'Tên miền này đã được dùng' })
      return res.status(409).json({ message: 'Slug trùng' })
    }
    if (err.message && err.message.includes('custom_domain')) {
      return res.status(503).json({ message: 'Chạy supabase/fix_seller_custom_domain.sql' })
    }
    res.status(500).json({ message: err.message })
  }
})

app.get('/api/seller/plan-prices', requireSellerOrAdmin, async (req, res) => {
  try {
    const client = await dbPool.connect()
    try {
      const st = await client.query(`SELECT id FROM seller_stores WHERE owner_id = $1 LIMIT 1`, [req.sellerUserId])
      if (!st.rows[0]) return res.json({ plans: [] })
      const plans = await fetchMergedPlansForStore(client, st.rows[0].id)
      res.json({ plans })
    } catch (e) {
      if (e.message && e.message.includes('seller_store_plan_prices')) {
        return res.status(503).json({ message: 'Chạy supabase/fix_seller_reseller_config.sql' })
      }
      throw e
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

app.put('/api/seller/plan-prices', requireSellerOrAdmin, async (req, res) => {
  try {
    const prices = req.body?.prices
    if (!prices || typeof prices !== 'object' || Array.isArray(prices)) {
      return res.status(400).json({ message: 'Body cần { prices: { month: 60000, ... } }' })
    }
    const client = await dbPool.connect()
    try {
      const st = await client.query(`SELECT id FROM seller_stores WHERE owner_id = $1 LIMIT 1`, [req.sellerUserId])
      if (!st.rows[0]) return res.status(404).json({ message: 'Chưa có gian hàng' })
      const storeId = st.rows[0].id
      await client.query('BEGIN')
      for (const [planId, rawPrice] of Object.entries(prices)) {
        const price = parseInt(rawPrice, 10)
        if (Number.isNaN(price) || price <= 0) continue
        await client.query(
          `INSERT INTO seller_store_plan_prices (seller_store_id, plan_id, price)
           VALUES ($1, $2, $3)
           ON CONFLICT (seller_store_id, plan_id) DO UPDATE SET price = EXCLUDED.price`,
          [storeId, planId, price]
        )
      }
      await client.query('COMMIT')
      const merged = await fetchMergedPlansForStore(client, storeId)
      res.json({ success: true, plans: merged })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      if (e.message && String(e.message).includes('không được thấp hơn')) {
        return res.status(400).json({ message: e.message })
      }
      if (e.message && e.message.includes('seller_store_plan_prices')) {
        return res.status(503).json({ message: 'Chạy supabase/fix_seller_reseller_config.sql' })
      }
      throw e
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/** Thống kê đơn thành công gắn với gian hàng (cần cột seller_store_id + migration) */
app.get('/api/seller/stats', requireSellerOrAdmin, async (req, res) => {
  try {
    const client = await dbPool.connect()
    try {
      const st = await client.query(`SELECT id, slug, display_name FROM seller_stores WHERE owner_id = $1 LIMIT 1`, [
        req.sellerUserId
      ])
      if (!st.rows[0]) return res.json({ store: null, orders: 0, revenue: 0 })

      const id = st.rows[0].id
      let orders = 0
      let revenue = 0
      try {
        const r = await client.query(
          `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0)::bigint AS rev
           FROM payments WHERE seller_store_id = $1 AND status = 'success'`,
          [id]
        )
        orders = r.rows[0]?.cnt ?? 0
        revenue = Number(r.rows[0]?.rev ?? 0)
      } catch (e) {
        if (e.message && e.message.includes('seller_store_id')) {
          return res.json({ store: st.rows[0], orders: 0, revenue: 0, _note: 'Chạy fix_seller_tracking.sql' })
        }
        throw e
      }
      res.json({ store: st.rows[0], orders, revenue })
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ===================== SCHEDULERS =====================

// Auto-cancel pending orders > 30 min — chạy mỗi 5 phút
setTimeout(() => {
  const tick = () => runPendingCancellationJob().catch(err => console.error('[AutoCancel]', err.message))
  tick()
  setInterval(tick, 5 * 60 * 1000) // 5 phút
}, 8000)

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
  console.log(`   GET  /api/guides`)
  console.log(`   POST /api/tv-init`)
  console.log(`   POST /api/tv-submit`)
  console.log(`   POST /sepay-webhook`)
  console.log(`   GET  /api/payment-status/:code`)
  console.log(`   GET  /api/sepay-debug`)
  console.log(`   GET  /api/test-db`)
  console.log(`   GET  /api/store/by-host  (tên miền riêng → Host header)`)
  console.log(`   GET  /api/store/:slug  (gian hàng công khai)`)
  console.log(`   GET/PATCH /api/seller/store  (seller JWT)`)
  console.log(`   GET  /api/checkout/quote  /api/public/plans  (giá đại lý)`)
  console.log(`   GET/PUT /api/seller/plan-prices`)
  console.log(`   MAIN_DOMAINS (site chính, không coi là gian hàng): ${[...MAIN_DOMAIN_SET].join(', ') || '(empty)'}`)
  console.log(`   SePay polling: every 5s ${SEPAY_API_TOKEN ? '✅ ACTIVE' : '❌ NO TOKEN'}`)
})