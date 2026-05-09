/**
 * scripts/seed-plans.cjs
 * Chèn dữ liệu bảng giá Netflix vào MongoDB collection 'plans'.
 * Chạy: node scripts/seed-plans.cjs
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// DNS + TLS fix cho Node.js 22+/24 + Atlas
const dns = require('dns')
try { dns.setDefaultResultOrder('ipv4first'); dns.setServers(['8.8.8.8', '8.8.4.4']) } catch {}
const tls = require('tls')
try {
  tls.DEFAULT_MAX_VERSION = 'TLSv1.2'
  const _csc = tls.createSecureContext
  tls.createSecureContext = (opts) => _csc.call(tls, Object.assign({}, opts, { maxVersion: 'TLSv1.2' }))
} catch {}

const { MongoClient, ServerApiVersion } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.MONGODB_DB || 'netcredit'

const PLANS = [
  // ── Netflix dùng chung (shared) ────────────────────────────────────────────
  {
    id: 'day',
    name: 'Netflix 1 Ngày',
    description: 'Trải nghiệm Netflix Premium 1 ngày. Xem thử, không cam kết.',
    price: 5000,
    duration_days: 1,
    service: 'netflix',
    account_type: 'shared',
    fulfillment_type: 'netflix',
    features: ['Netflix Premium', 'Full HD / 4K', 'Dùng chung slot', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 1
  },
  {
    id: 'month',
    name: 'Netflix 1 Tháng',
    description: 'Gói phổ biến nhất — Netflix Premium dùng chung 30 ngày.',
    price: 35000,
    duration_days: 30,
    service: 'netflix',
    account_type: 'shared',
    fulfillment_type: 'netflix',
    features: ['Netflix Premium', 'Full HD / 4K', 'Dùng chung slot', 'Bảo hành tự động', 'Get Link đăng nhập'],
    is_featured: true,
    is_active: true,
    sort_order: 2
  },
  {
    id: 'half_year',
    name: 'Netflix 6 Tháng',
    description: 'Tiết kiệm hơn — Netflix Premium dùng chung 180 ngày.',
    price: 180000,
    duration_days: 180,
    service: 'netflix',
    account_type: 'shared',
    fulfillment_type: 'netflix',
    features: ['Netflix Premium', 'Full HD / 4K', 'Dùng chung slot', 'Bảo hành tự động', 'Get Link đăng nhập'],
    is_featured: false,
    is_active: true,
    sort_order: 3
  },
  {
    id: 'year',
    name: 'Netflix 1 Năm',
    description: 'Tiết kiệm nhất — Netflix Premium dùng chung 365 ngày.',
    price: 320000,
    duration_days: 365,
    service: 'netflix',
    account_type: 'shared',
    fulfillment_type: 'netflix',
    features: ['Netflix Premium', 'Full HD / 4K', 'Dùng chung slot', 'Bảo hành tự động', 'Get Link đăng nhập', 'Ưu tiên hỗ trợ'],
    is_featured: false,
    is_active: true,
    sort_order: 4
  },
  // ── Netflix dùng riêng (private) ───────────────────────────────────────────
  {
    id: 'private_month',
    name: 'Netflix Riêng 1 Tháng',
    description: 'Profile riêng + mã PIN riêng — chỉ bạn sử dụng. Thêm thành viên phụ.',
    price: 70000,
    duration_days: 30,
    service: 'netflix',
    account_type: 'private',
    fulfillment_type: 'netflix',
    features: ['Netflix Premium', 'Full HD / 4K', 'Profile + PIN riêng', '1 màn hình', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 10
  },
  {
    id: 'private_year',
    name: 'Netflix Riêng 1 Năm',
    description: 'Profile riêng + mã PIN riêng 365 ngày — trải nghiệm tối ưu.',
    price: 700000,
    duration_days: 365,
    service: 'netflix',
    account_type: 'private',
    fulfillment_type: 'netflix',
    features: ['Netflix Premium', 'Full HD / 4K', 'Profile + PIN riêng', '1 màn hình', 'Bảo hành tự động', 'Ưu tiên hỗ trợ'],
    is_featured: false,
    is_active: true,
    sort_order: 11
  },
  // ── YouTube Premium ────────────────────────────────────────────────────────
  {
    id: 'yt_month',
    name: 'YouTube Premium 1 Tháng',
    description: 'Xem YouTube không quảng cáo, tải video offline, kèm YouTube Music.',
    price: 25000,
    duration_days: 30,
    service: 'youtube',
    account_type: 'shared',
    fulfillment_type: 'youtube',
    features: ['Không quảng cáo', 'Tải video offline', 'YouTube Music kèm theo', 'Phát nền khi tắt màn hình', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 20
  },
  {
    id: 'yt_3month',
    name: 'YouTube Premium 3 Tháng',
    description: 'YouTube Premium 3 tháng — tiết kiệm hơn gói tháng lẻ.',
    price: 65000,
    duration_days: 90,
    service: 'youtube',
    account_type: 'shared',
    fulfillment_type: 'youtube',
    features: ['Không quảng cáo', 'Tải video offline', 'YouTube Music kèm theo', 'Phát nền khi tắt màn hình', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 21
  },
  {
    id: 'yt_half_year',
    name: 'YouTube Premium 6 Tháng',
    description: 'YouTube Premium 6 tháng — giá tốt, không lo gia hạn.',
    price: 120000,
    duration_days: 180,
    service: 'youtube',
    account_type: 'shared',
    fulfillment_type: 'youtube',
    features: ['Không quảng cáo', 'Tải video offline', 'YouTube Music kèm theo', 'Phát nền khi tắt màn hình', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 22
  },
  {
    id: 'yt_year',
    name: 'YouTube Premium 1 Năm',
    description: 'YouTube Premium cả năm — tiết kiệm nhất, trải nghiệm không quảng cáo trọn vẹn.',
    price: 220000,
    duration_days: 365,
    service: 'youtube',
    account_type: 'shared',
    fulfillment_type: 'youtube',
    features: ['Không quảng cáo', 'Tải video offline', 'YouTube Music kèm theo', 'Phát nền khi tắt màn hình', 'Bảo hành tự động', 'Ưu tiên hỗ trợ'],
    is_featured: false,
    is_active: true,
    sort_order: 23
  },
  // ── Spotify Premium ────────────────────────────────────────────────────────
  {
    id: 'sp_month',
    name: 'Spotify Premium 1 Tháng',
    description: 'Nghe nhạc không quảng cáo, tải nhạc offline, chất lượng cao.',
    price: 25000,
    duration_days: 30,
    service: 'spotify',
    account_type: 'shared',
    fulfillment_type: 'spotify',
    features: ['Không quảng cáo', 'Tải nhạc offline', 'Chất lượng âm thanh cao', 'Nghe trên mọi thiết bị', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 30
  },
  {
    id: 'sp_3month',
    name: 'Spotify Premium 3 Tháng',
    description: 'Spotify Premium 3 tháng — nghe nhạc thả ga, tiết kiệm hơn tháng lẻ.',
    price: 65000,
    duration_days: 90,
    service: 'spotify',
    account_type: 'shared',
    fulfillment_type: 'spotify',
    features: ['Không quảng cáo', 'Tải nhạc offline', 'Chất lượng âm thanh cao', 'Nghe trên mọi thiết bị', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 31
  },
  {
    id: 'sp_half_year',
    name: 'Spotify Premium 6 Tháng',
    description: 'Spotify Premium 6 tháng — giải pháp tối ưu cho người yêu nhạc.',
    price: 120000,
    duration_days: 180,
    service: 'spotify',
    account_type: 'shared',
    fulfillment_type: 'spotify',
    features: ['Không quảng cáo', 'Tải nhạc offline', 'Chất lượng âm thanh cao', 'Nghe trên mọi thiết bị', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 32
  },
  {
    id: 'sp_year',
    name: 'Spotify Premium 1 Năm',
    description: 'Spotify Premium cả năm — trải nghiệm âm nhạc không giới hạn, tiết kiệm nhất.',
    price: 220000,
    duration_days: 365,
    service: 'spotify',
    account_type: 'shared',
    fulfillment_type: 'spotify',
    features: ['Không quảng cáo', 'Tải nhạc offline', 'Chất lượng âm thanh cao', 'Nghe trên mọi thiết bị', 'Bảo hành tự động', 'Ưu tiên hỗ trợ'],
    is_featured: false,
    is_active: true,
    sort_order: 33
  },
  // ── CapCut Pro ─────────────────────────────────────────────────────────────
  {
    id: 'cc_month',
    name: 'CapCut Pro 1 Tháng',
    description: 'Chỉnh sửa video chuyên nghiệp với CapCut Pro — mọi hiệu ứng, không watermark.',
    price: 30000,
    duration_days: 30,
    service: 'capcut',
    account_type: 'shared',
    fulfillment_type: 'capcut',
    features: ['Mọi hiệu ứng Pro', 'Không watermark', 'Xuất video 4K', 'Template premium không giới hạn', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 40
  },
  {
    id: 'cc_3month',
    name: 'CapCut Pro 3 Tháng',
    description: 'CapCut Pro 3 tháng — sáng tạo nội dung không giới hạn, tiết kiệm hơn.',
    price: 80000,
    duration_days: 90,
    service: 'capcut',
    account_type: 'shared',
    fulfillment_type: 'capcut',
    features: ['Mọi hiệu ứng Pro', 'Không watermark', 'Xuất video 4K', 'Template premium không giới hạn', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 41
  },
  {
    id: 'cc_half_year',
    name: 'CapCut Pro 6 Tháng',
    description: 'CapCut Pro 6 tháng — đầu tư thông minh cho creator chuyên nghiệp.',
    price: 150000,
    duration_days: 180,
    service: 'capcut',
    account_type: 'shared',
    fulfillment_type: 'capcut',
    features: ['Mọi hiệu ứng Pro', 'Không watermark', 'Xuất video 4K', 'Template premium không giới hạn', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 42
  },
  {
    id: 'cc_year',
    name: 'CapCut Pro 1 Năm',
    description: 'CapCut Pro cả năm — tiết kiệm nhất, xứng đáng cho creator nghiêm túc.',
    price: 280000,
    duration_days: 365,
    service: 'capcut',
    account_type: 'shared',
    fulfillment_type: 'capcut',
    features: ['Mọi hiệu ứng Pro', 'Không watermark', 'Xuất video 4K', 'Template premium không giới hạn', 'Bảo hành tự động', 'Ưu tiên hỗ trợ'],
    is_featured: false,
    is_active: true,
    sort_order: 43
  },

  // ── KLING AI ────────────────────────────────────────────────────────────────
  {
    id: 'kling_std_month',
    name: 'KLING Standard 1 Tháng',
    description: 'Tạo video AI từ văn bản & ảnh với KLING Standard — 660 credits/tháng, xuất 720p.',
    price: 149000,
    duration_days: 30,
    service: 'kling',
    account_type: 'shared',
    fulfillment_type: 'kling',
    features: ['660 credits/tháng', 'Text-to-video & Image-to-video', 'Xuất video 720p', 'Hiệu ứng AI cơ bản', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 50
  },
  {
    id: 'kling_std_3month',
    name: 'KLING Standard 3 Tháng',
    description: 'KLING Standard 3 tháng — tiết kiệm hơn, đủ dùng cho content creator hàng ngày.',
    price: 399000,
    duration_days: 90,
    service: 'kling',
    account_type: 'shared',
    fulfillment_type: 'kling',
    features: ['660 credits/tháng', 'Text-to-video & Image-to-video', 'Xuất video 720p', 'Hiệu ứng AI cơ bản', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 51
  },
  {
    id: 'kling_pro_month',
    name: 'KLING Pro 1 Tháng',
    description: 'KLING Pro — 3000 credits/tháng, xuất 1080p, AI Lipsync, Motion Brush, camera control.',
    price: 249000,
    duration_days: 30,
    service: 'kling',
    account_type: 'shared',
    fulfillment_type: 'kling',
    features: ['3000 credits/tháng', 'Xuất video 1080p Full HD', 'AI Lipsync & Motion Brush', 'Camera Control nâng cao', 'AI Effects không giới hạn', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 52
  },
  {
    id: 'kling_pro_3month',
    name: 'KLING Pro 3 Tháng',
    description: 'KLING Pro 3 tháng — giải pháp tốt nhất cho video creator chuyên nghiệp.',
    price: 669000,
    duration_days: 90,
    service: 'kling',
    account_type: 'shared',
    fulfillment_type: 'kling',
    features: ['3000 credits/tháng', 'Xuất video 1080p Full HD', 'AI Lipsync & Motion Brush', 'Camera Control nâng cao', 'AI Effects không giới hạn', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 53
  },
  {
    id: 'kling_pro_year',
    name: 'KLING Pro 1 Năm',
    description: 'KLING Pro cả năm — tiết kiệm tối đa, phù hợp agency và studio sản xuất nội dung.',
    price: 2388000,
    duration_days: 365,
    service: 'kling',
    account_type: 'shared',
    fulfillment_type: 'kling',
    features: ['3000 credits/tháng', 'Xuất video 1080p Full HD', 'AI Lipsync & Motion Brush', 'Camera Control nâng cao', 'Ưu tiên hỗ trợ', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 54
  },

  // ── Claude Pro (Anthropic) ──────────────────────────────────────────────────
  {
    id: 'claude_pro_month',
    name: 'Claude Pro 1 Tháng',
    description: 'Claude Pro — truy cập Claude 3.5 Sonnet & Opus, dùng nhiều gấp 5 lần, upload file & ảnh.',
    price: 499000,
    duration_days: 30,
    service: 'claude',
    account_type: 'shared',
    fulfillment_type: 'claude',
    features: ['Claude 3.5 Sonnet & Opus', 'Dùng nhiều gấp 5x free', 'Upload file, ảnh, PDF', 'Projects & Memory', 'Priority access lúc cao điểm', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 60
  },
  {
    id: 'claude_pro_3month',
    name: 'Claude Pro 3 Tháng',
    description: 'Claude Pro 3 tháng — tiết kiệm hơn, AI viết lách & phân tích tốt nhất.',
    price: 1349000,
    duration_days: 90,
    service: 'claude',
    account_type: 'shared',
    fulfillment_type: 'claude',
    features: ['Claude 3.5 Sonnet & Opus', 'Dùng nhiều gấp 5x free', 'Upload file, ảnh, PDF', 'Projects & Memory', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 61
  },
  {
    id: 'claude_pro_year',
    name: 'Claude Pro 1 Năm',
    description: 'Claude Pro cả năm — đầu tư tốt nhất cho công việc viết lách, lập trình và phân tích.',
    price: 4990000,
    duration_days: 365,
    service: 'claude',
    account_type: 'shared',
    fulfillment_type: 'claude',
    features: ['Claude 3.5 Sonnet & Opus', 'Dùng nhiều gấp 5x free', 'Upload file, ảnh, PDF', 'Projects & Memory', 'Ưu tiên hỗ trợ', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 62
  },
  {
    id: 'claude_team_month',
    name: 'Claude Pro + Team 1 Tháng',
    description: 'Claude Pro kèm tính năng Team — workspace riêng, quản lý nhóm, không giới hạn context.',
    price: 649000,
    duration_days: 30,
    service: 'claude',
    account_type: 'shared',
    fulfillment_type: 'claude',
    features: ['Toàn bộ Claude Pro', 'Team workspace riêng', 'Admin quản lý thành viên', 'Context window 200K token', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 63
  },

  // ── SuperGrok (xAI) ─────────────────────────────────────────────────────────
  {
    id: 'grok_month',
    name: 'SuperGrok 1 Tháng',
    description: 'SuperGrok — Grok-3 Think mode, tạo ảnh Aurora 10 ảnh/ngày, Big Brain mode, web real-time.',
    price: 499000,
    duration_days: 30,
    service: 'grok',
    account_type: 'shared',
    fulfillment_type: 'grok',
    features: ['Grok-3 + Think Mode suy luận sâu', 'Aurora: 10 ảnh AI/ngày', 'Big Brain mode không giới hạn', 'Real-time web search', 'DeepSearch nâng cao', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 70
  },
  {
    id: 'grok_3month',
    name: 'SuperGrok 3 Tháng',
    description: 'SuperGrok 3 tháng — AI suy luận mạnh nhất, tạo ảnh Aurora, tiết kiệm hơn tháng lẻ.',
    price: 1349000,
    duration_days: 90,
    service: 'grok',
    account_type: 'shared',
    fulfillment_type: 'grok',
    features: ['Grok-3 + Think Mode suy luận sâu', 'Aurora: 10 ảnh AI/ngày', 'Big Brain mode không giới hạn', 'Real-time web search', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 71
  },
  {
    id: 'grok_year',
    name: 'SuperGrok 1 Năm',
    description: 'SuperGrok cả năm — tiết kiệm nhất, luôn cập nhật model Grok mới nhất từ xAI.',
    price: 4990000,
    duration_days: 365,
    service: 'grok',
    account_type: 'shared',
    fulfillment_type: 'grok',
    features: ['Grok-3 + Think Mode suy luận sâu', 'Aurora: 10 ảnh AI/ngày', 'Big Brain mode không giới hạn', 'Real-time web search', 'Ưu tiên hỗ trợ', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 72
  },

  // ── ChatGPT (OpenAI) ────────────────────────────────────────────────────────
  {
    id: 'chatgpt_plus_month',
    name: 'ChatGPT Plus 1 Tháng',
    description: 'ChatGPT Plus — GPT-4o, DALL·E 3 tạo ảnh, duyệt web, phân tích file và dữ liệu.',
    price: 499000,
    duration_days: 30,
    service: 'chatgpt',
    account_type: 'shared',
    fulfillment_type: 'chatgpt',
    features: ['GPT-4o & GPT-4', 'DALL·E 3 tạo ảnh AI', 'Duyệt web real-time', 'Phân tích file & dữ liệu', 'Tạo & chạy code Python', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 80
  },
  {
    id: 'chatgpt_plus_3month',
    name: 'ChatGPT Plus 3 Tháng',
    description: 'ChatGPT Plus 3 tháng — trợ lý AI toàn năng, tiết kiệm hơn mua tháng lẻ.',
    price: 1349000,
    duration_days: 90,
    service: 'chatgpt',
    account_type: 'shared',
    fulfillment_type: 'chatgpt',
    features: ['GPT-4o & GPT-4', 'DALL·E 3 tạo ảnh AI', 'Duyệt web real-time', 'Phân tích file & dữ liệu', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 81
  },
  {
    id: 'chatgpt_plus_year',
    name: 'ChatGPT Plus 1 Năm',
    description: 'ChatGPT Plus cả năm — đầu tư thông minh nhất cho năng suất công việc.',
    price: 4990000,
    duration_days: 365,
    service: 'chatgpt',
    account_type: 'shared',
    fulfillment_type: 'chatgpt',
    features: ['GPT-4o & GPT-4', 'DALL·E 3 tạo ảnh AI', 'Duyệt web real-time', 'Phân tích file & dữ liệu', 'Ưu tiên hỗ trợ', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 82
  },
  {
    id: 'chatgpt_pro_month',
    name: 'ChatGPT Pro 1 Tháng',
    description: 'ChatGPT Pro — o1 Pro mode không giới hạn, Advanced Voice, Sora video, tối thượng của AI.',
    price: 1999000,
    duration_days: 30,
    service: 'chatgpt',
    account_type: 'shared',
    fulfillment_type: 'chatgpt',
    features: ['o1 Pro mode không giới hạn', 'Advanced Voice Mode', 'Sora AI video generation', 'Toàn bộ tính năng Plus', 'Ưu tiên hỗ trợ', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 83
  },

  // ── Gemini Advanced (Google) ────────────────────────────────────────────────
  {
    id: 'gemini_month',
    name: 'Gemini Advanced 1 Tháng',
    description: 'Gemini Advanced — Gemini 1.5 Pro, Google One 2TB, AI trong Google Docs/Sheets/Gmail.',
    price: 499000,
    duration_days: 30,
    service: 'gemini',
    account_type: 'shared',
    fulfillment_type: 'gemini',
    features: ['Gemini 1.5 Pro (model mạnh nhất)', 'Google One 2TB storage', 'AI trong Docs, Sheets, Gmail', 'Deep Research tự động', 'Gemini trong Google Meet', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 90
  },
  {
    id: 'gemini_3month',
    name: 'Gemini Advanced 3 Tháng',
    description: 'Gemini Advanced 3 tháng — Google AI mạnh nhất, kèm 2TB Google One, tiết kiệm hơn.',
    price: 1349000,
    duration_days: 90,
    service: 'gemini',
    account_type: 'shared',
    fulfillment_type: 'gemini',
    features: ['Gemini 1.5 Pro (model mạnh nhất)', 'Google One 2TB storage', 'AI trong Docs, Sheets, Gmail', 'Deep Research tự động', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 91
  },
  {
    id: 'gemini_year',
    name: 'Gemini Advanced 1 Năm',
    description: 'Gemini Advanced cả năm + Google One 2TB — tiết kiệm nhất, hệ sinh thái Google đầy đủ.',
    price: 4990000,
    duration_days: 365,
    service: 'gemini',
    account_type: 'shared',
    fulfillment_type: 'gemini',
    features: ['Gemini 1.5 Pro (model mạnh nhất)', 'Google One 2TB storage', 'AI trong Docs, Sheets, Gmail', 'Deep Research tự động', 'Ưu tiên hỗ trợ', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 92
  },

  // ── HMA VPN ─────────────────────────────────────────────────────────────────
  {
    id: 'hmavpn_month',
    name: 'HMA VPN 1 Tháng',
    description: 'HMA VPN 1 tháng — kết nối 5 thiết bị, 290+ quốc gia, tốc độ không giới hạn.',
    price: 89000,
    duration_days: 30,
    service: 'hmavpn',
    account_type: 'shared',
    fulfillment_type: 'hmavpn',
    features: ['5 thiết bị cùng lúc', '290+ quốc gia & vị trí', 'Tốc độ không giới hạn', 'Kill Switch tự động', 'No-log policy', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 100
  },
  {
    id: 'hmavpn_3month',
    name: 'HMA VPN 3 Tháng',
    description: 'HMA VPN 3 tháng — bảo mật liên tục, giá hợp lý hơn tháng lẻ.',
    price: 229000,
    duration_days: 90,
    service: 'hmavpn',
    account_type: 'shared',
    fulfillment_type: 'hmavpn',
    features: ['5 thiết bị cùng lúc', '290+ quốc gia & vị trí', 'Tốc độ không giới hạn', 'Kill Switch tự động', 'No-log policy', 'Bảo hành tự động'],
    is_featured: true,
    is_active: true,
    sort_order: 101
  },
  {
    id: 'hmavpn_6month',
    name: 'HMA VPN 6 Tháng',
    description: 'HMA VPN 6 tháng — an toàn trực tuyến dài hạn, tiết kiệm đáng kể so với tháng lẻ.',
    price: 399000,
    duration_days: 180,
    service: 'hmavpn',
    account_type: 'shared',
    fulfillment_type: 'hmavpn',
    features: ['5 thiết bị cùng lúc', '290+ quốc gia & vị trí', 'Tốc độ không giới hạn', 'Kill Switch tự động', 'No-log policy', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 102
  },
  {
    id: 'hmavpn_year',
    name: 'HMA VPN 1 Năm',
    description: 'HMA VPN cả năm — tiết kiệm nhất, bảo mật toàn diện suốt 365 ngày không lo gia hạn.',
    price: 699000,
    duration_days: 365,
    service: 'hmavpn',
    account_type: 'shared',
    fulfillment_type: 'hmavpn',
    features: ['5 thiết bị cùng lúc', '290+ quốc gia & vị trí', 'Tốc độ không giới hạn', 'Kill Switch tự động', 'No-log policy', 'Ưu tiên hỗ trợ', 'Bảo hành tự động'],
    is_featured: false,
    is_active: true,
    sort_order: 103
  }
]

async function seedPlans() {
  const client = new MongoClient(MONGODB_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
  })

  try {
    await client.connect()
    const db = client.db(DB_NAME)
    const col = db.collection('plans')

    console.log(`\n📦 Seed plans → ${DB_NAME}.plans\n`)

    let inserted = 0, updated = 0, skipped = 0

    for (const plan of PLANS) {
      const existing = await col.findOne({ $or: [{ _id: plan.id }, { id: plan.id }] })

      if (existing) {
        // Cập nhật plan cũ (giữ nguyên giá nếu không muốn ghi đè)
        await col.updateOne(
          { $or: [{ _id: plan.id }, { id: plan.id }] },
          { $set: { ...plan, updated_at: new Date() } }
        )
        console.log(`  ✏️  Updated: ${plan.id} — ${plan.name}`)
        updated++
      } else {
        const now = new Date()
        await col.insertOne({ _id: plan.id, ...plan, created_at: now, updated_at: now })
        console.log(`  ✅  Inserted: ${plan.id} — ${plan.name} (${plan.price.toLocaleString('vi-VN')}₫ / ${plan.duration_days} ngày)`)
        inserted++
      }
    }

    // Tạo index
    await col.createIndex({ service: 1, account_type: 1 })
    await col.createIndex({ sort_order: 1 })
    await col.createIndex({ price: 1 })
    console.log('\n  📑 Indexes created')

    const total = await col.countDocuments()
    console.log(`\n🎉 Done! Inserted: ${inserted}, Updated: ${updated}, Total in DB: ${total}\n`)
  } catch (err) {
    console.error('❌ Seed failed:', err.message)
    process.exit(1)
  } finally {
    await client.close()
  }
}

seedPlans()
