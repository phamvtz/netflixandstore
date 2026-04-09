import { markdownLiteToHtml } from '../utils/markdownLite.js'
import { fetchGuides } from '../utils/api.js'
import { youtubeUrlToEmbed } from '../utils/guides.js'

function escapeText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function renderGuides(container, params = {}) {
  const slug = params.slug ? decodeURIComponent(params.slug) : null

  container.innerHTML = `
    <div class="guides-page guides-page--loading">
      <div class="guides-shell">
        <div class="guides-loading"><div class="spinner"></div></div>
      </div>
    </div>`
  const root = container.querySelector('.guides-page')

  let data
  try {
    data = await fetchGuides()
  } catch (e) {
    root.innerHTML = `
      <div class="guides-shell">
        <div class="guides-state guides-state--error">
          <p class="guides-state-text">Không tải được hướng dẫn: ${escapeText(e.message)}</p>
          <a href="#/" class="btn btn-primary">Về trang chủ</a>
        </div>
      </div>`
    root.classList.remove('guides-page--loading')
    return
  }

  root.classList.remove('guides-page--loading')

  const posts = data.posts || []
  const one = slug ? posts.find(p => p.slug === slug || p.id === slug) : null

  if (slug && !one) {
    root.innerHTML = `
      <div class="guides-shell">
        <div class="guides-state guides-state--notfound reveal revealed">
          <span class="guides-state-icon" aria-hidden="true">📄</span>
          <h1 class="guides-state-title">Không tìm thấy bài</h1>
          <p class="guides-state-lead">Đường dẫn không hợp lệ hoặc bài đã gỡ.</p>
          <a href="#/guides" class="btn btn-primary">← Tất cả hướng dẫn</a>
        </div>
      </div>`
    return
  }

  if (one) {
    document.title = one.title + ' — Hướng dẫn'
    const bodyHtml = markdownLiteToHtml(one.bodyMd || '')
    const embed = youtubeUrlToEmbed(one.youtubeUrl)
    const videoSection = embed
      ? `
      <section class="guides-video reveal revealed" aria-label="Video hướng dẫn">
        <div class="guides-video-inner">
          <iframe
            class="guides-video-iframe"
            src="${embed}"
            title="${escapeText('Video — ' + one.title)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      </section>`
      : ''

    root.innerHTML = `
      <div class="guides-shell">
        <article class="guides-article-card reveal revealed">
          <nav class="guides-breadcrumb">
            <a href="#/guides">Hướng dẫn</a>
            <span class="guides-bc-sep" aria-hidden="true">/</span>
            <span class="guides-bc-current">${escapeText(one.title)}</span>
          </nav>
          <h1 class="guides-article-title">${escapeText(one.title)}</h1>
          ${videoSection}
          <div class="guides-body prose-like">${bodyHtml}</div>
          <footer class="guides-article-foot">
            <a href="#/guides" class="btn btn-outline">← Quay lại danh sách</a>
          </footer>
        </article>
      </div>`
    return
  }

  document.title = 'Hướng dẫn sử dụng — ' + (window.__siteSettings?.site_name || 'Store')

  const cards = posts.length
    ? posts.map((p, i) => {
        const hasVideo = !!youtubeUrlToEmbed(p.youtubeUrl)
        return `
      <a href="#/guides/${encodeURIComponent(p.slug)}" class="guides-card reveal reveal--delay-${Math.min(i + 1, 5)}">
        <div class="guides-card-head">
          <span class="guides-card-icon" aria-hidden="true">${hasVideo ? '▶' : '📘'}</span>
          ${hasVideo ? '<span class="guides-card-badge">Video</span>' : ''}
        </div>
        <div class="guides-card-body">
          <h2 class="guides-card-title">${escapeText(p.title)}</h2>
          <span class="guides-card-cta">Xem bài <span aria-hidden="true">→</span></span>
        </div>
      </a>`
      }).join('')
    : ''

  const emptyBlock = !posts.length
    ? `<div class="guides-empty reveal revealed">
         <span class="guides-empty-icon" aria-hidden="true">📚</span>
         <h2 class="guides-empty-title">Chưa có bài hướng dẫn</h2>
         <p class="guides-empty-text">Quản trị viên có thể thêm bài kèm video YouTube trong <strong>Admin → Hướng dẫn</strong>.</p>
       </div>`
    : `<div class="guides-grid">${cards}</div>`

  root.innerHTML = `
    <div class="guides-shell">
      <header class="guides-hero reveal revealed">
        <span class="guides-eyebrow">Trung tâm trợ giúp</span>
        <h1 class="guides-hero-title">${escapeText(data.introTitle || 'Hướng dẫn sử dụng')}</h1>
        <p class="guides-lead">${escapeText(data.introSubtitle || '')}</p>
      </header>
      ${emptyBlock}
    </div>`
}
