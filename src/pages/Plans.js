import { getPlans, getPlansForSellerStore, getSettings } from '../utils/api.js'
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
    } else if (urlGroup === 'other') {
      const otherPlans = visible.filter(p => (p.service || 'netflix') !== 'netflix')
      if (!otherPlans.length) renderOtherProductsEmpty(container)
      else {
        renderAllServices(container, otherPlans, onSelect, settings, {
          title: 'Sản phẩm khác',
          desc: 'Các gói ngoài Netflix (ứng dụng khác hoặc danh mục tùy chỉnh).',
          backHref: '#/products',
          backLabel: '← Dịch vụ'
        })
      }
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
          return `<a href="#svc-${id}" class="psn-pill" style="--c:${s.color};">
            <span style="font-size:14px;">${s.icon}</span> ${s.name}
          </a>`
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
          <a href="#/products" class="plans-back-link reveal">← Tất cả dịch vụ &amp; sản phẩm</a>
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
          <a href="#/products" class="plans-back-link reveal">← Tất cả dịch vụ &amp; sản phẩm</a>
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
        <h2 style="margin-bottom:8px;">Chưa có sản phẩm khác</h2>
        <p style="color:var(--text-secondary);max-width:420px;margin:0 auto;line-height:1.6;">
          Hiện shop chỉ có gói Netflix. Xem <a href="#/plans?service=netflix">Gói Netflix</a>
          hoặc <a href="#/plans">toàn bộ bảng giá</a>.
        </p>
      </div>
    </section>`
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
