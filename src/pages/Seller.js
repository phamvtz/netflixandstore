import {
  getMySellerStore,
  createSellerStore,
  updateSellerStore,
  getSellerStats,
  getSellerMergedPlanPrices,
  putSellerPlanPrices
} from '../utils/api.js'
import { formatVND } from '../utils/format.js'

/* ── Icons ────────────────────────────────────────────────────── */
const IC_GLOBE  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
const IC_PAINT  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13.5V20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6.5"/><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 7v6.5"/><path d="M22 7v6.5"/></svg>`
const IC_BANK   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`
const IC_BELL   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`
const IC_TAG    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
const IC_SAVE   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`
const IC_COPY   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
const IC_EXT    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
const IC_OK     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
const IC_PLUS   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
const IC_SERVER = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`
const IC_API    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`

/* ── Helpers ──────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const toast = (msg, type = 'success') => window.showToast?.(msg, type)

function copyBtn(el, text) {
  el?.addEventListener('click', () => {
    navigator.clipboard.writeText(text)
    const orig = el.innerHTML
    el.innerHTML = `${IC_OK} Đã copy`
    setTimeout(() => { el.innerHTML = orig }, 1400)
  })
}

function saveRow(btnId, label = 'Lưu') {
  return `<div class="sl-save-row">
    <button type="button" class="btn btn-primary sl-save-btn" id="${btnId}">${IC_SAVE} ${label}</button>
    <span class="sl-save-msg" id="${btnId}Msg"></span>
  </div>`
}

function bindSave(root, btnId, getData, apiFn, reloadFn) {
  const btn = root.querySelector(`#${btnId}`)
  const msg = root.querySelector(`#${btnId}Msg`)
  if (!btn) return
  btn.addEventListener('click', async () => {
    btn.disabled = true
    btn.innerHTML = `<span class="tc-spinner"></span> Đang lưu...`
    if (msg) { msg.className = 'sl-save-msg'; msg.textContent = '' }
    try {
      await apiFn(getData())
      btn.innerHTML = `${IC_OK} Đã lưu`
      if (msg) { msg.className = 'sl-save-msg sl-save-ok'; msg.innerHTML = `${IC_OK} Lưu thành công` }
      setTimeout(async () => {
        btn.disabled = false
        btn.innerHTML = `${IC_SAVE} ${lbl(btnId)}`
        if (reloadFn) await reloadFn()
      }, 800)
    } catch (e) {
      btn.disabled = false
      btn.innerHTML = `${IC_SAVE} ${lbl(btnId)}`
      if (msg) { msg.className = 'sl-save-msg sl-save-err'; msg.textContent = e.message }
      toast(e.message, 'error')
    }
  })
}

const BTN_LABELS = {
  btnSaveSite:    'Lưu website',
  btnSavePay:     'Lưu thanh toán',
  btnSaveNotify:  'Lưu thông báo',
  btnSavePrices:  'Lưu giá',
}
const lbl = id => BTN_LABELS[id] || 'Lưu'

/* ── Section card ─────────────────────────────────────────────── */
function card({ id, icon, title, sub = '', theme = 'primary', body }) {
  const themes = {
    primary: 'sl-card--primary',
    green:   'sl-card--green',
    orange:  'sl-card--orange',
    blue:    'sl-card--blue',
    violet:  'sl-card--violet',
  }
  return `<section class="sl-card ${themes[theme]||''}" id="${id}">
    <div class="sl-card-hd">
      <span class="sl-card-ic">${icon}</span>
      <div>
        <h2 class="sl-card-title">${title}</h2>
        ${sub ? `<p class="sl-card-sub">${sub}</p>` : ''}
      </div>
    </div>
    <div class="sl-card-bd">${body}</div>
  </section>`
}

