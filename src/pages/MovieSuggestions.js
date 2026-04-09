/** Trang gợi ý nội dung xem — liên kết ngoài tới Netflix & kho phim công khai. */
export async function renderMovieSuggestions(container) {
  document.title = 'Gợi ý phim — ' + (window.__siteSettings?.site_name || 'Store')

  container.innerHTML = `
    <section class="movies-suggest-page">
      <div class="page-container movies-suggest-inner">
        <header class="movies-suggest-hero reveal">
          <span class="movies-suggest-eyebrow">Gợi ý phim</span>
          <h1 class="page-title">Xem gì hôm nay?</h1>
          <p class="page-desc" style="max-width:36rem;">
            Danh sách <strong>mới cập nhật</strong> từ Netflix lấy từ trang chính thức; thêm các công cụ tìm phim công khai. Chỉ mở tab mới — không cần đăng nhập tài khoản shop.
          </p>
        </header>

        <div class="movies-suggest-grid">
          <a class="movies-suggest-card movies-suggest-card--official reveal reveal--delay-1"
             href="https://about.netflix.com/vi/new-to-watch"
             target="_blank" rel="noopener noreferrer">
            <span class="msc-icon" style="background:#E50914;color:#fff;">N</span>
            <div>
              <span class="msc-official-badge">Nguồn chính thức · Cập nhật bởi Netflix</span>
              <h2 class="msc-title">Mới trên Netflix</h2>
              <p class="msc-desc">Phim, series và chương trình mới — cùng trang mà Netflix dùng cho báo chí &amp; người xem (Tiếng Việt).</p>
              <span class="msc-cta">Mở about.netflix.com →</span>
            </div>
          </a>
          <a class="movies-suggest-card reveal reveal--delay-2" href="https://www.netflix.com/vn/browse" target="_blank" rel="noopener noreferrer">
            <span class="msc-icon" style="background:#E50914;color:#fff;">N</span>
            <div>
              <h2 class="msc-title">Netflix — Khám phá thư viện</h2>
              <p class="msc-desc">Ứng dụng / web Netflix (cần tài khoản) để xem thể loại và thư viện tại khu vực của bạn.</p>
              <span class="msc-cta">Mở netflix.com →</span>
            </div>
          </a>
          <a class="movies-suggest-card reveal reveal--delay-3" href="https://www.themoviedb.org/discover/movie" target="_blank" rel="noopener noreferrer">
            <span class="msc-icon" style="background:#0d253f;color:#01b4e4;">TM</span>
            <div>
              <h2 class="msc-title">The Movie Database</h2>
              <p class="msc-desc">Lọc phim theo điểm, năm, thể loại; đọc mô tả và xem trailer.</p>
              <span class="msc-cta">Khám phá TMDB →</span>
            </div>
          </a>
          <a class="movies-suggest-card reveal reveal--delay-4" href="https://www.justwatch.com/vn" target="_blank" rel="noopener noreferrer">
            <span class="msc-icon" style="background:#141414;color:#f5c518;">JW</span>
            <div>
              <h2 class="msc-title">JustWatch Việt Nam</h2>
              <p class="msc-desc">Xem tựa đang phát ở đâu (Netflix và nền tảng khác) tại VN.</p>
              <span class="msc-cta">Mở JustWatch →</span>
            </div>
          </a>
        </div>

        <p class="movies-suggest-foot reveal">
          <a href="#/plans?service=netflix" class="btn btn-primary">Mua gói Netflix</a>
          <a href="#/products" class="btn btn-outline">Dịch vụ khác</a>
        </p>
      </div>
    </section>`
}
