export function renderFooter() {
  const footer = document.getElementById('footer')
  if (!footer) return

  const update = () => {
    const s = window.__siteSettings || {}
    const siteName   = s.site_name        || 'Netflix Store'
    const footerText = s.footer_text      || `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`
    const telegram   = s.contact_telegram || ''
    const zalo       = s.contact_zalo     || ''
    const facebook   = s.social_facebook  || ''
    const youtube    = s.social_youtube   || ''
    const tiktok     = s.social_tiktok    || ''

    const socialLink = (href, icon, label) => href
      ? `<a href="${href}" target="_blank" rel="noopener" class="footer-social-link" title="${label}">
           <span class="social-icon">${icon}</span>
           <span>${label}</span>
         </a>`
      : ''

    footer.innerHTML = `
      <div class="footer-inner-grid">

        <!-- Brand -->
        <div class="footer-brand-col">
          <a href="#/" class="footer-logo">
            <span class="logo-text">${siteName.split(' ')[0]}</span>
            <span class="logo-sub">${siteName.split(' ').slice(1).join(' ') || 'Store'}</span>
          </a>
          <p class="footer-tagline">
            Tài khoản Netflix Premium chính hãng.<br>
            Bảo hành tự động 24/7.
          </p>
        </div>

        <!-- Navigation -->
        <div class="footer-nav-col">
          <h4 class="footer-col-title">Điều hướng</h4>
          <div class="footer-nav-links">
            <a href="#/">Trang chủ</a>
            <a href="#/plans">Bảng giá</a>
            <a href="#/dashboard">Tài khoản</a>
            <a href="#/login">Đăng nhập</a>
          </div>
        </div>

        <!-- Contact & Social -->
        <div class="footer-social-col">
          <h4 class="footer-col-title">Liên hệ & Hỗ trợ</h4>
          <div class="footer-social-links">
            ${socialLink(telegram,  '✈️', 'Telegram')}
            ${socialLink(zalo ? `https://zalo.me/${zalo}` : '', '💬', 'Zalo')}
            ${socialLink(facebook,  '📘', 'Facebook')}
            ${socialLink(youtube,   '▶️', 'YouTube')}
            ${socialLink(tiktok,    '🎵', 'TikTok')}
            ${!telegram && !zalo && !facebook && !youtube && !tiktok
              ? '<span style="color:rgba(255,255,255,.3);font-size:13px;">Chưa cấu hình liên kết</span>'
              : ''}
          </div>
        </div>

      </div>

      <div class="footer-bottom">
        <span>${footerText}</span>
        <span class="footer-bottom-badge">🎬 Netflix Premium Store</span>
      </div>
    `
  }

  update()

  // Re-render khi settings load xong
  window.addEventListener('siteSettingsLoaded', update)
}
