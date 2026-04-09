import { apiGetLink, apiCheckCookie, apiTvInit, apiTvSubmit } from '../utils/netflix.js'

const ICON_LINK = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
const ICON_TV   = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>`
const ICON_BATCH= `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
const ICON_OK   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
const ICON_ERR  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
const ICON_EXT  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`

export async function renderTools(container) {
  container.innerHTML = `
    <section class="tools-page">
      <div class="page-container">

        <!-- HEADER -->
        <header class="tools-hero">
          <span class="tools-eyebrow">Tiện ích miễn phí</span>
          <h1 class="page-title">Công cụ Netflix</h1>
          <p class="page-desc">
            Ba công cụ không cần đăng nhập — lấy link đăng nhập, kết nối TV, hay kiểm tra hàng loạt cookie.
          </p>
        </header>

        <!-- PICKER -->
        <div class="tools-picker-grid" role="tablist" aria-label="Chọn công cụ">

          <button type="button" class="tools-picker-card active" data-tool="getlink"
                  role="tab" aria-selected="true" id="toolsPickGetlink">
            <span class="tpc-active-bar"></span>
            <div class="tpc-icon tpc-icon--primary">${ICON_LINK}</div>
            <span class="tpc-num">01</span>
            <h3 class="tpc-title">Lấy link đăng nhập</h3>
            <p class="tpc-desc">Dán cookie → tạo link nftoken mở nhanh trên trình duyệt.</p>
            <span class="tpc-arrow">→</span>
          </button>

          <button type="button" class="tools-picker-card" data-tool="tvcode"
                  role="tab" aria-selected="false" id="toolsPickTvcode">
            <span class="tpc-active-bar"></span>
            <div class="tpc-icon tpc-icon--indigo">${ICON_TV}</div>
            <span class="tpc-num">02</span>
            <h3 class="tpc-title">Đăng nhập TV</h3>
            <p class="tpc-desc">Khởi tạo phiên rồi nhập mã hiển thị trên màn hình TV.</p>
            <span class="tpc-arrow">→</span>
          </button>

          <button type="button" class="tools-picker-card" data-tool="batch"
                  role="tab" aria-selected="false" id="toolsPickBatch">
            <span class="tpc-active-bar"></span>
            <div class="tpc-icon tpc-icon--violet">${ICON_BATCH}</div>
            <span class="tpc-num">03</span>
            <h3 class="tpc-title">Kiểm tra hàng loạt</h3>
            <p class="tpc-desc">Mỗi dòng một cookie — xem còn sống hay die, gói và màn hình.</p>
            <span class="tpc-arrow">→</span>
          </button>

        </div>

        <!-- WORKSPACE -->
        <div class="tools-workspace" id="toolsWorkspace">

          <!-- PANEL: GET LINK -->
          <div class="tools-panel tools-panel--active" id="tabGetlink"
               role="tabpanel" aria-labelledby="toolsPickGetlink">
            <div class="tools-card">
              <div class="tools-card-head">
                <div class="tch-icon tch-icon--primary">${ICON_LINK}</div>
                <div>
                  <h2 class="tools-card-title">Lấy link từ cookie</h2>
                  <p class="tools-card-desc">Cookie chỉ xử lý trên server — không lưu lại sau khi phiên kết thúc.</p>
                </div>
              </div>
              <div class="form-group">
                <label for="glCookie" class="tc-label">Cookie Netflix</label>
                <textarea id="glCookie" class="tc-textarea" rows="6"
                  placeholder="Dán cookie Netflix vào đây...&#10;Ví dụ: NetflixId=...; SecureNetflixId=..."></textarea>
              </div>
              <div class="tools-actions">
                <button type="button" class="btn btn-primary tc-btn" id="btnGetLink">
                  <span class="tc-btn-icon">${ICON_LINK}</span> Lấy link
                </button>
              </div>
              <div id="glResult" class="tools-result" hidden>
                <div id="glResultContent"></div>
              </div>
            </div>
          </div>

          <!-- PANEL: TV CODE -->
          <div class="tools-panel" id="tabTvcode" style="display:none;"
               role="tabpanel" aria-labelledby="toolsPickTvcode">
            <div class="tools-card">
              <div class="tools-card-head">
                <div class="tch-icon tch-icon--indigo">${ICON_TV}</div>
                <div>
                  <h2 class="tools-card-title">Đăng nhập TV bằng mã</h2>
                  <p class="tools-card-desc">Hai bước: khởi tạo phiên với cookie, sau đó nhập mã từ TV.</p>
                </div>
              </div>

              <div id="tvStep1">
                <div class="tc-step">
                  <span class="tc-step-badge">Bước 1</span>
                  <span class="tc-step-label">Khởi tạo phiên</span>
                </div>
                <div class="form-group">
                  <label for="tvCookie" class="tc-label">Cookie Netflix</label>
                  <textarea id="tvCookie" class="tc-textarea" rows="5"
                    placeholder="Dán cookie Netflix vào đây..."></textarea>
                </div>
                <div class="tools-actions">
                  <button type="button" class="btn btn-primary tc-btn" id="btnTvInit">
                    <span class="tc-btn-icon">${ICON_TV}</span> Khởi tạo phiên
                  </button>
                </div>
                <div id="tvInitResult" class="tools-inline-result"></div>
              </div>

              <div id="tvStep2" style="display:none;">
                <div class="tc-divider"></div>
                <div class="tc-step">
                  <span class="tc-step-badge tc-step-badge--ok">Bước 2</span>
                  <span class="tc-step-label">Nhập mã TV</span>
                </div>
                <p class="tc-hint">Trên TV: Netflix → Đăng nhập → nhập mã hiển thị trên màn hình.</p>
                <div class="form-group">
                  <label for="tvCode" class="tc-label">Mã TV (6–10 chữ số)</label>
                  <input id="tvCode" type="text" maxlength="10" inputmode="numeric"
                         class="tc-tv-input" placeholder="• • • • • •">
                </div>
                <div class="tools-actions">
                  <button type="button" class="btn btn-primary tc-btn" id="btnTvSubmit">
                    Gửi mã
                  </button>
                  <button type="button" class="btn btn-outline" id="btnTvReset">Làm lại</button>
                </div>
                <div id="tvSubmitResult" class="tools-inline-result"></div>
              </div>
            </div>
          </div>

          <!-- PANEL: BATCH -->
          <div class="tools-panel" id="tabBatch" style="display:none;"
               role="tabpanel" aria-labelledby="toolsPickBatch">
            <div class="tools-card">
              <div class="tools-card-head">
                <div class="tch-icon tch-icon--violet">${ICON_BATCH}</div>
                <div>
                  <h2 class="tools-card-title">Kiểm tra nhiều cookie</h2>
                  <p class="tools-card-desc">Mỗi dòng một cookie. Hệ thống gọi API tuần tự (có nghỉ giữa các lần).</p>
                </div>
              </div>

              <div class="form-group">
                <div class="tc-label-row">
                  <label for="batchCookies" class="tc-label">Danh sách cookie</label>
                  <span id="batchCount" class="tc-count-pill">0 cookie</span>
                </div>
                <textarea id="batchCookies" class="tc-textarea tc-textarea--tall" rows="10"
                  placeholder="Cookie dòng 1...&#10;Cookie dòng 2...&#10;Cookie dòng 3..."></textarea>
              </div>

              <div class="tools-actions">
                <button type="button" class="btn btn-primary tc-btn" id="btnBatchCheck">
                  <span class="tc-pulse-dot"></span> Kiểm tra tất cả
                </button>
                <button type="button" class="btn btn-outline" id="btnBatchClear">Xóa kết quả</button>
              </div>

              <div class="tc-progress-wrap" id="tcProgressWrap" style="display:none;">
                <div class="tc-progress-bar">
                  <div class="tc-progress-fill" id="tcProgressFill" style="width:0%"></div>
                </div>
                <span class="tc-progress-label" id="batchProgress"></span>
              </div>

              <div id="batchResults" style="display:none;">
                <div class="batch-summary" id="batchSummary"></div>
                <div class="tc-table-wrap">
                  <table class="data-table tc-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Trạng thái</th>
                        <th>Email</th>
                        <th>Gói</th>
                        <th>Màn</th>
                        <th>Cookie</th>
                        <th></th>
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
          Cookie do bạn nhập, xử lý qua API máy chủ và không được lưu lại sau phiên. Công cụ dùng được cho cả admin và khách.
        </p>

      </div>
    </section>
  `

  // ── Picker switching ──────────────────────────────────────────
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
      if (on) {
        el.removeAttribute('style')
        el.classList.add('tools-panel--active')
      } else {
        el.style.display = 'none'
        el.classList.remove('tools-panel--active')
      }
    })
    workspace?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  pickers.forEach(btn => btn.addEventListener('click', () => selectTool(btn.dataset.tool)))

  // ── GET LINK ──────────────────────────────────────────────────
  const glCookie  = container.querySelector('#glCookie')
  const btnGetLink = container.querySelector('#btnGetLink')
  const glResult  = container.querySelector('#glResult')
  const glContent = container.querySelector('#glResultContent')

  btnGetLink.addEventListener('click', async () => {
    const cookie = glCookie.value.trim()
    if (!cookie) { window.showToast?.('Vui lòng nhập cookie', 'warning'); glCookie.focus(); return }

    btnGetLink.disabled = true
    btnGetLink.innerHTML = `<span class="tc-spinner"></span> Đang lấy link...`

    try {
      const data = await apiGetLink(cookie)
      glResult.hidden = false

      if (data.success && data.link) {
        glContent.className = 'tc-result tc-result--ok'
        glContent.innerHTML = `
          <div class="tc-result-icon tc-result-icon--ok">${ICON_OK}</div>
          <div class="tc-result-body">
            <div class="tc-result-title">Lấy link thành công!</div>
            ${data.info?.email ? `<div class="tc-result-meta">
              <span>📧 ${data.info.email}</span>
              <span>🎬 ${data.info.plan || '—'}</span>
              <span>🖥 ${data.info.screens || '—'} màn</span>
            </div>` : ''}
            <div class="tc-link-box">
              <span class="tc-link-text" id="glLinkText">${data.link}</span>
              <button type="button" class="tc-copy-btn" id="btnCopyLink" title="Copy link">
                ${ICON_COPY} <span>Copy</span>
              </button>
            </div>
            <div class="tools-result-actions">
              <a href="${data.link}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">
                ${ICON_EXT} Mở link
              </a>
            </div>
          </div>
        `
        container.querySelector('#btnCopyLink')?.addEventListener('click', () => {
          navigator.clipboard.writeText(data.link)
          const b = container.querySelector('#btnCopyLink')
          if (b) { b.innerHTML = `${ICON_COPY} <span>Đã copy!</span>`; setTimeout(() => { b.innerHTML = `${ICON_COPY} <span>Copy</span>` }, 1500) }
        })
      } else {
        glContent.className = 'tc-result tc-result--err'
        glContent.innerHTML = `
          <div class="tc-result-icon tc-result-icon--err">${ICON_ERR}</div>
          <div class="tc-result-body">
            <div class="tc-result-title">Không lấy được link</div>
            <p class="tc-result-meta">${data.message || 'Cookie không hợp lệ hoặc đã hết hạn'}</p>
          </div>
        `
      }
    } catch (e) {
      glResult.hidden = false
      glContent.className = 'tc-result tc-result--err'
      glContent.innerHTML = `
        <div class="tc-result-icon tc-result-icon--err">${ICON_ERR}</div>
        <div class="tc-result-body">
          <div class="tc-result-title">Lỗi kết nối</div>
          <p class="tc-result-meta">${e.message}</p>
        </div>
      `
    }

    btnGetLink.disabled = false
    btnGetLink.innerHTML = `<span class="tc-btn-icon">${ICON_LINK}</span> Lấy link`
  })

  // ── TV CODE ───────────────────────────────────────────────────
  let tvAuthUrl  = null
  let tvCookieVal = null

  const tvCookie     = container.querySelector('#tvCookie')
  const btnTvInit    = container.querySelector('#btnTvInit')
  const tvInitResult = container.querySelector('#tvInitResult')
  const tvStep2      = container.querySelector('#tvStep2')
  const tvCode       = container.querySelector('#tvCode')
  const btnTvSubmit  = container.querySelector('#btnTvSubmit')
  const btnTvReset   = container.querySelector('#btnTvReset')
  const tvSubmitResult = container.querySelector('#tvSubmitResult')

  btnTvInit.addEventListener('click', async () => {
    const cookie = tvCookie.value.trim()
    if (!cookie) { window.showToast?.('Vui lòng nhập cookie', 'warning'); tvCookie.focus(); return }

    btnTvInit.disabled = true
    btnTvInit.innerHTML = `<span class="tc-spinner"></span> Đang khởi tạo...`
    tvInitResult.innerHTML = ''

    try {
      const data = await apiTvInit(cookie)
      if (data.success && data.authUrl) {
        tvAuthUrl   = data.authUrl
        tvCookieVal = cookie
        tvInitResult.innerHTML = `<span class="tc-inline-ok">${ICON_OK} Khởi tạo xong. Nhập mã TV bên dưới.</span>`
        tvStep2.style.display = 'block'
        tvCode.focus()
      } else {
        tvInitResult.innerHTML = `<span class="tc-inline-err">${ICON_ERR} ${data.message || 'Cookie không hợp lệ'}</span>`
      }
    } catch (e) {
      tvInitResult.innerHTML = `<span class="tc-inline-err">${ICON_ERR} Lỗi: ${e.message}</span>`
    }

    btnTvInit.disabled = false
    btnTvInit.innerHTML = `<span class="tc-btn-icon">${ICON_TV}</span> Khởi tạo phiên`
  })

  btnTvSubmit.addEventListener('click', async () => {
    const code = tvCode.value.trim()
    if (!code) { window.showToast?.('Vui lòng nhập mã TV', 'warning'); tvCode.focus(); return }
    if (!tvAuthUrl || !tvCookieVal) { window.showToast?.('Vui lòng khởi tạo lại bước 1', 'warning'); return }

    btnTvSubmit.disabled = true
    btnTvSubmit.innerHTML = `<span class="tc-spinner"></span> Đang gửi...`
    tvSubmitResult.innerHTML = ''

    try {
      const data = await apiTvSubmit(tvCookieVal, tvAuthUrl, code)
      if (data.success) {
        tvSubmitResult.innerHTML = `<span class="tc-inline-ok">${ICON_OK} ${data.message || 'Đăng nhập TV thành công!'}</span>`
      } else {
        tvSubmitResult.innerHTML = `<span class="tc-inline-err">${ICON_ERR} ${data.message || 'Nhập mã thất bại'}</span>`
      }
    } catch (e) {
      tvSubmitResult.innerHTML = `<span class="tc-inline-err">${ICON_ERR} Lỗi: ${e.message}</span>`
    }

    btnTvSubmit.disabled = false
    btnTvSubmit.textContent = 'Gửi mã'
  })

  btnTvReset.addEventListener('click', () => {
    tvAuthUrl = null; tvCookieVal = null
    tvCookie.value = ''; tvCode.value = ''
    tvStep2.style.display = 'none'
    tvInitResult.innerHTML = ''; tvSubmitResult.innerHTML = ''
  })

  // ── BATCH ─────────────────────────────────────────────────────
  const batchCookies  = container.querySelector('#batchCookies')
  const batchCount    = container.querySelector('#batchCount')
  const btnBatchCheck = container.querySelector('#btnBatchCheck')
  const btnBatchClear = container.querySelector('#btnBatchClear')
  const batchProgress = container.querySelector('#batchProgress')
  const tcProgressWrap= container.querySelector('#tcProgressWrap')
  const tcProgressFill= container.querySelector('#tcProgressFill')
  const batchResults  = container.querySelector('#batchResults')
  const batchSummary  = container.querySelector('#batchSummary')
  const batchTableBody= container.querySelector('#batchTableBody')

  batchCookies.addEventListener('input', () => {
    const n = batchCookies.value.split('\n').filter(l => l.trim()).length
    batchCount.textContent = `${n} cookie`
    batchCount.classList.toggle('tc-count-pill--has', n > 0)
  })

  let batchRunning = false

  btnBatchCheck.addEventListener('click', async () => {
    if (batchRunning) return
    const lines = batchCookies.value.split('\n').filter(l => l.trim())
    if (!lines.length) { window.showToast?.('Vui lòng nhập ít nhất 1 cookie', 'warning'); batchCookies.focus(); return }

    batchRunning = true
    btnBatchCheck.disabled = true
    btnBatchCheck.innerHTML = `<span class="tc-pulse-dot tc-pulse-dot--active"></span> Đang kiểm tra...`
    batchTableBody.innerHTML = ''
    batchResults.style.display = 'block'
    batchSummary.innerHTML = ''
    tcProgressWrap.style.display = 'flex'
    tcProgressFill.style.width = '0%'

    let alive = 0, dead = 0

    for (let i = 0; i < lines.length; i++) {
      const cookie = lines[i].trim()
      const pct = Math.round(((i) / lines.length) * 100)
      tcProgressFill.style.width = `${pct}%`
      batchProgress.textContent = `${i + 1} / ${lines.length}`

      const tr = document.createElement('tr')
      tr.id = `brow-${i}`
      const preview = cookie.substring(0, 40)
      tr.innerHTML = `
        <td class="tc-td-num">${i + 1}</td>
        <td><span class="tc-status tc-status--pending">Đang check</span></td>
        <td>—</td><td>—</td><td>—</td>
        <td class="tc-cookie-cell" title="${cookie.replace(/"/g, '&quot;')}">${preview}…</td>
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
          row.innerHTML = `
            <td class="tc-td-num">${i + 1}</td>
            <td><span class="tc-status tc-status--ok">Còn sống</span></td>
            <td class="tc-td-email">${info.email || '—'}</td>
            <td>${info.plan || '—'}</td>
            <td>${info.max_streams || info.screens || '—'}</td>
            <td class="tc-cookie-cell" title="${cookie.replace(/"/g, '&quot;')}">${preview}…</td>
            <td><button type="button" class="tc-copy-sm copy-cookie-btn" data-cookie="${encodeURIComponent(cookie)}">${ICON_COPY}</button></td>
          `
        } else {
          dead++
          row.innerHTML = `
            <td class="tc-td-num">${i + 1}</td>
            <td><span class="tc-status tc-status--bad">Die</span></td>
            <td>—</td><td>—</td><td>—</td>
            <td class="tc-cookie-cell" title="${cookie.replace(/"/g, '&quot;')}">${preview}…</td>
            <td>—</td>
          `
        }
      } catch {
        dead++
        const row = container.querySelector(`#brow-${i}`)
        if (row) row.innerHTML = `
          <td class="tc-td-num">${i + 1}</td>
          <td><span class="tc-status tc-status--bad">Lỗi</span></td>
          <td>—</td><td>—</td><td>—</td>
          <td class="tc-cookie-cell" title="${cookie.replace(/"/g, '&quot;')}">${preview}…</td>
          <td>—</td>
        `
      }

      if (i < lines.length - 1) await sleep(500)
    }

    tcProgressFill.style.width = '100%'
    batchProgress.textContent = `Hoàn thành · ${alive} sống · ${dead} die`

    batchSummary.innerHTML = `
      <div class="batch-stat">
        <div class="bs-num">${lines.length}</div>
        <div class="bs-label">Tổng</div>
      </div>
      <div class="batch-stat batch-stat--live">
        <div class="bs-num">${alive}</div>
        <div class="bs-label">Còn sống</div>
      </div>
      <div class="batch-stat batch-stat--die">
        <div class="bs-num">${dead}</div>
        <div class="bs-label">Die / lỗi</div>
      </div>
    `

    batchTableBody.querySelectorAll('.copy-cookie-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(decodeURIComponent(btn.dataset.cookie))
        btn.innerHTML = `✓`
        setTimeout(() => { btn.innerHTML = ICON_COPY }, 1500)
      })
    })

    batchRunning = false
    btnBatchCheck.disabled = false
    btnBatchCheck.innerHTML = `<span class="tc-pulse-dot"></span> Kiểm tra tất cả`
  })

  btnBatchClear.addEventListener('click', () => {
    batchTableBody.innerHTML = ''
    batchSummary.innerHTML = ''
    batchResults.style.display = 'none'
    tcProgressWrap.style.display = 'none'
    batchProgress.textContent = ''
    tcProgressFill.style.width = '0%'
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
