import { isLoggedIn, isAdmin, getUser, signOut, onAuthChange } from '../utils/auth.js'
import { navigate } from '../router.js'
import { getWalletBalance } from '../utils/api.js'

/* ── SVG Icons ───────────────────────────────────────────────── */
const IC = {
  home:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  grid:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  film:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
  tool:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  book:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  user:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  wallet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  admin:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  logout: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  code:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  chat:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>`,
  close:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  menu:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
}

/* ── Drawer host (outside #navbar to avoid backdrop-filter clip) ─ */
function getDrawerHost() {
  let el = document.getElementById('navDrawerHost')
  if (!el) {
    el = document.createElement('div')
    el.id = 'navDrawerHost'
    document.body.appendChild(el)
  }
  return el
}

function getChatFabHost() {
  let el = document.getElementById('supportChatFabHost')
  if (!el) {
    el = document.createElement('div')
    el.id = 'supportChatFabHost'
    document.body.appendChild(el)
  }
  return el
}

function closeDrawer() {
  document.getElementById('navDrawer')?.classList.remove('open')
  document.getElementById('navDrawerBackdrop')?.classList.remove('open')
  document.getElementById('navMobileToggle')?.classList.remove('active')
  document.getElementById('navMobileToggle')?.setAttribute('aria-expanded', 'false')
  document.body.classList.remove('nav-drawer-open')
}

export function renderNavbar() {
  const nav = document.getElementById('navbar')
  if (!nav) return
  const drawerHost = getDrawerHost()
  const chatFabHost = getChatFabHost()
  let walletFetchInFlight = false

  /* ── One-time event listeners ──────────────────────────────── */
  if (!nav.dataset.init) {
    nav.dataset.init = '1'

    // Dropdown
    nav.addEventListener('click', e => {
      const menu    = nav.querySelector('#navDdMenu')
      const trigger = nav.querySelector('#navDdTrigger')
      const accountMenu = nav.querySelector('#navAccountMenu')
      const accountTrigger = nav.querySelector('#navAccountTrigger')
      if (e.target.closest('#navAccountTrigger') && accountMenu) {
        e.preventDefault()
        menu?.classList.remove('open')
        trigger?.setAttribute('aria-expanded', 'false')
        const willOpen = !accountMenu.classList.contains('open')
        accountMenu.classList.toggle('open', willOpen)
        accountTrigger?.setAttribute('aria-expanded', String(willOpen))
        return
      }
      if (e.target.closest('.nav-account-item')) {
        accountMenu?.classList.remove('open')
        accountTrigger?.setAttribute('aria-expanded', 'false')
      }
      if (e.target.closest('#navDdTrigger') && menu) {
        e.preventDefault()
        accountMenu?.classList.remove('open')
        accountTrigger?.setAttribute('aria-expanded', 'false')
        const willOpen = !menu.classList.contains('open')
        menu.classList.toggle('open', willOpen)
        trigger?.setAttribute('aria-expanded', String(willOpen))
        return
      }
      if (e.target.closest('.nav-dd-item')) {
        menu?.classList.remove('open')
        trigger?.setAttribute('aria-expanded', 'false')
      }
    })

    // Close dropdown on outside click
    document.addEventListener('click', e => {
      if (e.target.closest('.nav-dd')) return
      if (e.target.closest('.nav-account')) return
      nav.querySelector('#navDdMenu')?.classList.remove('open')
      nav.querySelector('#navDdTrigger')?.setAttribute('aria-expanded', 'false')
      nav.querySelector('#navAccountMenu')?.classList.remove('open')
      nav.querySelector('#navAccountTrigger')?.setAttribute('aria-expanded', 'false')
    })

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return
      nav.querySelector('#navDdMenu')?.classList.remove('open')
      nav.querySelector('#navAccountMenu')?.classList.remove('open')
      closeDrawer()
    })
  }

  /* ── Re-render on auth/settings/route change ─────────────── */
  const update = () => {
    document.body.classList.remove('nav-drawer-open')

    const loggedIn = isLoggedIn()
    const admin    = isAdmin()
    const user     = getUser()
    const s        = window.__siteSettings || {}
    const siteName = s.site_name || 'Stream Store'
    const [brandMain, ...rest] = siteName.split(' ')
    const brandSub = rest.join(' ') || 'Store'

    const rawHash = window.location.hash.replace(/^#/, '') || '/'
    const path    = rawHash.split('?')[0] || '/'
    const qs      = rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : ''
    const q       = new URLSearchParams(qs)

    const onPlans    = path === '/plans'
    const onProducts = path === '/products'
    const isActive   = href => (path === href || (href !== '/' && path.startsWith(href))) ? ' active' : ''
    const svcActive  = (onPlans || onProducts) ? ' active' : ''
    const movActive  = path.startsWith('/movies') ? ' active' : ''
    const ddNetflixA = onPlans && q.get('service') === 'netflix' && q.get('group') !== 'other' && q.get('filter') !== 'free'
    const ddOtherA   = onPlans && q.get('group') === 'other'
    const ddFreeA    = onPlans && q.get('filter') === 'free'
    const showChatFab = !path.startsWith('/admin') && !path.startsWith('/support')

    const avatarLetter = (user?.email || 'U')[0].toUpperCase()
    const walletNumber = Number(window.__walletBalance || 0)
    const walletBal = `<span class="nav-wallet-bal">${walletNumber.toLocaleString('vi-VN')}₫</span>`
    if (loggedIn && window.__walletBalance == null && !walletFetchInFlight) {
      walletFetchInFlight = true
      getWalletBalance()
        .then((wallet) => {
          window.__walletBalance = Number(wallet?.balance || 0)
          window.dispatchEvent(new CustomEvent('walletUpdated', { detail: { balance: window.__walletBalance } }))
        })
        .catch(() => {})
        .finally(() => { walletFetchInFlight = false })
    }

    /* ── Navbar HTML ─────────────────────────────────────────── */
    nav.innerHTML = `
      <div class="nav-inner">

        <!-- Logo -->
        <a href="#/" class="nav-logo" aria-label="${siteName}">
          <span class="nav-logo-icon" aria-hidden="true">▶</span>
          <span class="nav-logo-text">${brandMain}</span>
          <span class="nav-logo-sub">${brandSub}</span>
        </a>

        <!-- Desktop center nav -->
        <nav class="nav-center" aria-label="Điều hướng chính">
          <a href="#/" class="nav-link${isActive('/')}">${IC.home}<span>Trang chủ</span></a>

          <div class="nav-dd" role="none">
            <button type="button" class="nav-link nav-dd-trigger${svcActive}" id="navDdTrigger"
              aria-expanded="false" aria-haspopup="true" aria-controls="navDdMenu">
              ${IC.grid}<span>Dịch vụ</span>
              <svg class="nav-dd-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="nav-dd-menu" id="navDdMenu" role="menu" aria-labelledby="navDdTrigger">
              <a href="#/plans?service=netflix" class="nav-dd-item${ddNetflixA ? ' current' : ''}" role="menuitem">
                <span class="nav-dd-dot" style="background:#E50914"></span>Gói Netflix
              </a>
              <a href="#/plans?group=other" class="nav-dd-item${ddOtherA ? ' current' : ''}" role="menuitem">
                <span class="nav-dd-dot" style="background:#0A84FF"></span>Dịch vụ số
              </a>
              <a href="#/plans?filter=free" class="nav-dd-item${ddFreeA ? ' current' : ''}" role="menuitem">
                <span class="nav-dd-dot" style="background:#22C55E"></span>Miễn phí
              </a>
            </div>
          </div>

          <a href="#/movies" class="nav-link${movActive}">${IC.film}<span>Gợi ý phim</span></a>
          <a href="#/tools"  class="nav-link${isActive('/tools')}">${IC.tool}<span>Tiện ích</span></a>
          <a href="#/guides" class="nav-link${isActive('/guides')}">${IC.book}<span>Hướng dẫn</span></a>
        </nav>

        <!-- Desktop right cluster -->
        <div class="nav-cluster">
          ${loggedIn ? `
            <div class="nav-account">
              <button type="button" class="nav-avatar-wrap${isActive('/dashboard') || isActive('/wallet') || isActive('/admin') ? ' active' : ''}"
                id="navAccountTrigger" aria-haspopup="true" aria-expanded="false" aria-controls="navAccountMenu"
                aria-label="Tài khoản ${user?.email || ''}">
                <span class="nav-avatar-wallet" aria-hidden="true">${IC.wallet}</span>
                <span class="nav-avatar-balance">${walletBal}</span>
                <span class="nav-avatar">${avatarLetter}</span>
              </button>
              <div class="nav-account-menu" id="navAccountMenu" role="menu" aria-labelledby="navAccountTrigger">
                <div class="nav-account-head">
                  <span class="nav-account-email">${user?.email || 'Tài khoản'}</span>
                  <span class="nav-account-wallet-line">${IC.wallet} ${walletBal}</span>
                </div>
                <a href="#/dashboard" class="nav-account-item${isActive('/dashboard')}" role="menuitem">${IC.user}<span>Tài khoản</span></a>
                <a href="#/support" class="nav-account-item${isActive('/support')}" role="menuitem">${IC.book}<span>Hỗ trợ</span></a>
                <a href="#/wallet" class="nav-account-item${isActive('/wallet')}" role="menuitem">${IC.wallet}<span>Ví của tôi</span></a>
                <a href="#/api-docs" class="nav-account-item${isActive('/api-docs')}" role="menuitem">${IC.code}<span>Tài liệu API</span></a>
                ${admin ? `<a href="#/admin" class="nav-account-item nav-account-item--admin${isActive('/admin')}" role="menuitem">${IC.admin}<span>Admin</span></a>` : ''}
                <button type="button" class="nav-account-item nav-account-logout" id="btnLogout" role="menuitem">${IC.logout}<span>Đăng xuất</span></button>
              </div>
            </div>
          ` : `
            <a href="#/api-docs" class="nav-icon-btn${isActive('/api-docs')}" title="API" aria-label="API docs">${IC.code}</a>
            <a href="#/login" class="btn btn-primary btn-sm">Đăng nhập</a>
          `}
        </div>

        <!-- Hamburger toggle (mobile) -->
        <button type="button" class="nav-hamburger" id="navToggle"
          aria-label="Mở menu" aria-expanded="false" aria-controls="navDrawer">
          ${IC.menu}
        </button>

      </div>
    `

    /* ── Mobile Drawer HTML ───────────────────────────────────── */
    drawerHost.innerHTML = `
      <div class="ndrop-backdrop" id="navDrawerBackdrop" aria-hidden="true"></div>
      <div class="ndrop" id="navDrawer" role="dialog" aria-modal="true" aria-label="Menu điều hướng">

        <div class="ndrop-header">
          <a href="#/" class="ndrop-logo" aria-label="${siteName}">
            <span class="ndrop-logo-icon" aria-hidden="true">▶</span>
            <span>${siteName}</span>
          </a>
          <button type="button" class="ndrop-close" id="navDrawerClose" aria-label="Đóng menu">${IC.close}</button>
        </div>

        ${loggedIn ? `
        <div class="ndrop-profile">
          <div class="ndrop-profile-avatar">${avatarLetter}</div>
          <div class="ndrop-profile-info">
            <div class="ndrop-profile-name">Tài khoản</div>
            <div class="ndrop-profile-email">${user?.email || ''}</div>
          </div>
          <a href="#/wallet" class="ndrop-wallet-chip">${IC.wallet} ${walletBal}</a>
        </div>` : ''}

        <nav class="ndrop-nav" aria-label="Điều hướng mobile">
          <a href="#/" class="ndrop-item${isActive('/')}">${IC.home}<span>Trang chủ</span></a>

          <div class="ndrop-group-label">Dịch vụ</div>
          <a href="#/products"            class="ndrop-item ndrop-item--sub${onProducts ? ' active' : ''}">
            <span class="ndrop-dot" style="background:#94A3B8"></span><span>Tổng quan</span>
          </a>
          <a href="#/plans?service=netflix" class="ndrop-item ndrop-item--sub${ddNetflixA ? ' active' : ''}">
            <span class="ndrop-dot" style="background:#E50914"></span><span>Gói Netflix</span>
          </a>
          <a href="#/plans?group=other"   class="ndrop-item ndrop-item--sub${ddOtherA ? ' active' : ''}">
            <span class="ndrop-dot" style="background:#0A84FF"></span><span>Dịch vụ số</span>
          </a>
          <a href="#/plans?filter=free"   class="ndrop-item ndrop-item--sub${ddFreeA ? ' active' : ''}">
            <span class="ndrop-dot" style="background:#22C55E"></span><span>Miễn phí</span>
          </a>

          <div class="ndrop-divider"></div>
          <a href="#/movies"  class="ndrop-item${movActive}">${IC.film}<span>Gợi ý phim</span></a>
          <a href="#/tools"   class="ndrop-item${isActive('/tools')}">${IC.tool}<span>Tiện ích</span></a>
          <a href="#/guides"  class="ndrop-item${isActive('/guides')}">${IC.book}<span>Hướng dẫn</span></a>
          <a href="#/api-docs" class="ndrop-item${isActive('/api-docs')}">${IC.code}<span>Tài liệu API</span></a>
          ${loggedIn ? `
            <div class="ndrop-divider"></div>
            <a href="#/dashboard" class="ndrop-item${isActive('/dashboard')}">${IC.user}<span>Tài khoản</span></a>
            <a href="#/support" class="ndrop-item${isActive('/support')}">${IC.book}<span>Hỗ trợ</span></a>
            <a href="#/wallet"    class="ndrop-item${isActive('/wallet')}">${IC.wallet}<span>Ví của tôi</span></a>
            ${admin ? `<a href="#/admin" class="ndrop-item ndrop-item--admin${isActive('/admin')}">${IC.admin}<span>Admin Panel</span></a>` : ''}
          ` : ''}
        </nav>

        <div class="ndrop-footer">
          ${loggedIn
            ? `<button type="button" class="btn btn-outline btn-block ndrop-logout" id="btnLogoutMobile">${IC.logout}<span>Đăng xuất</span></button>`
            : `<a href="#/login" class="btn btn-primary btn-block">Đăng nhập</a>`
          }
        </div>
      </div>
    `

    chatFabHost.innerHTML = showChatFab ? `
      <a class="support-chat-fab" href="${loggedIn ? '#/support' : '#/login'}" aria-label="Chat ho tro">
        <span class="support-chat-fab__icon">${IC.chat}</span>
        <span class="support-chat-fab__text">${loggedIn ? 'Chat admin' : 'Chat ho tro'}</span>
      </a>
    ` : ''

    /* ── Event bindings ─────────────────────────────────────── */
    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      await signOut(); navigate('/')
    })
    document.getElementById('btnLogoutMobile')?.addEventListener('click', async () => {
      await signOut(); navigate('/'); closeDrawer()
    })

    const toggleBtn = document.getElementById('navToggle')
    const drawer    = document.getElementById('navDrawer')
    const backdrop  = document.getElementById('navDrawerBackdrop')
    const btnClose  = document.getElementById('navDrawerClose')

    if (toggleBtn && drawer) {
      toggleBtn.addEventListener('click', () =>
        drawer.classList.contains('open') ? closeDrawer() : openDrawer()
      )
    }
    backdrop?.addEventListener('click', closeDrawer)
    btnClose?.addEventListener('click', closeDrawer)
    drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer))

    function openDrawer() {
      drawer?.classList.add('open')
      backdrop?.classList.add('open')
      toggleBtn?.classList.add('active')
      toggleBtn?.setAttribute('aria-expanded', 'true')
      toggleBtn?.setAttribute('aria-label', 'Đóng menu')
      document.body.classList.add('nav-drawer-open')
    }
    function closeDrawer() {
      drawer?.classList.remove('open')
      backdrop?.classList.remove('open')
      toggleBtn?.classList.remove('active')
      toggleBtn?.setAttribute('aria-expanded', 'false')
      toggleBtn?.setAttribute('aria-label', 'Mở menu')
      document.body.classList.remove('nav-drawer-open')
    }
  }

  update()
  onAuthChange(update)
  window.addEventListener('siteSettingsLoaded', update)
  window.addEventListener('hashchange', update)
  window.addEventListener('walletUpdated', e => {
    if (e?.detail?.balance != null) window.__walletBalance = Number(e.detail.balance || 0)
    update()
  })

  const handleScroll = () => {
    const nav = document.getElementById('navbar')
    nav?.classList.toggle('nav--scrolled', window.scrollY > 24)
  }
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
}
