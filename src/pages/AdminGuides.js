/**
 * Tab Admin — quản lý bài hướng dẫn (settings.guides_config)
 */
import { adminPatchSettings } from '../utils/api.js'
import { showConfirm } from '../utils/confirm.js'
import { parseGuidesConfig, normalizeGuidePost, slugifyTitle, youtubeUrlToEmbed } from '../utils/guides.js'
import { markdownLiteToHtml } from '../utils/markdownLite.js'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
}

export function renderAdminGuides(panel, settings) {
  const cfg = parseGuidesConfig(settings?.guides_config)
  let posts = cfg.posts.map(normalizeGuidePost).sort((a, b) => a.order - b.order)
  let editingId = null

  function syncPostsToForm() {
    posts = posts.map(normalizeGuidePost).sort((a, b) => a.order - b.order)
  }

  function cfgToSave() {
    return {
      introTitle: panel.querySelector('#guidesIntroTitle')?.value?.trim() || 'Hướng dẫn sử dụng',
      introSubtitle: panel.querySelector('#guidesIntroSubtitle')?.value ?? '',
      posts: posts.map(p => ({ ...p }))
    }
  }

  function renderTable() {
    const tb = panel.querySelector('#guidesPostsBody')
    if (!tb) return
    tb.innerHTML = posts.length
      ? posts.map((p, idx) => `
        <tr data-id="${escapeAttr(p.id)}">
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(p.title)}</strong><br><code style="font-size:11px;">${escapeHtml(p.slug)}</code></td>
          <td>${youtubeUrlToEmbed(p.youtubeUrl) ? '<span class="status-badge status-active" title="Có video">▶ YT</span>' : '—'}</td>
          <td>${p.published !== false ? '<span class="status-badge status-active">Hiện</span>' : '<span class="status-badge status-expired">Ẩn</span>'}</td>
          <td>${p.order}</td>
          <td>
            <button type="button" class="btn btn-sm btn-outline guides-edit" data-id="${escapeAttr(p.id)}">Sửa</button>
            <button type="button" class="btn btn-sm btn-danger guides-del" data-id="${escapeAttr(p.id)}">Xóa</button>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Chưa có bài. Nhấn «Thêm bài».</td></tr>'
  }

  function refreshVideoPreview() {
    const url = panel.querySelector('#guidesEdYt')?.value?.trim() || ''
    const wrap = panel.querySelector('#guidesVideoPreview')
    const hint = panel.querySelector('#guidesYtHint')
    if (!wrap) return
    const embed = youtubeUrlToEmbed(url)
    if (hint) {
      hint.textContent = embed ? '✓ Link hợp lệ — video sẽ hiển thị trên trang công khai.' : url ? '⚠ Không nhận dạng được link YouTube (watch / youtu.be / shorts / embed).' : 'Dán link đầy đủ, ví dụ: https://www.youtube.com/watch?v=...'
      hint.style.color = embed ? 'var(--secondary-hover)' : url ? 'var(--warning)' : 'var(--text-muted)'
    }
    if (embed) {
      wrap.innerHTML = `<div class="admin-guides-video-frame"><iframe class="admin-guides-video-iframe" src="${embed}" title="Xem trước video" allowfullscreen loading="lazy"></iframe></div>`
    } else {
      wrap.innerHTML = url ? '<p class="admin-guides-video-empty">Không xem trước được — kiểm tra lại URL.</p>' : '<p class="admin-guides-video-empty">Chưa có link — khách chỉ thấy nội dung chữ.</p>'
    }
  }

  function fillEditor(p) {
    panel.querySelector('#guidesEdId').value = p.id
    panel.querySelector('#guidesEdTitle').value = p.title
    panel.querySelector('#guidesEdSlug').value = p.slug
    panel.querySelector('#guidesEdBody').value = p.bodyMd
    panel.querySelector('#guidesEdYt').value = p.youtubeUrl || ''
    panel.querySelector('#guidesEdOrder').value = String(p.order)
    panel.querySelector('#guidesEdPublished').checked = p.published !== false
    const prev = panel.querySelector('#guidesPreview')
    if (prev) prev.innerHTML = markdownLiteToHtml(p.bodyMd)
    refreshVideoPreview()
  }

  function clearEditor() {
    editingId = null
    panel.querySelector('#guidesEdId').value = ''
    panel.querySelector('#guidesEdTitle').value = ''
    panel.querySelector('#guidesEdSlug').value = ''
    panel.querySelector('#guidesEdBody').value = ''
    panel.querySelector('#guidesEdYt').value = ''
    panel.querySelector('#guidesEdOrder').value = String(posts.length)
    panel.querySelector('#guidesEdPublished').checked = true
    const prev = panel.querySelector('#guidesPreview')
    if (prev) prev.innerHTML = ''
    refreshVideoPreview()
    panel.querySelector('#guidesEditorTitle').textContent = 'Thêm / sửa bài'
  }

  panel.innerHTML = `
    <div class="admin-form-card" style="margin-bottom:var(--sp-5);">
      <h3 class="admin-section-title">Tiêu đề trang hướng dẫn</h3>
      <div class="op-form-grid" style="margin-top:var(--sp-3);">
        <div class="form-group" style="margin:0;">
          <label class="op-label">Tiêu đề chính</label>
          <input type="text" id="guidesIntroTitle" class="admin-filter" value="${escapeAttr(cfg.introTitle)}">
        </div>
        <div class="form-group" style="margin:0;grid-column:1/-1;">
          <label class="op-label">Mô tả phụ (dòng dưới tiêu đề)</label>
          <input type="text" id="guidesIntroSubtitle" class="admin-filter" value="${escapeAttr(cfg.introSubtitle)}">
        </div>
      </div>
      <button type="button" class="btn btn-primary" id="guidesSaveIntro" style="margin-top:var(--sp-3);">💾 Lưu phần đầu trang</button>
      <p id="guidesIntroResult" style="font-size:13px;margin-top:8px;"></p>
    </div>

    <div class="admin-form-card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <h3 class="admin-section-title" style="margin:0;">Danh sách bài</h3>
        <button type="button" class="btn btn-success" id="guidesAddPost">➕ Thêm bài</button>
      </div>
      <div class="admin-table-wrap" style="margin-top:var(--sp-4);">
        <table class="data-table">
          <thead><tr><th>#</th><th>Tiêu đề / Slug</th><th>Video</th><th>Trạng thái</th><th>Thứ tự</th><th></th></tr></thead>
          <tbody id="guidesPostsBody"></tbody>
        </table>
      </div>

      <div id="guidesEditorWrap" style="margin-top:var(--sp-6);padding-top:var(--sp-5);border-top:1px solid var(--border);">
        <h4 id="guidesEditorTitle" style="margin:0 0 var(--sp-4);">Thêm / sửa bài</h4>
        <input type="hidden" id="guidesEdId" value="">
        <div class="op-form-grid">
          <div class="form-group" style="margin:0;">
            <label class="op-label">Tiêu đề</label>
            <input type="text" id="guidesEdTitle" class="admin-filter" placeholder="VD: Cách thanh toán">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="op-label">Slug (URL)</label>
            <input type="text" id="guidesEdSlug" class="admin-filter" placeholder="vd: cach-thanh-toan">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="op-label">Thứ tự hiển thị</label>
            <input type="number" id="guidesEdOrder" class="admin-filter" value="0" min="0">
          </div>
          <div class="form-group" style="margin:0;display:flex;align-items:center;gap:8px;padding-top:22px;">
            <input type="checkbox" id="guidesEdPublished" checked>
            <label for="guidesEdPublished" style="margin:0;font-weight:600;">Xuất bản (hiện trên site)</label>
          </div>
          <div class="form-group" style="margin:0;grid-column:1/-1;">
            <label class="op-label">Video YouTube (tùy chọn) — nhúng xem trên trang hướng dẫn</label>
            <input type="url" id="guidesEdYt" class="admin-filter" placeholder="https://www.youtube.com/watch?v=... hoặc https://youtu.be/...">
            <p id="guidesYtHint" style="font-size:12px;margin-top:6px;color:var(--text-muted);"></p>
            <p class="op-label" style="margin:var(--sp-3) 0 var(--sp-2);">Xem trước video</p>
            <div id="guidesVideoPreview" class="admin-guides-video-preview"></div>
          </div>
          <div class="form-group" style="margin:0;grid-column:1/-1;">
            <label class="op-label">Nội dung — Markdown (## tiêu đề, **đậm**, \`code\`, [text](url), danh sách - )</label>
            <textarea id="guidesEdBody" class="acc-textarea" rows="14" placeholder="## Phần 1&#10;&#10;Nội dung..."></textarea>
          </div>
        </div>
        <p class="op-label" style="margin:var(--sp-3) 0 var(--sp-2);">Xem trước</p>
        <div id="guidesPreview" class="guides-body prose-like admin-guides-preview"></div>
        <div style="display:flex;gap:8px;margin-top:var(--sp-4);flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" id="guidesSavePost">💾 Lưu bài</button>
          <button type="button" class="btn btn-outline" id="guidesCancelEd">Huỷ</button>
        </div>
        <p id="guidesPostResult" style="font-size:13px;margin-top:8px;"></p>
      </div>
    </div>
  `

  renderTable()
  clearEditor()

  panel.querySelector('#guidesEdBody')?.addEventListener('input', () => {
    const prev = panel.querySelector('#guidesPreview')
    if (prev) prev.innerHTML = markdownLiteToHtml(panel.querySelector('#guidesEdBody').value)
  })
  panel.querySelector('#guidesEdYt')?.addEventListener('input', refreshVideoPreview)
  panel.querySelector('#guidesEdTitle')?.addEventListener('input', () => {
    if (!editingId && !panel.querySelector('#guidesEdSlug').value.trim()) {
      panel.querySelector('#guidesEdSlug').value = slugifyTitle(panel.querySelector('#guidesEdTitle').value)
    }
  })

  panel.querySelector('#guidesSaveIntro')?.addEventListener('click', async () => {
    const resEl = panel.querySelector('#guidesIntroResult')
    if (resEl) resEl.textContent = ''
    try {
      const next = cfgToSave()
      await adminPatchSettings({ guides_config: JSON.stringify(next) })
      if (resEl) resEl.textContent = '✅ Đã lưu.'
      window.showToast?.('Đã lưu phần đầu trang hướng dẫn', 'success')
    } catch (e) {
      if (resEl) resEl.textContent = e.message
      window.showToast?.(e.message, 'error')
    }
  })

  panel.querySelector('#guidesAddPost')?.addEventListener('click', () => {
    editingId = null
    clearEditor()
    panel.querySelector('#guidesEdOrder').value = String(posts.length)
    panel.querySelector('#guidesEditorWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    panel.querySelector('#guidesEdTitle')?.focus()
  })

  panel.querySelector('#guidesCancelEd')?.addEventListener('click', () => clearEditor())

  panel.querySelector('#guidesPostsBody')?.addEventListener('click', async e => {
    const editB = e.target.closest('.guides-edit')
    const delB = e.target.closest('.guides-del')
    if (editB) {
      const id = editB.dataset.id
      const p = posts.find(x => x.id === id)
      if (!p) return
      editingId = id
      panel.querySelector('#guidesEditorTitle').textContent = 'Sửa bài'
      fillEditor(p)
      panel.querySelector('#guidesEditorWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }
    if (delB) {
      const id = delB.dataset.id
      const ok = await showConfirm('Xóa bài hướng dẫn', 'Bài sẽ gỡ khỏi site ngay sau khi xóa.', 'Xóa', 'Huỷ', 'danger')
      if (!ok) return
      posts = posts.filter(x => x.id !== id)
      syncPostsToForm()
      renderTable()
      if (editingId === id) clearEditor()
      ;(async () => {
        try {
          await adminPatchSettings({ guides_config: JSON.stringify(cfgToSave()) })
          window.showToast?.('Đã xóa bài', 'success')
        } catch (e) {
          window.showToast?.(e.message, 'error')
        }
      })()
    }
  })

  panel.querySelector('#guidesSavePost')?.addEventListener('click', async () => {
    const resEl = panel.querySelector('#guidesPostResult')
    if (resEl) resEl.textContent = ''
    const title = panel.querySelector('#guidesEdTitle').value.trim()
    let slug = panel.querySelector('#guidesEdSlug').value.trim().toLowerCase().replace(/^\/+|\/+$/g, '')
    if (!title) {
      if (resEl) resEl.textContent = 'Nhập tiêu đề.'
      return
    }
    if (!slug) slug = slugifyTitle(title)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      if (resEl) resEl.textContent = 'Slug chỉ gồm chữ thường, số và gạch ngang.'
      return
    }

    const body = {
      id: panel.querySelector('#guidesEdId').value.trim() || slugifyTitle(title) + '-' + Date.now().toString(36),
      slug,
      title,
      bodyMd: panel.querySelector('#guidesEdBody').value,
      youtubeUrl: panel.querySelector('#guidesEdYt').value.trim(),
      order: parseInt(panel.querySelector('#guidesEdOrder').value, 10) || 0,
      published: panel.querySelector('#guidesEdPublished').checked,
      updatedAt: new Date().toISOString()
    }

    if (posts.some(p => p.slug === slug && p.id !== body.id)) {
      if (resEl) resEl.textContent = 'Slug đã tồn tại.'
      return
    }
    const normalized = normalizeGuidePost(body)
    const ix = posts.findIndex(p => p.id === normalized.id)
    if (ix >= 0) posts[ix] = normalized
    else posts.push(normalized)
    syncPostsToForm()
    renderTable()
    try {
      const next = cfgToSave()
      await adminPatchSettings({ guides_config: JSON.stringify(next) })
      window.showToast?.('Đã lưu bài hướng dẫn', 'success')
      clearEditor()
    } catch (e) {
      if (resEl) resEl.textContent = e.message
      window.showToast?.(e.message, 'error')
    }
  })
}
