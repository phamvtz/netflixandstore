/** Ngữ cảnh gian hàng khi khách vào từ #/s/:slug — dùng khi tạo subscription/payment */
export const CHECKOUT_STORE_KEY = 'nf_checkout_store'

const OBJECTID_RE = /^[0-9a-f]{24}$/i

/** @returns {{ id: string, slug: string } | null} */
export function getCheckoutStore() {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_STORE_KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    const id = j?.id
    if (typeof id !== 'string' || !OBJECTID_RE.test(id)) return null
    return { id, slug: typeof j.slug === 'string' ? j.slug : '' }
  } catch {
    return null
  }
}


export function setCheckoutStore(store) {
  if (!store?.id) return
  try {
    sessionStorage.setItem(
      CHECKOUT_STORE_KEY,
      JSON.stringify({ id: store.id, slug: store.slug || '' })
    )
  } catch (_) {}
}

export function clearCheckoutStore() {
  try {
    sessionStorage.removeItem(CHECKOUT_STORE_KEY)
  } catch (_) {}
}
