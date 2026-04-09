import { supabase } from '../supabase.js'

// ==================== AUTH STATE ====================
let currentUser = null
let currentProfile = null
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

let lastAuthEvent = null
export function getLastAuthEvent() { return lastAuthEvent }

export async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    currentUser = session.user
    await fetchProfile()
    notifyListeners()
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    lastAuthEvent = event
    if (session?.user) {
      currentUser = session.user
      await fetchProfile()
    } else {
      currentUser = null
      currentProfile = null
    }
    notifyListeners()
    // Dispatch custom event cho main.js xử lý callback
    window.dispatchEvent(new CustomEvent('supabaseAuthEvent', { detail: { event, session } }))
  })
}

async function fetchProfile() {
  if (!currentUser) return
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single()
  if (!error) currentProfile = data
  // Nếu lỗi (RLS, row not found...) currentProfile giữ nguyên null — isAdmin/isStaff trả false
}

export function getUser() {
  return currentUser
}

export function getProfile() {
  return currentProfile
}

export function isAdmin() {
  return currentProfile?.role === 'admin'
}

/** Returns true for admin or employee — kept for future staff-only routes */
export function isStaff() {
  return currentProfile?.role === 'admin' || currentProfile?.role === 'employee'
}

export function isLoggedIn() {
  return !!currentUser
}

// ==================== AUTH ACTIONS ====================
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Tự động dùng domain hiện tại — localhost khi dev, IP/domain khi production
      emailRedirectTo: window.location.origin
    }
  })
  if (error) throw error
  return data
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  currentUser = data.user
  await fetchProfile()
  notifyListeners()
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
  currentUser = null
  currentProfile = null
  notifyListeners()
}

/** Gửi lại email xác nhận (dùng khi user chưa confirm) */
export async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw error
}

/** Gửi email reset mật khẩu */
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/#/reset-password'
  })
  if (error) throw error
}

