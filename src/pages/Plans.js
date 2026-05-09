import { getPlans, getPlansForSellerStore, getSettings, getCatalogData } from '../utils/api.js'
import { getCheckoutStore } from '../utils/storeContext.js'
import { renderPlanCard } from '../components/PlanCard.js'
import { isLoggedIn } from '../utils/auth.js'
import { navigate } from '../router.js'
import { filterPlansForStorefront, getServiceForDisplay, catalogServiceOrder } from '../utils/catalog.js'

const ICON_USERS = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
const ICON_USER  = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`

export async function renderPlans(container) {
  const sid = getCheckoutStore()?.id

  const hashSearch = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''
  const q = new URLSearchParams(hashSearch)
  const urlService = q.get('service') || null
  const urlGroup = q.get('group')
  const urlFilter = q.get('filter')

  const renderSkeleton = () => {
    container.innerHTML = `
      <section class="plans-page">
        <div class="page-container">
          <h1 class="page-title">Bảng giá</h1>
          <p class="page-desc">Đang tải...</p>
          <div class="plans-grid" style="margin-top:32px;">
            ${Array(4).fill('<div class="skeleton plan-skeleton"></div>').join('')}
          </div>
        </div>
      </section>`
  }

  const renderError = (msg, retry) => {
    container.innerHTML = `
      <section class="plans-page">
        <div class="page-container" style="text-align:center;padding:80px 20px;">
          <div style="font-size:48px;margin-bottom:16px;">😕</div>
          <h2 style="margin-bottom:8px;">Không tải được bảng giá</h2>
          <p style="color:var(--text-secondary);margin-bottom:24px;">${msg}</p>
          <button class="btn btn-primary" id="retryPlans">Thử lại</button>
        </div>
      </section>`
    container.querySelector('#retryPlans')?.addEventListener('click', retry)
  }

  const load = async () => {
    renderSkeleton()

    if (urlGroup === 'other') {
      try {
        const [catalogCategories, settings] = await Promise.all([
          getCatalogData(),
          getSettings().catch(() => ({}))
        ])
        renderCatalogPage(container, catalogCategories, settings)
      } catch (err) { renderError(err.message, load) }
      return
    }

    let plans
    let settings
    try {
      ;[plans, settings] = await Promise.all([
        sid ? getPlansForSellerStore(sid) : getPlans(),
        getSettings().catch(() => ({}))
      ])
    } catch (err) { renderError(err.message, load); return }

    const visible = filterPlansForStorefront(plans, settings)
    const onSelect = p => navigate(isLoggedIn() ? `/payment/${p.id}` : '/login')

    if (urlFilter === 'free') {
      renderFreePlans(container, visible, onSelect, settings, {
        selectedService: q.get('service'),
        selectedAccount: q.get('account'),
      })
    } else if (urlService) {
      renderSingleService(container, visible, urlService, onSelect, settings)
    } else {
      renderAllServices(container, visible, onSelect, settings)
    }
  }

  await load()
}

// ══════════════════════════════════════════════════════════════
// Hiển thị tất cả services theo section
// ══════════════════════════════════════════════════════════════
function renderAllServices(container, plans, onSelect, settings = {}, viewOpts = null) {
  const byService = {}
  for (const p of (plans || [])) {
    const svc = p.service || 'netflix'
    if (!byService[svc]) byService[svc] = []
    byService[svc].push(p)
  }

  const serviceOrder = catalogServiceOrder(settings)
  const orderedServices = [
    ...serviceOrder.filter(id => byService[id]),
    ...Object.keys(byService).filter(id => !serviceOrder.includes(id))
  ]

  if (orderedServices.length === 0) {
    container.innerHTML = `
      <section class="plans-page">
        <div class="page-container" style="text-align:center;padding:80px 20px;">
          <p style="font-size:48px;margin-bottom:16px;">📦</p>
          <h2>Chưa có gói nào</h2>
          <p style="color:var(--text-secondary);">Admin chưa tạo gói dịch vụ nào.</p>
          <a href="#/" class="btn btn-primary" style="margin-top:16px;">Về trang chủ</a>
        </div>
      </section>`
    return
  }

  // Build HTML sections
  const sectionsHtml = orderedServices.map(svcId => {
    const svcPlans = byService[svcId]
    const svcInfo  = getServiceForDisplay(svcId, settings)
    const isNetflix = svcId === 'netflix'

    if (isNetflix) {
      // Netflix: tách shared/private
      const shared   = svcPlans.filter(p => !p.account_type || p.account_type === 'shared')
      const private_ = svcPlans.filter(p => p.account_type === 'private')
      return `
        <div class="plans-service-section" id="svc-${svcId}">
          <div class="pss-header" style="--svc-color:${svcInfo.color};--svc-bg:${svcInfo.bg};">
            <div class="pss-icon">${svcInfo.icon}</div>
            <div>
              <h2 class="pss-title">${svcInfo.name}</h2>
              <p class="pss-tagline">${svcInfo.tagline}</p>
            </div>
            <span class="pss-count">${svcPlans.length} gói</span>
          </div>

          ${shared.length ? `
          <div class="pss-type-label pss-type-label--shared">
            ${ICON_USERS} Dùng chung
          </div>
          <div class="plans-grid pss-grid" id="nf-shared"></div>
          ` : ''}

          ${private_.length ? `
          <div class="pss-type-label pss-type-label--private">
            ${ICON_USER} Dùng riêng
          </div>
          <div class="plans-grid pss-grid" id="nf-private"></div>
          ` : ''}
        </div>`
    } else {
      // Other services: flat grid
      return `
        <div class="plans-service-section" id="svc-${svcId}">
          <div class="pss-header" style="--svc-color:${svcInfo.color};--svc-bg:${svcInfo.bg};">
            <div class="pss-icon">${svcInfo.icon}</div>
            <div>
              <h2 class="pss-title">${svcInfo.name}</h2>
              <p class="pss-tagline">${svcInfo.tagline}</p>
            </div>
            <span class="pss-count">${svcPlans.length} gói</span>
          </div>
          <div class="plans-grid pss-grid" id="svc-grid-${svcId}"></div>
        </div>`
    }
  }).join('')

  // Service nav pills (nếu nhiều hơn 1 service)
  const navPills = orderedServices.length > 1
    ? `<div class="plans-service-nav">
        ${orderedServices.map(id => {
          const s = getServiceForDisplay(id, settings)
          return `<button type="button" class="psn-pill" style="--c:${s.color};" data-scroll-to="svc-${id}">
            <span style="font-size:14px;">${s.icon}</span> ${s.name}
          </button>`
        }).join('')}
      </div>`
    : ''

  const title = viewOpts?.title ?? 'Bảng giá'
  const desc = viewOpts?.desc ?? 'Chọn gói phù hợp với nhu cầu của bạn.'
  const backBlock = viewOpts?.backHref
    ? `<a href="${viewOpts.backHref}" class="plans-back-link reveal">${viewOpts.backLabel ?? '← Quay lại'}</a>`
    : ''

  container.innerHTML = `
    <section class="plans-page">
      <div class="page-container">
        ${backBlock}
        <h1 class="page-title reveal">${title}</h1>
        <p class="page-desc reveal reveal--delay-1">${desc}</p>
        ${navPills}
        <div class="plans-all-sections">
          ${sectionsHtml}
        </div>
      </div>
    </section>`

  // Scroll-to pill listeners
  container.querySelectorAll('[data-scroll-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = container.querySelector(`#${btn.dataset.scrollTo}`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })

  // Render plan cards
  orderedServices.forEach(svcId => {
    const svcPlans = byService[svcId]
    if (svcId === 'netflix') {
      const shared   = svcPlans.filter(p => !p.account_type || p.account_type === 'shared')
      const private_ = svcPlans.filter(p => p.account_type === 'private')
      const gShared  = container.querySelector('#nf-shared')
      const gPrivate = container.querySelector('#nf-private')
      shared.forEach((p, i)   => gShared?.appendChild(renderPlanCard(p, onSelect, i)))
      private_.forEach((p, i) => gPrivate?.appendChild(renderPlanCard(p, onSelect, i)))
    } else {
      const grid = container.querySelector(`#svc-grid-${svcId}`)
      svcPlans.forEach((p, i) => grid?.appendChild(renderPlanCard(p, onSelect, i)))
    }
  })
}

