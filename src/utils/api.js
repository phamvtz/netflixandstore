import { supabase } from '../supabase.js'

/** Header Authorization cho /api/admin/* (server kiểm tra JWT + profiles.role = admin) */
export async function adminApiFetch(url, init = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...init.headers
  }
  return fetch(url, { ...init, headers })
}

// ==================== PLANS ====================
export async function getPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('price', { ascending: true })
  if (error) throw error
  return data
}

export async function getPlan(planId) {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single()
  if (error) throw error
  return data
}

export async function adminCreatePlan(plan) {
  const { data, error } = await supabase
    .from('plans')
    .insert(plan)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function adminUpdatePlan(id, updates) {
  const { data, error } = await supabase
    .from('plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function adminDeletePlan(id) {
  const { error } = await supabase.from('plans').delete().eq('id', id)
  if (error) throw error
}

// ==================== SETTINGS ====================
export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('key, value')
  if (error) throw error
  // Trả về object { key: value, ... }
  return Object.fromEntries((data || []).map(r => [r.key, r.value]))
}

export async function updateSetting(key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

export async function updateSettings(obj) {
  const rows = Object.entries(obj).map(([key, value]) => ({
    key, value, updated_at: new Date().toISOString()
  }))
  const { error } = await supabase
    .from('settings')
    .upsert(rows, { onConflict: 'key' })
  if (error) throw error
}

/** Admin: đọc settings qua server (DATABASE_URL) — luôn khớp worker */
export async function adminGetSettings() {
  const r = await adminApiFetch('/api/admin/settings')
  const text = await r.text()
  let j = {}
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = { message: text }
  }
  if (!r.ok) throw new Error(j.message || j.error || `Không tải cài đặt (${r.status})`)
  return j
}

/** Admin: lưu một phần cài đặt (chỉ các key được server chấp nhận) */
export async function adminPatchSettings(partial) {
  const r = await adminApiFetch('/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial)
  })
  const text = await r.text()
  let j = {}
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = { message: text }
  }
  if (!r.ok) throw new Error(j.message || j.error || `Không lưu được (${r.status})`)
  return j
}

