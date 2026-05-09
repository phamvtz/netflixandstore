import { apiGetLink, apiCheckCookie, apiTvInit, apiTvSubmit, apiNetflixAccountInfo } from '../utils/netflix.js'

const ICON_LINK = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
const ICON_TV = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>`
const ICON_BATCH = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
const ICON_COPY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
const ICON_OK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`
const ICON_ERR = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
const ICON_EXT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
const ICON_CHEVRON = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`
const ICON_DOWNLOAD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
const ICON_FILE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`
const ICON_PHONE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`
const ICON_KEY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15 8l3 3"/><path d="M18 5l3 3"/></svg>`

export async function renderTools(container) {
  container.innerHTML = `
    <section class="tools-page">
      <div class="page-container tools-container">
        <header class="tools-header">
          <div class="tools-header-copy">
            <span class="tools-kicker">
              <span class="tools-kicker-dot"></span>
              Tiện ích Netflix
            </span>
            <h1 class="tools-title">Bộ công cụ thao tác nhanh</h1>
            <p class="tools-sub">
              Tạo link đăng nhập, đăng nhập TV bằng mã và kiểm tra cookie hàng loạt trong cùng một màn hình.
            </p>
          </div>

          <div class="tools-header-panel" aria-label="Thông tin xử lý">
            <div class="thp-item">
              <span class="thp-label">Truy cập</span>
              <strong>Không cần đăng nhập</strong>
            </div>
            <div class="thp-sep"></div>
            <div class="thp-item">
              <span class="thp-label">Dữ liệu</span>
              <strong>Không lưu cookie</strong>
            </div>
          </div>
        </header>

        <div class="tools-shell">
          <nav class="tools-picker-grid" role="tablist" aria-label="Chọn công cụ">
            <button type="button" class="tools-picker-card active" data-tool="getlink"
                    role="tab" aria-selected="true" id="toolsPickGetlink">
              <span class="tpc-active-bar"></span>
              <span class="tpc-icon tpc-icon--primary">${ICON_LINK}</span>
              <span class="tpc-body">
                <span class="tpc-num">01</span>
                <span class="tpc-title">Lấy link đăng nhập</span>
                <span class="tpc-desc">Dán cookie để tạo link nftoken mở nhanh trên trình duyệt.</span>
              </span>
              <span class="tpc-arrow">${ICON_CHEVRON}</span>
            </button>

            <button type="button" class="tools-picker-card" data-tool="tvcode"
                    role="tab" aria-selected="false" id="toolsPickTvcode">
              <span class="tpc-active-bar"></span>
              <span class="tpc-icon tpc-icon--indigo">${ICON_TV}</span>
              <span class="tpc-body">
                <span class="tpc-num">02</span>
                <span class="tpc-title">Đăng nhập TV</span>
                <span class="tpc-desc">Khởi tạo phiên bằng cookie rồi nhập mã đang hiển thị trên TV.</span>
              </span>
              <span class="tpc-arrow">${ICON_CHEVRON}</span>
            </button>

            <button type="button" class="tools-picker-card" data-tool="batch"
                    role="tab" aria-selected="false" id="toolsPickBatch">
              <span class="tpc-active-bar"></span>
              <span class="tpc-icon tpc-icon--green">${ICON_BATCH}</span>
              <span class="tpc-body">
                <span class="tpc-num">03</span>
                <span class="tpc-title">Kiểm tra hàng loạt</span>
                <span class="tpc-desc">Mỗi dòng một cookie, xuất danh sách live ra TXT hoặc CSV.</span>
              </span>
              <span class="tpc-arrow">${ICON_CHEVRON}</span>
            </button>
          </nav>

          <div class="tools-workspace" id="toolsWorkspace">
            <div class="tools-panel tools-panel--active" id="tabGetlink"
                 role="tabpanel" aria-labelledby="toolsPickGetlink">
              <div class="tools-card">
                <div class="tools-card-head">
                  <div class="tch-icon tch-icon--primary">${ICON_LINK}</div>
                  <div class="tools-card-copy">
                    <h2 class="tools-card-title">Lấy link từ cookie</h2>
                    <p class="tools-card-desc">Dán cookie Netflix hợp lệ để tạo link đăng nhập một lần.</p>
                  </div>
                  <span class="tools-card-badge">Nhanh</span>
                </div>

                <div class="form-group">
                  <label for="glCookie" class="tc-label">Cookie Netflix</label>
                  <textarea id="glCookie" class="tc-textarea" rows="7"
                    placeholder="Dán cookie Netflix vào đây...&#10;Ví dụ: NetflixId=...; SecureNetflixId=..."></textarea>
                </div>

                <div class="tools-actions">
                  <button type="button" class="btn btn-primary tc-btn" id="btnGetLink">
                    <span class="tc-btn-icon">${ICON_LINK}</span>
                    <span>Lấy link</span>
                  </button>
                </div>

                <div id="glResult" class="tools-result" hidden aria-live="polite">
                  <div id="glResultContent"></div>
                </div>
              </div>
            </div>

            <div class="tools-panel" id="tabTvcode" role="tabpanel" aria-labelledby="toolsPickTvcode" hidden>
              <div class="tools-card">
                <div class="tools-card-head">
                  <div class="tch-icon tch-icon--indigo">${ICON_TV}</div>
                  <div class="tools-card-copy">
                    <h2 class="tools-card-title">Đăng nhập TV bằng mã</h2>
                    <p class="tools-card-desc">Khởi tạo phiên bằng cookie, sau đó nhập mã xuất hiện trên màn hình TV.</p>
                  </div>
                  <span class="tools-card-badge">2 bước</span>
                </div>

                <div id="tvStep1" class="tc-step-panel">
                  <div class="tc-step">
                    <span class="tc-step-badge">Bước 1</span>
                    <span class="tc-step-label">Khởi tạo phiên</span>
                  </div>

                  <div class="form-group">
                    <label for="tvCookie" class="tc-label">Cookie Netflix</label>
                    <textarea id="tvCookie" class="tc-textarea" rows="6"
                      placeholder="Dán cookie Netflix vào đây..."></textarea>
                  </div>

                  <div class="tools-actions">
                    <button type="button" class="btn btn-primary tc-btn" id="btnTvInit">
                      <span class="tc-btn-icon">${ICON_TV}</span>
                      <span>Khởi tạo phiên</span>
                    </button>
                  </div>

                  <div id="tvInitResult" class="tools-inline-result" aria-live="polite"></div>
                </div>

                <div id="tvStep2" class="tc-step-panel tc-step-panel--next" style="display:none;">
                  <div class="tc-divider"></div>
                  <div class="tc-step">
                    <span class="tc-step-badge tc-step-badge--ok">Bước 2</span>
                    <span class="tc-step-label">Nhập mã TV</span>
                  </div>
                  <p class="tc-hint">Mã thường có 6-10 chữ số và đang hiển thị trên màn hình đăng nhập Netflix của TV.</p>

                  <div class="form-group">
                    <label for="tvCode" class="tc-label">Mã TV</label>
                    <input id="tvCode" type="text" maxlength="10" inputmode="numeric"
                           class="tc-tv-input" placeholder="000000">
                  </div>

                  <div class="tools-actions">
                    <button type="button" class="btn btn-primary tc-btn" id="btnTvSubmit">
                      <span>Gửi mã</span>
                    </button>
                    <button type="button" class="btn btn-outline" id="btnTvReset">Làm lại</button>
                  </div>

                  <div id="tvSubmitResult" class="tools-inline-result" aria-live="polite"></div>
                </div>
              </div>
            </div>

            <div class="tools-panel" id="tabBatch" role="tabpanel" aria-labelledby="toolsPickBatch" hidden>
              <div class="tools-card tools-card--wide">
                <div class="tools-card-head">
                  <div class="tch-icon tch-icon--green">${ICON_BATCH}</div>
                  <div class="tools-card-copy">
                    <h2 class="tools-card-title">Kiểm tra nhiều cookie</h2>
                    <p class="tools-card-desc">Mỗi dòng là một cookie. Kết quả có thể copy hoặc xuất file.</p>
                  </div>
                  <span class="tools-card-badge">Batch</span>
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
                    <span class="tc-pulse-dot"></span>
                    <span>Kiểm tra tất cả</span>
                  </button>
                  <button type="button" class="btn btn-outline" id="btnBatchClear">Xóa kết quả</button>
                </div>

                <div class="tc-progress-wrap" id="tcProgressWrap" style="display:none;">
                  <div class="tc-progress-bar">
                    <div class="tc-progress-fill" id="tcProgressFill" style="width:0%"></div>
                  </div>
                  <span class="tc-progress-label" id="batchProgress"></span>
                </div>

                <div id="batchResults" style="display:none;" aria-live="polite">
                  <div class="batch-summary" id="batchSummary"></div>
                  <div class="tc-batch-actions" id="tcBatchActions" style="display:none;">
                    <button type="button" class="btn btn-sm btn-outline" id="btnCopyLive">${ICON_COPY}<span>Sao chép live</span></button>
                    <button type="button" class="btn btn-sm btn-outline" id="btnExportTxt">${ICON_FILE}<span>Xuất TXT</span></button>
                    <button type="button" class="btn btn-sm btn-outline" id="btnExportCsv">${ICON_DOWNLOAD}<span>Xuất CSV</span></button>
                  </div>
                  <div class="tc-table-wrap">
                    <table class="data-table tc-table">
                      <thead>
                        <tr>
                          <th style="width:44px;">#</th>
                          <th style="width:118px;">Trạng thái</th>
                          <th>Email</th>
                          <th style="width:110px;">Gói</th>
                          <th style="width:130px;">Ngày hạn</th>
                          <th style="width:160px;">Profiles</th>
                          <th style="width:150px;">Cookie</th>
                          <th style="width:180px;">Hành động</th>
                        </tr>
                      </thead>
                      <tbody id="batchTableBody"></tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="tools-footnote">
          Cookie chỉ được gửi tới API máy chủ cho thao tác hiện tại và không được lưu lại trong giao diện này.
        </p>
      </div>
    </section>
  `

  const pickers = container.querySelectorAll('.tools-picker-card')
  const panels = {
    getlink: container.querySelector('#tabGetlink'),
    tvcode: container.querySelector('#tabTvcode'),
    batch: container.querySelector('#tabBatch')
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
      el.hidden = !on
      el.classList.toggle('tools-panel--active', on)
    })

    if (window.matchMedia?.('(max-width: 860px)').matches) {
      workspace?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  pickers.forEach(btn => btn.addEventListener('click', () => selectTool(btn.dataset.tool)))

  const glCookie = container.querySelector('#glCookie')
  const btnGetLink = container.querySelector('#btnGetLink')
  const glResult = container.querySelector('#glResult')
  const glContent = container.querySelector('#glResultContent')

  btnGetLink.addEventListener('click', async () => {
    const cookie = glCookie.value.trim()
    if (!cookie) {
      window.showToast?.('Vui lòng nhập cookie', 'warning')
      glCookie.focus()
      return
    }

    btnGetLink.disabled = true
    btnGetLink.innerHTML = `<span class="tc-spinner"></span><span>Đang lấy link...</span>`

    try {
      const data = await apiGetLink(cookie)
      glResult.hidden = false

      if (data.success && data.link) {
        const link = String(data.link)
        glContent.className = 'tc-result tc-result--ok'
        glContent.innerHTML = `
          <div class="tc-result-icon tc-result-icon--ok">${ICON_OK}</div>
          <div class="tc-result-body">
            <div class="tc-result-title">Lấy link thành công</div>
            ${data.info?.email ? `<div class="tc-result-meta">
              <span>Email: ${escapeHtml(data.info.email)}</span>
              <span>Gói: ${escapeHtml(data.info.plan || '-')}</span>
              <span>Màn hình: ${escapeHtml(data.info.screens || '-')}</span>
            </div>` : ''}
            <div class="tc-link-box">
              <span class="tc-link-text" id="glLinkText">${escapeHtml(link)}</span>
              <button type="button" class="tc-copy-btn" id="btnCopyLink" title="Copy link">
                ${ICON_COPY}<span>Copy</span>
              </button>
            </div>
            <div class="tools-result-actions">
              <a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">
                ${ICON_EXT}<span>Mở link</span>
              </a>
            </div>
          </div>
        `

        container.querySelector('#btnCopyLink')?.addEventListener('click', () => {
          navigator.clipboard.writeText(link)
          const b = container.querySelector('#btnCopyLink')
          if (!b) return
          b.innerHTML = `${ICON_OK}<span>Đã copy</span>`
          setTimeout(() => { b.innerHTML = `${ICON_COPY}<span>Copy</span>` }, 1500)
        })

        if (hasPaymentIssue(data.info) || hasPaymentIssue(data)) {
          glContent.insertAdjacentHTML('beforeend', `
            <div class="tc-payment-warn">
              ⚠️ <strong>Tài khoản đang lỗi thanh toán</strong> — vẫn đăng nhập được
              nhưng có thể bị ngắt khi đến kỳ gia hạn. Nên thông báo người dùng nạp lại.
            </div>
          `)
        }
      } else {
        glContent.className = 'tc-result tc-result--err'
        glContent.innerHTML = `
          <div class="tc-result-icon tc-result-icon--err">${ICON_ERR}</div>
          <div class="tc-result-body">
            <div class="tc-result-title">Không lấy được link</div>
            <p class="tc-result-meta">${escapeHtml(data.message || 'Cookie không hợp lệ hoặc đã hết hạn')}</p>
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
          <p class="tc-result-meta">${escapeHtml(e.message)}</p>
        </div>
      `
    }

    btnGetLink.disabled = false
    btnGetLink.innerHTML = `<span class="tc-btn-icon">${ICON_LINK}</span><span>Lấy link</span>`
  })

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

  tvCode.addEventListener('input', () => {
    tvCode.value = tvCode.value.replace(/\D/g, '').slice(0, 10)
  })

  btnTvInit.addEventListener('click', async () => {
    const cookie = tvCookie.value.trim()
    if (!cookie) {
      window.showToast?.('Vui lòng nhập cookie', 'warning')
      tvCookie.focus()
      return
    }

    btnTvInit.disabled = true
    btnTvInit.innerHTML = `<span class="tc-spinner"></span><span>Đang khởi tạo...</span>`
    tvInitResult.innerHTML = ''

    try {
      const data = await apiTvInit(cookie)
      if (data.success && data.authUrl) {
        tvAuthUrl = data.authUrl
        tvCookieVal = cookie
        tvInitResult.innerHTML = `<span class="tc-inline-ok">${ICON_OK}<span>Đã khởi tạo phiên. Nhập mã TV bên dưới.</span></span>`
        if (hasPaymentIssue(data)) {
          tvInitResult.innerHTML += `
            <span class="tc-inline-warn">⚠️ Tài khoản lỗi thanh toán — TV vẫn đăng nhập được.</span>
          `
        }
        tvStep2.style.display = 'block'
        tvCode.focus()
      } else {
        tvInitResult.innerHTML = `<span class="tc-inline-err">${ICON_ERR}<span>${escapeHtml(data.message || 'Cookie không hợp lệ')}</span></span>`
      }
    } catch (e) {
      tvInitResult.innerHTML = `<span class="tc-inline-err">${ICON_ERR}<span>Lỗi: ${escapeHtml(e.message)}</span></span>`
    }

    btnTvInit.disabled = false
    btnTvInit.innerHTML = `<span class="tc-btn-icon">${ICON_TV}</span><span>Khởi tạo phiên</span>`
  })

  btnTvSubmit.addEventListener('click', async () => {
    const code = tvCode.value.trim()
    if (!code) {
      window.showToast?.('Vui lòng nhập mã TV', 'warning')
      tvCode.focus()
      return
    }
    if (!tvAuthUrl || !tvCookieVal) {
      window.showToast?.('Vui lòng khởi tạo lại bước 1', 'warning')
      return
    }

    btnTvSubmit.disabled = true
    btnTvSubmit.innerHTML = `<span class="tc-spinner"></span><span>Đang gửi...</span>`
    tvSubmitResult.innerHTML = ''

    try {
      const data = await apiTvSubmit(tvCookieVal, tvAuthUrl, code)
      if (data.success) {
        tvSubmitResult.innerHTML = `<span class="tc-inline-ok">${ICON_OK}<span>${escapeHtml(data.message || 'Đăng nhập TV thành công')}</span></span>`
      } else {
        tvSubmitResult.innerHTML = `<span class="tc-inline-err">${ICON_ERR}<span>${escapeHtml(data.message || 'Nhập mã thất bại')}</span></span>`
      }
    } catch (e) {
      tvSubmitResult.innerHTML = `<span class="tc-inline-err">${ICON_ERR}<span>Lỗi: ${escapeHtml(e.message)}</span></span>`
    }

    btnTvSubmit.disabled = false
    btnTvSubmit.innerHTML = `<span>Gửi mã</span>`
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

  const batchCookies = container.querySelector('#batchCookies')
  const batchCount = container.querySelector('#batchCount')
  const btnBatchCheck = container.querySelector('#btnBatchCheck')
  const btnBatchClear = container.querySelector('#btnBatchClear')
  const batchProgress = container.querySelector('#batchProgress')
  const tcProgressWrap = container.querySelector('#tcProgressWrap')
  const tcProgressFill = container.querySelector('#tcProgressFill')
  const batchResults = container.querySelector('#batchResults')
  const batchSummary = container.querySelector('#batchSummary')
  const batchTableBody = container.querySelector('#batchTableBody')
  const tcBatchActions = container.querySelector('#tcBatchActions')
  const btnCopyLive = container.querySelector('#btnCopyLive')
  const btnExportTxt = container.querySelector('#btnExportTxt')
  const btnExportCsv = container.querySelector('#btnExportCsv')

  let batchRunning = false
  let liveCookies = []
  let allResults = []

  batchCookies.addEventListener('input', () => {
    const n = batchCookies.value.split('\n').filter(l => l.trim()).length
    batchCount.textContent = `${n} cookie`
    batchCount.classList.toggle('tc-count-pill--has', n > 0)
  })

  btnCopyLive.addEventListener('click', () => {
    if (!liveCookies.length) return
    navigator.clipboard.writeText(liveCookies.map(r => r.cookie).join('\n'))
    const orig = btnCopyLive.innerHTML
    btnCopyLive.innerHTML = `${ICON_OK}<span>Đã copy</span>`
    setTimeout(() => { btnCopyLive.innerHTML = orig }, 1800)
  })

  btnExportTxt.addEventListener('click', () => {
    const lines = allResults.map(r =>
      `[${batchStatusTxt(r)}] ${r.email || '-'} | ${r.plan || '-'} | ${r.billingText || '-'} | ${r.cookie}`
    )
    downloadFile('batch-check.txt', lines.join('\n'), 'text/plain')
  })

  btnExportCsv.addEventListener('click', () => {
    const header = 'STT,Trạng thái,Email,Gói,Ngày hạn,Profiles,Cookie'
    const rows = allResults.map((r, i) => {
      const status = batchStatusCsv(r)
      return [i + 1, status, r.email || '', r.plan || '', r.billingText || '', (r.profiles || []).join(' / '), r.cookie]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    })
    downloadFile('batch-check.csv', [header, ...rows].join('\n'), 'text/csv')
  })

  btnBatchCheck.addEventListener('click', async () => {
    if (batchRunning) return
    const lines = batchCookies.value.split('\n').filter(l => l.trim())
    if (!lines.length) {
      window.showToast?.('Vui lòng nhập ít nhất 1 cookie', 'warning')
      batchCookies.focus()
      return
    }

    batchRunning = true
    liveCookies = []
    allResults = []
    btnBatchCheck.disabled = true
    btnBatchCheck.innerHTML = `<span class="tc-pulse-dot tc-pulse-dot--active"></span><span>Đang kiểm tra...</span>`
    batchTableBody.innerHTML = ''
    batchResults.style.display = 'block'
    batchSummary.innerHTML = ''
    tcBatchActions.style.display = 'none'
    tcProgressWrap.style.display = 'flex'
    tcProgressFill.style.width = '0%'

    let alive = 0
    let dead = 0
    let paymentErrors = 0

    for (let i = 0; i < lines.length; i++) {
      const cookie = lines[i].trim()
      const pct = Math.round((i / lines.length) * 100)
      const preview = cookie.substring(0, 28)

      tcProgressFill.style.width = `${pct}%`
      batchProgress.textContent = `${i + 1} / ${lines.length}`

      const tr = document.createElement('tr')
      tr.id = `brow-${i}`
      tr.innerHTML = `
        <td class="tc-td-num">${i + 1}</td>
        <td><span class="tc-status tc-status--pending">Đang check</span></td>
        <td>-</td><td>-</td><td>-</td><td>-</td>
        <td class="tc-cookie-cell">${escapeHtml(preview)}...</td><td>-</td>
      `
      batchTableBody.appendChild(tr)
      tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

      try {
        const [data, acct] = await Promise.all([
          apiCheckCookie(cookie),
          apiNetflixAccountInfo(cookie)
        ])
        const row = container.querySelector(`#brow-${i}`)
        if (!row) continue

        const info = data.raw || {}
        const nftoken = info.nftoken || info.token || ''
        const loginLink = nftoken ? `https://netflix.com/?nftoken=${nftoken}` : ''
        const billingRaw = acct?.billingText || ''
        const billingShort = billingRaw.includes(':') ? billingRaw.split(':').slice(1).join(':').trim() : billingRaw
        const profiles = acct?.profiles || []
        const profilesStr = profiles.length ? profiles.join(', ') : '-'
        const planName = acct?.plan || info.plan || '-'
        const email = info.email || '-'
        const rowTitle = escapeHtml(cookie)

        const result = {
          i,
          cookie,
          alive: !!data.alive,
          hasPlan: acct?.hasPlan,
          email,
          plan: planName,
          billingText: billingShort,
          profiles,
          token: nftoken,
          link: loginLink
        }
        allResults.push(result)
        const paymentError = hasPaymentIssue(acct) || hasPaymentIssue(data) || hasPaymentIssue(data.raw)

        if (!data.alive) {
          dead++
          row.innerHTML = `
            <td class="tc-td-num">${i + 1}</td>
            <td><span class="tc-status tc-status--bad">Die</span></td>
            <td>-</td><td>-</td><td>-</td><td>-</td>
            <td class="tc-cookie-cell" title="${rowTitle}">${escapeHtml(preview)}...</td>
            <td>-</td>
          `
        } else if (acct?.reachable && !acct?.hasPlan) {
          dead++
          row.innerHTML = `
            <td class="tc-td-num">${i + 1}</td>
            <td><span class="tc-status tc-status--warn">Mất gói</span></td>
            <td class="tc-td-email" title="${escapeHtml(email)}">${escapeHtml(email)}</td>
            <td class="tc-muted-cell">-</td>
            <td class="tc-warning-cell">${escapeHtml(billingShort || '-')}</td>
            <td class="tc-profile-cell" title="${escapeHtml(profilesStr)}">${escapeHtml(profilesStr)}</td>
            <td class="tc-cookie-cell" title="${rowTitle}">${escapeHtml(preview)}...</td>
            <td>-</td>
          `
        } else if (paymentError) {
          paymentErrors++
          result.paymentError = true
          liveCookies.push(result)
          row.innerHTML = `
            <td class="tc-td-num">${i + 1}</td>
            <td><span class="tc-status tc-status--payment">Lỗi TT</span></td>
            <td class="tc-td-email" title="${escapeHtml(email)}">${escapeHtml(email)}</td>
            <td>${escapeHtml(planName)}</td>
            <td class="tc-nowrap">${escapeHtml(billingShort || '-')}</td>
            <td class="tc-profile-cell" title="${escapeHtml(profilesStr)}">${escapeHtml(profilesStr)}</td>
            <td class="tc-cookie-cell" title="${rowTitle}">${escapeHtml(preview)}...</td>
            <td>${renderBatchActions(cookie, loginLink, nftoken)}</td>
          `
        } else {
          alive++
          liveCookies.push(result)
          row.innerHTML = `
            <td class="tc-td-num">${i + 1}</td>
            <td><span class="tc-status tc-status--ok">Còn sống</span></td>
            <td class="tc-td-email" title="${escapeHtml(email)}">${escapeHtml(email)}</td>
            <td>${escapeHtml(planName)}</td>
            <td class="tc-nowrap">${escapeHtml(billingShort || '-')}</td>
            <td class="tc-profile-cell" title="${escapeHtml(profilesStr)}">${escapeHtml(profilesStr)}</td>
            <td class="tc-cookie-cell" title="${rowTitle}">${escapeHtml(preview)}...</td>
            <td>${renderBatchActions(cookie, loginLink, nftoken)}</td>
          `
        }
      } catch {
        dead++
        allResults.push({ i, cookie, alive: false })
        const row = container.querySelector(`#brow-${i}`)
        if (row) row.innerHTML = `
          <td class="tc-td-num">${i + 1}</td>
          <td><span class="tc-status tc-status--bad">Lỗi</span></td>
          <td>-</td><td>-</td><td>-</td><td>-</td>
          <td class="tc-cookie-cell" title="${escapeHtml(cookie)}">${escapeHtml(preview)}...</td>
          <td>-</td>
        `
      }

      if (i < lines.length - 1) await sleep(500)
    }

    tcProgressFill.style.width = '100%'
    const lostPlan = batchTableBody.querySelectorAll('.tc-status--warn').length
    const pureDead = dead - lostPlan
    batchProgress.textContent = `Hoàn thành - ${alive} sống${lostPlan ? ` - ${lostPlan} mất gói` : ''}${paymentErrors ? ` - ${paymentErrors} lỗi TT` : ''} - ${pureDead} die`

    batchSummary.innerHTML = `
      <div class="batch-stat">
        <div class="bs-num">${lines.length}</div>
        <div class="bs-label">Tổng</div>
      </div>
      <div class="batch-stat batch-stat--live">
        <div class="bs-num">${alive}</div>
        <div class="bs-label">Còn sống</div>
      </div>
      ${lostPlan ? `<div class="batch-stat batch-stat--warn">
        <div class="bs-num">${lostPlan}</div>
        <div class="bs-label">Mất gói</div>
      </div>` : ''}
      ${paymentErrors ? `<div class="batch-stat batch-stat--payment">
        <div class="bs-num">${paymentErrors}</div>
        <div class="bs-label">Lỗi TT</div>
      </div>` : ''}
      <div class="batch-stat batch-stat--die">
        <div class="bs-num">${pureDead}</div>
        <div class="bs-label">Die</div>
      </div>
    `

    if (allResults.length) tcBatchActions.style.display = 'flex'

    batchTableBody.querySelectorAll('.copy-cookie-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(decodeURIComponent(btn.dataset.cookie))
        btn.innerHTML = ICON_OK
        setTimeout(() => { btn.innerHTML = ICON_COPY }, 1500)
      })
    })

    batchTableBody.querySelectorAll('.open-pc-btn').forEach(btn => {
      btn.addEventListener('click', () => window.open(btn.dataset.link, '_blank', 'noopener'))
    })

    batchTableBody.querySelectorAll('.open-mobile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.link)
        window.showToast?.('Đã copy link cho mobile', 'success')
        const orig = btn.innerHTML
        btn.innerHTML = ICON_OK
        setTimeout(() => { btn.innerHTML = orig }, 1500)
      })
    })

    batchTableBody.querySelectorAll('.copy-token-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.token)
        window.showToast?.('Đã copy token', 'success')
        const orig = btn.innerHTML
        btn.innerHTML = ICON_OK
        setTimeout(() => { btn.innerHTML = orig }, 1500)
      })
    })

    batchTableBody.querySelectorAll('.batch-tv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cookie = decodeURIComponent(btn.dataset.cookie)
        selectTool('tvcode')
        const tvCookieInput = container.querySelector('#tvCookie')
        if (tvCookieInput) {
          tvCookieInput.value = cookie
          tvCookieInput.focus()
        }
        window.showToast?.('Đã điền cookie vào tab TV', 'info')
      })
    })

    batchRunning = false
    btnBatchCheck.disabled = false
    btnBatchCheck.innerHTML = `<span class="tc-pulse-dot"></span><span>Kiểm tra tất cả</span>`
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

