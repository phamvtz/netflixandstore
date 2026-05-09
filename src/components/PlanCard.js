import { formatVND } from '../utils/format.js'
import { getService } from '../utils/services.js'

/* ── Default features per service type ─────────────────────── */
const NETFLIX_SHARED  = ['Tài khoản dùng chung', '4K Ultra HD · HDR', 'Không quảng cáo', 'Bảo hành tự động', 'Hỗ trợ 24/7']
const NETFLIX_PRIVATE = ['Tài khoản riêng · profile + mã PIN', '4K Ultra HD · HDR', 'Không quảng cáo', 'Bảo hành tự động', 'Hỗ trợ 24/7']

/* ── Check SVG icon ─────────────────────────────────────────── */
const CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`

export function renderPlanCard(plan, onSelect, delayIndex = 0) {
  const service   = plan.service || 'netflix'
  const isNetflix = service === 'netflix'
  const type      = plan.account_type || 'shared'
  const isPrivate = type === 'private'
  const popular   = !!plan.is_popular
  const bestValue = !!plan.is_best

  /* ── Badge ── */
  let badge = ''
  if (bestValue) badge = `<span class="pc-badge pc-badge--best">Tiết kiệm nhất</span>`
  else if (popular) badge = `<span class="pc-badge pc-badge--popular">Phổ biến</span>`

  /* ── Pricing ── */
  const perDay   = plan.duration_days ? Math.round(plan.price / plan.duration_days) : 0
  const showBase = plan.base_price != null && plan.price < plan.base_price
  const discount = showBase ? Math.round((1 - plan.price / plan.base_price) * 100) : 0

  /* ── Features ── */
  let features
  if (isNetflix) {
    features = isPrivate ? NETFLIX_PRIVATE : NETFLIX_SHARED
  } else {
    const svcInfo = getService(service)
    features = svcInfo?.features || ['Kích hoạt nhanh', 'Hỗ trợ 24/7', 'Bảo hành tự động']
  }
  if (plan.duration_days) {
    features = [...features, `Bảo hành ${plan.duration_days} ngày`]
  }

  /* ── Account type pill ── */
  const typePill = isNetflix
    ? `<span class="pc-type-pill${isPrivate ? ' pc-type-pill--private' : ''}">${isPrivate ? 'Riêng tư' : 'Dùng chung'}</span>`
    : ''

  /* ── Card classes ── */
  const cls = [
    'plan-card',
    popular   ? 'plan-popular'  : '',
    bestValue ? 'plan-best'     : '',
    isPrivate ? 'plan-private'  : 'plan-shared',
  ].filter(Boolean).join(' ')

  const card = document.createElement('div')
  card.className = cls
  if (bestValue) card.dataset.highlight = '1'

  card.innerHTML = `
    ${badge}
    <div class="pc-head">
      <div class="pc-service-row">
        ${typePill}
        ${showBase ? `<span class="pc-discount-pill">-${discount}%</span>` : ''}
      </div>
      <div class="pc-name">${plan.name || plan.id}</div>
    </div>

    <div class="pc-pricing">
      <div class="pc-price-row">
        ${showBase ? `<span class="pc-base-price">${formatVND(plan.base_price)}</span>` : ''}
        <span class="pc-price">${formatVND(plan.price)}</span>
      </div>
      ${plan.duration_days ? `
        <div class="pc-duration">${plan.duration_days} ngày · ~${formatVND(perDay)}/ngày</div>
      ` : ''}
    </div>

    <ul class="pc-features" role="list">
      ${features.map(f => `
        <li class="pc-feature-item">
          <span class="pc-check" aria-hidden="true">${CHECK}</span>
          <span>${f}</span>
        </li>
      `).join('')}
    </ul>

    <div class="pc-footer">
      <button class="btn btn-primary btn-block pc-buy-btn" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        Mua ngay
      </button>
    </div>
  `

  card.querySelector('.pc-buy-btn').addEventListener('click', () => onSelect(plan))
  return card
}
