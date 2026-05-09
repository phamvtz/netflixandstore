/**
 * Danh sách dịch vụ được hỗ trợ.
 * Thêm dịch vụ mới vào đây là tự động hiển thị khắp nơi.
 * bg phải là màu tối (rgba) để phù hợp dark theme.
 */
export const SERVICES = [
  {
    id:       'netflix',
    name:     'Netflix',
    tagline:  'Xem phim, series 4K không giới hạn',
    color:    '#E50914',
    bg:       'rgba(229,9,20,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l4.5 9L5 21h3l2.25-4.5L12 21h3l-4.5-9L15 3h-3l-2.25 4.5L7.5 3H5z"/></svg>`,
    features: ['Full HD + 4K Ultra HD', 'Không quảng cáo', 'Mọi thiết bị', 'Bảo hành tự động'],
  },
  {
    id:       'youtube',
    name:     'YouTube Premium',
    tagline:  'Xem không quảng cáo, tải offline',
    color:    '#FF0000',
    bg:       'rgba(255,0,0,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.6 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.3.6 9.3.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.2 3.5-6.2 3.5z"/></svg>`,
    features: ['Không quảng cáo', 'Tải video offline', 'YouTube Music', 'Phát nền'],
  },
  {
    id:       'spotify',
    name:     'Spotify Premium',
    tagline:  'Nghe nhạc không giới hạn, không quảng cáo',
    color:    '#1DB954',
    bg:       'rgba(29,185,84,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.28c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.54.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.66 1.02.36 1.56-.3.42-1.02.54-1.5.24z"/></svg>`,
    features: ['Không quảng cáo', 'Tải nhạc offline', 'Chất lượng cao', 'Mọi thiết bị'],
  },
  {
    id:       'capcut',
    name:     'CapCut Pro',
    tagline:  'Chỉnh sửa video chuyên nghiệp, mọi tính năng',
    color:    '#DDDDDD',
    bg:       'rgba(255,255,255,0.08)',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>`,
    features: ['Mọi hiệu ứng Pro', 'Không watermark', 'Xuất 4K', 'Template premium'],
  },
  {
    id:       'kling',
    name:     'KLING AI',
    tagline:  'Tạo video AI chuyên nghiệp bằng văn bản & ảnh',
    color:    '#FF6B35',
    bg:       'rgba(255,107,53,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 8 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2"/><path d="M20 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z"/><path d="m10 14 3-2-3-2v4z" fill="currentColor" stroke="none"/></svg>`,
    features: ['Text-to-video AI', 'Image-to-video', 'Lip sync AI', 'AI Effects & Motion'],
  },
  {
    id:       'claude',
    name:     'Claude Pro',
    tagline:  'AI trợ lý thông minh nhất từ Anthropic',
    color:    '#CC785C',
    bg:       'rgba(204,120,92,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.3041 3.5415 12.001 17.5105 6.6979 3.5415H1.0054L9.4558 24h5.0895L23 3.5415Z"/></svg>`,
    features: ['Claude 3.5 Sonnet & Opus', 'Dùng nhiều hơn 5x', 'Upload file & ảnh', 'Projects & Memory'],
  },
  {
    id:       'grok',
    name:     'SuperGrok',
    tagline:  'Grok-3 Think mode, tạo ảnh Aurora, web real-time',
    color:    '#7C3AED',
    bg:       'rgba(124,58,237,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    features: ['Grok-3 + Think Mode', 'Aurora image gen', 'Big Brain mode', 'Real-time web search'],
  },
  {
    id:       'chatgpt',
    name:     'ChatGPT',
    tagline:  'GPT-4o, DALL·E 3, tìm web — trợ lý AI số 1',
    color:    '#10A37F',
    bg:       'rgba(16,163,127,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`,
    features: ['GPT-4o & GPT-4', 'DALL·E 3 tạo ảnh', 'Duyệt web & Plugins', 'Phân tích dữ liệu'],
  },
  {
    id:       'gemini',
    name:     'Gemini Advanced',
    tagline:  'Gemini 1.5 Pro, Google One 2TB, tích hợp Workspace',
    color:    '#4285F4',
    bg:       'rgba(66,133,244,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 5.52-4.48 10-10 10 5.52 0 10 4.48 10 10 0-5.52 4.48-10 10-10-5.52 0-10-4.48-10-10z"/></svg>`,
    features: ['Gemini 1.5 Pro', 'Google One 2TB', 'AI trong Google Docs', 'Deep Research'],
  },
  {
    id:       'hmavpn',
    name:     'HMA VPN',
    tagline:  'VPN tốc độ cao, 290+ quốc gia, bảo mật tuyệt đối',
    color:    '#F59E0B',
    bg:       'rgba(245,158,11,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
    features: ['5 thiết bị cùng lúc', '290+ quốc gia', 'Kill Switch', 'No-log policy'],
  },
  {
    id:       'other',
    name:     'Dịch vụ số',
    tagline:  'Phần mềm, tài khoản và dịch vụ số ngoài Netflix',
    color:    '#818CF8',
    bg:       'rgba(99,102,241,0.12)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    features: ['Đa dạng sản phẩm', 'Giá tốt', 'Hỗ trợ 24/7', 'Bảo hành'],
  },
]

export function getService(id) {
  return SERVICES.find(s => s.id === id) || SERVICES.find(s => s.id === 'other')
}

export function getServiceName(id) {
  return getService(id)?.name || id
}
