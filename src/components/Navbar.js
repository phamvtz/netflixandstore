import { isLoggedIn, isAdmin, isStaff, getUser, signOut, onAuthChange } from '../utils/auth.js'
import { navigate } from '../router.js'

export function renderNavbar() {
  const nav = document.getElementById('navbar')
  if (!nav) return

  const update = () => {
    const loggedIn = isLoggedIn()
    const admin    = isAdmin()
    const staff    = isStaff()
    const user     = getUser()
    const s        = window.__siteSettings || {}
    const siteName = s.site_name || 'Netflix Store'
    const parts    = siteName.split(' ')
    const brandMain = parts[0]
    const brandSub  = parts.slice(1).join(' ') || 'Store'

    const path   = window.location.hash.replace('#', '') || '/'
    const active = (href) =>
      path === href || (href !== '/' && path.startsWith(href)) ? ' active' : ''

    nav.innerHTML = `
      <div class="nav-inner">

        <!-- Logo -->
        <a href="#/" class="nav-logo">
          <span class="logo-text">${brandMain}</span>
          <span class="logo-sub">${brandSub}</span>
        </a>

        <!-- Center nav (desktop) -->
        <nav class="nav-center">
          <a href="#/" class="nav-link${active('/')}">Trang chủ</a>
          <a href="#/plans" class="nav-link${active('/plans')}">Bảng giá</a>
          <a href="#/tools" class="nav-link${active('/tools')}">Tiện ích</a>
          ${loggedIn ? `<a href="#/dashboard" class="nav-link${active('/dashboard')}">Tài khoản</a>` : ''}
          ${admin ? `<a href="#/admin" class="nav-link nav-staff${active('/admin')}">⚙ Admin</a>` : ''}
        </nav>

        <!-- Right section -->
        <div class="nav-right">
          ${loggedIn ? `
            <div class="nav-user-pill">
              <span class="nav-avatar">${(user?.email || 'U')[0].toUpperCase()}</span>
              <span class="nav-email">${user?.email || ''}</span>
              <button class="btn btn-sm btn-outline nav-logout-btn" id="btnLogout">Đăng xuất</button>
            </div>
          ` : `
            <a href="#/login" class="btn btn-sm btn-primary">Đăng nhập</a>
          `}
        </div>

        <!-- Mobile toggle -->
        <button class="nav-toggle" id="navToggle" aria-label="Mở menu">
          <span></span><span></span><span></span>
        </button>
      </div>

      <!-- Mobile drawer -->
      <div class="nav-drawer" id="navDrawer">
        <a href="#/" class="nav-drawer-link${active('/')}">🏠 Trang chủ</a>
        <a href="#/plans" class="nav-drawer-link${active('/plans')}">💰 Bảng giá</a>
        <a href="#/tools" class="nav-drawer-link${active('/tools')}">🧰 Tiện ích</a>
        ${loggedIn ? `<a href="#/dashboard" class="nav-drawer-link${active('/dashboard')}">📦 Tài khoản</a>` : ''}
        ${admin ? `<a href="#/admin" class="nav-drawer-link${active('/admin')}">⚙ Admin</a>` : ''}
        <div class="nav-drawer-divider"></div>
        ${loggedIn
          ? `<span class="nav-drawer-email">${user?.email || ''}</span>
             <button class="btn btn-sm btn-outline btn-block" id="btnLogoutMobile">Đăng xuất</button>`
          : `<a href="#/login" class="btn btn-primary btn-block">Đăng nhập</a>`
        }
      </div>
    `

    // Logout
    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      await signOut(); navigate('/')
    })
    document.getElementById('btnLogoutMobile')?.addEventListener('click', async () => {
      await signOut(); navigate('/')
    })

    // Mobile toggle
    const toggleBtn = document.getElementById('navToggle')
    const drawer    = document.getElementById('navDrawer')
    if (toggleBtn && drawer) {
      toggleBtn.addEventListener('click', () => {
        const open = drawer.classList.toggle('open')
        toggleBtn.classList.toggle('active', open)
        toggleBtn.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu')
      })
      // Đóng drawer khi click link
      drawer.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          drawer.classList.remove('open')
          toggleBtn.classList.remove('active')
        })
      })
    }
  }

  update()
  onAuthChange(update)
  // Re-render khi settings thay đổi (site name)
  window.addEventListener('siteSettingsLoaded', update)
}
