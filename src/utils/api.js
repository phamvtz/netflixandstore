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

async function getProfileEmailMap(rows) {
  const ids = [...new Set((rows || []).map(row => row.user_id).filter(Boolean))]
  if (!ids.length) return new Map()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', ids)
  if (error) {
    console.warn('[admin] Could not load profile emails:', error.message)
    return new Map()
  }
  return new Map((data || []).map(profile => [profile.id, profile.email]))
}

// ==================== PLANS ====================
export async function getPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('price', { ascending: true })
  if (error) throw error
  // Sort client-side by service after fetch (safe if column missing)
  return (data || []).sort((a, b) => {
    const sa = a.service || 'netflix', sb = b.service || 'netflix'
    return sa < sb ? -1 : sa > sb ? 1 : (a.price||0) - (b.price||0)
  })
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
  // Đảm bảo các field mới có giá trị mặc định
  const row = {
    service:          plan.service          || 'netflix',
    fulfillment_type: plan.fulfillment_type || (plan.service === 'netflix' ? 'netflix' : 'manual'),
    account_type:     plan.account_type     || 'shared',
    ...plan
  }
  if (row.is_visible === undefined) row.is_visible = true
  const { data, error } = await supabase
    .from('plans')
    .insert(row)
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
  // Kiểm tra xem có subscription nào đang dùng gói này không
  const { count, error: countErr } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('plan', id)
  if (countErr) throw countErr

  if (count && count > 0) {
    throw new Error(
      `Không thể xóa — còn ${count} đơn hàng đang dùng gói này.\n` +
      `Nếu muốn ẩn gói, hãy đổi tên thành "[Đã ẩn] ..." thay vì xóa.`
    )
  }

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
  let j
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
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = { message: text }
  }
  if (!r.ok) throw new Error(j.message || j.error || `Không lưu được (${r.status})`)
  return j
}

/** Công khai: bài hướng dẫn (chỉ bài published) — GET /api/guides */
export async function fetchGuides() {
  const r = await fetch('/api/guides')
  const text = await r.text()
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = {}
  }
  if (!r.ok) throw new Error(j.message || j.error || `Không tải hướng dẫn (${r.status})`)
  return j
}

// ==================== SUBSCRIPTIONS ====================
/**
 * @param {string} userId
 * @param {string} planId
 * @param {{ sellerStoreId?: string }} [opts] — từ gian hàng #/s/:slug
 */
