import { formatVND } from '../utils/format.js'

export function renderPlanCard(plan, onSelect) {
  const popular = plan.id === 'month'
  const bestValue = plan.id === 'year'

  let badge = ''
  if (popular) badge = '<span class="plan-badge popular">Phổ biến</span>'
  if (bestValue) badge = '<span class="plan-badge best">Tiết kiệm nhất</span>'

  const perDay = Math.round(plan.price / plan.duration_days)

  const card = document.createElement('div')
  card.className = `plan-card ${popular ? 'plan-popular' : ''} ${bestValue ? 'plan-best' : ''}`
  card.innerHTML = `
    ${badge}
    <h3 class="plan-name">${plan.name || plan.id}</h3>
    <div class="plan-price">${formatVND(plan.price)}</div>
    <div class="plan-duration">${plan.duration_days} ngày</div>
    <div class="plan-perday">~ ${formatVND(perDay)}/ngày</div>
    <ul class="plan-features">
      <li><span class="feat-check">✦</span> Full HD + 4K</li>
      <li><span class="feat-check">✦</span> Không quảng cáo</li>
      <li><span class="feat-check">✦</span> Bảo hành ${plan.duration_days} ngày</li>
      <li><span class="feat-check">✦</span> Hỗ trợ 24/7</li>
    </ul>
    <button class="btn btn-primary btn-block plan-buy-btn">Mua ngay</button>
  `

  const btn = card.querySelector('.plan-buy-btn')
  btn.addEventListener('click', () => onSelect(plan))

  return card
}

