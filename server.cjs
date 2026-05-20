const path = require('path')
const fs = require('fs')
const dns = require('dns')
const crypto = require('crypto')
const zlib = require('zlib')
try {
  dns.setDefaultResultOrder('ipv4first')
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1'])
} catch { /* optional on older Node */ }

// Fix Node.js 22+/24 + OpenSSL 3: Atlas gửi SSL alert 80 (internal_error)
// Patch tls.createSecureContext — được gọi nội bộ bởi tls.connect và TLSSocket
// Object.assign đảm bảo maxVersion: 'TLSv1.2' LUÔN thắng mọi option khác
;(function patchTlsForAtlas() {
  try {
    const tls = require('tls')
    tls.DEFAULT_MAX_VERSION = 'TLSv1.2'
    tls.DEFAULT_MIN_VERSION = 'TLSv1.2'

    const _csc = tls.createSecureContext
    tls.createSecureContext = function (opts) {
      return _csc.call(tls, Object.assign({}, opts, { maxVersion: 'TLSv1.2' }))
    }

    const _connect = tls.connect
    tls.connect = function (options, ...rest) {
      if (options && typeof options === 'object') {
        options = Object.assign({}, options, { maxVersion: 'TLSv1.2' })
      }
      return _connect.call(tls, options, ...rest)
    }
  } catch (_) {}
})()

require('dotenv').config({ path: path.join(__dirname, '.env') })

const express = require('express')
const https = require('https')
const http = require('http')
const { MongoClient, ServerApiVersion } = require('mongodb')
const axios = require('axios')
const nodemailer = require('nodemailer')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { registerAdminRoutes } = require('./server/admin.cjs')

// ===================== DEBUG ENV =====================
function maskDbUrl(url) {
  if (!url) return '(empty)'
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')
}
console.log('[BOOT] .env path =', path.join(__dirname, '.env'))
console.log('[BOOT] MONGODB_URI =', maskDbUrl(process.env.MONGODB_URI))

// ===================== CONFIG =====================
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ''

const GMAIL_USER = process.env.GMAIL_USER || ''
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || ''
const EMAIL_FROM = process.env.EMAIL_FROM || GMAIL_USER

const ADMIN_SECRET = process.env.ADMIN_SECRET || ''
/** Webhook tùy chọn (định dạng cũ tương thích SePay VA) — xác nhận qua poll MBBank là chính. */
const SEPAY_WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET || ''

/** MB Bank qua <https://thueapibank.vn/home/mbbank> — poll lịch sử API. */
const MBBANK_PORTAL_URL = 'https://thueapibank.vn/home/mbbank'
const MBBANK_API_TOKEN = String(process.env.MBBANK_API_TOKEN || '').trim()
const MBBANK_HISTORY_BASE = String(
  process.env.MBBANK_HISTORY_BASE || 'https://thueapibank.vn/historyapimbbank'
).replace(/\/$/, '')

/** Fallback STK / chủ TK site khi bảng settings chưa điền (ưu tiên giá trị trong Admin). */
// Ưu tiên: BANK_ID / BANK_ACCOUNT_NO / BANK_ACCOUNT_NAME → DEFAULT_BANK_* → ''
const DEFAULT_BANK_NAME = process.env.BANK_ID || process.env.DEFAULT_BANK_NAME || ''
const DEFAULT_BANK_ACCOUNT = process.env.BANK_ACCOUNT_NO || process.env.DEFAULT_BANK_ACCOUNT || ''
const DEFAULT_BANK_OWNER = process.env.BANK_ACCOUNT_NAME || process.env.DEFAULT_BANK_OWNER || ''

/** JWT secret — dùng cho ký và xác thực token thay Supabase */
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_SECRET || 'changeme-please-set-JWT_SECRET'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d'

// ===================== EXPRESS =====================
const app = express()
app.use(express.json({ limit: '10mb' }))
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
let mongoClient = null
let db = null
let mongoTransactionsAvailable = true

async function connectMongo() {
  if (db) return db
  const uri = String(process.env.MONGODB_URI || '').trim()
  if (!uri) {
    throw new Error('Missing MONGODB_URI in .env')
  }
  // Best practices: connection pool + timeout + Stable API (theo Atlas recommendation)
  mongoClient = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true,
    tls: true,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true,
  })
  await mongoClient.connect()
  db = mongoClient.db(process.env.MONGODB_DB || 'netcredit')

  // Graceful shutdown
  process.on('SIGINT',  () => mongoClient.close().finally(() => process.exit(0)))
  process.on('SIGTERM', () => mongoClient.close().finally(() => process.exit(0)))

  return db
}

function collection(name) {
  if (!db) throw new Error('MongoDB is not connected yet')
  return db.collection(name)
}

function withSession(options, session) {
  return session ? { ...(options || {}), session } : (options || {})
}

function legacyIdFilter(id) {
  return { $or: [{ _id: id }, { id }] }
}

function normalizeDoc(doc) {
  if (!doc) return null
  const out = { ...doc }
  if (out.id == null && typeof out._id === 'string') out.id = out._id
  delete out._id
  return out
}

function normalizeDocs(docs) {
  return Array.isArray(docs) ? docs.map(normalizeDoc) : []
}

function createId() {
  return crypto.randomUUID()
}

function asDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

async function withMongoTransaction(work) {
  await connectMongo()
  if (!mongoTransactionsAvailable) return work(null)
  const session = mongoClient.startSession()
  try {
    session.startTransaction()
    const result = await work(session)
    await session.commitTransaction()
    return result
  } catch (err) {
    try {
      if (session.inTransaction()) await session.abortTransaction()
    } catch {
      /* ignore */
    }
    const msg = String(err?.message || '')
    if (
      mongoTransactionsAvailable &&
      (
        /Transaction numbers are only allowed/i.test(msg) ||
        /replica set/i.test(msg) ||
        /standalone/i.test(msg)
      )
    ) {
      mongoTransactionsAvailable = false
      console.warn('[DB] Transactions unavailable on this MongoDB deployment, falling back to non-transaction mode.')
      return work(null)
    }
    throw err
  } finally {
    await session.endSession().catch(() => {})
  }
}

async function getProfileById(userId, session = null) {
  await connectMongo()
  const doc = await collection('profiles').findOne(legacyIdFilter(userId), withSession({}, session))
  return normalizeDoc(doc)
}

function detectService(name) {
  if (!name) return 'other'
  const lower = name.toLowerCase()
  if (lower.includes('youtube') || lower.includes('ytb')) return 'youtube'
  if (lower.includes('spotify')) return 'spotify'
  if (lower.includes('capcut')) return 'capcut'
  if (lower.includes('kling')) return 'kling'
  if (lower.includes('claude')) return 'claude'
  if (lower.includes('grok')) return 'grok'
  if (lower.includes('chatgpt') || lower.includes('gpt')) return 'chatgpt'
  if (lower.includes('gemini')) return 'gemini'
  if (lower.includes('hma')) return 'hmavpn'
  if (lower.includes('tiktok')) return 'tiktok'
  if (lower.includes('canva')) return 'canva'
  return 'other'
}

function resolveCatalogFulfillment(product, category) {
  const raw = String(product?.fulfillment_type || '').trim().toLowerCase()
  const fallback = category?.type === 'product' ? 'stock' : 'manual'
  if (raw === 'stock' || raw === 'key' || raw === 'manual') return raw
  if (raw === 'service' || !raw) return fallback
  return fallback
}

function isAutoFulfillment(type) {
  return ['stock', 'key'].includes(String(type || '').trim().toLowerCase())
}

function isQuantityPlaceholderValue(value) {
  return /^QTY:/i.test(String(value || '').trim())
}

function deliverableStockResourceFilter(extra = {}) {
  return {
    account_type: 'stock',
    status: 'available',
    stock_mode: { $ne: 'quantity' },
    value: { $exists: true, $ne: '', $not: /^QTY:/i },
    ...extra
  }
}

function stockResourceVariantId(resource) {
  return resource?.variant_id || resource?.plan_id || null
}

async function syncProductVariantStock(variantId, session = null) {
  if (!variantId) return
  await connectMongo()
  const id = String(variantId)
  const stock = await collection('resources').countDocuments(
    deliverableStockResourceFilter({
      $or: [{ plan_id: id }, { variant_id: id }]
    }),
    withSession({}, session)
  )
  await collection('product_variants').updateOne(
    legacyIdFilter(id),
    { $set: { stock, updatedAt: new Date() } },
    withSession({}, session)
  )
}

async function syncProductVariantStockQuiet(variantId, session = null) {
  if (!variantId) return
  try {
    await syncProductVariantStock(variantId, session)
  } catch (err) {
    console.warn('[syncProductVariantStock]', err.message)
  }
}

function parseExplicitDayDuration(text) {
  const input = String(text || '').toLowerCase()
  const match = input.match(/(?:^|[^\d])(\d{1,4})\s*(?:d|day|days|ngày|ngay)(?=$|[^\p{L}\d])/iu)
  return match ? Number(match[1]) : null
}

function parsePeriodDuration(text) {
  const explicitDays = parseExplicitDayDuration(text)
  if (explicitDays) return explicitDays
  const input = String(text || '').toLowerCase()
  const year = input.match(/(?:^|[^\d])(\d{1,2})\s*(?:y|year|years|năm|nam)(?=$|[^\p{L}\d])/iu)
  if (year) return Number(year[1]) * 365
  const month = input.match(/(?:^|[^\d])(\d{1,3})\s*(?:m|month|months|tháng|thang)(?=$|[^\p{L}\d])/iu)
  if (month) return Number(month[1]) * 30
  return null
}

function resolveCatalogVariantDuration(product, variant) {
  const stored = Number(variant?.duration_days || product?.duration_days || 0)
  if (Number.isFinite(stored) && stored > 0) return stored
  return (
    parseExplicitDayDuration(variant?.name || variant?.label) ||
    parseExplicitDayDuration(product?.name) ||
    parsePeriodDuration(variant?.name || variant?.label) ||
    parsePeriodDuration(product?.name) ||
    30
  )
}

async function getPlanById(planId, session = null) {
  await connectMongo()
  const doc = await collection('plans').findOne(legacyIdFilter(planId), withSession({}, session))
  if (doc) return normalizeDoc(doc)
  
  const variant = await collection('product_variants').findOne(legacyIdFilter(planId), withSession({}, session))
  if (variant) {
    const product = await collection('products').findOne(legacyIdFilter(variant.productId), withSession({}, session))
    const category = product ? await collection('product_categories').findOne(legacyIdFilter(product.categoryId), withSession({}, session)) : null
    const detail = product ? await collection('product_details').findOne({ productId: product.id || String(product._id) }, withSession({}, session)) : null
    const productFulfillment = resolveCatalogFulfillment(product, category)
    return {
      id: variant.id || String(variant._id),
      variant_id: variant.id || String(variant._id),
      product_id: product?.id || variant.productId || null,
      category_id: product?.categoryId || null,
      category_type: category?.type || null,
      name: product ? `${product.name} - ${variant.name || variant.label}` : (variant.name || variant.label),
      price: variant.price || 0,
      base_price: variant.price || 0,
      duration_days: resolveCatalogVariantDuration(product, variant),
      service: detectService(product?.name),
      fulfillment_type: productFulfillment,
      description: detail?.shortDescription || product?.description || null,
      longDescription: detail?.longDescription || null,
      instructions: detail?.longDescription || detail?.shortDescription || null,
      active: variant.status !== 'inactive'
    }
  }
  return null
}

async function getPlansByIds(planIds, session = null) {
  if (!planIds || !planIds.length) return []
  await connectMongo()
  const plans = normalizeDocs(await collection('plans').find({ id: { $in: planIds } }, withSession({}, session)).toArray())
  const foundIds = new Set(plans.map(p => p.id))
  const missingIds = planIds.filter(id => !foundIds.has(id))
  
  if (missingIds.length > 0) {
    const variants = normalizeDocs(await collection('product_variants').find({ id: { $in: missingIds } }, withSession({}, session)).toArray())
    if (variants.length > 0) {
      const productIds = [...new Set(variants.map(v => v.productId))]
      const products = normalizeDocs(await collection('products').find({ id: { $in: productIds } }, withSession({}, session)).toArray())
      const productMap = new Map(products.map(p => [p.id, p]))
      
      const categoryIds = [...new Set(products.map(p => p.categoryId))]
      const [categories, details] = await Promise.all([
        normalizeDocs(await collection('product_categories').find({ id: { $in: categoryIds } }, withSession({}, session)).toArray()),
        normalizeDocs(await collection('product_details').find({ productId: { $in: productIds } }, withSession({}, session)).toArray())
      ])
      const categoryMap = new Map(categories.map(c => [c.id, c]))
      const detailMap = new Map(details.map(d => [d.productId, d]))
      
      for (const variant of variants) {
        const product = productMap.get(variant.productId)
        const category = product ? categoryMap.get(product.categoryId) : null
        const detail = product ? detailMap.get(product.id) : null
        const productFulfillment = resolveCatalogFulfillment(product, category)
        plans.push({
          id: variant.id || String(variant._id),
          variant_id: variant.id || String(variant._id),
          product_id: product?.id || variant.productId || null,
          category_id: product?.categoryId || null,
          category_type: category?.type || null,
          name: product ? `${product.name} - ${variant.name || variant.label}` : (variant.name || variant.label),
          price: variant.price || 0,
          base_price: variant.price || 0,
          duration_days: resolveCatalogVariantDuration(product, variant),
          service: detectService(product?.name),
          fulfillment_type: productFulfillment,
          description: detail?.shortDescription || product?.description || null,
          longDescription: detail?.longDescription || null,
          instructions: detail?.longDescription || detail?.shortDescription || null,
          active: variant.status !== 'inactive'
        })
      }
    }
  }
  return plans
}

