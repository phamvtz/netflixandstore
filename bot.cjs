'use strict'

const dns = require('dns')
try { dns.setDefaultResultOrder('ipv4first'); dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']) } catch {}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

require('dotenv').config({ path: require('path').join(__dirname, '.env') })

const TelegramBot = require('node-telegram-bot-api')
const { connectMongo } = require('./bot/db.cjs')
const { registerHandlers } = require('./bot/handlers.cjs')

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
if (!BOT_TOKEN) { console.error('[Bot] TELEGRAM_BOT_TOKEN chưa set'); process.exit(1) }

const bot = new TelegramBot(BOT_TOKEN, { polling: true })

registerHandlers(bot)

connectMongo()
  .then(() => console.log('[Bot] Started — polling mode'))
  .catch(err => { console.error('[Bot] MongoDB failed:', err.message); process.exit(1) })
