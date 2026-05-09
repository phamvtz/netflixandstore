import { adminPatchSettings } from '../../utils/api.js'

export const SETTINGS_GROUPS = [
  {
    id: 'seo',
    title: 'SEO và trang chủ',
    keys: [
      ['site_name', 'Tên website', 'Netflix Store'],
      ['site_title', 'Title tag', 'Netflix Store'],
      ['meta_description', 'Meta description', 'Mô tả ngắn cho Google', 'textarea'],
      ['meta_keywords', 'Keywords', 'netflix, mua netflix'],
      ['hero_title', 'Hero title', 'Netflix Premium'],
      ['hero_subtitle', 'Hero subtitle', 'Mô tả ngắn trên trang chủ'],
    ],
  },
  {
    id: 'payment',
    title: 'Thanh toán',
    keys: [
      ['bank_name', 'Ngân hàng', 'MB Bank'],
      ['bank_account', 'Số tài khoản', ''],
      ['bank_owner', 'Chủ tài khoản', ''],
      ['vietqr_bank_bin', 'VietQR bank BIN', '970422'],
      ['momo_number', 'MoMo - SĐT', ''],
      ['momo_name', 'MoMo - tên', ''],
      ['mbbank_api_token', 'MBBank API Token', '', 'password'],
      ['mbbank_history_base', 'MBBank history API', 'https://thueapibank.vn/historyapimbbank'],
    ],
  },
  {
    id: 'integrations',
    title: 'Tích hợp',
    keys: [
      ['telegram_bot_token', 'Telegram bot token', '', 'password'],
      ['telegram_chat_id', 'Telegram chat id', ''],
      ['resend_api_key', 'Resend API key', '', 'password'],
      ['email_from', 'Email gửi đi', 'noreply@domain.com'],
    ],
  },
  {
    id: 'contact',
    title: 'Liên hệ và footer',
    keys: [
      ['contact_telegram', 'Telegram liên hệ', 'https://t.me/...'],
      ['contact_zalo', 'Zalo', ''],
      ['social_facebook', 'Facebook', ''],
      ['social_youtube', 'YouTube', ''],
      ['social_tiktok', 'TikTok', ''],
      ['footer_text', 'Footer text', '', 'textarea'],
    ],
  },
  {
    id: 'notice',
    title: 'Thông báo web',
    keys: [
      ['notice_enabled', 'Bật thông báo khi vào web', '', 'checkbox'],
      ['notice_title', 'Tiêu đề', 'Thông báo'],
      ['notice_body', 'Nội dung', 'Nội dung thông báo hiển thị khi khách mở web', 'textarea'],
      ['notice_cta_label', 'Nút hành động', 'Xem ngay'],
      ['notice_cta_url', 'Link hành động', '#/plans'],
    ],
  },
]

const SETTINGS_META = {
  seo: {
    icon: 'SEO',
    desc: 'Tên website, title, mô tả Google và nội dung hero trang chủ.',
  },
  payment: {
    icon: 'PAY',
    desc: 'Thông tin ngân hàng, VietQR, MoMo và API đối soát giao dịch.',
  },
  integrations: {
    icon: 'API',
    desc: 'Telegram, email và các khoá tích hợp bên ngoài.',
  },
  contact: {
    icon: 'URL',
    desc: 'Kênh liên hệ, mạng xã hội và nội dung footer.',
  },
  notice: {
    icon: 'POP',
    desc: 'Popup thông báo khi khách truy cập website.',
  },
}