async function fetchCatalogVariantPlans(session = null) {
  await connectMongo()
  const categories = normalizeDocs(
    await collection('product_categories')
      .find({ status: { $ne: 'inactive' } }, withSession({}, session))
      .toArray()
  )
  if (!categories.length) return []

  const categoryIds = categories.map(c => c.id)
  const products = normalizeDocs(
    await collection('products')
      .find({ categoryId: { $in: categoryIds }, status: 'active' }, withSession({}, session))
      .toArray()
  )
  if (!products.length) return []

  const productIds = products.map(p => p.id)
  const [variants, details] = await Promise.all([
    collection('product_variants')
      .find({ productId: { $in: productIds }, status: 'active' }, withSession({}, session))
      .toArray(),
    collection('product_details')
      .find({ productId: { $in: productIds } }, withSession({}, session))
      .toArray()
  ])

  const categoryMap = new Map(categories.map(c => [c.id, c]))
  const productMap = new Map(products.map(p => [p.id, p]))
  const detailMap = new Map(normalizeDocs(details).map(d => [d.productId, d]))

  return normalizeDocs(variants)
    .map((variant) => {
      const product = productMap.get(variant.productId)
      if (!product) return null
      const category = categoryMap.get(product.categoryId)
      const detail = detailMap.get(product.id)
      const price = Number(variant.price || 0)
      return {
        id: variant.id || String(variant._id),
        variant_id: variant.id || String(variant._id),
        product_id: product.id || variant.productId || null,
        category_id: product.categoryId || null,
        category_type: category?.type || null,
        name: `${product.name} - ${variant.name || variant.label || 'Variant'}`,
        price,
        base_price: price,
        duration_days: resolveCatalogVariantDuration(product, variant),
        service: detectService(`${category?.name || ''} ${product.name || ''}`),
        fulfillment_type: resolveCatalogFulfillment(product, category),
        description: detail?.shortDescription || product.description || null,
        longDescription: detail?.longDescription || null,
        instructions: detail?.longDescription || detail?.shortDescription || null,
        active: true,
        is_active: true,
        sort_order: Number(category?.sortOrder ?? product.sortOrder ?? variant.sortOrder ?? 9999),
        catalog_sort_order: {
          category: Number(category?.sortOrder ?? 9999),
          product: Number(product.sortOrder ?? 9999),
          variant: Number(variant.sortOrder ?? 9999)
        }
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ac = a.catalog_sort_order || {}
      const bc = b.catalog_sort_order || {}
      return (ac.category - bc.category) || (ac.product - bc.product) || (ac.variant - bc.variant) || ((a.price || 0) - (b.price || 0))
    })
}

async function getSubscriptionById(subId, session = null) {
  await connectMongo()
  const doc = await collection('subscriptions').findOne(legacyIdFilter(subId), withSession({}, session))
  return normalizeDoc(doc)
}

async function getResourceById(resourceId, session = null) {
  await connectMongo()
  const doc = await collection('resources').findOne(legacyIdFilter(resourceId), withSession({}, session))
  return normalizeDoc(doc)
}

async function getSellerStoreByOwnerId(ownerId, session = null) {
  await connectMongo()
  const doc = await collection('seller_stores').findOne({ owner_id: ownerId }, withSession({}, session))
  return normalizeDoc(doc)
}

// ── Wallet helpers ────────────────────────────────────────────────────────────

async function getWallet(userId) {
  await connectMongo()
  const doc = await collection('wallets').findOne(legacyIdFilter(userId))
  if (!doc) return { user_id: userId, balance: 0 }
  return normalizeDoc(doc)
}

/** Nạp tiền vào ví (atomic, tạo wallet nếu chưa có). Trả về số dư mới. */
async function creditWallet(userId, amount, type, refId, note, session = null) {
  if (!amount || amount <= 0) throw new Error('Số tiền không hợp lệ')
  await connectMongo()
  const updated = normalizeDoc(await collection('wallets').findOneAndUpdate(
    legacyIdFilter(userId),
    {
      $inc: { balance: amount },
      $set: { user_id: userId, updated_at: new Date() },
      $setOnInsert: { _id: userId, id: userId, created_at: new Date() }
    },
    { upsert: true, returnDocument: 'after', ...withSession({}, session) }
  ))
  const balanceAfter = updated?.balance ?? amount
  const txId = createId()
  await collection('wallet_transactions').insertOne(
    { _id: txId, id: txId, user_id: userId, amount, type, ref_id: refId || null,
      note: note || '', balance_after: balanceAfter, created_at: new Date() },
    withSession({}, session)
  )
  return balanceAfter
}

/** Trừ tiền từ ví (atomic + kiểm tra số dư). Ném lỗi nếu không đủ. */
async function debitWallet(userId, amount, type, refId, note, session = null) {
  if (!amount || amount <= 0) throw new Error('Số tiền không hợp lệ')
  await connectMongo()
  const updated = normalizeDoc(await collection('wallets').findOneAndUpdate(
    { ...legacyIdFilter(userId), balance: { $gte: amount } },
    { $inc: { balance: -amount }, $set: { updated_at: new Date() } },
    { returnDocument: 'after', ...withSession({}, session) }
  ))
  if (!updated) {
    const w = await getWallet(userId)
    const has = Number(w.balance || 0)
    throw new Error(`Số dư ví không đủ. Cần ${amount.toLocaleString('vi-VN')}₫, hiện có ${has.toLocaleString('vi-VN')}₫.`)
  }
  const balanceAfter = updated.balance
  const txId = createId()
  await collection('wallet_transactions').insertOne(
    { _id: txId, id: txId, user_id: userId, amount: -amount, type, ref_id: refId || null,
      note: note || '', balance_after: balanceAfter, created_at: new Date() },
    withSession({}, session)
  )
  return balanceAfter
}

/** Khớp nội dung CK với wallet_topup đang pending */
async function findWalletTopupByIncoming(txContent, amount) {
  await connectMongo()
  const pending = await collection('wallet_topups')
    .find({ status: 'pending', amount: { $lte: amount } }, { sort: { created_at: -1 } })
    .toArray()
  const upper = String(txContent || '').toUpperCase()
  const match = pending.find(r => upper.includes(String(r.transfer_content || '').toUpperCase()))
  return normalizeDoc(match)
}

/** Xác nhận nạp tiền: đánh dấu topup success + creditWallet */
async function processConfirmedWalletTopup(transferContent, amount) {
  try {
    const topup = normalizeDoc(await collection('wallet_topups').findOneAndUpdate(
      { transfer_content: transferContent, status: 'pending' },
      { $set: { status: 'success', confirmed_at: new Date(), actual_amount: amount } },
      { returnDocument: 'after' }
    ))
    if (!topup) return { success: false, reason: 'Đã xử lý hoặc không tìm thấy' }

    const balanceAfter = await creditWallet(
      topup.user_id, amount, 'topup', topup.id,
      `Nạp ví qua chuyển khoản (${transferContent})`
    )

    console.log(`[WalletTopup] ✅ ${transferContent} +${amount}₫ → user ${topup.user_id} (dư: ${balanceAfter}₫)`)

    const [cfg, profile] = await Promise.all([getAllSettings(), getProfileById(topup.user_id)])
    const fmtVND = (n) => Number(n).toLocaleString('vi-VN') + '₫'
    sendTelegram(
      `💰 <b>Nạp ví thành công!</b>\n` +
      `👤 ${profile?.email || topup.user_id}\n` +
      `💵 +${fmtVND(amount)} | Số dư: <b>${fmtVND(balanceAfter)}</b>\n` +
      `🔑 Mã CK: <code>${transferContent}</code>`
    )
    if (profile?.email) {
      const site = cfg.site_name || 'Netflix Store'
      // Fire-and-forget — không block flow xác nhận nạp ví
      sendEmail(profile.email, `✅ Nạp ví thành công — ${site}`, `
        <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
          <h2 style="color:#4F46E5;">✅ Nạp ví thành công</h2>
          <p>Đã nạp <strong>${fmtVND(amount)}</strong> vào ví của bạn.</p>
          <p style="font-size:18px;">Số dư hiện tại: <strong style="color:#4F46E5;">${fmtVND(balanceAfter)}</strong></p>
          <p style="color:#666;font-size:13px;">Mã giao dịch: ${transferContent}</p>
        </div>`).catch(e => console.warn('[WalletTopup] email failed:', e.message))
    }
    return { success: true, balance_after: balanceAfter }
  } catch (err) {
    console.error('[WalletTopup]', err.message)
    return { success: false, reason: err.message }
  }
}

async function findPaymentMatchByIncoming(txContent, amount, session = null) {
  await connectMongo()
  const pending = await collection('payments')
    .find(
      { status: 'pending', amount: { $lte: amount } },
      withSession(
        {
          sort: { created_at: -1 },
          projection: { _id: 1, id: 1, transfer_content: 1, amount: 1 }
        },
        session
      )
    )
    .toArray()
  const upper = String(txContent || '').toUpperCase()
  const match = pending.find((row) => upper.includes(String(row.transfer_content || '').toUpperCase()))
  return normalizeDoc(match)
}

async function testDbConnection() {
  try {
    await connectMongo()
    await db.admin().command({ ping: 1 })
    console.log('[DB] ✅ Connected OK at', new Date().toISOString())
  } catch (err) {
    console.error('[DB] ❌ Connect failed:', err.message)
  }
}
testDbConnection()

// ===================== TELEGRAM =====================
async function sendTelegram(message) {
  const cfg = await getRuntimeSettings()
  const botToken = cleanSetting(cfg.telegram_bot_token) || TG_TOKEN
  const chatId = cleanSetting(cfg.telegram_chat_id) || TG_CHAT_ID
  if (!botToken || !chatId) return
  try {
    await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
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
  const cfg = await getRuntimeSettings()
  const resendApiKey = cleanSetting(cfg.resend_api_key) || cleanSetting(process.env.RESEND_API_KEY)
  const fromAddress = cleanSetting(cfg.email_from) || EMAIL_FROM || GMAIL_USER
  try {
    if (resendApiKey && fromAddress) {
      await axios.post(
        'https://api.resend.com/emails',
        { from: fromAddress, to, subject, html },
        {
          timeout: 10000,
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
      console.log(`[Email] ✅ Sent to ${to} via Resend`)
      return
    }

    const transporter = getTransporter()
    if (!transporter) {
      console.warn('[Email] ⚠️ Chưa cấu hình Resend API hoặc GMAIL_USER / GMAIL_APP_PASSWORD')
      return
    }
    await transporter.sendMail({
      from: fromAddress.includes('<') ? fromAddress : `"${fromAddress}" <${GMAIL_USER}>`,
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
  try {
    await connectMongo()
    const doc = await collection('settings').findOne(
      { $or: [{ _id: key }, { key }] },
      { projection: { value: 1 } }
    )
    return doc?.value || ''
  } catch {
    return ''
  }
}

let _settingsCache = null
let _settingsCacheAt = 0
const SETTINGS_CACHE_TTL = 30000 // 30s

function invalidateSettingsCache() { _settingsCache = null; _settingsCacheAt = 0 }

async function getAllSettings() {
  if (_settingsCache && Date.now() - _settingsCacheAt < SETTINGS_CACHE_TTL) return _settingsCache
  try {
    await connectMongo()
    const docs = await collection('settings')
      .find({}, { projection: { _id: 1, key: 1, value: 1 } })
      .toArray()
    const cfg = Object.fromEntries(
      docs.map((row) => [row.key || row._id, row.value || ''])
    )
    if (cfg.telegram_bot_token === undefined) cfg.telegram_bot_token = process.env.TELEGRAM_BOT_TOKEN || ''
    if (cfg.telegram_chat_id === undefined) cfg.telegram_chat_id = process.env.TELEGRAM_CHAT_ID || ''
    if (cfg.mbbank_api_token === undefined) cfg.mbbank_api_token = process.env.MBBANK_API_TOKEN || ''
    if (cfg.mbbank_history_base === undefined) cfg.mbbank_history_base = process.env.MBBANK_HISTORY_BASE || 'https://thueapibank.vn/historyapimbbank'
    // Env override: BANK_ID/BANK_ACCOUNT_NO/BANK_ACCOUNT_NAME ưu tiên cao hơn MongoDB
    if (process.env.BANK_ID) cfg.bank_name = process.env.BANK_ID
    else if (cfg.bank_name === undefined) cfg.bank_name = process.env.DEFAULT_BANK_NAME || 'MB Bank'
    if (process.env.BANK_ACCOUNT_NO) cfg.bank_account = process.env.BANK_ACCOUNT_NO
    else if (cfg.bank_account === undefined) cfg.bank_account = process.env.DEFAULT_BANK_ACCOUNT || ''
    if (process.env.BANK_ACCOUNT_NAME) cfg.bank_owner = process.env.BANK_ACCOUNT_NAME
    else if (cfg.bank_owner === undefined) cfg.bank_owner = process.env.DEFAULT_BANK_OWNER || ''
    if (cfg.email_from === undefined) cfg.email_from = process.env.EMAIL_FROM || process.env.GMAIL_USER || ''
    if (cfg.site_name === undefined) cfg.site_name = 'Netflix Store'
    if (cfg.site_title === undefined) cfg.site_title = 'Netflix Store'
    if (cfg.vietqr_bank_bin === undefined) cfg.vietqr_bank_bin = '970422'
    _settingsCache = cfg
    _settingsCacheAt = Date.now()
    return cfg
  } catch {
    return _settingsCache || {}
  }
}

async function getRuntimeSettings() {
  try {
    return await getAllSettings()
  } catch {
    return {}
  }
}

function cleanSetting(value) {
  return String(value || '').trim()
}

function sqlResult(rows) {
  return { rows, rowCount: rows.length }
}

async function runCompatQuery(sql, params = []) {
  await connectMongo()
  const text = String(sql || '').replace(/\s+/g, ' ').trim()
  const lower = text.toLowerCase()

  if (lower === 'begin' || lower === 'commit' || lower === 'rollback') {
    return sqlResult([])
  }

  if (lower.includes('select now() as now')) {
    return sqlResult([{ now: new Date() }])
  }

  if (lower.includes('select vr.id, vr.subscription_id, vr.user_id, vr.kind, vr.status')) {
    const status = params[0]
    const filter = !status || status === '' || status === 'all' ? {} : { status }
    const reports = normalizeDocs(await collection('viewer_reports').find(filter).sort({ created_at: -1 }).limit(300).toArray())
    const userIds = [...new Set(reports.map((row) => row.user_id).filter(Boolean))]
    const subIds = [...new Set(reports.map((row) => row.subscription_id).filter(Boolean))]
    const profiles = normalizeDocs(await collection('profiles').find({ id: { $in: userIds } }).toArray())
    const subs = normalizeDocs(await collection('subscriptions').find({ id: { $in: subIds } }).toArray())
    const profileMap = new Map(profiles.map((row) => [row.id, row]))
    const subMap = new Map(subs.map((row) => [row.id, row]))
    return sqlResult(reports.map((row) => ({
      id: row.id,
      subscription_id: row.subscription_id,
      user_id: row.user_id,
      kind: row.kind,
      status: row.status,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      admin_note: row.admin_note,
      user_email: profileMap.get(row.user_id)?.email || null,
      sub_plan: subMap.get(row.subscription_id)?.plan || null,
      sub_status: subMap.get(row.subscription_id)?.status || null,
      sub_end_at: subMap.get(row.subscription_id)?.end_at || null
    })))
  }

  if (lower.includes('update viewer_reports set status = $2')) {
    const [id, status, noteParam, resolvedAt] = params
    const row = normalizeDoc(
      await collection('viewer_reports').findOneAndUpdate(
        legacyIdFilter(id),
        {
          $set: {
            status,
            ...(status === 'rejected' ? { admin_note: noteParam } : {}),
            ...(status !== 'rejected' && noteParam != null ? { admin_note: noteParam } : {}),
            resolved_at: status === 'resolved' || status === 'rejected'
              ? (resolvedAt ? new Date(resolvedAt) : new Date())
              : null
          }
        },
        { returnDocument: 'after' }
      )
    )
    return sqlResult(row ? [row] : [])
  }

  if (lower.includes('select email from profiles where id = $1 limit 1')) {
    const profile = await getProfileById(params[0])
    return sqlResult(profile ? [{ email: profile.email || null }] : [])
  }

  if (lower.includes('select id, subscription_id, user_id, status from viewer_reports where id = $1')) {
    const row = normalizeDoc(await collection('viewer_reports').findOne(legacyIdFilter(params[0])))
    return sqlResult(row ? [{ id: row.id, subscription_id: row.subscription_id, user_id: row.user_id, status: row.status }] : [])
  }

  if (lower.includes('select id, user_id, status, login_link from subscriptions where id = $1')) {
    const row = await getSubscriptionById(params[0])
    return sqlResult(row ? [{ id: row.id, user_id: row.user_id, status: row.status, login_link: row.login_link }] : [])
  }

  if (lower.includes('select id, value, status, assigned_count') && lower.includes('from resources where id = $1')) {
    const row = await getResourceById(params[0])
    return sqlResult(row ? [{
      id: row.id,
      value: row.value,
      status: row.status,
      assigned_count: row.assigned_count || 0,
      max_slots: row.max_slots || 5
    }] : [])
  }

  if (lower.includes('select 1 from subscriptions where user_id = $1 and status = \'active\'')) {
    const row = await collection('subscriptions').findOne({
      user_id: params[0],
      status: 'active',
      id: { $ne: params[1] },
      login_link: params[2]
    })
    return sqlResult(row ? [{ '?column?': 1 }] : [])
  }

  if (lower.startsWith('update resources set assigned_count = $1, status = $2, assigned_to = $3 where id = $4')) {
    await collection('resources').updateOne(
      legacyIdFilter(params[3]),
      { $set: { assigned_count: params[0], status: params[1], assigned_to: params[2] } }
    )
    return sqlResult([])
  }

  if (lower.startsWith('update subscriptions set login_link = $1, updated_at = now() where id = $2')) {
    await collection('subscriptions').updateOne(
      legacyIdFilter(params[1]),
      { $set: { login_link: params[0], updated_at: new Date() } }
    )
    return sqlResult([])
  }

  if (lower.includes('select claim_warranty($1::uuid) as j')) {
    const j = await claimWarranty(params[0])
    return sqlResult([{ j }])
  }

  if (lower.includes('update viewer_reports set status = \'resolved\'')) {
    await collection('viewer_reports').updateOne(
      legacyIdFilter(params[0]),
      {
        $set: {
          status: 'resolved',
          ...(params[1] != null ? { admin_note: params[1] } : {}),
          resolved_at: params[2] ? new Date(params[2]) : new Date()
        }
      }
    )
    return sqlResult([])
  }

  if (lower.includes('select distinct on (subscription_id)')) {
    const reports = normalizeDocs(
      await collection('viewer_reports')
        .find({
          user_id: params[0],
          status: 'rejected',
          admin_note: { $exists: true, $ne: null }
        })
        .sort({ resolved_at: -1 })
        .toArray()
    )
    const seen = new Set()
    const rows = []
    for (const row of reports) {
      if (!String(row.admin_note || '').trim()) continue
      if (seen.has(row.subscription_id)) continue
      seen.add(row.subscription_id)
      rows.push({
        id: row.id,
        subscription_id: row.subscription_id,
        admin_note: row.admin_note,
        resolved_at: row.resolved_at
      })
    }
    return sqlResult(rows)
  }

  if (lower.includes('select transfer_content, amount from payments where id = $1 limit 1')) {
    const payment = normalizeDoc(await collection('payments').findOne(legacyIdFilter(params[0])))
    return sqlResult(payment ? [{ transfer_content: payment.transfer_content, amount: payment.amount }] : [])
  }

  if (lower.includes('sum(case when created_at >= now() - interval \'1 day\'')) {
    const dayAgo = new Date(Date.now() - 86400000)
    const weekAgo = new Date(Date.now() - 7 * 86400000)
    const monthAgo = new Date(Date.now() - 30 * 86400000)
    const payments = normalizeDocs(await collection('payments').find({ status: 'success' }).toArray())
    const row = payments.reduce((acc, item) => {
      const created = asDate(item.created_at)
      const amount = Number(item.amount || 0)
      acc.total += amount
      if (created && created >= dayAgo) acc.today += amount
      if (created && created >= weekAgo) acc.week += amount
      if (created && created >= monthAgo) acc.month += amount
      return acc
    }, { today: 0, week: 0, month: 0, total: 0 })
    return sqlResult([row])
  }

  if (lower.includes('count(*) as total') && lower.includes('from subscriptions')) {
    const dayAgo = new Date(Date.now() - 86400000)
    const weekAgo = new Date(Date.now() - 7 * 86400000)
    const monthAgo = new Date(Date.now() - 30 * 86400000)
    const subs = normalizeDocs(await collection('subscriptions').find({}).toArray())
    const row = subs.reduce((acc, item) => {
      const created = asDate(item.created_at)
      acc.total += 1
      if (created && created >= dayAgo) acc.today += 1
      if (created && created >= weekAgo) acc.week += 1
      if (created && created >= monthAgo) acc.month += 1
      if (item.status === 'active') acc.active += 1
      if (item.status === 'pending') acc.pending += 1
      if (item.status === 'expired') acc.expired += 1
      return acc
    }, { total: 0, today: 0, week: 0, month: 0, active: 0, pending: 0, expired: 0 })
    return sqlResult([row])
  }

  if (lower.includes('select count(distinct user_id) as total from subscriptions')) {
    const subs = normalizeDocs(await collection('subscriptions').find({}, { projection: { user_id: 1 } }).toArray())
    return sqlResult([{ total: new Set(subs.map((row) => row.user_id).filter(Boolean)).size }])
  }

  if (lower.includes('count(*) filter (where status = \'available\') as available')) {
    const resources = normalizeDocs(await collection('resources').find({}).toArray())
    const row = resources.reduce((acc, item) => {
      acc.total += 1
      if (item.status === 'available') {
        acc.available += 1
        if ((item.account_type || 'shared') === 'stock' && (item.service || 'other') !== 'netflix') acc.stock_available += 1
        if ((item.service || 'netflix') === 'netflix' && (item.account_type || 'shared') !== 'stock' && !resourceHasPaymentIssueNote(item)) acc.netflix_available += 1
      }
      if (item.status === 'full') acc.full += 1
      if (item.status === 'dead') acc.dead += 1
      return acc
    }, { available: 0, netflix_available: 0, stock_available: 0, full: 0, dead: 0, total: 0 })
    return sqlResult([row])
  }

  if (lower.includes('insert into settings (key, value, updated_at)')) {
    const [key, value] = params
    await collection('settings').updateOne(
      { $or: [{ _id: key }, { key }] },
      { $set: { key, value, updated_at: new Date() } },
      { upsert: true }
    )
    return sqlResult([])
  }

  if (lower.includes('select p.id, p.name, p.duration_days, p.price as base_price')) {
    const storeId = params[0]
    const plans = normalizeDocs(await collection('plans').find({}).sort({ price: 1 }).toArray())
    const priceRows = normalizeDocs(await collection('seller_store_plan_prices').find({ seller_store_id: storeId }).toArray())
    const priceMap = new Map(priceRows.map((row) => [row.plan_id, row.price]))
    return sqlResult(plans.map((row) => ({
      id: row.id,
      name: row.name,
      duration_days: row.duration_days,
      base_price: row.price,
      price: priceMap.has(row.id) ? priceMap.get(row.id) : row.price
    })))
  }

  if (lower.includes('select * from seller_stores where lower(trim(custom_domain)) = $1 and is_active = true')) {
    const host = String(params[0] || '').trim().toLowerCase()
    const row = normalizeDoc(await collection('seller_stores').findOne({ custom_domain: host, is_active: true }))
    return sqlResult(row ? [row] : [])
  }

  if (lower === 'select * from plans where id = $1') {
    const row = await getPlanById(params[0])
    return sqlResult(row ? [row] : [])
  }

  if (lower.includes('select price from seller_store_plan_prices where seller_store_id = $1 and plan_id = $2')) {
    const row = normalizeDoc(await collection('seller_store_plan_prices').findOne({ seller_store_id: params[0], plan_id: params[1] }))
    return sqlResult(row ? [{ price: row.price }] : [])
  }

  if (lower.includes('select * from seller_stores where id = $1 and is_active = true')) {
    const row = normalizeDoc(await collection('seller_stores').findOne({ $or: [{ _id: params[0] }, { id: params[0] }], is_active: true }))
    return sqlResult(row ? [row] : [])
  }

  if (lower.includes('select * from seller_stores where slug = $1 and is_active = true limit 1')) {
    const row = normalizeDoc(await collection('seller_stores').findOne({ slug: params[0], is_active: true }))
    return sqlResult(row ? [row] : [])
  }

  if (lower.includes('select * from seller_stores where owner_id = $1 limit 1')) {
    const row = await getSellerStoreByOwnerId(params[0])
    return sqlResult(row ? [row] : [])
  }

  if (lower.includes('select id from seller_stores where owner_id = $1 limit 1')) {
    const row = await getSellerStoreByOwnerId(params[0])
    return sqlResult(row ? [{ id: row.id }] : [])
  }

  if (lower.includes('select id from seller_stores where slug = $1 limit 1')) {
    const row = normalizeDoc(await collection('seller_stores').findOne({ slug: params[0] }))
    return sqlResult(row ? [{ id: row.id }] : [])
  }

  if (lower.includes('insert into seller_stores (owner_id, slug, display_name, tagline, theme_primary, custom_domain)')) {
    const [ownerId, slug, displayName, tagline, themePrimary, customDomain] = params
    const doc = {
      _id: createId(),
      id: createId(),
      owner_id: ownerId,
      slug,
      display_name: displayName,
      tagline,
      theme_primary: themePrimary,
      custom_domain: customDomain,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
    doc._id = doc.id
    await collection('seller_stores').insertOne(doc)
    return sqlResult([{
      id: doc.id,
      slug: doc.slug,
      display_name: doc.display_name,
      tagline: doc.tagline,
      theme_primary: doc.theme_primary,
      is_active: doc.is_active,
      created_at: doc.created_at,
      custom_domain: doc.custom_domain
    }])
  }

  if (lower.startsWith('update seller_stores set ') && lower.includes(' where owner_id = $')) {
    // Fix: regex phải dùng single backslash (không double-escape trong string)
    const match = text.match(/UPDATE seller_stores SET (.+) WHERE owner_id = \$(\d+) RETURNING \*/i)
    if (!match) throw new Error(`Unsupported seller_stores update query: ${text}`)
    const updateClause = match[1]
    const ownerId = params[Number(match[2]) - 1]
    const updates = {}
    for (const part of updateClause.split(',')) {
      const trimmed = part.trim()
      // Match: updated_at = now()
      if (/^updated_at\s*=\s*now\(\)$/i.test(trimmed)) {
        updates.updated_at = new Date()
        continue
      }
      // Match: field = $N
      const m = trimmed.match(/^(\w+)\s*=\s*\$(\d+)$/)
      if (m) {
        updates[m[1]] = params[Number(m[2]) - 1]
      }
    }
    await collection('seller_stores').updateOne({ owner_id: ownerId }, { $set: updates })
    const row = await getSellerStoreByOwnerId(ownerId)
    return sqlResult(row ? [row] : [])
  }

  if (lower.includes('insert into seller_store_plan_prices (seller_store_id, plan_id, price)')) {
    const [storeId, planId, price] = params
    await collection('seller_store_plan_prices').updateOne(
      { seller_store_id: storeId, plan_id: planId },
      { $set: { seller_store_id: storeId, plan_id: planId, price } },
      { upsert: true }
    )
    return sqlResult([])
  }

  if (lower.includes('select id, slug, display_name from seller_stores where owner_id = $1 limit 1')) {
    const row = await getSellerStoreByOwnerId(params[0])
    return sqlResult(row ? [{ id: row.id, slug: row.slug, display_name: row.display_name }] : [])
  }

  if (lower.includes('select count(*)::int as cnt, coalesce(sum(amount), 0)::bigint as rev from payments where seller_store_id = $1 and status = \'success\'')) {
    const rows = normalizeDocs(await collection('payments').find({ seller_store_id: params[0], status: 'success' }).toArray())
    return sqlResult([{ cnt: rows.length, rev: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0) }])
  }

  throw new Error(`Unsupported SQL compatibility query: ${text.slice(0, 220)}`)
}

const dbPool = {
  async connect() {
    await connectMongo()
    return {
      query: runCompatQuery,
      release() {}
    }
  },
  query: runCompatQuery
}

const ALLOWED_SETTING_KEYS = new Set([
  'site_name', 'site_title', 'meta_description', 'meta_keywords', 'hero_title', 'hero_subtitle',
  'bank_name', 'bank_account', 'bank_owner', 'vietqr_bank_bin', 'momo_number', 'momo_name',
  'mbbank_api_token', 'mbbank_history_base',
  'telegram_bot_token', 'telegram_chat_id',
  'resend_api_key', 'email_from',
  'contact_telegram', 'contact_zalo',
  'social_facebook', 'social_youtube', 'social_tiktok',
  'footer_text',
  'notice_enabled', 'notice_title', 'notice_body', 'notice_cta_label', 'notice_cta_url',
  'catalog_config',
  'guides_config',
  'show_netflix_credentials'
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
  const timeoutMs = options.timeout || 20000
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
        const rawBuf = Buffer.concat(chunks)
        const enc = (res.headers['content-encoding'] || '').toLowerCase()
        const decompress = (buf) => new Promise((ok, fail) => {
          if (enc === 'gzip' || enc === 'x-gzip') {
            zlib.gunzip(buf, (e, d) => e ? fail(e) : ok(d))
          } else if (enc === 'deflate') {
            zlib.inflate(buf, (e, d) => e ? zlib.inflateRaw(buf, (e2, d2) => e2 ? fail(e2) : ok(d2)) : ok(d))
          } else if (enc === 'br') {
            zlib.brotliDecompress(buf, (e, d) => e ? fail(e) : ok(d))
          } else {
            ok(buf)
          }
        })
        decompress(rawBuf).then(buf => {
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
        }).catch(reject)
      })
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`nodeRequest timeout after ${timeoutMs}ms: ${url}`))
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

// ===================== AUTH (MongoDB + Custom JWT) =====================

/** Ký JWT cho user sau khi đăng nhập/đăng ký */
function signUserToken(userId, role, email) {
  return jwt.sign(
    { sub: userId, role, email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

/** Xác thực custom JWT — thay thế verifySupabaseAccessToken */
async function verifyCustomJwt(token) {
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const userId = payload.sub
    if (!userId) return null
    // Lấy role mới nhất từ DB (phòng trường hợp role thay đổi)
    const profile = await getProfileById(userId)
    const role = profile?.role || payload.role || 'user'
    return { userId, role, email: payload.email }
  } catch (err) {
    if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError') {
      console.warn('[verifyToken]', err.message)
    }
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

  verifyCustomJwt(m[1])
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
registerAdminRoutes(app, {
  requireAdmin,
  connectMongo,
  collection,
  normalizeDocs,
  getAllSettings
})

function requireSellerOrAdmin(req, res, next) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Cần Bearer token (đăng nhập)' })
  }
  verifyCustomJwt(m[1])
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

/** User đã đăng nhập (custom JWT) */
function requireUser(req, res, next) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Cần Bearer token (đăng nhập)' })
  }
  verifyCustomJwt(m[1])
    .then((u) => {
      if (!u) return res.status(401).json({ error: 'Unauthorized' })
      req.authUserId = u.userId
      next()
    })
    .catch(() => res.status(401).json({ error: 'Unauthorized' }))
}

function cleanChatMessage(value) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, 2000)
}

async function getOrCreateSupportThread(userId) {
  await connectMongo()
  const profile = await getProfileById(userId).catch(() => null)
  let thread = normalizeDoc(await collection('support_chats').findOne({ user_id: userId }))
  if (thread) return thread
  const id = createId()
  const now = new Date()
  const doc = {
    _id: id,
    id,
    user_id: userId,
    user_email: profile?.email || '',
    status: 'open',
    messages: [],
    unread_admin: 0,
    unread_user: 0,
    last_message: '',
    last_sender: '',
    created_at: now,
    updated_at: now
  }
  await collection('support_chats').insertOne(doc)
  return normalizeDoc(doc)
}

app.get('/api/support/chat', requireUser, async (req, res) => {
  try {
    const thread = await getOrCreateSupportThread(req.authUserId)
    await collection('support_chats').updateOne(
      legacyIdFilter(thread.id),
      { $set: { unread_user: 0, user_last_read_at: new Date() } }
    )
    const fresh = normalizeDoc(await collection('support_chats').findOne(legacyIdFilter(thread.id)))
    res.json({ thread: fresh, messages: fresh?.messages || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/support/chat/messages', requireUser, async (req, res) => {
  try {
    const content = cleanChatMessage(req.body?.content)
    if (!content) return res.status(400).json({ error: 'Tin nhắn không được để trống' })
    const thread = await getOrCreateSupportThread(req.authUserId)
    const now = new Date()
    const message = {
      id: createId(),
      sender: 'user',
      user_id: req.authUserId,
      content,
      created_at: now
    }
    await collection('support_chats').updateOne(
      legacyIdFilter(thread.id),
      {
        $push: { messages: message },
        $inc: { unread_admin: 1 },
        $set: {
          status: 'open',
          last_message: content,
          last_sender: 'user',
          updated_at: now
        }
      }
    )
    const fresh = normalizeDoc(await collection('support_chats').findOne(legacyIdFilter(thread.id)))
    res.status(201).json({ thread: fresh, message })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/admin/support/chats', requireAdmin, async (_req, res) => {
  try {
    await connectMongo()
    const threads = normalizeDocs(
      await collection('support_chats')
        .find({})
        .sort({ updated_at: -1 })
        .limit(200)
        .toArray()
    ).map((t) => ({
      ...t,
      messages: undefined,
      message_count: Array.isArray(t.messages) ? t.messages.length : 0
    }))
    res.json({ threads })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/admin/support/chats/:userId', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const thread = normalizeDoc(await collection('support_chats').findOne({ user_id: req.params.userId }))
    if (!thread) return res.status(404).json({ error: 'Không tìm thấy cuộc chat' })
    await collection('support_chats').updateOne(
      legacyIdFilter(thread.id),
      { $set: { unread_admin: 0, admin_last_read_at: new Date() } }
    )
    const fresh = normalizeDoc(await collection('support_chats').findOne(legacyIdFilter(thread.id)))
    res.json({ thread: fresh, messages: fresh?.messages || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/admin/support/chats/:userId/messages', requireAdmin, async (req, res) => {
  try {
    const content = cleanChatMessage(req.body?.content)
    if (!content) return res.status(400).json({ error: 'Tin nhắn không được để trống' })
    const thread = await getOrCreateSupportThread(req.params.userId)
    const now = new Date()
    const message = {
      id: createId(),
      sender: 'admin',
      user_id: req.adminUserId || null,
      content,
      created_at: now
    }
    await collection('support_chats').updateOne(
      legacyIdFilter(thread.id),
      {
        $push: { messages: message },
        $inc: { unread_user: 1 },
        $set: {
          status: 'open',
          last_message: content,
          last_sender: 'admin',
          updated_at: now
        }
      }
    )
    const fresh = normalizeDoc(await collection('support_chats').findOne(legacyIdFilter(thread.id)))
    res.status(201).json({ thread: fresh, message })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===================== AUTH ROUTES (MongoDB) =====================

/** POST /api/auth/register */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc password' })
    if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' })
    const emailNorm = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ error: 'Email không hợp lệ' })
    await connectMongo()
    const existing = await collection('profiles').findOne({ email: emailNorm })
    if (existing) return res.status(409).json({ error: 'Email này đã được đăng ký. Hãy đăng nhập.' })
    const password_hash = await bcrypt.hash(password, 12)
    const userId = createId()
    const now = new Date()
    await collection('profiles').insertOne({ _id: userId, id: userId, email: emailNorm, password_hash, role: 'user', created_at: now, updated_at: now })
    const token = signUserToken(userId, 'user', emailNorm)
    res.status(201).json({ token, user: { id: userId, email: emailNorm, role: 'user', created_at: now } })
  } catch (err) {
    console.error('[auth/register]', err)
    res.status(500).json({ error: err.message })
  }
})

/** POST /api/auth/login */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc password' })
    const emailNorm = String(email).trim().toLowerCase()
    await connectMongo()
    const profile = await collection('profiles').findOne({ email: emailNorm })
    if (!profile || !profile.password_hash) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' })
    const valid = await bcrypt.compare(String(password), profile.password_hash)
    if (!valid) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' })
    const uid = profile.id || String(profile._id)
    const token = signUserToken(uid, profile.role || 'user', emailNorm)
    res.json({ token, user: { id: uid, email: emailNorm, role: profile.role || 'user', created_at: profile.created_at } })
  } catch (err) {
    console.error('[auth/login]', err)
    res.status(500).json({ error: err.message })
  }
})

/** GET /api/auth/me */
app.get('/api/auth/me', requireUser, async (req, res) => {
  try {
    const profile = await getProfileById(req.authUserId)
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy user' })
    const { password_hash, ...safe } = profile
    res.json({ user: safe })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** POST /api/auth/logout — stateless JWT, frontend tự xóa token */
app.post('/api/auth/logout', (req, res) => res.json({ success: true }))

/** PATCH /api/auth/password — đổi mật khẩu */
app.patch('/api/auth/password', requireUser, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {}
    if (!current_password || !new_password) return res.status(400).json({ error: 'Thiếu current_password hoặc new_password' })
    if (new_password.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' })
    await connectMongo()
    const profile = await collection('profiles').findOne(legacyIdFilter(req.authUserId))
    if (!profile) return res.status(404).json({ error: 'User không tồn tại' })
    const valid = await bcrypt.compare(String(current_password), profile.password_hash || '')
    if (!valid) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' })
    const password_hash = await bcrypt.hash(new_password, 12)
    await collection('profiles').updateOne(legacyIdFilter(req.authUserId), { $set: { password_hash, updated_at: new Date() } })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

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
  try {
    return await withMongoTransaction(async (session) => {
      const payment = await collection('payments').findOne(
        {
          status: 'pending',
          amount: { $lte: amount },
          transfer_content: { $regex: `^${String(transferContent).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
        },
        withSession({ sort: { created_at: -1 } }, session)
      )

      if (!payment) {
        return {
          success: false,
          reason: `Không tìm thấy payment pending khớp nội dung và số tiền. transfer_content=${transferContent}`
        }
      }

      const planId = payment.plan
      const plan = await getPlanById(planId, session)
      const durationDays = Number(plan?.duration_days || 30)
      const startAt = new Date()
      const endAt = new Date(startAt.getTime() + durationDays * 86400000)
      const paymentId = payment.id || payment._id
      const subId = payment.subscription_id

      await collection('payments').updateOne(
        legacyIdFilter(paymentId),
        { $set: { status: 'success' } },
        withSession({}, session)
      )

      await collection('subscriptions').updateOne(
        legacyIdFilter(subId),
        {
          $set: {
            status: 'active',
            start_at: startAt,
            end_at: endAt,
            updated_at: new Date()
          }
        },
        withSession({}, session)
      )

      return {
        success: true,
        subscription_id: subId,
        plan: planId,
        duration_days: durationDays,
        start_at: startAt,
        end_at: endAt
      }
    })
  } catch (err) {
    console.error('[activatePayment]', err.message)
    return { success: false, reason: err.message }
  }
}

/** Kiểm tra xem gói có phải Premium không (không phải Free/Ads) */
function isNetflixPremiumPlan(planStr) {
  if (!planStr || typeof planStr !== 'string') return false
  const lower = planStr.toLowerCase().trim()
  if (!lower) return false
  // Gói đã hết hạn / bị huỷ / không còn hiệu lực → KHÔNG phải premium
  const expired = [
    'expired', 'expir', 'cancelled', 'canceled', 'inactive',
    'no plan', 'no active', 'membership ended', 'membership cancelled',
    'membership canceled', 'hết hạn', 'đã huỷ', 'đã hết',
  ]
  if (expired.some(kw => lower.includes(kw))) return false
  // Gói ads / free → KHÔNG phải premium
  const nonPremium = ['ads', 'free', 'with ads', 'standard with ads', 'basic with ads']
  if (nonPremium.some(kw => lower.includes(kw))) return false
  // Còn lại → coi là premium
  return true
}

/**
 * Fetch netflix.com/account với cookie gốc → lấy plan, billing date, profiles.
 * Không cần browser — dùng nodeRequest trực tiếp.
 */
// Từ khoá chứng tỏ gói đã bị huỷ / sắp hết (không còn gia hạn)
const CANCEL_KEYWORDS = [
  // English
  'ends on', 'end on', 'membership ends', 'will end', 'membership will end',
  'cancellation', 'cancelled', 'your membership ends', 'membership has ended',
  'has been cancelled', 'has been canceled',
  'reactivate membership', 'restart membership',
  // Vietnamese
  'kết thúc', 'hết hạn vào', 'đã hủy', 'sẽ kết thúc', 'thành viên của bạn sẽ',
  'đã bị hủy', 'đã chấm dứt', 'chấm dứt', 'kích hoạt lại',
  'tư cách thành viên của bạn đã',
  // Spanish / French
  'termina el', 'termina en',
  'se termine le', 'fin le',
]
// Từ khoá chứng tỏ gói đang gia hạn (active)
const RENEW_KEYWORDS = [
  'tiếp theo', 'next billing', 'renew', 'gia hạn', 'próximo', 'nächste',
  'prochaine', 'prossimo', 'próxima', 'next payment', 'lần thanh toán',
]

const PAYMENT_ERROR_KEYWORDS = [
  // Vietnamese — có dấu
  'thanh to\u00e1n kh\u00f4ng th\u00e0nh c\u00f4ng',
  'kh\u00f4ng th\u1ec3 x\u1eed l\u00fd kho\u1ea3n thanh to\u00e1n',
  'ch\u00fang t\u00f4i kh\u00f4ng th\u1ec3 x\u1eed l\u00fd',
  'ki\u1ec3m tra s\u1ed1 d\u01b0',
  'n\u1ea1p ti\u1ec1n tr\u01b0\u1edbc khi th\u1eed l\u1ea1i',
  // Vietnamese — biến thể không dấu (fallback khi decode lỗi)
  'thanh toan khong thanh cong',
  'khong the xu ly khoan thanh toan',
  'chung toi khong the xu ly',
  'kiem tra so du',
  'nap tien truoc khi thu lai',
  // English
  'payment failed',
  'payment unsuccessful',
  'unable to process your payment',
  'we could not process your payment',
  "we couldn't process your payment",
  "we couldn't process your last payment",
  'problem with your payment',
  'payment method was declined',
  'your last payment was unsuccessful',
  'your payment did not go through',
  'update payment',
  'fix payment',
  'payment issue',
  'billing issue',
  'failed payment',
  // ---- PAYMENT HOLD (Đây là text xuất hiện trong popup tại netflix.com/browse) ----
  'account is on hold',
  'your account is on hold',
  'on hold. retry your payment',
  'retry your payment',
  'retrypayment',
  'account on hold',
  // TRUE_MONEY specific
  'true_money',
  'truemoney',
  'true money',
  // Short universal fragments — chắc chắn match nếu có lỗi TT
  'payment not successful',
  'could not charge',
  'charge failed',
  'payment declined',
  'card was declined',
  'insufficient funds',
]

function cleanNetflixText(value) {
  if (value == null) return ''
  return String(value)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

function netflixVisibleLines(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|h[1-6]|li|section|article|button|span)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\n+/)
    .map(line => cleanNetflixText(line))
    .filter(Boolean)
}

function netflixJsonStringValues(html, keys) {
  const values = []
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\]){1,240})"`, 'gi')
    for (const m of String(html || '').matchAll(re)) {
      const value = cleanNetflixText(m[1])
      if (value && !values.includes(value)) values.push(value)
    }
  }
  return values
}

function hasNetflixPaymentErrorFlag(data) {
  if (!data || typeof data !== 'object') return false
  return !!(data.paymentError || data.paymentFailed || data.payment_error || data.payment_failed)
}

function detectNetflixPaymentError(...htmlParts) {
  const combined = htmlParts.filter(Boolean).join(' ')
  if (!combined) return false

  // 1. Check JSON key paymentIssue / paymentError / billingIssue trực tiếp trong raw HTML
  const jsonKeyPat = /"(?:paymentIssue|paymentError|paymentFailed|billingIssue|payment_issue|payment_error)"\s*:\s*(?:true|1|"true")/i
  if (jsonKeyPat.test(combined)) return true

  // 2. Check visible text (HTML stripped)
  const visibleText = htmlParts
    .filter(Boolean)
    .flatMap(part => netflixVisibleLines(part))
    .join(' ')
    .toLowerCase()

  // 3. Check raw text (Unicode-decoded)
  const rawText = cleanNetflixText(combined).toLowerCase()

  // 4. Simple ASCII normalize để bắt tiếng Việt bị decode sai
  function asciiNorm(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  }
  const asciiText = asciiNorm(visibleText + ' ' + rawText)

  const text = `${visibleText} ${rawText} ${asciiText}`.trim()
  return PAYMENT_ERROR_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))
}

function withNetflixPaymentNote(note, plan) {
  const clean = String(note || '').replace(/^\[Lỗi TT\]\s*[^·\n\r]*(?:·\s*)?/i, '').trim()
  const base = `[Lỗi TT] ${plan || 'Premium'}`
  return clean ? `${base} · ${clean}` : base
}

const NETFLIX_DATE_PATTERNS = [
  new RegExp('(?:Ng\\u00e0y\\s*)?\\d{1,2}\\s+th\\u00e1ng\\s+\\d{1,2}\\s+n\\u0103m\\s+\\d{4}', 'i'),
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i,
  /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/,
]

function extractNetflixDateText(value) {
  const text = cleanNetflixText(value)
  if (!text) return null
  for (const pattern of NETFLIX_DATE_PATTERNS) {
    const m = text.match(pattern)
    if (m) return cleanNetflixText(m[0])
  }
  return null
}

function extractNetflixMembershipBilling(html) {
  if (!html) return null

  const dateKeys = [
    'nextBillingDate',
    'nextPaymentDate',
    'nextPayment',
    'billingDate',
    'renewalDate',
    'currentBillingPeriodEndDate',
  ]
  for (const value of netflixJsonStringValues(html, dateKeys)) {
    const date = extractNetflixDateText(value)
    if (date) return date
  }

  const text = netflixVisibleLines(html).join(' ')
  const labels = [
    'Thanh to\\u00e1n ti\\u1ebfp theo',
    'Ng\\u00e0y thanh to\\u00e1n ti\\u1ebfp theo',
    'L\\u1ea7n thanh to\\u00e1n ti\\u1ebfp theo',
    'Next payment',
    'Next billing',
    'Next billing date',
    'Payment due',
    'Renews on',
    'Renewal date',
  ].map(cleanNetflixText)

  const lower = text.toLowerCase()
  for (const label of labels) {
    const idx = lower.indexOf(label.toLowerCase())
    if (idx === -1) continue
    const date = extractNetflixDateText(text.slice(idx, idx + 320))
    if (date) return date
  }

  return null
}

function extractNetflixPlanText(value) {
  const text = cleanNetflixText(value)
  if (!text) return null
  const patterns = [
    new RegExp('G\\u00f3i\\s+(?:cao c\\u1ea5p|ti\\u00eau chu\\u1ea9n|c\\u01a1 b\\u1ea3n|di \\u0111\\u1ed9ng)(?:\\s+[^,.;]{0,32})?', 'i'),
    /\b(?:Premium|Standard|Basic|Mobile)(?:\s+(?:with\s+Ads|Ads))?\b/i,
  ]
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m) return cleanNetflixText(m[0])
  }
  return null
}

function extractNetflixMembershipPlan(html) {
  if (!html) return null

  const planKeys = [
    'planName',
    'planLabel',
    'planDisplayName',
    'currentPlanName',
    'currentPlanDisplayName',
    'membershipPlanName',
    'localizedPlanName',
  ]
  for (const value of netflixJsonStringValues(html, planKeys)) {
    const plan = extractNetflixPlanText(value)
    if (plan) return plan
  }

  const lines = netflixVisibleLines(html)
  const labels = [
    'Chi ti\\u1ebft k\\u1ebf ho\\u1ea1ch',
    'Plan details',
    'Plan Details',
  ].map(cleanNetflixText)

  for (let i = 0; i < lines.length; i++) {
    if (!labels.some(label => lines[i].toLowerCase().includes(label.toLowerCase()))) continue
    for (const line of lines.slice(i + 1, i + 8)) {
      const plan = extractNetflixPlanText(line)
      if (plan) return plan
    }
  }

  return extractNetflixPlanText(lines.join(' '))
}

async function fetchNetflixAccountPage(cookieStr) {
  try {
    let cookie = cookieStr.trim()
    const idx = cookie.indexOf('NetflixId=')
    if (idx > 0) cookie = cookie.substring(idx)

    const nfHeaders = { ...NETFLIX_HEADERS, 'Cookie': cookie, 'Accept-Encoding': 'identity' }
    // Gọi 3 trang song song để giảm tổng thời gian chờ
    const [result, membershipRes, browseRes] = await Promise.all([
      nodeRequest('https://www.netflix.com/account',            { method: 'GET', headers: nfHeaders }),
      nodeRequest('https://www.netflix.com/account/membership', { method: 'GET', headers: nfHeaders }).catch(() => null),
      nodeRequest('https://www.netflix.com/browse',             { method: 'GET', headers: nfHeaders }).catch(() => null),
    ])

    if (result.status === 301 || result.status === 302) {
      return { reachable: false, redirected: true, hasPlan: false }
    }
    if (result.status !== 200) return { reachable: false, hasPlan: false }

    const html = result.text()
    if (!html || html.length < 3000) return { reachable: false, hasPlan: false }

    let membershipHtml = ''
    if (membershipRes && membershipRes.status === 200) membershipHtml = membershipRes.text()

    // /browse để detect popup "Your account is on hold. Retry your payment?"
    let browseHtml = ''
    if (browseRes && browseRes.status === 200) {
      browseHtml = browseRes.text()
      console.log('[NF-ACCOUNT] browse_len=%d', browseHtml.length)
    }

    // ── PLAN ─────────────────────────────────────────────────────────────────────
    let plan = null
    // Ưu tiên data-uia (SSR), sau đó thử key trong JSON embedded (React)
    const planHtmlPats = [
      /data-uia="account-overview-page\+membership-card\+title"[^>]*>\s*([^<]+)/,
      /data-uia="plan-label"[^>]*>\s*([^<]+)/,
      /data-uia="plan-name"[^>]*>\s*([^<]+)/,
      /data-uia="current-plan-name"[^>]*>\s*([^<]+)/,
    ]
    for (const pat of planHtmlPats) { const m = html.match(pat); if (m) { plan = m[1].trim(); break } }

    if (!plan) {
      const planJsonPats = [
        /"planName"\s*:\s*"([^"]{2,80})"/,
        /"planLabel"\s*:\s*"([^"]{2,80})"/,
        /"membershipPlanName"\s*:\s*"([^"]{2,80})"/,
        /"currentPlanName"\s*:\s*"([^"]{2,80})"/,
        /"localizedPlanName"\s*:\s*"([^"]{2,80})"/,
      ]
      for (const pat of planJsonPats) { const m = html.match(pat); if (m) { plan = m[1].trim(); break } }
    }
    const membershipPlan = extractNetflixMembershipPlan(membershipHtml)
    if (membershipPlan) plan = membershipPlan

    // ── BILLING DATE ─────────────────────────────────────────────────────────────
    let billingText = null
    const billingHtmlPats = [
      /data-uia="account-overview-page\+membership-card\+description"[^>]*>\s*([^<]+)/,
      /data-uia="plan-description"[^>]*>\s*([^<]+)/,
      /data-uia="next-billing-date"[^>]*>\s*([^<]+)/,
      /data-uia="cancellation-date"[^>]*>\s*([^<]+)/,
      /data-uia="membership-end-date"[^>]*>\s*([^<]+)/,
    ]
    for (const pat of billingHtmlPats) { const m = html.match(pat); if (m) { billingText = m[1].trim(); break } }

    if (!billingText) {
      const billingJsonPats = [
        /"nextBillingDate"\s*:\s*"([^"]{4,60})"/,
        /"billingDate"\s*:\s*"([^"]{4,60})"/,
        /"membershipEndDate"\s*:\s*"([^"]{4,60})"/,
        /"membershipExpDate"\s*:\s*"([^"]{4,60})"/,
        /"renewalDate"\s*:\s*"([^"]{4,60})"/,
        /"endDate"\s*:\s*"([^"]{4,60})"/,
      ]
      for (const pat of billingJsonPats) { const m = html.match(pat); if (m) { billingText = m[1].trim(); break } }
    }

    const membershipBillingText = extractNetflixMembershipBilling(membershipHtml)
    if (membershipBillingText) billingText = membershipBillingText

    // Fallback: carrier billing ("Được tính phí qua: Gói TIM", "Billed via: ...")
    if (!billingText) {
      const payVia = html.match(/(?:Được tính phí qua|Billed via|Thanh toán qua)[:\s]+([^<\n]{3,80})/i)
      if (payVia) billingText = payVia[1].trim()
    }
    // Fallback: subscription start date ("Đăng ký từ tháng 1 năm 2017", "Member since ...")
    if (!billingText) {
      const since = html.match(/(?:Đăng ký từ|Member since|Membre depuis)\s+([^<\n]{3,60})/i)
      if (since) billingText = `Thành viên từ ${since[1].trim()}`
    }

    // ── PROFILES ─────────────────────────────────────────────────────────────────
    const profiles = []
    // 1. "profileName":"..." trực tiếp trong JSON (phổ biến nhất)
    const profileNameMatches = [...html.matchAll(/"profileName"\s*:\s*"([^"]{1,50})"/g)]
    for (const m of profileNameMatches) {
      if (m[1] && !profiles.includes(m[1])) profiles.push(m[1])
    }
    // 2. Mảng profiles trong JSON
    if (!profiles.length) {
      const profileJsonMatch = html.match(/"profiles"\s*:\s*(\[[\s\S]{1,6000}?\])/)?.[1]
      if (profileJsonMatch) {
        try {
          const arr = JSON.parse(profileJsonMatch)
          for (const p of arr) {
            const name = p?.summary?.profileName || p?.profileName || p?.name
            if (name && typeof name === 'string' && !profiles.includes(name)) profiles.push(name)
          }
        } catch {}
      }
    }
    // 3. data-uia fallback (SSR)
    if (!profiles.length) {
      const pMatches = [...html.matchAll(/data-uia="profile-name"[^>]*>\s*([^<]+)/g)]
      for (const m of pMatches) profiles.push(m[1].trim())
    }

    // ── CANCEL DETECTION ─────────────────────────────────────────────────────────
    const htmlLower = html.toLowerCase()
    const htmlCancelled = CANCEL_KEYWORDS.some(kw => htmlLower.includes(kw.toLowerCase()))
    const paymentError = detectNetflixPaymentError(html, membershipHtml, browseHtml)

    let hasPlan = false
    if (plan || billingText) {
      const bt = billingText ? billingText.toLowerCase() : ''
      const billingCancelled = bt && CANCEL_KEYWORDS.some(kw => bt.includes(kw.toLowerCase()))
      const billingActive = !!membershipBillingText || RENEW_KEYWORDS.some(kw => bt.includes(kw.toLowerCase()))
      if (billingCancelled) {
        hasPlan = false
      } else if (billingActive) {
        hasPlan = true
      } else {
        hasPlan = !htmlCancelled
      }
    }

    console.log('[NF-ACCOUNT] html_len=%d membership_len=%d browse_len=%d plan=%s billing=%s profiles=%d paymentError=%s', html.length, membershipHtml.length, browseHtml.length, plan, billingText, profiles.length, paymentError)
    // DEBUG: nếu phát hiện lỗi TT, in visible text từ browse để confirm keyword
    if (paymentError) {
      const browseLines = netflixVisibleLines(browseHtml).filter(l => l.length > 3).slice(0, 30)
      if (browseLines.length) console.log('[NF-ACCOUNT-DEBUG] Browse visible lines (payment error detected):\n' + browseLines.join('\n'))
    }
    if (!paymentError && browseHtml.length > 100000) {
      const debugLines = netflixVisibleLines(browseHtml).filter(l => l.length > 3).slice(0, 40)
      console.log('[NF-ACCOUNT-DEBUG] Browse visible lines (no error detected yet):\n' + debugLines.join('\n'))
    }
    return { reachable: true, hasPlan, plan, billingText, profiles, paymentError, paymentFailed: paymentError }
  } catch (e) {
    console.error('[NF-ACCOUNT] error:', e.message)
    return { reachable: false, hasPlan: false, paymentError: false, paymentFailed: false }
  }
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
    try { data = result.json() } catch { return { alive: false, hasPremium: false, plan: null, email: null, screens: null, paymentError: false, paymentFailed: false, raw: null } }

    const alive      = data?.status === 'SUCCESS'
    const plan       = data?.plan || data?.subscription || null
    const hasPremium = alive && isNetflixPremiumPlan(plan)
    const email      = data?.email || null
    const screens    = data?.max_streams != null ? parseInt(data.max_streams) : null
    const paymentError = hasNetflixPaymentErrorFlag(data)

    return { alive, hasPremium, plan, email, screens, paymentError, paymentFailed: paymentError, raw: data }
  } catch {
    return { alive: false, hasPremium: false, plan: null, email: null, screens: null, paymentError: false, paymentFailed: false, raw: null }
  }
}

