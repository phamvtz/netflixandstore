import { formatVND, formatDate } from '../../utils/format.js'
import {
  adminCreateCatalogCategory,
  adminCreateCatalogProduct,
  adminCreateCatalogVariant,
  adminDeleteCatalogCategory,
  adminDeleteCatalogVariant,
  adminListCatalogCategories,
  adminListCatalogProducts,
  adminListCatalogVariants,
  adminUpdateCatalogCategory,
  adminUpdateCatalogProduct,
  adminUpdateCatalogVariant
} from '../../utils/adminCatalogApi.js'
import {
  adminAddAccountsBulk,
  adminGetAllAccounts,
  adminUpdateAccount
} from '../../utils/api.js'

const CATEGORY_LIMIT = 1000
const SOLD_STATUSES = new Set(['assigned', 'full', 'sold'])

export function mountCatalogAdmin(container, { embedded = false, onChanged = null } = {}) {
  const state = {
    container,
    embedded,
    onChanged,
    tab: 'categories',
    loading: false,
    busy: false,
    error: '',
    categories: [],
    products: [],
    variants: [],
    resources: [],
    importMode: 'paste',
    createType: 'product',
    selectedCategoryId: '',
    selectedVariantId: '',
    inventoryCategoryId: '',
    inventoryStatus: 'all',
    result: ''
  }

  const onClick = async (event) => {
    const actionEl = event.target.closest('[data-service-action]')
    if (!actionEl || !container.contains(actionEl)) return
    event.preventDefault()
    await handleAction(state, actionEl)
  }

  const onChange = (event) => {
    const el = event.target
    if (!el?.dataset?.serviceChange) return
    handleChange(state, el)
  }

  const onInput = (event) => {
    const el = event.target
    if (el?.id === 'serviceImportLines') updateImportLineCount(state)
  }

  container.addEventListener('click', onClick)
  container.addEventListener('change', onChange)
  container.addEventListener('input', onInput)

  loadAll(state).catch((err) => showError(state, err))

  return () => {
    container.removeEventListener('click', onClick)
    container.removeEventListener('change', onChange)
    container.removeEventListener('input', onInput)
  }
}

async function loadAll(state) {
  state.loading = true
  state.error = ''
  render(state)

  const [categoryData, productData, resources] = await Promise.all([
    adminListCatalogCategories({ page: 1, limit: CATEGORY_LIMIT }),
    adminListCatalogProducts({ page: 1, limit: CATEGORY_LIMIT }),
    adminGetAllAccounts({ resource_kind: 'product_stock', limit: 5000 }).catch(() => [])
  ])

  const products = productData.products || []
  const variantGroups = await Promise.all(
    products.map((product) =>
      adminListCatalogVariants(product.id)
        .then((items) => items.map((variant) => ({
          ...variant,
          productId: product.id,
          product,
          categoryId: product.categoryId
        })))
        .catch(() => [])
    )
  )

  state.categories = categoryData.categories || []
  state.products = products
  state.variants = variantGroups.flat()
  state.resources = resources || []
  normalizeSelections(state)
  state.loading = false
  render(state)
}

function normalizeSelections(state) {
  const importCategories = autoCategories(state)
  if (!importCategories.some((item) => item.id === state.selectedCategoryId)) {
    state.selectedCategoryId = importCategories[0]?.id || ''
  }
  const importVariants = variantsForCategory(state, state.selectedCategoryId)
  if (!importVariants.some((item) => item.id === state.selectedVariantId)) {
    state.selectedVariantId = importVariants[0]?.id || ''
  }
  if (state.inventoryCategoryId && !state.categories.some((item) => item.id === state.inventoryCategoryId)) {
    state.inventoryCategoryId = ''
  }
}

async function handleAction(state, actionEl) {
  const action = actionEl.dataset.serviceAction
  try {
    if (action === 'tab') {
      state.tab = actionEl.dataset.tab || 'categories'
      render(state)
      return
    }
    if (action === 'refresh') {
      await loadAll(state)
      return
    }
    if (action === 'create-category') {
      await createCategory(state)
      return
    }
    if (action === 'save-category') {
      await saveCategory(state, actionEl)
      return
    }
    if (action === 'delete-category') {
      await deleteCategory(state, actionEl.dataset.categoryId)
      return
    }
    if (action === 'switch-category-type') {
      await switchCategoryType(state, actionEl.dataset.categoryId, actionEl.dataset.type)
      return
    }
    if (action === 'add-variant') {
      await addVariant(state, actionEl)
      return
    }
    if (action === 'save-variant') {
      await saveVariant(state, actionEl)
      return
    }
    if (action === 'delete-variant') {
      await deleteVariant(state, actionEl)
      return
    }
    if (action === 'confirm-import') {
      await confirmImport(state)
      return
    }
    if (action === 'clear-import') {
      const input = state.container.querySelector('#serviceImportLines')
      if (input) input.value = ''
      updateImportLineCount(state)
      return
    }
    if (action === 'copy-resource') {
      await copyText(actionEl.dataset.value || '')
      toast('Đã copy nội dung đầy đủ', 'success')
      return
    }
    if (action === 'mark-resource-sold') {
      await markResourceSold(state, actionEl.dataset.id)
      return
    }
    if (action === 'mark-quantity-sold') {
      await markOneQuantitySold(state, actionEl.dataset.variantId)
      return
    }
  } catch (err) {
    toast(err.message, 'error')
    state.result = err.message
    render(state)
  }
}