// ==================== SUBSCRIPTIONS ====================
export async function createSubscription(userId, planId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({ user_id: userId, plan: planId, status: 'pending' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getUserSubscriptions(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getSubscription(id) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ==================== PAYMENTS ====================
export async function createPayment(userId, subscriptionId, amount, planId, method, transferContent) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id: userId,
      subscription_id: subscriptionId,
      amount,
      plan: planId,
      method,
      transfer_content: transferContent,
      status: 'pending'
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getUserPayments(userId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*, plans(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// ==================== ADMIN ====================
export async function adminGetAllSubscriptions() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plans(*), profiles!user_id(email)')
    .order('created_at', { ascending: false })
  if (error) throw error
  // Normalize: flatten profiles.email → user_email
  return (data || []).map(s => ({
    ...s,
    user_email: s.profiles?.email || s.user_id
  }))
}

export async function adminGetAllPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*, plans(*), profiles!user_id(email)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(p => ({
    ...p,
    user_email: p.profiles?.email || p.user_id
  }))
}

// Xác nhận payment thủ công → server tự kích hoạt sub + gán account
export async function adminConfirmPayment(paymentId) {
  const res = await adminApiFetch('/api/admin/confirm-payment', {
    method: 'POST',
    body:   JSON.stringify({ paymentId })
  })
  if (!res.ok) throw new Error(`Server lỗi ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.message || json.reason || 'Xác nhận thất bại')
  return json
}

export async function adminUpdateSubscription(id, updates) {
  const { data, error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function adminActivateSubscription(id, planId) {
  const plan = await getPlan(planId)
  const now = new Date()
  const end = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000)

  return adminUpdateSubscription(id, {
    status: 'active',
    start_at: now.toISOString(),
    end_at: end.toISOString()
  })
}

export async function adminUpdatePayment(id, updates) {
  const { data, error } = await supabase
    .from('payments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function adminSetLoginLink(subscriptionId, loginLink) {
  return adminUpdateSubscription(subscriptionId, { login_link: loginLink })
}

export async function adminGetAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// ==================== ADMIN ACCOUNT MANAGEMENT ====================
export async function adminUpdateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function adminDeleteUser(userId) {
  // Delete profile (cascade will clean subscriptions/payments)
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)
  if (error) throw error
}

export async function adminGetUserSubscriptions(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function adminGetUserPayments(userId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*, plans(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// ==================== ADMIN: ASSIGN PLAN & ACCOUNT ====================
export async function adminAssignPlan(userId, planId, loginLink) {
  const plan = await getPlan(planId)
  const now = new Date()
  const end = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000)

  // Create active subscription directly
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan: planId,
      status: 'active',
      start_at: now.toISOString(),
      end_at: end.toISOString(),
      login_link: loginLink || null
    })
    .select()
    .single()
  if (subErr) throw subErr

  // Create payment record marked as success (admin grant)
  const { error: payErr } = await supabase
    .from('payments')
    .insert({
      user_id: userId,
      subscription_id: sub.id,
      amount: plan.price,
      plan: planId,
      method: 'admin',
      transfer_content: 'ADMIN_GRANT',
      status: 'success'
    })
  if (payErr) throw payErr

  return sub
}

export async function adminAssignAccount(subscriptionId, loginLink) {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ login_link: loginLink })
    .eq('id', subscriptionId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ==================== LOGIN LINK ====================
export async function getLoginLink(subscriptionId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('login_link')
    .eq('id', subscriptionId)
    .single()
  if (error) throw error
  return data?.login_link
}

// ==================== WARRANTY ====================
// Claims warranty: checks if cookie dead, swaps with new account from pool
export async function claimWarranty(subscriptionId) {
  const { data, error } = await supabase.rpc('claim_warranty', { p_sub_id: subscriptionId })
  if (error) throw error
  if (data == null) return { success: false, message: 'Không có phản hồi từ server' }
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return { success: false, message: data }
    }
  }
  return data
}

// ==================== ADMIN: ACCOUNT INVENTORY (resources) ====================
export async function adminGetAllAccounts() {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function adminAddAccount(type, value, note, maxSlots = 5) {
  const { data, error } = await supabase
    .from('resources')
    .insert({
      type:           type || 'account',
      value,
      status:         'available',
      note:           note || null,
      max_slots:      maxSlots,
      assigned_count: 0
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function adminAddAccountsBulk(accounts) {
  const { data, error } = await supabase
    .from('resources')
    .insert(accounts.map(a => ({
      type:           a.type || 'account',
      value:          a.value,
      status:         'available',
      note:           a.note || null,
      max_slots:      a.max_slots || 5,
      assigned_count: 0
    })))
    .select()
  if (error) throw error
  return data
}

export async function adminUpdateAccount(id, updates) {
  const { data, error } = await supabase
    .from('resources')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function adminDeleteAccount(id) {
  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function adminAssignAccountFromPool(resourceId, subscriptionId) {
  // 1. Get resource value
  const { data: res, error: resErr } = await supabase
    .from('resources')
    .select('*')
    .eq('id', resourceId)
    .single()
  if (resErr) throw resErr

  const maxSlots  = res.max_slots || 5
  const newCount  = (res.assigned_count || 0) + 1
  const newStatus = newCount >= maxSlots ? 'full' : 'available'

  // 2. Update subscription with login link
  const { error: subErr } = await supabase
    .from('subscriptions')
    .update({ login_link: res.value })
    .eq('id', subscriptionId)
  if (subErr) throw subErr

  // 3. Tăng assigned_count và cập nhật status
  const { error: markErr } = await supabase
    .from('resources')
    .update({
      assigned_count: newCount,
      status:         newStatus,
      assigned_to:    subscriptionId
    })
    .eq('id', resourceId)
  if (markErr) throw markErr

  return res
}