/** Backward-compat wrapper — chỉ trả true/false */
async function checkAccountAlive(resourceValue) {
  const details = await checkAccountDetails(resourceValue)
  return details.alive
}

function resourceHasPaymentIssueNote(resource) {
  return /^\[Lỗi TT\]/i.test(String(resource?.note || ''))
}

async function countAvailableAccounts() {
  try {
    await connectMongo()
    return await collection('resources').countDocuments({
      status: 'available',
      service: 'netflix',
      account_type: { $ne: 'stock' },
      note: { $not: /^\[Lỗi TT\]/i },
      $expr: {
        $lt: [
          { $ifNull: ['$assigned_count', 0] },
          { $ifNull: ['$max_slots', 5] }
        ]
      }
    })
  } catch {
    return 0
  }
}

async function sendActivationEmail(subId, loginLink, planLabel, days, cfg) {
  try {
    const sub = await getSubscriptionById(subId)
    const profile = sub?.user_id ? await getProfileById(sub.user_id) : null
    const email = profile?.email
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
  }
}

async function assignVerifiedAccount(subId) {
  await connectMongo()
  const sub = await getSubscriptionById(subId)
  if (!sub?.user_id) return null

  const alreadyUsedValues = (
    await collection('subscriptions')
      .find(
        {
          user_id: sub.user_id,
          status: 'active',
          login_link: { $ne: null },
          id: { $ne: subId }
        },
        { projection: { login_link: 1 } }
      )
      .toArray()
  )
    .map((row) => row.login_link)
    .filter(Boolean)

  const candidates = normalizeDocs(
    await collection('resources')
      .find(
        {
          status: 'available',
          service: 'netflix',
          account_type: { $ne: 'stock' },
          // Loại trừ tài khoản có ghi chú lỗi TT
          note: { $not: /^\[Lỗi TT\]/i },
          $expr: {
            $lt: [
              { $ifNull: ['$assigned_count', 0] },
              { $ifNull: ['$max_slots', 5] }
            ]
          },
          ...(alreadyUsedValues.length > 0 ? { value: { $nin: alreadyUsedValues } } : {})
        },
        { sort: { assigned_count: -1, created_at: 1 }, limit: 10 }
      )
      .toArray()
  )

  // Chiến lược A+B:
  // - Acc được check trong vòng 10 phút → trust kho, bỏ qua re-check (fast path)
  // - Acc cũ hơn → check song song tất cả candidates cùng lúc (parallel path)
  const TRUST_CHECKED_MS = 10 * 60 * 1000
  const now = Date.now()

  const freshCandidates = []
  const staleCandidates = []
  for (const res of candidates) {
    const checkedAt = res.last_checked_at ? new Date(res.last_checked_at).getTime() : 0
    if (now - checkedAt < TRUST_CHECKED_MS) {
      freshCandidates.push(res)
    } else {
      staleCandidates.push(res)
    }
  }

  const tryAssign = async (res, isVerified) => {
    try {
      return await withMongoTransaction(async (session) => {
        const fresh = await getResourceById(res.id, session)
        if (!fresh || fresh.status !== 'available') return false
        const freshCount = Number(fresh.assigned_count || 0)
        const freshMax = Number(fresh.max_slots || 5)
        if (freshCount >= freshMax) return false
        const newCount = freshCount + 1
        const newStatus = newCount >= freshMax ? 'full' : 'available'
        const upd = await collection('resources').updateOne(
          { ...legacyIdFilter(res.id), status: 'available' },
          { $set: { assigned_count: newCount, status: newStatus, assigned_to: subId } },
          withSession({}, session)
        )
        if (!upd.modifiedCount) return false
        await collection('subscriptions').updateOne(
          legacyIdFilter(subId),
          { $set: { login_link: fresh.value } },
          withSession({}, session)
        )
        return { value: fresh.value, newCount, freshMax }
      })
    } catch (err) {
      console.error('[Auto-Pay] assign failed:', err.message)
      return false
    }
  }

  // Fast path: acc mới check → giao thẳng theo thứ tự
  for (const res of freshCandidates) {
    const maxSlots = res.max_slots || 5
    console.log(`[Auto-Pay] ⚡ Fast-assign ${res.id.substring(0, 8)} (checked <10m ago)`)
    const assigned = await tryAssign(res, true)
    if (assigned) {
      console.log(`[Auto-Pay] ✅ Assigned fast (${assigned.newCount}/${maxSlots})`)
      return assigned.value
    }
  }

  // Parallel path: acc cũ hơn → check live song song, lấy candidate đầu tiên alive
  if (staleCandidates.length > 0) {
    console.log(`[Auto-Pay] Parallel-checking ${staleCandidates.length} stale candidates...`)
    const checkResults = await Promise.all(
      staleCandidates.map(async (res) => {
        const details = await checkAccountDetails(res.value)
        return { res, details }
      })
    )
    // Xóa acc chết (non-blocking)
    const deadOnes = checkResults.filter(({ details }) => !details.alive || !details.hasPremium)
    for (const { res, details } of deadOnes) {
      const deadReason = details.alive ? 'no_plan' : 'dead'
      collection('resources').deleteOne(legacyIdFilter(res.id))
        .catch(e => console.error('[Auto-Pay] delete dead failed:', e.message))
      console.log(`[Auto-Pay] ❌ ${res.id.substring(0, 8)} ${deadReason}, deleting...`)
    }
    // Thử giao theo thứ tự acc alive
    const aliveOnes = checkResults.filter(({ details }) => details.alive && details.hasPremium)
    for (const { res } of aliveOnes) {
      const maxSlots = res.max_slots || 5
      const assigned = await tryAssign(res, true)
      if (assigned) {
        console.log(`[Auto-Pay] ✅ Assigned parallel (${assigned.newCount}/${maxSlots})`)
        return assigned.value
      }
    }
  }

  return null
}