function handleChange(state, el) {
  const key = el.dataset.serviceChange
  if (key === 'import-category') {
    state.selectedCategoryId = el.value || ''
    state.selectedVariantId = variantsForCategory(state, state.selectedCategoryId)[0]?.id || ''
    render(state)
    return
  }
  if (key === 'import-variant') {
    state.selectedVariantId = el.value || ''
    render(state)
    return
  }
  if (key === 'import-mode') {
    state.importMode = el.checked ? 'quantity' : 'paste'
    render(state)
    return
  }
  if (key === 'create-type') {
    state.createType = el.value === 'service' ? 'service' : 'product'
    render(state)
    return
  }
  if (key === 'inventory-category') {
    state.inventoryCategoryId = el.value || ''
    render(state)
    return
  }
  if (key === 'inventory-status') {
    state.inventoryStatus = el.value || 'all'
    render(state)
  }
}

async function runBusy(state, work) {
  state.busy = true
  render(state)
  try {
    await work()
  } finally {
    state.busy = false
    render(state)
  }
}

async function createCategory(state) {
  const name = valueOf(state, '#serviceCategoryName')
  if (!name) throw new Error('Nhập tên danh mục')
  const type = state.createType === 'service' ? 'service' : 'product'
  const fulfillment = type === 'service' ? 'manual' : 'stock'
  await runBusy(state, async () => {
    const category = await adminCreateCatalogCategory({
      name,
      type,
      status: 'active'
    })
    await adminCreateCatalogProduct({
      name,
      categoryId: category.id,
      slug: hiddenProductSlug(name),
      price: 0,
      status: 'active',
      fulfillment_type: fulfillment
    })
    state.result = `Đã tạo danh mục ${name}`
    state.onChanged?.()
    await loadAll(state)
  })
}

async function deleteCategory(state, categoryId) {
  const category = categoryById(state, categoryId)
  if (!category) throw new Error('Không tìm thấy danh mục')
  if (!window.confirm(`Xóa danh mục "${category.name}"? Biến thể và tồn kho liên quan cũng sẽ bị xóa.`)) return
  await runBusy(state, async () => {
    await adminDeleteCatalogCategory(categoryId)
    state.result = `Đã xóa danh mục ${category.name}`
    state.onChanged?.()
    await loadAll(state)
  })
}

async function saveCategory(state, actionEl) {
  const category = categoryById(state, actionEl.dataset.categoryId)
  if (!category) throw new Error('Khong tim thay danh muc')
  const form = actionEl.closest('[data-category-form]')
  const name = form?.querySelector('[data-category-name]')?.value?.trim() || ''
  const status = form?.querySelector('[data-category-status]')?.value || 'active'
  if (!name) throw new Error('Nhap ten danh muc')
  await runBusy(state, async () => {
    await adminUpdateCatalogCategory(category.id, { name, status })
    const products = productsForCategory(state, category.id)
    await Promise.all(products.map((product) => adminUpdateCatalogProduct(product.id, {
      name,
      status: status === 'active' ? 'active' : 'inactive'
    })))
    state.result = `Da luu danh muc ${name}`
    state.onChanged?.()
    await loadAll(state)
  })
}

async function switchCategoryType(state, categoryId, nextType) {
  const category = categoryById(state, categoryId)
  if (!category) throw new Error('Khong tim thay danh muc')
  const type = nextType === 'service' ? 'service' : 'product'
  const fulfillment = type === 'service' ? 'manual' : 'stock'
  const label = type === 'service' ? 'dich vu admin xu ly' : 'san pham cap tu dong'
  if (!window.confirm(`Chuyen "${category.name}" sang ${label}?`)) return
  await runBusy(state, async () => {
    await adminUpdateCatalogCategory(category.id, { type })
    const existingProducts = productsForCategory(state, category.id)
    if (existingProducts.length) {
      await Promise.all(existingProducts.map(product =>
        adminUpdateCatalogProduct(product.id, { fulfillment_type: fulfillment })
      ))
    } else {
      await adminCreateCatalogProduct({
        name: category.name,
        categoryId: category.id,
        slug: hiddenProductSlug(category.name),
        price: 0,
        status: 'active',
        fulfillment_type: fulfillment
      })
    }
    state.result = `Da chuyen ${category.name} sang ${label}`
    state.onChanged?.()
    await loadAll(state)
  })
}

