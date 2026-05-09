/**
 * scripts/seed-catalog.cjs
 * Seed danh mục + sản phẩm + biến thể cho catalog phi Netflix.
 * Chạy: node scripts/seed-catalog.cjs
 * Dùng upsert nên chạy nhiều lần an toàn.
 */
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

const { MongoClient } = require('mongodb')
const { randomUUID } = require('crypto')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME     = process.env.MONGODB_DB  || 'netcredit'

// ── Icons (SVG inline) ────────────────────────────────────────────────────────
const ICONS = {
  youtube:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.6 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.3.6 9.3.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.2 3.5-6.2 3.5z"/></svg>`,
  spotify:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.28c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.54.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.66 1.02.36 1.56-.3.42-1.02.54-1.5.24z"/></svg>`,
  capcut:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>`,
  kling:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 8 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2"/><path d="M20 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z"/><path d="m10 14 3-2-3-2v4z" fill="currentColor" stroke="none"/></svg>`,
  claude:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.3041 3.5415 12.001 17.5105 6.6979 3.5415H1.0054L9.4558 24h5.0895L23 3.5415Z"/></svg>`,
  grok:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  chatgpt:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`,
  gemini:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 5.52-4.48 10-10 10 5.52 0 10 4.48 10 10 0-5.52 4.48-10 10-10-5.52 0-10-4.48-10-10z"/></svg>`,
  hmavpn:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
}