// ── Assign stock product (non-Netflix auto-delivery) ──────────────
async function assignStockProduct(subId, service, planId = null) {
  try {
    return await withMongoTransaction(async (session) => {
      const filter = deliverableStockResourceFilter()
      if (planId) filter.$or = [{ plan_id: planId }, { variant_id: planId }]
      else filter.service = service
      const resource = normalizeDoc(
        await collection('resources').findOneAndUpdate(
          filter,
          {
            $set: { status: 'assigned', assigned_to: subId, updated_at: new Date() },
            $inc: { assigned_count: 1 }
          },
          withSession({ sort: { created_at: 1 }, returnDocument: 'after' }, session)
        )
      )
      if (!resource || isQuantityPlaceholderValue(resource.value)) return null

      await syncProductVariantStockQuiet(stockResourceVariantId(resource), session)
      await collection('subscriptions').updateOne(
        legacyIdFilter(subId),
        { $set: { login_link: resource.value } },
        withSession({}, session)
      )
      return resource.value
    })
  } catch (err) {
    console.error('[assignStockProduct]', err.message)
    return null
  }
}

// ── Get plan service & fulfillment_type ───────────────────────────
async function getPlanMeta(planId) {
  try {
    const plan = await getPlanById(planId)
    return plan || { service: 'netflix', fulfillment_type: 'netflix' }
  } catch {
    return { service: 'netflix', fulfillment_type: 'netflix' }
  }
}

