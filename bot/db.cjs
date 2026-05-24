'use strict'

const crypto = require('crypto')
const { MongoClient } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || ''
const MONGODB_DB = process.env.MONGODB_DB || 'netcredit'
const BANK_ID = process.env.BANK_ID || 'MB'
const BANK_ACCOUNT = process.env.BANK_ACCOUNT_NO || ''
const BANK_OWNER = process.env.BANK_ACCOUNT_NAME || ''

let mongoClient = null
let db = null

async function connectMongo() {
  if (db) return db
  mongoClient = new MongoClient(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  })
  await mongoClient.connect()
  db = mongoClient.db(MONGODB_DB)
  console.log('[Bot] MongoDB connected:', MONGODB_DB)
  return db
}

function col(name) {
  return db.collection(name)
}

async function getOrCreateBotUser(tgUser) {
  const tgUserId = String(tgUser.id)
  const profile = await col('profiles').findOne({ tg_user_id: tgUserId })
  if (profile) return profile.id

  const id = crypto.randomUUID()
  const now = new Date()
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || `User ${tgUserId}`
  await col('profiles').insertOne({
    id, tg_user_id: tgUserId,
    email: `tg_${tgUserId}@bot.local`,
    full_name: name, display_name: name,
    role: 'user', wallet_balance: 0,
    created_at: now, updated_at: now,
  })
  return id
}

async function getNetflixPlans() {
  return col('plans')
    .find({ service: 'netflix', is_active: true, fulfillment_type: { $ne: 'manual' } })
    .sort({ sort_order: 1 })
    .toArray()
}

async function getPlanById(planId) {
  return col('plans').findOne({ id: planId })
}

async function getBankSettings() {
  try {
    const docs = await col('settings').find({}).toArray()
    const m = {}
    for (const d of docs) {
      if (d.key && d.value != null) m[d.key] = d.value
    }
    return {
      bankName: m.bank_name || BANK_ID,
      bankAccount: m.bank_account || BANK_ACCOUNT,
      bankOwner: m.bank_owner || BANK_OWNER,
      contactTelegram: m.contact_telegram || '',
    }
  } catch {
    return { bankName: BANK_ID, bankAccount: BANK_ACCOUNT, bankOwner: BANK_OWNER, contactTelegram: '' }
  }
}

async function createBotPayment(userId, chatId, tgUserId, planId) {
  const plan = await getPlanById(planId)
  if (!plan) throw new Error('Gói không tồn tại')

  const now = new Date()
  const transferContent = 'NF' + crypto.randomBytes(4).toString('hex').toUpperCase()
  const subId = crypto.randomUUID()
  const paymentId = crypto.randomUUID()

  await col('subscriptions').insertOne({
    id: subId, user_id: userId, plan: planId,
    status: 'pending', login_link: null,
    tg_chat_id: String(chatId), tg_user_id: String(tgUserId),
    created_at: now, updated_at: now,
  })
  await col('payments').insertOne({
    id: paymentId, user_id: userId, subscription_id: subId,
    amount: plan.price, plan: planId,
    method: 'bank_transfer', transfer_content: transferContent,
    status: 'pending',
    tg_chat_id: String(chatId), tg_user_id: String(tgUserId),
    created_at: now, updated_at: now,
  })

  return { subId, paymentId, transferContent, plan }
}

async function checkPaymentStatus(transferContent) {
  const payment = await col('payments').findOne({ transfer_content: transferContent })
  if (!payment || payment.status !== 'success') return { confirmed: false }

  const sub = await col('subscriptions').findOne({ id: payment.subscription_id })
  return {
    confirmed: true,
    loginLink: sub?.login_link || null,
    endAt: sub?.end_at,
    planId: sub?.plan,
  }
}

async function getUserSubscriptions(userId) {
  const subs = await col('subscriptions')
    .find({ user_id: userId }).sort({ created_at: -1 }).limit(5).toArray()
  const planIds = [...new Set(subs.map(s => s.plan).filter(Boolean))]
  const plans = planIds.length
    ? await col('plans').find({ id: { $in: planIds } }).toArray() : []
  const planMap = new Map(plans.map(p => [p.id, p]))
  return subs.map(s => ({ ...s, plan_name: planMap.get(s.plan)?.name || s.plan }))
}

async function cancelPayment(transferContent) {
  const payment = await col('payments').findOne({ transfer_content: transferContent }).catch(() => null)
  if (!payment) return
  const now = new Date()
  await col('payments').updateOne(
    { transfer_content: transferContent, status: 'pending' },
    { $set: { status: 'cancelled', updated_at: now } }
  )
  await col('subscriptions').updateOne(
    { id: payment.subscription_id, status: 'pending' },
    { $set: { status: 'cancelled', updated_at: now } }
  )
}

module.exports = {
  connectMongo, col,
  getOrCreateBotUser, getNetflixPlans, getPlanById,
  getBankSettings, createBotPayment, checkPaymentStatus,
  getUserSubscriptions, cancelPayment,
}
