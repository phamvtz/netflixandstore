const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const dns = require('dns')
try { dns.setDefaultResultOrder('ipv4first'); dns.setServers(['8.8.8.8', '8.8.4.4']) } catch {}
const tls = require('tls')
try {
  tls.DEFAULT_MAX_VERSION = 'TLSv1.2'
  const _csc = tls.createSecureContext
  tls.createSecureContext = (opts) => _csc.call(tls, Object.assign({}, opts, { maxVersion: 'TLSv1.2' }))
} catch {}

const { MongoClient, ServerApiVersion } = require('mongodb')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = process.env.MONGODB_DB || 'netcredit'

const EMAIL = 'adminvplus@gmail.com'
const PASSWORD = 'Viet0608@'

async function createAdmin() {
  const client = new MongoClient(MONGODB_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
  })
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    const col = db.collection('profiles')

    const existing = await col.findOne({ email: EMAIL })
    if (existing) {
      await col.updateOne({ email: EMAIL }, { $set: { role: 'admin', updated_at: new Date() } })
      console.log(`✏️  Tài khoản ${EMAIL} đã tồn tại → đã nâng lên role: admin`)
    } else {
      const password_hash = await bcrypt.hash(PASSWORD, 12)
      const id = crypto.randomUUID()
      const now = new Date()
      await col.insertOne({ _id: id, id, email: EMAIL, password_hash, role: 'admin', created_at: now, updated_at: now })
      console.log(`✅ Đã tạo tài khoản admin: ${EMAIL}`)
    }
    console.log(`\n📋 Thông tin đăng nhập:\n   Email   : ${EMAIL}\n   Password: ${PASSWORD}\n   Role    : admin\n`)
  } catch (err) {
    console.error('❌ Lỗi:', err.message)
    process.exit(1)
  } finally {
    await client.close()
  }
}

createAdmin()