// ══════════════════════════════════════════════════════════════
// Hiển thị 1 service cụ thể (khi có ?service=xxx)
// ══════════════════════════════════════════════════════════════
function renderSingleService(container, plans, svcId, onSelect, settings = {}) {
  const svcInfo    = getServiceForDisplay(svcId, settings)
  const isNetflix  = svcId === 'netflix'
  const filtered   = (plans || []).filter(p => (p.service || 'netflix') === svcId)

  const allServices = [...new Set((plans || []).map(p => p.service || 'netflix'))]
  const switcherHtml = allServices.length > 1 ? `
    <div class="plans-service-switcher reveal reveal--delay-1">
      ${allServices.map(sid => {
        const s = getServiceForDisplay(sid, settings)
        return `<a href="#/plans?service=${sid}" class="pss-btn ${sid===svcId?'active':''}"
          style="${sid===svcId?`background:${s.color};border-color:${s.color};color:#fff`:''}">${s.name}</a>`
      }).join('')}
    </div>` : ''

  if (isNetflix) {
    const shared   = filtered.filter(p => !p.account_type || p.account_type === 'shared')
    const private_ = filtered.filter(p => p.account_type === 'private')

    container.innerHTML = `
      <section class="plans-page">
        <div class="page-container">
          <a href="#/products" class="plans-back-link reveal">← Tất cả dịch vụ</a>
          <div class="plans-service-header reveal" style="--svc-color:${svcInfo.color};--svc-bg:${svcInfo.bg};">
            <div class="psh-icon">${svcInfo.icon}</div>
            <div>
              <h1 class="psh-title">${svcInfo.name}</h1>
              <p class="psh-tagline">${svcInfo.tagline}</p>
            </div>
          </div>
          ${switcherHtml}

          ${shared.length ? `
          <div class="plans-section-block reveal">
            <div class="psb-header psb-header--shared">
              <span class="psb-icon">${ICON_USERS}</span>
              <div><h2 class="psb-title">Tài khoản dùng chung</h2>
              <p class="psb-desc">Chia sẻ nhiều người cùng dùng · Giá thấp hơn</p></div>
            </div>
            <div class="plans-grid" id="gridShared"></div>
          </div>` : ''}

          ${private_.length ? `
          <div class="plans-section-block reveal">
            <div class="psb-header psb-header--private">
              <span class="psb-icon">${ICON_USER}</span>
              <div><h2 class="psb-title">Tài khoản dùng riêng</h2>
              <p class="psb-desc">Profile + mã PIN riêng · 1 màn hình</p></div>
            </div>
            <div class="plans-grid" id="gridPrivate"></div>
          </div>` : ''}

          ${!filtered.length ? `<p class="plans-empty-msg">Chưa có gói Netflix nào.</p>` : ''}

          <div class="plans-note reveal">
            <h3>📌 Lưu ý quan trọng</h3>
            <ul>
              <li>Tất cả gói đều là tài khoản Netflix Premium chính hãng</li>
              <li>Hỗ trợ xem trên mọi thiết bị: TV, điện thoại, máy tính</li>
              <li>Bảo hành tự động trong suốt thời gian sử dụng</li>
              <li>Link đăng nhập được cấp ngay sau khi thanh toán được xác nhận</li>
              <li>Hỗ trợ qua Telegram 24/7</li>
            </ul>
          </div>
        </div>
      </section>`

    container.querySelector('#gridShared') && shared.forEach((p, i) =>
      container.querySelector('#gridShared').appendChild(renderPlanCard(p, onSelect, i)))
    container.querySelector('#gridPrivate') && private_.forEach((p, i) =>
      container.querySelector('#gridPrivate').appendChild(renderPlanCard(p, onSelect, i)))

  } else {
    container.innerHTML = `
      <section class="plans-page">
        <div class="page-container">
          <a href="#/products" class="plans-back-link reveal">← Tất cả dịch vụ</a>
          <div class="plans-service-header reveal" style="--svc-color:${svcInfo.color};--svc-bg:${svcInfo.bg};">
            <div class="psh-icon">${svcInfo.icon}</div>
            <div>
              <h1 class="psh-title">${svcInfo.name}</h1>
              <p class="psh-tagline">${svcInfo.tagline}</p>
            </div>
          </div>
          ${switcherHtml}

          ${filtered.length
            ? `<div class="plans-grid" id="gridOther"></div>`
            : `<div class="plans-empty-msg" style="text-align:center;padding:var(--sp-16);">
                <p style="font-size:48px;margin-bottom:16px;">📦</p>
                <p>Chưa có gói nào cho dịch vụ này.</p>
              </div>`
          }

          ${filtered.length ? `
          <div class="plans-note reveal" style="margin-top:var(--sp-10);">
            <h3>📌 Lưu ý</h3>
            <ul>
              <li>Tài khoản ${svcInfo.name} chính hãng</li>
              <li>Kích hoạt tức thì sau khi thanh toán được xác nhận</li>
              <li>Bảo hành tự động trong thời gian sử dụng</li>
              <li>Hỗ trợ qua Telegram 24/7</li>
            </ul>
          </div>` : ''}
        </div>
      </section>`

    const grid = container.querySelector('#gridOther')
    if (grid) filtered.forEach((p, i) => grid.appendChild(renderPlanCard(p, onSelect, i)))
  }
}

