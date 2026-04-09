/**
 * Danh mục cửa hàng: ẩn theo service + danh mục tùy chỉnh (lưu settings.catalog_config JSON)
 * Gói: plans.is_visible === false → ẩn khỏi cửa hàng
 */
import { SERVICES, getService } from './services.js'

const DEFAULT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`

export function parseCatalogConfig(settings) {
  const raw = settings?.catalog_config
  if (raw == null || raw === '') {
    return { hiddenServices: [], customServices: [] }
  }
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw)
  try {
    const j = JSON.parse(str)
    return {
      hiddenServices: Array.isArray(j.hiddenServices) ? j.hiddenServices.filter(Boolean) : [],
      customServices: Array.isArray(j.customServices)
        ? j.customServices.filter(c => c && typeof c.id === 'string' && c.id.length)
        : [],
    }
  } catch {
    return { hiddenServices: [], customServices: [] }
  }
}

/** Gói hiển thị công khai (cột is_visible) */
export function filterVisiblePlans(plans) {
  return (plans || []).filter(p => p && p.is_visible !== false)
}

/** Gói sau khi lọc ẩn danh mục + ẩn gói */
export function filterPlansForStorefront(plans, settings) {
  const cfg = parseCatalogConfig(settings || {})
  const hiddenSvc = new Set(cfg.hiddenServices || [])
  return filterVisiblePlans(plans).filter(p => !hiddenSvc.has(p.service || 'netflix'))
}

/** Danh sách dịch vụ/card cho Products: built-in (trừ ẩn) + custom */
export function buildCatalogServiceList(settings) {
  const cfg = parseCatalogConfig(settings || {})
  const hidden = new Set(cfg.hiddenServices || [])
  const out = []

  for (const s of SERVICES) {
    if (hidden.has(s.id)) continue
    out.push({ ...s, isCustom: false })
  }

  for (const c of cfg.customServices) {
    if (hidden.has(c.id)) continue
    if (SERVICES.find(s => s.id === c.id)) continue
    out.push({
      id: c.id,
      name: c.name || c.id,
      tagline: c.tagline || 'Danh mục tùy chỉnh',
      color: c.color || '#6366f1',
      bg: c.bg || '#f0edff',
      icon: c.icon || DEFAULT_ICON,
      features: Array.isArray(c.features) ? c.features : [],
      isCustom: true,
    })
  }

  return out
}

/** Meta dịch vụ (chuẩn hoặc custom) cho Plans/Home */
export function getServiceForDisplay(id, settings) {
  const std = SERVICES.find(s => s.id === id)
  if (std) return std
  const cfg = parseCatalogConfig(settings || {})
  const c = (cfg.customServices || []).find(x => x.id === id)
  if (c) {
    return {
      id: c.id,
      name: c.name || c.id,
      tagline: c.tagline || '',
      color: c.color || '#6366f1',
      bg: c.bg || '#f0edff',
      icon: c.icon || DEFAULT_ICON,
      features: Array.isArray(c.features) ? c.features : [],
    }
  }
  return getService(id)
}

/** Thứ tự section trên Plans/Home: netflix trước, sau đó theo catalog */
export function catalogServiceOrder(settings) {
  const list = buildCatalogServiceList(settings || {})
  const ids = list.map(s => s.id).filter(sid => sid !== 'netflix')
  return ['netflix', ...ids]
}

export function isPlanHiddenFromStorefront(plan, settings) {
  if (!plan) return true
  if (plan.is_visible === false) return true
  const cfg = parseCatalogConfig(settings || {})
  if ((cfg.hiddenServices || []).includes(plan.service || 'netflix')) return true
  return false
}
