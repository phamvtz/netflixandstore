/**
 * src/utils/api.js
 * API client — dùng MongoDB JWT, không dùng Supabase SDK.
 */
import { getStoredToken } from './auth.js'

// ── Fetch helpers ────────────────────────────────────────────────────────────

function authHeader() {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function parseResponse(r) {
  const text = await r.text()
  let j
  try { j = text ? JSON.parse(text) : {} } catch { j = { message: text } }
  if (!r.ok) throw new Error(j.error || j.message || `Lỗi ${r.status}`)
  return j
}

export async function adminApiFetch(url, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...authHeader(), ...(init.headers || {}) }
  return fetch(url, { ...init, headers })
}

export async function userApiFetch(url, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...authHeader(), ...(init.headers || {}) }
  return fetch(url, { ...init, headers })
}

export async function getMySupportChat() {
  const r = await userApiFetch('/api/support/chat')
  return parseResponse(r)
}

export async function sendSupportMessage(content) {
  const r = await userApiFetch('/api/support/chat/messages', {
    method: 'POST',
    body: JSON.stringify({ content })
  })
  return parseResponse(r)
}

export async function adminGetSupportChats() {
  const r = await adminApiFetch('/api/admin/support/chats')
  return parseResponse(r).then(j => j.threads || [])
}

export async function adminGetSupportChat(userId) {
  const r = await adminApiFetch(`/api/admin/support/chats/${encodeURIComponent(userId)}`)
  return parseResponse(r)
}

export async function adminSendSupportMessage(userId, content) {
  const r = await adminApiFetch(`/api/admin/support/chats/${encodeURIComponent(userId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content })
  })
  return parseResponse(r)
}

// ── CATALOG (public) ─────────────────────────────────────────────────────────

export async function getCatalogData() {
  const r = await fetch('/api/catalog')
  return parseResponse(r).then(j => j.categories || [])
}

// ── PLANS ────────────────────────────────────────────────────────────────────

export async function getPlans() {
  const r = await fetch('/api/plans')
  return parseResponse(r).then(j => j.plans || j || [])
}

export async function getPlan(planId) {
  const r = await fetch(`/api/plans/${encodeURIComponent(planId)}`)
  return parseResponse(r).then(j => j.plan || j)
}

export async function adminCreatePlan(plan) {
  const r = await adminApiFetch('/api/admin/plans', { method: 'POST', body: JSON.stringify(plan) })
  return parseResponse(r).then(j => j.plan || j)
}

export async function adminUpdatePlan(id, updates) {
  const r = await adminApiFetch(`/api/admin/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(updates) })
  return parseResponse(r).then(j => j.plan || j)
}

export async function adminDeletePlan(id) {
  const r = await adminApiFetch(`/api/admin/plans/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return parseResponse(r)
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  const r = await fetch('/api/settings')
  return parseResponse(r).then(j => j.settings || j)
}

export async function updateSetting(key, value) {
  const r = await adminApiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ [key]: value }) })
  return parseResponse(r)
}

export async function updateSettings(obj) {
  const r = await adminApiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(obj) })
  return parseResponse(r)
}

export async function adminGetSettings() {
  const r = await adminApiFetch('/api/admin/settings')
  return parseResponse(r)
}

export async function adminPatchSettings(partial) {
  const r = await adminApiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(partial) })
  return parseResponse(r)
}

export async function fetchGuides() {
  const r = await fetch('/api/guides')
  return parseResponse(r)
}

// ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────

export async function createSubscription(userId, planId, opts = {}) {
  const r = await userApiFetch('/api/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      plan: planId,
      seller_store_id: opts.sellerStoreId || undefined,
      customer_note: opts.customerNote || undefined,
      customer_contact_email: opts.customerContactEmail || undefined
    })
  })
  return parseResponse(r).then(j => j.subscription || j)
}

export async function getUserSubscriptions(userId) {
  const r = await userApiFetch('/api/my-subscriptions')
  return parseResponse(r).then(j => j.subscriptions || j || [])
}

export async function getSubscription(id) {
  const r = await userApiFetch(`/api/subscriptions/${encodeURIComponent(id)}`)
  return parseResponse(r).then(j => j.subscription || j)
}

// ── PAYMENTS ──────────────────────────────────────────────────────────────────

export async function createPayment(userId, subscriptionId, amount, planId, method, transferContent, opts = {}) {
  const r = await userApiFetch('/api/payments', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId, subscription_id: subscriptionId,
      amount, plan: planId, method, transfer_content: transferContent,
      seller_store_id: opts.sellerStoreId || undefined
    })
  })
  return parseResponse(r).then(j => j.payment || j)
}

export async function getUserPayments(userId) {
  const r = await userApiFetch('/api/my-payments')
  return parseResponse(r).then(j => j.payments || j || [])
}

// ── ADMIN: SUBSCRIPTIONS + PAYMENTS ─────────────────────────────────────────

export async function adminGetAllSubscriptions() {
  const r = await adminApiFetch('/api/admin/subscriptions')
  return parseResponse(r).then(j => j.subscriptions || j || [])
}

export async function adminGetAllPayments() {
  const r = await adminApiFetch('/api/admin/payments')
  return parseResponse(r).then(j => j.payments || j || [])
}

export async function adminConfirmPayment(paymentId) {
  const r = await adminApiFetch('/api/admin/confirm-payment', {
    method: 'POST', body: JSON.stringify({ paymentId })
  })
  const j = await parseResponse(r)
  if (!j.success) throw new Error(j.message || j.reason || 'Xác nhận thất bại')
  return j
}

export async function adminUpdateSubscription(id, updates) {
  const r = await adminApiFetch(`/api/admin/subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(updates)
  })
  return parseResponse(r).then(j => j.subscription || j)
}

