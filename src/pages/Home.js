import { getPlans, getPlansForSellerStore, getSettings } from '../utils/api.js'
import { filterPlansForStorefront, getServiceForDisplay, catalogServiceOrder } from '../utils/catalog.js'
import { getCheckoutStore, clearCheckoutStore } from '../utils/storeContext.js'
import { renderPlanCard } from '../components/PlanCard.js'
import { isLoggedIn } from '../utils/auth.js'
import { navigate } from '../router.js'
import { countUp } from '../utils/reveal.js'

export async function renderHome(container) {
  if (!window.__storeFromCustomDomain) clearCheckoutStore()
  const sid = getCheckoutStore()?.id

  // Show skeleton for plans while loading
  container.innerHTML = `
    <!-- HERO -->
    <section class="hero-section">
      <div class="hero-orb hero-orb-1"></div>
      <div class="hero-orb hero-orb-2"></div>
      <div class="hero-orb hero-orb-3"></div>
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <h1 class="hero-title">Netflix Premium</h1>
        <p class="hero-subtitle">Xem phim không giới hạn, chất lượng 4K Ultra HD</p>
        <p class="hero-desc">Tài khoản chính hãng • Bảo hành tự động • Kích hoạt tức thì</p>
        <div class="hero-cta">
          <a href="#/products" class="btn btn-primary btn-lg">Xem dịch vụ</a>
          <a href="#/login" class="btn btn-outline btn-lg">Đăng nhập</a>
        </div>
        <div class="hero-stats">
          <div class="stat"><span class="stat-num" id="statCustomers">0</span><span class="stat-label">Khách hàng</span></div>
          <div class="stat"><span class="stat-num" id="statUptime">0</span><span class="stat-label">Uptime</span></div>
          <div class="stat"><span class="stat-num" id="statSupport">24/7</span><span class="stat-label">Hỗ trợ</span></div>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section class="features-section">
      <div class="page-container">
        <h2 class="section-title reveal">Tại sao chọn chúng tôi?</h2>
        <div class="features-grid">
          <div class="feature-card reveal reveal--delay-1">
            <div class="feature-icon">🎬</div>
            <h3>4K Ultra HD</h3>
            <p>Xem phim với chất lượng cao nhất, hỗ trợ HDR và Dolby Atmos</p>
          </div>
          <div class="feature-card reveal reveal--delay-2">
            <div class="feature-icon">🔒</div>
            <h3>Bảo hành tự động</h3>
            <p>Hệ thống tự động bảo hành khi có sự cố, không cần liên hệ</p>
          </div>
          <div class="feature-card reveal reveal--delay-3">
            <div class="feature-icon">⚡</div>
            <h3>Kích hoạt tức thì</h3>
            <p>Nhận link đăng nhập ngay sau khi thanh toán được xác nhận</p>
          </div>
          <div class="feature-card reveal reveal--delay-1">
            <div class="feature-icon">💬</div>
            <h3>Hỗ trợ 24/7</h3>
            <p>Đội ngũ support sẵn sàng hỗ trợ bạn mọi lúc mọi nơi</p>
          </div>
          <div class="feature-card reveal reveal--delay-2">
            <div class="feature-icon">📺</div>
            <h3>Đa thiết bị</h3>
            <p>Xem trên TV, điện thoại, máy tính, tablet không giới hạn</p>
          </div>
          <div class="feature-card reveal reveal--delay-3">
            <div class="feature-icon">💰</div>
            <h3>Giá tốt nhất</h3>
            <p>Cam kết giá rẻ nhất thị trường, tiết kiệm đến 80%</p>
          </div>
        </div>
      </div>
    </section>

    <!-- PLANS PREVIEW -->
    <section class="plans-section" id="home-plans">
      <div class="page-container">
        <h2 class="section-title reveal">Bảng giá</h2>
        <p class="section-desc reveal reveal--delay-1">Chọn dịch vụ và gói phù hợp với nhu cầu của bạn</p>
        <div id="homePlansWrap">
          <div class="plans-grid">
            <div class="skeleton plan-skeleton"></div>
            <div class="skeleton plan-skeleton"></div>
            <div class="skeleton plan-skeleton"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="how-section">
      <div class="page-container">
        <h2 class="section-title reveal">Cách thức hoạt động</h2>
        <div class="steps-grid">
          <div class="step-card reveal reveal--delay-1">
            <div class="step-num">1</div>
            <h3>Chọn gói</h3>
            <p>Chọn gói Netflix phù hợp với nhu cầu sử dụng</p>
          </div>
          <div class="step-card reveal reveal--delay-2">
            <div class="step-num">2</div>
            <h3>Thanh toán</h3>
            <p>Chuyển khoản qua MoMo hoặc ngân hàng</p>
          </div>
          <div class="step-card reveal reveal--delay-3">
            <div class="step-num">3</div>
            <h3>Nhận link</h3>
            <p>Nhận link đăng nhập Netflix tự động sau khi xác nhận</p>
          </div>
          <div class="step-card reveal reveal--delay-4">
            <div class="step-num">4</div>
            <h3>Thưởng thức</h3>
            <p>Đăng nhập và xem phim không giới hạn!</p>
          </div>
        </div>
      </div>
    </section>
  `

  // CountUp for stats
  countUp(container.querySelector('#statCustomers'), 10000, 1800, '+')
  countUp(container.querySelector('#statUptime'), 999, 1400, '%')

  let plans
  let settings
  try {
    ;[plans, settings] = await Promise.all([
      sid ? getPlansForSellerStore(sid) : getPlans(),
      getSettings().catch(() => ({}))
    ])
  } catch {
    settings = {}
    try {
      plans = await getPlans()
    } catch { plans = [] }
  }

  const visible = filterPlansForStorefront(plans, settings)

  const wrap = container.querySelector('#homePlansWrap')
  if (!wrap) return

  const onSelect = p => navigate(isLoggedIn() ? `/payment/${p.id}` : '/login')

  if (!visible?.length) {
    wrap.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Chưa có gói nào.</p>'
    return
  }

  const byService = {}
  for (const p of visible) {
    const svc = p.service || 'netflix'
    if (!byService[svc]) byService[svc] = []
    byService[svc].push(p)
  }

  const serviceOrder = catalogServiceOrder(settings)
  const orderedSvcs = [
    ...serviceOrder.filter(id => byService[id]),
    ...Object.keys(byService).filter(id => !serviceOrder.includes(id))
  ]

  wrap.innerHTML = ''

  orderedSvcs.forEach(svcId => {
    const svcPlans = byService[svcId]
    const svcInfo  = getServiceForDisplay(svcId, settings)

    // Service label row
    const labelRow = document.createElement('div')
    labelRow.className = 'home-svc-label reveal'
    labelRow.innerHTML = `
      <span class="home-svc-icon" style="color:${svcInfo.color};background:${svcInfo.bg};">${svcInfo.icon}</span>
      <span class="home-svc-name">${svcInfo.name}</span>
      <a href="#/plans?service=${svcId}" class="home-svc-link">Xem tất cả →</a>
    `
    wrap.appendChild(labelRow)

    // Grid
    const grid = document.createElement('div')
    grid.className = 'plans-grid home-plans-grid'
    svcPlans.forEach((plan, i) => {
      grid.appendChild(renderPlanCard(plan, onSelect, i))
    })
    wrap.appendChild(grid)
  })
}

