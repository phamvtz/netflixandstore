// src/utils/netflix.js — Frontend calls to backend API proxy

async function apiFetch(path, body) {
  let res
  try {
    res = await fetch(path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    })
  } catch {
    throw new Error('Không thể kết nối server. Vui lòng thử lại.')
  }

  if (!res.ok) {
    let msg = `Server lỗi (${res.status})`
    try { const d = await res.json(); msg = d.message || msg } catch {}
    throw new Error(msg)
  }

  return res.json()
}

// POST cookie → get nftoken login link
export async function apiGetLink(cookie) {
  return apiFetch('/api/get-link', { cookie })
}

// POST cookie → check if cookie is alive
export async function apiCheckCookie(cookie) {
  return apiFetch('/api/check-cookie', { cookie })
}

/**
 * POST cookie → kiểm tra alive + có gói Premium không
 * @returns {{ alive, hasPremium, plan, email, screens, needsWarranty, reason }}
 * reason: 'cookie_dead' | 'plan_lost' | null
 */
export async function apiCheckPlanStatus(cookie) {
  return apiFetch('/api/check-plan-status', { cookie })
}

// POST cookie → GET netflix.com/tv8 → return authUrl
export async function apiTvInit(cookie) {
  return apiFetch('/api/tv-init', { cookie })
}

// POST cookie + authUrl + code → submit TV code
export async function apiTvSubmit(cookie, authUrl, code) {
  return apiFetch('/api/tv-submit', { cookie, authUrl, code })
}
