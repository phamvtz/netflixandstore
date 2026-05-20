const fs = require('fs')
const path = require('path')
const p = path.join(__dirname, '..', 'src', 'pages', 'Admin.js')
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/)

const start = lines.findIndex((l) => l.includes("const st = r.status === 'resolved' ?"))
const end = lines.findIndex((l, i) => i > start && l.trim() === "}).join('')")
if (start < 0 || end < 0) {
  console.error('range not found', start, end)
  process.exit(1)
}

const newLines = [
  "            const st =",
  "              r.status === 'resolved'",
  "                ? '<span class=\"status-badge status-active\">Da doi acc / xong</span>'",
  "                : r.status === 'rejected'",
  "                  ? '<span class=\"status-badge status-expired\">Da tu choi</span>'",
  "                  : '<span class=\"status-badge status-active\">Cho xu ly</span>'",
  "            const when = r.created_at ? formatDate(r.created_at) : '—'",
  "            const subSt = r.sub_status ? statusLabel(r.sub_status) : '—'",
  "            const actions =",
  "              r.status === 'open'",
  '                ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">',
  '                    <button type="button" class="btn btn-sm btn-primary vr-assign-btn" data-id="${escapeAttr(r.id)}"',
  '                      title="Gan tu kho — de trong UUID = claim_warranty">Doi acc kho</button>',
  '                    <button type="button" class="btn btn-sm btn-outline vr-reject-btn" data-id="${escapeAttr(r.id)}">Tu choi…</button>',
  '                  </div>`',
  '                : `<button type="button" class="btn btn-sm btn-outline vr-reopen-btn" data-id="${escapeAttr(r.id)}">Mo lai</button>`',
  '            return `<tr data-vr-id="${escapeAttr(r.id)}">',
  '              <td>${escapeHtml(when)}</td>',
  "              <td><code style=\"font-size:11px;\">${escapeHtml(r.user_email || r.user_id || '—')}</code></td>",
  "              <td><code style=\"font-size:11px;\">${escapeHtml(String(r.subscription_id || '').slice(0, 8))}…</code></td>",
  "              <td>${escapeHtml(r.sub_plan || '—')}</td>",
  '              <td>${escapeHtml(subSt)}</td>',
  '              <td>${st}</td>',
  "              <td style=\"max-width:220px;font-size:12px;\">${escapeHtml(r.admin_note || '—')}</td>",
  '              <td>${actions}</td>',
  '            </tr>`'
]

const out = [...lines.slice(0, start), ...newLines, ...lines.slice(end)]
fs.writeFileSync(p, out.join('\n'))
console.log('patched lines', start + 1, '-', end + 1)