function hasPaymentIssue(data) {
  if (!data || typeof data !== 'object') return false
  return !!(data.paymentError || data.paymentFailed || data.payment_error || data.payment_failed)
}

function batchStatusTxt(r) {
  if (hasPaymentIssue(r)) return 'LỖI TT'
  if (r.alive && r.hasPlan !== false) return 'LIVE'
  return r.alive ? 'MẤT GÓI' : 'DIE'
}

function batchStatusCsv(r) {
  if (hasPaymentIssue(r)) return 'Lỗi thanh toán'
  if (r.alive && r.hasPlan !== false) return 'Còn sống'
  return r.alive ? 'Mất gói' : 'Die'
}

function renderBatchActions(cookie, loginLink, nftoken) {
  return `
    <div class="tc-row-actions">
      ${loginLink ? `
        <button class="btn btn-xs btn-primary open-pc-btn" data-link="${escapeHtml(loginLink)}" title="Mở trên PC" aria-label="Mở trên PC">${ICON_EXT}</button>
        <button class="btn btn-xs btn-outline open-mobile-btn" data-link="${escapeHtml(loginLink)}" title="Copy link cho mobile" aria-label="Copy link cho mobile">${ICON_PHONE}</button>
        <button class="btn btn-xs btn-outline copy-token-btn" data-token="${escapeHtml(nftoken)}" title="Copy token" aria-label="Copy token">${ICON_KEY}</button>
      ` : ''}
      <button class="btn btn-xs btn-outline batch-tv-btn" data-cookie="${encodeURIComponent(cookie)}" title="Đăng nhập TV" aria-label="Đăng nhập TV">${ICON_TV}</button>
      <button class="tc-copy-sm copy-cookie-btn" data-cookie="${encodeURIComponent(cookie)}" title="Copy cookie" aria-label="Copy cookie">${ICON_COPY}</button>
    </div>
  `
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob(['\ufeff' + content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
