import { getUser } from '../utils/auth.js'
import { getMySupportChat, sendSupportMessage } from '../utils/api.js'
import { formatDate } from '../utils/format.js'

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderMessages(messages = []) {
  if (!messages.length) {
    return `
      <div class="support-empty">
        <h3>Chưa có tin nhắn</h3>
        <p>Gửi câu hỏi của bạn, admin sẽ phản hồi tại đây.</p>
      </div>`
  }
  return messages.map((m) => {
    const mine = m.sender === 'user'
    return `
      <div class="support-msg ${mine ? 'support-msg--mine' : 'support-msg--admin'}">
        <div class="support-msg__bubble">
          <p>${esc(m.content).replace(/\n/g, '<br>')}</p>
          <span>${mine ? 'Bạn' : 'Admin'} · ${formatDate(m.created_at)}</span>
        </div>
      </div>
    `
  }).join('')
}

export async function renderSupport(container) {
  const user = getUser()
  if (!user) return
  let timer = null

  container.innerHTML = `
    <section class="support-page">
      <div class="page-container support-shell">
        <header class="support-head">
          <div>
            <p class="dash-eyebrow">Hỗ trợ</p>
            <h1>Chat với admin</h1>
            <p>Trao đổi nhanh về đơn hàng, thanh toán hoặc tài khoản dịch vụ.</p>
          </div>
          <button type="button" class="btn btn-outline btn-sm" id="supportRefresh">Làm mới</button>
        </header>
        <div class="support-card">
          <div class="support-card__top">
            <div class="support-card__identity">
              <span class="support-card__avatar">${esc((user.email || 'U')[0].toUpperCase())}</span>
              <div>
                <strong>${esc(user.email || 'Tài khoản của bạn')}</strong>
                <small>Admin thường phản hồi trong vài phút.</small>
              </div>
            </div>
            <span id="supportStatus">Đang tải...</span>
          </div>
          <div class="support-messages" id="supportMessages"></div>
          <form class="support-compose" id="supportForm">
            <textarea id="supportInput" rows="3" maxlength="2000" placeholder="Nhập tin nhắn cho admin..."></textarea>
            <button type="submit" class="support-send-btn" aria-label="Gửi tin nhắn">Gửi</button>
          </form>
        </div>
      </div>
    </section>
  `

  const messagesEl = container.querySelector('#supportMessages')
  const statusEl = container.querySelector('#supportStatus')
  const inputEl = container.querySelector('#supportInput')
  const formEl = container.querySelector('#supportForm')

  async function load(keepScroll = false) {
    const oldBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight
    const data = await getMySupportChat()
    messagesEl.innerHTML = renderMessages(data.messages || [])
    statusEl.textContent = data.thread?.updated_at ? `Cập nhật ${formatDate(data.thread.updated_at)}` : 'Sẵn sàng'
    if (keepScroll && oldBottom > 80) {
      messagesEl.scrollTop = messagesEl.scrollHeight - messagesEl.clientHeight - oldBottom
    } else {
      messagesEl.scrollTop = messagesEl.scrollHeight
    }
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault()
    const content = inputEl.value.trim()
    if (!content) return
    const submit = formEl.querySelector('button[type="submit"]')
    submit.disabled = true
    try {
      await sendSupportMessage(content)
      inputEl.value = ''
      await load()
    } catch (err) {
      window.showToast?.(err.message || 'Không gửi được tin nhắn', 'error')
    } finally {
      submit.disabled = false
      inputEl.focus()
    }
  })

  container.querySelector('#supportRefresh')?.addEventListener('click', () => load(true).catch((err) => {
    window.showToast?.(err.message || 'Không tải được chat', 'error')
  }))

  await load()
  timer = setInterval(() => load(true).catch(() => {}), 15000)
  return () => {
    if (timer) clearInterval(timer)
  }
}