function renderOtherProductsEmpty(container) {
  container.innerHTML = `
    <section class="plans-page">
      <div class="page-container" style="text-align:center;padding:80px 20px;">
        <a href="#/products" class="plans-back-link" style="display:inline-block;margin-bottom:var(--sp-6);">← Dịch vụ</a>
        <p style="font-size:48px;margin-bottom:16px;">🛍</p>
        <h2 style="margin-bottom:8px;">Chưa có dịch vụ số</h2>
        <p style="color:var(--text-secondary);max-width:420px;margin:0 auto;line-height:1.6;">
          Hiện shop chỉ có gói Netflix. Xem <a href="#/plans?service=netflix">Gói Netflix</a>
          hoặc <a href="#/plans">toàn bộ bảng giá</a>.
        </p>
      </div>
    </section>`
}

// ══════════════════════════════════════════════════════════════
// Render catalog page from new product_categories / products / variants
// ══════════════════════════════════════════════════════════════
function renderCatalogPage(container, categories, settings = {}) {
  const telegramLink = settings.contact_telegram || null
  const hashSearch = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''
  const typeFilter = new URLSearchParams(hashSearch).get('type')

  if (!categories || !categories.length) {
    renderOtherProductsEmpty(container)
    return
  }

  if (typeFilter === 'stock' || typeFilter === 'manual') {
    categories = categories
      .map(cat => ({
        ...cat,
        products: (cat.products || []).filter((p) => {
          const isStock = ['stock', 'key'].includes(p.fulfillment_type || '')
          return typeFilter === 'stock' ? isStock : !isStock
        })
      }))
      .filter(cat => (cat.products || []).length > 0)
  }

  if (!categories.length) {
    renderOtherProductsEmpty(container)
    return
  }

  const _e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const fmt = n => (n || n === 0) ? Number(n).toLocaleString('vi-VN') + '₫' : '—'

  const dayLabel = (days) => {
    const n = Number(days || 0)
    if (!n) return ''
    if (n >= 360) return n % 365 === 0 ? `${Math.round(n / 365)} năm` : `${n} ngày`
    if (n >= 60 && n % 30 === 0) return `${Math.round(n / 30)} tháng`
    if (n >= 28 && n <= 31) return '1 tháng'
    return `${n} ngày`
  }

  const productDurationFromName = (text) => {
    const s = String(text || '').toLowerCase()
    const day = s.match(/(?:^|[^\d])(\d{1,4})\s*(?:d|day|days|ngày|ngay)(?=$|[^\p{L}\d])/iu)
    if (day) return Number(day[1])
    const year = s.match(/(?:^|[^\d])(\d{1,2})\s*(?:y|year|years|năm|nam)(?=$|[^\p{L}\d])/iu)
    if (year) return Number(year[1]) * 365
    const month = s.match(/(?:^|[^\d])(\d{1,3})\s*(?:m|month|months|tháng|thang)(?=$|[^\p{L}\d])/iu)
    if (month) return Number(month[1]) * 30
    return null
  }

  const variantDays = (product, variant) =>
    Number(variant?.duration_days || 0) || productDurationFromName(variant?.name || variant?.label) || productDurationFromName(product?.name) || 30

  const variantDescription = (product, variant, days) => {
    const name = String(variant?.name || variant?.label || '').toLowerCase()
    if (days <= 40 && (String(product.name || '').toLowerCase().includes('35') || name.includes('35'))) {
      return 'Trải nghiệm Pro ngắn hạn, tài khoản chia sẻ không watermark.'
    }
    if (days >= 360) return 'Giá tốt nhất, tiết kiệm tối đa không lo gián đoạn.'
    if (days >= 170) return 'Lựa chọn tối ưu cho creator, dùng lâu dài tiết kiệm hơn.'
    if (days >= 80) return 'Tiết kiệm hơn gói tháng, đầy đủ tính năng Pro không giới hạn.'
    return product.shortDescription || 'Truy cập toàn bộ tính năng Pro, xuất 4K, không watermark.'
  }

  const variantDisplayLabel = (product, variant, days) => {
    const label = String(variant?.name || variant?.label || '').trim()
    const explicitProductDays = productDurationFromName(product?.name)
    if (explicitProductDays === days && /(?:^|[^\d])\d{1,3}\s*(m|month|months|tháng|thang|y|year|years|năm|nam)(?=$|[^\p{L}\d])/iu.test(label)) {
      return dayLabel(days)
    }
    return label || dayLabel(days) || 'Gói'
  }

  const savingsText = (variants, variant, days) => {
    if (days < 60 || !variant?.price) return ''
    const monthly = variants.find(v => {
      const d = Number(v.duration_days || 0) || productDurationFromName(v.name || v.label)
      return d >= 28 && d <= 31
    })
    if (!monthly?.price) return ''
    const expected = Number(monthly.price) * (days / 30)
    if (expected <= Number(variant.price)) return ''
    const pct = Math.round((1 - Number(variant.price) / expected) * 100)
    return pct > 0 ? `Tiết kiệm ${pct}%` : ''
  }

  const renderVariantCard = (product, variant, variants, index) => {
    const loggedIn = isLoggedIn()
    const href = loggedIn ? `#/payment/${_e(variant.id)}` : '#/login'
    const days = variantDays(product, variant)
    const period = dayLabel(days)
    const label = variantDisplayLabel(product, variant, days)
    const popular = index === 2 || String(variant.name || '').includes('3 Tháng')
    const savings = savingsText(variants, variant, days)
    return `<article class="cplan-card${popular ? ' is-popular' : ''}">
      ${popular ? '<span class="cplan-popular">Phổ biến</span>' : ''}
      <div class="cplan-card-head">
        <h3>${_e(product.name)}</h3>
        <span>${_e(label)}</span>
      </div>
      <p>${_e(variantDescription(product, variant, days))}</p>
      <div class="cplan-price-row">
        <strong>${fmt(variant.price)}</strong>
        ${period ? `<span>/ ${_e(period)}</span>` : ''}
      </div>
      ${savings ? `<div class="cplan-save">${_e(savings)}</div>` : ''}
      <a class="btn btn-primary cplan-buy" href="${href}">${loggedIn ? 'Mua hàng' : 'Đăng nhập để mua'}</a>
    </article>`
  }

  const serviceSections = categories
    .map(category => {
      const products = category.products || []
      const fallbackProduct = products[0] || { id: category.id, name: category.name, price: 0 }
      const product = {
        ...fallbackProduct,
        id: category.id,
        name: category.name,
        shortDescription: category.description || fallbackProduct.shortDescription
      }
      const variants = products
        .flatMap(item => (item.variants || []).map(variant => ({ ...variant, _product: item })))
        .sort((a, b) => variantDays(product, a) - variantDays(product, b))
      return { category, product, variants }
    })
    .filter(section => section.variants.length || (section.category.products || []).length)

  const sections = serviceSections.map(({ category, product, variants }) => {
    const cards = variants.length
      ? variants.map((variant, index) => renderVariantCard(product, variant, variants, index)).join('')
      : `<article class="cplan-card"><div class="cplan-card-head"><h3>${_e(product.name)}</h3><span>Liên hệ</span></div><p>${_e(product.shortDescription || 'Liên hệ shop để được tư vấn.')}</p><div class="cplan-price-row"><strong>${fmt(product.price)}</strong></div><a class="btn btn-primary cplan-buy" href="${telegramLink || '#/login'}">Liên hệ</a></article>`
    return `<section class="cplan-section" id="category-${_e(category.id)}">
      <div class="cplan-product-head">
        <div>
          <h2>${_e(product.name)}</h2>
          <p>${_e(product.shortDescription || category.description || 'Chọn gói phù hợp, thanh toán và nhận nội dung kích hoạt từ kho.')}</p>
        </div>
        <span>${variants.length || 1} gói</span>
      </div>
      <div class="cplan-grid">${cards}</div>
    </section>`
  }).join('')

  const navHtml = serviceSections.length > 1
    ? serviceSections.map(({ category }) => `<button type="button" class="cpage-pill" data-scroll-to="category-${_e(category.id)}"><span>${_e(category.name)}</span></button>`).join('')
    : ''

  const totalServices = serviceSections.length
  const allPrices = categories.flatMap(c =>
    (c.products||[]).flatMap(p => (p.variants||[]).map(v => v.price||0))
  ).filter(p => p > 0)
  const minPrice = allPrices.length ? Math.min(...allPrices) : null

  // ── Render ────────────────────────────────────────────────────
  const pageTitle = typeFilter === 'stock' ? 'Dịch vụ cấp sẵn' : typeFilter === 'manual' ? 'Dịch vụ xử lý thủ công' : 'Dịch vụ'
  const pageSub = typeFilter === 'stock'
    ? 'Dịch vụ có sẵn trong kho, giao nội dung tự động sau khi thanh toán.'
    : typeFilter === 'manual'
      ? 'Dịch vụ cần admin xác nhận, xử lý và phản hồi thủ công.'
      : 'Phần mềm, tài khoản và dịch vụ số — chọn gói, thanh toán, nhận hàng nhanh.'

  container.innerHTML = `<div class="cpage-root">

  <div class="cpage-hero">
    <div class="cpage-hero-glow"></div>
    <div class="page-container cpage-hero-inner">
      <a href="#/products" class="cpage-back">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Dịch vụ
      </a>
      <h1 class="cpage-hero-title">${pageTitle}</h1>
      <p class="cpage-hero-sub">${pageSub}</p>
      <div class="cpage-hero-stats">
        <div class="cpage-stat"><span class="cpage-stat-num">${totalServices}</span><span class="cpage-stat-lbl">Dịch vụ</span></div>
        ${minPrice ? `<div class="cpage-stat-div"></div><div class="cpage-stat"><span class="cpage-stat-num">${fmt(minPrice)}</span><span class="cpage-stat-lbl">Từ</span></div>` : ''}
      </div>
    </div>
  </div>

  ${navHtml ? `<div class="cpage-nav-bar" id="cpageNavBar"><div class="page-container cpage-nav-inner">${navHtml}</div></div>` : ''}

  <div class="page-container cpage-body">
    <div class="cplan-sections">${sections}</div>
  </div>

</div>`

  // Scroll-to pills
  container.querySelectorAll('[data-scroll-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })

  // Scrollspy — highlight active service pill
  const navBar = container.querySelector('#cpageNavBar')
  if (navBar && serviceSections.length > 1) {
    const pills  = [...navBar.querySelectorAll('.cpage-pill')]
    const secEls = [...container.querySelectorAll('.cplan-section')]
    const setActive = id => pills.forEach(p => p.classList.toggle('is-active', p.dataset.scrollTo === id))
    if (pills[0]) pills[0].classList.add('is-active')
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id) })
    }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 })
    secEls.forEach(s => io.observe(s))
    const mo = new MutationObserver(() => { io.disconnect(); mo.disconnect() })
    mo.observe(container, { childList: true })
  }

}

