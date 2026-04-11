/**
 * Chạy: node scripts/run-viewer-reports-migration.cjs
 * Dùng DATABASE_URL trong .env (cùng DB với server).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

function stripSqlComments(sql) {
  return sql
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--')
      return i === -1 ? line : line.slice(0, i)
    })
    .join('\n')
}

function splitStatements(sql) {
  const out = []
  let cur = ''
  let depth = 0
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ';' && depth === 0) {
      const s = cur.trim()
      if (s) out.push(s)
      cur = ''
    } else {
      cur += ch
    }
  }
  const tail = cur.trim()
  if (tail) out.push(tail)
  return out
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Thiếu DATABASE_URL trong .env')
    process.exit(1)
  }
  const file = path.join(__dirname, '..', 'supabase', 'viewer_reports.sql')
  const raw = fs.readFileSync(file, 'utf8')
  const cleaned = stripSqlComments(raw)
  const stmts = splitStatements(cleaned)
  const c = new Client({ connectionString: url })
  await c.connect()
  try {
    for (let i = 0; i < stmts.length; i++) {
      await c.query(stmts[i])
    }
    console.log('OK — migrated', stmts.length, 'statements from supabase/viewer_reports.sql')
  } finally {
    await c.end()
  }
}

main().catch((err) => {
  console.error(err.code || '', err.message)
  process.exit(1)
})
