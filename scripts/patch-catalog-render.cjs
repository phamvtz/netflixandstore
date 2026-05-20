#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')

const target = path.resolve(__dirname, '../src/pages/Plans.js')
let src = fs.readFileSync(target, 'utf8')

// Find the section to replace
const startMarker = 'function renderCatalogPage(container, categories, settings = {}) {'
const endMarker   = '}\n\nfunction renderFreePlans('

const startIdx = src.indexOf(startMarker)
if (startIdx === -1) { console.error('START marker not found'); process.exit(1) }

// Walk backwards past the comment block
let blockStart = startIdx
// Find back to the // === comment line before the function
const commentStart = src.lastIndexOf('//', startIdx)
if (commentStart !== -1) {
  const lineStart = src.lastIndexOf('\n', commentStart) + 1
  blockStart = lineStart
}

const endIdx = src.indexOf(endMarker, startIdx)
if (endIdx === -1) { console.error('END marker not found'); process.exit(1) }
const afterEnd = endIdx + 2 // skip the }\n

const newFn = `// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// renderCatalogPage \u2014 Premium redesign
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
function renderCatalogPage(container, categories, settings = {}) {
  const telegramLink = settings.contact_telegram || null

  if (!categories || !categories.length) {
    renderOtherProductsEmpty(container)
    return
  }

  const _e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const fmt = n => n || n === 0 ? Number(n).toLocaleString('vi-VN') + '\\u20ab' : '\\u2014'

  // ── Product card ─────────────────────────────────────────────
  const renderCard = (prod, color) => {
    const variants = prod.variants || []
    const first    = variants[0]
    const tabs = variants.map((v, i) =>
      \`<button type="button" class="cprod-var\${i === 0 ? ' is-active' : ''}"
        data-price="\${v.price || 0}" data-label="\${_e(v.name || v.label || '')}"
        data-vid="\${_e(v.id)}">\${_e(v.name || v.label || ('G\\u00f3i ' + (i+1)))}</button>\`
    ).join('')
    const href   = telegramLink || '#/login'
    const tgt    = telegramLink ? 'target="_blank" rel="noopener"' : ''
    const label  = telegramLink ? 'Li\\u00ean h\\u1ec7 \\u0111\\u1eb7t h\\u00e0ng' : '\\u0110\\u0103ng nh\\u1eadp \\u0111\\u1ec3 mua'
    const priceBlock = variants.length
      ? \`<div class="cprod-vars">\${tabs}</div>
         <div class="cprod-price-row">
           <span class="cprod-price">\${fmt(first?.price)}</span>
           <span class="cprod-per">/ \${_e(first?.name || '')}</span>
         </div>\`
      : \`<div class="cprod-price-row"><span class="cprod-price cprod-price--contact">Li\\u00ean h\\u1ec7</span></div>\`
    return \`<div class="cprod-card" style="--cc:\${color}">
  <div class="cprod-accent"></div>
  <div class="cprod-body">
    \${prod.icon ? \`<div class="cprod-emoji">\${prod.icon}</div>\` : ''}
    <h3 class="cprod-name">\${_e(prod.name)}</h3>
    \${prod.shortDescription ? \`<p class="cprod-desc">\${_e(prod.shortDescription)}</p>\` : ''}
    \${priceBlock}
    <a href="\${href}" \${tgt} class="cprod-cta btn btn-primary">\${label}</a>
  </div>
</div>\`
  }

  // ── Category section ─────────────────────────────────────────
  const sections = categories.map(cat => {
    const color = cat.color || '#818CF8'
    const cards = (cat.products || []).map(p => renderCard(p, color)).join('')
    return \`<section class="cpage-section" id="cat-\${_e(cat.id)}" style="--cc:\${color}">
  <div class="cpage-sec-hd">
    \${cat.icon ? \`<span class="cpage-sec-emoji">\${cat.icon}</span>\` : ''}
    <div class="cpage-sec-text">
      <h2 class="cpage-sec-name">\${_e(cat.name)}</h2>
      \${cat.description ? \`<p class="cpage-sec-desc">\${_e(cat.description)}</p>\` : ''}
    </div>
    <span class="cpage-sec-badge">\${(cat.products||[]).length} s\\u1ea3n ph\\u1ea9m</span>
  </div>
  <div class="cprod-grid">\${cards}</div>
</section>\`
  }).join('')

  // ── Category nav pills ────────────────────────────────────────
  const navHtml = categories.length > 1
    ? categories.map(c => \`<button type="button" class="cpage-pill" data-scroll-to="cat-\${_e(c.id)}" style="--cc:\${c.color||'#818CF8'}">
        \${c.icon ? \`<span class="cpage-pill-icon">\${c.icon}</span>\` : ''}<span>\${_e(c.name)}</span>
      </button>\`).join('')
    : ''

  // ── Summary stats ─────────────────────────────────────────────
  const totalProd = categories.reduce((s, c) => s + (c.products||[]).length, 0)
  const allPrices = categories.flatMap(c =>
    (c.products||[]).flatMap(p => (p.variants||[]).map(v => v.price||0))
  ).filter(p => p > 0)
  const minPrice = allPrices.length ? Math.min(...allPrices) : null

  // ── Render ────────────────────────────────────────────────────
  container.innerHTML = \`<div class="cpage-root">

  <div class="cpage-hero">
    <div class="cpage-hero-glow"></div>
    <div class="page-container cpage-hero-inner">
      <a href="#/products" class="cpage-back">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        D\\u1ecbch v\\u1ee5
      </a>
      <h1 class="cpage-hero-title">S\\u1ea3n ph\\u1ea9m kh\\u00e1c</h1>
      <p class="cpage-hero-sub">D\\u1ecbch v\\u1ee5 s\\u1ed1, ph\\u1ea7n m\\u1ec1m v\\u00e0 \\u1ee9ng d\\u1ee5ng cao c\\u1ea5p \\u2014 k\\u00edch ho\\u1ea1t nhanh, h\\u1ed7 tr\\u1ee3 24/7</p>
      <div class="cpage-hero-stats">
        <div class="cpage-stat"><span class="cpage-stat-num">\${categories.length}</span><span class="cpage-stat-lbl">Danh m\\u1ee5c</span></div>
        <div class="cpage-stat-div"></div>
        <div class="cpage-stat"><span class="cpage-stat-num">\${totalProd}</span><span class="cpage-stat-lbl">S\\u1ea3n ph\\u1ea9m</span></div>
        \${minPrice ? \`<div class="cpage-stat-div"></div><div class="cpage-stat"><span class="cpage-stat-num">\${fmt(minPrice)}</span><span class="cpage-stat-lbl">T\\u1eeb</span></div>\` : ''}
      </div>
    </div>
  </div>

  \${navHtml ? \`<div class="cpage-nav-bar" id="cpageNavBar"><div class="page-container cpage-nav-inner">\${navHtml}</div></div>\` : ''}

  <div class="page-container cpage-body">
    <div class="cpage-sections">\${sections}</div>
  </div>

</div>\`

  // Scroll-to
  container.querySelectorAll('[data-scroll-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })

  // Scrollspy
  const navBar = container.querySelector('#cpageNavBar')
  if (navBar && categories.length > 1) {
    const pills  = [...navBar.querySelectorAll('.cpage-pill')]
    const secEls = [...container.querySelectorAll('.cpage-section')]
    const setActive = id => pills.forEach(p => p.classList.toggle('is-active', p.dataset.scrollTo === id))
    if (pills[0]) pills[0].classList.add('is-active')
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id) })
    }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 })
    secEls.forEach(s => io.observe(s))
    const mo = new MutationObserver(() => { io.disconnect(); mo.disconnect() })
    mo.observe(container, { childList: true })
  }

  // Variant tabs
  container.querySelectorAll('.cprod-card').forEach(card => {
    const tabs    = [...card.querySelectorAll('.cprod-var')]
    const priceEl = card.querySelector('.cprod-price')
    const perEl   = card.querySelector('.cprod-per')
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('is-active'))
        tab.classList.add('is-active')
        if (priceEl) priceEl.textContent = fmt(Number(tab.dataset.price))
        if (perEl)   perEl.textContent   = '/ ' + tab.dataset.label
      })
    })
  })
}
`

const before = src.slice(0, blockStart)
const after  = src.slice(afterEnd)
const result = before + newFn + '\n' + after

fs.writeFileSync(target, result, 'utf8')
console.log('Done. Wrote', result.length, 'bytes. Lines:', result.split('\n').length)
