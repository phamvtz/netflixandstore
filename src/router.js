import { isLoggedIn, isAdmin, onAuthChange } from './utils/auth.js'
import { observeReveal } from './utils/reveal.js'

const routes = {}
let currentCleanup = null

const PAGE_TITLES = {
  '/':          'Netflix Store — Mua tài khoản Netflix giá rẻ',
  '/plans':     'Bảng giá — Netflix Store',
  '/products':  'Dịch vụ — Netflix Store',
  '/movies':    'Gợi ý phim — Netflix Store',
  '/login':     'Đăng nhập — Netflix Store',
  '/dashboard': 'Tài khoản của tôi — Netflix Store',
  '/wallet':    'Ví của tôi — Netflix Store',
  '/admin':     'Quản trị — Netflix Store',
  '/tools':     'Tiện ích Netflix — Netflix Store',
  '/payment':   'Thanh toán — Netflix Store',
  '/s':         'Gian hàng — Netflix Store',
  '/api-docs':  'API — Netflix Store',
  '/guides':    'Hướng dẫn — Netflix Store',
}

function setPageTitle(hash) {
  const key = Object.keys(PAGE_TITLES).find(k => k !== '/' && hash.startsWith(k)) ||
              (hash === '/' ? '/' : null)
  document.title = PAGE_TITLES[key] || 'Netflix Store'
}

export function registerRoute(path, handler) {
  routes[path] = handler
}

export function navigate(path) {
  window.location.hash = path
}

export function getHashPath() {
  const raw = window.location.hash.slice(1) || '/'
  if (raw.startsWith('settings-')) {
    return `/admin?tab=settings&section=${encodeURIComponent(raw)}`
  }
  return raw.startsWith('/') ? raw : `/${raw}`
}


// Track navigation to cancel stale renders
let routeVersion = 0

export async function handleRoute() {
  const container = document.getElementById('page')
  if (!container) return

  // Increment version — nếu có route mới chạy trước khi cái này xong → bỏ qua
  const myVersion = ++routeVersion

  // 1. Cleanup trang trước
  if (currentCleanup && typeof currentCleanup === 'function') {
    currentCleanup()
    currentCleanup = null
  }

  // 2. Scroll về đầu trang ngay lập tức
  window.scrollTo({ top: 0, behavior: 'instant' })

  // 3. Strip query string trước khi match route
  const rawHash = getHashPath()
  const hash = rawHash.split('?')[0] || '/'

  // 4. Route matching
  let handler = routes[hash]
  let params = {}

  if (!handler) {
    for (const [pattern, h] of Object.entries(routes)) {
      const patternParts = pattern.split('/')
      const hashParts = hash.split('/')
      if (patternParts.length !== hashParts.length) continue

      let match = true
      const extractedParams = {}
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          extractedParams[patternParts[i].slice(1)] = hashParts[i]
        } else if (patternParts[i] !== hashParts[i]) {
          match = false; break
        }
      }
      if (match) { handler = h; params = extractedParams; break }
    }
  }

  if (!handler) {
    container.classList.remove('page-enter', 'page-exit')
    container.innerHTML = `
      <div class="page-container" style="text-align:center;padding:100px 20px;">
        <h1>404</h1>
        <p>Trang không tồn tại</p>
        <a href="#/" class="btn btn-primary" style="margin-top:20px;display:inline-block;">Về trang chủ</a>
      </div>`
    return
  }

  // 5. Route guards
  const protectedRoutes = ['/dashboard', '/wallet', '/admin', '/support']
  const isProtected = protectedRoutes.some(r => hash.startsWith(r))

  const guestOnlyRoutes = ['/login', '/register']
  if (guestOnlyRoutes.some(r => hash.startsWith(r)) && isLoggedIn()) {
    navigate('/dashboard'); return
  }
  if (isProtected && !isLoggedIn()) {
    navigate('/login'); return
  }
  if (hash.startsWith('/admin') && !isAdmin()) {
    if (isLoggedIn()) {
      container.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
      await new Promise(resolve => {
        const unsub = onAuthChange(() => { unsub(); resolve() })
        setTimeout(resolve, 2000)
      })
      if (!isAdmin()) { navigate('/'); return }
    } else {
      navigate('/'); return
    }
  }

  // 6. Nếu navigation khác đã chạy trong lúc chờ guard → bỏ qua
  if (myVersion !== routeVersion) return

  setPageTitle(hash)

  // 7. Hiện spinner ngay (không animation exit để tránh delay nội dung)
  container.classList.remove('page-enter', 'page-exit')
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>'

  // 8. Render trang
  try {
    const cleanup = await handler(container, params)
    if (myVersion !== routeVersion) return // route khác đã chạy → bỏ
    currentCleanup = cleanup
  } catch (err) {
    console.error('Route error:', err)
    if (myVersion !== routeVersion) return
    container.innerHTML = `
      <div class="page-container" style="text-align:center;padding:120px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <h2 style="color:var(--text-primary);margin-bottom:8px;">Có lỗi xảy ra</h2>
        <p style="color:var(--text-secondary);margin-bottom:24px;">${err.message}</p>
        <a href="#/" class="btn btn-primary">Về trang chủ</a>
      </div>`
  }

  // 9. Enter animation nhẹ sau khi nội dung đã có
  requestAnimationFrame(() => {
    if (myVersion !== routeVersion) return
    container.classList.add('page-enter')
    container.addEventListener('animationend', () => container.classList.remove('page-enter'), { once: true })
    observeReveal(container)
  })

  // 10. Track page view (fire and forget)
  fetch('/api/track-visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: hash }),
  }).catch(() => {})
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute)
  handleRoute()
}

