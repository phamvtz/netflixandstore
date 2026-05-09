/** Trang gợi ý nội dung xem — liên kết ngoài tới các nguồn phim công khai. */

const SOURCES = [
  {
    id: 'netflix-new',
    icon: 'N',
    iconBg: '#E50914',
    iconColor: '#fff',
    badge: 'Nguồn chính thức',
    title: 'Mới trên Netflix',
    desc: 'Phim, series và chương trình mới nhất — trang chính thức Netflix cập nhật liên tục (Tiếng Việt).',
    cta: 'Mở about.netflix.com',
    href: 'https://about.netflix.com/vi/new-to-watch',
  },
  {
    id: 'netflix-browse',
    icon: 'N',
    iconBg: '#E50914',
    iconColor: '#fff',
    title: 'Netflix — Khám phá thư viện',
    desc: 'Duyệt thư viện và thể loại trên web Netflix. Cần tài khoản để xem đầy đủ.',
    cta: 'Mở netflix.com',
    href: 'https://www.netflix.com/vn/browse',
  },
  {
    id: 'tmdb',
    icon: 'TM',
    iconBg: '#0d253f',
    iconColor: '#01b4e4',
    badge: 'Không cần tài khoản',
    title: 'The Movie Database',
    desc: 'Lọc phim theo điểm đánh giá, năm phát hành và thể loại. Xem trailer, đọc mô tả chi tiết.',
    cta: 'Khám phá TMDB',
    href: 'https://www.themoviedb.org/discover/movie',
  },
  {
    id: 'justwatch',
    icon: 'JW',
    iconBg: '#ff7c00',
    iconColor: '#fff',
    badge: 'Không cần tài khoản',
    title: 'JustWatch Việt Nam',
    desc: 'Tìm nội dung đang phát trên Netflix và các nền tảng khác tại Việt Nam.',
    cta: 'Mở JustWatch',
    href: 'https://www.justwatch.com/vn',
  },
  {
    id: 'letterboxd',
    icon: 'LB',
    iconBg: '#202830',
    iconColor: '#00e054',
    title: 'Letterboxd',
    desc: 'Mạng xã hội điện ảnh — khám phá danh sách phim hay từ cộng đồng toàn cầu.',
    cta: 'Mở letterboxd.com',
    href: 'https://letterboxd.com',
  },
  {
    id: 'imdb-chart',
    icon: 'IM',
    iconBg: '#f5c518',
    iconColor: '#000',
    title: 'IMDb Top 250',
    desc: 'Danh sách 250 phim được đánh giá cao nhất mọi thời đại bởi cộng đồng IMDb.',
    cta: 'Xem IMDb Top 250',
    href: 'https://www.imdb.com/chart/top/',
  },
]

const EXT_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`

export async function renderMovieSuggestions(container) {
  document.title = 'Gợi ý phim — ' + (window.__siteSettings?.site_name || 'Store')

  container.innerHTML = `
    <div class="ms-page">

      <!-- Hero -->
      <div class="ms-hero">
        <div class="ms-hero-glow"></div>
        <div class="page-container">
          <div class="ms-hero-inner">
            <div class="ms-eyebrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              Gợi ý xem phim
            </div>
            <h1 class="ms-title">Xem gì hôm nay?</h1>
            <p class="ms-sub">
              Tổng hợp nguồn phim chất lượng từ Netflix và các nền tảng công khai.
              Mở tab mới — không cần đăng nhập tài khoản shop.
            </p>
            <div class="ms-cta">
              <a href="#/plans?service=netflix" class="btn btn-primary">
                Mua gói Netflix ngay
              </a>
              <a href="#/products" class="btn btn-outline">Xem dịch vụ khác</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Sources grid -->
      <div class="page-container">
        <div class="ms-grid">
          ${SOURCES.map(s => `
            <a class="ms-card" href="${s.href}" target="_blank" rel="noopener noreferrer"
               aria-label="${s.title} — mở tab mới">
              <div class="ms-card-top">
                <div class="ms-icon" style="background:${s.iconBg};color:${s.iconColor}">${s.icon}</div>
                <div class="ms-card-badges">
                  ${s.badge ? `<span class="ms-badge">${s.badge}</span>` : ''}
                </div>
              </div>
              <div class="ms-card-body">
                <h2 class="ms-card-title">${s.title}</h2>
                <p class="ms-card-desc">${s.desc}</p>
              </div>
              <div class="ms-card-cta">
                ${s.cta} ${EXT_ICON}
              </div>
            </a>
          `).join('')}
        </div>

        <div class="ms-disclaimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Các liên kết trên đây dẫn đến trang web bên thứ ba. Shop không kiểm soát nội dung từ những nguồn này.
        </div>
      </div>
    </div>
  `
}
