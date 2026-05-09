import { getPlans, getSettings, getCatalogData } from '../utils/api.js'
import { filterPlansForStorefront } from '../utils/catalog.js'
import { navigate } from '../router.js'
import { formatVND } from '../utils/format.js'

const NF_COLOR    = '#E50914'
const NF_BG       = 'rgba(229,9,20,0.12)'
const OTHER_COLOR = '#818CF8'
const OTHER_BG    = 'rgba(99,102,241,0.12)'
const FREE_COLOR  = '#10b981'
const FREE_BG     = 'rgba(16,185,129,0.12)'

export async function renderProducts(container) {
  container.innerHTML = `
    <section class="products-page">
      <div class="page-container">
        <h1 class="page-title reveal">Dịch vụ</h1>
        <p class="page-desc reveal reveal--delay-1">
          Netflix, phần mềm và tài khoản số được gom theo nhóm để chọn gói nhanh.
        </p>
        <div class="products-loading">
          ${Array(3).fill('<div class="skeleton products-skeleton"></div>').join('')}
        </div>
      </div>
    </section>`

  let plans = []
  let settings = {}
  let catalogCategories = []
  try {
    ;[plans, settings, catalogCategories] = await Promise.all([
      getPlans(),
      getSettings().catch(() => ({})),
      getCatalogData().catch(() => [])
    ])
  } catch (_) {}

  const visiblePlans = filterPlansForStorefront(plans, settings)
  const byService = {}
  for (const p of visiblePlans) {
    const svc = p.service || 'netflix'
    if (!byService[svc]) byService[svc] = []
    byService[svc].push(p)
  }

  const netflixPlans = byService['netflix'] || []
  const minNetflix = netflixPlans.length ? Math.min(...netflixPlans.map(p => p.price)) : null

  // Catalog-based product/service metrics
  const catalogProducts = catalogCategories.flatMap(c => c.products || [])
  const stockProducts = catalogProducts.filter(p => ['stock', 'key'].includes(p.fulfillment_type || ''))
  const manualProducts = catalogProducts.filter(p => !['stock', 'key'].includes(p.fulfillment_type || ''))
  const minVariantPrice = (products) => {
    const prices = products
      .flatMap(p => p.variants || [])
      .map(v => v.price || 0)
      .filter(p => p > 0)
    return prices.length ? Math.min(...prices) : null
  }
  const minStock = minVariantPrice(stockProducts)
  const minManual = minVariantPrice(manualProducts)

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
      key: 'stock',
      href: '#/plans?group=other&type=stock',
      name: 'Dịch vụ cấp sẵn',
      tagline: 'Key, mã code, tài khoản hoặc link giao tự động từ kho',
      color: OTHER_COLOR,
      bg: OTHER_BG,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="1.15em" height="1.15em"><path d="M21 8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>`,
      count: stockProducts.length,
      minPrice: minStock
    },
    {
      key: 'manual',
      href: '#/plans?group=other&type=manual',
      name: 'Dịch vụ thủ công',
      tagline: 'Đơn cần admin xác nhận, xử lý và phản hồi thủ công',
      color: FREE_COLOR,
      bg: FREE_BG,
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="1.15em" height="1.15em"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>`,
      count: manualProducts.length,
      minPrice: minManual
    }
  ]

  container.innerHTML = `
    <section class="products-page">
      <div class="page-container">

        <header class="products-hero reveal">
          <h1 class="products-title">Chọn danh mục</h1>
          <p class="products-desc">
            Netflix riêng một nhóm, dịch vụ cấp sẵn giao từ kho, dịch vụ thủ công chờ admin xác nhận.
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
                <div class="pc-icon-wrap" style="color:${svc.color};background:${svc.bg};">
                  ${svc.icon}
                </div>
                <div class="pc-body">
                  <h2 class="pc-name">${svc.name}</h2>
                  <p class="pc-tagline">${svc.tagline}</p>
                  <div class="pc-meta">
                    ${planCount > 0 && minPrice !== null
                      ? `<span class="pc-count-pill" style="background:${svc.bg};color:${svc.color};border-color:${svc.color}20;">${planCount} ${svc.key === 'netflix' ? 'gói' : 'dịch vụ'} · Từ ${formatVND(minPrice)}</span>`
                      : planCount > 0
                        ? `<span class="pc-count-pill" style="background:${svc.bg};color:${svc.color};border-color:${svc.color}20;">${planCount} ${svc.key === 'netflix' ? 'gói' : 'dịch vụ'}</span>`
                        : `<span class="pc-count-pill pc-count-pill--dim">Sắp có</span>`
                    }
                  </div>
                </div>
                <svg class="pc-arrow-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" style="color:${svc.color};opacity:0.7;"><polyline points="9 18 15 12 9 6"/></svg>
                <div class="pc-active-bar" style="background:${svc.color};"></div>
              </button>`
          }).join('')}
        </div>

        <p class="products-all-link reveal">
          <a href="#/plans" class="btn btn-outline">Xem toàn bộ bảng giá</a>
        </p>

        <div class="products-trust reveal">
          <div class="pt-item">
            <div class="pt-icon-wrap" style="background:rgba(10,132,255,0.1);color:#0A84FF">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div>
              <strong>Kích hoạt tức thì</strong>
              <p>Link / tài khoản gửi ngay sau thanh toán</p>
            </div>
          </div>
          <div class="pt-item">
            <div class="pt-icon-wrap" style="background:rgba(34,197,94,0.1);color:#22C55E">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <strong>Bảo hành tự động</strong>
              <p>Hệ thống tự xử lý khi có sự cố</p>
            </div>
          </div>
          <div class="pt-item">
            <div class="pt-icon-wrap" style="background:rgba(245,158,11,0.1);color:#F59E0B">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div>
              <strong>Hỗ trợ 24/7</strong>
              <p>Telegram · Zalo · Luôn sẵn sàng</p>
            </div>
          </div>
          <div class="pt-item">
            <div class="pt-icon-wrap" style="background:rgba(124,58,237,0.1);color:#A78BFA">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <strong>Chính hãng 100%</strong>
              <p>Tài khoản gốc, không phần mềm crack</p>
            </div>
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