export async function createSubscription(userId, planId, opts = {}) {
  const row = { user_id: userId, plan: planId, status: 'pending' }
  if (opts.sellerStoreId) row.seller_store_id = opts.sellerStoreId
  const { data, error } = await supabase.from('subscriptions').insert(row).select().single()
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
/**
 * @param {{ sellerStoreId?: string }} [opts]
 */
export async function createPayment(userId, subscriptionId, amount, planId, method, transferContent, opts = {}) {
  const insert = {
    user_id: userId,
    subscription_id: subscriptionId,
    amount,
    plan: planId,
    method,
    transfer_content: transferContent,
    status: 'pending'
  }
  if (opts.sellerStoreId) insert.seller_store_id = opts.sellerStoreId
  const { data, error } = await supabase.from('payments').insert(insert).select().single()
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
    .select('*, plans(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  const profileEmails = await getProfileEmailMap(data)
  // Normalize: attach profile email + expose plan fields
  return (data || []).map(s => ({
    ...s,
    user_email:         profileEmails.get(s.user_id) || s.user_id,
    plan_service:       s.plans?.service     || 'netflix',
    plan_fulfillment:   s.plans?.fulfillment_type || 'netflix',
    plan_account_type:  s.plans?.account_type || 'shared',
  }))
}


export async function adminGetAllPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*, plans(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  const profileEmails = await getProfileEmailMap(data)
  return (data || []).map(p => ({
    ...p,
    user_email: profileEmails.get(p.user_id) || p.user_id
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

/** Xác nhận đơn dịch vụ thủ công (manual service) — admin đã xử lý */
export async function adminConfirmServiceOrder(subscriptionId, note) {
  return adminUpdateSubscription(subscriptionId, {
    status: 'active',
    start_at: new Date().toISOString(),
    notes: note || null
  })
}

/** Giao sản phẩm từ kho (stock fulfillment) */
export async function adminDeliverFromStock(subscriptionId, content) {
  return adminUpdateSubscription(subscriptionId, {
    status: 'active',
    login_link: content,
    start_at: new Date().toISOString()
  })
}

/** Lấy tài khoản sẵn có trong kho theo service */
export async function adminGetAvailableStock(service) {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('service', service)
    .eq('account_type', 'stock')
    .eq('status', 'available')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
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

/** Gọi API kèm JWT Supabase (session user) */
export async function userApiFetch(url, init = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...init.headers
  }
  return fetch(url, { ...init, headers })
}

/** Báo admin: không xem được (xử lý tay). Cookie die → dùng Bảo hành. */
export async function reportCannotViewToAdmin(subscriptionId) {
  const r = await userApiFetch('/api/report-cannot-view', {
    method: 'POST',
    body: JSON.stringify({ subscriptionId })
  })
  const text = await r.text()
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = { message: text }
  }
  if (!r.ok) throw new Error(j.message || j.error || 'Loi ' + r.status)
  return j
}

export async function adminListViewerReports(status = 'open') {
  const r = await adminApiFetch('/api/admin/viewer-reports?status=' + encodeURIComponent(status))
  const text = await r.text()
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = {}
  }
    if (!r.ok) throw new Error(j.message || j.error || 'Loi ' + r.status)
  return j
}

export async function adminResolveViewerReport(reportId, { status = 'resolved', admin_note } = {}) {
  const r = await adminApiFetch(`/api/admin/viewer-reports/${reportId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, admin_note: admin_note ?? undefined })
  })
  const text = await r.text()
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = {}
  }
  if (!r.ok) throw new Error(j.message || j.error || 'Loi ' + r.status)
  return j
}

/** Admin: assign pool account for viewer_report row (claim_warranty or body.resourceId). */
export async function adminAssignViewerReportFromPool(reportId, body = {}) {
  const r = await adminApiFetch(`/api/admin/viewer-reports/${reportId}/assign-from-pool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const text = await r.text()
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = {}
  }
  if (!r.ok) throw new Error(j.message || j.error || 'Loi ' + r.status)
  return j
}

/** User: rejected viewer_report notices (dashboard). */
export async function getMyViewerReportNotices() {
  const r = await userApiFetch('/api/viewer-report-notices')
  const text = await r.text()
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = {}
  }
  if (!r.ok) throw new Error(j.message || j.error || 'Loi ' + r.status)
  return j
}

// ==================== ADMIN: ACCOUNT INVENTORY (resources) ====================
export async function adminGetAllAccounts(filter = {}) {
  let q = supabase.from('resources').select('*')
  if (filter.service)      q = q.eq('service', filter.service)
  if (filter.account_type) q = q.eq('account_type', filter.account_type)
  if (filter.status)       q = q.eq('status', filter.status)
  q = q.order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function adminAddAccount(type, value, note, maxSlots = 5, accountType = 'shared', service = 'netflix') {
  const { data, error } = await supabase
    .from('resources')
    .insert({
      type:           type || 'account',
      value,
      status:         'available',
      note:           note || null,
      max_slots:      maxSlots,
      assigned_count: 0,
      account_type:   accountType || 'shared',
      service:        service || 'netflix'
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
      assigned_count: 0,
      account_type:   a.account_type || 'shared',
      service:        a.service || 'netflix'
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

// ==================== STOREFRONT (web con / custom domain) ====================
/** Nhận gian hàng theo Host hiện tại (tên miền riêng) — 404 nếu không phải domain gian hàng */
export async function getStoreByHost() {
  const r = await fetch('/api/store/by-host')
  if (r.status === 404) return null
  const text = await r.text()
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    return null
  }
  if (!r.ok) return null
  return j
}

/** Công khai — không cần đăng nhập */
export async function getPublicStore(slug) {
  const r = await fetch(`/api/store/${encodeURIComponent(slug)}`)
  const text = await r.text()
  let j
  try { j = text ? JSON.parse(text) : {} } catch { j = { message: text } }
  if (!r.ok) throw new Error(j.error || j.message || `Lỗi ${r.status}`)
  return j
}


/** Bảng giá đã gộp (≥ giá gốc) — dùng trên storefront khi có sellerStoreId */
export async function getPlansForSellerStore(sellerStoreId) {
  const r = await fetch(`/api/public/plans?sellerStoreId=${encodeURIComponent(sellerStoreId)}`)
  const text = await r.text()
  let j
  try { j = text ? JSON.parse(text) : {} } catch { j = { message: text } }
  if (!r.ok) throw new Error(j.message || j.error || `Lỗi ${r.status}`)
  return j.plans || []
}

/** Giá + cấu hình thanh toán cho trang thanh toán */
export async function getCheckoutQuote(planId, sellerStoreId) {
  const q = new URLSearchParams({ planId })
  if (sellerStoreId) q.set('sellerStoreId', sellerStoreId)
  const r = await fetch(`/api/checkout/quote?${q}`)
  const text = await r.text()
  let j
  try { j = text ? JSON.parse(text) : {} } catch { j = { message: text } }
  if (!r.ok) throw new Error(j.message || j.error || `Lỗi ${r.status}`)
  return j
}

// ==================== SELLER (JWT user role seller / admin) ====================
function sellerParseError(text, status) {
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = { message: text }
  }
  throw new Error(j.message || j.error || ('Lỗi ' + status))
}

/** Gian hàng của user đang đăng nhập — null nếu chưa tạo */
export async function getMySellerStore() {
  const r = await userApiFetch('/api/seller/store')
  const text = await r.text()
  if (!r.ok) sellerParseError(text, r.status)
  if (!text || text === 'null') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function createSellerStore(body) {
  const r = await userApiFetch('/api/seller/store', {
    method: 'POST',
    body: JSON.stringify(body)
  })
  const text = await r.text()
  if (!r.ok) sellerParseError(text, r.status)
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

export async function updateSellerStore(partial) {
  const r = await userApiFetch('/api/seller/store', {
    method: 'PATCH',
    body: JSON.stringify(partial)
  })
  const text = await r.text()
  if (!r.ok) sellerParseError(text, r.status)
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

export async function getSellerStats() {
  const r = await userApiFetch('/api/seller/stats')
  const text = await r.text()
  if (!r.ok) sellerParseError(text, r.status)
  try {
    return text ? JSON.parse(text) : { orders: 0, revenue: 0 }
  } catch {
    return { orders: 0, revenue: 0 }
  }
}

export async function getSellerMergedPlanPrices() {
  const r = await userApiFetch('/api/seller/plan-prices')
  const text = await r.text()
  if (!r.ok) sellerParseError(text, r.status)
  let j
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    j = {}
  }
  return j.plans || []
}

/** @param {Record<string, number>} prices map planId → giá (VND) */
export async function putSellerPlanPrices(prices) {
  const r = await userApiFetch('/api/seller/plan-prices', {
    method: 'PUT',
    body: JSON.stringify({ prices })
  })
  const text = await r.text()
  if (!r.ok) sellerParseError(text, r.status)
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}
