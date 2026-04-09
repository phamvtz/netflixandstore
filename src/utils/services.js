/**
 * Danh sách dịch vụ được hỗ trợ.
 * Thêm dịch vụ mới vào đây là tự động hiển thị khắp nơi.
 */
export const SERVICES = [
  {
    id:       'netflix',
    name:     'Netflix',
    tagline:  'Xem phim, series 4K không giới hạn',
    color:    '#E50914',
    bg:       '#fff1f2',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l4.5 9L5 21h3l2.25-4.5L12 21h3l-4.5-9L15 3h-3l-2.25 4.5L7.5 3H5z"/></svg>`,
    features: ['Full HD + 4K Ultra HD', 'Không quảng cáo', 'Mọi thiết bị', 'Bảo hành tự động'],
  },
  {
    id:       'youtube',
    name:     'YouTube Premium',
    tagline:  'Xem không quảng cáo, tải offline',
    color:    '#FF0000',
    bg:       '#fff1f1',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.6 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.3.6 9.3.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.2 3.5-6.2 3.5z"/></svg>`,
    features: ['Không quảng cáo', 'Tải video offline', 'YouTube Music', 'Phát nền'],
  },
  {
    id:       'spotify',
    name:     'Spotify Premium',
    tagline:  'Nghe nhạc không giới hạn, không quảng cáo',
    color:    '#1DB954',
    bg:       '#f0fdf4',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.28c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.54.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.66 1.02.36 1.56-.3.42-1.02.54-1.5.24z"/></svg>`,
    features: ['Không quảng cáo', 'Tải nhạc offline', 'Chất lượng cao', 'Mọi thiết bị'],
  },
  {
    id:       'capcut',
    name:     'CapCut Pro',
    tagline:  'Chỉnh sửa video chuyên nghiệp, mọi tính năng',
    color:    '#000000',
    bg:       '#f8f8f8',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>`,
    features: ['Mọi hiệu ứng Pro', 'Không watermark', 'Xuất 4K', 'Template premium'],
  },
  {
    id:       'other',
    name:     'Sản phẩm khác',
    tagline:  'Các dịch vụ và phần mềm khác ngoài Netflix',
    color:    '#6366f1',
    bg:       '#f0edff',
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
