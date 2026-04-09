import { signIn, signUp, resendConfirmation } from '../utils/auth.js'
import { navigate } from '../router.js'

const EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
const EYE_SHUT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`

function pwWrap(inputId, placeholder, required = true, minlength = '') {
  return `
    <div class="input-wrap">
      <input type="password" id="${inputId}" placeholder="${placeholder}" ${required ? 'required' : ''} ${minlength ? `minlength="${minlength}"` : ''}>
      <button type="button" class="input-eye" data-target="${inputId}" tabindex="-1" aria-label="Hiện/ẩn mật khẩu">${EYE_OPEN}</button>
    </div>
  `
}

// ── Màn hình chờ xác nhận email ─────────────────────────────
function showEmailConfirmUI(container, email) {
  container.innerHTML = `
    <section class="auth-section">
      <div class="auth-card" style="text-align:center;">
        <div style="font-size:56px;margin-bottom:var(--sp-4);">📧</div>
        <h1 class="auth-title" style="font-size:1.4rem;">Kiểm tra hộp thư</h1>
        <p style="color:var(--text-secondary);font-size:14px;line-height:1.7;margin-bottom:var(--sp-5);">
          Chúng tôi đã gửi email xác nhận đến<br>
          <strong style="color:var(--text-primary);">${email}</strong><br>
          Nhấn link trong email để kích hoạt tài khoản.
        </p>
        <div style="background:var(--warning-light);border:1px solid rgba(245,158,11,.3);border-radius:var(--r-lg);padding:var(--sp-4);margin-bottom:var(--sp-5);font-size:13px;color:#78350f;text-align:left;">
          <strong>💡 Không thấy email?</strong><br>
          Kiểm tra mục <strong>Spam / Junk Mail</strong> trong hộp thư của bạn.
          Hoặc nhấn nút gửi lại bên dưới.
        </div>
        <div id="resendWrap">
          <button class="btn btn-outline btn-block" id="btnResend">
            🔄 Gửi lại email xác nhận
          </button>
          <p id="resendMsg" style="font-size:13px;margin-top:var(--sp-3);min-height:20px;"></p>
        </div>
        <div style="margin-top:var(--sp-6);padding-top:var(--sp-5);border-top:1px solid var(--border);">
          <button class="btn btn-sm btn-outline" id="btnBackLogin">← Quay lại đăng nhập</button>
        </div>
      </div>
    </section>
  `

  const btnResend = container.querySelector('#btnResend')
  const resendMsg  = container.querySelector('#resendMsg')

  function startCooldown(secs) {
    btnResend.disabled = true
    let remaining = secs
    const tick = () => {
      btnResend.textContent = `🔄 Gửi lại (${remaining}s)`
      if (remaining-- > 0) setTimeout(tick, 1000)
      else {
        btnResend.disabled = false
        btnResend.textContent = '🔄 Gửi lại email xác nhận'
      }
    }
    tick()
  }

  btnResend.addEventListener('click', async () => {
    resendMsg.textContent = ''
    btnResend.disabled = true
    btnResend.innerHTML = '<span class="tc-spinner"></span> Đang gửi...'
    try {
      await resendConfirmation(email)
      resendMsg.style.color = 'var(--secondary-hover)'
      resendMsg.textContent = '✅ Đã gửi lại! Kiểm tra hộp thư (kể cả Spam).'
      startCooldown(60)
    } catch (err) {
      resendMsg.style.color = 'var(--danger)'
      resendMsg.textContent = err.message || 'Gửi thất bại. Thử lại sau.'
      btnResend.disabled = false
      btnResend.textContent = '🔄 Gửi lại email xác nhận'
    }
  })

  // Cooldown 30s ngay sau khi vừa gửi lần đầu
  startCooldown(30)

  container.querySelector('#btnBackLogin')?.addEventListener('click', () => {
    navigate('/login')
  })
}

export async function renderLogin(container) {
  container.innerHTML = `
    <section class="auth-section">
      <div class="auth-card">
        <h1 class="auth-title">Chào mừng</h1>
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Đăng nhập</button>
          <button class="auth-tab" data-tab="register">Đăng ký</button>
        </div>

        <!-- LOGIN FORM -->
        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="loginEmail" placeholder="email@example.com" required autocomplete="email">
          </div>
          <div class="form-group">
            <label>Mật khẩu</label>
            ${pwWrap('loginPassword', '••••••••')}
          </div>
          <div id="loginError" class="form-error"></div>
          <button type="submit" class="btn btn-primary btn-block" id="loginBtn">Đăng nhập</button>
        </form>

        <!-- REGISTER FORM -->
        <form id="registerForm" class="auth-form" style="display:none;">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="regEmail" placeholder="email@example.com" required autocomplete="email">
          </div>
          <div class="form-group">
            <label>Mật khẩu</label>
            ${pwWrap('regPassword', 'Ít nhất 6 ký tự', true, '6')}
          </div>
          <div class="form-group">
            <label>Xác nhận mật khẩu</label>
            ${pwWrap('regConfirm', 'Nhập lại mật khẩu', true, '6')}
          </div>
          <div id="regError" class="form-error"></div>
          <div id="regSuccess" class="form-success"></div>
          <button type="submit" class="btn btn-primary btn-block" id="regBtn">Tạo tài khoản</button>
        </form>
      </div>
    </section>
  `

  // Password toggle (eye button)
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.input-eye')
    if (!btn) return
    const inp = container.querySelector(`#${btn.dataset.target}`)
    if (!inp) return
    const show = inp.type === 'password'
    inp.type = show ? 'text' : 'password'
    btn.innerHTML = show ? EYE_SHUT : EYE_OPEN
  })

  // Tab switching
  const tabs = container.querySelectorAll('.auth-tab')
  const loginForm = container.querySelector('#loginForm')
  const registerForm = container.querySelector('#registerForm')

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const isLogin = tab.dataset.tab === 'login'
      loginForm.style.display = isLogin ? 'block' : 'none'
      registerForm.style.display = isLogin ? 'none' : 'block'
    })
  })

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = container.querySelector('#loginEmail').value.trim()
    const password = container.querySelector('#loginPassword').value
    const errorEl = container.querySelector('#loginError')
    const btn = container.querySelector('#loginBtn')

    errorEl.textContent = ''
    btn.disabled = true
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Đang đăng nhập...'

    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err) {
      const m = String(err?.message || '')
      errorEl.textContent =
        /invalid login credentials/i.test(m)  ? 'Email hoặc mật khẩu không đúng' :
        /email not confirmed/i.test(m)         ? 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.' :
        m || 'Đăng nhập thất bại.'
      window.showToast?.(errorEl.textContent, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Đăng nhập'
    }
  })

  // Register handler
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = container.querySelector('#regEmail').value.trim()
    const password = container.querySelector('#regPassword').value
    const confirm = container.querySelector('#regConfirm').value
    const errorEl = container.querySelector('#regError')
    const successEl = container.querySelector('#regSuccess')
    const btn = container.querySelector('#regBtn')

    errorEl.textContent = ''
    successEl.textContent = ''

    if (password !== confirm) {
      errorEl.textContent = 'Mật khẩu xác nhận không khớp'
      window.showToast?.('Mật khẩu xác nhận không khớp', 'warning')
      return
    }

    btn.disabled = true
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Đang đăng ký...'

    try {
      const data = await signUp(email, password)

      if (data?.session) {
        // Email confirmation tắt → session trả về ngay, vào dashboard
        navigate('/dashboard')
        return
      }

      // Email confirmation bật → hiện màn hình chờ xác nhận
      showEmailConfirmUI(container, email)

    } catch (err) {
      const m = String(err?.message || '')
      const friendly =
        /database error saving new user/i.test(m)  ? 'Không tạo được tài khoản (lỗi máy chủ). Liên hệ admin.' :
        /user already registered/i.test(m)         ? 'Email này đã được đăng ký. Hãy đăng nhập.' :
        /email not confirmed/i.test(m)             ? 'Email chưa được xác nhận. Kiểm tra hộp thư của bạn.' :
        (m || 'Đăng ký thất bại.')
      errorEl.textContent = friendly
      window.showToast?.(friendly, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Tạo tài khoản'
    }
  })
}
