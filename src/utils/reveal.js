/**
 * IntersectionObserver helper — thêm `.revealed` vào mọi `.reveal` trong container
 * khi phần tử vào viewport, tạo hiệu ứng fade-up mượt (không giật khi load).
 */
export function observeReveal(container) {
  const els = container.querySelectorAll('.reveal')
  if (!els.length) return

  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('revealed'))
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed')
          io.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  )

  els.forEach(el => io.observe(el))
}

/**
 * CountUp — tăng số từ 0 → target khi phần tử visible.
 * @param {HTMLElement} el - phần tử chứa số.
 * @param {number} target - số đích.
 * @param {number} duration - thời gian ms.
 * @param {string} suffix - hậu tố (vd: '+', '%', '/7').
 */
export function countUp(el, target, duration = 1200, suffix = '') {
  if (!el) return
  if (!('IntersectionObserver' in window)) {
    el.textContent = target + suffix
    return
  }

  let started = false
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !started) {
          started = true
          io.disconnect()
          const start = performance.now()
          const step = (now) => {
            const t = Math.min((now - start) / duration, 1)
            const ease = 1 - Math.pow(1 - t, 3)
            const cur = Math.round(ease * target)
            el.textContent = cur.toLocaleString('vi-VN') + suffix
            if (t < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }
      })
    },
    { threshold: 0.5 }
  )
  io.observe(el)
}
