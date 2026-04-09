import './style.css'
import { initAuth } from './utils/auth.js'
import { registerRoute, initRouter } from './router.js'
import { getSettings, getStoreByHost } from './utils/api.js'
import { setCheckoutStore } from './utils/storeContext.js'
import { renderNavbar } from './components/Navbar.js'
import { renderFooter } from './components/Footer.js'
import { renderHome } from './pages/Home.js'
import { renderPlans } from './pages/Plans.js'
import { renderLogin } from './pages/Login.js'
import { renderDashboard } from './pages/Dashboard.js'
import { renderPayment } from './pages/Payment.js'
import { renderAdmin } from './pages/Admin.js'
import { renderTools } from './pages/Tools.js'

import { renderStorefront } from './pages/Storefront.js'
import { renderApiDocs } from './pages/ApiDocs.js'
import { renderProducts } from './pages/Products.js'
import { renderGuides } from './pages/Guides.js'
import { renderMovieSuggestions } from './pages/MovieSuggestions.js'

// ── Global Toast ─────────────────────────────────────────────
const toastEl = document.createElement('div')
toastEl.id = 'global-toast'
document.body.appendChild(toastEl)

const toastStyles = document.createElement('style')
toastStyles.textContent = `
  #global-toast {
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    display: flex; flex-direction: column; gap: 10px;
    pointer-events: none;
  }
  .toast-item {
    display: flex; align-items: center; gap: 10px;
    background: #1F2937; color: #F9FAFB;
    padding: 12px 18px; border-radius: 10px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 14px; font-weight: 500;
    box-shadow: 0 8px 24px rgba(0,0,0,.2);
    pointer-events: auto;
    transform: translateX(110%);
    transition: transform .3s cubic-bezier(.34,1.56,.64,1);
    max-width: 340px;
    border-left: 3px solid #4F46E5;
  }
  .toast-item.toast-success { border-left-color: #22C55E; }
  .toast-item.toast-error   { border-left-color: #EF4444; }
  .toast-item.toast-warning { border-left-color: #F59E0B; }
  .toast-item.show          { transform: translateX(0); }
`
document.head.appendChild(toastStyles)

export function showToast(message, type = 'info', duration = 3000) {
  const item = document.createElement('div')
  item.className = `toast-item toast-${type}`
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }
  item.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`
  toastEl.appendChild(item)

  requestAnimationFrame(() => item.classList.add('show'))

  setTimeout(() => {
    item.classList.remove('show')
    item.addEventListener('transitionend', () => item.remove(), { once: true })
  }, duration)
}

// Make available globally (for inline onclick handlers)
window.showToast = showToast

// ── Apply SEO từ settings ─────────────────────────────────────
async function applySEO() {
  try {
    const s = await getSettings()
    if (!s) return
    window.__siteSettings = s
    if (s.site_title)       document.title = s.site_title
    if (s.meta_description) setMeta('description', s.meta_description)
    if (s.meta_keywords)    setMeta('keywords',     s.meta_keywords)
    if (s.site_name)        setMeta('og:site_name', s.site_name, 'property')
    // Notify Footer + Navbar để re-render với settings mới
    window.dispatchEvent(new Event('siteSettingsLoaded'))
  } catch {}
}

function setMeta(name, content, attr = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el) }
  el.setAttribute('content', content)
}

// ── Xử lý Supabase auth callback (email confirmation, password reset) ────────
function handleSupabaseAuthCallback() {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token=')) return null

  const params = new URLSearchParams(hash.slice(1))
  const type = params.get('type') // 'signup' | 'recovery' | 'email_change'

  // Xoá token khỏi URL ngay — Supabase đã đọc rồi
  window.history.replaceState(null, '', window.location.pathname)

  return type
}

// ── Tên miền riêng: Host trùng seller_stores.custom_domain → vào thẳng gian hàng ──
async function resolveCustomDomainBeforeRouter() {
  try {
    const bundle = await getStoreByHost()
    const store = bundle?.store
    if (!store?.slug) return
    window.__storeFromCustomDomain = store
    window.__storeBundle = bundle
    setCheckoutStore({ id: store.id, slug: store.slug })
    const path = window.location.hash.replace(/^#/, '') || '/'
    if (path === '/' || path === '') {
      window.location.hash = '#/s/' + encodeURIComponent(store.slug)
    }
  } catch (_) {}
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  // Detect Supabase auth callback TRƯỚC khi init (trước khi router chạy)
  const authCallbackType = handleSupabaseAuthCallback()

  await Promise.all([initAuth(), applySEO()])
  await resolveCustomDomainBeforeRouter()

  registerRoute('/', renderHome)
  registerRoute('/plans', renderPlans)
  registerRoute('/products', renderProducts)
  registerRoute('/movies', renderMovieSuggestions)
  registerRoute('/login', renderLogin)
  registerRoute('/dashboard', renderDashboard)
  registerRoute('/payment/:id', renderPayment)
  registerRoute('/admin', renderAdmin)
  registerRoute('/tools', renderTools)
  registerRoute('/guides', renderGuides)
  registerRoute('/guides/:slug', renderGuides)
  registerRoute('/s/:slug', renderStorefront)
  registerRoute('/api-docs', renderApiDocs)

  renderNavbar()
  renderFooter()

  // Xử lý sau khi router đã đăng ký routes
  if (authCallbackType === 'signup') {
    // Email confirmation thành công → vào dashboard + toast
    window.location.hash = '#/dashboard'
    setTimeout(() => showToast('✅ Email đã xác nhận! Chào mừng bạn đến với Netflix Store.', 'success', 5000), 300)
  } else if (authCallbackType === 'recovery') {
    // Password reset — về login
    window.location.hash = '#/login'
    setTimeout(() => showToast('🔑 Bạn có thể đặt lại mật khẩu ngay bây giờ.', 'info', 4000), 300)
  }
  // Luôn khởi động router (hash đã được set ở trên nếu cần)
  initRouter()
}

init().catch(err => {
  console.error('Init failed:', err)
})
