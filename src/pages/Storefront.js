import { getPublicStore, getSettings } from '../utils/api.js'
import { filterPlansForStorefront } from '../utils/catalog.js'
import { renderPlanCard } from '../components/PlanCard.js'
import { isLoggedIn } from '../utils/auth.js'
import { navigate } from '../router.js'
import { setCheckoutStore } from '../utils/storeContext.js'

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

/* lighten / darken hex for gradient */
function accentBg(hex, alpha = 0.18) {
  return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${alpha})`
}
function safeAccent(raw) {
  return raw && /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw : '#5B4FD6'
}

export async function renderStorefront(container, params) {
  const slug = params.slug
  if (!slug) { navigate('/'); return }

  container.innerHTML = `
    <div class="sf-loading">
      <div class="spinner"></div>
      <p>Đang tải…</p>
    </div>`

  let bundle
  try {
    bundle = await getPublicStore(slug)
  } catch (err) {
    container.innerHTML = `
      <div class="sf-not-found">
        <div class="sf-nf-icon">🔍</div>
        <h1>Không tìm thấy</h1>
        <p>${esc(err.message)}</p>
        <a href="#/" class="btn btn-primary">Về trang chủ</a>
      </div>`
    return
  }

  const store  = bundle.store || bundle
  let plans    = bundle.plans || []
  try {
    const st = await getSettings().catch(() => ({}))
    plans = filterPlansForStorefront(plans, st)
  } catch (_) { /* giữ nguyên */ }
  const accent = safeAccent(store.theme_primary)
  const glow   = accentBg(accent, 0.22)
  const soft   = accentBg(accent, 0.08)

  document.title = `${store.display_name} — Netflix Store`
  setCheckoutStore(store)

  container.innerHTML = `
    <div class="sf-root" style="--sf-accent:${accent};--sf-glow:${glow};--sf-soft:${soft};">

      <!-- ══ HERO ══ -->
      <header class="sf-hero">
        <div class="sf-hero-bg"></div>
        <div class="sf-hero-orb sf-hero-orb-1"></div>
        <div class="sf-hero-orb sf-hero-orb-2"></div>

        <div class="page-container sf-hero-inner">

          <!-- back to platform -->
          <a href="#/" class="sf-back-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Netflix Store
          </a>

          <!-- brand -->
          <div class="sf-brand">
            <div class="sf-brand-logo">${esc((store.display_name||'S')[0].toUpperCase())}</div>
            <div>
              <h1 class="sf-brand-name">${esc(store.display_name)}</h1>
              <p class="sf-brand-tagline">${esc(store.tagline || 'Tài khoản Netflix Premium — chính hãng, bảo hành tự động')}</p>
            </div>
          </div>

          <!-- trust pills -->
          <div class="sf-trust-row">
            <span class="sf-trust-pill">✓ Kích hoạt tức thì</span>
            <span class="sf-trust-pill">✓ Bảo hành tự động</span>
            <span class="sf-trust-pill">✓ Hỗ trợ 24/7</span>
            <span class="sf-trust-pill">✓ Netflix chính hãng</span>
          </div>

          <!-- CTA -->
          <div class="sf-hero-cta">
            <a href="#sf-plans" class="btn sf-btn-accent btn-lg" id="sfScrollPlans">Xem bảng giá</a>
            ${isLoggedIn()
              ? `<a href="#/dashboard" class="btn sf-btn-ghost btn-lg">Tài khoản của tôi</a>`
              : `<a href="#/login"     class="btn sf-btn-ghost btn-lg">Đăng nhập</a>`}
          </div>

        </div>
      </header>

      <!-- ══ PLANS ══ -->
      <section class="sf-plans-section" id="sf-plans">
        <div class="page-container">
          <div class="sf-plans-header">
            <h2 class="sf-plans-title">Chọn gói phù hợp</h2>
            <p class="sf-plans-desc">Tất cả gói đều bao gồm bảo hành tự động trong suốt thời gian sử dụng.</p>
          </div>
          <div class="plans-grid" id="sfPlansGrid">
            ${Array(3).fill('<div class="skeleton plan-skeleton"></div>').join('')}
          </div>
        </div>
      </section>

      <!-- ══ HOW IT WORKS ══ -->
      <section class="sf-how">
        <div class="page-container">
          <h2 class="sf-how-title">Quy trình đơn giản</h2>
          <div class="sf-how-grid">
            <div class="sf-how-step">
              <div class="sf-how-num">1</div>
              <h3>Chọn gói</h3>
              <p>Chọn gói phù hợp với nhu cầu. Xem giá theo ngày để so sánh.</p>
            </div>
            <div class="sf-how-step">
              <div class="sf-how-num">2</div>
              <h3>Thanh toán</h3>
              <p>Chuyển khoản ngân hàng hoặc MoMo. Hệ thống tự xác nhận trong vài phút.</p>
            </div>
            <div class="sf-how-step">
              <div class="sf-how-num">3</div>
              <h3>Nhận tài khoản</h3>
              <p>Link đăng nhập Netflix gửi ngay sau khi xác nhận. Dùng được ngay.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ══ FOOTER ══ -->
      <footer class="sf-footer">
        <div class="page-container sf-footer-inner">
          <span class="sf-footer-brand">${esc(store.display_name)}</span>
          <span class="sf-footer-sep">·</span>
          <span class="sf-footer-powered">
            Hệ thống vận hành bởi <a href="#/">Netflix Store Platform</a>
          </span>
        </div>
      </footer>

    </div>
  `

  /* smooth scroll "Xem bảng giá" */
  container.querySelector('#sfScrollPlans')?.addEventListener('click', e => {
    e.preventDefault()
    container.querySelector('#sf-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  /* render plan cards */
  const grid = container.querySelector('#sfPlansGrid')
  if (grid) {
    grid.innerHTML = ''
    if (plans.length) {
      plans.forEach((plan, i) => {
        const card = renderPlanCard(plan, selected => {
          if (isLoggedIn()) navigate(`/payment/${selected.id}`)
          else navigate('/login')
        }, i)
        grid.appendChild(card)
      })
    } else {
      grid.innerHTML = `<p class="sf-empty">Chưa có gói nào được thiết lập.</p>`
    }
  }
}