// ── Catalog data ──────────────────────────────────────────────────────────────
const CATALOG = [
  {
    slug: 'youtube-premium',
    name: 'YouTube Premium',
    description: 'Xem YouTube không quảng cáo, tải video offline, kèm YouTube Music Premium trên mọi thiết bị.',
    color: '#FF0000',
    icon: ICONS.youtube,
    sortOrder: 10,
    products: [
      {
        slug: 'youtube-premium-share',
        name: 'YouTube Premium',
        sku: 'YT-PREM',
        price: 25000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản chia sẻ — sau mua admin gửi thông tin đăng nhập qua Zalo/Telegram.',
        longDescription: 'YouTube Premium chia sẻ: 1 slot riêng trong gia đình YouTube. Xem không quảng cáo, tải video offline, YouTube Music Premium và phát nền khi tắt màn hình.',
        variants: [
          { name: '1 Tháng',  sku: 'YT-1M',  price: 25000,  duration_days: 30 },
          { name: '3 Tháng',  sku: 'YT-3M',  price: 65000,  duration_days: 90 },
          { name: '6 Tháng',  sku: 'YT-6M',  price: 110000, duration_days: 180 },
          { name: '1 Năm',    sku: 'YT-1Y',  price: 200000, duration_days: 365 },
        ],
      },
    ],
  },
  {
    slug: 'spotify-premium',
    name: 'Spotify Premium',
    description: 'Nghe nhạc không giới hạn, không quảng cáo, tải nhạc offline với chất lượng cao nhất.',
    color: '#1DB954',
    icon: ICONS.spotify,
    sortOrder: 20,
    products: [
      {
        slug: 'spotify-premium-share',
        name: 'Spotify Premium',
        sku: 'SP-PREM',
        price: 25000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản chia sẻ — admin gửi thông tin sau khi thanh toán.',
        longDescription: 'Spotify Premium chia sẻ: nghe không quảng cáo, tải nhạc offline, chất lượng âm thanh 320kbps, shuffle/repeat tự do trên mọi thiết bị.',
        variants: [
          { name: '1 Tháng', sku: 'SP-1M', price: 25000,  duration_days: 30 },
          { name: '3 Tháng', sku: 'SP-3M', price: 65000,  duration_days: 90 },
          { name: '6 Tháng', sku: 'SP-6M', price: 110000, duration_days: 180 },
          { name: '1 Năm',   sku: 'SP-1Y', price: 200000, duration_days: 365 },
        ],
      },
    ],
  },
  {
    slug: 'capcut-pro',
    name: 'CapCut Pro',
    description: 'Phần mềm chỉnh sửa video chuyên nghiệp với đầy đủ tính năng Pro: hiệu ứng, template, xuất 4K, không watermark.',
    color: '#FFFFFF',
    icon: ICONS.capcut,
    sortOrder: 30,
    products: [
      {
        slug: 'capcut-pro-share',
        name: 'CapCut Pro',
        sku: 'CC-PRO',
        price: 30000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản chia sẻ — truy cập toàn bộ tính năng Pro, không watermark, xuất 4K.',
        longDescription: 'CapCut Pro chia sẻ: mở khóa tất cả hiệu ứng, filter, template premium. Xuất video 4K không watermark. Tương thích iOS, Android và Desktop.',
        variants: [
          { name: '1 Tháng', sku: 'CC-1M', price: 30000,  duration_days: 30 },
          { name: '3 Tháng', sku: 'CC-3M', price: 80000,  duration_days: 90 },
          { name: '6 Tháng', sku: 'CC-6M', price: 150000, duration_days: 180 },
          { name: '1 Năm',   sku: 'CC-1Y', price: 280000, duration_days: 365 },
        ],
      },
    ],
  },
  {
    slug: 'kling-ai',
    name: 'KLING AI',
    description: 'Tạo video AI chất lượng cao từ văn bản & hình ảnh. Hỗ trợ AI Lipsync, Motion Brush, Camera Control.',
    color: '#FF6B35',
    icon: ICONS.kling,
    sortOrder: 40,
    products: [
      {
        slug: 'kling-standard',
        name: 'KLING Standard',
        sku: 'KL-STD',
        price: 149000,
        fulfillment_type: 'service',
        shortDescription: '660 credits/tháng — tạo video AI cơ bản, xuất 720p.',
        longDescription: 'KLING AI Standard: 660 credits mỗi tháng, text-to-video & image-to-video, xuất 720p, hiệu ứng AI cơ bản. Phù hợp dùng thử và tạo nội dung thường xuyên.',
        variants: [
          { name: '1 Tháng', sku: 'KL-STD-1M', price: 149000, duration_days: 30 },
          { name: '3 Tháng', sku: 'KL-STD-3M', price: 397000, duration_days: 90 },
        ],
      },
      {
        slug: 'kling-pro',
        name: 'KLING Pro',
        sku: 'KL-PRO',
        price: 249000,
        fulfillment_type: 'service',
        shortDescription: '3000 credits/tháng — xuất 1080p, AI Lipsync, Motion Brush, Camera Control.',
        longDescription: 'KLING AI Pro: 3000 credits mỗi tháng, xuất Full HD 1080p, AI Lipsync & Motion Brush, Camera Control nâng cao, AI Effects không giới hạn. Dành cho content creator chuyên nghiệp.',
        variants: [
          { name: '1 Tháng', sku: 'KL-PRO-1M', price: 249000,  duration_days: 30 },
          { name: '3 Tháng', sku: 'KL-PRO-3M', price: 697000,  duration_days: 90 },
          { name: '1 Năm',   sku: 'KL-PRO-1Y', price: 1990000, duration_days: 365 },
        ],
      },
    ],
  },
  {
    slug: 'claude-pro',
    name: 'Claude Pro',
    description: 'Trợ lý AI thông minh từ Anthropic — Claude 3.5 Sonnet & Opus, dùng nhiều hơn 5x, upload file & ảnh, Projects.',
    color: '#CC785C',
    icon: ICONS.claude,
    sortOrder: 50,
    products: [
      {
        slug: 'claude-pro-share',
        name: 'Claude Pro',
        sku: 'CL-PRO',
        price: 499000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản chia sẻ — dùng Claude 3.5 Sonnet & Opus không giới hạn, upload file/ảnh.',
        longDescription: 'Claude Pro chia sẻ: truy cập Claude 3.5 Sonnet & Opus với giới hạn cao hơn 5x so với bản miễn phí. Upload file, ảnh, tạo Projects, sử dụng Memory. Hỗ trợ coding, phân tích, viết lách chuyên sâu.',
        variants: [
          { name: '1 Tháng', sku: 'CL-PRO-1M', price: 499000,  duration_days: 30 },
          { name: '3 Tháng', sku: 'CL-PRO-3M', price: 1397000, duration_days: 90 },
          { name: '1 Năm',   sku: 'CL-PRO-1Y', price: 4990000, duration_days: 365 },
        ],
      },
      {
        slug: 'claude-team',
        name: 'Claude Pro + Team',
        sku: 'CL-TEAM',
        price: 649000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản Team — không giới hạn context, Advanced Voice, Sora video, tính năng AI tốt nhất.',
        longDescription: 'Claude Team: context window không giới hạn, quản lý nhóm, Advanced Voice Mode, tích hợp với workspace riêng. Phiên bản dành cho doanh nghiệp và team.',
        variants: [
          { name: '1 Tháng', sku: 'CL-TEAM-1M', price: 649000, duration_days: 30 },
        ],
      },
    ],
  },
  {
    slug: 'supergrok',
    name: 'SuperGrok',
    description: 'Grok-3 Think mode từ xAI — Big Brain mode, tạo ảnh Aurora không giới hạn, tìm kiếm web real-time.',
    color: '#7C3AED',
    icon: ICONS.grok,
    sortOrder: 60,
    products: [
      {
        slug: 'supergrok-share',
        name: 'SuperGrok',
        sku: 'GK-SUPER',
        price: 499000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản chia sẻ — Grok-3 Think mode, Aurora 10 ảnh/ngày, Big Brain mode, web real-time.',
        longDescription: 'SuperGrok: truy cập Grok-3 với Think mode và Big Brain mode cho bài toán phức tạp. Tạo ảnh Aurora AI không giới hạn (10 ảnh/ngày). Tìm kiếm web thời gian thực. Phân tích dữ liệu nâng cao.',
        variants: [
          { name: '1 Tháng', sku: 'GK-1M', price: 499000,  duration_days: 30 },
          { name: '3 Tháng', sku: 'GK-3M', price: 1397000, duration_days: 90 },
          { name: '1 Năm',   sku: 'GK-1Y', price: 4990000, duration_days: 365 },
        ],
      },
    ],
  },
  {
    slug: 'chatgpt',
    name: 'ChatGPT',
    description: 'GPT-4o, DALL·E 3, duyệt web & Plugins — trợ lý AI số 1 từ OpenAI với đầy đủ tính năng.',
    color: '#10A37F',
    icon: ICONS.chatgpt,
    sortOrder: 70,
    products: [
      {
        slug: 'chatgpt-plus',
        name: 'ChatGPT Plus',
        sku: 'CGP-PLUS',
        price: 499000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản chia sẻ — GPT-4o, DALL·E 3 tạo ảnh, duyệt web, phân tích file & dữ liệu.',
        longDescription: 'ChatGPT Plus chia sẻ: truy cập GPT-4o và GPT-4 không giới hạn, tạo ảnh DALL·E 3, duyệt web real-time, phân tích dữ liệu và code interpreter. Hỗ trợ voice mode và custom GPTs.',
        variants: [
          { name: '1 Tháng', sku: 'CGP-PLUS-1M', price: 499000,  duration_days: 30 },
          { name: '3 Tháng', sku: 'CGP-PLUS-3M', price: 1397000, duration_days: 90 },
          { name: '1 Năm',   sku: 'CGP-PLUS-1Y', price: 4990000, duration_days: 365 },
        ],
      },
      {
        slug: 'chatgpt-pro',
        name: 'ChatGPT Pro',
        sku: 'CGP-PRO',
        price: 1999000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản Pro — o1 Pro mode không giới hạn, Advanced Voice, Sora video, tính năng AI tốt nhất.',
        longDescription: 'ChatGPT Pro: o1 Pro mode không giới hạn cho reasoning phức tạp. Advanced Voice Mode, tạo video với Sora, ưu tiên truy cập tính năng mới nhất. Dành cho người dùng chuyên nghiệp.',
        variants: [
          { name: '1 Tháng', sku: 'CGP-PRO-1M', price: 1999000, duration_days: 30 },
        ],
      },
    ],
  },
  {
    slug: 'gemini-advanced',
    name: 'Gemini Advanced',
    description: 'Gemini 1.5 Pro từ Google kèm Google One 2TB storage, tích hợp AI trong toàn bộ Google Workspace.',
    color: '#4285F4',
    icon: ICONS.gemini,
    sortOrder: 80,
    products: [
      {
        slug: 'gemini-advanced-share',
        name: 'Gemini Advanced',
        sku: 'GM-ADV',
        price: 499000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản chia sẻ — Gemini 1.5 Pro, Google One 2TB, AI trong Docs/Sheets/Gmail.',
        longDescription: 'Gemini Advanced chia sẻ: Gemini 1.5 Pro với context window 1 triệu token. Kèm Google One 2TB cho Drive, Photos, Gmail. AI trong Google Docs, Sheets, Slides, Gmail. Deep Research và phân tích tài liệu dài.',
        variants: [
          { name: '1 Tháng', sku: 'GM-1M', price: 499000,  duration_days: 30 },
          { name: '3 Tháng', sku: 'GM-3M', price: 1397000, duration_days: 90 },
          { name: '1 Năm',   sku: 'GM-1Y', price: 4990000, duration_days: 365 },
        ],
      },
    ],
  },
  {
    slug: 'hma-vpn',
    name: 'HMA VPN',
    description: 'VPN tốc độ cao 290+ quốc gia, bảo mật tuyệt đối, Kill Switch, No-log policy — 5 thiết bị cùng lúc.',
    color: '#F59E0B',
    icon: ICONS.hmavpn,
    sortOrder: 90,
    products: [
      {
        slug: 'hma-vpn-share',
        name: 'HMA VPN',
        sku: 'HMA-VPN',
        price: 89000,
        fulfillment_type: 'service',
        shortDescription: 'Tài khoản chia sẻ — 5 thiết bị đồng thời, 290+ quốc gia, Kill Switch, No-log.',
        longDescription: 'HMA VPN chia sẻ: kết nối đến 290+ quốc gia & vị trí, tốc độ không giới hạn, Kill Switch tự động ngắt khi mất VPN, chính sách No-log tuyệt đối. Hỗ trợ tối đa 5 thiết bị cùng lúc trên mọi nền tảng.',
        variants: [
          { name: '1 Tháng', sku: 'HMA-1M', price: 89000,  duration_days: 30 },
          { name: '3 Tháng', sku: 'HMA-3M', price: 237000, duration_days: 90 },
          { name: '6 Tháng', sku: 'HMA-6M', price: 447000, duration_days: 180 },
          { name: '1 Năm',   sku: 'HMA-1Y', price: 799000, duration_days: 365 },
        ],
      },
    ],
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = new MongoClient(MONGODB_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)

    let catInserted = 0, catUpdated = 0
    let prdInserted = 0, prdUpdated = 0
    let varInserted = 0, varUpdated = 0
    let detInserted = 0, detUpdated = 0

    for (const cat of CATALOG) {
      const now = new Date()

      // ── Category upsert ──────────────────────────────────────────────────
      const existingCat = await db.collection('product_categories').findOne({ slug: cat.slug })
      const catId = existingCat?.id || randomUUID()
      const catDoc = {
        id:          catId,
        name:        cat.name,
        slug:        cat.slug,
        description: cat.description,
        icon:        cat.icon,
        color:       cat.color,
        status:      'active',
        sortOrder:   cat.sortOrder,
        updatedAt:   now,
      }
      if (existingCat) {
        await db.collection('product_categories').updateOne({ slug: cat.slug }, { $set: catDoc })
        catUpdated++
      } else {
        await db.collection('product_categories').insertOne({ _id: catId, ...catDoc, createdAt: now })
        catInserted++
      }

      for (const prd of cat.products) {
        // ── Product upsert ─────────────────────────────────────────────────
        const existingPrd = await db.collection('products').findOne({ sku: prd.sku })
        const prdId = existingPrd?.id || randomUUID()
        const prdDoc = {
          id:               prdId,
          categoryId:       catId,
          name:             prd.name,
          slug:             prd.slug,
          sku:              prd.sku,
          price:            prd.price,
          status:           'active',
          fulfillment_type: prd.fulfillment_type,
          updatedAt:        now,
        }
        if (existingPrd) {
          await db.collection('products').updateOne({ sku: prd.sku }, { $set: prdDoc })
          prdUpdated++
        } else {
          await db.collection('products').insertOne({ _id: prdId, ...prdDoc, createdAt: now })
          prdInserted++
        }

        // ── Product detail upsert ──────────────────────────────────────────
        const existingDet = await db.collection('product_details').findOne({ productId: prdId })
        const detDoc = {
          productId:        prdId,
          shortDescription: prd.shortDescription,
          longDescription:  prd.longDescription,
          specifications:   { 'Loại giao hàng': prd.fulfillment_type === 'stock' ? 'Tự động' : 'Thủ công' },
          extraInfo:        {},
          updatedAt:        now,
        }
        if (existingDet) {
          await db.collection('product_details').updateOne({ productId: prdId }, { $set: detDoc })
          detUpdated++
        } else {
          await db.collection('product_details').insertOne({
            _id: randomUUID(), id: randomUUID(), ...detDoc, createdAt: now
          })
          detInserted++
        }

        // ── Variants upsert ────────────────────────────────────────────────
        for (const v of prd.variants) {
          const existingVar = await db.collection('product_variants').findOne({ sku: v.sku })
          const varDoc = {
            productId:     prdId,
            name:          v.name,
            sku:           v.sku,
            price:         v.price,
            stock:         0,
            duration_days: v.duration_days,
            status:        'active',
            updatedAt:     now,
          }
          if (existingVar) {
            await db.collection('product_variants').updateOne({ sku: v.sku }, { $set: varDoc })
            varUpdated++
          } else {
            const varId = randomUUID()
            await db.collection('product_variants').insertOne({
              _id: varId, id: varId, ...varDoc, createdAt: now
            })
            varInserted++
          }
        }
      }
    }

    console.log('✅ Seed catalog xong!')
    console.log(`   Danh mục:   ${catInserted} tạo mới, ${catUpdated} cập nhật`)
    console.log(`   Sản phẩm:   ${prdInserted} tạo mới, ${prdUpdated} cập nhật`)
    console.log(`   Mô tả:      ${detInserted} tạo mới, ${detUpdated} cập nhật`)
    console.log(`   Biến thể:   ${varInserted} tạo mới, ${varUpdated} cập nhật`)
    console.log(`   Tổng biến thể: ${varInserted + varUpdated}`)
  } finally {
    await client.close()
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
