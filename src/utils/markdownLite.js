/** Markdown tối giản → HTML an toàn (không dùng thư viện ngoài) */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeHref(url) {
  const u = String(url || '').trim()
  if (/^https?:\/\//i.test(u)) return u
  return ''
}

function inlineFormat(s) {
  let x = escapeHtml(s)
  x = x.replace(/`([^`]+)`/g, (_, code) => '<code>' + escapeHtml(code) + '</code>')
  x = x.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, href) => {
    const h = safeHref(href)
    if (!h) return t
    return '<a href="' + escapeHtml(h) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(t) + '</a>'
  })
  return x
}

export function markdownLiteToHtml(src) {
  if (!src) return ''
  const lines = String(src).split('\n')
  const out = []
  let inList = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (t.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push('<h3>' + escapeHtml(t.slice(4)) + '</h3>')
      continue
    }
    if (t.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push('<h2>' + escapeHtml(t.slice(3)) + '</h2>')
      continue
    }
    if (t.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push('<h2>' + escapeHtml(t.slice(2)) + '</h2>')
      continue
    }
    if (t.startsWith('- ') || t.startsWith('* ')) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push('<li>' + inlineFormat(t.slice(2)) + '</li>')
      continue
    }
    if (inList && t === '') {
      out.push('</ul>')
      inList = false
      continue
    }
    if (inList) {
      out.push('</ul>')
      inList = false
    }
    if (t === '') continue
    out.push('<p>' + inlineFormat(t) + '</p>')
  }
  if (inList) out.push('</ul>')
  return out.join('')
}
