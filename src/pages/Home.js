import { getPlans, getPlansForSellerStore, getSettings, getWalletBalance, getUserSubscriptions } from '../utils/api.js'
import { filterPlansForStorefront, getServiceForDisplay, catalogServiceOrder } from '../utils/catalog.js'
import { getCheckoutStore, clearCheckoutStore } from '../utils/storeContext.js'
import { renderPlanCard } from '../components/PlanCard.js'
import { isLoggedIn } from '../utils/auth.js'
import { navigate } from '../router.js'
import { countUp } from '../utils/reveal.js'
import { formatVND } from '../utils/format.js'

export async function renderHome(container) {
  if (!window.__storeFromCustomDomain) clearCheckoutStore()
  const sid = getCheckoutStore()?.id

  container.innerHTML = `
    <!-- HERO -->
    <section class="home-hero">
      <div class="home-hero-glow home-hero-glow-1"></div>
      <div class="home-hero-glow home-hero-glow-2"></div>
      <div class="page-container">
        <div class="home-hero-inner">
          <div class="home-hero-content">
            <div class="home-hero-badge">
              <span class="home-hero-badge-dot"></span>
              Dịch vụ giải trí số 1
            </div>
            <h1 class="home-hero-title">
              Mua gói giải trí<br>
              <span class="home-hero-title-grad">nhanh, quản lý dễ</span>
            </h1>
            <p class="home-hero-sub">
              Theo dõi ví, đơn hàng và hỗ trợ trong một dashboard duy nhất.
              Giao hàng tức thì, bảo hành tự động.
            </p>
            <div class="home-hero-cta">
              <a href="#/products" class="btn btn-primary btn-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                Mua gói ngay
              </a>
              <a href="#/guides" class="btn btn-outline btn-lg">
                Xem hướng dẫn
              </a>
            </div>
            <div class="home-hero-stats">
              <div class="home-stat">
                <span class="home-stat-num" id="statCustomers">0</span>
                <span class="home-stat-label">Khách hàng</span>
              </div>
              <div class="home-stat-sep"></div>
              <div class="home-stat">
                <span class="home-stat-num" id="statUptime">0</span>
                <span class="home-stat-label">Uptime</span>
              </div>
              <div class="home-stat-sep"></div>
              <div class="home-stat">
                <span class="home-stat-num">24/7</span>
                <span class="home-stat-label">Hỗ trợ</span>
              </div>
            </div>
          </div>
          <!-- Dashboard preview card -->
          <div class="home-hero-preview" aria-hidden="true">
            <div class="hp-card hp-wallet">
              <div class="hp-wallet-label">Số dư ví</div>
              <div class="hp-wallet-bal" id="homeHeroWalletBal">250,000 <span>₫</span></div>
              <div class="hp-wallet-actions">
                <a href="#/wallet" class="hp-chip">+ Nạp tiền</a>
                <a href="#/products" class="hp-chip hp-chip--outline">Mua gói</a>
              </div>
            </div>
            <div class="hp-card hp-order">
              <div class="hp-order-head">
                <span class="hp-order-name" id="homeHeroOrderName">Netflix Premium</span>
                <span class="hp-badge hp-badge--active" id="homeHeroOrderStatus">Hoạt động</span>
              </div>
              <div class="hp-order-meta" id="homeHeroOrderMeta">Mô phỏng đơn hàng</div>
              <div class="hp-order-bar"><div class="hp-order-fill" id="homeHeroOrderFill" style="width:62%"></div></div>
            </div>
            <div class="hp-card hp-stats-row">
              <div class="hp-mini-stat"><span class="hp-mini-num" id="homeHeroTotalSubs">5</span><span class="hp-mini-lbl">Đơn mua</span></div>
              <div class="hp-mini-stat"><span class="hp-mini-num" id="homeHeroActiveSubs" style="color:var(--secondary)">3</span><span class="hp-mini-lbl">Đang dùng</span></div>
              <div class="hp-mini-stat"><span class="hp-mini-num" id="homeHeroPendingSubs" style="color:var(--primary)">2</span><span class="hp-mini-lbl">Đang chờ</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section class="home-features">
      <div class="page-container">
        <div class="home-section-header">
          <h2 class="home-section-title">Tại sao chọn chúng tôi?</h2>
          <p class="home-section-sub">Trải nghiệm dịch vụ chuyên nghiệp từ A đến Z</p>
        </div>
        <div class="home-features-grid">
          <div class="hf-card">
            <div class="hf-icon" style="--hf-c:#0A84FF">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <h3 class="hf-title">Kích hoạt tức thì</h3>
            <p class="hf-desc">Nhận thông tin đăng nhập ngay sau khi thanh toán được xác nhận.</p>
          </div>
          <div class="hf-card">
            <div class="hf-icon" style="--hf-c:#22C55E">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h3 class="hf-title">Bảo hành tự động</h3>
            <p class="hf-desc">Hệ thống tự động xử lý bảo hành khi có sự cố, không cần liên hệ thủ công.</p>
          </div>
          <div class="hf-card">
            <div class="hf-icon" style="--hf-c:#7C3AED">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
            <h3 class="hf-title">Thanh toán bằng ví</h3>
            <p class="hf-desc">Nạp tiền vào ví một lần, mua gói nhanh không cần chuyển khoản mỗi lần.</p>
          </div>
          <div class="hf-card">
            <div class="hf-icon" style="--hf-c:#F59E0B">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h3 class="hf-title">Hỗ trợ 24/7</h3>
            <p class="hf-desc">Đội ngũ support sẵn sàng hỗ trợ bạn mọi lúc qua Telegram và chat.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- PLANS PREVIEW -->
    <section class="home-plans-section" id="home-plans">
      <div class="page-container">
        <div class="home-section-header">
          <h2 class="home-section-title">Gói nổi bật</h2>
          <p class="home-section-sub">Chọn gói phù hợp — linh hoạt theo ngày, tháng hoặc năm</p>
        </div>
        <div class="home-product-search">
          <div class="home-product-search__box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="homeProductSearch" placeholder="Tìm sản phẩm, gói, dịch vụ..." autocomplete="off">
            <button type="button" id="homeProductSearchClear" aria-label="Xóa tìm kiếm">×</button>
          </div>
          <div class="home-product-search__meta" id="homeProductSearchMeta">Đang tải sản phẩm...</div>
        </div>
        <div id="homePlansWrap">
          <div class="plans-grid">
            <div class="skeleton plan-skeleton"></div>
            <div class="skeleton plan-skeleton"></div>
            <div class="skeleton plan-skeleton"></div>
          </div>
        </div>
        <div class="home-plans-cta">
          <a href="#/products" class="btn btn-outline">Xem tất cả gói dịch vụ →</a>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="how-section">
      <div class="page-container">
        <div class="home-section-header">
          <h2 class="home-section-title">Cách hoạt động</h2>
          <p class="home-section-sub">4 bước đơn giản để bắt đầu</p>
        </div>
        <div class="steps-grid">
          <div class="step-card">
            <div class="step-num">1</div>
            <h3>Chọn gói</h3>
            <p>Duyệt qua các gói dịch vụ phù hợp với nhu cầu của bạn</p>
          </div>
          <div class="step-card">
            <div class="step-num">2</div>
            <h3>Thanh toán</h3>
            <p>Dùng số dư ví hoặc chuyển khoản ngân hàng, MoMo</p>
          </div>
          <div class="step-card">
            <div class="step-num">3</div>
            <h3>Nhận gói</h3>
            <p>Thông tin tài khoản được giao tự động sau khi xác nhận</p>
          </div>
          <div class="step-card">
            <div class="step-num">4</div>
            <h3>Thưởng thức</h3>
            <p>Đăng nhập và trải nghiệm nội dung không giới hạn!</p>
          </div>
        </div>
      </div>
    </section>
  `

  // CountUp stats
  countUp(container.querySelector('#statCustomers'), 10000, 1800, '+')
  countUp(container.querySelector('#statUptime'),    999,   1400, '%')

  // Load real user data for preview widget if logged in
  if (isLoggedIn()) {
    Promise.all([
      getWalletBalance().catch(() => ({ balance: 0 })),
      getUserSubscriptions().catch(() => [])
    ]).then(([wallet, subs]) => {
      const balEl = container.querySelector('#homeHeroWalletBal')
      if (balEl && wallet?.balance !== undefined) {
        balEl.innerHTML = formatVND(wallet.balance)
      }
      if (subs && Array.isArray(subs)) {
        const total = subs.length
        const active = subs.filter(s => s.status === 'active').length
        const pending = subs.filter(s => s.status === 'pending').length
        
        container.querySelector('#homeHeroTotalSubs').textContent = total
        container.querySelector('#homeHeroActiveSubs').textContent = active
        container.querySelector('#homeHeroPendingSubs').textContent = pending
        
        // Find most recent active sub
        const activeSub = subs.find(s => s.status === 'active') || subs[0]
        if (activeSub) {
          container.querySelector('#homeHeroOrderName').textContent = activeSub.plan || 'Đơn hàng'
          container.querySelector('#homeHeroOrderStatus').textContent = activeSub.status === 'active' ? 'Hoạt động' : 'Chờ xử lý'
          if (activeSub.status !== 'active') {
            container.querySelector('#homeHeroOrderStatus').className = 'hp-badge hp-badge--pending'
          }
          if (activeSub.end_at) {
            const daysLeft = Math.max(0, Math.ceil((new Date(activeSub.end_at) - new Date()) / 86400000))
            container.querySelector('#homeHeroOrderMeta').textContent = `Còn ${daysLeft} ngày`
            const totalDays = Math.max(1, Math.ceil((new Date(activeSub.end_at) - new Date(activeSub.created_at)) / 86400000))
            const pct = Math.max(0, Math.min(100, Math.round(((totalDays - daysLeft) / totalDays) * 100)))
            container.querySelector('#homeHeroOrderFill').style.width = pct + '%'
          }
        }
      }
    })
  }

  // Load plans
  let plans, settings
  try {
    ;[plans, settings] = await Promise.all([
      sid ? getPlansForSellerStore(sid) : getPlans(),
      getSettings().catch(() => ({}))
    ])
  } catch {
    settings = {}
    try { plans = await getPlans() } catch { plans = [] }
  }

  const visible = filterPlansForStorefront(plans, settings)
  const wrap    = container.querySelector('#homePlansWrap')
  if (!wrap) return

  const onSelect = p => navigate(isLoggedIn() ? `/payment/${p.id}` : '/login')

  if (!visible?.length) {
    wrap.innerHTML = `
      <div class="home-empty">
        <div class="home-empty-icon">📦</div>
        <p>Chưa có gói nào đang bán.</p>
        <a href="#/guides" class="btn btn-outline">Xem hướng dẫn</a>
      </div>`
    return
  }

  const byService = {}
  for (const p of visible) {
    const svc = p.service || 'netflix'
    if (!byService[svc]) byService[svc] = []
    byService[svc].push(p)
  }

  const serviceOrder = catalogServiceOrder(settings)
  const searchInput = container.querySelector('#homeProductSearch')
  const clearSearch = container.querySelector('#homeProductSearchClear')
  const searchMeta = container.querySelector('#homeProductSearchMeta')

  const searchableText = (plan) => {
    const svcId = plan.service || 'netflix'
    const svcInfo = getServiceForDisplay(svcId, settings)
    return [
      plan.id,
      plan.name,
      plan.description,
      plan.service,
      plan.account_type,
      plan.fulfillment_type,
      svcInfo.name,
    ].map(v => String(v || '').toLowerCase()).join(' ')
  }

  function renderPlanSections(plansToRender, query = '') {
    const grouped = {}
    for (const p of plansToRender) {
      const svc = p.service || 'netflix'
      if (!grouped[svc]) grouped[svc] = []
      grouped[svc].push(p)
    }

    const orderedSvcs = [
      ...serviceOrder.filter(id => grouped[id]),
      ...Object.keys(grouped).filter(id => !serviceOrder.includes(id))
    ]

    wrap.innerHTML = ''
    if (searchMeta) {
      searchMeta.textContent = query
        ? `Tìm thấy ${plansToRender.length} / ${visible.length} sản phẩm`
        : `${visible.length} sản phẩm đang hiển thị`
    }
    if (clearSearch) clearSearch.classList.toggle('show', !!query)

    if (!plansToRender.length) {
      wrap.innerHTML = `
        <div class="home-empty home-empty--search">
          <div class="home-empty-icon">⌕</div>
          <p>Không tìm thấy sản phẩm phù hợp.</p>
          <button type="button" class="btn btn-outline" id="homeProductSearchReset">Xóa tìm kiếm</button>
        </div>`
      wrap.querySelector('#homeProductSearchReset')?.addEventListener('click', () => {
        if (searchInput) searchInput.value = ''
        renderPlanSections(visible, '')
        searchInput?.focus()
      })
      return
    }

    orderedSvcs.forEach(svcId => {
      const svcPlans = grouped[svcId]
    const svcInfo  = getServiceForDisplay(svcId, settings)
    const isNetflix = svcId === 'netflix'

    // Service label row
    const labelRow = document.createElement('div')
    labelRow.className = 'home-svc-label'
    labelRow.innerHTML = `
      <span class="home-svc-icon" style="color:${svcInfo.color};background:${svcInfo.bg}">${svcInfo.icon}</span>
      <span class="home-svc-name">${svcInfo.name}</span>
      <a href="#/plans?service=${svcId}" class="home-svc-link">Xem tất cả →</a>
    `
    wrap.appendChild(labelRow)

    if (isNetflix) {
      // Tách shared / private
      const shared   = svcPlans.filter(p => !p.account_type || p.account_type === 'shared')
      const private_ = svcPlans.filter(p => p.account_type === 'private')

      const ICON_USERS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
      const ICON_USER  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`

      if (shared.length) {
        const sharedLabel = document.createElement('div')
        sharedLabel.className = 'home-type-label'
        sharedLabel.innerHTML = `${ICON_USERS} Dùng chung`
        wrap.appendChild(sharedLabel)

        const grid = document.createElement('div')
        grid.className = 'plans-grid home-plans-grid'
        shared.forEach((plan, i) => grid.appendChild(renderPlanCard(plan, onSelect, i)))
        wrap.appendChild(grid)
      }

      if (private_.length) {
        const privateLabel = document.createElement('div')
        privateLabel.className = 'home-type-label home-type-label--private'
        privateLabel.innerHTML = `${ICON_USER} Riêng tư`
        wrap.appendChild(privateLabel)

        const grid = document.createElement('div')
        grid.className = 'plans-grid home-plans-grid'
        private_.forEach((plan, i) => grid.appendChild(renderPlanCard(plan, onSelect, i)))
        wrap.appendChild(grid)
      }

    } else {
      // Dịch vụ khác: flat grid
      const grid = document.createElement('div')
      grid.className = 'plans-grid home-plans-grid'
      svcPlans.forEach((plan, i) => grid.appendChild(renderPlanCard(plan, onSelect, i)))
      wrap.appendChild(grid)
    }
    })
  }

  renderPlanSections(visible, '')

  let searchTimer = null
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      const query = searchInput.value.trim().toLowerCase()
      const filtered = query ? visible.filter(plan => searchableText(plan).includes(query)) : visible
      renderPlanSections(filtered, query)
    }, 120)
  })

  clearSearch?.addEventListener('click', () => {
    if (searchInput) searchInput.value = ''
    renderPlanSections(visible, '')
    searchInput?.focus()
  })
}

