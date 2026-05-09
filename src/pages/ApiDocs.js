/**
 * API Docs page – redesigned
 */

const ICON_GLOBE  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
const ICON_ZAPP   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
const ICON_SHIELD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
const ICON_STORE  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
const ICON_HOOK   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`
const ICON_DB     = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`
const ICON_COPY   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`

const SECTIONS = [
  { id: 'base', label: 'Base URL' },
  { id: 'format', label: 'Định dạng' },
  { id: 'public', label: 'Công khai' },
  { id: 'netflix', label: 'Tiện ích Netflix' },
  { id: 'webhook', label: 'Webhook' },
  { id: 'admin', label: 'Admin' },
  { id: 'seller', label: 'Seller / đại lý' },
]

export function renderApiDocs(container, _params) {
  const base = `${window.location.origin}`

  container.innerHTML = `
    <div class="adoc-root">

      <!-- HERO -->
      <div class="adoc-hero">
        <div class="page-container adoc-hero-inner">
          <div class="adoc-hero-label">
            <span class="adoc-hero-dot"></span> REST API
          </div>
          <h1 class="adoc-hero-title">API cho nhà phát triển</h1>
          <p class="adoc-hero-desc">
            Các endpoint do server Node (<code>server.cjs</code>) cung cấp.
            Gọi cùng origin với site hoặc qua reverse proxy.
          </p>
          <div class="adoc-hero-url">
            <span class="adoc-hero-url-label">Base URL</span>
            <code class="adoc-hero-url-val" id="adocBaseUrl">${base}</code>
            <button class="adoc-copy-btn" id="btnCopyBase" title="Copy Base URL">${ICON_COPY} Copy</button>
          </div>
        </div>
      </div>

      <!-- BODY: sidebar + content -->
      <div class="page-container adoc-body">

        <!-- SIDEBAR -->
        <aside class="adoc-sidebar" aria-label="Mục lục API">
          <p class="adoc-sidebar-title">Mục lục</p>
          <nav class="adoc-nav">
            ${SECTIONS.map(s => `
              <a href="#adoc-${s.id}" class="adoc-nav-link" data-section="${s.id}">${s.label}</a>
            `).join('')}
          </nav>
          <div class="adoc-sidebar-foot">
            <a href="#/" class="btn btn-sm btn-outline" style="width:100%;justify-content:center;">← Trang chủ</a>
          </div>
        </aside>

        <!-- MAIN -->
        <main class="adoc-main">

          <!-- BASE URL -->
          <section class="adoc-section" id="adoc-base">
            <div class="adoc-section-head adoc-section-head--blue">
              <span class="adoc-section-icon">${ICON_GLOBE}</span>
              <h2 class="adoc-section-title">Base URL</h2>
            </div>
            <div class="adoc-section-body">
              <div class="adoc-code-block">
                <span class="adoc-code-lang">URL</span>
                <code>${base}</code>
              </div>
              <p class="adoc-hint">
                Ví dụ: <code class="adoc-inline-code">GET ${base}/api/test-db</code>
              </p>
              <p class="adoc-note">
                Nếu gọi từ <strong>domain khác</strong>, trình duyệt sẽ chặn trừ khi server bật CORS.
                Mặc định không mở CORS — tích hợp server-side hoặc cùng domain là an toàn nhất.
              </p>
            </div>
          </section>

          <!-- ĐỊNH DẠNG -->
          <section class="adoc-section" id="adoc-format">
            <div class="adoc-section-head adoc-section-head--violet">
              <span class="adoc-section-icon">${ICON_ZAPP}</span>
              <h2 class="adoc-section-title">Định dạng request</h2>
            </div>
            <div class="adoc-section-body">
              <div class="adoc-format-list">
                <div class="adoc-format-item">
                  <span class="adoc-format-key">JSON body</span>
                  <code class="adoc-inline-code">Content-Type: application/json</code>
                  <span class="adoc-format-note">cho POST / PATCH / PUT</span>
                </div>
                <div class="adoc-format-item">
                  <span class="adoc-format-key">Auth (admin/seller)</span>
                  <code class="adoc-inline-code">Authorization: Bearer &lt;access_token&gt;</code>
                  <span class="adoc-format-note">MongoDB JWT sau đăng nhập</span>
                </div>
                <div class="adoc-format-item">
                  <span class="adoc-format-key">Admin secret</span>
                  <code class="adoc-inline-code">x-admin-secret: &lt;secret&gt;</code>
                  <span class="adoc-format-note">hoặc query <code>?secret=</code> khớp ADMIN_SECRET trong .env</span>
                </div>
              </div>
            </div>
          </section>

          <!-- CÔNG KHAI -->
          <section class="adoc-section" id="adoc-public">
            <div class="adoc-section-head adoc-section-head--green">
              <span class="adoc-section-icon">${ICON_GLOBE}</span>
              <h2 class="adoc-section-title">Công khai</h2>
              <span class="adoc-section-badge adoc-badge--open">Không cần auth</span>
            </div>
            <div class="adoc-section-body">
              ${endpointList([
                { method:'GET',  path:'/api/test-db',                              desc:'Kiểm tra kết nối DB.',                                                                               res:'—' },
                { method:'GET',  path:'/api/store/by-host',                        desc:'Gian hàng theo tên miền riêng. Header <code>Host</code> hoặc <code>X-Forwarded-Host</code>.',        res:'{ store, plans, payment }' },
                { method:'GET',  path:'/api/store/:slug',                          desc:'Gian hàng theo slug (hash <code>#/s/:slug</code>).',                                                 res:'{ store, plans, payment }' },
                { method:'GET',  path:'/api/checkout/quote?planId=&sellerStoreId=',desc:'Giá + cấu hình thanh toán cho một gói.',                                                             res:'{ plan, payment }' },
                { method:'GET',  path:'/api/public/plans?sellerStoreId=',          desc:'Bảng giá đã gộp cho một gian hàng.',                                                                res:'{ plans: [...] }' },
                { method:'GET',  path:'/api/payment-status/:transferContent',      desc:'Trạng thái thanh toán / subscription theo nội dung chuyển khoản.',                                   res:'{ confirmed, loginLink, … }' },
              ])}
            </div>
          </section>

          <!-- TIỆN ÍCH NETFLIX -->
          <section class="adoc-section" id="adoc-netflix">
            <div class="adoc-section-head adoc-section-head--red">
              <span class="adoc-section-icon">${ICON_ZAPP}</span>
              <h2 class="adoc-section-title">Tiện ích Netflix</h2>
              <span class="adoc-section-badge adoc-badge--post">POST · JSON body</span>
            </div>
            <div class="adoc-section-body">
              ${endpointList([
                { method:'POST', path:'/api/get-link',    desc:'Body: <code>{ "cookie": "…" }</code> — lấy link đăng nhập từ cookie.', res:'{ success, link, info }' },
                { method:'POST', path:'/api/check-cookie',desc:'Body: <code>{ "cookie": "…" }</code> — kiểm tra cookie còn sống.',    res:'{ alive, raw }' },
                { method:'POST', path:'/api/tv-init',     desc:'Khởi tạo phiên đăng nhập TV (xem body trong server.cjs).',            res:'JSON' },
                { method:'POST', path:'/api/tv-submit',   desc:'Gửi mã TV (xem body trong server.cjs).',                             res:'JSON' },
              ])}
            </div>
          </section>

          <!-- WEBHOOK -->
          <section class="adoc-section" id="adoc-webhook">
            <div class="adoc-section-head adoc-section-head--orange">
              <span class="adoc-section-icon">${ICON_HOOK}</span>
              <h2 class="adoc-section-title">Webhook</h2>
              <span class="adoc-section-badge adoc-badge--warn">Không gọi tay từ frontend</span>
            </div>
            <div class="adoc-section-body">
              ${endpointList([
                { method:'POST', path:'/sepay-webhook', desc:'Webhook tùy chọn (định dạng VA cũ). Xác nhận chính: server poll <a href="https://thueapibank.vn/home/mbbank" target="_blank" rel="noopener">thueapibank MB</a>.', res:'—' },
              ])}
            </div>
          </section>

          <!-- ADMIN -->
          <section class="adoc-section" id="adoc-admin">
            <div class="adoc-section-head adoc-section-head--violet">
              <span class="adoc-section-icon">${ICON_SHIELD}</span>
              <h2 class="adoc-section-title">Admin</h2>
              <span class="adoc-section-badge adoc-badge--auth">Bearer + role admin</span>
              <span class="adoc-section-badge adoc-badge--secret">hoặc ADMIN_SECRET</span>
            </div>
            <div class="adoc-section-body">
              ${endpointList([
                { method:'POST',  path:'/api/admin/confirm-payment', desc:'Body: <code>{ "paymentId": "uuid" }</code> — xác nhận thanh toán thủ công.',  res:'JSON' },
                { method:'POST',  path:'/api/admin/run-expiry',      desc:'Chạy job hết hạn subscription.',                                               res:'JSON' },
                { method:'POST',  path:'/api/admin/health-check',    desc:'Kiểm tra tài khoản trong kho.',                                                res:'JSON' },
                { method:'GET',   path:'/api/admin/stats',           desc:'Thống kê doanh thu, đơn, kho.',                                                res:'JSON' },
                { method:'POST',  path:'/api/admin/test-telegram',   desc:'Gửi tin test Telegram.',                                                       res:'JSON' },
                { method:'GET',   path:'/api/admin/settings',        desc:'Đọc cài đặt site.',                                                            res:'object' },
                { method:'PATCH', path:'/api/admin/settings',        desc:'Body: object các key được phép (<code>site_name</code>, <code>bank_*</code>, …).', res:'{ success }' },
                { method:'GET',   path:'/api/mbbank-debug',            desc:'Debug lịch sử MB (thueapibank) — nhạy cảm, admin only. <code>/api/sepay-debug</code> alias cũ.', res:'JSON' },
              ])}
            </div>
          </section>

          <!-- SELLER -->
          <section class="adoc-section" id="adoc-seller">
            <div class="adoc-section-head adoc-section-head--teal">
              <span class="adoc-section-icon">${ICON_STORE}</span>
              <h2 class="adoc-section-title">Seller / đại lý</h2>
              <span class="adoc-section-badge adoc-badge--auth">Bearer + role seller hoặc admin</span>
            </div>
            <div class="adoc-section-body">
              ${endpointList([
                { method:'GET',   path:'/api/seller/store',       desc:'Thông tin gian hàng (mật khẩu/token ẩn một phần).',                        res:'object | null' },
                { method:'POST',  path:'/api/seller/store',       desc:'Tạo gian hàng (slug, display_name, …).',                                   res:'object' },
                { method:'PATCH', path:'/api/seller/store',       desc:'Cập nhật gian hàng (ngân hàng, MoMo, Telegram, giá qua các field).',       res:'object' },
                { method:'GET',   path:'/api/seller/plan-prices', desc:'Giá từng gói (đã gộp với giá gốc).',                                       res:'{ plans }' },
                { method:'PUT',   path:'/api/seller/plan-prices', desc:'Body: <code>{ "prices": { "month": 60000, … } }</code> — mỗi giá ≥ giá gốc.', res:'{ success, plans }' },
                { method:'GET',   path:'/api/seller/stats',       desc:'Thống kê đơn qua gian hàng.',                                              res:'JSON' },
              ])}
            </div>
          </section>

          <!-- FOOTER -->
          <div class="adoc-foot">
            <p>Cập nhật theo <code>server.cjs</code> trong repo. Thêm route mới thì nhớ bổ sung trang này.</p>
            <a href="#/" class="btn btn-outline">← Về trang chủ</a>
          </div>

        </main>
      </div>
    </div>
  `

  // Copy base URL
  container.querySelector('#btnCopyBase')?.addEventListener('click', () => {
    navigator.clipboard.writeText(base)
    const b = container.querySelector('#btnCopyBase')
    if (b) { b.innerHTML = `${ICON_COPY} Đã copy!`; setTimeout(() => { b.innerHTML = `${ICON_COPY} Copy` }, 1500) }
  })

  // Sidebar active highlight on scroll
  const sections = container.querySelectorAll('.adoc-section[id]')
  const navLinks = container.querySelectorAll('.adoc-nav-link')

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id.replace('adoc-', '')
        navLinks.forEach(a => a.classList.toggle('active', a.dataset.section === id))
      }
    })
  }, { rootMargin: '-20% 0px -70% 0px' })

  sections.forEach(s => observer.observe(s))

  // Smooth scroll for sidebar links
  navLinks.forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault()
      const target = container.querySelector(a.getAttribute('href'))
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })

  return () => observer.disconnect()
}

function endpointList(rows) {
  return `<div class="adoc-endpoint-list">
    ${rows.map(({ method, path, desc, res }) => `
      <div class="adoc-endpoint-row">
        <div class="adoc-endpoint-left">
          <code class="api-method api-method--${method}">${method}</code>
          <code class="adoc-ep-path">${path}</code>
        </div>
        <div class="adoc-endpoint-desc">${desc}</div>
        <div class="adoc-endpoint-res">
          <span class="adoc-res-label">↩</span>
          <code class="adoc-res-val">${res}</code>
        </div>
      </div>
    `).join('')}
  </div>`
}