/* ════════════════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════════════════ */
export async function renderSeller(container) {
  container.innerHTML = `
    <div class="sl-page">
      <div class="page-container sl-wrap">
        <div class="sl-loading"><div class="spinner"></div></div>
      </div>
    </div>`

  const wrap = container.querySelector('.sl-wrap')

  /* ── fetch ── */
  let store
  try { store = await getMySellerStore() }
  catch (e) {
    wrap.innerHTML = `<div class="sl-err"><p>${esc(e.message)}</p>
      <button class="btn btn-outline" onclick="window.location.reload()">Thử lại</button></div>`
    return
  }

  /* ══════════════════════════════════════════════════════════════
     CHƯA CÓ TENANT → ONBOARDING
     ══════════════════════════════════════════════════════════════ */
  if (!store) {
    wrap.innerHTML = `
      <div class="sl-onboard">

        <!-- Hero -->
        <div class="sl-ob-hero">
          <div class="sl-ob-platform-badge">
            ${IC_SERVER}
            <span>Multi-tenant Platform</span>
          </div>
          <h1 class="sl-ob-title">Tạo web con của bạn</h1>
          <p class="sl-ob-desc">
            Nền tảng trung tâm xử lý toàn bộ kho, thanh toán, bảo hành.
            Bạn chỉ cần <strong>trỏ domain → <code style="background:rgba(99,102,241,.15);color:#a5b4fc;padding:1px 6px;border-radius:4px;font-size:.85em;">34.21.196.105</code></strong> là có ngay một site thương mại hoàn chỉnh mang thương hiệu của bạn.
          </p>
        </div>

        <!-- How it works -->
        <div class="sl-ob-steps">
          <div class="sl-ob-step">
            <span class="sl-ob-step-num">1</span>
            <div>
              <strong>Tạo tenant</strong>
              <p>Điền slug, tên thương hiệu, màu sắc bên dưới.</p>
            </div>
          </div>
          <div class="sl-ob-step-arrow">→</div>
          <div class="sl-ob-step">
            <span class="sl-ob-step-num">2</span>
            <div>
              <strong>Trỏ domain</strong>
              <p>DNS A → <code style="font-size:.85em;">34.21.196.105</code>. Caddy tự cấp SSL.</p>
            </div>
          </div>
          <div class="sl-ob-step-arrow">→</div>
          <div class="sl-ob-step">
            <span class="sl-ob-step-num">3</span>
            <div>
              <strong>Hoạt động ngay</strong>
              <p>Khách mua trên domain bạn, tiền về tài khoản bạn.</p>
            </div>
          </div>
        </div>

        <!-- Form -->
        <div class="sl-ob-form-card">
          <h2 class="sl-ob-form-title">Thông tin khởi tạo</h2>
          <form id="fCreate">
            <div class="sl-grid">
              <div class="form-group">
                <label class="sl-label">Slug <span class="sl-req">*</span></label>
                <div class="sl-input-prefix-wrap">
                  <span class="sl-input-prefix">/s/</span>
                  <input type="text" id="cSlug" required placeholder="ten-cua-ban"
                         pattern="[a-z0-9][a-z0-9-]{1,30}" autocomplete="off">
                </div>
                <small class="sl-hint">Chữ thường, số, gạch ngang · 3–32 ký tự</small>
              </div>
              <div class="form-group">
                <label class="sl-label">Tên thương hiệu <span class="sl-req">*</span></label>
                <input type="text" id="cName" required maxlength="120" placeholder="My Netflix Store">
              </div>
              <div class="form-group sl-col2">
                <label class="sl-label">Slogan (tuỳ chọn)</label>
                <input type="text" id="cTagline" maxlength="240" placeholder="Tài khoản Netflix chính hãng">
              </div>
              <div class="form-group">
                <label class="sl-label">Màu accent</label>
                <div class="sl-color-wrap">
                  <input type="color" id="cColorPick" value="#5B4FD6" class="sl-color-pick">
                  <input type="text" id="cColorTxt" value="#5B4FD6" pattern="#[0-9A-Fa-f]{3,8}" class="sl-color-txt">
                </div>
              </div>
              <div class="form-group">
                <label class="sl-label">Domain riêng (tuỳ chọn)</label>
                <input type="text" id="cDomain" placeholder="store.example.com" autocomplete="off">
                <small class="sl-hint">Có thể thêm sau khi tạo xong</small>
              </div>
            </div>
            <div id="cErr" class="form-error" style="margin:12px 0;"></div>
            <button type="submit" class="btn btn-primary btn-block sl-submit-btn" id="cBtn">
              ${IC_PLUS} Tạo web con
            </button>
          </form>
        </div>

        <!-- DNS guide collapsed -->
        <details class="sl-dns-guide">
          <summary>📡 Hướng dẫn trỏ domain (DNS + Caddy)</summary>
          <div class="sl-dns-body">
            <div class="sl-dns-step">
              <code>A  @   34.21.196.105</code>
              <span>Tạo A record trỏ về IP VPS</span>
            </div>
            <div class="sl-dns-step">
              <code>CNAME  www  @</code>
              <span>Hoặc CNAME www trỏ về naked domain</span>
            </div>
            <div class="sl-dns-step">
              <code>Caddyfile: reverse_proxy localhost:3001</code>
              <span>Caddy tự cấp SSL, proxy về Node server</span>
            </div>
            <div class="sl-dns-step">
              <code>MAIN_DOMAINS=vplus.pro.vn,www.vplus.pro.vn</code>
              <span>Đã set trong .env của platform mẹ</span>
            </div>
          </div>
        </details>

      </div>
    `

    /* color sync */
    const cp = wrap.querySelector('#cColorPick'), ct = wrap.querySelector('#cColorTxt')
    cp?.addEventListener('input', () => { ct.value = cp.value })
    ct?.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{3,8}$/.test(ct.value)) cp.value = ct.value })

    wrap.querySelector('#fCreate').addEventListener('submit', async e => {
      e.preventDefault()
      const errEl = wrap.querySelector('#cErr'), btn = wrap.querySelector('#cBtn')
      errEl.textContent = ''
      btn.disabled = true
      btn.innerHTML = `<span class="tc-spinner"></span> Đang tạo...`
      try {
        await createSellerStore({
          slug:          wrap.querySelector('#cSlug').value.trim(),
          display_name:  wrap.querySelector('#cName').value.trim(),
          tagline:       wrap.querySelector('#cTagline').value.trim(),
          theme_primary: wrap.querySelector('#cColorTxt').value.trim() || '#5B4FD6',
          custom_domain: wrap.querySelector('#cDomain').value.trim(),
        })
        toast('Web con đã được tạo!', 'success')
        await renderSeller(container)
      } catch (err) {
        errEl.textContent = err.message
        btn.disabled = false
        btn.innerHTML = `${IC_PLUS} Tạo web con`
      }
    })
    return
  }

  /* ══════════════════════════════════════════════════════════════
     ĐÃ CÓ TENANT → DASHBOARD
     ══════════════════════════════════════════════════════════════ */
  const origin    = `${window.location.origin}${window.location.pathname}`
  const hashUrl   = `${origin}#/s/${store.slug}`
  const safeHost  = store.custom_domain ? String(store.custom_domain).replace(/[^\w.-]/g, '') : ''
  const domainUrl = safeHost ? `https://${safeHost}/` : ''
  const liveUrl   = domainUrl || hashUrl

  let stats = { orders: 0, revenue: 0, _note: '' }
  try { stats = await getSellerStats() } catch (_) {}

  let plans = []
  try { plans = await getSellerMergedPlanPrices() } catch (_) {}

  const isActive = !!store.is_active
  const domainStatus = safeHost
    ? `<span class="sl-domain-badge sl-domain-ok">${IC_GLOBE} ${esc(safeHost)}</span>`
    : `<span class="sl-domain-badge sl-domain-none">Chưa có domain riêng</span>`

  wrap.innerHTML = `
    <!-- ── TOP BAR ───────────────────────────────────────────── -->
    <div class="sl-topbar">
      <div class="sl-topbar-left">
        <div class="sl-topbar-logo" style="--accent:${esc(store.theme_primary||'#5B4FD6')}">
          ${esc((store.display_name||'?')[0].toUpperCase())}
        </div>
        <div>
          <div class="sl-topbar-name">${esc(store.display_name)}</div>
          <div class="sl-topbar-meta">
            <code class="sl-slug-pill">/s/${esc(store.slug)}</code>
            ${domainStatus}
            <span class="sl-status-pill ${isActive ? 'sl-status-on':'sl-status-off'}">
              ${isActive ? '● Live' : '○ Tắt'}
            </span>
          </div>
        </div>
      </div>
      <a href="${esc(liveUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline sl-preview-btn">
        ${IC_EXT} Xem site
      </a>
    </div>

    <!-- ── STATS ─────────────────────────────────────────────── -->
    <div class="sl-stats">
      <div class="sl-stat sl-stat--orders">
        <div class="sl-stat-val">${Number(stats.orders)||0}</div>
        <div class="sl-stat-lbl">Đơn thành công</div>
      </div>
      <div class="sl-stat sl-stat--rev">
        <div class="sl-stat-val">${formatVND(Number(stats.revenue)||0)}</div>
        <div class="sl-stat-lbl">Doanh thu</div>
      </div>
      ${stats._note ? `<div class="sl-stat sl-stat--note"><p>${esc(stats._note)}</p></div>` : ''}
    </div>

    <!-- ── ACCESS LINKS ──────────────────────────────────────── -->
    ${card({ id:'sc-links', icon: IC_GLOBE, title:'Domain & truy cập', theme:'blue',
      sub: 'Link hash luôn hoạt động. Domain riêng khi DNS đã trỏ đúng.',
      body: `
        <div class="sl-link-group">
          <div class="sl-link-label">Link hash (luôn hoạt động)</div>
          <div class="sl-link-row">
            <code class="sl-link-val">${esc(hashUrl)}</code>
            <button class="sl-icon-btn" id="cpHash" title="Copy">${IC_COPY}</button>
            <a href="${esc(hashUrl)}" target="_blank" rel="noopener" class="sl-icon-btn">${IC_EXT}</a>
          </div>
        </div>
        ${safeHost ? `
        <div class="sl-link-group" style="margin-top:12px;">
          <div class="sl-link-label">Domain riêng</div>
          <div class="sl-link-row">
            <code class="sl-link-val">${esc(domainUrl)}</code>
            <button class="sl-icon-btn" id="cpDomain" title="Copy">${IC_COPY}</button>
            <a href="${esc(domainUrl)}" target="_blank" rel="noopener" class="sl-icon-btn">${IC_EXT}</a>
          </div>
        </div>` : `
        <div class="sl-no-domain">
          <p>Chưa có domain riêng. Thêm ở mục <strong>Website</strong> bên dưới.</p>
          <details class="sl-dns-mini">
            <summary>Xem hướng dẫn DNS</summary>
            <div class="sl-dns-body">
              <div class="sl-dns-step"><code>A @ 34.21.196.105</code><span>A record trỏ về VPS</span></div>
              <div class="sl-dns-step"><code>Caddy: reverse_proxy localhost:3001</code><span>Auto SSL</span></div>
              <div class="sl-dns-step"><code>MAIN_DOMAINS=vplus.pro.vn,... (.env)</code><span>Domain mẹ không bị nhận là web con</span></div>
            </div>
          </details>
        </div>`}
      `
    })}

    <!-- ── API (tích hợp server / app riêng) ─────────────────── -->
    ${card({ id:'sc-api', icon: IC_API, title:'API & tích hợp', theme:'violet',
      sub: 'Gọi REST từ backend hoặc script — endpoint công khai dùng sellerStoreId; quản lý gian hàng cần JWT (Supabase) sau đăng nhập tài khoản seller.',
      body: `
        <div class="sl-info-note" style="margin-bottom:12px;">
          Header bảo vệ: <code class="sl-code-inline">Authorization: Bearer &lt;access_token&gt;</code>
          (cùng phiên đăng nhập web). Trên server riêng, đăng nhập Supabase (service) hoặc trao đổi token an toàn — không hard-code token vào app công khai.
        </div>
        <div class="sl-link-group">
          <div class="sl-link-label">sellerStoreId (tham số <code class="sl-code-inline">sellerStoreId</code> / quote)</div>
          <div class="sl-link-row">
            <code class="sl-link-val">${esc(store.id)}</code>
            <button class="sl-icon-btn" id="cpStoreId" title="Copy">${IC_COPY}</button>
          </div>
        </div>
        <div class="sl-link-group" style="margin-top:12px;">
          <div class="sl-link-label">Base URL (API Express)</div>
          <div class="sl-link-row">
            <code class="sl-link-val" id="slApiBase">${esc(window.location.origin)}</code>
            <button class="sl-icon-btn" id="cpApiBase" title="Copy">${IC_COPY}</button>
          </div>
        </div>
        <p class="sl-hint" style="margin-top:10px;">
          Ví dụ công khai: <code class="sl-code-inline">GET …/api/public/plans?sellerStoreId=${esc(store.id)}</code>
        </p>
        <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
          <a href="${esc(origin)}#/api-docs" class="btn btn-sm btn-outline">${IC_EXT} Tài liệu API đầy đủ</a>
          <span class="sl-hint" style="margin:0;">Mục <strong>Seller / đại lý</strong> trong trang tài liệu.</span>
        </div>
      `
    })}
    <!-- ── WEBSITE (branding + identity) ─────────────────────── -->
    ${card({ id:'sc-site', icon: IC_PAINT, title:'Website', theme:'primary',
      sub: 'Thương hiệu, màu sắc, domain riêng — khách không thấy platform mẹ.',
      body: `
        <div class="sl-grid">
          <div class="form-group">
            <label class="sl-label">Slug</label>
            <div class="sl-input-prefix-wrap">
              <span class="sl-input-prefix">/s/</span>
              <input type="text" id="eSlug" value="${esc(store.slug)}" required pattern="[a-z0-9][a-z0-9-]{1,30}">
            </div>
            <small class="sl-hint">Thay slug sẽ đổi link hash</small>
          </div>
          <div class="form-group">
            <label class="sl-label">Tên thương hiệu</label>
            <input type="text" id="eName" value="${esc(store.display_name)}" required maxlength="120">
          </div>
          <div class="form-group sl-col2">
            <label class="sl-label">Slogan</label>
            <input type="text" id="eTagline" value="${esc(store.tagline||'')}" maxlength="240">
          </div>
          <div class="form-group">
            <label class="sl-label">Màu accent</label>
            <div class="sl-color-wrap">
              <input type="color" id="eColorPick" value="${esc(store.theme_primary||'#5B4FD6')}" class="sl-color-pick">
              <input type="text" id="eColorTxt" value="${esc(store.theme_primary||'#5B4FD6')}" pattern="#[0-9A-Fa-f]{3,8}" class="sl-color-txt">
            </div>
          </div>
          <div class="form-group">
            <label class="sl-label">Custom domain</label>
            <input type="text" id="eDomain" value="${esc(store.custom_domain||'')}" placeholder="store.example.com">
            <small class="sl-hint">DNS A record → <code>34.21.196.105</code> trước khi điền</small>
          </div>
          <div class="form-group sl-col2">
            <label class="sl-label">Ghi chú nội bộ</label>
            <textarea id="eGuide" rows="3" class="sl-textarea">${esc(store.reseller_guide||'')}</textarea>
          </div>
          <div class="form-group sl-col2">
            <label class="sl-toggle">
              <input type="checkbox" id="eActive" ${store.is_active?'checked':''}>
              <span class="sl-toggle-track"></span>
              <span class="sl-toggle-lbl">Site đang hoạt động (khách truy cập được)</span>
            </label>
          </div>
        </div>
        ${saveRow('btnSaveSite','Lưu website')}
      `
    })}

    <!-- ── PAYMENT ────────────────────────────────────────────── -->
    ${card({ id:'sc-pay', icon: IC_BANK, title:'Thanh toán', theme:'green',
      sub: 'Khách thấy STK/MoMo này trên trang thanh toán của web con.',
      body: `
        <div class="sl-info-note">
          💡 <strong>Để trống</strong> = dùng tài khoản platform mẹ (tự động khớp qua lịch sử MB — <a href="https://thueapibank.vn/home/mbbank" target="_blank" rel="noopener">thueapibank</a>).
          Điền STK riêng = tiền về bạn nhưng cần xác nhận thủ công trên Admin.
        </div>
        <div class="sl-grid">
          <div class="form-group">
            <label class="sl-label">Ngân hàng</label>
            <input type="text" id="eBankName" value="${esc(store.bank_name||'')}" placeholder="VD: MB Bank">
          </div>
          <div class="form-group">
            <label class="sl-label">Số tài khoản</label>
            <input type="text" id="eBankAcc" value="${esc(store.bank_account||'')}" placeholder="Để trống = dùng TK mẹ">
          </div>
          <div class="form-group">
            <label class="sl-label">Chủ tài khoản</label>
            <input type="text" id="eBankOwner" value="${esc(store.bank_owner||'')}">
          </div>
          <div class="form-group">
            <label class="sl-label">BIN VietQR <small class="sl-hint-inline">(MB = 970422)</small></label>
            <input type="text" id="eVietqr" maxlength="6" pattern="[0-9]{6}" value="${esc(store.vietqr_bank_bin||'970422')}" placeholder="970422">
          </div>
          <div class="form-group">
            <label class="sl-label">MoMo — SĐT</label>
            <input type="text" id="eMomoNum" value="${esc(store.momo_number||'')}">
          </div>
          <div class="form-group">
            <label class="sl-label">MoMo — Tên</label>
            <input type="text" id="eMomoName" value="${esc(store.momo_name||'')}">
          </div>
        </div>
        ${saveRow('btnSavePay','Lưu thanh toán')}
      `
    })}

    <!-- ── NOTIFICATIONS ─────────────────────────────────────── -->
    ${card({ id:'sc-notify', icon: IC_BELL, title:'Thông báo', theme:'orange',
      sub: 'Nhận thông báo Telegram / Email mỗi khi có đơn qua web con.',
      body: `
        <div class="sl-grid">
          <div class="form-group">
            <label class="sl-label">Gmail</label>
            <input type="email" id="eGmail" value="${esc(store.gmail_user||'')}" placeholder="you@gmail.com" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="sl-label">App Password Gmail</label>
            <input type="password" id="eGmailPass"
              placeholder="${store.has_gmail_password?'●●●● đã lưu — nhập mới để đổi':'App password 16 ký tự'}"
              autocomplete="new-password">
          </div>
          <div class="form-group">
            <label class="sl-label">Telegram Bot Token</label>
            <input type="password" id="eTgToken"
              placeholder="${store.has_telegram_bot_token?'●●●● đã lưu — nhập mới để đổi':'123456:ABC...'}"
              autocomplete="new-password">
          </div>
          <div class="form-group">
            <label class="sl-label">Telegram Chat ID</label>
            <input type="text" id="eTgChat" value="${esc(store.telegram_chat_id||'')}" placeholder="-100... hoặc ID cá nhân">
          </div>
        </div>
        ${saveRow('btnSaveNotify','Lưu thông báo')}
      `
    })}

    <!-- ── PRICING ────────────────────────────────────────────── -->
    ${card({ id:'sc-price', icon: IC_TAG, title:'Giá bán', theme:'violet',
      sub: 'Đặt giá mỗi gói cho web con ≥ giá platform. Chênh lệch là lợi nhuận của bạn.',
      body: `
        ${plans.length
          ? `<div class="sl-price-list">
              ${plans.map(p => `
                <div class="sl-price-item">
                  <div class="sl-price-info">
                    <span class="sl-price-name">${esc(p.name||p.id)}</span>
                    <span class="sl-price-floor">Sàn: ${formatVND(p.base_price??0)}</span>
                  </div>
                  <div class="sl-price-field">
                    <span class="sl-price-cur">₫</span>
                    <input type="number" class="pp-input sl-price-inp"
                      data-plan="${esc(p.id)}"
                      min="${p.base_price??0}" step="1000"
                      value="${p.price??p.base_price??0}">
                  </div>
                </div>`).join('')}
            </div>`
          : `<p class="sl-empty">Chưa tải được bảng giá. Chạy SQL <code>fix_seller_reseller_config.sql</code></p>`
        }
        ${saveRow('btnSavePrices','Lưu giá')}
      `
    })}
  `

  /* ── Copy buttons ── */
  copyBtn(wrap.querySelector('#cpHash'), hashUrl)
  if (safeHost) copyBtn(wrap.querySelector('#cpDomain'), domainUrl)
  copyBtn(wrap.querySelector('#cpStoreId'), store.id)
  copyBtn(wrap.querySelector('#cpApiBase'), window.location.origin)

  /* ── Color sync ── */
  const ep = wrap.querySelector('#eColorPick'), et = wrap.querySelector('#eColorTxt')
  ep?.addEventListener('input', () => { et.value = ep.value })
  et?.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{3,8}$/.test(et.value)) ep.value = et.value })

  const reload = () => renderSeller(container)

  /* ── Save: Website ── */
  bindSave(wrap, 'btnSaveSite', () => ({
    slug:           wrap.querySelector('#eSlug')?.value.trim(),
    display_name:   wrap.querySelector('#eName')?.value.trim(),
    tagline:        wrap.querySelector('#eTagline')?.value.trim(),
    theme_primary:  wrap.querySelector('#eColorTxt')?.value.trim(),
    custom_domain:  wrap.querySelector('#eDomain')?.value.trim(),
    reseller_guide: wrap.querySelector('#eGuide')?.value,
    is_active:      wrap.querySelector('#eActive')?.checked,
  }), updateSellerStore, reload, lbl)

  /* ── Save: Payment ── */
  bindSave(wrap, 'btnSavePay', () => ({
    bank_name:       wrap.querySelector('#eBankName')?.value.trim(),
    bank_account:    wrap.querySelector('#eBankAcc')?.value.trim(),
    bank_owner:      wrap.querySelector('#eBankOwner')?.value.trim(),
    vietqr_bank_bin: wrap.querySelector('#eVietqr')?.value.trim(),
    momo_number:     wrap.querySelector('#eMomoNum')?.value.trim(),
    momo_name:       wrap.querySelector('#eMomoName')?.value.trim(),
  }), updateSellerStore, null, lbl)

  /* ── Save: Notifications ── */
  bindSave(wrap, 'btnSaveNotify', () => {
    const p = { gmail_user: wrap.querySelector('#eGmail')?.value.trim(), telegram_chat_id: wrap.querySelector('#eTgChat')?.value.trim() }
    const gp = wrap.querySelector('#eGmailPass')?.value; if (gp) p.gmail_app_password = gp
    const tg = wrap.querySelector('#eTgToken')?.value;   if (tg) p.telegram_bot_token = tg
    return p
  }, updateSellerStore, null, lbl)

  /* ── Save: Prices ── */
  bindSave(wrap, 'btnSavePrices', () => {
    const prices = {}
    wrap.querySelectorAll('.pp-input').forEach(inp => {
      const v = parseInt(inp.value, 10)
      if (inp.dataset.plan && !isNaN(v)) prices[inp.dataset.plan] = v
    })
    return prices
  }, putSellerPlanPrices, reload, lbl)
}
