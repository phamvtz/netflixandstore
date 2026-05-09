import { adminCreatePlan, adminUpdatePlan, adminDeletePlan } from '../../utils/api.js'
import { showConfirmModal } from './ui.js'

export function renderPlans(state, { esc, attr, panelHeader, table }) {
  const rows = state.data.plans.filter(r => (r.service || 'netflix') === 'netflix')

  function planForm(action, defaults = {}) {
    return `
      <section class="admin-v2-card">
        <div class="admin-v2-card-head"><h3>Thêm gói mới</h3></div>
        <div class="admin-v2-form-grid admin-v2-form-grid--plan">
          <input id="${action}Id" placeholder="ID tuỳ chọn (để trống = auto)">
          <input id="${action}Name" placeholder="Tên gói">
          <input id="${action}Price" type="number" min="0" placeholder="Giá">
          <input id="${action}Days" type="number" min="1" placeholder="Số ngày">
          <input id="${action}Service" value="${attr(defaults.service || 'netflix')}" placeholder="Service">
          <select id="${action}Fulfillment">
            <option value="netflix"${defaults.fulfillment_type === 'netflix' ? ' selected' : ''}>Netflix account</option>
            <option value="manual"${defaults.fulfillment_type === 'manual' ? ' selected' : ''}>Xử lý thủ công</option>
            <option value="stock"${defaults.fulfillment_type === 'stock' ? ' selected' : ''}>Giao stock</option>
          </select>
          <button type="button" class="btn btn-primary" data-action="${action}">Thêm gói</button>
        </div>
      </section>
    `
  }

  function plansTable(rows) {
    return table(
      ['ID', 'Tên gói', 'Service', 'Giá', 'Ngày', 'Fulfillment', 'Hành động'],
      rows.map(r => [
        `<code>${esc(r.id)}</code>`,
        `<input class="admin-v2-inline-input" data-plan-field="name" data-id="${attr(r.id)}" value="${attr(r.name || '')}">`,
        `<input class="admin-v2-inline-input" data-plan-field="service" data-id="${attr(r.id)}" value="${attr(r.service || 'netflix')}">`,
        `<input class="admin-v2-inline-input" type="number" data-plan-field="price" data-id="${attr(r.id)}" value="${attr(r.price || 0)}">`,
        `<input class="admin-v2-inline-input" type="number" data-plan-field="duration_days" data-id="${attr(r.id)}" value="${attr(r.duration_days || 0)}">`,
        `<input class="admin-v2-inline-input" data-plan-field="fulfillment_type" data-id="${attr(r.id)}" value="${attr(r.fulfillment_type || 'netflix')}">`,
        `<div class="admin-v2-row-actions">
          <button class="btn btn-sm btn-primary" data-action="save-plan" data-id="${attr(r.id)}">Lưu</button>
          <button class="btn btn-sm btn-danger" data-action="delete-plan" data-id="${attr(r.id)}">Xoá</button>
        </div>`,
      ])
    )
  }

  return `
    ${panelHeader('Gói Netflix', 'Quản lý giá và thời hạn các gói Netflix bán trên site.')}
    ${planForm('add-plan', { service: 'netflix', fulfillment_type: 'netflix' })}
    ${plansTable(rows)}
  `
}

export async function handlePlansAction(action, actionEl, state) {
  function valueOf(selector) {
    return state.content.querySelector(selector)?.value?.trim() || ''
  }

  if (action === 'add-plan') {
    const name        = valueOf('#add-planName')
    const price       = Number(valueOf('#add-planPrice'))
    const durationDays = Number(valueOf('#add-planDays'))
    if (!name || !price || !durationDays) throw new Error('Nhập tên, giá và số ngày')
    const id   = valueOf('#add-planId')
    await adminCreatePlan({
      ...(id   ? { id }              : {}),
      name,
      price,
      duration_days:    durationDays,
      service:          valueOf('#add-planService') || 'netflix',
      fulfillment_type: valueOf('#add-planFulfillment') || 'netflix',
      active: true,
    })
    return 'Đã thêm gói'
  }

  if (action === 'save-plan') {
    const id = actionEl.dataset.id
    const fields = [...state.content.querySelectorAll(`[data-plan-field][data-id="${id}"]`)]
    const body   = {}
    fields.forEach(f => {
      const key = f.dataset.planField
      body[key] = ['price', 'duration_days'].includes(key) ? Number(f.value || 0) : f.value.trim()
    })
    await adminUpdatePlan(id, body)
    return 'Đã lưu gói'
  }

  if (action === 'delete-plan') {
    return new Promise(resolve => showConfirmModal(state.container, {
      title: 'Xoá gói dịch vụ',
      body: 'Xoá gói này khỏi hệ thống?',
      confirmLabel: 'Xoá',
      danger: true,
      onConfirm: async () => { 
        await adminDeletePlan(actionEl.dataset.id)
        resolve('Đã xoá gói dịch vụ') 
      },
    })).then(res => res || false)
  }

  return null
}
