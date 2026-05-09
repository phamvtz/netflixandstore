/**
 * src/utils/auth.js
 * Custom auth dùng MongoDB + JWT (không dùng Supabase)
 * API: POST /api/auth/login | /api/auth/register | /api/auth/logout | GET /api/auth/me
 */

const TOKEN_KEY = 'nx_auth_token'
const USER_KEY  = 'nx_auth_user'

// ── Storage helpers ──────────────────────────────────────
function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || null
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ── Auth state ───────────────────────────────────────────
let currentUser    = getStoredUser()
let currentProfile = getStoredUser()   // same object — contains role, email
const listeners = []

export function onAuthChange(cb) {
  listeners.push(cb)
  return () => {
    const idx = listeners.indexOf(cb)
    if (idx > -1) listeners.splice(idx, 1)
  }
}

function notifyListeners() {
  listeners.forEach(cb => cb(currentUser, currentProfile))
}

// ── API call helper ──────────────────────────────────────
async function apiCall(path, options = {}) {
  const token = getStoredToken()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(path, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
  return data
}

// ── Init (chạy khi app khởi động) ───────────────────────
export async function initAuth() {
  const token = getStoredToken()
  if (!token) {
    currentUser = null
    currentProfile = null
    notifyListeners()
    return
  }
  // Verify token còn hợp lệ không
  try {
    const data = await apiCall('/api/auth/me')
    currentUser    = data.user
    currentProfile = data.user
    saveSession(token, data.user)
  } catch {
    // Token hết hạn / invalid → clear
    clearSession()
    currentUser    = null
    currentProfile = null
  }
  notifyListeners()
}

// ── Auth actions ─────────────────────────────────────────
export async function signIn(email, password) {
  const data = await apiCall('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
  saveSession(data.token, data.user)
  currentUser    = data.user
  currentProfile = data.user
  notifyListeners()
  return data
}

export async function signUp(email, password) {
  const data = await apiCall('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
  saveSession(data.token, data.user)
  currentUser    = data.user
  currentProfile = data.user
  notifyListeners()
  // Trả về object có session để tương thích với Login.js logic
  return { session: { user: data.user }, user: data.user }
}

export async function signOut() {
  try { await apiCall('/api/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
  clearSession()
  currentUser    = null
  currentProfile = null
  notifyListeners()
}

/** Gửi lại email xác nhận — không cần thiết khi dùng MongoDB auth, no-op */
export async function resendConfirmation(_email) {
  // MongoDB auth không dùng email confirmation
  return
}

/** Reset password — gửi email reset nếu có SMTP */
export async function resetPassword(email) {
  await apiCall('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
}

// ── Getters ──────────────────────────────────────────────
export function getUser()     { return currentUser }
export function getProfile()  { return currentProfile }
export function isAdmin()     { return currentProfile?.role === 'admin' }
export function isStaff()     { return currentProfile?.role === 'admin' || currentProfile?.role === 'employee' }
export function isLoggedIn()  { return !!currentUser }
export function getLastAuthEvent() { return null }