export async function adminActivateSubscription(id, planId) {
  const plan = await getPlan(planId)
  const now = new Date()
  const end = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000)
  return adminUpdateSubscription(id, { status: 'active', start_at: now.toISOString(), end_at: end.toISOString() })
}

export async function adminUpdatePayment(id, updates) {
  const r = await adminApiFetch(`/api/admin/payments/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(updates)
  })
  return parseResponse(r).then(j => j.payment || j)
}

export async function adminSetLoginLink(subscriptionId, loginLink) {
  return adminUpdateSubscription(subscriptionId, { login_link: loginLink })
}

export async function adminConfirmServiceOrder(subscriptionId, note) {
  return adminUpdateSubscription(subscriptionId, { status: 'active', start_at: new Date().toISOString(), notes: note || null })
}

export async function adminDeliverFromStock(subscriptionId, content) {
  return adminUpdateSubscription(subscriptionId, { status: 'active', login_link: content, start_at: new Date().toISOString() })
}

// ── ADMIN: PROFILES ──────────────────────────────────────────────────────────

export async function adminGetAllProfiles() {
  const r = await adminApiFetch('/api/admin/profiles')
  return parseResponse(r).then(j => j.profiles || j || [])
}

export async function adminUpdateProfile(userId, updates) {
  const r = await adminApiFetch(`/api/admin/profiles/${encodeURIComponent(userId)}`, {
    method: 'PATCH', body: JSON.stringify(updates)
  })
  return parseResponse(r).then(j => j.profile || j)
}

export async function adminDeleteUser(userId) {
  const r = await adminApiFetch(`/api/admin/profiles/${encodeURIComponent(userId)}`, { method: 'DELETE' })
  return parseResponse(r)
}

export async function adminGetUserSubscriptions(userId) {
  const r = await adminApiFetch(`/api/admin/subscriptions?user_id=${encodeURIComponent(userId)}`)
  return parseResponse(r).then(j => j.subscriptions || j || [])
}

export async function adminGetUserPayments(userId) {
  const r = await adminApiFetch(`/api/admin/payments?user_id=${encodeURIComponent(userId)}`)
  return parseResponse(r).then(j => j.payments || j || [])
}

export async function adminAssignPlan(userId, planId, loginLink) {
  const r = await adminApiFetch('/api/admin/assign-plan', {
    method: 'POST', body: JSON.stringify({ user_id: userId, plan_id: planId, login_link: loginLink || null })
  })
  return parseResponse(r).then(j => j.subscription || j)
}

export async function adminAssignAccount(subscriptionId, loginLink) {
  return adminUpdateSubscription(subscriptionId, { login_link: loginLink })
}

export async function adminGetAvailableStock(service) {
  const r = await adminApiFetch(`/api/admin/accounts?service=${encodeURIComponent(service)}&status=available&limit=1`)
  return parseResponse(r).then(j => (j.accounts || j || [])[0] || null)
}

// ── ADMIN: ACCOUNT INVENTORY ────────────────────────────────────────────────

export async function adminGetAllAccounts(filter = {}) {
  const q = new URLSearchParams()
  if (filter.service)      q.set('service', filter.service)
  if (filter.account_type) q.set('account_type', filter.account_type)
  if (filter.resource_kind) q.set('resource_kind', filter.resource_kind)
  if (filter.status)       q.set('status', filter.status)
  if (filter.plan_id)      q.set('plan_id', filter.plan_id)
  if (filter.limit)        q.set('limit', filter.limit)
  const r = await adminApiFetch(`/api/admin/accounts?${q}`)
  return parseResponse(r).then(j => j.accounts || j || [])
}

export async function adminAddAccount(type, value, note, maxSlots = 5, accountType = 'shared', service = 'netflix', extra = {}) {
  const r = await adminApiFetch('/api/admin/accounts', {
    method: 'POST',
    body: JSON.stringify({ type: type || 'account', value, note: note || null, max_slots: maxSlots, account_type: accountType || 'shared', service: service || 'netflix', ...extra })
  })
  return parseResponse(r).then(j => j.account || j)
}

export async function adminAddAccountsBulk(accounts) {
  const r = await adminApiFetch('/api/admin/accounts/bulk', {
    method: 'POST', body: JSON.stringify({ accounts })
  })
  return parseResponse(r) // { added, duplicates, errors, dead, no_plan, accounts }
}

export async function adminCheckAccountPlan(id, markDead = false) {
  const r = await adminApiFetch(`/api/admin/accounts/${encodeURIComponent(id)}/check-plan`, {
    method: 'POST', body: JSON.stringify({ markDead })
  })
  return parseResponse(r)
}

export async function adminUpdateAccount(id, updates) {
  const r = await adminApiFetch(`/api/admin/accounts/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(updates)
  })
  return parseResponse(r).then(j => j.account || j)
}

