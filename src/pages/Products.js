import { getPlans, getSettings } from '../utils/api.js'
import { filterPlansForStorefront } from '../utils/catalog.js'
import { navigate } from '../router.js'
import { formatVND } from '../utils/format.js'

const NF_COLOR = '#E50914'
const NF_BG = '#fff1f2'
const OTHER_COLOR = '#6366f1'
const OTHER_BG = '#f0edff'
const FREE_COLOR = '#10b981'
const FREE_BG = '#ecfdf5'

export async function renderProducts(container) {
  container.innerHTML = `
    <section class="products-page">
      <div class="page-container">
        <h1 class="page-title reveal">Dịch vụ</h1>
        <p class="page-desc reveal reveal--delay-1">
          Netflix là mục chính; các ứng dụng và gói khác được gom ở mục sản phẩm khác.
        </p>
        <div class="products-loading">
          ${Array(3).fill('<div class="skeleton products-skeleton"></div>').join('')}
        </div>
      </div>
    </section>`

  let plans = []
  let settings = {}
  try {
    ;[plans, settings] = await Promise.all([getPlans(), getSettings().catch(() => ({}))])
  } catch (_) {}

  const visiblePlans = filterPlansForStorefront(plans, settings)
  const byService = {}
  for (const p of visiblePlans) {
    const svc = p.service || 'netflix'
    if (!byService[svc]) byService[svc] = []
    byService[svc].push(p)
  }

  const netflixPlans = byService['netflix'] || []
  const otherPlans = visiblePlans.filter(p => (p.service || 'netflix') !== 'netflix')
  const freePlans = visiblePlans.filter(p => Number(p.price) === 0)

  const minNetflix = netflixPlans.length ? Math.min(...netflixPlans.map(p => p.price)) : null
  const minOther = otherPlans.length ? Math.min(...otherPlans.map(p => p.price)) : null

  const cards = [
    {
      key: 'netflix',
      href: '#/plans?service=netflix',
      name: 'Gói Netflix',
      tagline: 'Premium · Dùng chung / riêng',
      color: NF_COLOR,
      bg: NF_BG,
      icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="1.15em" height="1.15em"><path d="M5 3l4.5 9L5 21h3l2.25-4.5L12 21h3l-4.5-9L15 3h-3l-2.25 4.5L7.5 3H5z"/></svg>`,
      count: netflixPlans.length,
      minPrice: minNetflix
    },
    {
      key: 'other',
      href: '#/plans?group=other',
      name: 'Sản phẩm khác',
      tagline: 'YouTube, Spotify, CapCut… và danh mục tùy chỉnh',
      color: OTHER_COLOR,
      bg: OTHER_BG,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="1.15em" height="1.15em"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
      count: otherPlans.length,
      minPrice: minOther
    },
    {
      key: 'free',
      href: '#/plans?filter=free',
      name: 'Miễn phí',
      tagline: 'Các gói đang mở 0đ trên shop',
      color: FREE_COLOR,
      bg: FREE_BG,
      icon: `<span style="font-size:1.35em;line-height:1;">🎁</span>`,
      count: freePlans.length,
      minPrice: freePlans.length ? 0 : null
    }
  ]

  container.innerHTML = `
    <section class="products-page">
      <div class="page-container">

        <header class="products-hero reveal">
          <h1 class="products-title">Chọn danh mục</h1>
          <p class="products-desc">
            Netflix trọng tâm · Sản phẩm khác gom các dịch vụ còn lại · Miễn phí lọc gói 0đ
          </p>
        </header>

        <div class="products-grid products-grid--split">
          ${cards.map((svc, i) => {
            const minPrice = svc.minPrice
            const planCount = svc.count
            return `
              <button type="button" class="product-card reveal reveal--delay-${Math.min(i + 1, 5)}"
                      data-href="${svc.href}"
                      style="--pc:${svc.color};--pb:${svc.bg};">
                <div class="pc-icon" style="color:${svc.color};background:${svc.bg};">
                  ${svc.icon}
                </div>
                <div class="pc-body">
                  <h2 class="pc-name">${svc.name}</h2>
                  <p class="pc-tagline">${svc.tagline}</p>
                  <div class="pc-meta">
                    ${svc.key === 'free' && planCount > 0
                      ? `<span class="pc-price">0đ · ${planCount} gói</span>`
                      : minPrice !== null && planCount > 0
                        ? `<span class="pc-price">Từ ${formatVND(minPrice)}</span>`
                        : `<span class="pc-price pc-price--new">Sắp có</span>`
                    }
                    ${planCount > 0 && svc.key !== 'free' ? `<span class="pc-plans">${planCount} gói</span>` : ''}
                  </div>
                </div>
                <div class="pc-arrow" style="color:${svc.color};">→</div>
                <div class="pc-active-bar" style="background:${svc.color};"></div>
              </button>`
          }).join('')}
        </div>

        <p class="products-all-link reveal">
          <a href="#/plans" class="btn btn-outline">Xem toàn bộ bảng giá</a>
        </p>

        <div class="products-trust reveal">
          <div class="pt-item">
            <span class="pt-icon">⚡</span>
            <strong>Kích hoạt tức thì</strong>
            <p>Link / tài khoản gửi ngay sau thanh toán</p>
          </div>
          <div class="pt-item">
            <span class="pt-icon">🛡</span>
            <strong>Bảo hành tự động</strong>
            <p>Hệ thống tự xử lý khi có sự cố</p>
          </div>
          <div class="pt-item">
            <span class="pt-icon">💬</span>
            <strong>Hỗ trợ 24/7</strong>
            <p>Telegram · Zalo · Luôn sẵn sàng</p>
          </div>
          <div class="pt-item">
            <span class="pt-icon">✅</span>
            <strong>Chính hãng</strong>
            <p>Tài khoản gốc, không phần mềm crack</p>
          </div>
        </div>

      </div>
    </section>`

  container.querySelectorAll('.product-card[data-href]').forEach(card => {
    card.addEventListener('click', () => {
      const href = card.getAttribute('data-href')
      if (href.startsWith('#')) navigate(href.slice(1))
    })
  })
}