async function claimWarranty(subId, session = null) {
  try {
    const sub = await getSubscriptionById(subId, session)
    if (!sub) return { success: false, message: 'Subscription không tồn tại' }
    if (sub.warranty_used) {
      return { success: false, reason: 'already_used', message: 'Đơn đã được bảo hành trước đó.' }
    }
    if (sub.end_at && new Date(sub.end_at).getTime() <= Date.now()) {
      return { success: false, reason: 'expired', message: 'Đơn đã hết hạn, không đủ điều kiện bảo hành.' }
    }
    if (sub.status !== 'active') {
      return { success: false, reason: 'expired', message: 'Đơn đã hết hạn, không đủ điều kiện bảo hành.' }
    }

    // Kiểm tra tài khoản hiện tại: nếu vẫn sống + có gói VÀ KHÔNG CÓ lỗi TT → từ chối bảo hành
    if (sub.login_link) {
      try {
        const currentDetails = await checkAccountDetails(sub.login_link)
        const hasPayErr = currentDetails.paymentError || currentDetails.paymentFailed
        if (currentDetails.alive && currentDetails.hasPremium && !hasPayErr) {
          // Thêm: kiểm tra trang account Netflix có lỗi TT không
          let acctPayErr = false
          try {
            const acctPage = await fetchNetflixAccountPage(sub.login_link)
            acctPayErr = hasNetflixPaymentErrorFlag(acctPage)
          } catch { /* ignore */ }

          if (!acctPayErr) {
            return {
              success: false,
              aliveAndHasPlan: true,
              message: 'Tài khoản vẫn hoạt động bình thường và còn gói. Nếu bạn vẫn gặp lỗi, vui lòng liên hệ hỗ trợ trực tiếp.'
            }
          }
          // Có lỗi TT → đánh dead và đổi tài khoản mới
          console.log(`[Warranty] Payment error on account for sub ${subId} — auto-swapping`)
        }
        // Cookie chết, mất gói, hoặc lỗi TT → xoá sổ khỏi kho
        const deadReason = currentDetails.alive ? (currentDetails.hasPremium ? 'payment_error' : 'no_plan') : 'dead'
        await collection('resources').deleteOne({ value: sub.login_link }).catch(() => {})
        console.log(`[Warranty] Current account ${deadReason} for sub ${subId}, deleted`)
      } catch (checkErr) {
        console.warn('[Warranty] Could not check current account:', checkErr.message)
        // Nếu không check được → vẫn tiến hành bảo hành (lợi cho khách)
      }
    }

    const alreadyUsedValues = normalizeDocs(
      await collection('subscriptions')
        .find(
          {
            user_id: sub.user_id,
            status: 'active',
            login_link: { $ne: null },
            id: { $ne: subId }
          },
          withSession({ projection: { login_link: 1 } }, session)
        )
        .toArray()
    )
      .map((row) => row.login_link)
      .filter(Boolean)

    const resource = normalizeDoc(
      await collection('resources').findOne(
        {
          status: 'available',
          service: 'netflix',
          account_type: { $ne: 'stock' },
          // Loại trừ tài khoản lỗi thanh toán
          note: { $not: /^\[Lỗi TT\]/i },
          $expr: {
            $lt: [
              { $ifNull: ['$assigned_count', 0] },
              { $ifNull: ['$max_slots', 5] }
            ]
          },
          ...(alreadyUsedValues.length > 0 ? { value: { $nin: alreadyUsedValues } } : {})
        },
        withSession({ sort: { assigned_count: -1, created_at: 1 } }, session)
      )
    )

    if (!resource) {
      return { success: false, message: 'Không còn tài khoản dự phòng, vui lòng liên hệ admin' }
    }

    const maxSlots = Number(resource.max_slots || 5)
    const newCount = Number(resource.assigned_count || 0) + 1
    const newStatus = newCount >= maxSlots ? 'full' : 'available'

    await collection('resources').updateOne(
      legacyIdFilter(resource.id),
      {
        $set: {
          assigned_count: newCount,
          status: newStatus,
          assigned_to: subId
        }
      },
      withSession({}, session)
    )

    await collection('subscriptions').updateOne(
      legacyIdFilter(subId),
      {
        $set: {
          login_link: resource.value,
          warranty_used: true,
          warranty_at: new Date(),
          updated_at: new Date()
        }
      },
      withSession({}, session)
    )

    return {
      success: true,
      message: 'Đã đổi tài khoản mới thành công',
      new_account: resource.value
    }
  } catch (err) {
    return { success: false, message: err.message }
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
  const isAutoDelivery = isAutoFulfillment(fulfillment)
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

  } else if (isAutoDelivery) {
    // ── Dịch vụ stock/key: auto-assign từ kho dịch vụ ──
    loginLink = await assignStockProduct(outcome.subscription_id, service, outcome.plan)
    if (!loginLink) {
      console.warn(`[Auto-Pay] ⚠️ Kho dịch vụ ${service} trống cho sub ${outcome.subscription_id}`)
      await collection('subscriptions').updateOne(
        legacyIdFilter(outcome.subscription_id),
        { $set: { status: 'processing', updated_at: new Date() } }
      )
    }
    sendTelegram(
      `🛒 <b>Đơn dịch vụ mới!</b> — ${siteName}\n` +
      `📦 Gói: <b>${planLabel}</b> (${service})\n` +
      `💰 Số tiền: <b>${Number(amount).toLocaleString('vi-VN')}₫</b>\n` +
      `🔑 Nội dung CK: <code>${transferContent}</code>\n` +
      `${loginLink ? '✅ Đã giao từ kho tự động' : '⚠️ Kho trống — cần giao tay!'}`
    )

  } else if (isManual) {
    // ── Dịch vụ (manual): thông báo admin xử lý tay ──
    await collection('subscriptions').updateOne(
      legacyIdFilter(outcome.subscription_id),
      { $set: { status: 'processing', login_link: null, updated_at: new Date() } }
    )
    sendTelegram(
      `🔧 <b>Đơn dịch vụ cần xử lý!</b> — ${siteName}\n` +
      `📦 Gói: <b>${planLabel}</b> (${service})\n` +
      `💰 Số tiền: <b>${Number(amount).toLocaleString('vi-VN')}₫</b>\n` +
      `🔑 Nội dung CK: <code>${transferContent}</code>\n` +
      `⚠️ <b>Cần admin xử lý thủ công:</b> Vào Admin → Dịch vụ số → Dịch vụ → Xác nhận đơn này.`
    )
    console.log(`[Auto-Pay] Manual service order: sub=${outcome.subscription_id}, plan=${planLabel}`)
  }

  const availCount = await countAvailableAccounts()

  // Notify seller store if applicable
  try {
    const payment = normalizeDoc(
      await collection('payments').findOne(
        { transfer_content: transferContent, seller_store_id: { $ne: null } },
        { sort: { created_at: -1 } }
      )
    )
    if (payment?.seller_store_id) {
      const row = normalizeDoc(await collection('seller_stores').findOne(legacyIdFilter(payment.seller_store_id)))
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

// ===================== PAYMENT MATCH HELPERS =====================

/**
 * Tìm payment pending khớp với giao dịch ngân hàng đến.
 * Kiểm tra nội dung CK ngân hàng có chứa transfer_content không và số tiền >= amount.
 */
async function _findPaymentMatchByIncomingLegacy(txContent, amountIn) {
  try {
    await connectMongo()
    const content = String(txContent || '').trim().toLowerCase()
    if (!content) return null

    // Lấy tất cả payment pending gần đây (200 cái)
    const pending = normalizeDocs(
      await collection('payments')
        .find({ status: 'pending' })
        .sort({ created_at: -1 })
        .limit(200)
        .toArray()
    )

    for (const payment of pending) {
      const tc = String(payment.transfer_content || '').trim()
      if (!tc) continue
      // Nội dung ngân hàng phải chứa transfer_content (không phân biệt hoa thường)
      if (content.includes(tc.toLowerCase())) {
        // Số tiền chuyển >= số tiền đơn hàng
        if (amountIn >= Number(payment.amount || 0)) {
          console.log(`[PayMatch] ✅ Matched transfer_content="${tc}" amount=${amountIn}`)
          return payment
        } else {
          console.log(`[PayMatch] ⚠️ Content matched "${tc}" but amount ${amountIn} < ${payment.amount}`)
        }
      }
    }
    return null
  } catch (err) {
    console.error('[PayMatch]', err.message)
    return null
  }
}

/**
 * Tìm wallet_topup pending khớp với giao dịch ngân hàng đến.
 */
async function _findWalletTopupByIncomingLegacy(txContent, amountIn) {
  try {
    await connectMongo()
    const content = String(txContent || '').trim().toLowerCase()
    if (!content) return null

    const pending = normalizeDocs(
      await collection('wallet_topups')
        .find({ status: 'pending' })
        .sort({ created_at: -1 })
        .limit(200)
        .toArray()
    )

    for (const topup of pending) {
      const tc = String(topup.transfer_content || '').trim()
      if (!tc) continue
      if (content.includes(tc.toLowerCase())) {
        console.log(`[WalletMatch] ✅ Matched topup tc="${tc}" amount=${amountIn}`)
        return topup
      }
    }
    return null
  } catch (err) {
    console.error('[WalletMatch]', err.message)
    return null
  }
}

/**
 * Xác nhận và ghi nhận nạp tiền vào ví của user.
 */
async function _processConfirmedWalletTopupLegacy(transferContent, actualAmount) {
  try {
    await connectMongo()
    const topup = normalizeDoc(
      await collection('wallet_topups').findOne({
        transfer_content: transferContent,
        status: 'pending'
      })
    )
    if (!topup) {
      console.warn(`[WalletTopup] Không tìm thấy topup pending cho tc=${transferContent}`)
      return { success: false }
    }

    const now = new Date()
    await collection('wallet_topups').updateOne(
      legacyIdFilter(topup.id),
      { $set: { status: 'success', confirmed_at: now, actual_amount: Math.round(actualAmount) } }
    )

    // Cộng số tiền thực tế vào ví
    const creditAmount = Math.round(actualAmount)
    await creditWallet(topup.user_id, creditAmount, 'topup', topup.id, `Nạp ví qua chuyển khoản`)

    const profile = await getProfileById(topup.user_id).catch(() => null)
    const cfg = await getAllSettings()
    const fmtVND = (n) => Number(n).toLocaleString('vi-VN') + '₫'

    sendTelegram(
      `💰 <b>Nạp ví thành công!</b>\n` +
      `👤 ${profile?.email || topup.user_id}\n` +
      `💵 Số tiền: <b>${fmtVND(creditAmount)}</b>\n` +
      `🔑 CK: <code>${transferContent}</code>`
    )

    console.log(`[WalletTopup] ✅ Credited ${creditAmount} to user ${topup.user_id}`)
    return { success: true, amount: creditAmount }
  } catch (err) {
    console.error('[WalletTopup]', err.message)
    return { success: false, reason: err.message }
  }
}

// ===================== BANK API HELPERS (poll lịch sử MB) =====================
const BANK_POLL_AUTH_FAIL_CAP = 3
const BANK_POLL_PAUSE_MS = 30 * 60 * 1000

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

// ===================== MBBANK (thueapibank.vn) POLLING =====================
let mbbankAuthFailStreak = 0
let mbbankPollPausedUntil = 0
const processedMbbankRefNos = new Set()
const MBBANK_PROCESSED_CAP = 800

function mbbankNoteAuthFailure(detail) {
  mbbankAuthFailStreak++
  if (mbbankAuthFailStreak < BANK_POLL_AUTH_FAIL_CAP) {
    console.warn(
      `[MBBank Poll] Lỗi API (${mbbankAuthFailStreak}/${BANK_POLL_AUTH_FAIL_CAP}). Kiểm tra MBBANK_API_TOKEN — ${MBBANK_PORTAL_URL}`
    )
    return
  }
  mbbankAuthFailStreak = 0
  mbbankPollPausedUntil = Date.now() + BANK_POLL_PAUSE_MS
  console.error(
    '[MBBank Poll] Tạm dừng 30 phút — token hoặc endpoint không hợp lệ.',
    detail ? String(detail).slice(0, 280) : ''
  )
}

function mbbankClearAuthFailure() {
  mbbankAuthFailStreak = 0
}

function rememberMbbankRef(key) {
  if (!key) return
  processedMbbankRefNos.add(key)
  while (processedMbbankRefNos.size > MBBANK_PROCESSED_CAP) {
    const first = processedMbbankRefNos.values().next().value
    processedMbbankRefNos.delete(first)
  }
}

/** Không trùng refNo → dùng ngày + tiền + mô tả để không xử lý lặp mỗi 5s. */
function mbbankDedupeKey(tx) {
  const ref = tx.refNo || tx.tranId
  if (ref) return String(ref)
  const d = tx.postingDate || tx.transactionDate || ''
  const amt = String(getIncomingAmount(tx) || '')
  const desc = String(getIncomingContent(tx) || '').slice(0, 160)
  return `noderef:${d}|${amt}|${desc}`
}

function getIncomingAmount(tx = {}) {
  const raw = tx.creditAmount ?? tx.amount_in ?? tx.transferAmount ?? tx.amountIn ?? tx.amount ?? tx.value ?? 0
  const normalized = String(raw).replace(/,/g, '').replace(/[^\d.-]/g, '')
  return parseFloat(normalized) || 0
}

function getIncomingContent(tx = {}) {
  return String(
    tx.description ??
    tx.transaction_content ??
    tx.content ??
    tx.transferContent ??
    tx.addInfo ??
    tx.remark ??
    ''
  )
}

/**
 * GET {MBBANK_HISTORY_BASE}/{token} → { status, TranList: [{ refNo, creditAmount, description, ... }] }
 * Khớp pending payment: nội dung CK chứa transfer_content và số tiền >= amount.
 */
async function getMbbankRuntimeConfig() {
  const cfg = await getRuntimeSettings()
  return {
    token: cleanSetting(cfg.mbbank_api_token) || MBBANK_API_TOKEN,
    historyBase: (cleanSetting(cfg.mbbank_history_base) || MBBANK_HISTORY_BASE).replace(/\/$/, '')
  }
}

async function checkMbbankTransactions() {
  const mbbank = await getMbbankRuntimeConfig()
  if (!mbbank.token) return

  const now = Date.now()
  if (mbbankPollPausedUntil && now < mbbankPollPausedUntil) return
  if (mbbankPollPausedUntil && now >= mbbankPollPausedUntil) {
    console.log('[MBBank Poll] Hết thời gian tạm dừng — thử kết nối lại.')
    mbbankPollPausedUntil = 0
    mbbankClearAuthFailure()
  }

  try {
    const url = `${mbbank.historyBase}/${encodeURIComponent(mbbank.token)}`
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { Accept: 'application/json' }
    })
    const data = response.data
    const bodyStr = sepayResponseText(data)

    if (data?.status !== 'success' || !Array.isArray(data.TranList)) {
      if (sepayIsAuthOrCircuitProblem(response.status, bodyStr, data?.message || '')) {
        mbbankNoteAuthFailure(bodyStr.slice(0, 400))
      } else {
        console.warn('[MBBank Poll] API không success hoặc thiếu TranList:', bodyStr.slice(0, 220))
      }
      return
    }

    mbbankClearAuthFailure()
    const list = data.TranList

    for (const tx of list) {
      const dedupeKey = mbbankDedupeKey(tx)
      if (processedMbbankRefNos.has(dedupeKey)) continue

      const amountIn = getIncomingAmount(tx)
      if (amountIn <= 0) continue

      const txContent = getIncomingContent(tx)
      try {
        const match = await findPaymentMatchByIncoming(txContent, amountIn)
        if (match) {
          const refLabel = tx.refNo || tx.tranId || dedupeKey.slice(0, 40)
          console.log(`[MBBank] ✅ MATCHED ref=${refLabel} content="${txContent.slice(0, 80)}"`)
          await processConfirmedPayment(match.transfer_content, amountIn)
          rememberMbbankRef(dedupeKey)
        } else {
          // Kiểm tra wallet topup nếu không khớp payment
          const topupMatch = await findWalletTopupByIncoming(txContent, amountIn)
          if (topupMatch) {
            console.log(`[MBBank] 💰 WALLET TOPUP MATCHED: ${topupMatch.transfer_content}`)
            await processConfirmedWalletTopup(topupMatch.transfer_content, amountIn)
            rememberMbbankRef(dedupeKey)
          }
        }
      } catch (dbErr) {
        console.error('[MBBank Poll] ❌ Lỗi DB —', dbErr.message.slice(0, 200))
      }
    }
  } catch (err) {
    const st = err.response?.status
    const bodyStr = sepayResponseText(err.response?.data)
    const msg = String(err.message || '')

    if (sepayIsDatabaseOrConnError(msg)) {
      console.error('[MBBank Poll] ❌ Lỗi Postgres / kết nối DB —', msg.slice(0, 220))
      return
    }

    if (err.response && sepayIsAuthOrCircuitProblem(st, bodyStr, err.message)) {
      mbbankNoteAuthFailure(bodyStr || err.message)
    } else if (!err.response) {
      console.error('[MBBank Poll] ❌ Network/timeout:', msg.slice(0, 200))
    } else {
      console.error('[MBBank Poll]', err.message)
    }
  }
}

async function pollIncomingBankTransactions() {
  await checkMbbankTransactions()
}

// ===================== EXPIRY / REMINDER / HEALTH =====================
/**
 * Tự động hủy đơn pending quá 30 phút chưa thanh toán.
 * Chạy mỗi 5 phút.
 */
async function runPendingCancellationJob() {
  try {
    await connectMongo()
    const threshold = new Date(Date.now() - 30 * 60 * 1000)
    const subs = normalizeDocs(
      await collection('subscriptions')
        .find({ status: 'pending', created_at: { $lt: threshold } })
        .toArray()
    )

    if (subs.length === 0) return 0

    const profileMap = new Map()
    const userIds = [...new Set(subs.map((r) => r.user_id).filter(Boolean))]
    if (userIds.length > 0) {
      const profiles = normalizeDocs(
        await collection('profiles').find({ id: { $in: userIds } }).toArray()
      )
      for (const profile of profiles) profileMap.set(profile.id, profile)
    }

    const ids = subs.map(r => r.id)
    console.log(`[AutoCancel] Cancelling ${ids.length} pending subscription(s) older than 30min`)

    await collection('subscriptions').updateMany(
      { id: { $in: ids }, status: 'pending' },
      { $set: { status: 'cancelled' } }
    )

    await collection('payments').updateMany(
      { subscription_id: { $in: ids }, status: 'pending' },
      { $set: { status: 'failed' } }
    )

    if (ids.length > 0) {
      sendTelegram(
        `🗑️ <b>Tự động hủy ${ids.length} đơn hàng</b>\n` +
        `Lý do: Chưa thanh toán sau 30 phút.\n` +
        subs.slice(0, 5).map(r =>
          `• ${profileMap.get(r.user_id)?.email || r.user_id} — ${r.plan} (${new Date(r.created_at).toLocaleString('vi-VN')})`
        ).join('\n') +
        (ids.length > 5 ? `\n... và ${ids.length - 5} đơn khác.` : '')
      )
    }

    return ids.length
  } catch (err) {
    console.error('[AutoCancel] ❌', err.message)
    return 0
  }
}

async function runExpiryJob() {
  try {
    await connectMongo()
    const now = new Date()
    const expiringSubs = normalizeDocs(
      await collection('subscriptions')
        .find({
          status: 'active',
          end_at: { $ne: null, $lt: now }
        })
        .project({ _id: 1, id: 1, login_link: 1 })
        .toArray()
    )

    if (expiringSubs.length > 0) {
      const expiredIds = expiringSubs.map((r) => r.id)
      const result = await collection('subscriptions').updateMany(
        { id: { $in: expiredIds }, status: 'active' },
        { $set: { status: 'expired' } }
      )

      console.log(`[Expiry] ✅ Expired ${result.modifiedCount} subscription(s)`)

      const expiredLinks = expiringSubs.map(r => r.login_link).filter(Boolean)

      if (expiredLinks.length > 0) {
        const resources = normalizeDocs(
          await collection('resources')
            .find({ value: { $in: expiredLinks }, status: { $ne: 'dead' } })
            .toArray()
        )
        for (const resource of resources) {
          const newCount = Math.max(0, Number(resource.assigned_count ?? 1) - 1)
          const maxSlots = Number(resource.max_slots || 5)
          const newStatus = resource.status === 'full' && newCount < maxSlots ? 'available' : resource.status
          await collection('resources').updateOne(
            legacyIdFilter(resource.id),
            { $set: { assigned_count: newCount, status: newStatus } }
          )
        }
        console.log(`[Expiry] Released slots for ${expiredLinks.length} resource(s)`)
      }

      return result.modifiedCount
    }

    return 0
  } catch (err) {
    console.error('[Expiry] ❌', err.message)
    return 0
  }
}

async function runExpiryReminder() {
  try {
    await connectMongo()
    const now = new Date()
    const soon = new Date(Date.now() + 3 * 86400000)
    const result = normalizeDocs(
      await collection('subscriptions')
        .find({
          status: 'active',
          end_at: { $gte: now, $lte: soon },
          $or: [{ reminder_sent: { $exists: false } }, { reminder_sent: false }, { reminder_sent: null }]
        })
        .toArray()
    )

    const cfg = await getAllSettings()

    for (const sub of result) {
      const profile = await getProfileById(sub.user_id)
      if (!profile?.email) continue
      const endDate = new Date(sub.end_at).toLocaleDateString('vi-VN')
      await sendEmail(profile.email, `⏰ Gói Netflix của bạn sắp hết hạn — ${cfg.site_name || 'Netflix Store'}`, `
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
      await collection('subscriptions').updateOne(
        legacyIdFilter(sub.id),
        { $set: { reminder_sent: true } }
      ).catch(() => {})
    }

    if (result.length > 0) console.log(`[Reminder] Sent ${result.length} expiry reminder(s)`)
  } catch (err) {
    const msg = String(err.message || '').toLowerCase()
    if (msg.includes('authentication failed') || msg.includes('bad auth')) {
      console.error('[Reminder] ❌ MongoDB từ chối đăng nhập — sửa MONGODB_URI trong .env rồi restart.')
    } else if (
      msg.includes('connect econnrefused') ||
      msg.includes('server selection') ||
      msg.includes('connection')
    ) {
      console.error('[Reminder] ❌ Lỗi kết nối MongoDB — kiểm tra MONGODB_URI và trạng thái cluster.')
    } else {
      console.error('[Reminder] ❌', err.message)
    }
  }
}

async function runHealthCheck() {
  console.log('[HealthCheck] Starting deep inventory health check (every 5 hours)...')
  let candidates

  try {
    await connectMongo()
    candidates = normalizeDocs(
      await collection('resources')
        .find({ status: 'available', service: 'netflix', account_type: { $ne: 'stock' } })
        .sort({ created_at: 1 })
        .project({ _id: 1, id: 1, value: 1, note: 1 })
        .toArray()
    )
  } catch (err) {
    console.error('[HealthCheck]', err.message)
    return { alive: 0, dead: 0, paymentErrors: 0, total: 0 }
  }

  let alive = 0, dead = 0, paymentErrors = 0
  const total = candidates.length

  for (const res of candidates) {
    try {
      const [details, acct] = await Promise.all([
        checkAccountDetails(res.value),
        fetchNetflixAccountPage(res.value).catch(() => ({ reachable: false, hasPlan: false }))
      ])

      const effectivelyDead = !details.alive || (acct.reachable && !acct.hasPlan)
      const isPaymentError = resourceHasPaymentIssueNote(res) || (!effectivelyDead && (details.paymentError || details.paymentFailed || hasNetflixPaymentErrorFlag(acct)))

      if (effectivelyDead || isPaymentError) {
        if (effectivelyDead) dead++
        if (isPaymentError) paymentErrors++
        await collection('resources').deleteOne(legacyIdFilter(res.id))
      } else {
        alive++
        if (res.note && res.note.includes('[Lỗi TT]')) {
           const cleaned = res.note.replace(/\[Lỗi TT\]\s*-?\s*/i, '').trim()
           await collection('resources').updateOne(legacyIdFilter(res.id), { $set: { note: cleaned || null, updated_at: new Date() } })
        }
      }
    } catch (e) {
      console.error('[HealthCheck] Error checking account', res.id, e.message)
    }
    await new Promise(r => setTimeout(r, 800)) // Throttle deep checks
  }

  console.log(`[HealthCheck] ✅ Done: ${alive} alive, ${dead} dead, ${paymentErrors} payment errors / ${total} total`)

  sendTelegram(
    `🔍 <b>Kiểm tra kho tự động (Mỗi 5h)</b>\n` +
    `✅ Sẵn sàng bán: <b>${alive}</b>\n` +
    `🗑️ Đã xoá (Lỗi TT): <b>${paymentErrors}</b>\n` +
    `🗑️ Đã xoá (Hỏng/Mất gói): <b>${dead}</b>\n` +
    `📦 Còn lại trong kho: <b>${alive}</b> tài khoản\n` +
    `${(dead > 0 || paymentErrors > 0) ? '⚠️ Hệ thống đã tự động dọn dẹp các tài khoản lỗi!' : '👍 Kho sạch và ổn định!'}`
  )

  return { alive, dead, paymentErrors, total }
}

// ===================== ROUTES =====================
app.get('/api/test-db', async (req, res) => {
  try {
    await connectMongo()
    await db.admin().command({ ping: 1 })
    res.json({ success: true, now: new Date().toISOString(), database: db.databaseName })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/get-link', async (req, res) => {
  try {
    const { cookie } = req.body
    if (!cookie) return res.status(400).json({ success: false, message: 'Missing cookie' })

    const details = await checkAccountDetails(cookie)
    if (!details.alive) {
      return res.json({
        success: false,
        reason: 'cookie_dead',
        message: 'Tài khoản bị mất phiên đăng nhập. Vui lòng bấm Bảo hành để được cấp lại.'
      })
    }
    if (!details.hasPremium) {
      return res.json({
        success: false,
        reason: 'plan_lost',
        message: 'Gói dịch vụ không còn hiệu lực. Vui lòng bấm Bảo hành để kiểm tra.'
      })
    }

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
      return res.json({ success: false, reason: 'system_error', message: `nftoken.site returned ${result.status}` })
    }

    let data
    try { data = result.json() } catch { return res.json({ success: false, reason: 'system_error', message: 'Invalid JSON from nftoken.site' }) }

    if (!data || data.status !== 'SUCCESS') {
      return res.json({ success: false, reason: 'system_error', message: 'Không thể lấy link lúc này.', raw: data })
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
    if (!link) {
      return res.json({ success: false, reason: 'system_error', message: 'Không thể lấy link lúc này.', raw: data })
    }

    let acctInfo = null
    try {
      acctInfo = await fetchNetflixAccountPage(cookie)
    } catch { /* payment flag is best-effort here */ }
    const paymentError = hasNetflixPaymentErrorFlag(data) || hasNetflixPaymentErrorFlag(acctInfo)

    res.json({
      success: true,
      link,
      info: {
        email: data.email,
        plan: acctInfo?.plan || data.plan,
        quality: data.video_quality || data.quality,
        screens: data.max_streams || data.screens,
        country: data.country,
        paymentError,
        paymentFailed: paymentError,
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
    res.json({
      alive: details.alive,
      paymentError: !!details.paymentError,
      paymentFailed: !!details.paymentFailed,
      raw: details.raw
    })
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
    let acctInfo = null
    if (details.alive && details.hasPremium) {
      try {
        acctInfo = await fetchNetflixAccountPage(cookie)
      } catch { /* account page detail is best-effort */ }
    }

    let needsWarranty = false
    let reason = null
    const hasPremium = details.hasPremium && !(acctInfo?.reachable && acctInfo.hasPlan === false)
    const paymentError = !!(
      hasPremium &&
      (details.paymentError || details.paymentFailed || hasNetflixPaymentErrorFlag(acctInfo))
    )

    if (!details.alive) {
      needsWarranty = true
      reason = 'cookie_dead'          // Cookie hết hạn / die
    } else if (!hasPremium) {
      needsWarranty = true
      reason = 'plan_lost'            // Cookie sống nhưng mất gói Premium
    }

    res.json({
      alive:          details.alive,
      hasPremium,
      plan:           acctInfo?.plan || details.plan,
      email:          details.email,
      screens:        details.screens,
      paymentError,
      paymentFailed:  paymentError,
      needsWarranty,
      reason,         // 'cookie_dead' | 'plan_lost' | null
    })
  } catch (err) {
    res.status(500).json({ alive: false, hasPremium: false, needsWarranty: true, reason: 'error', message: err.message })
  }
})

/**
 * POST /api/netflix-account-info
 * Lấy thông tin chi tiết từ netflix.com/account: plan, billing date, profiles.
 * Không cần browser — dùng cookie gốc để fetch trực tiếp.
 */
app.post('/api/netflix-account-info', async (req, res) => {
  try {
    const { cookie } = req.body
    if (!cookie) return res.status(400).json({ error: 'Missing cookie' })
    const info = await fetchNetflixAccountPage(cookie)
    res.json(info)
  } catch (err) {
    res.status(500).json({ reachable: false, error: err.message })
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

    let acctInfo = null
    try {
      acctInfo = await fetchNetflixAccountPage(cookie)
    } catch { /* payment flag is best-effort here */ }
    const paymentError = hasNetflixPaymentErrorFlag(acctInfo)

    res.json({ success: true, authUrl, paymentError, paymentFailed: paymentError })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi kết nối tới Netflix, vui lòng thử lại' })
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
      if (errM) {
        const errText = errM[1].trim().replace(/<[^>]*>/g, '').substring(0, 200)
        return res.json({ success: false, message: errText || 'Netflix từ chối mã này' })
      }
      return res.json({ success: false, message: 'Netflix không chấp nhận mã này (có thể sai mã hoặc cookie hết hạn)' })
    }

    res.json({ success: false, message: `HTTP ${result.status} — Netflix không phản hồi đúng định dạng` })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi kết nối tới Netflix, vui lòng thử lại' })
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
      console.warn('[Payment Webhook] ⚠️ Invalid signature, rejected')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  }

  try {
    console.log('[Payment Webhook] Received:', JSON.stringify(req.body))
    const txData = req.body
    const amountIn = getIncomingAmount(txData)
    const txContent = getIncomingContent(txData)

    if (amountIn <= 0) return res.json({ success: true, message: 'Not an incoming transaction' })

    const match = await findPaymentMatchByIncoming(txContent, amountIn)
    if (match) {
      console.log(`[Payment Webhook] ✅ Matched: ${match.transfer_content}`)
      await processConfirmedPayment(match.transfer_content, amountIn)
    } else {
      const topupMatch = await findWalletTopupByIncoming(txContent, amountIn)
      if (topupMatch) {
        console.log(`[Payment Webhook] Wallet topup matched: ${topupMatch.transfer_content}`)
        await processConfirmedWalletTopup(topupMatch.transfer_content, amountIn)
      } else {
        console.log(`[Payment Webhook] No match for content="${txContent}" amount=${amountIn}`)
      }
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[Payment Webhook] Error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/payment-status/:transferContent', async (req, res) => {
  try {
    await connectMongo()
    const { transferContent } = req.params
    const payment = normalizeDoc(
      await collection('payments').findOne(
        { transfer_content: transferContent },
        { sort: { created_at: -1 } }
      )
    )

    if (!payment) {
      return res.json({ confirmed: false, status: 'not_found' })
    }

    const sub = payment.subscription_id ? await getSubscriptionById(payment.subscription_id) : null
    res.json({
      confirmed: payment.status === 'success',
      status: payment.status,
      subStatus: sub?.status,
      subId: sub?.id,
      loginLink: sub?.login_link,
      startAt: sub?.start_at,
      endAt: sub?.end_at,
      plan: sub?.plan
    })
  } catch (err) {
    res.status(500).json({ confirmed: false, error: err.message })
  }
})

app.get('/api/wallet/topup-status/:transferContent', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const { transferContent } = req.params
    const filter = { transfer_content: transferContent, user_id: req.authUserId }
    let topup = normalizeDoc(
      await collection('wallet_topups').findOne(filter, { sort: { created_at: -1 } })
    )

    if (!topup) return res.json({ confirmed: false, status: 'not_found' })

    if (topup.status === 'pending') {
      // Chạy bank check song song với trả kết quả ngay — không chặn response
      const recheckPromise = checkMbbankTransactions().catch(err => {
        console.warn('[WalletTopupStatus] bank check failed:', err.message)
      })
      // Chờ tối đa 4s để có kết quả nhanh; nếu bank API chậm → trả pending rồi FE poll tiếp
      await Promise.race([recheckPromise, new Promise(r => setTimeout(r, 4000))])
      topup = normalizeDoc(
        await collection('wallet_topups').findOne(filter, { sort: { created_at: -1 } })
      )
    }

    const wallet = await getWallet(req.authUserId)
    res.json({
      confirmed: topup?.status === 'success',
      status: topup?.status || 'not_found',
      amount: topup?.actual_amount || topup?.amount || 0,
      balance: wallet.balance || 0
    })
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
  try {
    await connectMongo()
    // Lấy thông tin đơn hàng từ MongoDB
    const sub = await getSubscriptionById(subscriptionId)
    if (!sub) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' })
    }
    if (String(sub.user_id) !== String(req.authUserId)) {
      return res.status(403).json({ success: false, message: 'Không phải đơn của bạn' })
    }

    // Tạo viewer report
    const reportId = createId()
    const now = new Date()
    await collection('viewer_reports').insertOne({
      _id: reportId,
      id: reportId,
      subscription_id: subscriptionId,
      user_id: req.authUserId,
      kind: 'cannot_view',
      status: 'open',
      created_at: now,
      resolved_at: null,
      admin_note: null
    })

    sendTelegram(
      `🚨 <b>Báo không xem được</b> (admin xử lý tay)\n` +
      `Đơn: <code>${subscriptionId}</code>\n` +
      `Gói: ${sub.plan} • Trạng thái: ${sub.status}\n` +
      `<i>Cookie die / mất gói → user dùng Bảo hành tự động.</i>`
    )

    res.json({ success: true, id: reportId, createdAt: now })
  } catch (err) {
    console.error('[report-cannot-view]', err)
    res.status(500).json({ success: false, message: err.message })
  }
})
app.get('/api/admin/viewer-reports', requireAdmin, async (req, res) => {
  const statusFilter = req.query.status
  try {
    await connectMongo()
    // Lọc theo status (bỏ qua 'all' hoặc rỗng → trả hết)
    const filter = (!statusFilter || statusFilter === '' || statusFilter === 'all')
      ? {}
      : { status: statusFilter }

    const reports = normalizeDocs(
      await collection('viewer_reports')
        .find(filter)
        .sort({ created_at: -1 })
        .limit(300)
        .toArray()
    )

    // Join profiles và subscriptions bằng MongoDB lookup thủ công
    const userIds = [...new Set(reports.map(r => r.user_id).filter(Boolean))]
    const subIds  = [...new Set(reports.map(r => r.subscription_id).filter(Boolean))]

    const [profiles, subs] = await Promise.all([
      userIds.length ? normalizeDocs(await collection('profiles').find({ id: { $in: userIds } }).toArray()) : [],
      subIds.length  ? normalizeDocs(await collection('subscriptions').find({ id: { $in: subIds } }).toArray()) : []
    ])

    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const subMap     = new Map(subs.map(s => [s.id, s]))

    const result = reports.map(vr => ({
      id:              vr.id,
      subscription_id: vr.subscription_id,
      user_id:         vr.user_id,
      kind:            vr.kind,
      status:          vr.status,
      created_at:      vr.created_at,
      resolved_at:     vr.resolved_at,
      admin_note:      vr.admin_note,
      user_email:      profileMap.get(vr.user_id)?.email || null,
      sub_plan:        subMap.get(vr.subscription_id)?.plan || null,
      sub_status:      subMap.get(vr.subscription_id)?.status || null,
      sub_end_at:      subMap.get(vr.subscription_id)?.end_at || null,
      sub_login_link:  subMap.get(vr.subscription_id)?.login_link || null,
    }))

    res.json({ reports: result })
  } catch (err) {
    console.error('[admin/viewer-reports]', err)
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/admin/viewer-reports/:id', requireAdmin, async (req, res) => {
  const id = req.params.id
  const { status, admin_note } = req.body || {}
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu id' })
  if (status !== 'resolved' && status !== 'open' && status !== 'rejected') {
    return res.status(400).json({ success: false, message: 'status phải là resolved, rejected hoặc open' })
  }
  if (status === 'rejected' && !String(admin_note || '').trim()) {
    return res.status(400).json({ success: false, message: 'Từ chối cần kèm ghi chú gửi khách (admin_note).' })
  }
  try {
    await connectMongo()
    const setFields = { status }

    // admin_note: luôn ghi khi rejected; ghi theo giá trị khi status khác
    if (status === 'rejected') {
      setFields.admin_note = String(admin_note).trim()
    } else if (admin_note != null) {
      setFields.admin_note = String(admin_note)
    }

    // resolved_at: đặt khi resolve/reject, xóa khi open lại
    setFields.resolved_at = (status === 'resolved' || status === 'rejected') ? new Date() : null

    const updated = normalizeDoc(
      await collection('viewer_reports').findOneAndUpdate(
        legacyIdFilter(id),
        { $set: setFields },
        { returnDocument: 'after' }
      )
    )
    if (!updated) return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo' })

    // Gửi email thông báo khi từ chối
    if (status === 'rejected') {
      const profile = await getProfileById(updated.user_id)
      const site = (await getSetting('site_name')) || 'Dịch vụ'
      await sendEmail(
        profile?.email,
        `${site} — Phản hồi báo không xem được`,
        `<p>Xin chào,</p>
         <p>Chúng tôi đã kiểm tra yêu cầu <strong>báo không xem được</strong> liên quan đơn của bạn.</p>
         <p style="padding:12px 14px;background:#f4f4f5;border-radius:8px;border-left:4px solid #6366f1;">
           ${String(updated.admin_note || '')
             .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
         </p>
         <p>Nếu bạn vẫn gặp khó khăn, vui lòng liên hệ hỗ trợ.</p>`
      )
    }
    res.json({ success: true, row: updated })
  } catch (err) {
    console.error('[admin/viewer-reports patch]', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

/** Admin: kiểm tra acc hiện tại của đơn liên quan báo cáo */
app.post('/api/admin/viewer-reports/:id/check-account', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const vr = normalizeDoc(await collection('viewer_reports').findOne(legacyIdFilter(req.params.id)))
    if (!vr) return res.status(404).json({ error: 'Không tìm thấy báo cáo' })

    const sub = vr.subscription_id ? await getSubscriptionById(vr.subscription_id) : null
    if (!sub?.login_link) return res.json({ checked: false, message: 'Đơn chưa có login link' })

    const [details, acctPage] = await Promise.all([
      checkAccountDetails(sub.login_link),
      fetchNetflixAccountPage(sub.login_link).catch(() => ({ reachable: false, hasPlan: false })),
    ])

    const effectivelyDead = !details.alive || (acctPage.reachable && acctPage.hasPlan === false)
    const status = !details.alive ? 'dead'
      : (acctPage.reachable && acctPage.hasPlan === false) ? 'no_plan'
      : 'ok'
    const paymentError = !effectivelyDead && (details.paymentError || details.paymentFailed || hasNetflixPaymentErrorFlag(acctPage))

    res.json({
      checked: true,
      status,
      alive: details.alive,
      hasPlan: details.hasPremium,
      effectivelyDead,
      paymentError,
      paymentFailed: paymentError,
      plan: acctPage.plan || details.plan || null,
      billingText: acctPage.billingText || null,
      email: details.email || null,
      login_link: sub.login_link,
    })
  } catch (err) {
    console.error('[viewer-reports check-account]', err)
    res.status(500).json({ error: err.message })
  }
})

/** Admin: gán acc từ kho cho đơn (claim_warranty hoặc body.resourceId). */
app.post('/api/admin/viewer-reports/:id/assign-from-pool', requireAdmin, async (req, res) => {
  const id = req.params.id
  const resourceIdRaw = req.body?.resourceId
  const adminNote = req.body?.admin_note != null ? String(req.body.admin_note) : null
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu id' })

  try {
    await connectMongo()

    // Bước 1: Kiểm tra báo cáo
    const vr = normalizeDoc(await collection('viewer_reports').findOne(legacyIdFilter(id)))
    if (!vr) return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo' })
    if (vr.status !== 'open') {
      return res.status(400).json({ success: false, message: 'Báo cáo không còn ở trạng thái chờ xử lý.' })
    }

    const subId = vr.subscription_id
    const resourceId = resourceIdRaw && String(resourceIdRaw).trim() ? String(resourceIdRaw).trim() : null

    if (resourceId) {
      // Bước 2a: Gán acc cụ thể từ kho
      const sub = await getSubscriptionById(subId)
      if (!sub) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' })
      if (sub.status !== 'active') {
        return res.status(400).json({ success: false, message: 'Đơn không ở trạng thái active.' })
      }

      const res2 = await getResourceById(resourceId)
      if (!res2) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản kho' })
      if (res2.status !== 'available') {
        return res.status(400).json({ success: false, message: 'Tài khoản kho không còn trạng thái available' })
      }

      const maxSlots = Number(res2.max_slots || 5)
      const used     = Number(res2.assigned_count || 0)
      if (used >= maxSlots) {
        return res.status(400).json({ success: false, message: 'Tài khoản kho đã hết slot' })
      }

      // Kiểm tra trùng acc
      const dup = await collection('subscriptions').findOne({
        user_id: sub.user_id,
        status: 'active',
        id: { $ne: subId },
        login_link: res2.value
      })
      if (dup) {
        return res.status(400).json({
          success: false,
          message: 'Khách đã có đơn active khác trùng tài khoản này — chọn acc khác.'
        })
      }

      const newCount = used + 1
      const newStatus = newCount >= maxSlots ? 'full' : 'available'
      await collection('resources').updateOne(
        legacyIdFilter(resourceId),
        { $set: { assigned_count: newCount, status: newStatus, assigned_to: subId } }
      )
      await collection('subscriptions').updateOne(
        legacyIdFilter(subId),
        { $set: { login_link: res2.value, updated_at: new Date() } }
      )
    } else {
      // Bước 2b: Admin force gán — đánh dấu acc cũ dead, gán acc mới verified
      const sub = await getSubscriptionById(subId)
      if (!sub) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' })

      // Đánh dấu resource cũ là dead (admin quyết định thay)
      if (sub.login_link) {
        await collection('resources').updateOne(
          { value: sub.login_link },
          { $set: { status: 'dead', dead_reason: 'admin_replaced', updated_at: new Date() } }
        ).catch(() => {})
      }

      // Gán acc mới đã verified (kiểm tra alive + hasPremium trước khi giao)
      const newLink = await assignVerifiedAccount(subId)
      if (!newLink) {
        return res.status(400).json({
          success: false,
          message: 'Không còn tài khoản dự phòng đang hoạt động trong kho. Vui lòng nhập thêm cookie vào kho.'
        })
      }
    }

    // Bước 3: Đánh dấu báo cáo đã giải quyết
    await collection('viewer_reports').updateOne(
      legacyIdFilter(id),
      { $set: {
          status: 'resolved',
          ...(adminNote != null ? { admin_note: adminNote } : {}),
          resolved_at: new Date()
        }
      }
    )

    sendTelegram(
      `✅ <b>Admin đã gán acc từ kho</b> (báo không xem)\n` +
      `Báo cáo: <code>${id}</code>\nĐơn: <code>${subId}</code>`
    )
    res.json({ success: true, message: 'Đã gán tài khoản từ kho và đánh dấu báo cáo đã xử lý.' })
  } catch (err) {
    console.error('[admin/viewer-reports assign-from-pool]', err)
    res.status(500).json({ success: false, message: err.message })
  }
})



/** User: latest rejected viewer_report note per subscription (dashboard). */
app.get('/api/viewer-report-notices', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const reports = normalizeDocs(
      await collection('viewer_reports')
        .find({
          user_id: req.authUserId,
          status: 'rejected',
          admin_note: { $exists: true, $ne: null }
        })
        .sort({ resolved_at: -1 })
        .toArray()
    )

    // DISTINCT ON (subscription_id) — giữ bản mới nhất mỗi sub
    const seen = new Set()
    const notices = []
    for (const row of reports) {
      if (!String(row.admin_note || '').trim()) continue
      if (seen.has(row.subscription_id)) continue
      seen.add(row.subscription_id)
      notices.push({
        id:              row.id,
        subscription_id: row.subscription_id,
        admin_note:      row.admin_note,
        resolved_at:     row.resolved_at
      })
    }

    res.json({ notices })
  } catch (err) {
    console.error('[viewer-report-notices]', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/admin/confirm-payment', requireAdmin, async (req, res) => {
  try {
    const { paymentId } = req.body
    if (!paymentId) return res.status(400).json({ success: false, message: 'Thiếu paymentId' })
    await connectMongo()
    const payment = normalizeDoc(
      await collection('payments').findOne(legacyIdFilter(paymentId), { projection: { transfer_content: 1, amount: 1 } })
    )
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
    await connectMongo()
    const now = new Date()
    const d1  = new Date(now - 1  * 86400000)
    const d7  = new Date(now - 7  * 86400000)
    const d30 = new Date(now - 30 * 86400000)

    const [paymentsAll, subsAll, resourcesAll] = await Promise.all([
      collection('payments').find({ status: 'success' }).toArray(),
      collection('subscriptions').find({}).toArray(),
      collection('resources').find({}).toArray()
    ])

    const sumAmount = (arr) => arr.reduce((s, r) => s + Number(r.amount || 0), 0)
    const pSuccess = paymentsAll.filter(p => p.status === 'success')
    const revenue = {
      today: sumAmount(pSuccess.filter(p => new Date(p.created_at) >= d1)),
      week:  sumAmount(pSuccess.filter(p => new Date(p.created_at) >= d7)),
      month: sumAmount(pSuccess.filter(p => new Date(p.created_at) >= d30)),
      total: sumAmount(pSuccess)
    }
    const orders = {
      total:   subsAll.length,
      today:   subsAll.filter(s => new Date(s.created_at) >= d1).length,
      week:    subsAll.filter(s => new Date(s.created_at) >= d7).length,
      month:   subsAll.filter(s => new Date(s.created_at) >= d30).length,
      active:  subsAll.filter(s => s.status === 'active').length,
      pending: subsAll.filter(s => s.status === 'pending').length,
      expired: subsAll.filter(s => s.status === 'expired').length
    }
    const customers = new Set(subsAll.map(s => s.user_id).filter(Boolean)).size
    const inventory = {
      available:         resourcesAll.filter(r => r.status === 'available').length,
      netflix_available: resourcesAll.filter(r => r.status === 'available' && (r.service === 'netflix' || !r.service) && (r.account_type || 'shared') !== 'stock' && !resourceHasPaymentIssueNote(r)).length,
      stock_available:   resourcesAll.filter(r => r.status === 'available' && r.account_type === 'stock' && (r.service || 'other') !== 'netflix').length,
      full:  resourcesAll.filter(r => r.status === 'full').length,
      dead:  resourcesAll.filter(r => r.status === 'dead').length,
      total: resourcesAll.length
    }
    // ── User stats ──────────────────────────────────────────────────────────────
    const usersAll = await collection('profiles').find({}).toArray()
    const users = {
      total:   usersAll.length,
      today:   usersAll.filter(u => u.created_at && new Date(u.created_at) >= d1).length,
      week:    usersAll.filter(u => u.created_at && new Date(u.created_at) >= d7).length,
      month:   usersAll.filter(u => u.created_at && new Date(u.created_at) >= d30).length,
    }

    // ── Revenue by month (last 6 months) ────────────────────────────────────────
    const revenueByMonth = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const dEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const label = `${d.getMonth() + 1}/${d.getFullYear()}`
      const amt = sumAmount(pSuccess.filter(p => {
        const t = new Date(p.created_at)
        return t >= d && t < dEnd
      }))
      revenueByMonth.push({ label, amount: amt })
    }

    // ── Visitor stats from page_views collection ─────────────────────────────────
    const todayStr = now.toISOString().slice(0, 10)
    const yearStr  = now.toISOString().slice(0, 4)
    const d30Str   = d30.toISOString().slice(0, 10)
    const d7Str    = d7.toISOString().slice(0, 10)
    const pvDocs   = await collection('page_views').find({ date: { $gte: d30Str } }).toArray()
    const visitors = {
      today: pvDocs.filter(p => p.date === todayStr).reduce((s, p) => s + (p.count || 0), 0),
      week:  pvDocs.filter(p => p.date >= d7Str).reduce((s, p) => s + (p.count || 0), 0),
      month: pvDocs.reduce((s, p) => s + (p.count || 0), 0),
      year:  await collection('page_views').find({ date: { $gte: yearStr + '-01-01' } })
               .toArray().then(rows => rows.reduce((s, p) => s + (p.count || 0), 0)),
      byDay: pvDocs.slice(-30).map(p => ({ date: p.date, count: p.count || 0 })),
    }

    res.json({ revenue, orders, customers, users, visitors, revenueByMonth, inventory })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** Public visit tracker — SPA calls this on each route change */
app.post('/api/track-visit', async (req, res) => {
  try {
    await connectMongo()
    const date = new Date().toISOString().slice(0, 10)
    const path = String(req.body?.path || '/').slice(0, 120)
    await collection('page_views').updateOne(
      { date },
      { $inc: { count: 1 }, $set: { updated_at: new Date() }, $addToSet: { paths: path } },
      { upsert: true }
    )
    res.json({ ok: true })
  } catch {
    res.json({ ok: false })
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
    await connectMongo()
    const ops = Object.entries(body)
      .filter(([key]) => ALLOWED_SETTING_KEYS.has(key))
      .map(([key, raw]) => ({
        updateOne: {
          filter: { $or: [{ _id: key }, { key }] },
          update: { $set: { key, value: raw == null ? '' : String(raw), updated_at: new Date() } },
          upsert: true
        }
      }))
    if (ops.length) { await collection('settings').bulkWrite(ops); invalidateSettingsCache() }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: err.message || 'Lỗi lưu cài đặt' })
  }
})

async function handleMbbankDebug(req, res) {
  try {
    const mbbank = await getMbbankRuntimeConfig()
    if (!mbbank.token) {
      return res.json({
        success: false,
        error: 'Chưa cấu hình MBBank API token trong Admin hoặc .env',
        portal: MBBANK_PORTAL_URL
      })
    }
    const url = `${mbbank.historyBase}/${encodeURIComponent(mbbank.token)}`
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { Accept: 'application/json' }
    })
    const data = response.data
    const list = Array.isArray(data?.TranList) ? data.TranList : []
    res.json({
      success: true,
      portal: MBBANK_PORTAL_URL,
      apiStatus: data?.status,
      message: data?.message,
      total: list.length,
      latest: list.slice(0, 8).map((t) => ({
        refNo: t.refNo,
        postingDate: t.postingDate,
        creditAmount: t.creditAmount,
        description: t.description ? String(t.description).slice(0, 120) : ''
      }))
    })
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      portal: MBBANK_PORTAL_URL,
      response: error.response?.data
    })
  }
}

app.get('/api/mbbank-debug', requireAdmin, handleMbbankDebug)
app.get('/api/sepay-debug', requireAdmin, (req, res) => {
  res.set('X-Deprecated-Endpoint', '/api/mbbank-debug')
  handleMbbankDebug(req, res)
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
  const siteName = (s.bank_name && String(s.bank_name).trim()) || DEFAULT_BANK_NAME || 'MB Bank'
  const siteAcct = (s.bank_account && String(s.bank_account).trim()) || DEFAULT_BANK_ACCOUNT
  const siteOwner = (s.bank_owner && String(s.bank_owner).trim()) || DEFAULT_BANK_OWNER
  return {
    source: useSeller ? 'seller' : 'site',
    bank_name: useSeller ? (storeRow.bank_name || 'Ngân hàng') : siteName,
    bank_account: useSeller ? storeRow.bank_account : siteAcct,
    bank_owner: useSeller ? (storeRow.bank_owner || '') : siteOwner,
    momo_number: useSeller ? (storeRow.momo_number || '') : (s.momo_number || ''),
    momo_name: useSeller ? (storeRow.momo_name || '') : (s.momo_name || ''),
    vietqr_bank_bin: useSeller ? bin(storeRow.vietqr_bank_bin) : bin(s.vietqr_bank_bin)
  }
}

function resolveSiteBankTransfer(settings) {
  const s = settings || {}
  const clean = (value) => String(value || '').trim()
  const bin = clean(s.vietqr_bank_bin)
  return {
    bank_name: clean(s.bank_name) || DEFAULT_BANK_NAME || 'MB Bank',
    bank_account: clean(s.bank_account) || DEFAULT_BANK_ACCOUNT || '321336',
    bank_owner: clean(s.bank_owner) || DEFAULT_BANK_OWNER || 'PHAM VAN VIET',
    vietqr_bank_bin: /^\d{6}$/.test(bin) ? bin : '970422'
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

async function fetchMergedPlansForStoreMongo(storeId) {
  await connectMongo()
  const [legacyPlans, catalogPlans] = await Promise.all([
    collection('plans').find({ is_active: { $ne: false } }).sort({ sort_order: 1, price: 1 }).toArray(),
    fetchCatalogVariantPlans()
  ])
  const plans = [
    ...normalizeDocs(legacyPlans).map(p => ({ ...p, base_price: p.base_price ?? p.price })),
    ...catalogPlans
  ]
  if (!storeId) return plans
  const prices = normalizeDocs(await collection('seller_store_plan_prices').find({ seller_store_id: storeId }).toArray())
  const priceMap = new Map(prices.map(p => [p.plan_id, p.price]))
  return plans.map(p => ({ ...p, price: priceMap.has(p.id) ? priceMap.get(p.id) : p.price, base_price: p.price }))
}

async function buildPublicStoreBundle(_client, storeRow) {
  const settings = await getAllSettings()
  const plans = await fetchMergedPlansForStoreMongo(storeRow.id).catch(() => [])
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
    if (!host || isMainDomainHost(host)) return res.status(404).json({ error: 'not_custom_domain' })
    await connectMongo()
    const store = normalizeDoc(await collection('seller_stores').findOne({ custom_domain: { $regex: new RegExp(`^${host}$`, 'i') }, is_active: true }))
    if (!store) return res.status(404).json({ error: 'Không tìm thấy gian hàng cho tên miền này' })
    const bundle = await buildPublicStoreBundle(null, store)
    res.json(bundle)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/checkout/quote', async (req, res) => {
  try {
    const planId = String(req.query.planId || '').trim()
    const sellerStoreId = String(req.query.sellerStoreId || '').trim()
    if (!planId) return res.status(400).json({ message: 'Thiếu planId' })
    await connectMongo()
    const base = await getPlanById(planId)
    if (!base) return res.status(404).json({ message: 'Gói không tồn tại' })
    let price = base.price
    let payment
    if (sellerStoreId) {
      const sp = normalizeDoc(await collection('seller_store_plan_prices').findOne({ seller_store_id: sellerStoreId, plan_id: planId }))
      if (sp) price = sp.price
      const store = normalizeDoc(await collection('seller_stores').findOne({ ...legacyIdFilter(sellerStoreId), is_active: true }))
      if (!store) return res.status(404).json({ message: 'Gian hàng không tồn tại' })
      payment = resolvePaymentDisplay(store, await getAllSettings())
    } else {
      payment = resolvePaymentDisplay(null, await getAllSettings())
    }
    res.json({ plan: { ...base, price, base_price: base.price }, payment })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/public/plans', async (req, res) => {
  try {
    const sellerStoreId = String(req.query.sellerStoreId || '').trim()
    if (!sellerStoreId) return res.status(400).json({ message: 'Thiếu sellerStoreId' })
    const plans = await fetchMergedPlansForStoreMongo(sellerStoreId)
    res.json({ plans })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/store/:slug', async (req, res) => {
  try {
    const slug = normalizeSellerSlug(req.params.slug)
    if (!SELLER_SLUG_RE.test(slug)) return res.status(400).json({ error: 'Slug không hợp lệ' })
    await connectMongo()
    const store = normalizeDoc(await collection('seller_stores').findOne({ slug, is_active: true }))
    if (!store) return res.status(404).json({ error: 'Không tìm thấy gian hàng' })
    const bundle = await buildPublicStoreBundle(null, store)
    res.json(bundle)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/seller/store', requireSellerOrAdmin, async (req, res) => {
  try {
    await connectMongo()
    const store = normalizeDoc(await collection('seller_stores').findOne({ owner_id: req.sellerUserId }))
    res.json(maskSellerStoreResponse(store))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.post('/api/seller/store', requireSellerOrAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const slug = normalizeSellerSlug(body.slug)
    const display_name = String(body.display_name || '').trim().slice(0, 120)
    if (!SELLER_SLUG_RE.test(slug)) return res.status(400).json({ message: 'Slug 3–32 ký tự, chữ thường, số và dấu gạch ngang' })
    if (!display_name) return res.status(400).json({ message: 'Thiếu tên hiển thị (display_name)' })
    let custom_domain = null
    if (body.custom_domain && String(body.custom_domain).trim()) {
      const d = normalizeCustomDomainInput(body.custom_domain)
      if (d.error) return res.status(400).json({ message: d.error })
      custom_domain = d.value
    }
    await connectMongo()
    const ex = await collection('seller_stores').findOne({ owner_id: req.sellerUserId })
    if (ex) return res.status(409).json({ message: 'Bạn đã có gian hàng — dùng PATCH để sửa' })
    const taken = await collection('seller_stores').findOne({ slug })
    if (taken) return res.status(409).json({ message: 'Slug đã được dùng' })
    const id = createId(); const now = new Date()
    const doc = { _id: id, id, owner_id: req.sellerUserId, slug, display_name,
      tagline: String(body.tagline || '').trim().slice(0, 240),
      theme_primary: String(body.theme_primary || '#E50914').trim().slice(0, 32),
      custom_domain, is_active: true, created_at: now, updated_at: now }
    await collection('seller_stores').insertOne(doc)
    res.status(201).json(normalizeDoc(doc))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.patch('/api/seller/store', requireSellerOrAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    await connectMongo()
    const cur = await collection('seller_stores').findOne({ owner_id: req.sellerUserId }, { projection: { id: 1 } })
    if (!cur) return res.status(404).json({ message: 'Chưa có gian hàng — dùng POST để tạo' })

    // Xây dựng object update MongoDB native
    const updates = {}

    if (body.slug != null) {
      const slug = normalizeSellerSlug(body.slug)
      if (!SELLER_SLUG_RE.test(slug)) {
        return res.status(400).json({ message: 'Slug không hợp lệ' })
      }
      const takenByOther = await collection('seller_stores').findOne({ slug, owner_id: { $ne: req.sellerUserId } })
      if (takenByOther) return res.status(409).json({ message: 'Slug đã được dùng' })
      updates.slug = slug
    }
    if (body.display_name != null) updates.display_name = String(body.display_name).trim().slice(0, 120)
    if (body.tagline != null) updates.tagline = String(body.tagline).trim().slice(0, 240)
    if (body.theme_primary != null) updates.theme_primary = String(body.theme_primary).trim().slice(0, 32)
    if (body.is_active != null) updates.is_active = !!body.is_active
    if (body.custom_domain !== undefined) {
      const d = normalizeCustomDomainInput(body.custom_domain)
      if (d.error) return res.status(400).json({ message: d.error })
      if (d.value && isMainDomainHost(d.value)) {
        return res.status(400).json({ message: 'Không dùng tên miền chính của hệ thống làm tên miền gian hàng' })
      }
      updates.custom_domain = d.value
    }
    if (body.bank_name != null) updates.bank_name = String(body.bank_name).trim().slice(0, 120)
    if (body.bank_account != null) updates.bank_account = String(body.bank_account).trim().slice(0, 64)
    if (body.bank_owner != null) updates.bank_owner = String(body.bank_owner).trim().slice(0, 120)
    if (body.momo_number != null) updates.momo_number = String(body.momo_number).trim().slice(0, 32)
    if (body.momo_name != null) updates.momo_name = String(body.momo_name).trim().slice(0, 120)
    if (body.vietqr_bank_bin != null) {
      const b = String(body.vietqr_bank_bin).trim()
      if (b && !/^\d{6}$/.test(b)) return res.status(400).json({ message: 'Mã BIN VietQR phải đúng 6 chữ số' })
      updates.vietqr_bank_bin = b || null
    }
    if (body.gmail_user != null) updates.gmail_user = String(body.gmail_user).trim().slice(0, 200)
    if (body.gmail_app_password !== undefined) {
      const gp = body.gmail_app_password
      updates.gmail_app_password = (gp === null || gp === '') ? null : String(gp).slice(0, 128)
    }
    if (body.telegram_bot_token !== undefined) {
      const t = body.telegram_bot_token
      updates.telegram_bot_token = (t === null || t === '') ? null : String(t).slice(0, 256)
    }
    if (body.telegram_chat_id != null) updates.telegram_chat_id = String(body.telegram_chat_id).trim().slice(0, 64)
    if (body.reseller_guide != null) updates.reseller_guide = String(body.reseller_guide).slice(0, 20000)

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'Không có trường cập nhật' })

    const store = normalizeDoc(await collection('seller_stores').findOneAndUpdate(
      { owner_id: req.sellerUserId },
      { $set: { ...updates, updated_at: new Date() } },
      { returnDocument: 'after' }
    ))
    res.json(maskSellerStoreResponse(store))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

app.get('/api/seller/plan-prices', requireSellerOrAdmin, async (req, res) => {
  try {
    await connectMongo()
    const store = await collection('seller_stores').findOne({ owner_id: req.sellerUserId }, { projection: { id: 1 } })
    if (!store) return res.json({ plans: [] })
    const storeId = store.id || String(store._id)
    const plans = await fetchMergedPlansForStoreMongo(storeId)
    res.json({ plans })
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
    await connectMongo()
    const store = await collection('seller_stores').findOne({ owner_id: req.sellerUserId }, { projection: { id: 1 } })
    if (!store) return res.status(404).json({ message: 'Chưa có gian hàng' })
    const storeId = store.id || String(store._id)

    // Upsert từng plan price bằng MongoDB bulkWrite
    const ops = []
    for (const [planId, rawPrice] of Object.entries(prices)) {
      const price = parseInt(rawPrice, 10)
      if (Number.isNaN(price) || price <= 0) continue
      ops.push({
        updateOne: {
          filter: { seller_store_id: storeId, plan_id: planId },
          update: { $set: { seller_store_id: storeId, plan_id: planId, price } },
          upsert: true
        }
      })
    }
    if (ops.length > 0) await collection('seller_store_plan_prices').bulkWrite(ops)
    const merged = await fetchMergedPlansForStoreMongo(storeId)
    res.json({ success: true, plans: merged })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/** Thống kê đơn thành công gắn với gian hàng */
app.get('/api/seller/stats', requireSellerOrAdmin, async (req, res) => {
  try {
    await connectMongo()
    const store = normalizeDoc(await collection('seller_stores').findOne(
      { owner_id: req.sellerUserId },
      { projection: { id: 1, slug: 1, display_name: 1 } }
    ))
    if (!store) return res.json({ store: null, orders: 0, revenue: 0 })

    const storeId = store.id || String(store._id)
    const payments = await collection('payments')
      .find({ seller_store_id: storeId, status: 'success' })
      .project({ amount: 1 })
      .toArray()
    const orders = payments.length
    const revenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    res.json({ store: { id: store.id, slug: store.slug, display_name: store.display_name }, orders, revenue })
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
  pollIncomingBankTransactions()
  setInterval(pollIncomingBankTransactions, 5000)
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
  console.log('[HealthCheck] Scheduled to run every 5 hours')

  setTimeout(() => {
    const tick = () => runHealthCheck().catch(err => console.error('[HealthCheck]', err.message))
    tick()
    setInterval(tick, 5 * 60 * 60 * 1000) // 5 hours
  }, 15000) // start 15s after server starts
}
scheduleHealthCheck()

// ===================== PLANS ROUTES =====================
app.get('/api/plans', async (req, res) => {
  try {
    await connectMongo()
    const plans = normalizeDocs(
      await collection('plans')
        .find({ is_active: { $ne: false } })
        .sort({ sort_order: 1, price: 1 })
        .toArray()
    )
    res.json({ plans })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/plans/:id', async (req, res) => {
  try {
    await connectMongo()
    const plan = await getPlanById(req.params.id)
    if (!plan) return res.status(404).json({ error: 'Không tìm thấy gói' })
    res.json({ plan })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/admin/plans', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const { name, price, duration_days } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'Thiếu tên gói (name)' })
    if (price == null || isNaN(Number(price))) return res.status(400).json({ error: 'Thiếu hoặc sai giá (price)' })
    if (!duration_days || isNaN(Number(duration_days))) return res.status(400).json({ error: 'Thiếu số ngày (duration_days)' })
    const id = createId()
    const now = new Date()
    const plan = { _id: id, id, ...req.body, name: name.trim(), price: Number(price), duration_days: Number(duration_days), created_at: now, updated_at: now }
    await collection('plans').insertOne(plan)
    res.status(201).json({ plan: normalizeDoc(plan) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/admin/plans/:id', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const updated = normalizeDoc(await collection('plans').findOneAndUpdate(
      legacyIdFilter(req.params.id),
      { $set: { ...req.body, updated_at: new Date() } },
      { returnDocument: 'after' }
    ))
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy gói' })
    res.json({ plan: updated })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/admin/plans/:id', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const count = await collection('subscriptions').countDocuments({ plan: req.params.id })
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — còn ${count} đơn đang dùng gói này.` })
    await collection('plans').deleteOne(legacyIdFilter(req.params.id))
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== PUBLIC CATALOG =====================
app.get('/api/catalog', async (req, res) => {
  try {
    await connectMongo()
    const categories = normalizeDocs(
      await collection('product_categories')
        .find({ status: { $ne: 'inactive' } })
        .sort({ sortOrder: 1, name: 1 })
        .toArray()
    )
    if (!categories.length) return res.json({ categories: [] })

    const categoryIds = categories.map(c => c.id)
    const [rawProducts, rawVariants] = await Promise.all([
      collection('products').find({ categoryId: { $in: categoryIds }, status: 'active' })
        .sort({ sortOrder: 1, name: 1 }).toArray(),
      collection('product_variants').find({ status: 'active' }).toArray()
    ])
    const products = normalizeDocs(rawProducts)
    const variants = normalizeDocs(rawVariants)
    const productIds = products.map(p => p.id)

    // Fetch product details (shortDescription etc.) if any products exist
    const rawDetails = productIds.length
      ? await collection('product_details').find({ productId: { $in: productIds } }).toArray()
      : []
    const details = normalizeDocs(rawDetails)
    const detailByProduct = new Map(details.map(d => [d.productId, d]))

    const varByProduct = {}
    for (const v of variants) {
      if (!varByProduct[v.productId]) varByProduct[v.productId] = []
      varByProduct[v.productId].push(v)
    }

    const prodByCategory = {}
    for (const p of products) {
      const detail = detailByProduct.get(p.id)
      if (!prodByCategory[p.categoryId]) prodByCategory[p.categoryId] = []
      prodByCategory[p.categoryId].push({
        ...p,
        shortDescription: detail?.shortDescription || null,
        longDescription: detail?.longDescription || null,
        variants: (varByProduct[p.id] || [])
          .map(v => ({ ...v, duration_days: resolveCatalogVariantDuration(p, v) }))
          .sort((a, b) => (a.price || 0) - (b.price || 0))
      })
    }

    const result = categories
      .filter(c => (prodByCategory[c.id] || []).length > 0)
      .map(c => ({
        ...c,
        products: prodByCategory[c.id].map(p => ({
          ...p,
          fulfillment_type: resolveCatalogFulfillment(p, c)
        }))
      }))

    res.json({ categories: result })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== PUBLIC SETTINGS =====================
app.get('/api/settings', async (req, res) => {
  try {
    const cfg = await getAllSettings()
    // Chỉ trả các key public (ẩn credentials)
    const PUBLIC_KEYS = ['site_name','site_title','meta_description','hero_title','hero_subtitle',
      'bank_name','bank_account','bank_owner','vietqr_bank_bin','momo_number','momo_name',
      'contact_telegram','contact_zalo',
      'social_facebook','social_youtube','social_tiktok','footer_text',
      'notice_enabled','notice_title','notice_body','notice_cta_label','notice_cta_url',
      'catalog_config',
      'show_netflix_credentials']
    const pub = {}
    for (const k of PUBLIC_KEYS) if (cfg[k] != null) pub[k] = cfg[k]
    res.json({ settings: pub })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== SUBSCRIPTIONS ROUTES =====================
app.post('/api/subscriptions', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const { plan, seller_store_id, customer_note, customer_contact_email } = req.body || {}
    if (!plan) return res.status(400).json({ error: 'Thiếu plan' })
    const id = createId(); const now = new Date()
    const note = String(customer_note || '').trim().slice(0, 2000)
    const contactEmail = String(customer_contact_email || '').trim().slice(0, 254)
    const doc = { _id: id, id, user_id: req.authUserId, plan, status: 'pending',
      seller_store_id: seller_store_id || null,
      ...(note ? { customer_note: note } : {}),
      ...(contactEmail ? { customer_contact_email: contactEmail } : {}),
      created_at: now, updated_at: now }
    await collection('subscriptions').insertOne(doc)
    res.status(201).json({ subscription: normalizeDoc(doc) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/my-subscriptions', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const subs = normalizeDocs(await collection('subscriptions').find({ user_id: req.authUserId }).sort({ created_at: -1 }).toArray())
    const planIds = [...new Set(subs.map(s => s.plan).filter(Boolean))]
    const plans = await getPlansByIds(planIds)
    const planMap = new Map(plans.map(p => [p.id, p]))
    const result = subs.map(s => ({ ...s, plans: planMap.get(s.plan) || null }))
    res.json({ subscriptions: result })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/subscriptions/:id', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const sub = normalizeDoc(await collection('subscriptions').findOne(legacyIdFilter(req.params.id)))
    if (!sub) return res.status(404).json({ error: 'Không tìm thấy đơn' })
    if (String(sub.user_id) !== String(req.authUserId)) return res.status(403).json({ error: 'Không phải đơn của bạn' })
    const plan = sub.plan ? await getPlanById(sub.plan) : null
    res.json({ subscription: { ...sub, plans: plan } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== PAYMENTS ROUTES =====================
app.post('/api/payments', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const { subscription_id, amount, plan, method, transfer_content, seller_store_id } = req.body || {}
    if (!subscription_id || !amount) return res.status(400).json({ error: 'Thiếu subscription_id hoặc amount' })
    const id = createId(); const now = new Date()
    const doc = { _id: id, id, user_id: req.authUserId, subscription_id, amount: Number(amount),
      plan: plan || null, method: method || 'bank_transfer', transfer_content: transfer_content || null,
      seller_store_id: seller_store_id || null, status: 'pending', created_at: now, updated_at: now }
    await collection('payments').insertOne(doc)
    res.status(201).json({ payment: normalizeDoc(doc) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/my-payments', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const payments = normalizeDocs(await collection('payments').find({ user_id: req.authUserId }).sort({ created_at: -1 }).toArray())
    const planIds = [...new Set(payments.map(p => p.plan).filter(Boolean))]
    const plans = await getPlansByIds(planIds)
    const planMap = new Map(plans.map(p => [p.id, p]))
    const result = payments.map(p => ({ ...p, plans: planMap.get(p.plan) || null }))
    res.json({ payments: result })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== ADMIN: SUBSCRIPTIONS =====================
app.get('/api/admin/subscriptions', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const filter = req.query.user_id ? { user_id: req.query.user_id } : {}
    const subs = normalizeDocs(await collection('subscriptions').find(filter).sort({ created_at: -1 }).toArray())
    const userIds = [...new Set(subs.map(s => s.user_id).filter(Boolean))]
    const planIds = [...new Set(subs.map(s => s.plan).filter(Boolean))]
    const [profiles, plans] = await Promise.all([
      userIds.length ? normalizeDocs(await collection('profiles').find({ id: { $in: userIds } }).toArray()) : [],
      getPlansByIds(planIds)
    ])
    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const planMap = new Map(plans.map(p => [p.id, p]))
    const result = subs.map(s => ({ ...s, plans: planMap.get(s.plan) || null,
      user_email: profileMap.get(s.user_id)?.email || s.user_id }))
    res.json({ subscriptions: result })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** Trả về tất cả product_variants dưới dạng plan-compatible objects — dùng cho admin frontend */
app.get('/api/admin/variant-plans', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const variants = normalizeDocs(await collection('product_variants').find({}).toArray())
    if (!variants.length) return res.json({ plans: [] })

    const productIds = [...new Set(variants.map(v => v.productId).filter(Boolean))]
    const products = productIds.length
      ? normalizeDocs(await collection('products').find({ id: { $in: productIds } }).toArray())
      : []
    const productMap = new Map(products.map(p => [p.id, p]))
    const categoryIds = [...new Set(products.map(p => p.categoryId).filter(Boolean))]
    const categories = categoryIds.length
      ? normalizeDocs(await collection('product_categories').find({ id: { $in: categoryIds } }).toArray())
      : []
    const categoryMap = new Map(categories.map(c => [c.id, c]))

    const plans = variants.map(variant => {
      const product = productMap.get(variant.productId)
      const category = product ? categoryMap.get(product.categoryId) : null
      const productFulfillment = resolveCatalogFulfillment(product, category)
      return {
        id: variant.id || String(variant._id),
        variant_id: variant.id || String(variant._id),
        product_id: product?.id || variant.productId || null,
        category_id: product?.categoryId || null,
        category_type: category?.type || null,
        name: product ? `${product.name} - ${variant.name || variant.label}` : (variant.name || variant.label),
        price: variant.price || 0,
        duration_days: resolveCatalogVariantDuration(product, variant),
        service: detectService(product?.name),
        fulfillment_type: productFulfillment,
        sku: variant.sku || product?.sku || null,
        active: variant.status !== 'inactive'
      }
    })
    res.json({ plans })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/admin/subscriptions/:id', requireAdmin, async (req, res) => {

  try {
    await connectMongo()
    const updates = { ...req.body, updated_at: new Date() }
    // Khi admin kích hoạt (pending/expired → active) và không truyền end_at → tự tính từ plan
    if (updates.status === 'active' && !updates.end_at) {
      const sub = normalizeDoc(await collection('subscriptions').findOne(legacyIdFilter(req.params.id)))
      if (sub) {
        const plan = await getPlanById(sub.plan)
        const days = plan?.duration_days || 30
        updates.start_at = updates.start_at || new Date().toISOString()
        updates.end_at = new Date(new Date(updates.start_at).getTime() + days * 86400000).toISOString()
      }
    }
    const updated = normalizeDoc(await collection('subscriptions').findOneAndUpdate(
      legacyIdFilter(req.params.id),
      { $set: updates },
      { returnDocument: 'after' }
    ))
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy đơn' })
    res.json({ subscription: updated })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== ADMIN: PAYMENTS =====================
app.get('/api/admin/payments', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const filter = req.query.user_id ? { user_id: req.query.user_id } : {}
    const payments = normalizeDocs(await collection('payments').find(filter).sort({ created_at: -1 }).toArray())
    const userIds = [...new Set(payments.map(p => p.user_id).filter(Boolean))]
    const profiles = userIds.length ? normalizeDocs(await collection('profiles').find({ id: { $in: userIds } }).toArray()) : []
    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const result = payments.map(p => ({ ...p, user_email: profileMap.get(p.user_id)?.email || p.user_id }))
    res.json({ payments: result })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/admin/payments/:id', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const updated = normalizeDoc(await collection('payments').findOneAndUpdate(
      legacyIdFilter(req.params.id),
      { $set: { ...req.body, updated_at: new Date() } },
      { returnDocument: 'after' }
    ))
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy payment' })
    res.json({ payment: updated })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== ADMIN: PROFILES =====================
app.get('/api/admin/profiles', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const profiles = normalizeDocs(await collection('profiles').find({}).sort({ created_at: -1 }).toArray())
    res.json({ profiles: profiles.map(({ password_hash, ...p }) => p) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/admin/profiles/:id', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const { password_hash, ...updates } = req.body // không cho ghi đè password_hash qua đây
    const updated = normalizeDoc(await collection('profiles').findOneAndUpdate(
      legacyIdFilter(req.params.id),
      { $set: { ...updates, updated_at: new Date() } },
      { returnDocument: 'after' }
    ))
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy user' })
    const { password_hash: _, ...safe } = updated
    res.json({ profile: safe })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/admin/profiles/:id', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    await collection('profiles').deleteOne(legacyIdFilter(req.params.id))
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== ADMIN: ASSIGN PLAN =====================
app.post('/api/admin/assign-plan', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const { user_id, plan_id, login_link } = req.body || {}
    if (!user_id || !plan_id) return res.status(400).json({ error: 'Thiếu user_id hoặc plan_id' })
    const plan = await getPlanById(plan_id)
    if (!plan) return res.status(404).json({ error: 'Không tìm thấy gói' })
    const now = new Date()
    const end = new Date(now.getTime() + (plan.duration_days || 30) * 86400000)
    const subId = createId(); const payId = createId()
    await collection('subscriptions').insertOne({ _id: subId, id: subId, user_id, plan: plan_id,
      status: 'active', start_at: now, end_at: end, login_link: login_link || null, created_at: now, updated_at: now })
    await collection('payments').insertOne({ _id: payId, id: payId, user_id, subscription_id: subId,
      amount: plan.price || 0, plan: plan_id, method: 'admin', transfer_content: 'ADMIN_GRANT',
      status: 'success', created_at: now, updated_at: now })
    res.status(201).json({ success: true, id: subId, subscription_id: subId })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== ADMIN: ACCOUNT INVENTORY =====================

/** Kiểm tra chi tiết gói một tài khoản trong kho — trả về alive + hasPlan + billingText + profiles */
app.post('/api/admin/accounts/:id/check-plan', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const resource = normalizeDoc(await collection('resources').findOne(legacyIdFilter(req.params.id)))
    if (!resource) return res.status(404).json({ error: 'Không tìm thấy tài khoản' })

    if (resourceHasPaymentIssueNote(resource)) {
      await collection('resources').deleteOne(legacyIdFilter(resource.id))
      return res.json({
        id: resource.id,
        alive: true,
        hasPlan: true,
        effectivelyDead: false,
        paymentError: true,
        paymentFailed: true,
        deleted: true,
        deleteReason: 'payment_error',
        plan: resource.plan_name || null,
        billingText: resource.billing_text || null,
        profiles: [],
        email: resource.account_email || null,
        screens: null,
        reachable: true,
      })
    }

    const [details, acct] = await Promise.all([
      checkAccountDetails(resource.value),
      fetchNetflixAccountPage(resource.value)
    ])

    // Cookie alive nhưng mất gói → cũng tính là dead
    const effectivelyDead = !details.alive || (acct.reachable && !acct.hasPlan)
    const paymentError = !effectivelyDead && (details.paymentError || details.paymentFailed || hasNetflixPaymentErrorFlag(acct))

    if (paymentError) {
      await collection('resources').deleteOne(legacyIdFilter(resource.id))
    }

    // Cập nhật last_checked_at để fast-path fulfillment trust được kết quả
    if (!paymentError && !effectivelyDead) {
      collection('resources').updateOne(
        legacyIdFilter(resource.id),
        { $set: { last_checked_at: new Date() } }
      ).catch(() => {})
    }

    // Nếu admin muốn auto-mark dead
    if (!paymentError && effectivelyDead && req.body?.markDead) {
      await collection('resources').updateOne(
        legacyIdFilter(resource.id),
        { $set: { status: 'dead', updated_at: new Date() } }
      )
    }

    res.json({
      id: resource.id,
      alive: details.alive,
      hasPlan: acct.hasPlan,
      effectivelyDead,
      paymentError,
      paymentFailed: paymentError,
      deleted: paymentError,
      deleteReason: paymentError ? 'payment_error' : null,
      plan: acct.plan || details.plan,
      billingText: acct.billingText,
      profiles: acct.profiles,
      email: details.email,
      screens: details.screens,
      reachable: acct.reachable,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/admin/accounts', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const filter = {}
    if (req.query.service)      filter.service = req.query.service
    if (req.query.account_type) filter.account_type = req.query.account_type
    if (req.query.resource_kind) filter.resource_kind = req.query.resource_kind
    if (req.query.status)       filter.status = req.query.status
    if (req.query.plan_id)      filter.plan_id = req.query.plan_id
    const limit = req.query.limit ? parseInt(req.query.limit) : 1000
    const accounts = normalizeDocs(await collection('resources').find(filter).sort({ created_at: -1 }).limit(limit).toArray())
    res.json({ accounts })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/admin/accounts', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const { type, value, note, max_slots, account_type, service, plan_id, variant_id, product_id, category_id, stock_mode, cost_price } = req.body || {}
    if (!value?.trim()) return res.status(400).json({ error: 'Thiếu value' })
    const existing = await collection('resources').findOne({ value: value.trim() })
    if (existing) return res.status(409).json({ error: 'Tài khoản đã tồn tại trong kho' })
    // Kiểm tra live + có gói trước khi thêm vào kho (chỉ với Netflix)
    let svc = service || 'netflix'
    const normalizedAccountType = account_type || 'shared'
    if (normalizedAccountType === 'stock' && isQuantityPlaceholderValue(value)) {
      return res.status(400).json({ error: 'Khong the nhap kho giao tu dong bang gia tri QTY. Hay paste acc/key/link that.' })
    }
    let stockPlan = null
    if (svc === 'netflix' && normalizedAccountType === 'stock') {
      return res.status(400).json({ error: 'Netflix phải nhập dạng Shared hoặc Private, không nhập vào luồng stock dịch vụ' })
    }
    if (svc !== 'netflix' && normalizedAccountType !== 'stock') {
      return res.status(400).json({ error: 'Tài nguyên ngoài Netflix phải nhập qua luồng stock dịch vụ và gắn biến thể' })
    }
    if (normalizedAccountType === 'stock' && svc !== 'netflix') {
      if (!plan_id) return res.status(400).json({ error: 'Stock dịch vụ phải gắn với biến thể' })
      stockPlan = await getPlanById(plan_id)
      if (!stockPlan || !(stockPlan.variant_id || stockPlan.product_id) || (stockPlan.service || 'netflix') === 'netflix' || !isAutoFulfillment(stockPlan.fulfillment_type)) {
        return res.status(400).json({ error: 'Biến thể này không phải dịch vụ cấp dạng Stock/Key' })
      }
      svc = stockPlan.service || svc || 'other'
    }
    let billingText = null, planName = null, planEmail = null
    let accountNote = note || null
    if (svc === 'netflix') {
      // Chạy song song để tiết kiệm thời gian (~2x nhanh hơn tuần tự)
      const [details, acctPage] = await Promise.all([
        checkAccountDetails(value.trim()),
        fetchNetflixAccountPage(value.trim()).catch(() => ({ reachable: false }))
      ])
      if (!details.alive) return res.status(422).json({ error: 'Cookie đã chết hoặc không hợp lệ — không thêm vào kho', code: 'dead' })
      if (!details.hasPremium) return res.status(422).json({
        error: `Cookie sống nhưng không có gói Premium (gói hiện tại: ${details.plan || 'không xác định'}) — không thêm vào kho`,
        code: 'no_plan', plan: details.plan, email: details.email
      })
      planName  = details.plan || null
      planEmail = details.email || null
      let netflixPaymentError = !!(details.paymentError || details.paymentFailed)
      if (acctPage.reachable) {
        billingText = acctPage.billingText || null
        if (acctPage.plan) planName = acctPage.plan
        if (hasNetflixPaymentErrorFlag(acctPage)) netflixPaymentError = true
      }
      if (netflixPaymentError) return res.status(422).json({
        error: `Cookie co loi thanh toan (goi hien tai: ${planName || 'khong xac dinh'}) - khong them vao kho`,
        code: 'payment_error', plan: planName, email: planEmail
      })
    }
    const id = createId(); const now = new Date()
    const doc = {
      _id: id, id, type: type || 'account', value: value.trim(), status: 'available',
      note: accountNote, max_slots: max_slots || 5, assigned_count: 0,
      account_type: normalizedAccountType, service: svc,
      resource_kind: svc === 'netflix' ? 'netflix_account' : 'product_stock',
      plan_id: plan_id || null,
      variant_id: variant_id || stockPlan?.variant_id || plan_id || null,
      product_id: product_id || stockPlan?.product_id || null,
      category_id: category_id || stockPlan?.category_id || null,
      stock_mode: stock_mode || 'value',
      cost_price: Number(cost_price || 0),
      billing_text: billingText, plan_name: planName, account_email: planEmail,
      last_checked_at: now, created_at: now
    }
    await collection('resources').insertOne(doc)
    await syncProductVariantStockQuiet(stockResourceVariantId(doc))
    res.status(201).json({ account: normalizeDoc(doc) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/admin/accounts/bulk', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const { accounts } = req.body || {}
    if (!Array.isArray(accounts) || !accounts.length) return res.status(400).json({ error: 'Thiếu accounts array' })
    const now = new Date()
    let added = 0, duplicates = 0, errors = 0, dead = 0, no_plan = 0, payment_error = 0
    const insertedDocs = []
    const affectedVariantIds = new Set()

    // Xử lý song song tối đa 5 tài khoản cùng lúc để tránh 504
    const CONCURRENCY = 5
    const processOne = async (a) => {
      const val = (a.value || '').trim()
      if (!val) { errors++; return }
      let svc = a.service || 'netflix'
      const normalizedAccountType = a.account_type || 'shared'
      if (normalizedAccountType === 'stock' && isQuantityPlaceholderValue(val)) { errors++; return }
      const exists = await collection('resources').findOne({ value: val })
      if (exists) { duplicates++; return }
      let stockPlan = null
      if (svc === 'netflix' && normalizedAccountType === 'stock') { errors++; return }
      if (svc !== 'netflix' && normalizedAccountType !== 'stock') { errors++; return }
      if (normalizedAccountType === 'stock' && svc !== 'netflix') {
        if (!a.plan_id) { errors++; return }
        stockPlan = await getPlanById(a.plan_id)
        if (!stockPlan || !(stockPlan.variant_id || stockPlan.product_id) || (stockPlan.service || 'netflix') === 'netflix' || !isAutoFulfillment(stockPlan.fulfillment_type)) {
          errors++; return
        }
        svc = stockPlan.service || svc || 'other'
      }
      let billingText = null, planName = null, planEmail = null
      const accountNote = a.note || null
      if (svc === 'netflix') {
        let details, acctPage
        try {
          ;[details, acctPage] = await Promise.all([
            checkAccountDetails(val),
            fetchNetflixAccountPage(val).catch(() => ({ reachable: false }))
          ])
        } catch { errors++; return }
        if (!details.alive) { dead++; return }
        if (!details.hasPremium) { no_plan++; return }
        planName  = details.plan || null
        planEmail = details.email || null
        let netflixPaymentError = !!(details.paymentError || details.paymentFailed)
        if (acctPage.reachable) {
          billingText = acctPage.billingText || null
          if (acctPage.plan) planName = acctPage.plan
          if (hasNetflixPaymentErrorFlag(acctPage)) netflixPaymentError = true
        }
        if (netflixPaymentError) { payment_error++; return }
      }
      try {
        const id = createId()
        const doc = {
          _id: id, id, type: a.type || 'account', value: val, status: 'available',
          note: accountNote, max_slots: a.max_slots || 5, assigned_count: 0,
          account_type: normalizedAccountType, service: svc,
          resource_kind: svc === 'netflix' ? 'netflix_account' : 'product_stock',
          plan_id: a.plan_id || null,
          variant_id: a.variant_id || stockPlan?.variant_id || a.plan_id || null,
          product_id: a.product_id || stockPlan?.product_id || null,
          category_id: a.category_id || stockPlan?.category_id || null,
          stock_mode: a.stock_mode || 'value',
          cost_price: Number(a.cost_price || 0),
          billing_text: billingText, plan_name: planName, account_email: planEmail,
          last_checked_at: now, created_at: now
        }
        await collection('resources').insertOne(doc)
        const affectedVariantId = stockResourceVariantId(doc)
        if (affectedVariantId) affectedVariantIds.add(String(affectedVariantId))
        insertedDocs.push(normalizeDoc(doc))
        added++
      } catch { errors++ }
    }

    // Chạy theo batch CONCURRENCY để không quá tải server Netflix
    for (let i = 0; i < accounts.length; i += CONCURRENCY) {
      await Promise.all(accounts.slice(i, i + CONCURRENCY).map(processOne))
    }

    await Promise.all([...affectedVariantIds].map(id => syncProductVariantStockQuiet(id)))
    res.status(201).json({ added, duplicates, errors, dead, no_plan, payment_error, accounts: insertedDocs })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/admin/accounts/:id', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const body = req.body || {}
    const current = normalizeDoc(await collection('resources').findOne(legacyIdFilter(req.params.id)))
    const nextAccountType = body.account_type || current?.account_type
    const nextValue = body.value != null ? body.value : current?.value
    if (nextAccountType === 'stock' && isQuantityPlaceholderValue(nextValue)) {
      return res.status(400).json({ error: 'Khong the nhap kho giao tu dong bang gia tri QTY. Hay paste acc/key/link that.' })
    }
    const updated = normalizeDoc(await collection('resources').findOneAndUpdate(
      legacyIdFilter(req.params.id),
      { $set: { ...body, updated_at: new Date() } },
      { returnDocument: 'after' }
    ))
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy tài khoản' })
    const affectedVariantIds = new Set(
      [stockResourceVariantId(current), stockResourceVariantId(updated)].filter(Boolean).map(String)
    )
    await Promise.all([...affectedVariantIds].map(id => syncProductVariantStockQuiet(id)))
    res.json({ account: updated })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/admin/accounts/:id', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const current = normalizeDoc(await collection('resources').findOne(legacyIdFilter(req.params.id)))
    await collection('resources').deleteOne(legacyIdFilter(req.params.id))
    await syncProductVariantStockQuiet(stockResourceVariantId(current))
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/admin/accounts/assign', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const { resourceId, subscriptionId } = req.body || {}
    if (!resourceId || !subscriptionId) return res.status(400).json({ error: 'Thiếu resourceId hoặc subscriptionId' })
    const res2 = await getResourceById(resourceId)
    if (!res2) return res.status(404).json({ error: 'Không tìm thấy tài khoản kho' })
    const isSingleUseStock = res2.account_type === 'stock'
    if (isSingleUseStock && isQuantityPlaceholderValue(res2.value)) {
      return res.status(400).json({ error: 'Tai nguyen QTY khong the giao cho khach.' })
    }
    const maxSlots = res2.max_slots || 5
    const currentCount = res2.assigned_count || 0
    if (currentCount >= maxSlots) return res.status(409).json({ error: `Tài khoản đã đầy slot (${currentCount}/${maxSlots})` })
    const newCount = currentCount + 1
    const newStatus = isSingleUseStock ? 'assigned' : (newCount >= maxSlots ? 'full' : 'available')
    await collection('resources').updateOne(legacyIdFilter(resourceId),
      { $set: { assigned_count: newCount, status: newStatus, assigned_to: subscriptionId } })
    await syncProductVariantStockQuiet(stockResourceVariantId(res2))
    await collection('subscriptions').updateOne(legacyIdFilter(subscriptionId),
      { $set: { login_link: res2.value, updated_at: new Date() } })
    res.json({ success: true, login_link: res2.value })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== CLAIM WARRANTY =====================
app.post('/api/claim-warranty', requireUser, async (req, res) => {
  try {
    const { subscriptionId } = req.body || {}
    if (!subscriptionId) return res.status(400).json({ error: 'Thiếu subscriptionId' })
    await connectMongo()
    const sub = await getSubscriptionById(subscriptionId)
    if (!sub) return res.status(404).json({ error: 'Không tìm thấy đơn' })
    if (String(sub.user_id) !== String(req.authUserId)) return res.status(403).json({ error: 'Không phải đơn của bạn' })
    const planMeta = await getPlanMeta(sub.plan)
    if ((planMeta.service || 'netflix') !== 'netflix') {
      return res.status(400).json({ reason: 'out_of_scope', error: 'Lỗi không thuộc phạm vi bảo hành, vui lòng liên hệ hỗ trợ.' })
    }
    const result = await claimWarranty(subscriptionId)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== WALLET ROUTES =====================

/** Lấy số dư + topup đang pending của user */
app.get('/api/wallet', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const [wallet, pendingTopups, cfg] = await Promise.all([
      getWallet(req.authUserId),
      collection('wallet_topups')
        .find({ user_id: req.authUserId, status: 'pending' })
        .sort({ created_at: -1 }).limit(5).toArray(),
      getAllSettings()
    ])
    const bankInfo = resolveSiteBankTransfer(cfg)
    res.json({
      balance: wallet.balance || 0,
      pending_topups: normalizeDocs(pendingTopups),
      ...bankInfo,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** Lịch sử giao dịch ví */
app.get('/api/wallet/transactions', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const txs = normalizeDocs(
      await collection('wallet_transactions')
        .find({ user_id: req.authUserId })
        .sort({ created_at: -1 }).limit(limit).toArray()
    )
    res.json({ transactions: txs })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** Tạo lệnh nạp tiền — sinh mã CK riêng */
app.post('/api/wallet/topup', requireUser, async (req, res) => {
  try {
    const amount = parseInt(req.body?.amount)
    if (!amount || amount < 10000) return res.status(400).json({ error: 'Số tiền tối thiểu 10.000₫' })
    if (amount > 50000000) return res.status(400).json({ error: 'Số tiền tối đa 50.000.000₫' })
    await connectMongo()

    // Kiểm tra topup đang pending (tránh tạo nhiều lần)
    const cfg = await getAllSettings()
    const bankInfo = resolveSiteBankTransfer(cfg)

    const existing = normalizeDoc(await collection('wallet_topups').findOne(
      { user_id: req.authUserId, status: 'pending' },
      { sort: { created_at: -1 } }
    ))
    if (existing) return res.json({ topup: existing, reused: true, ...bankInfo })

    const id = createId()
    const tc = 'VI' + id.replace(/-/g, '').substring(0, 8).toUpperCase()
    const now = new Date()
    const doc = { _id: id, id, user_id: req.authUserId, amount, transfer_content: tc,
      status: 'pending', created_at: now, confirmed_at: null, actual_amount: null }
    await collection('wallet_topups').insertOne(doc)

    res.status(201).json({
      topup: normalizeDoc(doc),
      ...bankInfo
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** Hủy lệnh nạp đang pending */
app.delete('/api/wallet/topup/:id', requireUser, async (req, res) => {
  try {
    await connectMongo()
    const r = await collection('wallet_topups').updateOne(
      { ...legacyIdFilter(req.params.id), user_id: req.authUserId, status: 'pending' },
      { $set: { status: 'cancelled' } }
    )
    if (r.matchedCount === 0) return res.status(404).json({ error: 'Không tìm thấy hoặc đã xử lý' })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** Thanh toán bằng số dư ví */
app.post('/api/wallet/pay', requireUser, async (req, res) => {
  try {
    const { plan_id, seller_store_id, customer_note, customer_contact_email } = req.body || {}
    if (!plan_id) return res.status(400).json({ error: 'Thiếu plan_id' })
    await connectMongo()

    const plan = await getPlanById(plan_id)
    if (!plan) return res.status(404).json({ error: 'Gói không tồn tại' })

    const price = Number(plan.price)
    const customerNote = String(customer_note || '').trim().slice(0, 2000)
    const customerContactEmail = String(customer_contact_email || '').trim().slice(0, 254)
    const now = new Date()
    const durationDays = Number(plan.duration_days || 30)
    const endAt = new Date(now.getTime() + durationDays * 86400000)

    // Trừ ví (atomic — ném lỗi nếu không đủ)
    const balanceAfter = await debitWallet(
      req.authUserId, price, 'spend', null, `Mua gói ${plan.name}`
    )

    // Tạo subscription active
    const subId = createId(); const payId = createId()
    const tc = 'VIPY' + subId.replace(/-/g, '').substring(0, 6).toUpperCase()
    await Promise.all([
      collection('subscriptions').insertOne({
        _id: subId, id: subId, user_id: req.authUserId, plan: plan_id,
        status: 'active', start_at: now, end_at: endAt,
        seller_store_id: seller_store_id || null,
        ...(customerNote ? { customer_note: customerNote } : {}),
        ...(customerContactEmail ? { customer_contact_email: customerContactEmail } : {}),
        created_at: now, updated_at: now
      }),
      collection('payments').insertOne({
        _id: payId, id: payId, user_id: req.authUserId, subscription_id: subId,
        amount: price, plan: plan_id, method: 'wallet', transfer_content: tc,
        seller_store_id: seller_store_id || null, status: 'success', created_at: now, updated_at: now
      })
    ])

    // Gán/giao hàng theo loại fulfillment
    const isNetflix = (plan.service || 'netflix') === 'netflix'
    const fulfillment = plan.fulfillment_type || (isNetflix ? 'netflix' : 'manual')
    let loginLink = null
    if (isNetflix) {
      try { loginLink = await assignVerifiedAccount(subId) } catch (_) {}
    } else if (isAutoFulfillment(fulfillment)) {
      try { loginLink = await assignStockProduct(subId, plan.service || 'other', plan_id) } catch (_) {}
      if (!loginLink) {
        await collection('subscriptions').updateOne(
          legacyIdFilter(subId),
          { $set: { status: 'processing', updated_at: new Date() } }
        )
      }
    } else {
      await collection('subscriptions').updateOne(
        legacyIdFilter(subId),
        { $set: { status: 'processing', updated_at: new Date() } }
      )
    }

    const [cfg, profile] = await Promise.all([getAllSettings(), getProfileById(req.authUserId)])
    const fmtVND = (n) => Number(n).toLocaleString('vi-VN') + '₫'

    sendTelegram(
      `🛒 <b>Đơn từ ví!</b>\n👤 ${profile?.email || req.authUserId}\n` +
      `📦 ${plan.name} | -${fmtVND(price)} | Dư: ${fmtVND(balanceAfter)}\n` +
      `${loginLink ? '✅ Đã giao tự động' : (isNetflix ? '⚠️ Kho trống — cần gán tay' : '⚠️ Cần admin xử lý')}`
    )

    if (loginLink && isNetflix) {
      await sendActivationEmail(subId, loginLink, plan.name, plan.duration_days, cfg).catch(() => {})
    }

    res.json({ success: true, subscription_id: subId, balance_after: balanceAfter, login_link: loginLink })
  } catch (err) {
    if (err.message.includes('Số dư ví')) return res.status(400).json({ error: err.message })
    console.error('[wallet/pay]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Admin wallet routes ──────────────────────────────────────────────────────

app.get('/api/admin/wallets', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const wallets = normalizeDocs(await collection('wallets').find({}).sort({ balance: -1 }).toArray())
    const userIds = wallets.map(w => w.user_id).filter(Boolean)
    const profiles = userIds.length
      ? normalizeDocs(await collection('profiles').find({ id: { $in: userIds } }).toArray())
      : []
    const pm = new Map(profiles.map(p => [p.id, p]))
    res.json({ wallets: wallets.map(w => ({ ...w, email: pm.get(w.user_id)?.email || w.user_id })) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/admin/wallet/topups', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const filter = req.query.status ? { status: req.query.status } : {}
    const topups = normalizeDocs(await collection('wallet_topups').find(filter).sort({ created_at: -1 }).limit(300).toArray())
    const userIds = [...new Set(topups.map(t => t.user_id).filter(Boolean))]
    const profiles = userIds.length
      ? normalizeDocs(await collection('profiles').find({ id: { $in: userIds } }).toArray())
      : []
    const pm = new Map(profiles.map(p => [p.id, p]))
    res.json({ topups: topups.map(t => ({ ...t, email: pm.get(t.user_id)?.email || t.user_id })) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** Admin: cộng/trừ số dư thủ công */
app.post('/api/admin/wallet/credit', requireAdmin, async (req, res) => {
  try {
    let { user_id, amount, note } = req.body || {}
    if (!user_id || !amount) return res.status(400).json({ error: 'Thiếu user_id hoặc amount' })
    const n = parseInt(amount)
    if (isNaN(n) || n === 0) return res.status(400).json({ error: 'Số tiền không hợp lệ' })
    await connectMongo()
    // Support email lookup
    if (user_id.includes('@')) {
      const profile = normalizeDoc(await collection('profiles').findOne({ email: user_id }))
      if (!profile) return res.status(404).json({ error: `Không tìm thấy user với email: ${user_id}` })
      user_id = profile.id
    }
    let balanceAfter
    if (n > 0) {
      balanceAfter = await creditWallet(user_id, n, 'admin_credit', null, note || 'Admin cộng tiền')
    } else {
      balanceAfter = await debitWallet(user_id, Math.abs(n), 'admin_debit', null, note || 'Admin trừ tiền')
    }
    res.json({ success: true, balance_after: balanceAfter })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** Admin confirm wallet topup thủ công */
app.post('/api/admin/wallet/topup/:id/confirm', requireAdmin, async (req, res) => {
  try {
    await connectMongo()
    const topup = normalizeDoc(await collection('wallet_topups').findOne(legacyIdFilter(req.params.id)))
    if (!topup) return res.status(404).json({ error: 'Không tìm thấy' })
    if (topup.status !== 'pending') return res.status(400).json({ error: `Trạng thái: ${topup.status}` })
    const result = await processConfirmedWalletTopup(topup.transfer_content, topup.amount)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ===================== SPA FALLBACK (phải luôn ở CUỐI — sau tất cả API routes) =====================
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
  console.log(`   POST /sepay-webhook  (webhook tùy chọn, định dạng cũ)`)
  console.log(`   GET  /api/payment-status/:code`)
  console.log(`   GET  /api/mbbank-debug  (admin — lịch sử MB, ${MBBANK_PORTAL_URL})`)
  console.log(`   GET  /api/test-db`)
  console.log(`   GET  /api/store/by-host  (tên miền riêng → Host header)`)
  console.log(`   GET  /api/store/:slug  (gian hàng công khai)`)
  console.log(`   GET/PATCH /api/seller/store  (seller JWT)`)
  console.log(`   GET  /api/checkout/quote  /api/public/plans  (giá đại lý)`)
  console.log(`   GET/PUT /api/seller/plan-prices`)
  console.log(`   MAIN_DOMAINS (site chính, không coi là gian hàng): ${[...MAIN_DOMAIN_SET].join(', ') || '(empty)'}`)
  if (MBBANK_API_TOKEN) {
    console.log(`   MBBank polling: every 5s ✅ ACTIVE from .env  ${MBBANK_HISTORY_BASE}/…`)
  } else {
    console.warn(
      `   MBBank polling: chờ token trong Admin Cài đặt hoặc MBBANK_API_TOKEN — ${MBBANK_PORTAL_URL}`
    )
  }
})
