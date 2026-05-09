/**
 * Admin tab: manage guide page content stored in settings.guides_config.
 */
import { adminPatchSettings } from '../utils/api.js'
import { showConfirm } from '../utils/confirm.js'
import { parseGuidesConfig, normalizeGuidePost, slugifyTitle, youtubeUrlToEmbed } from '../utils/guides.js'
import { markdownLiteToHtml } from '../utils/markdownLite.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function sortPosts(rows) {
  return rows.map(normalizeGuidePost).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}

function buildGuidesConfig(panel, posts) {
  return {
    introTitle: panel.querySelector('#guidesIntroTitle')?.value?.trim() || 'Hướng dẫn sử dụng',
    introSubtitle: panel.querySelector('#guidesIntroSubtitle')?.value?.trim() || '',
    posts: sortPosts(posts).map(post => ({ ...post })),
  }
}

export function renderAdminGuides(panel, settings = {}, options = {}) {
  const cfg = parseGuidesConfig(settings?.guides_config)
  let posts = sortPosts(cfg.posts)
  let editingId = null
  let saving = false

  function selectedPost() {
    return posts.find(post => post.id === editingId) || null
  }

  function setBusy(button, busy, label) {
    if (!button) return
    if (busy) {
      button.dataset.oldLabel = button.textContent
      button.disabled = true
      button.textContent = label
    } else {
      button.disabled = false
      button.textContent = button.dataset.oldLabel || button.textContent
      delete button.dataset.oldLabel
    }
  }

  async function persist(message, resultEl) {
    if (saving) return false
    saving = true
    const next = buildGuidesConfig(panel, posts)
    try {
      await adminPatchSettings({ guides_config: JSON.stringify(next) })
      options.onSaved?.(next)
      if (resultEl) {
        resultEl.textContent = message
        resultEl.classList.remove('error')
      }
      window.showToast?.(message, 'success')
      return true
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = err.message || 'Không lưu được cấu hình hướng dẫn.'
        resultEl.classList.add('error')
      }
      window.showToast?.(err.message || 'Không lưu được cấu hình hướng dẫn.', 'error')
      return false
    } finally {
      saving = false
    }
  }

  function renderStats() {
    const total = posts.length
    const published = posts.filter(post => post.published !== false).length
    const withVideo = posts.filter(post => youtubeUrlToEmbed(post.youtubeUrl)).length
    const statEl = panel.querySelector('#guidesStats')
    if (!statEl) return
    statEl.innerHTML = `
      <div><span>Tổng bài</span><strong>${total}</strong></div>
      <div><span>Đang hiện</span><strong>${published}</strong></div>
      <div><span>Có video</span><strong>${withVideo}</strong></div>
    `
  }

  function renderTable() {
    const body = panel.querySelector('#guidesPostsBody')
    if (!body) return
    body.innerHTML = posts.length
      ? posts.map((post, index) => {
          const active = post.id === editingId
          return `
            <tr class="${active ? 'active' : ''}" data-id="${escapeAttr(post.id)}">
              <td class="ag-table-index">${index + 1}</td>
              <td>
                <strong>${escapeHtml(post.title)}</strong>
                <code>${escapeHtml(post.slug)}</code>
              </td>
              <td>${youtubeUrlToEmbed(post.youtubeUrl) ? '<span class="ag-pill ok">Video</span>' : '<span class="ag-muted">Không</span>'}</td>
              <td>${post.published !== false ? '<span class="ag-pill live">Hiện</span>' : '<span class="ag-pill off">Ẩn</span>'}</td>
              <td>${post.order}</td>
              <td>
                <div class="ag-row-actions">
                  <button type="button" class="btn btn-sm btn-outline guides-edit" data-id="${escapeAttr(post.id)}">Sửa</button>
                  <button type="button" class="btn btn-sm btn-danger guides-del" data-id="${escapeAttr(post.id)}">Xóa</button>
                </div>
              </td>
            </tr>
          `
        }).join('')
      : `
        <tr>
          <td colspan="6">
            <div class="ag-empty">
              <strong>Chưa có bài hướng dẫn</strong>
              <span>Bấm Thêm bài để tạo bài đầu tiên cho trang công khai.</span>
            </div>
          </td>
        </tr>
      `
    renderStats()
  }

  function renderVideoPreview() {
    const url = panel.querySelector('#guidesEdYt')?.value?.trim() || ''
    const wrap = panel.querySelector('#guidesVideoPreview')
    const hint = panel.querySelector('#guidesYtHint')
    if (!wrap) return
    const embed = youtubeUrlToEmbed(url)
    if (hint) {
      hint.textContent = embed
        ? 'Link hợp lệ. Video sẽ hiện trên trang hướng dẫn.'
        : url
          ? 'Không nhận dạng được link YouTube. Hỗ trợ watch, youtu.be, shorts và embed.'
          : 'Để trống nếu bài chỉ cần nội dung chữ.'
      hint.classList.toggle('ok', Boolean(embed))
      hint.classList.toggle('warn', Boolean(url && !embed))
    }
    wrap.innerHTML = embed
      ? `<div class="admin-guides-video-frame"><iframe class="admin-guides-video-iframe" src="${escapeAttr(embed)}" title="Xem trước video" allowfullscreen loading="lazy"></iframe></div>`
      : `<p class="admin-guides-video-empty">${url ? 'Không xem trước được. Kiểm tra lại URL.' : 'Chưa có link video.'}</p>`
  }

  function renderMarkdownPreview() {
    const preview = panel.querySelector('#guidesPreview')
    const value = panel.querySelector('#guidesEdBody')?.value || ''
    if (preview) preview.innerHTML = value.trim() ? markdownLiteToHtml(value) : '<p class="ag-muted">Nhập nội dung để xem trước.</p>'
  }

  function fillEditor(post) {
    editingId = post?.id || null
    panel.querySelector('#guidesEdId').value = post?.id || ''
    panel.querySelector('#guidesEdTitle').value = post?.title || ''
    panel.querySelector('#guidesEdSlug').value = post?.slug || ''
    panel.querySelector('#guidesEdOrder').value = String(post?.order ?? posts.length)
    panel.querySelector('#guidesEdPublished').checked = post?.published !== false
    panel.querySelector('#guidesEdYt').value = post?.youtubeUrl || ''
    panel.querySelector('#guidesEdBody').value = post?.bodyMd || ''
    panel.querySelector('#guidesEditorTitle').textContent = post ? 'Sửa bài hướng dẫn' : 'Thêm bài mới'
    panel.querySelector('#guidesSavePost').textContent = post ? 'Lưu thay đổi' : 'Tạo bài'
    renderVideoPreview()
    renderMarkdownPreview()
    renderTable()
  }

  function clearEditor() {
    fillEditor(null)
  }

  panel.innerHTML = `
    <div class="ag-page">
      <section class="ag-card ag-intro-card">
        <div class="ag-card-head">
          <div>
            <span class="ag-kicker">Trang công khai</span>
            <h3>Tiêu đề trang hướng dẫn</h3>
            <p>Thông tin này hiện ở đầu trang #/guides.</p>
          </div>
          <button type="button" class="btn btn-primary" id="guidesSaveIntro">Lưu phần đầu trang</button>
        </div>
        <div class="ag-intro-grid">
          <label class="ag-field">
            <span>Tiêu đề chính</span>
            <input type="text" id="guidesIntroTitle" value="${escapeAttr(cfg.introTitle)}">
          </label>
          <label class="ag-field ag-field--wide">
            <span>Mô tả phụ</span>
            <input type="text" id="guidesIntroSubtitle" value="${escapeAttr(cfg.introSubtitle)}">
          </label>
        </div>
        <p class="ag-result" id="guidesIntroResult" aria-live="polite"></p>
      </section>

      <div class="ag-layout">
        <section class="ag-card ag-list-card">
          <div class="ag-card-head">
            <div>
              <span class="ag-kicker">Danh sách bài</span>
              <h3>Bài hướng dẫn</h3>
              <p>Quản lý thứ tự, trạng thái hiển thị và video đính kèm.</p>
            </div>
            <button type="button" class="btn btn-success" id="guidesAddPost">Thêm bài</button>
          </div>
          <div class="ag-stats" id="guidesStats"></div>
          <div class="ag-table-wrap">
            <table class="ag-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tiêu đề / slug</th>
                  <th>Video</th>
                  <th>Trạng thái</th>
                  <th>Thứ tự</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="guidesPostsBody"></tbody>
            </table>
          </div>
        </section>

        <aside class="ag-card ag-editor-card" id="guidesEditorWrap">
          <div class="ag-card-head ag-card-head--compact">
            <div>
              <span class="ag-kicker">Biên tập</span>
              <h3 id="guidesEditorTitle">Thêm bài mới</h3>
            </div>
            <button type="button" class="btn btn-sm btn-outline" id="guidesCancelEd">Làm mới</button>
          </div>
          <input type="hidden" id="guidesEdId" value="">

          <div class="ag-editor-grid">
            <label class="ag-field ag-field--wide">
              <span>Tiêu đề</span>
              <input type="text" id="guidesEdTitle" placeholder="VD: Cách thanh toán">
            </label>
            <label class="ag-field">
              <span>Slug URL</span>
              <input type="text" id="guidesEdSlug" placeholder="vd: cach-thanh-toan">
            </label>
            <label class="ag-field">
              <span>Thứ tự</span>
              <input type="number" id="guidesEdOrder" value="0" min="0">
            </label>
            <label class="ag-check ag-field--wide">
              <input type="checkbox" id="guidesEdPublished" checked>
              <span>Xuất bản trên website</span>
            </label>
            <label class="ag-field ag-field--wide">
              <span>Video YouTube</span>
              <input type="url" id="guidesEdYt" placeholder="https://www.youtube.com/watch?v=...">
            </label>
            <p class="ag-help ag-field--wide" id="guidesYtHint"></p>
            <div class="ag-field ag-field--wide">
              <span>Xem trước video</span>
              <div id="guidesVideoPreview" class="admin-guides-video-preview"></div>
            </div>
            <label class="ag-field ag-field--wide">
              <span>Nội dung Markdown</span>
              <textarea id="guidesEdBody" rows="12" placeholder="## Phần 1&#10;&#10;Nội dung..."></textarea>
            </label>
            <div class="ag-field ag-field--wide">
              <span>Xem trước nội dung</span>
              <div id="guidesPreview" class="guides-body prose-like admin-guides-preview"></div>
            </div>
          </div>

          <div class="ag-editor-actions">
            <button type="button" class="btn btn-primary" id="guidesSavePost">Tạo bài</button>
            <p class="ag-result" id="guidesPostResult" aria-live="polite"></p>
          </div>
        </aside>
      </div>
    </div>
  `

  renderTable()
  clearEditor()

  panel.querySelector('#guidesEdBody')?.addEventListener('input', renderMarkdownPreview)
  panel.querySelector('#guidesEdYt')?.addEventListener('input', renderVideoPreview)
  panel.querySelector('#guidesEdTitle')?.addEventListener('input', () => {
    const title = panel.querySelector('#guidesEdTitle')?.value || ''
    const slugInput = panel.querySelector('#guidesEdSlug')
    if (!editingId && slugInput && !slugInput.value.trim()) slugInput.value = slugifyTitle(title)
  })

  panel.querySelector('#guidesSaveIntro')?.addEventListener('click', async event => {
    const result = panel.querySelector('#guidesIntroResult')
    if (result) result.textContent = ''
    setBusy(event.currentTarget, true, 'Đang lưu...')
    await persist('Đã lưu phần đầu trang.', result)
    setBusy(event.currentTarget, false)
  })

  panel.querySelector('#guidesAddPost')?.addEventListener('click', () => {
    clearEditor()
    panel.querySelector('#guidesEdOrder').value = String(posts.length)
    panel.querySelector('#guidesEditorWrap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    panel.querySelector('#guidesEdTitle')?.focus()
  })

  panel.querySelector('#guidesCancelEd')?.addEventListener('click', () => clearEditor())

  panel.querySelector('#guidesPostsBody')?.addEventListener('click', async event => {
    const editBtn = event.target.closest('.guides-edit')
    const deleteBtn = event.target.closest('.guides-del')

    if (editBtn) {
      const post = posts.find(item => item.id === editBtn.dataset.id)
      if (!post) return
      fillEditor(post)
      panel.querySelector('#guidesEditorWrap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }

    if (deleteBtn) {
      const post = posts.find(item => item.id === deleteBtn.dataset.id)
      if (!post) return
      const ok = await showConfirm('Xóa bài hướng dẫn', 'Bài sẽ bị gỡ khỏi trang hướng dẫn ngay sau khi xóa.', 'Xóa', 'Hủy', 'danger')
      if (!ok) return
      const before = posts
      posts = posts.filter(item => item.id !== post.id)
      if (editingId === post.id) editingId = null
      renderTable()
      const saved = await persist('Đã xóa bài hướng dẫn.', panel.querySelector('#guidesPostResult'))
      if (!saved) {
        posts = before
        renderTable()
      } else if (!selectedPost()) {
        clearEditor()
      }
    }
  })

  panel.querySelector('#guidesSavePost')?.addEventListener('click', async event => {
    const result = panel.querySelector('#guidesPostResult')
    if (result) {
      result.textContent = ''
      result.classList.remove('error')
    }

    const title = panel.querySelector('#guidesEdTitle')?.value.trim() || ''
    let slug = panel.querySelector('#guidesEdSlug')?.value.trim().toLowerCase().replace(/^\/+|\/+$/g, '') || ''
    if (!title) {
      if (result) {
        result.textContent = 'Nhập tiêu đề bài.'
        result.classList.add('error')
      }
      return
    }
    if (!slug) slug = slugifyTitle(title)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      if (result) {
        result.textContent = 'Slug chỉ gồm chữ thường, số và gạch ngang.'
        result.classList.add('error')
      }
      return
    }

    const id = panel.querySelector('#guidesEdId')?.value.trim() || `${slug}-${Date.now().toString(36)}`
    if (posts.some(post => post.slug === slug && post.id !== id)) {
      if (result) {
        result.textContent = 'Slug đã tồn tại.'
        result.classList.add('error')
      }
      return
    }

    const nextPost = normalizeGuidePost({
      id,
      slug,
      title,
      order: Number.parseInt(panel.querySelector('#guidesEdOrder')?.value, 10) || 0,
      published: panel.querySelector('#guidesEdPublished')?.checked !== false,
      youtubeUrl: panel.querySelector('#guidesEdYt')?.value.trim() || '',
      bodyMd: panel.querySelector('#guidesEdBody')?.value || '',
      updatedAt: new Date().toISOString(),
    })

    const before = posts
    const index = posts.findIndex(post => post.id === nextPost.id)
    posts = index >= 0
      ? posts.map(post => post.id === nextPost.id ? nextPost : post)
      : [...posts, nextPost]
    posts = sortPosts(posts)
    editingId = nextPost.id
    renderTable()

    setBusy(event.currentTarget, true, 'Đang lưu...')
    const saved = await persist('Đã lưu bài hướng dẫn.', result)
    setBusy(event.currentTarget, false)
    if (saved) {
      clearEditor()
    } else {
      posts = before
      renderTable()
    }
  })
}
