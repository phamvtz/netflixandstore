/**
 * Cấu hình bài hướng dẫn (settings.guides_config - JSON string)
 */
export function slugifyTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'bai-' + Date.now().toString(36)
}

export function parseGuidesConfig(raw) {
  const empty = {
    introTitle: 'Hướng dẫn sử dụng',
    introSubtitle: 'Các bài hướng dẫn chi tiết giúp bạn sử dụng dịch vụ dễ dàng và hiệu quả nhất.',
    posts: [],
  }
  if (raw == null || raw === '') return empty
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw)
  try {
    const j = JSON.parse(str)
    return {
      introTitle: typeof j.introTitle === 'string' ? j.introTitle : empty.introTitle,
      introSubtitle: typeof j.introSubtitle === 'string' ? j.introSubtitle : empty.introSubtitle,
      posts: Array.isArray(j.posts) ? j.posts.filter(p => p && typeof p === 'object') : [],
    }
  } catch {
    return empty
  }
}

/** Trả về URL embed youtube-nocookie hợp lệ hoặc null (chỉ nhận link YouTube chuẩn). */
export function youtubeUrlToEmbed(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const idOk = id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)
  try {
    const u = new URL(s, 'https://www.youtube.com')
    let host = u.hostname.toLowerCase()
    if (host.startsWith('www.')) host = host.slice(4)
    if (host === 'm.youtube.com') host = 'youtube.com'
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return idOk(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null
    }
    if (host === 'youtube.com') {
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.slice(7).split('/')[0]
        return idOk(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null
      }
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/').filter(Boolean)[1]
        return idOk(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null
      }
      const v = u.searchParams.get('v')
      if (idOk(v)) return `https://www.youtube-nocookie.com/embed/${v}?rel=0`
    }
  } catch {
    return null
  }
  return null
}

export function normalizeGuidePost(p) {
  const id = p.id || slugifyTitle(p.title || 'post')
  const slug = (p.slug && String(p.slug).trim()) || slugifyTitle(p.title || id)
  return {
    id,
    slug,
    title: String(p.title || '').trim() || 'Không tiêu đề',
    bodyMd: String(p.bodyMd || p.body || ''),
    youtubeUrl: String(p.youtubeUrl || '').trim(),
    order: Number.isFinite(Number(p.order)) ? Number(p.order) : 0,
    published: p.published !== false,
    updatedAt: p.updatedAt || new Date().toISOString(),
  }
}
