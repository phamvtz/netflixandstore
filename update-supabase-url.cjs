// update-supabase-url.cjs — Cập nhật Site URL trong Supabase cho VPS
// Usage: node update-supabase-url.cjs
require('dotenv').config()
const https = require('https')

const PROJECT_REF = 'wzshpflwlcfczozhzqjc'
const VPS_URL = 'http://45.77.33.32:3001'
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!ACCESS_TOKEN) {
  console.log('\n❌ Chưa có SUPABASE_ACCESS_TOKEN\n')
  console.log('━━━ Cập nhật thủ công (2 phút) ━━━')
  console.log('\n1. Lấy Access Token:')
  console.log('   https://supabase.com/dashboard/account/tokens')
  console.log('   → "Generate new token" → copy token')
  console.log('\n2. Thêm vào .env:')
  console.log('   SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx')
  console.log('\n3. Chạy lại: node update-supabase-url.cjs')
  console.log('\n━━━ HOẶC cập nhật thủ công trên dashboard ━━━')
  console.log('\n→ Vào URL này:')
  console.log(`   https://supabase.com/dashboard/project/${PROJECT_REF}/auth/url-configuration`)
  console.log('\n→ Đổi "Site URL" thành:', VPS_URL)
  console.log('→ Thêm vào "Redirect URLs":', VPS_URL)
  console.log('→ Bấm Save\n')
  process.exit(0)
}

console.log(`\nCập nhật Site URL → ${VPS_URL}`)

const body = JSON.stringify({
  site_url: VPS_URL,
  uri_allow_list: `${VPS_URL},http://localhost:5173,http://localhost:3001`
})

const options = {
  hostname: 'api.supabase.com',
  path: `/v1/projects/${PROJECT_REF}/config/auth`,
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}

const req = https.request(options, (res) => {
  let data = ''
  res.on('data', c => data += c)
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Site URL đã cập nhật thành công!')
      console.log('✅ Redirect URLs đã được thêm')
    } else {
      console.log('❌ Lỗi HTTP', res.statusCode, data.substring(0, 200))
    }
  })
})
req.on('error', e => console.error('Request error:', e.message))
req.write(body)
req.end()

