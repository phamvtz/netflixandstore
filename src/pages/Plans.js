import { getPlans } from '../utils/api.js'
import { renderPlanCard } from '../components/PlanCard.js'
import { isLoggedIn } from '../utils/auth.js'
import { navigate } from '../router.js'

export async function renderPlans(container) {
  // Skeleton while loading
  container.innerHTML = `
    <section class="plans-page">
      <div class="page-container">
        <h1 class="page-title">Bảng giá Netflix Premium</h1>
        <p class="page-desc">Chọn gói phù hợp với nhu cầu của bạn. Tất cả các gói đều bao gồm bảo hành tự động.</p>
        <div class="plans-grid">
          ${Array(4).fill('<div class="plan-card plan-skeleton"></div>').join('')}
        </div>
      </div>
    </section>
    <style>
      .plan-skeleton {
        min-height: 320px;
        background: linear-gradient(90deg, var(--bg-muted) 25%, var(--border) 50%, var(--bg-muted) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s infinite;
        pointer-events: none;
      }
      @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    </style>
  `

  let plans
  try {
    plans = await getPlans()
  } catch (err) {
    container.innerHTML = `
      <section class="plans-page">
        <div class="page-container" style="text-align:center;padding:80px 20px;">
          <div style="font-size:48px;margin-bottom:16px;">😕</div>
          <h2 style="color:var(--text-primary);margin-bottom:8px;">Không tải được bảng giá</h2>
          <p style="color:var(--text-secondary);margin-bottom:24px;">${err.message}</p>
          <button class="btn btn-primary" onclick="window.location.reload()">🔄 Thử lại</button>
        </div>
      </section>
    `
    return
  }

  container.innerHTML = `
    <section class="plans-page">
      <div class="page-container">
        <h1 class="page-title">Bảng giá Netflix Premium</h1>
        <p class="page-desc">Chọn gói phù hợp với nhu cầu của bạn. Tất cả các gói đều bao gồm bảo hành tự động.</p>
        <div class="plans-grid" id="plansPageGrid"></div>
        <div class="plans-note">
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
    </section>
  `

  const grid = container.querySelector('#plansPageGrid')
  if (grid && plans?.length) {
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
  } else if (grid) {
    grid.innerHTML = `<p style="color:var(--text-secondary);grid-column:1/-1;text-align:center;padding:40px 0;">Chưa có gói nào được cấu hình.</p>`
  }
}