async function addVariant(state, actionEl) {
  const category = categoryById(state, actionEl.dataset.categoryId)
  if (!category) throw new Error('Không tìm thấy danh mục')
  const form = actionEl.closest('[data-variant-form]')
  const name = form?.querySelector('[data-variant-name]')?.value?.trim() || ''
  const cost = numberFromInput(form?.querySelector('[data-variant-cost]')?.value, 'Giá nhập', { min: 0, defaultValue: 0 })
  const price = numberFromInput(form?.querySelector('[data-variant-price]')?.value, 'Giá bán', { min: 0, required: true })
  if (!name) throw new Error('Nhập tên biến thể')
  await runBusy(state, async () => {
    const product = await ensureCategoryProduct(state, category)
    await adminCreateCatalogVariant(product.id, {
      name,
      price,
      cost_price: cost,
      duration_days: inferDays(name),
      stock: 0,
      status: 'active'
    })
    state.result = `Đã thêm biến thể ${name}`
    state.onChanged?.()
    await loadAll(state)
  })
}

async function deleteVariant(state, actionEl) {
  const variant = variantById(state, actionEl.dataset.variantId)
  if (!variant) throw new Error('Không tìm thấy biến thể')
  if (!window.confirm(`Xóa biến thể "${variant.name}"?`)) return
  await runBusy(state, async () => {
    await adminDeleteCatalogVariant(variant.productId, variant.id)
    state.result = `Đã xóa biến thể ${variant.name}`
    state.onChanged?.()
    await loadAll(state)
  })
}

async function saveVariant(state, actionEl) {
  const variant = variantById(state, actionEl.dataset.variantId)
  if (!variant) throw new Error('Khong tim thay bien the')
  const row = actionEl.closest('[data-variant-row]')
  const name = row?.querySelector('[data-variant-edit-name]')?.value?.trim() || ''
  const cost = numberFromInput(row?.querySelector('[data-variant-edit-cost]')?.value, 'Gia nhap', { min: 0, defaultValue: 0 })
  const price = numberFromInput(row?.querySelector('[data-variant-edit-price]')?.value, 'Gia ban', { min: 0, required: true })
  const days = numberFromInput(row?.querySelector('[data-variant-edit-days]')?.value, 'So ngay', { min: 1, integer: true, required: true })
  const status = row?.querySelector('[data-variant-edit-status]')?.value || 'active'
  if (!name) throw new Error('Nhap ten bien the')
  await runBusy(state, async () => {
    await adminUpdateCatalogVariant(variant.productId, variant.id, {
      name,
      price,
      cost_price: cost,
      duration_days: days,
      status
    })
    state.result = `Da luu bien the ${name}`
    state.onChanged?.()
    await loadAll(state)
  })
}

async function ensureCategoryProduct(state, category) {
  const existing = productsForCategory(state, category.id)[0]
  if (existing) return existing
  const fulfillment = category?.type === 'service' ? 'manual' : 'stock'
  const product = await adminCreateCatalogProduct({
    name: category.name,
    categoryId: category.id,
    slug: hiddenProductSlug(category.name),
    price: 0,
    status: 'active',
    fulfillment_type: fulfillment
  })
  state.products.push(product)
  return product
}

async function confirmImport(state) {
  const category = categoryById(state, state.selectedCategoryId)
  const variant = variantById(state, state.selectedVariantId)
  if (!category) throw new Error('Chọn danh mục')
  if (!variant) throw new Error('Chọn biến thể')
  if (!isAutoCategory(state, category)) {
    throw new Error('Danh muc dich vu xu ly tay khong can nhap kho. Don se vao Don hang dich vu.')
  }

  const note = valueOf(state, '#serviceImportNote') || null
  let payload = []
  let skippedInInput = 0
  let expected = 0

  if (state.importMode === 'quantity') {
    throw new Error('Che do nhap so luong khong tao noi dung giao hang. Hay paste acc/key/link that.')
  } else {
    const parsed = parseImportLines(valueOf(state, '#serviceImportLines'))
    if (!parsed.lines.length) throw new Error('Dán ít nhất 1 dòng acc/key')
    expected = parsed.lines.length
    skippedInInput = parsed.duplicates
    payload = parsed.lines.map((value) => ({ value, stock_mode: 'value' }))
  }

  const meta = stockPayload(category, variant, note)
  await runBusy(state, async () => {
    const result = await adminAddAccountsBulk(payload.map((item) => ({ ...meta, ...item })))
    const added = Number(result.added || 0)
    const duplicates = Number(result.duplicates || 0)
    const errors = Number(result.errors || 0)
    const skipped = skippedInInput + duplicates + errors
    state.result = `Đã nhập ${added}/${expected}. Bỏ qua ${skipped}${skippedInInput ? ` (${skippedInInput} trùng trong ô nhập)` : ''}${duplicates ? `, ${duplicates} trùng trong kho` : ''}${errors ? `, ${errors} lỗi` : ''}.`
    state.onChanged?.()
    await loadAll(state)
  })
}

