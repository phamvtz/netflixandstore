import { isLoggedIn, isAdmin, getUser, signOut, onAuthChange } from '../utils/auth.js'
import { navigate } from '../router.js'

/** Icon SVG gọn cho menu mobile (stroke, 24×24) */
const NI = {
  home: '<svg class="nav-drawer-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  film: '<svg class="nav-drawer-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>',
  tool: '<svg class="nav-drawer-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  book: '<svg class="nav-drawer-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  code: '<svg class="nav-drawer-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  user: '<svg class="nav-drawer-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  admin: '<svg class="nav-drawer-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
}

export function renderNavbar() {
  const nav = document.getElementById('navbar')
  if (!nav) return

  if (!nav.dataset.servicesDdInit) {
    nav.dataset.servicesDdInit = '1'
    nav.addEventListener('click', (e) => {
      const menu = nav.querySelector('#navDdMenu')
      const trigger = nav.querySelector('#navDdTrigger')
      if (e.target.closest('#navDdTrigger') && menu && trigger) {
        e.preventDefault()
        const willOpen = !menu.classList.contains('nav-dd-menu--open')
        menu.classList.toggle('nav-dd-menu--open', willOpen)
        trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false')
        return
      }
      if (e.target.closest('.nav-dd-item')) {
        menu?.classList.remove('nav-dd-menu--open')
        trigger?.setAttribute('aria-expanded', 'false')
      }
    })
    document.addEventListener('click', (e) => {
      if (e.target.closest('.nav-dd')) return
      const menu = nav.querySelector('#navDdMenu')
      const trigger = nav.querySelector('#navDdTrigger')
      menu?.classList.remove('nav-dd-menu--open')
      trigger?.setAttribute('aria-expanded', 'false')
    })
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      const menu = nav.querySelector('#navDdMenu')
      const trigger = nav.querySelector('#navDdTrigger')
      menu?.classList.remove('nav-dd-menu--open')
      trigger?.setAttribute('aria-expanded', 'false')
      const drawer = nav.querySelector('#navDrawer')
      const toggleBtn = nav.querySelector('#navToggle')
      const backdropEl = nav.querySelector('#navDrawerBackdrop')
      if (drawer?.classList.contains('open')) {
        drawer.classList.remove('open')
        backdropEl?.classList.remove('open')
        toggleBtn?.classList.remove('active')
        toggleBtn?.setAttribute('aria-expanded', 'false')
        toggleBtn?.setAttribute('aria-label', 'Mở menu')
        document.body.classList.remove('nav-drawer-open')
      }
    })
  }

  const update = () => {
    document.body.classList.remove('nav-drawer-open')
    const loggedIn = isLoggedIn()
    const admin    = isAdmin()
    const user     = getUser()
    const s        = window.__siteSettings || {}
    const siteName = s.site_name || 'Netflix Store'
    const parts    = siteName.split(' ')
    const brandMain = parts[0]
    const brandSub  = parts.slice(1).join(' ') || 'Store'

    const rawHash = window.location.hash.replace(/^#/, '') || '/'
    const path = rawHash.split('?')[0] || '/'
    const qs =   rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : ''
    const navQ = new URLSearchParams(qs)
    const planService = navQ.get('service')
    const planGroup = navQ.get('group')
    const planFilter = navQ.get('filter')

    const active = href =>
      path === href || (href !== '/' && path.startsWith(href)) ? ' active' : ''
    const onPlans = path === '/plans'
    const onProducts = path === '/products'
    const servicesNavActive = onPlans || onProducts ? ' active' : ''
    const moviesNavActive = path.startsWith('/movies') ? ' active' : ''
    const ddNetflixActive = onPlans && planService === 'netflix' && planGroup !== 'other' && planFilter !== 'free'
    const ddOtherActive = onPlans && planGroup === 'other'
    const ddFreeActive = onPlans && planFilter === 'free'

    nav.innerHTML = `
      <div class="nav-inner">

        <a href="#/" class="nav-logo">
          <span class="logo-text">${brandMain}</span>
          <span class="logo-sub">${brandSub}</span>
        </a>

        <nav class="nav-center">
          <a href="#/" class="nav-link${active('/')}">Trang chủ</a>
          <div class="nav-dd">
            <button type="button" class="nav-dd-trigger nav-link${servicesNavActive}" id="navDdTrigger"
              aria-expanded="false" aria-haspopup="true" aria-controls="navDdMenu">
              Dịch vụ <span class="nav-dd-caret" aria-hidden="true">▾</span>
            </button>
            <div class="nav-dd-menu" id="navDdMenu" role="menu" aria-labelledby="navDdTrigger">
              <a href="#/plans?service=netflix" class="nav-dd-item${ddNetflixActive ? ' nav-dd-item--current' : ''}" role="menuitem">Gói Netflix</a>
              <a href="#/plans?group=other" class="nav-dd-item${ddOtherActive ? ' nav-dd-item--current' : ''}" role="menuitem">Sản phẩm khác</a>
              <a href="#/plans?filter=free" class="nav-dd-item${ddFreeActive ? ' nav-dd-item--current' : ''}" role="menuitem">Miễn phí</a>
            </div>
          </div>
          <a href="#/movies" class="nav-link${moviesNavActive}">Gợi ý phim</a>
          <a href="#/tools" class="nav-link${active('/tools')}">Tiện ích</a>
          <a href="#/guides" class="nav-link${active('/guides')}">Hướng dẫn</a>
          ${loggedIn ? `<a href="#/dashboard" class="nav-link${active('/dashboard')}">Tài khoản</a>` : ''}
          ${admin ? `<a href="#/admin" class="nav-link nav-staff${active('/admin')}">Admin</a>` : ''}
        </nav>

        <div class="nav-cluster-desktop">
          <a href="#/api-docs" class="nav-api-pill${active('/api-docs')}" title="Tài liệu API cho dev">API</a>
          ${loggedIn ? `
            <div class="nav-user-pill">
              <span class="nav-avatar">${(user?.email || 'U')[0].toUpperCase()}</span>
              <span class="nav-email">${user?.email || ''}</span>
              <button type="button" class="btn btn-sm btn-outline nav-logout-btn" id="btnLogout">Đăng xuất</button>
            </div>
          ` : `
            <a href="#/login" class="btn btn-sm btn-primary">Đăng nhập</a>
          `}
        </div>

        <button type="button" class="nav-toggle" id="navToggle" aria-label="Mở menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>

      <div class="nav-drawer-backdrop" id="navDrawerBackdrop" aria-hidden="true"></div>
      <div class="nav-drawer" id="navDrawer" role="dialog" aria-modal="true" aria-label="Menu điều hướng">
        <div class="nav-drawer-header">
          <span class="nav-drawer-header-title">Menu</span>
          <button type="button" class="nav-drawer-close" id="navDrawerClose" aria-label="Đóng menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        ${loggedIn ? `
        <div class="nav-drawer-profile">
          <span class="nav-drawer-profile-avatar" aria-hidden="true">${(user?.email || 'U')[0].toUpperCase()}</span>
          <div class="nav-drawer-profile-meta">
            <span class="nav-drawer-profile-label">Tài khoản</span>
            <span class="nav-drawer-profile-email">${user?.email || ''}</span>
          </div>
        </div>` : ''}

        <nav class="nav-drawer-scroll" aria-label="Liên kết">
          <a href="#/" class="nav-drawer-item${active('/')}">${NI.home}<span>Trang chủ</span></a>

          <div class="nav-drawer-group">
            <span class="nav-drawer-group-label">Dịch vụ</span>
            <div class="nav-drawer-nest">
              <a href="#/products" class="nav-drawer-nest-item${onProducts ? ' active' : ''}">
                <span class="nav-drawer-dot nav-drawer-dot--muted"></span><span>Tổng quan</span>
              </a>
              <a href="#/plans?service=netflix" class="nav-drawer-nest-item${ddNetflixActive ? ' active' : ''}">
                <span class="nav-drawer-dot nav-drawer-dot--netflix"></span><span>Gói Netflix</span>
              </a>
              <a href="#/plans?group=other" class="nav-drawer-nest-item${ddOtherActive ? ' active' : ''}">
                <span class="nav-drawer-dot nav-drawer-dot--other"></span><span>Sản phẩm khác</span>
              </a>
              <a href="#/plans?filter=free" class="nav-drawer-nest-item${ddFreeActive ? ' active' : ''}">
                <span class="nav-drawer-dot nav-drawer-dot--free"></span><span>Miễn phí</span>
              </a>
            </div>
          </div>

          <a href="#/movies" class="nav-drawer-item${moviesNavActive}">${NI.film}<span>Gợi ý phim</span></a>
          <a href="#/tools" class="nav-drawer-item${active('/tools')}">${NI.tool}<span>Tiện ích</span></a>
          <a href="#/guides" class="nav-drawer-item${active('/guides')}">${NI.book}<span>Hướng dẫn</span></a>
          <a href="#/api-docs" class="nav-drawer-item${active('/api-docs')}">${NI.code}<span>Tài liệu API</span></a>
          ${loggedIn ? `<a href="#/dashboard" class="nav-drawer-item${active('/dashboard')}">${NI.user}<span>Tài khoản</span></a>` : ''}
          ${admin ? `<a href="#/admin" class="nav-drawer-item nav-drawer-item--staff${active('/admin')}">${NI.admin}<span>Admin</span></a>` : ''}
        </nav>

        <div class="nav-drawer-footer">
          ${loggedIn
            ? `<button type="button" class="btn btn-outline btn-block nav-drawer-logout" id="btnLogoutMobile">Đăng xuất</button>`
            : `<a href="#/login" class="btn btn-primary btn-block">Đăng nhập</a>`
          }
        </div>
      </div>
    `

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      await signOut(); navigate('/')
    })
    document.getElementById('btnLogoutMobile')?.addEventListener('click', async () => {
      await signOut(); navigate('/')
      closeDrawer()
    })

    const toggleBtn = document.getElementById('navToggle')
    const drawer    = document.getElementById('navDrawer')
    const backdrop  = document.getElementById('navDrawerBackdrop')
    const btnClose  = document.getElementById('navDrawerClose')

    function closeDrawer() {
      drawer?.classList.remove('open')
      backdrop?.classList.remove('open')
      toggleBtn?.classList.remove('active')
      toggleBtn?.setAttribute('aria-expanded', 'false')
      toggleBtn?.setAttribute('aria-label', 'Mở menu')
      document.body.classList.remove('nav-drawer-open')
    }
    function openDrawer() {
      drawer?.classList.add('open')
      backdrop?.classList.add('open')
      toggleBtn?.classList.add('active')
      toggleBtn?.setAttribute('aria-expanded', 'true')
      toggleBtn?.setAttribute('aria-label', 'Đóng menu')
      document.body.classList.add('nav-drawer-open')
    }

    if (toggleBtn && drawer) {
      toggleBtn.addEventListener('click', () => {
        if (drawer.classList.contains('open')) closeDrawer()
        else openDrawer()
      })
    }
    backdrop?.addEventListener('click', closeDrawer)
    btnClose?.addEventListener('click', closeDrawer)

    drawer?.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', closeDrawer)
    })
  }

  update()
  onAuthChange(update)
  window.addEventListener('siteSettingsLoaded', update)
  window.addEventListener('hashchange', update)

  const handleScroll = () => nav.classList.toggle('nav--scrolled', window.scrollY > 24)
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
}
