import { signIn, signUp } from '../utils/auth.js'
import { navigate } from '../router.js'

export async function renderLogin(container) {
  container.innerHTML = `
    <section class="auth-section">
      <div class="auth-card">
        <h1 class="auth-title">Đăng nhập</h1>
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Đăng nhập</button>
          <button class="auth-tab" data-tab="register">Đăng ký</button>
        </div>

        <!-- LOGIN FORM -->
        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="loginEmail" placeholder="email@example.com" required>
          </div>
          <div class="form-group">
            <label>Mật khẩu</label>
            <input type="password" id="loginPassword" placeholder="••••••••" required>
          </div>
          <div id="loginError" class="form-error"></div>
          <button type="submit" class="btn btn-primary btn-block" id="loginBtn">Đăng nhập</button>
        </form>

        <!-- REGISTER FORM -->
        <form id="registerForm" class="auth-form" style="display:none;">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="regEmail" placeholder="email@example.com" required>
          </div>
          <div class="form-group">
            <label>Mật khẩu</label>
            <input type="password" id="regPassword" placeholder="Ít nhất 6 ký tự" required minlength="6">
          </div>
          <div class="form-group">
            <label>Xác nhận mật khẩu</label>
            <input type="password" id="regConfirm" placeholder="Nhập lại mật khẩu" required minlength="6">
          </div>
          <div id="regError" class="form-error"></div>
          <div id="regSuccess" class="form-success"></div>
          <button type="submit" class="btn btn-primary btn-block" id="regBtn">Đăng ký</button>
        </form>
      </div>
    </section>
  `

  // Tab switching
  const tabs = container.querySelectorAll('.auth-tab')
  const loginForm = container.querySelector('#loginForm')
  const registerForm = container.querySelector('#registerForm')

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      if (tab.dataset.tab === 'login') {
        loginForm.style.display = 'block'
        registerForm.style.display = 'none'
      } else {
        loginForm.style.display = 'none'
        registerForm.style.display = 'block'
      }
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
    btn.textContent = 'Đang đăng nhập...'

    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err) {
      errorEl.textContent = err.message === 'Invalid login credentials'
        ? 'Email hoặc mật khẩu không đúng'
        : err.message
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
      return
    }

    btn.disabled = true
    btn.textContent = 'Đang đăng ký...'

    try {
      await signUp(email, password)
      // Email confirmation is disabled — auto login immediately
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err) {
      const m = String(err?.message || '')
      if (/database error saving new user/i.test(m)) {
        errorEl.textContent =
          'Không tạo được tài khoản (lỗi máy chủ). Nếu bạn là admin: chạy file SQL supabase/fix_signup_database_error.sql trên Supabase, rồi thử lại.'
      } else {
        errorEl.textContent = m || 'Đăng ký thất bại.'
      }
    } finally {
      btn.disabled = false
      btn.textContent = 'Đăng ký'
    }
  })
}