async function markResourceSold(state, id) {
  if (!id) return
  await runBusy(state, async () => {
    await adminUpdateAccount(id, { status: 'assigned', assigned_count: 1, sold_at: new Date().toISOString() })
    state.result = 'Đã đánh dấu tài nguyên là đã bán'
    state.onChanged?.()
    await loadAll(state)
  })
}

async function markOneQuantitySold(state, variantId) {
  const row = quantityResourcesForVariant(state, variantId).find((item) => item.status === 'available')
  if (!row) throw new Error('Biến thể này không còn số lượng khả dụng')
  await markResourceSold(state, row.id)
}

function stockPayload(category, variant, note) {
  return {
    service: serviceKey(category.name),
    type: 'account',
    account_type: 'stock',
    max_slots: 1,
    note,
    plan_id: variant.id,
    variant_id: variant.id,
    product_id: variant.productId,
    category_id: category.id,
    cost_price: Number(variant.cost_price || 0)
  }
}

function render(state) {
  state.container.innerHTML = `
    <div class="service-admin${state.embedded ? ' service-admin--embedded' : ''}">
      <div class="service-admin-head">
        <div>
          <h1>Sản phẩm / Dịch vụ</h1>
          <p>Sản phẩm stock/key giao tự động từ kho. Dịch vụ manual chuyển sang đơn admin xử lý.</p>
        </div>
        <button class="btn btn-sm btn-outline" data-service-action="refresh">Làm mới</button>
      </div>
      <div class="service-tabs">
        ${tabButton(state, 'categories', 'Danh mục')}
        ${tabButton(state, 'import', 'Nhập kho')}
        ${tabButton(state, 'inventory', 'Tồn kho')}
      </div>
      ${state.loading ? loadingBox() : state.error ? errorBox(state) : renderTab(state)}
    </div>
  `
  if (state.tab === 'import') updateImportLineCount(state)
}

function renderTab(state) {
  if (state.tab === 'import') return renderImportTab(state)
  if (state.tab === 'inventory') return renderInventoryTab(state)
  return renderCategoriesTab(state)
}

function renderCategoriesTab(state) {
  return `
    <section class="service-panel">
      <div class="service-create-row">
        <select class="select" data-service-change="create-type">
          <option value="product"${state.createType === 'product' ? ' selected' : ''}>San pham - cap tu dong</option>
          <option value="service"${state.createType === 'service' ? ' selected' : ''}>Dich vu - admin xu ly</option>
        </select>
        <input id="serviceCategoryName" class="input" placeholder="Tên danh mục, ví dụ: CapCut Pro">
        <button class="btn btn-primary" data-service-action="create-category" ${state.busy ? 'disabled' : ''}>Thêm danh mục</button>
      </div>
      ${state.result ? `<div class="service-result">${esc(state.result)}</div>` : ''}
      <div class="service-category-list">
        ${state.categories.length
          ? state.categories.map((category) => renderCategoryCard(state, category)).join('')
          : emptyBox('Chưa có danh mục', 'Nhập tên danh mục để bắt đầu tạo dịch vụ.')}
      </div>
    </section>
  `
}

