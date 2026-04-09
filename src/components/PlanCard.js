import { formatVND } from '../utils/format.js'
import { getService } from '../utils/services.js'

/* ── Netflix-specific features ─────────────────────────────── */
const NETFLIX_SHARED = [
  'Tài khoản dùng chung',
  'Full HD + 4K Ultra HD',
  'Không quảng cáo',
  'Bảo hành tự động',
  'Hỗ trợ 24/7',
]
const NETFLIX_PRIVATE = [
  'Tài khoản riêng · profile + mã PIN',
  'Full HD + 4K Ultra HD',
  'Không quảng cáo',
  'Bảo hành tự động',
  'Hỗ trợ 24/7',
]

export function renderPlanCard(plan, onSelect, delayIndex = 0) {
  const service    = plan.service || 'netflix'
  const isNetflix  = service === 'netflix'
  const type       = plan.account_type || 'shared'
  const isPrivate  = type === 'private'

  const popular   = plan.is_popular  || plan.id === 'month'
  const bestValue = plan.is_best     || plan.id === 'year'

  let topBadge = ''
  if (popular)   topBadge = '<span class="plan-badge popular">Phổ biến</span>'
  if (bestValue) topBadge = '<span class="plan-badge best">Tiết kiệm nhất</span>'

  const perDay   = plan.duration_days ? Math.round(plan.price / plan.duration_days) : 0
  const showBase = plan.base_price != null && plan.price > plan.base_price

  const delayClass = delayIndex > 0 ? ` reveal--delay-${Math.min(delayIndex, 5)}` : ''

  /* ── Features ── */
  let features
  if (isNetflix) {
    features = isPrivate ? NETFLIX_PRIVATE : NETFLIX_SHARED
  } else {
    // Other services: dùng features từ services.js config
    const svcInfo = getService(service)
    features = svcInfo?.features || ['Kích hoạt nhanh', 'Hỗ trợ 24/7', 'Bảo hành tự động']
  }

  const card = document.createElement('div')
  card.className = [
    'plan-card reveal' + delayClass,
    popular    ? 'plan-popular' : '',
    bestValue  ? 'plan-best'    : '',
    isPrivate  ? 'plan-private' : 'plan-shared',
  ].filter(Boolean).join(' ')

  card.innerHTML = `
    ${topBadge}
    <h3 class="plan-name">${plan.name || plan.id}</h3>
    ${showBase ? `<div class="plan-base-hint">Giá gốc: ${formatVND(plan.base_price)}</div>` : ''}
    <div class="plan-price">${formatVND(plan.price)}</div>
    ${plan.duration_days ? `
      <div class="plan-duration">${plan.duration_days} ngày</div>
      <div class="plan-perday">~ ${formatVND(perDay)}/ngày</div>
    ` : ''}
    <ul class="plan-features">
      ${features.map(f => `<li><span class="feat-check">✦</span> ${f}</li>`).join('')}
      ${plan.duration_days ? `<li><span class="feat-check">✦</span> Bảo hành ${plan.duration_days} ngày</li>` : ''}
    </ul>
    <button class="btn btn-primary btn-block plan-buy-btn">Mua ngay</button>
  `

  card.querySelector('.plan-buy-btn').addEventListener('click', () => onSelect(plan))
  return card
}
