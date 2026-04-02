/**
 * PATCH SCRIPT — chạy trên VPS: node patch.cjs
 * Fix lỗi: Supabase pooler "circuit breaker" bị nhầm thành lỗi SePay token
 */
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, 'server.cjs')

if (!fs.existsSync(FILE)) {
  console.error('❌ Không tìm thấy server.cjs tại:', FILE)
  process.exit(1)
}

let content = fs.readFileSync(FILE, 'utf8')
let changed = 0

// ─────────────────────────────────────────────────────────────
// FIX 1: sepayIsDatabaseOrConnError — thêm patterns Supabase pooler
// ─────────────────────────────────────────────────────────────
const old1 = `    m.includes('ssl connection') && m.includes('error')`
const new1 = `    m.includes('too many connections') ||
    m.includes('connection pool') ||
    m.includes('pgbouncer') ||
    m.includes('connection terminated') ||
    m.includes('remaining connection slots') ||
    (m.includes('ssl connection') && m.includes('error'))`

if (content.includes(old1)) {
  content = content.replace(old1, new1)
  changed++
  console.log('✅ Fix 1: sepayIsDatabaseOrConnError — thêm Supabase pooler patterns')
} else {
  console.log('⏭  Fix 1: Đã fix hoặc pattern không khớp (bỏ qua)')
}

// ─────────────────────────────────────────────────────────────
// FIX 2: for loop — bọc DB ops trong try-catch riêng
// ─────────────────────────────────────────────────────────────
const old2 = `      const txContent = tx.transaction_content || ''
      const client = await dbPool.connect()
      try {
        // Match: transfer_content in description AND amount_in >= required amount
        const matches = await client.query(
          \`SELECT transfer_content, amount FROM payments
           WHERE status = 'pending'
             AND UPPER($1) LIKE '%' || UPPER(transfer_content) || '%'
             AND $2 >= amount
           LIMIT 1\`,
          [txContent, amountIn]
        )
        if (matches.rows.length > 0) {
          console.log(\`[SePay] ✅ MATCHED tx=\${tx.id} content="\${txContent}"\`)
          await processConfirmedPayment(matches.rows[0].transfer_content, amountIn)
        }
      } finally {
        client.release()
      }`

const new2 = `      const txContent = tx.transaction_content || ''
      let client
      try {
        client = await dbPool.connect()
        // Match: transfer_content in description AND amount_in >= required amount
        const matches = await client.query(
          \`SELECT transfer_content, amount FROM payments
           WHERE status = 'pending'
             AND UPPER($1) LIKE '%' || UPPER(transfer_content) || '%'
             AND $2 >= amount
           LIMIT 1\`,
          [txContent, amountIn]
        )
        if (matches.rows.length > 0) {
          console.log(\`[SePay] ✅ MATCHED tx=\${tx.id} content="\${txContent}"\`)
          await processConfirmedPayment(matches.rows[0].transfer_content, amountIn)
        }
      } catch (dbErr) {
        // Bắt lỗi DB riêng — KHÔNG để bubble lên outer catch (tránh nhầm với lỗi SePay)
        console.error('[SePay Poll] ❌ Lỗi DB khi xử lý tx', tx.id, '—', dbErr.message.slice(0, 200))
        console.error('[SePay Poll] Kiểm tra DATABASE_URL trong .env trên máy chạy PM2.')
      } finally {
        if (client) client.release()
      }`

if (content.includes(old2)) {
  content = content.replace(old2, new2)
  changed++
  console.log('✅ Fix 2: for loop — thêm try-catch riêng cho DB ops')
} else {
  console.log('⏭  Fix 2: Đã fix hoặc pattern không khớp (bỏ qua)')
}

// ─────────────────────────────────────────────────────────────
// FIX 3: outer catch — chỉ trigger SePay circuit breaker khi có HTTP response
// ─────────────────────────────────────────────────────────────
const old3 = `    if (sepayIsAuthOrCircuitProblem(st, bodyStr, err.message)) {
      sepayNoteAuthFailure(bodyStr || err.message)
    } else {
      console.error('[SePay Poll]', err.message)
    }`

const new3 = `    // Chỉ kích hoạt SePay circuit breaker khi có HTTP response THỰC SỰ từ SePay
    // tránh nhầm lỗi DB (không có err.response) với lỗi auth SePay
    if (err.response && sepayIsAuthOrCircuitProblem(st, bodyStr, err.message)) {
      sepayNoteAuthFailure(bodyStr || err.message)
    } else if (!err.response) {
      // Lỗi network/timeout khi gọi SePay, hoặc lỗi không xác định
      console.error('[SePay Poll] ❌ Network/timeout/DB error:', msg.slice(0, 200))
    } else {
      console.error('[SePay Poll]', err.message)
    }`

if (content.includes(old3)) {
  content = content.replace(old3, new3)
  changed++
  console.log('✅ Fix 3: outer catch — chỉ gọi SePay circuit breaker khi có err.response')
} else {
  console.log('⏭  Fix 3: Đã fix hoặc pattern không khớp (bỏ qua)')
}

// ─────────────────────────────────────────────────────────────
// FIX 4: Reminder catch — nhận diện thêm lỗi Supabase pooler
// ─────────────────────────────────────────────────────────────
const old4 = `  } catch (err) {
    const msg = String(err.message || '')
    if (msg.toLowerCase().includes('password authentication failed')) {
      console.error('[Reminder] Postgres từ chối đăng nhập — sửa DATABASE_URL (mật khẩu user postgres hoặc connection string) trong .env rồi pm2 restart.')
    } else {
      console.error('[Reminder]', err.message)
    }
  } finally {
    if (client) client.release()
  }
}`

const new4 = `  } catch (err) {
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
}`

if (content.includes(old4)) {
  content = content.replace(old4, new4)
  changed++
  console.log('✅ Fix 4: Reminder catch — nhận diện thêm lỗi Supabase pooler')
} else {
  console.log('⏭  Fix 4: Đã fix hoặc pattern không khớp (bỏ qua)')
}

// ─────────────────────────────────────────────────────────────
// Ghi file
// ─────────────────────────────────────────────────────────────
if (changed > 0) {
  fs.writeFileSync(FILE, content, 'utf8')
  console.log(`\n✅ Đã ghi ${changed} fix vào server.cjs`)
  console.log('👉 Chạy tiếp: pm2 restart netflix-store && pm2 logs netflix-store --lines 30')
} else {
  console.log('\n⚠️  Không có fix nào được áp dụng — file có thể đã được patch rồi.')
}