function renderCategoryCard(state, category) {
  const variants = variantsForCategory(state, category.id)
  const counts = categoryStockCounts(state, category.id)
  const auto = isAutoCategory(state, category)
  const typeLabel = auto ? 'San pham tu dong' : 'Dich vu xu ly tay'
  const summary = auto
    ? `${counts.available} con hang - ${counts.sold} da ban - ${variants.length} bien the`
    : `${variants.length} bien the - don vao Don hang dich vu`
  return `
    <article class="service-category-card" data-category-form>
      <header class="service-category-card-head">
        <div>
          <input class="input" data-category-name value="${attr(category.name || '')}" aria-label="Ten danh muc">
          <p><b>${esc(typeLabel)}</b> - ${esc(summary)}</p>
        </div>
        <div class="service-category-actions">
          <select class="select" data-category-status ${state.busy ? 'disabled' : ''}>
            <option value="active"${category.status !== 'inactive' ? ' selected' : ''}>Active</option>
            <option value="inactive"${category.status === 'inactive' ? ' selected' : ''}>Inactive</option>
          </select>
          <button class="btn btn-sm btn-primary" data-service-action="save-category" data-category-id="${attr(category.id)}" ${state.busy ? 'disabled' : ''}>Luu</button>
          <button class="btn btn-sm btn-outline" data-service-action="switch-category-type" data-category-id="${attr(category.id)}" data-type="${auto ? 'service' : 'product'}" ${state.busy ? 'disabled' : ''}>${auto ? 'Chuyen sang dich vu' : 'Chuyen sang san pham'}</button>
          <button class="btn btn-sm btn-danger" data-service-action="delete-category" data-category-id="${attr(category.id)}" ${state.busy ? 'disabled' : ''}>Xóa</button>
        </div>
      </header>

      <div class="service-variant-list">
        ${variants.length
          ? variants.map((variant) => renderVariantRow(state, variant, category)).join('')
          : '<div class="service-empty-inline">Chưa có biến thể.</div>'}
      </div>

      <div class="service-variant-form" data-variant-form>
        <input class="input" data-variant-name placeholder="Tên biến thể, ví dụ: 35 ngày">
        <input class="input" data-variant-cost type="number" min="0" placeholder="Giá nhập">
        <input class="input" data-variant-price type="number" min="0" placeholder="Giá bán">
        <button class="btn btn-primary btn-sm" data-service-action="add-variant" data-category-id="${attr(category.id)}" ${state.busy ? 'disabled' : ''}>Thêm biến thể</button>
      </div>
    </article>
  `
}

