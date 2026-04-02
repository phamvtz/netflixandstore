import { getPlans } from '../utils/api.js'
import { formatVND } from '../utils/format.js'
import { renderPlanCard } from '../components/PlanCard.js'
import { isLoggedIn } from '../utils/auth.js'
import { navigate } from '../router.js'

export async function renderHome(container) {
  const plans = await getPlans()

  container.innerHTML = `
    <!-- HERO -->
    <section class="hero-section">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <h1 class="hero-title">Netflix Premium</h1>
        <p class="hero-subtitle">Xem phim không giới hạn, chất lượng 4K Ultra HD</p>
        <p class="hero-desc">Tài khoản chính hãng • Bảo hành tự động • Kích hoạt tức thì</p>
        <div class="hero-cta">
          <a href="#/plans" class="btn btn-primary btn-lg">Xem bảng giá</a>
          <a href="#/login" class="btn btn-outline btn-lg">Đăng nhập</a>
        </div>
        <div class="hero-stats">
          <div class="stat"><span class="stat-num">10K+</span><span class="stat-label">Khách hàng</span></div>
          <div class="stat"><span class="stat-num">99.9%</span><span class="stat-label">Uptime</span></div>
          <div class="stat"><span class="stat-num">24/7</span><span class="stat-label">Hỗ trợ</span></div>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section class="features-section">
      <div class="page-container">
        <h2 class="section-title">Tại sao chọn chúng tôi?</h2>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">🎬</div>
            <h3>4K Ultra HD</h3>
            <p>Xem phim với chất lượng cao nhất, hỗ trợ HDR và Dolby Atmos</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🔒</div>
            <h3>Bảo hành tự động</h3>
            <p>Hệ thống tự động bảo hành khi có sự cố, không cần liên hệ</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <h3>Kích hoạt tức thì</h3>
            <p>Nhận link đăng nhập ngay sau khi thanh toán được xác nhận</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">💬</div>
            <h3>Hỗ trợ 24/7</h3>
            <p>Đội ngũ support sẵn sàng hỗ trợ bạn mọi lúc mọi nơi</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📺</div>
            <h3>Đa thiết bị</h3>
            <p>Xem trên TV, điện thoại, máy tính, tablet không giới hạn</p>
          </div>
          <div class="feature-card">
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
        <h2 class="section-title">Bảng giá</h2>
        <p class="section-desc">Chọn gói phù hợp với nhu cầu của bạn</p>
        <div class="plans-grid" id="plansGrid"></div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="how-section">
      <div class="page-container">
        <h2 class="section-title">Cách thức hoạt động</h2>
        <div class="steps-grid">
          <div class="step-card">
            <div class="step-num">1</div>
            <h3>Chọn gói</h3>
            <p>Chọn gói Netflix phù hợp với nhu cầu sử dụng</p>
          </div>
          <div class="step-card">
            <div class="step-num">2</div>
            <h3>Thanh toán</h3>
            <p>Chuyển khoản qua MoMo hoặc ngân hàng</p>
          </div>
          <div class="step-card">
            <div class="step-num">3</div>
            <h3>Nhận link</h3>
            <p>Nhận link đăng nhập Netflix tự động sau khi xác nhận</p>
          </div>
          <div class="step-card">
            <div class="step-num">4</div>
            <h3>Thưởng thức</h3>
            <p>Đăng nhập và xem phim không giới hạn!</p>
          </div>
        </div>
      </div>
    </section>
  `

  // Render plan cards
  const grid = container.querySelector('#plansGrid')
  if (grid && plans) {
    plans.forEach(plan => {
      const card = renderPlanCard(plan, (selectedPlan) => {
        if (isLoggedIn()) {
          navigate(`/payment/${selectedPlan.id}`)
        } else {
          navigate('/login')
        }
      })
      grid.appendChild(card)
    })
  }
}