export function renderSettings(state, { esc, attr }) {
  const settings = state.data.settings || {}

  function settingField(key, label, value, placeholder, type) {
    const inputType = type && type !== 'textarea' ? type : 'text'
    const common = `data-setting-key="${attr(key)}" placeholder="${attr(placeholder || '')}"`
    if (type === 'checkbox') {
      const checked = ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').toLowerCase())
      return `
        <label class="settings-field settings-field--check">
          <input type="checkbox" ${common} ${checked ? 'checked' : ''}>
          <span>${esc(label)}</span>
        </label>
      `
    }
    return `
      <label class="settings-field${type === 'textarea' ? ' settings-field--wide' : ''}">
        <span>${esc(label)}</span>
        ${type === 'textarea'
          ? `<textarea rows="3" ${common}>${esc(value || '')}</textarea>`
          : `<input type="${attr(inputType)}" ${common} value="${attr(value || '')}" autocomplete="off">`
        }
      </label>
    `
  }

  return `
    <div class="settings-page">
      <div class="settings-hero">
        <div>
          <span class="admin-v2-kicker">System</span>
          <h1>Cài đặt hệ thống</h1>
          <p>Quản lý cấu hình toàn website. Mỗi nhóm lưu độc lập để giảm rủi ro khi thay đổi thông tin thanh toán hoặc tích hợp.</p>
        </div>
        <button type="button" class="btn btn-sm btn-outline" data-action="refresh">Làm mới</button>
      </div>

      <div class="settings-shell">
        <aside class="settings-nav" aria-label="Nhóm cài đặt">
          ${SETTINGS_GROUPS.map((group, index) => {
            const meta = SETTINGS_META[group.id] || {}
            return `
              <button type="button" class="settings-nav-item${index === 0 ? ' active' : ''}" data-action="settings-jump" data-target="settings-${attr(group.id)}">
                <span>${esc(meta.icon || group.id.toUpperCase())}</span>
                <strong>${esc(group.title)}</strong>
              </button>
            `
          }).join('')}
        </aside>

        <div class="admin-v2-settings-layout settings-panels">
          ${SETTINGS_GROUPS.map(group => {
            const meta = SETTINGS_META[group.id] || {}
            return `
              <section class="admin-v2-settings-section settings-section" id="settings-${attr(group.id)}">
                <div class="admin-v2-settings-section-head settings-section-head">
                  <div class="settings-section-title">
                    <span class="settings-section-icon">${esc(meta.icon || group.id.toUpperCase())}</span>
                    <div>
                      <h3>${esc(group.title)}</h3>
                      <p>${esc(meta.desc || '')}</p>
                    </div>
                  </div>
                  <button type="button" class="btn btn-sm btn-primary" data-action="save-settings" data-group="${attr(group.id)}">Lưu thay đổi</button>
                </div>
                <div class="admin-v2-settings-grid settings-grid">
                  ${group.keys.map(([key, label, placeholder, type]) => settingField(key, label, settings[key], placeholder, type)).join('')}
                  <div class="admin-v2-settings-result settings-result" data-settings-result="${attr(group.id)}" aria-live="polite"></div>
                </div>
              </section>
            `
          }).join('')}
        </div>
      </div>
    </div>
  `
}

export async function saveSettings(state, groupId) {
  const group = SETTINGS_GROUPS.find(g => g.id === groupId)
  if (!group) throw new Error('Nhóm cài đặt không hợp lệ')
  const button = state.content.querySelector(`[data-action="save-settings"][data-group="${groupId}"]`)
  const result = state.content.querySelector(`[data-settings-result="${groupId}"]`)
  const oldLabel = button?.textContent || ''
  const body = {}
  group.keys.forEach(([key]) => {
    const el = state.content.querySelector(`[data-setting-key="${key}"]`)
    if (el) body[key] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value.trim()
  })
  if (button) {
    button.disabled = true
    button.textContent = 'Đang lưu...'
  }
  if (result) result.textContent = ''
  try {
    await adminPatchSettings(body)
    Object.assign(state.data.settings, body)
    window.__siteSettings = { ...(window.__siteSettings || {}), ...body }
    window.dispatchEvent(new Event('siteSettingsLoaded'))
    if (result) result.textContent = 'Đã lưu nhóm cài đặt này.'
    return `Đã lưu ${group.title}`
  } finally {
    if (button) {
      button.disabled = false
      button.textContent = oldLabel || 'Lưu thay đổi'
    }
  }
}
