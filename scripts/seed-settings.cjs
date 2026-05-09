#!/usr/bin/env node
'use strict'
/**
 * Seed tất cả system settings vào MongoDB
 * Run: node scripts/seed-settings.cjs
 */
require('dotenv').config()
const { MongoClient } = require('mongodb')

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME   = process.env.MONGODB_DB  || 'netcredit'

const SETTINGS = [
  // ── SEO & Trang chủ ──────────────────────────────────────────
  { key: 'site_name',        value: 'Stream Store' },
  { key: 'site_title',       value: 'Stream Store – Netflix, Spotify, YouTube Premium & AI Tools' },
  { key: 'meta_description', value: 'Stream Store – Mua gói Netflix, Spotify, YouTube Premium, CapCut Pro, ChatGPT, Gemini và các AI tools với giá tốt nhất Việt Nam. Kích hoạt nhanh, bảo hành tự động, hỗ trợ 24/7.' },
  { key: 'meta_keywords',    value: 'netflix premium, spotify premium, youtube premium, capcut pro, chatgpt, gemini advanced, kling ai, mua gói streaming, dịch vụ số, phần mềm bản quyền' },
  { key: 'hero_title',       value: 'Netflix Premium' },
  { key: 'hero_subtitle',    value: 'Gói dùng chung & riêng tư – Bảo hành tự động – Hỗ trợ 24/7' },

  // ── Thanh toán ───────────────────────────────────────────────
  { key: 'bank_name',    value: 'MB Bank' },
  { key: 'bank_account', value: '321336' },
  { key: 'bank_owner',   value: 'PHAM VAN VIET' },

  // ── Tích hợp ─────────────────────────────────────────────────
  { key: 'telegram_bot_token', value: '8658316390:AAFyESZzIkR48Q9xNeo1v7RUOx5Y2IFKDWA' },
  { key: 'telegram_chat_id',   value: '5333740543' },
  { key: 'resend_api_key',     value: '' },
  { key: 'email_from',         value: 'Netflix Store <huycuccho75@gmail.com>' },

  // ── Liên hệ & Footer ─────────────────────────────────────────
  { key: 'contact_telegram', value: 'https://t.me/vanggohh' },
  { key: 'contact_zalo',     value: '' },
  { key: 'social_facebook',  value: '' },
  { key: 'social_youtube',   value: '' },
  { key: 'social_tiktok',    value: '' },
  { key: 'footer_text',      value: '© 2025 Stream Store. Dịch vụ số, phần mềm bản quyền giá tốt.' },
]

async function main() {
  const client = new MongoClient(MONGO_URI)
  await client.connect()
  console.log('Connected to MongoDB:', DB_NAME)
  const col = client.db(DB_NAME).collection('settings')

  let ok = 0, fail = 0
  for (const { key, value } of SETTINGS) {
    try {
      const res = await col.updateOne(
        { key },
        { $set: { key, value, updatedAt: new Date() } },
        { upsert: true }
      )
      const tag = res.upsertedCount ? '[INSERT]' : '[UPDATE]'
      console.log(`${tag} ${key.padEnd(22)} = ${JSON.stringify(value).slice(0, 60)}`)
      ok++
    } catch (e) {
      console.error(`[FAIL]  ${key}: ${e.message}`)
      fail++
    }
  }

  console.log(`\nDone: ${ok} OK, ${fail} failed.`)
  await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