export async function adminDeleteAccount(id) {
  const r = await adminApiFetch(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return parseResponse(r)
}

export async function adminAssignAccountFromPool(resourceId, subscriptionId) {
  const r = await adminApiFetch('/api/admin/accounts/assign', {
    method: 'POST', body: JSON.stringify({ resourceId, subscriptionId })
  })
  return parseResponse(r)
}

// ── WARRANTY ──────────────────────────────────────────────────────────────────

export async function claimWarranty(subscriptionId) {
  const r = await userApiFetch('/api/claim-warranty', {
    method: 'POST', body: JSON.stringify({ subscriptionId })
  })
  return parseResponse(r)
}

// ── VIEWER REPORTS ───────────────────────────────────────────────────────────

export async function reportCannotViewToAdmin(subscriptionId) {
  const r = await userApiFetch('/api/report-cannot-view', {
    method: 'POST', body: JSON.stringify({ subscriptionId })
  })
  return parseResponse(r)
}

export async function adminListViewerReports(status = 'open') {
  const r = await adminApiFetch('/api/admin/viewer-reports?status=' + encodeURIComponent(status))
  return parseResponse(r)
}

export async function adminResolveViewerReport(reportId, { status = 'resolved', admin_note } = {}) {
  const r = await adminApiFetch(`/api/admin/viewer-reports/${reportId}`, {
    method: 'PATCH', body: JSON.stringify({ status, admin_note: admin_note ?? undefined })
  })
  return parseResponse(r)
}

export async function adminAssignViewerReportFromPool(reportId, body = {}) {
  const r = await adminApiFetch(`/api/admin/viewer-reports/${reportId}/assign-from-pool`, {
    method: 'POST', body: JSON.stringify(body)
  })
  return parseResponse(r)
}

export async function adminCheckViewerReportAccount(reportId) {
  const r = await adminApiFetch(`/api/admin/viewer-reports/${reportId}/check-account`, {
    method: 'POST', body: JSON.stringify({})
  })
  return parseResponse(r)
}

export async function getMyViewerReportNotices() {
  const r = await userApiFetch('/api/viewer-report-notices')
  return parseResponse(r)
}

// ── STOREFRONT ────────────────────────────────────────────────────────────────

export async function getStoreByHost() {
  const r = await fetch('/api/store/by-host')
  if (r.status === 404) return null
  const text = await r.text()
  try { return text ? JSON.parse(text) : null } catch { return null }
}

export async function getPublicStore(slug) {
  const r = await fetch(`/api/store/${encodeURIComponent(slug)}`)
  return parseResponse(r)
}

export async function getPlansForSellerStore(sellerStoreId) {
  const r = await fetch(`/api/public/plans?sellerStoreId=${encodeURIComponent(sellerStoreId)}`)
  return parseResponse(r).then(j => j.plans || [])
}

export async function getCheckoutQuote(planId, sellerStoreId) {
  const q = new URLSearchParams({ planId })
  if (sellerStoreId) q.set('sellerStoreId', sellerStoreId)
  const r = await fetch(`/api/checkout/quote?${q}`)
  return parseResponse(r)
}

// ── SELLER ────────────────────────────────────────────────────────────────────

export async function getMySellerStore() {
  const r = await userApiFetch('/api/seller/store')
  if (r.status === 404) return null
  const text = await r.text()
  if (!text || text === 'null') return null
  try { return JSON.parse(text) } catch { return null }
}

export async function createSellerStore(body) {
  const r = await userApiFetch('/api/seller/store', { method: 'POST', body: JSON.stringify(body) })
  return parseResponse(r)
}

export async function updateSellerStore(partial) {
  const r = await userApiFetch('/api/seller/store', { method: 'PATCH', body: JSON.stringify(partial) })
  return parseResponse(r)
}

export async function getSellerStats() {
  const r = await userApiFetch('/api/seller/stats')
  return parseResponse(r).catch(() => ({ orders: 0, revenue: 0 }))
}

export async function getSellerMergedPlanPrices() {
  const r = await userApiFetch('/api/seller/plan-prices')
  return parseResponse(r).then(j => j.plans || [])
}

export async function putSellerPlanPrices(prices) {
  const r = await userApiFetch('/api/seller/plan-prices', {
    method: 'PUT', body: JSON.stringify({ prices })
  })
  return parseResponse(r)
}

export async function getLoginLink(subscriptionId) {
  const r = await userApiFetch(`/api/subscriptions/${encodeURIComponent(subscriptionId)}`)
  return parseResponse(r).then(j => (j.subscription || j)?.login_link || null)
}

// ── Wallet API ────────────────────────────────────────────────────────────────

export async function getWalletBalance() {
  const r = await userApiFetch('/api/wallet')
  return parseResponse(r)
}

export async function getWalletTransactions(limit = 50) {
  const r = await userApiFetch(`/api/wallet/transactions?limit=${limit}`)
  return parseResponse(r)
}

export async function createWalletTopup(amount) {
  const r = await userApiFetch('/api/wallet/topup', {
    method: 'POST',
    body: JSON.stringify({ amount })
  })
  return parseResponse(r)
}

export async function cancelWalletTopup(id) {
  const r = await userApiFetch(`/api/wallet/topup/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return parseResponse(r)
}

export async function getWalletTopupStatus(transferContent) {
  const r = await userApiFetch(`/api/wallet/topup-status/${encodeURIComponent(transferContent)}`)
  return parseResponse(r)
}

export async function payWithWallet(planId, sellerStoreId = null, opts = {}) {
  const r = await userApiFetch('/api/wallet/pay', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: planId,
      seller_store_id: sellerStoreId,
      customer_note: opts.customerNote || undefined,
      customer_contact_email: opts.customerContactEmail || undefined
    })
  })
  return parseResponse(r)
}

// ── Admin: Wallet management ──────────────────────────────────────────────────

export async function adminGetWallets() {
  const r = await adminApiFetch('/api/admin/wallets')
  return parseResponse(r).then(j => j.wallets || j || [])
}

export async function adminGetWalletTopups(status = '') {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  const r = await adminApiFetch(`/api/admin/wallet/topups${q}`)
  return parseResponse(r).then(j => j.topups || j || [])
}

export async function adminCreditWallet(userId, amount, note = '') {
  const r = await adminApiFetch('/api/admin/wallet/credit', {
    method: 'POST', body: JSON.stringify({ user_id: userId, amount: Number(amount), note: note || undefined })
  })
  return parseResponse(r)
}

export async function adminConfirmWalletTopup(id) {
  const r = await adminApiFetch(`/api/admin/wallet/topup/${encodeURIComponent(id)}/confirm`, {
    method: 'POST'
  })
  return parseResponse(r)
}
