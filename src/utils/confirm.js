/**
 * Hộp thoại xác nhận tùy chỉnh — thay thế browser confirm().
 * @param {string} title
 * @param {string} message
 * @param {string} okLabel
 * @param {string} cancelLabel
 * @param {'danger'|'primary'} okVariant
 * @returns {Promise<boolean>}
 */
export function showConfirm(title, message = '', okLabel = 'Xác nhận', cancelLabel = 'Huỷ', okVariant = 'danger') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'confirm-overlay'
    overlay.innerHTML = `
      <div class="confirm-box">
        <h3>${title}</h3>
        ${message ? `<p>${message}</p>` : ''}
        <div class="confirm-actions">
          <button class="btn btn-outline btn-sm" id="confirmCancel">${cancelLabel}</button>
          <button class="btn btn-${okVariant} btn-sm" id="confirmOk">${okLabel}</button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)

    const close = (result) => {
      overlay.remove()
      resolve(result)
    }

    overlay.querySelector('#confirmOk').addEventListener('click', () => close(true))
    overlay.querySelector('#confirmCancel').addEventListener('click', () => close(false))
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false) })

    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', esc) }
    })
  })
}