function renderFreePlans(container, plans, onSelect, settings = {}, opts = {}) {
  const freeAll = (plans || []).filter(p => Number(p.price) === 0)
  if (!freeAll.length) {
    container.innerHTML = `
      <section class="plans-page">
        <div class="page-container" style="text-align:center;padding:80px 20px;">
          <a href="#/products" class="plans-back-link" style="display:inline-block;margin-bottom:var(--sp-6);">← Dịch vụ</a>
          <p style="font-size:48px;margin-bottom:16px;">🎁</p>
          <h2 style="margin-bottom:8px;">Chưa có gói miễn phí</h2>
          <p style="color:var(--text-secondary);max-width:400px;margin:0 auto;">
            Admin có thể tạo gói có giá <strong>0đ</strong> — gói đó sẽ hiện tại đây. Có thể phân loại theo <strong>dịch vụ</strong> (Netflix, …) và <strong>loại tài khoản</strong> (dùng chung / riêng) cho Netflix.
          </p>
          <a href="#/plans" class="btn btn-primary" style="margin-top:var(--sp-6);">Xem bảng giá</a>
        </div>
      </section>`
    return
  }

  const serviceIdsPresent = [...new Set(freeAll.map(p => p.service || 'netflix'))]
  const order = catalogServiceOrder(settings)
  serviceIdsPresent.sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    const ca = ia === -1 ? 999 : ia
    const cb = ib === -1 ? 999 : ib
    if (ca !== cb) return ca - cb
    return String(a).localeCompare(String(b))
  })

  let selSvc = (opts.selectedService || '').trim() || null
  if (selSvc && !serviceIdsPresent.includes(selSvc)) selSvc = null

  let selAcc = (opts.selectedAccount || '').trim().toLowerCase() || null
  if (selAcc !== 'shared' && selAcc !== 'private') selAcc = null
  if (selSvc !== 'netflix') selAcc = null

  const netflixFree = freeAll.filter(p => (p.service || 'netflix') === 'netflix')
  const nfHasShared = netflixFree.some(p => !p.account_type || p.account_type === 'shared')
  const nfHasPrivate = netflixFree.some(p => p.account_type === 'private')
  const showNetflixAccountTabs = selSvc === 'netflix' && nfHasShared && nfHasPrivate

  const applyFilters = list => {
    let out = list
    if (selSvc) out = out.filter(p => (p.service || 'netflix') === selSvc)
    if (selAcc === 'shared') {
      out = out.filter(p => !p.account_type || p.account_type === 'shared')
    } else if (selAcc === 'private') {
      out = out.filter(p => p.account_type === 'private')
    }
    return out
  }

  const filtered = applyFilters(freeAll)
  freeAll.sort((a, b) => String(a.service || '').localeCompare(String(b.service || '')))

  const servicePills = `
    <div class="plans-service-nav plans-free-nav reveal reveal--delay-1">
      <a href="#/plans?filter=free"
        class="psn-pill ${!selSvc ? 'is-active' : ''}" style="--c: var(--primary);">
        Tất cả dịch vụ
      </a>
      ${serviceIdsPresent.map(id => {
        const s = getServiceForDisplay(id, settings)
        const active = selSvc === id
        return `<a href="#/plans?filter=free&service=${encodeURIComponent(id)}"
          class="psn-pill ${active ? 'is-active' : ''}" style="--c:${s.color};">
          <span class="plans-free-pill-icon">${s.icon}</span> ${s.name}
        </a>`
      }).join('')}
    </div>`

  const netflixAccountPills = showNetflixAccountTabs
    ? `
    <div class="plans-service-nav plans-free-subnav reveal reveal--delay-1">
      <span class="plans-free-subnav-label">Loại Netflix</span>
      <a href="#/plans?filter=free&service=netflix"
        class="psn-pill ${!selAcc ? 'is-active' : ''}" style="--c:#6366f1;">Tất cả</a>
      ${nfHasShared
        ? `<a href="#/plans?filter=free&service=netflix&account=shared"
          class="psn-pill ${selAcc === 'shared' ? 'is-active' : ''}" style="--c:#2563eb;">Dùng chung</a>`
        : ''}
      ${nfHasPrivate
        ? `<a href="#/plans?filter=free&service=netflix&account=private"
          class="psn-pill ${selAcc === 'private' ? 'is-active' : ''}" style="--c:#6d28d9;">Dùng riêng</a>`
        : ''}
    </div>`
    : ''

  const emptyFiltered =
    filtered.length === 0
      ? `<div class="plans-empty-msg plans-free-empty reveal" style="text-align:center;padding:var(--sp-12) var(--sp-4);">
          <p style="font-size:40px;margin-bottom:var(--sp-3);">🎁</p>
          <h2 style="margin-bottom:8px;font-size:1.1rem;">Không có gói miễn phí cho lựa chọn này</h2>
          <p style="color:var(--text-secondary);max-width:400px;margin:0 auto var(--sp-5);line-height:1.55;">
            Thử chọn <strong>loại dịch vụ</strong> khác hoặc bỏ lọc Netflix (chung/riêng).
          </p>
          <a href="#/plans?filter=free" class="btn btn-primary">Xem tất cả gói miễn phí</a>
        </div>`
      : `<div class="plans-grid" id="gridFree"></div>`

  container.innerHTML = `
    <section class="plans-page">
      <div class="page-container">
        <a href="#/products" class="plans-back-link reveal">← Dịch vụ</a>
        <h1 class="page-title reveal">Miễn phí</h1>
        <p class="page-desc reveal reveal--delay-1">
          Gói <strong>0đ</strong> theo từng dịch vụ${nfHasShared && nfHasPrivate ? '; Netflix có thể lọc <strong>dùng chung</strong> / <strong>dùng riêng</strong>' : ''}.
        </p>
        ${servicePills}
        ${netflixAccountPills}
        ${emptyFiltered}
      </div>
    </section>`

  const grid = container.querySelector('#gridFree')
  if (grid) filtered.forEach((p, i) => grid.appendChild(renderPlanCard(p, onSelect, i)))
}