function renderVariantRow(state, variant, category = null) {
  const counts = variantStockCounts(state, variant.id)
  const auto = !category || isAutoCategory(state, category)
  const stockSummary = auto
    ? `<b>${counts.available}</b> con <b>${counts.sold}</b> ban <b>${counts.total}</b> tong`
    : '<b>Manual</b> admin xu ly'
  return `
    <div class="service-variant-row" data-variant-row>
      <div>
        <strong style="display:none">${esc(variant.name || 'Bien the')}</strong>
        <span>Nhập ${formatVND(variant.cost_price || 0)} · Bán ${formatVND(variant.price || 0)}</span>
      </div>
      <div class="service-stock-mini">
        ${stockSummary}
      </div>
      <input class="input" data-variant-edit-name value="${attr(variant.name || '')}" aria-label="Ten bien the">
      <input class="input" data-variant-edit-cost type="number" min="0" value="${attr(variant.cost_price || 0)}" aria-label="Gia nhap">
      <input class="input" data-variant-edit-price type="number" min="0" value="${attr(variant.price || 0)}" aria-label="Gia ban">
      <input class="input" data-variant-edit-days type="number" min="1" value="${attr(variant.duration_days || inferDays(variant.name))}" aria-label="So ngay">
      <select class="select" data-variant-edit-status ${state.busy ? 'disabled' : ''}>
        ${['active', 'inactive', 'out_of_stock'].map((status) => `<option value="${status}"${(variant.status || 'active') === status ? ' selected' : ''}>${status}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-primary" data-service-action="save-variant" data-variant-id="${attr(variant.id)}" ${state.busy ? 'disabled' : ''}>Luu</button>
      <button class="btn btn-sm btn-danger" data-service-action="delete-variant" data-variant-id="${attr(variant.id)}" ${state.busy ? 'disabled' : ''}>Xóa</button>
    </div>
  `
}

function renderImportTab(state) {
  const categories = autoCategories(state)
  if (!categories.length) {
    return emptyBox('Chua co san pham tu dong', 'Tao danh muc loai San pham - cap tu dong truoc khi nhap kho.')
  }
  const categoryOptions = categories.map((category) =>
    `<option value="${attr(category.id)}"${category.id === state.selectedCategoryId ? ' selected' : ''}>${esc(category.name)}</option>`
  ).join('')
  const variants = variantsForCategory(state, state.selectedCategoryId)
  const variantOptions = variants.map((variant) =>
    `<option value="${attr(variant.id)}"${variant.id === state.selectedVariantId ? ' selected' : ''}>${esc(variant.name)} · ${formatVND(variant.price || 0)}</option>`
  ).join('')
  const selected = variantById(state, state.selectedVariantId)
  const counts = selected ? variantStockCounts(state, selected.id) : { available: 0, sold: 0, total: 0 }

  return `
    <section class="service-panel service-import-panel">
      <div class="service-import-grid">
        <label>
          <span>Danh mục</span>
          <select class="select" data-service-change="import-category">
            <option value="">Chọn danh mục</option>
            ${categoryOptions}
          </select>
        </label>
        <label>
          <span>Biến thể</span>
          <select class="select" data-service-change="import-variant">
            <option value="">Chọn biến thể</option>
            ${variantOptions}
          </select>
        </label>
        <label>
          <span>Ghi chú</span>
          <input id="serviceImportNote" class="input" placeholder="Tùy chọn">
        </label>
      </div>

      <div class="service-import-summary">
        <strong>${selected ? esc(selected.name) : 'Chưa chọn biến thể'}</strong>
        <span>${counts.available} còn · ${counts.sold} đã bán · ${counts.total} tổng</span>
      </div>

      <div class="service-mode-row">
        <span>Paste acc/key</span>
        <label class="service-switch">
          <input type="checkbox" data-service-change="import-mode" ${state.importMode === 'quantity' ? 'checked' : ''}>
          <i></i>
        </label>
        <span>Nhập số lượng</span>
      </div>

      ${state.importMode === 'quantity' ? `
        <div class="service-quantity-box">
          <label>
            <span>Số lượng</span>
            <input id="serviceImportQuantity" class="input" type="number" min="1" value="1">
          </label>
          <p class="service-empty-inline">Che do nay chi de tham khao, khong tao hang giao tu dong. Hay paste noi dung that.</p>
        </div>
      ` : `
        <div class="service-paste-box">
          <div class="service-paste-head">
            <span>Mỗi dòng 1 tài nguyên</span>
            <b id="serviceImportLineCount">0 dòng hợp lệ</b>
          </div>
          <textarea id="serviceImportLines" rows="9" placeholder="email:pass&#10;KEY-XXXX-XXXX&#10;link kích hoạt bất kỳ"></textarea>
          <button class="btn btn-sm btn-outline" data-service-action="clear-import">Xóa nội dung</button>
        </div>
      `}

      <button class="btn btn-primary service-confirm-import" data-service-action="confirm-import" ${state.busy || state.importMode === 'quantity' ? 'disabled' : ''}>Xác nhận nhập kho</button>
      ${state.result ? `<div class="service-result">${esc(state.result)}</div>` : ''}
    </section>
  `
}

function renderInventoryTab(state) {
  const stats = inventoryStats(state)
  const categoryOptions = state.categories.map((category) =>
    `<option value="${attr(category.id)}"${category.id === state.inventoryCategoryId ? ' selected' : ''}>${esc(category.name)}</option>`
  ).join('')
  const categories = state.inventoryCategoryId
    ? state.categories.filter((category) => category.id === state.inventoryCategoryId)
    : state.categories

  return `
    <section class="service-panel">
      <div class="service-stats">
        <div><span>Danh mục</span><strong>${stats.categories}</strong></div>
        <div><span>Còn hàng</span><strong>${stats.available}</strong></div>
        <div><span>Đã bán</span><strong>${stats.sold}</strong></div>
        <div><span>Giá trị nhập</span><strong>${formatVND(stats.costValue)}</strong></div>
      </div>

      <div class="service-inventory-filters">
        <select class="select" data-service-change="inventory-category">
          <option value="">Tất cả danh mục</option>
          ${categoryOptions}
        </select>
        <select class="select" data-service-change="inventory-status">
          <option value="all"${state.inventoryStatus === 'all' ? ' selected' : ''}>Tất cả trạng thái</option>
          <option value="available"${state.inventoryStatus === 'available' ? ' selected' : ''}>Còn hàng</option>
          <option value="sold"${state.inventoryStatus === 'sold' ? ' selected' : ''}>Đã bán</option>
        </select>
      </div>

      <div class="service-inventory-groups">
        ${categories.length
          ? categories.map((category) => renderInventoryCategory(state, category)).join('')
          : emptyBox('Không có tồn kho', 'Chưa có danh mục phù hợp bộ lọc.')}
      </div>
      ${state.result ? `<div class="service-result">${esc(state.result)}</div>` : ''}
    </section>
  `
}

function renderInventoryCategory(state, category) {
  const variants = variantsForCategory(state, category.id)
    .filter((variant) => filteredResourcesForVariant(state, variant.id).length || quantityResourcesForVariant(state, variant.id).length)
  if (!variants.length) return ''
  return `
    <article class="service-inventory-category">
      <h2>${esc(category.name)}</h2>
      ${variants.map((variant) => renderInventoryVariant(state, variant)).join('')}
    </article>
  `
}

function renderInventoryVariant(state, variant) {
  const quantityRows = filterByInventoryStatus(state, quantityResourcesForVariant(state, variant.id))
  const valueRows = filterByInventoryStatus(state, valueResourcesForVariant(state, variant.id))
  const qtyAvailable = quantityRows.filter((row) => row.status === 'available').length
  const qtySold = quantityRows.filter((row) => SOLD_STATUSES.has(row.status)).length
  const hasQuantity = quantityRows.length > 0

  return `
    <section class="service-inventory-variant">
      <div class="service-inventory-variant-head">
        <strong>${esc(variant.name)}</strong>
        <span>Nhập ${formatVND(variant.cost_price || 0)} · Bán ${formatVND(variant.price || 0)}</span>
      </div>
      ${hasQuantity ? `
        <div class="service-quantity-row">
          <span>SL: ${qtyAvailable} còn / ${qtySold} đã bán</span>
          ${qtyAvailable ? `<button class="btn btn-sm btn-outline" data-service-action="mark-quantity-sold" data-variant-id="${attr(variant.id)}">Đánh dấu bán 1</button>` : ''}
        </div>
      ` : ''}
      ${valueRows.length ? `
        <div class="service-resource-list">
          ${valueRows.map((row) => renderResourceRow(row)).join('')}
        </div>
      ` : (!hasQuantity ? '<div class="service-empty-inline">Không có tài nguyên theo bộ lọc.</div>' : '')}
    </section>
  `
}

function renderResourceRow(row) {
  const sold = SOLD_STATUSES.has(row.status)
  return `
    <div class="service-resource-row">
      <code>${esc(maskValue(row.value))}</code>
      <span class="status-badge ${sold ? 'status-active' : row.status === 'available' ? 'status-available' : 'status-pending'}">${sold ? 'Đã bán' : row.status === 'available' ? 'Còn hàng' : esc(row.status || 'Khác')}</span>
      <span>${formatDate(row.created_at || row.createdAt)}</span>
      <button class="btn btn-sm btn-outline" data-service-action="copy-resource" data-value="${attr(row.value || '')}">Copy</button>
      ${!sold ? `<button class="btn btn-sm btn-primary" data-service-action="mark-resource-sold" data-id="${attr(row.id)}">Đánh dấu đã bán</button>` : ''}
    </div>
  `
}

function productsForCategory(state, categoryId) {
  return state.products.filter((product) => product.categoryId === categoryId)
}

function variantsForCategory(state, categoryId) {
  if (!categoryId) return []
  return state.variants
    .filter((variant) => variant.categoryId === categoryId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'))
}

function variantById(state, id) {
  return state.variants.find((variant) => variant.id === id) || null
}

function categoryById(state, id) {
  return state.categories.find((category) => category.id === id) || null
}

function categoryMainProduct(state, categoryId) {
  return productsForCategory(state, categoryId)[0] || null
}

function categoryFulfillmentType(state, category) {
  const product = categoryMainProduct(state, category?.id)
  const fallback = category?.type === 'product' ? 'stock' : 'manual'
  const fulfillment = String(product?.fulfillment_type || fallback || '').toLowerCase()
  return fulfillment === 'service' ? 'manual' : fulfillment
}

function isAutoFulfillmentType(type) {
  return type === 'stock' || type === 'key'
}

function isAutoCategory(state, category) {
  return category?.type === 'product' && isAutoFulfillmentType(categoryFulfillmentType(state, category))
}

function autoCategories(state) {
  return state.categories.filter((category) => isAutoCategory(state, category))
}

function resourcesForVariant(state, variantId) {
  return state.resources.filter((row) => {
    if (String(row.variant_id || '') === String(variantId)) return true
    if (String(row.plan_id || '') === String(variantId)) return true
    return String(row.value || '').startsWith(`QTY:${variantId}:`)
  })
}

function isQuantityResource(row) {
  return row?.stock_mode === 'quantity' || /^QTY:/i.test(String(row?.value || ''))
}

function quantityResourcesForVariant(state, variantId) {
  return resourcesForVariant(state, variantId).filter(isQuantityResource)
}

function valueResourcesForVariant(state, variantId) {
  return resourcesForVariant(state, variantId).filter((row) => !isQuantityResource(row))
}

function filteredResourcesForVariant(state, variantId) {
  return filterByInventoryStatus(state, resourcesForVariant(state, variantId))
}

function filterByInventoryStatus(state, rows) {
  if (state.inventoryStatus === 'available') return rows.filter((row) => row.status === 'available')
  if (state.inventoryStatus === 'sold') return rows.filter((row) => SOLD_STATUSES.has(row.status))
  return rows
}

function variantStockCounts(state, variantId) {
  const rows = valueResourcesForVariant(state, variantId)
  const available = rows.filter((row) => row.status === 'available').length
  const sold = rows.filter((row) => SOLD_STATUSES.has(row.status)).length
  return { available, sold, total: rows.length }
}

function categoryStockCounts(state, categoryId) {
  return variantsForCategory(state, categoryId).reduce((total, variant) => {
    const counts = variantStockCounts(state, variant.id)
    total.available += counts.available
    total.sold += counts.sold
    total.total += counts.total
    return total
  }, { available: 0, sold: 0, total: 0 })
}

function inventoryStats(state) {
  const variantMap = new Map(state.variants.map((variant) => [variant.id, variant]))
  let available = 0
  let sold = 0
  let costValue = 0
  for (const row of state.resources) {
    if (isQuantityResource(row)) continue
    const variant = variantMap.get(row.variant_id || row.plan_id)
    if (!variant) continue
    if (row.status === 'available') available += 1
    if (SOLD_STATUSES.has(row.status)) sold += 1
    costValue += Number(row.cost_price ?? variant.cost_price ?? 0)
  }
  return {
    categories: state.categories.length,
    available,
    sold,
    costValue
  }
}

function parseImportLines(raw) {
  const values = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const seen = new Set()
  const lines = []
  let duplicates = 0
  for (const value of values) {
    if (seen.has(value)) {
      duplicates += 1
      continue
    }
    seen.add(value)
    lines.push(value)
  }
  return { lines, duplicates, total: values.length }
}

function updateImportLineCount(state) {
  const target = state.container.querySelector('#serviceImportLineCount')
  if (!target) return
  const parsed = parseImportLines(valueOf(state, '#serviceImportLines'))
  target.textContent = `${parsed.lines.length} dòng hợp lệ${parsed.duplicates ? ` · bỏ qua ${parsed.duplicates} trùng` : ''}`
}

function inferDays(name) {
  const text = String(name || '').toLowerCase()
  const day = text.match(/(?:^|[^\d])(\d{1,4})\s*(?:d|day|days|ngày|ngay)(?=$|[^\p{L}\d])/iu)
  if (day) return Number(day[1])
  const month = text.match(/(?:^|[^\d])(\d{1,3})\s*(?:m|month|months|tháng|thang)(?=$|[^\p{L}\d])/iu)
  if (month) return Number(month[1]) * 30
  const year = text.match(/(?:^|[^\d])(\d{1,2})\s*(?:y|year|years|năm|nam)(?=$|[^\p{L}\d])/iu)
  if (year) return Number(year[1]) * 365
  return 30
}

function quantityValue(variantId, index) {
  return `QTY:${variantId}:${Date.now()}:${index}:${Math.random().toString(36).slice(2, 8)}`
}

function serviceKey(name) {
  return String(name || 'other')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'other'
}

function hiddenProductSlug(name) {
  return `${serviceKey(name)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function numberFromInput(value, label, { min = null, integer = false, defaultValue, required = false } = {}) {
  if (value === '' || value == null) {
    if (required) throw new Error(`${label} là bắt buộc`)
    return defaultValue
  }
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`${label} phải là số`)
  if (integer && !Number.isInteger(n)) throw new Error(`${label} phải là số nguyên`)
  if (min != null && n < min) throw new Error(`${label} phải lớn hơn hoặc bằng ${min}`)
  return n
}

function maskValue(value) {
  const text = String(value || '')
  if (text.length <= 8) return text ? `${text.slice(0, 2)}•••${text.slice(-2)}` : ''
  return `${text.slice(0, 4)}•••${text.slice(-4)}`
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

function tabButton(state, tab, label) {
  return `<button class="service-tab${state.tab === tab ? ' active' : ''}" data-service-action="tab" data-tab="${attr(tab)}">${esc(label)}</button>`
}

function loadingBox() {
  return '<div class="loading"><div class="spinner"></div></div>'
}

function errorBox(state) {
  return `
    <div class="admin-v2-empty">
      <h2>Không tải được dữ liệu</h2>
      <p>${esc(state.error)}</p>
      <button class="btn btn-primary" data-service-action="refresh">Thử lại</button>
    </div>
  `
}

function emptyBox(title, text) {
  return `<div class="admin-v2-empty"><h2>${esc(title)}</h2><p>${esc(text || '')}</p></div>`
}

function showError(state, err) {
  state.loading = false
  state.error = err.message
  render(state)
}

function valueOf(state, selector) {
  return state.container.querySelector(selector)?.value?.trim() || ''
}

function toast(message, type = 'success') {
  window.showToast?.(message, type)
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function attr(value) {
  return esc(value).replace(/"/g, '&quot;')
}
