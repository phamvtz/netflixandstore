import { apiGetLink, apiCheckCookie, apiTvInit, apiTvSubmit } from '../utils/netflix.js'

export async function renderTools(container) {
  container.innerHTML = `
    <section class="tools-page">
      <div class="page-container">
        <header class="tools-hero">
          <p class="tools-eyebrow">Tiện ích</p>
          <h1 class="page-title">Công cụ Netflix</h1>
          <p class="page-desc">
            Ba công cụ miễn phí — không cần đăng nhập. Dùng cookie Netflix của bạn để lấy link, đăng nhập TV hoặc kiểm tra hàng loạt.
          </p>
        </header>

        <div class="tools-picker-grid" role="tablist" aria-label="Chọn công cụ">
          <button type="button" class="tools-picker-card active" data-tool="getlink" role="tab" aria-selected="true" id="toolsPickGetlink">
            <span class="tools-picker-badge">Gói 01</span>
            <div class="tools-picker-icon" aria-hidden="true">⎘</div>
            <h3 class="tools-picker-title">Lấy link đăng nhập</h3>
            <p class="tools-picker-desc">Dán cookie → tạo link nftoken mở nhanh trên trình duyệt.</p>
            <span class="tools-picker-cta">Chọn</span>
          </button>
          <button type="button" class="tools-picker-card" data-tool="tvcode" role="tab" aria-selected="false" id="toolsPickTvcode">
            <span class="tools-picker-badge">Gói 02</span>
            <div class="tools-picker-icon" aria-hidden="true">▣</div>
            <h3 class="tools-picker-title">Đăng nhập TV</h3>
            <p class="tools-picker-desc">Khởi tạo phiên rồi nhập mã hiển thị trên TV Netflix.</p>
            <span class="tools-picker-cta">Chọn</span>
          </button>
          <button type="button" class="tools-picker-card" data-tool="batch" role="tab" aria-selected="false" id="toolsPickBatch">
            <span class="tools-picker-badge tools-picker-badge--accent">Gói 03</span>
            <div class="tools-picker-icon" aria-hidden="true">☰</div>
            <h3 class="tools-picker-title">Kiểm tra hàng loạt</h3>
            <p class="tools-picker-desc">Mỗi dòng một cookie — xem còn sống hay die, gói và màn hình.</p>
            <span class="tools-picker-cta">Chọn</span>
          </button>
        </div>

        <div class="tools-workspace" id="toolsWorkspace">
          <div class="tools-panel tools-panel--active" id="tabGetlink" role="tabpanel" aria-labelledby="toolsPickGetlink">
            <div class="tools-card">
              <div class="tools-card-head">
                <h2 class="tools-card-title">Lấy link từ cookie</h2>
                <p class="tools-card-desc">Cookie chỉ xử lý trên trình duyệt của bạn qua API máy chủ — không lưu trong shop.</p>
              </div>
              <div class="form-group">
                <label for="glCookie">Cookie Netflix</label>
                <textarea id="glCookie" rows="6"
                  placeholder="Dán cookie Netflix vào đây...&#10;Ví dụ: NetflixId=...; SecureNetflixId=..."></textarea>
              </div>
              <div class="tools-actions">
                <button type="button" class="btn btn-primary" id="btnGetLink">Lấy link</button>
              </div>
              <div id="glResult" class="tools-result" style="display:none;">
                <div id="glResultContent"></div>
              </div>
            </div>
          </div>

          <div class="tools-panel" id="tabTvcode" style="display:none;" role="tabpanel" aria-labelledby="toolsPickTvcode">
            <div class="tools-card">
              <div class="tools-card-head">
                <h2 class="tools-card-title">Đăng nhập TV bằng mã</h2>
                <p class="tools-card-desc">Hai bước: khởi tạo phiên với cookie, sau đó nhập mã từ TV.</p>
              </div>
              <div id="tvStep1">
                <div class="tools-step">
                  <span class="tools-step-num">1</span>
                  <span class="tools-step-label">Khởi tạo</span>
                </div>
                <div class="form-group">
                  <label for="tvCookie">Cookie Netflix</label>
                  <textarea id="tvCookie" rows="5" placeholder="Dán cookie Netflix vào đây..."></textarea>
                </div>
                <div class="tools-actions">
                  <button type="button" class="btn btn-primary" id="btnTvInit">Khởi tạo phiên</button>
                </div>
                <div id="tvInitResult" class="tools-inline-result"></div>
              </div>
              <div id="tvStep2" style="display:none;">
                <div class="tools-divider"></div>
                <div class="tools-step">
                  <span class="tools-step-num tools-step-num--ok">2</span>
                  <span class="tools-step-label">Mã TV</span>
                </div>
                <p class="tools-hint">Trên TV: Netflix → Đăng nhập → nhập mã hiển thị trên màn hình.</p>
                <div class="form-group">
                  <label for="tvCode">Mã TV (6–10 chữ số)</label>
                  <input id="tvCode" type="text" maxlength="10" inputmode="numeric" class="tools-tv-input" placeholder="• • • • • •">
                </div>
                <div class="tools-actions">
                  <button type="button" class="btn btn-primary" id="btnTvSubmit">Gửi mã</button>
                  <button type="button" class="btn btn-outline" id="btnTvReset">Làm lại</button>
                </div>
                <div id="tvSubmitResult" class="tools-inline-result"></div>
              </div>
            </div>
          </div>

          <div class="tools-panel" id="tabBatch" style="display:none;" role="tabpanel" aria-labelledby="toolsPickBatch">
            <div class="tools-card">
              <div class="tools-card-head">
                <h2 class="tools-card-title">Kiểm tra nhiều cookie</h2>
                <p class="tools-card-desc">Mỗi dòng một cookie. Hệ thống gọi API tuần tự (có nghỉ giữa các lần).</p>
              </div>
              <div class="form-group">
                <label for="batchCookies">
                  Danh sách cookie
                  <span id="batchCount" class="tools-label-count">0 cookie</span>
                </label>
                <textarea id="batchCookies" rows="10"
                  placeholder="Cookie dòng 1...&#10;Cookie dòng 2..."></textarea>
              </div>
              <div class="tools-actions">
                <button type="button" class="btn btn-primary" id="btnBatchCheck">
                  <span class="tools-btn-dot"></span> Kiểm tra tất cả
                </button>
                <button type="button" class="btn btn-outline" id="btnBatchClear">Xóa kết quả</button>
                <span id="batchProgress" class="tools-progress"></span>
              </div>
              <div id="batchResults" style="display:none;">
                <div class="batch-summary" id="batchSummary"></div>
                <div class="table-responsive tools-batch-table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Trạng thái</th>
                        <th>Email</th>
                        <th>Gói</th>
                        <th>Màn hình</th>
                        <th>Cookie</th>
                        <th>Hành động</th>
                      </tr>
                    </thead>
                    <tbody id="batchTableBody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="tools-footnote">
          Công cụ hoạt động như tiện ích công khai — admin và khách đều dùng được. Cookie do bạn nhập, không lưu trên trình duyệt sau khi đóng trang (trừ khi trình duyệt tự cache form).
        </p>
      </div>
    </section>
  `

  const pickers = container.querySelectorAll('.tools-picker-card')
  const panels = {
    getlink: container.querySelector('#tabGetlink'),
    tvcode:  container.querySelector('#tabTvcode'),
    batch:   container.querySelector('#tabBatch')
  }
  const workspace = container.querySelector('#toolsWorkspace')

  function selectTool(name) {
    pickers.forEach(p => {
      const on = p.dataset.tool === name
      p.classList.toggle('active', on)
      p.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    Object.entries(panels).forEach(([key, el]) => {
      if (!el) return
      const on = key === name
      el.style.display = on ? 'block' : 'none'
      el.classList.toggle('tools-panel--active', on)
    })
    workspace?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  pickers.forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool))
  })

  // ===========================
  // GET LINK
  // ===========================
  const glCookie = container.querySelector('#glCookie')
  const btnGetLink = container.querySelector('#btnGetLink')
  const glResult = container.querySelector('#glResult')
  const glContent = container.querySelector('#glResultContent')

  btnGetLink.addEventListener('click', async () => {
    const cookie = glCookie.value.trim()
    if (!cookie) return alert('Vui lòng nhập cookie')

    btnGetLink.disabled = true
    btnGetLink.textContent = 'Đang lấy link...'

    try {
      const data = await apiGetLink(cookie)
      glResult.style.display = 'block'

      if (data.success && data.link) {
        glContent.className = 'tools-result-inner tools-result-inner--ok'
        glContent.innerHTML = `
          <div class="tools-result-head">Lấy link thành công</div>
          ${data.info?.email ? `<div class="tools-result-meta">📧 ${data.info.email} · 🎬 ${data.info.plan || '—'} · 🖥 ${data.info.screens || '—'} màn</div>` : ''}
          <div class="result-link" id="glLinkText">${data.link}</div>
          <div class="tools-result-actions">
            <button type="button" class="btn btn-sm btn-primary" id="btnCopyLink">Copy link</button>
            <a href="${data.link}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">Mở link</a>
          </div>
        `
        container.querySelector('#btnCopyLink')?.addEventListener('click', () => {
          navigator.clipboard.writeText(data.link)
          const b = container.querySelector('#btnCopyLink')
          if (b) { b.textContent = 'Đã copy!'; setTimeout(() => { b.textContent = 'Copy link' }, 1500) }
        })
      } else {
        glContent.className = 'tools-result-inner tools-result-inner--err'
        glContent.innerHTML = `<span>${data.message || 'Cookie không hợp lệ hoặc đã hết hạn'}</span>`
      }
    } catch (e) {
      glContent.className = 'tools-result-inner tools-result-inner--err'
      glContent.innerHTML = `<span>Lỗi: ${e.message}</span>`
      glResult.style.display = 'block'
    }

    btnGetLink.disabled = false
    btnGetLink.textContent = 'Lấy link'
  })

  // ===========================
  // TV CODE
  // ===========================
  let tvAuthUrl = null
  let tvCookieVal = null

  const tvCookie = container.querySelector('#tvCookie')
  const btnTvInit = container.querySelector('#btnTvInit')
  const tvInitResult = container.querySelector('#tvInitResult')
  const tvStep2 = container.querySelector('#tvStep2')
  const tvCode = container.querySelector('#tvCode')
  const btnTvSubmit = container.querySelector('#btnTvSubmit')
  const btnTvReset = container.querySelector('#btnTvReset')
  const tvSubmitResult = container.querySelector('#tvSubmitResult')

  btnTvInit.addEventListener('click', async () => {
    const cookie = tvCookie.value.trim()
    if (!cookie) return alert('Vui lòng nhập cookie')

    btnTvInit.disabled = true
    btnTvInit.textContent = 'Đang khởi tạo...'
    tvInitResult.innerHTML = ''

    try {
      const data = await apiTvInit(cookie)
      if (data.success && data.authUrl) {
        tvAuthUrl = data.authUrl
        tvCookieVal = cookie
        tvInitResult.innerHTML = `<span class="tools-msg tools-msg--ok">Khởi tạo xong. Nhập mã TV bên dưới.</span>`
        tvStep2.style.display = 'block'
        tvCode.focus()
      } else {
        tvInitResult.innerHTML = `<span class="tools-msg tools-msg--err">${data.message || 'Cookie không hợp lệ'}</span>`
      }
    } catch (e) {
      tvInitResult.innerHTML = `<span class="tools-msg tools-msg--err">Lỗi: ${e.message}</span>`
    }

    btnTvInit.disabled = false
    btnTvInit.textContent = 'Khởi tạo phiên'
  })

  btnTvSubmit.addEventListener('click', async () => {
    const code = tvCode.value.trim()
    if (!code) return alert('Vui lòng nhập mã TV')
    if (!tvAuthUrl || !tvCookieVal) return alert('Vui lòng khởi tạo lại bước 1')

    btnTvSubmit.disabled = true
    btnTvSubmit.textContent = 'Đang gửi...'
    tvSubmitResult.innerHTML = ''

    try {
      const data = await apiTvSubmit(tvCookieVal, tvAuthUrl, code)
      if (data.success) {
        tvSubmitResult.innerHTML = `<div class="tools-result-inner tools-result-inner--ok tools-result-inline">${data.message || 'Đăng nhập TV thành công!'}</div>`
      } else {
        tvSubmitResult.innerHTML = `<div class="tools-result-inner tools-result-inner--err tools-result-inline">${data.message || 'Nhập mã thất bại'}</div>`
      }
    } catch (e) {
      tvSubmitResult.innerHTML = `<span class="tools-msg tools-msg--err">Lỗi: ${e.message}</span>`
    }

    btnTvSubmit.disabled = false
    btnTvSubmit.textContent = 'Gửi mã'
  })

  btnTvReset.addEventListener('click', () => {
    tvAuthUrl = null
    tvCookieVal = null
    tvCookie.value = ''
    tvCode.value = ''
    tvStep2.style.display = 'none'
    tvInitResult.innerHTML = ''
    tvSubmitResult.innerHTML = ''
  })

  // ===========================
  // BATCH
  // ===========================
  const batchCookies = container.querySelector('#batchCookies')
  const batchCount = container.querySelector('#batchCount')
  const btnBatchCheck = container.querySelector('#btnBatchCheck')
  const btnBatchClear = container.querySelector('#btnBatchClear')
  const batchProgress = container.querySelector('#batchProgress')
  const batchResults = container.querySelector('#batchResults')
  const batchSummary = container.querySelector('#batchSummary')
  const batchTableBody = container.querySelector('#batchTableBody')

  batchCookies.addEventListener('input', () => {
    const lines = batchCookies.value.split('\n').filter(l => l.trim())
    batchCount.textContent = `${lines.length} cookie`
  })

  let batchRunning = false

  btnBatchCheck.addEventListener('click', async () => {
    if (batchRunning) return
    const lines = batchCookies.value.split('\n').filter(l => l.trim())
    if (!lines.length) return alert('Vui lòng nhập ít nhất 1 cookie')

    batchRunning = true
    btnBatchCheck.disabled = true
    btnBatchCheck.innerHTML = '<span class="tools-btn-dot tools-btn-dot--pulse"></span> Đang kiểm tra...'
    batchTableBody.innerHTML = ''
    batchResults.style.display = 'block'
    batchSummary.innerHTML = ''

    let alive = 0
    let dead = 0

    for (let i = 0; i < lines.length; i++) {
      const cookie = lines[i].trim()
      batchProgress.textContent = `${i + 1}/${lines.length}`

      const tr = document.createElement('tr')
      tr.id = `brow-${i}`
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><span class="tools-status tools-status--pending">Đang check...</span></td>
        <td>—</td><td>—</td><td>—</td>
        <td class="tools-cookie-preview" title="${cookie.replace(/"/g, '&quot;')}">${cookie.substring(0, 36)}…</td>
        <td>—</td>
      `
      batchTableBody.appendChild(tr)
      tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

      try {
        const data = await apiCheckCookie(cookie)
        const row = container.querySelector(`#brow-${i}`)
        if (!row) continue
        if (data.alive) {
          alive++
          const info = data.raw || {}
          const email = info.email || '—'
          const plan = info.plan || '—'
          const screens = info.max_streams || info.screens || '—'
          row.innerHTML = `
            <td>${i + 1}</td>
            <td><span class="tools-status tools-status--ok">Còn sống</span></td>
            <td>${email}</td>
            <td>${plan}</td>
            <td>${screens}</td>
            <td class="tools-cookie-preview" title="${cookie.replace(/"/g, '&quot;')}">${cookie.substring(0, 36)}…</td>
            <td><button type="button" class="btn btn-sm btn-primary copy-cookie-btn" data-cookie="${encodeURIComponent(cookie)}">Copy</button></td>
          `
        } else {
          dead++
          row.innerHTML = `
            <td>${i + 1}</td>
            <td><span class="tools-status tools-status--bad">Die</span></td>
            <td>—</td><td>—</td><td>—</td>
            <td class="tools-cookie-preview" title="${cookie.replace(/"/g, '&quot;')}">${cookie.substring(0, 36)}…</td>
            <td>—</td>
          `
        }
      } catch {
        dead++
        const row = container.querySelector(`#brow-${i}`)
        if (row) {
          row.innerHTML = `
            <td>${i + 1}</td>
            <td><span class="tools-status tools-status--bad">Lỗi</span></td>
            <td>—</td><td>—</td><td>—</td>
            <td class="tools-cookie-preview" title="${cookie.replace(/"/g, '&quot;')}">${cookie.substring(0, 36)}…</td>
            <td>—</td>
          `
        }
      }

      if (i < lines.length - 1) await sleep(500)
    }

    batchSummary.innerHTML = `
      <div class="batch-stat"><div class="num">${lines.length}</div><div class="label">Tổng</div></div>
      <div class="batch-stat stat-live"><div class="num">${alive}</div><div class="label">Còn sống</div></div>
      <div class="batch-stat stat-die"><div class="num">${dead}</div><div class="label">Die / lỗi</div></div>
    `
    batchProgress.textContent = `Xong · ${alive} sống · ${dead} die`

    batchTableBody.querySelectorAll('.copy-cookie-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(decodeURIComponent(btn.dataset.cookie))
        btn.textContent = 'Đã copy!'
        setTimeout(() => { btn.textContent = 'Copy' }, 1500)
      })
    })

    batchRunning = false
    btnBatchCheck.disabled = false
    btnBatchCheck.innerHTML = '<span class="tools-btn-dot"></span> Kiểm tra tất cả'
  })

  btnBatchClear.addEventListener('click', () => {
    batchTableBody.innerHTML = ''
    batchSummary.innerHTML = ''
    batchResults.style.display = 'none'
    batchProgress.textContent = ''
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
