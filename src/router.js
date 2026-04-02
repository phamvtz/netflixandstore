import { isLoggedIn, isAdmin, isStaff, onAuthChange } from './utils/auth.js'

const routes = {}
let currentCleanup = null

const PAGE_TITLES = {
  '/':          'Netflix Store — Mua tài khoản Netflix giá rẻ',
  '/plans':     'Bảng giá — Netflix Store',
  '/login':     'Đăng nhập — Netflix Store',
  '/dashboard': 'Tài khoản của tôi — Netflix Store',
  '/admin':     'Quản trị — Netflix Store',
  '/tools':     'Công cụ Netflix — Netflix Store',
  '/payment':   'Thanh toán — Netflix Store',
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
  return window.location.hash.slice(1) || '/'
}

export function getRouteParams() {
  const hash = getHashPath()
  const parts = hash.split('/')
  return parts
}

export async function handleRoute() {
  const container = document.getElementById('page')
  if (!container) return

  // Cleanup previous page
  if (currentCleanup && typeof currentCleanup === 'function') {
    currentCleanup()
    currentCleanup = null
  }

  const hash = getHashPath()

  // Route matching
  let handler = routes[hash]
  let params = {}

  if (!handler) {
    // Try pattern matching e.g. /payment/:id
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
          match = false
          break
        }
      }
      if (match) {
        handler = h
        params = extractedParams
        break
      }
    }
  }

  if (!handler) {
    container.innerHTML = `
      <div class="page-container" style="text-align:center;padding:100px 20px;">
        <h1>404</h1>
        <p>Trang không tồn tại</p>
        <a href="#/" class="btn btn-primary" style="margin-top:20px;display:inline-block;">Về trang chủ</a>
      </div>
    `
    return
  }

  // Route guards
  const protectedRoutes = ['/dashboard', '/admin', '/tools']
  const isProtected = protectedRoutes.some(r => hash.startsWith(r))

  // Đã đăng nhập → không cho vào trang login/register
  const guestOnlyRoutes = ['/login', '/register']
  if (guestOnlyRoutes.some(r => hash.startsWith(r)) && isLoggedIn()) {
    navigate('/dashboard')
    return
  }

  if (isProtected && !isLoggedIn()) {
    navigate('/login')
    return
  }

  if (hash.startsWith('/admin') && !isAdmin()) {
    // Nếu đã đăng nhập nhưng profile chưa load xong → đợi profile
    if (isLoggedIn()) {
      container.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
      await new Promise(resolve => {
        const unsub = onAuthChange(() => { unsub(); resolve() })
        // Nếu profile load trong 2s thì proceed, không thì redirect
        setTimeout(resolve, 2000)
      })
      if (!isAdmin()) { navigate('/'); return }
    } else {
      navigate('/')
      return
    }
  }

  if (hash.startsWith('/tools') && !isStaff()) {
    if (isLoggedIn()) {
      await new Promise(resolve => {
        const unsub = onAuthChange(() => { unsub(); resolve() })
        setTimeout(resolve, 2000)
      })
      if (!isStaff()) { navigate('/'); return }
    } else {
      navigate('/')
      return
    }
  }

  setPageTitle(hash)

  // Reset opacity trước — đảm bảo luôn hiển thị dù có lỗi gì
  container.style.opacity = '1'
  container.style.transform = 'none'
  container.style.transition = 'none'
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>'

  try {
    const cleanup = await handler(container, params)
    currentCleanup = cleanup
  } catch (err) {
    console.error('Route error:', err)
    container.innerHTML = `
      <div class="page-container" style="text-align:center;padding:120px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <h2 style="color:var(--text-primary);margin-bottom:8px;">Có lỗi xảy ra</h2>
        <p style="color:var(--text-secondary);margin-bottom:24px;">${err.message}</p>
        <a href="#/" class="btn btn-primary">Về trang chủ</a>
      </div>
    `
  }

  // Fade in nhẹ sau khi render xong
  container.style.transition = 'opacity .2s ease'
  container.style.opacity   = '0'
  requestAnimationFrame(() => requestAnimationFrame(() => {
    container.style.opacity = '1'
  }))
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute)
  handleRoute()
}

