#!/usr/bin/env node
'use strict'
/**
 * Set contact_telegram setting in MongoDB
 * Usage: node scripts/set-telegram.cjs
 */
require('dotenv').config()
const { MongoClient } = require('mongodb')

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017'
const DB_NAME   = process.env.MONGODB_DB  || process.env.MONGO_DB  || 'netcredit'

async function main() {
  const client = new MongoClient(MONGO_URI)
  await client.connect()
  const db  = client.db(DB_NAME)
  const col = db.collection('settings')

  const toSet = [
    { key: 'contact_telegram', value: 'https://t.me/vanggohh' },
  ]

  for (const { key, value } of toSet) {
    const res = await col.updateOne(
      { key },
      { $set: { key, value, updatedAt: new Date() } },
      { upsert: true }
    )
    console.log(`[${key}] → "${value}"  (matched:${res.matchedCount} upserted:${res.upsertedCount})`)
  }

  await client.close()
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
