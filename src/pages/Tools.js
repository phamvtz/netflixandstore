import { getUser, isStaff } from '../utils/auth.js'
import { apiGetLink, apiCheckCookie, apiTvInit, apiTvSubmit } from '../utils/netflix.js'
import { navigate } from '../router.js'

export async function renderTools(container) {
  if (!isStaff()) { navigate('/'); return }

  container.innerHTML = `
    <section class="tools-section">
      <div class="page-container">

        <!-- Header -->
        <div class="tools-header">
          <h1 class="page-title">🛠️ Công cụ Netflix</h1>
          <p class="page-desc">Quản lý cookie, đăng nhập TV và kiểm tra hàng loạt</p>
        </div>

        <!-- Tab bar -->
        <div class="tools-tab-bar">
          <button class="tools-tab active" data-tab="getlink">
            <span class="tab-icon">🔗</span> Get Link
          </button>
          <button class="tools-tab" data-tab="tvcode">
            <span class="tab-icon">📺</span> TV Code
          </button>
          <button class="tools-tab" data-tab="batch">
            <span class="tab-icon">📦</span> Batch Check
          </button>
        </div>

        <!-- ── TAB 1: GET LINK ─────────────────────────── -->
        <div class="tools-panel" id="tabGetlink">
          <div class="tools-card">
            <div class="tools-card-header">
              <div>
                <h2 class="tools-card-title">🔗 Lấy link đăng nhập từ Cookie</h2>
                <p class="tools-card-desc">Nhập Netflix cookie để tạo link đăng nhập nhanh (nftoken)</p>
              </div>
            </div>

            <div class="form-group">
              <label>Cookie Netflix</label>
              <textarea id="glCookie" rows="6"
                placeholder="Dán cookie Netflix vào đây...&#10;Ví dụ: NetflixId=v%3D3%26ct...; SecureNetflixId=..."></textarea>
            </div>

            <div class="tools-actions">
              <button class="btn btn-primary" id="btnGetLink">🔗 Lấy Link</button>
            </div>

            <div id="glResult" class="tools-result" style="display:none;">
              <div id="glResultContent"></div>
            </div>
          </div>
        </div>

        <!-- ── TAB 2: TV CODE ─────────────────────────── -->
        <div class="tools-panel" id="tabTvcode" style="display:none;">
          <div class="tools-card">
            <div class="tools-card-header">
              <div>
                <h2 class="tools-card-title">📺 Nhập mã TV từ Cookie</h2>
                <p class="tools-card-desc">Dùng cookie để đăng nhập vào TV thông qua mã xác thực</p>
              </div>
            </div>

            <!-- Step 1 -->
            <div id="tvStep1">
              <div class="step-indicator">
                <span class="step-dot step-dot-active">1</span>
                <span class="step-label">Khởi tạo phiên</span>
              </div>
              <div class="form-group">
                <label>Cookie Netflix</label>
                <textarea id="tvCookie" rows="5" placeholder="Dán cookie Netflix vào đây..."></textarea>
              </div>
              <div class="tools-actions">
                <button class="btn btn-primary" id="btnTvInit">🚀 Khởi tạo</button>
              </div>
              <div id="tvInitResult" class="tools-inline-result"></div>
            </div>

            <!-- Step 2 -->
            <div id="tvStep2" style="display:none;">
              <div class="tools-divider"></div>
              <div class="step-indicator">
                <span class="step-dot step-dot-green">2</span>
                <span class="step-label">Nhập mã TV</span>
              </div>
              <p class="tools-hint">Mở Netflix trên TV → Đăng nhập → Nhập mã xuất hiện trên màn hình</p>
              <div class="form-group">
                <label>Mã TV (4–8 chữ số)</label>
                <input id="tvCode" type="text" maxlength="8"
                  placeholder="1 2 3 4 5 6"
                  class="tv-code-input-field">
              </div>
              <div class="tools-actions">
                <button class="btn btn-primary" id="btnTvSubmit">✅ Gửi mã TV</button>
                <button class="btn btn-outline" id="btnTvReset">↩ Làm lại từ đầu</button>
              </div>
              <div id="tvSubmitResult" class="tools-inline-result"></div>
            </div>
          </div>
        </div>

        <!-- ── TAB 3: BATCH CHECK ─────────────────────── -->
        <div class="tools-panel" id="tabBatch" style="display:none;">
          <div class="tools-card">
            <div class="tools-card-header">
              <div>
                <h2 class="tools-card-title">📦 Kiểm tra nhiều Cookie cùng lúc</h2>
                <p class="tools-card-desc">Mỗi dòng 1 cookie — hệ thống kiểm tra tuần tự và hiển thị kết quả</p>
              </div>
            </div>

            <div class="form-group">
              <label>
                Danh sách Cookie
                <span id="batchCount" class="label-badge">0 cookie</span>
              </label>
              <textarea id="batchCookies" rows="10"
                placeholder="Cookie 1...&#10;Cookie 2...&#10;Cookie 3...&#10;(mỗi dòng 1 cookie)"></textarea>
            </div>

            <div class="tools-actions">
              <button class="btn btn-primary" id="btnBatchCheck">
                <span class="btn-dot"></span> Kiểm tra tất cả
              </button>
              <button class="btn btn-outline" id="btnBatchClear">🗑️ Xoá kết quả</button>
              <span id="batchProgress" class="progress-text"></span>
            </div>

            <!-- Results -->
            <div id="batchResults" style="display:none;">
              <div class="batch-summary" id="batchSummary"></div>
              <div class="table-responsive" style="margin-top:16px;">
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
    </section>

    <style>
      /* ── Layout ── */
      .tools-section { padding: 88px 0 64px; min-height: 100vh; background: var(--bg); }
      .tools-header  { margin-bottom: 24px; }

      /* ── Tab bar ── */
      .tools-tab-bar {
        display: flex;
        gap: 4px;
        background: var(--bg-muted);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 4px;
        margin-bottom: 24px;
        width: fit-content;
      }
      .tools-tab {
        display: flex; align-items: center; gap: 6px;
        padding: 8px 18px;
        background: none; border: none;
        color: var(--text-secondary);
        font-family: var(--font); font-size: 14px; font-weight: 600;
        border-radius: 7px; cursor: pointer;
        transition: var(--ease);
      }
      .tools-tab:hover  { color: var(--primary); background: var(--bg-white); }
      .tools-tab.active { background: var(--bg-white); color: var(--primary); box-shadow: var(--shadow-sm); }
      .tab-icon { font-size: 15px; }

      /* ── Card ── */
      .tools-card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 32px;
        box-shadow: var(--shadow-sm);
        max-width: 760px;
      }
      .tools-card-header { margin-bottom: 24px; }
      .tools-card-title  { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
      .tools-card-desc   { font-size: 14px; color: var(--text-secondary); }

      /* ── Panel ── */
      .tools-panel { animation: fadeInUp .2s ease both; }

      /* ── Actions row ── */
      .tools-actions {
        display: flex; gap: 10px; align-items: center;
        flex-wrap: wrap; margin-top: 16px; margin-bottom: 4px;
      }

      /* ── Step indicator ── */
      .step-indicator {
        display: flex; align-items: center; gap: 10px;
        margin-bottom: 16px;
      }
      .step-dot {
        width: 28px; height: 28px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700;
        background: var(--primary-light); color: var(--primary);
        border: 2px solid var(--primary);
        flex-shrink: 0;
      }
      .step-dot-green { background: var(--secondary-light); color: var(--secondary-hover); border-color: var(--secondary); }
      .step-label { font-size: 13px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: .5px; }

      .tools-divider { border: none; border-top: 1px dashed var(--border); margin: 28px 0; }
      .tools-hint    { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.6; }

      /* ── TV code input ── */
      .tv-code-input-field {
        width: 180px;
        padding: 12px 16px;
        background: var(--bg-input);
        border: 1.5px solid var(--border);
        border-radius: 10px;
        color: var(--text-primary);
        font-family: var(--mono); font-size: 26px;
        letter-spacing: 8px; text-align: center;
        outline: none; transition: var(--ease);
      }
      .tv-code-input-field:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-ring); }

      /* ── Result boxes ── */
      .tools-result {
        margin-top: 20px;
        border-radius: 10px;
        overflow: hidden;
      }
      .tools-inline-result { margin-top: 12px; font-size: 13px; min-height: 20px; }

      .result-card {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 16px 20px;
        background: var(--bg-muted);
      }
      .result-success { border-color: var(--secondary); background: var(--secondary-light); }
      .result-error   { border-color: var(--danger);    background: var(--danger-light); }

      .result-link {
        font-family: var(--mono); font-size: 12px;
        word-break: break-all;
        background: var(--bg-white);
        border: 1px solid var(--border);
        padding: 8px 12px; border-radius: 7px; margin: 10px 0;
        color: var(--primary);
      }

      /* ── Batch ── */
      .label-badge {
        font-size: 12px; font-weight: 600;
        color: var(--text-secondary);
        background: var(--bg-muted);
        border: 1px solid var(--border);
        border-radius: 999px; padding: 2px 10px;
        margin-left: 8px;
      }
      .progress-text { font-size: 13px; color: var(--text-secondary); font-weight: 500; }

      .batch-summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
      .batch-stat {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 10px; padding: 14px 24px;
        text-align: center; min-width: 90px;
        box-shadow: var(--shadow-xs);
      }
      .batch-stat .num   { font-size: 26px; font-weight: 800; color: var(--text-primary); }
      .batch-stat .label { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
      .batch-stat.stat-live { border-color: var(--secondary); }
      .batch-stat.stat-live .num { color: var(--secondary-hover); }
      .batch-stat.stat-die  { border-color: var(--danger); }
      .batch-stat.stat-die  .num { color: var(--danger); }

      /* ── Status indicators ── */
      .status-alive    { color: var(--secondary-hover); font-weight: 700; }
      .status-dead     { color: var(--danger);          font-weight: 700; }
      .status-checking { color: var(--warning);         font-weight: 500; }
      .cookie-short {
        font-family: var(--mono); font-size: 11px; color: var(--text-secondary);
        max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      /* ── Spinning dot on batch button ── */
      .btn-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: rgba(255,255,255,.6);
        display: inline-block;
      }
      .btn-dot.pulsing { animation: pulse 1s infinite; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
    </style>
  `

  // ===== TAB SWITCHING =====
  const tabs = container.querySelectorAll('.tools-tab')
  const panels = {
    getlink: container.querySelector('#tabGetlink'),
    tvcode:  container.querySelector('#tabTvcode'),
    batch:   container.querySelector('#tabBatch'),
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      Object.values(panels).forEach(p => p.style.display = 'none')
      panels[tab.dataset.tab].style.display = 'block'
    })
  })

  // ===========================
  // TAB 1 — GET LINK
  // ===========================
  const glCookie  = container.querySelector('#glCookie')
  const btnGetLink = container.querySelector('#btnGetLink')
  const glResult   = container.querySelector('#glResult')
  const glContent  = container.querySelector('#glResultContent')

  btnGetLink.addEventListener('click', async () => {
    const cookie = glCookie.value.trim()
    if (!cookie) return alert('Vui lòng nhập cookie')

    btnGetLink.disabled = true
    btnGetLink.textContent = '⏳ Đang lấy link...'

    try {
      const data = await apiGetLink(cookie)
      glResult.style.display = 'block'

      if (data.success && data.link) {
        glContent.className = 'result-card result-success'
        glContent.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:20px;">✅</span>
            <strong>Lấy link thành công!</strong>
          </div>
          ${data.info?.email ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">📧 ${data.info.email} | 🎬 ${data.info.plan || '—'} | 🖥️ ${data.info.screens || '—'} màn</div>` : ''}
          <div class="result-link" id="glLinkText">${data.link}</div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-sm btn-primary" id="btnCopyLink">📋 Copy link</button>
            <a href="${data.link}" target="_blank" class="btn btn-sm btn-outline">🔗 Mở link</a>
          </div>
        `
        container.querySelector('#btnCopyLink').addEventListener('click', () => {
          navigator.clipboard.writeText(data.link)
          container.querySelector('#btnCopyLink').textContent = '✅ Đã copy!'
          setTimeout(() => { container.querySelector('#btnCopyLink').textContent = '📋 Copy link' }, 1500)
        })
      } else {
        glContent.className = 'result-card result-error'
        glContent.innerHTML = `<span style="color:#ef4444;">❌ ${data.message || 'Cookie không hợp lệ hoặc đã hết hạn'}</span>`
      }
    } catch (e) {
      glContent.className = 'result-card result-error'
      glContent.innerHTML = `<span style="color:#ef4444;">❌ Lỗi: ${e.message}</span>`
      glResult.style.display = 'block'
    }

    btnGetLink.disabled = false
    btnGetLink.textContent = '🔗 Lấy Link'
  })

  // ===========================
  // TAB 2 — TV CODE
  // ===========================
  let tvAuthUrl = null
  let tvCookieVal = null

  const tvCookie    = container.querySelector('#tvCookie')
  const btnTvInit   = container.querySelector('#btnTvInit')
  const tvInitResult = container.querySelector('#tvInitResult')
  const tvStep2     = container.querySelector('#tvStep2')
  const tvCode      = container.querySelector('#tvCode')
  const btnTvSubmit = container.querySelector('#btnTvSubmit')
  const btnTvReset  = container.querySelector('#btnTvReset')
  const tvSubmitResult = container.querySelector('#tvSubmitResult')

  btnTvInit.addEventListener('click', async () => {
    const cookie = tvCookie.value.trim()
    if (!cookie) return alert('Vui lòng nhập cookie')

    btnTvInit.disabled = true
    btnTvInit.textContent = '⏳ Đang khởi tạo...'
    tvInitResult.innerHTML = ''

    try {
      const data = await apiTvInit(cookie)
      if (data.success && data.authUrl) {
        tvAuthUrl = data.authUrl
        tvCookieVal = cookie
        tvInitResult.innerHTML = `<span style="color:#22c55e;">✅ Khởi tạo thành công! Nhập mã TV bên dưới.</span>`
        tvStep2.style.display = 'block'
        tvCode.focus()
      } else {
        tvInitResult.innerHTML = `<span style="color:#ef4444;">❌ ${data.message || 'Cookie không hợp lệ'}</span>`
      }
    } catch (e) {
      tvInitResult.innerHTML = `<span style="color:#ef4444;">❌ Lỗi: ${e.message}</span>`
    }

    btnTvInit.disabled = false
    btnTvInit.textContent = '🚀 Khởi tạo'
  })

  btnTvSubmit.addEventListener('click', async () => {
    const code = tvCode.value.trim()
    if (!code) return alert('Vui lòng nhập mã TV')
    if (!tvAuthUrl || !tvCookieVal) return alert('Vui lòng khởi tạo lại từ Bước 1')

    btnTvSubmit.disabled = true
    btnTvSubmit.textContent = '⏳ Đang nhập...'
    tvSubmitResult.innerHTML = ''

    try {
      const data = await apiTvSubmit(tvCookieVal, tvAuthUrl, code)
      if (data.success) {
        tvSubmitResult.innerHTML = `
          <div class="result-card result-success" style="display:inline-block;padding:12px 20px;">
            <span style="font-size:18px;">🎉</span> <strong>${data.message || 'Đăng nhập TV thành công!'}</strong>
          </div>`
      } else {
        tvSubmitResult.innerHTML = `<div class="result-card result-error" style="display:inline-block;padding:12px 20px;"><span style="color:#ef4444;">❌ ${data.message || 'Nhập mã thất bại'}</span></div>`
      }
    } catch (e) {
      tvSubmitResult.innerHTML = `<span style="color:#ef4444;">❌ Lỗi: ${e.message}</span>`
    }

    btnTvSubmit.disabled = false
    btnTvSubmit.textContent = '✅ Nhập code TV'
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
  // TAB 3 — BATCH CHECK
  // ===========================
  const batchCookies  = container.querySelector('#batchCookies')
  const batchCount    = container.querySelector('#batchCount')
  const btnBatchCheck = container.querySelector('#btnBatchCheck')
  const btnBatchClear = container.querySelector('#btnBatchClear')
  const batchProgress = container.querySelector('#batchProgress')
  const batchResults  = container.querySelector('#batchResults')
  const batchSummary  = container.querySelector('#batchSummary')
  const batchTableBody = container.querySelector('#batchTableBody')

  // Live count
  batchCookies.addEventListener('input', () => {
    const lines = batchCookies.value.split('\n').filter(l => l.trim())
    batchCount.textContent = `(${lines.length} cookie)`
  })

  let batchRunning = false

  btnBatchCheck.addEventListener('click', async () => {
    if (batchRunning) return
    const lines = batchCookies.value.split('\n').filter(l => l.trim())
    if (!lines.length) return alert('Vui lòng nhập ít nhất 1 cookie')

    batchRunning = true
    btnBatchCheck.disabled = true
    btnBatchCheck.innerHTML = '<span class="btn-dot pulsing"></span> Đang kiểm tra...'
    batchTableBody.innerHTML = ''
    batchResults.style.display = 'block'
    batchSummary.innerHTML = ''

    let alive = 0, dead = 0

    for (let i = 0; i < lines.length; i++) {
      const cookie = lines[i].trim()
      batchProgress.textContent = `Đang kiểm tra ${i + 1}/${lines.length}...`

      // Add row with loading state
      const tr = document.createElement('tr')
      tr.id = `brow-${i}`
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><span class="status-checking">⏳ Đang check...</span></td>
        <td>—</td><td>—</td><td>—</td>
        <td class="cookie-short" title="${cookie}">${cookie.substring(0, 40)}...</td>
        <td>—</td>
      `
      batchTableBody.appendChild(tr)
      tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

      try {
        const data = await apiCheckCookie(cookie)
        const row = document.querySelector(`#brow-${i}`)
        if (data.alive) {
          alive++
          const info = data.raw || {}
          const email   = info.email || '—'
          const plan    = info.plan || '—'
          const screens = info.max_streams || info.screens || '—'
          row.innerHTML = `
            <td>${i + 1}</td>
            <td><span class="status-alive">✅ Còn sống</span></td>
            <td style="font-size:13px;">${email}</td>
            <td style="font-size:13px;">${plan}</td>
            <td style="font-size:13px;">${screens}</td>
            <td class="cookie-short" title="${cookie}">${cookie.substring(0, 40)}...</td>
            <td>
              <button class="btn btn-sm btn-primary copy-cookie-btn" data-cookie="${encodeURIComponent(cookie)}">📋 Copy</button>
            </td>
          `
        } else {
          dead++
          const row = document.querySelector(`#brow-${i}`)
          row.innerHTML = `
            <td>${i + 1}</td>
            <td><span class="status-dead">❌ Die</span></td>
            <td>—</td><td>—</td><td>—</td>
            <td class="cookie-short" title="${cookie}">${cookie.substring(0, 40)}...</td>
            <td>—</td>
          `
        }
      } catch {
        dead++
        const row = document.querySelector(`#brow-${i}`)
        row.innerHTML = `
          <td>${i + 1}</td>
          <td><span class="status-dead">⚠️ Lỗi</span></td>
          <td>—</td><td>—</td><td>—</td>
          <td class="cookie-short" title="${cookie}">${cookie.substring(0, 40)}...</td>
          <td>—</td>
        `
      }

      // Small delay to avoid rate-limit
      if (i < lines.length - 1) await sleep(500)
    }

    // Summary
    batchSummary.innerHTML = `
      <div class="batch-stat"><div class="num">${lines.length}</div><div class="label">Tổng cộng</div></div>
      <div class="batch-stat stat-live"><div class="num">${alive}</div><div class="label">✅ Còn sống</div></div>
      <div class="batch-stat stat-die"><div class="num">${dead}</div><div class="label">❌ Die / Lỗi</div></div>
    `
    batchProgress.textContent = `✅ Hoàn tất — ${alive} sống · ${dead} die`

    // Delegate copy buttons
    batchTableBody.querySelectorAll('.copy-cookie-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(decodeURIComponent(btn.dataset.cookie))
        btn.textContent = '✅ Copied!'
        setTimeout(() => { btn.textContent = '📋 Copy' }, 1500)
      })
    })

    batchRunning = false
    btnBatchCheck.disabled = false
    btnBatchCheck.innerHTML = '<span class="btn-dot"></span> Kiểm tra tất cả'
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

