import { adminApiFetch } from './api.js'

/**
 * @typedef {'active'|'inactive'} CatalogCategoryStatus
 * @typedef {'active'|'inactive'|'draft'} CatalogProductStatus
 * @typedef {'active'|'inactive'|'out_of_stock'} CatalogVariantStatus
 *
 * @typedef {Object} CatalogCategory
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {'product'|'service'} type
 * @property {string|null} description
 * @property {CatalogCategoryStatus} status
 * @property {number} sortOrder
 * @property {number} [productCount]
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} CatalogProduct
 * @property {string} id
 * @property {string} categoryId
 * @property {string} name
 * @property {string} slug
 * @property {string|null} sku
 * @property {number} price
 * @property {CatalogProductStatus} status
 * @property {'manual'|'stock'|'key'|'service'} [fulfillment_type]
 * @property {CatalogCategory|null} [category]
 * @property {CatalogProductDetail|null} [detail]
 * @property {CatalogImage[]} [images]
 * @property {CatalogVariant[]} [variants]
 * @property {CatalogImage|null} [mainImage]
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} CatalogProductDetail
 * @property {string} id
 * @property {string} productId
 * @property {string} shortDescription
 * @property {string} longDescription
 * @property {Record<string, string>} specifications
 * @property {Record<string, string>} extraInfo
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} CatalogImage
 * @property {string} id
 * @property {string} productId
 * @property {string} imageUrl
 * @property {string|null} altText
 * @property {boolean} isMain
 * @property {number} sortOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} CatalogVariant
 * @property {string} id
 * @property {string} productId
 * @property {string} name
 * @property {string|null} sku
 * @property {number} price
 * @property {number} [cost_price]
 * @property {number} duration_days
 * @property {number} stock
 * @property {string|null} color
 * @property {string|null} size
 * @property {CatalogVariantStatus} status
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} CatalogPagination
 * @property {number} page
 * @property {number} limit
 * @property {number} total
 * @property {number} totalPages
 */
export const CATEGORY_STATUSES = ['active', 'inactive']
export const CATEGORY_TYPES = ['product', 'service']
export const PRODUCT_STATUSES = ['active', 'inactive', 'draft']
export const VARIANT_STATUSES = ['active', 'inactive', 'out_of_stock']

const BASE = '/api/admin/catalog'

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

async function parseResponse(response) {
  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { message: text }
  }
  if (!response.ok || json.success === false) {
    throw new Error(json.error || json.message || `Loi ${response.status}`)
  }
  return json.data || json
}

function jsonInit(method, body) {
  return {
    method,
    body: body == null ? undefined : JSON.stringify(body)
  }
}

export async function adminListCatalogCategories(params = {}) {
  const response = await adminApiFetch(`${BASE}/categories${buildQuery(params)}`)
  return parseResponse(response)
}

export async function adminGetCatalogCategory(id, params = {}) {
  const response = await adminApiFetch(`${BASE}/categories/${encodeURIComponent(id)}${buildQuery(params)}`)
  return parseResponse(response)
}

export async function adminCreateCatalogCategory(payload) {
  const response = await adminApiFetch(`${BASE}/categories`, jsonInit('POST', payload))
  return parseResponse(response).then((data) => data.category)
}

export async function adminUpdateCatalogCategory(id, payload) {
  const response = await adminApiFetch(`${BASE}/categories/${encodeURIComponent(id)}`, jsonInit('PATCH', payload))
  return parseResponse(response).then((data) => data.category)
}

export async function adminDeleteCatalogCategory(id) {
  const response = await adminApiFetch(`${BASE}/categories/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return parseResponse(response)
}

export async function adminListCatalogProducts(params = {}) {
  const response = await adminApiFetch(`${BASE}/products${buildQuery(params)}`)
  return parseResponse(response)
}

export async function adminGetCatalogProduct(id) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(id)}`)
  return parseResponse(response).then((data) => data.product)
}

export async function adminCreateCatalogProduct(payload) {
  const response = await adminApiFetch(`${BASE}/products`, jsonInit('POST', payload))
  return parseResponse(response).then((data) => data.product)
}

export async function adminUpdateCatalogProduct(id, payload) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(id)}`, jsonInit('PATCH', payload))
  return parseResponse(response).then((data) => data.product)
}

export async function adminDeleteCatalogProduct(id) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return parseResponse(response)
}

export async function adminGetCatalogProductDetail(productId) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(productId)}/detail`)
  return parseResponse(response).then((data) => data.detail)
}

export async function adminUpsertCatalogProductDetail(productId, payload) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(productId)}/detail`, jsonInit('PATCH', payload))
  return parseResponse(response).then((data) => data.detail)
}

export async function adminListCatalogImages(productId) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(productId)}/images`)
  return parseResponse(response).then((data) => data.images || [])
}

export async function adminCreateCatalogImage(productId, payload) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(productId)}/images`, jsonInit('POST', payload))
  return parseResponse(response).then((data) => data.image)
}

export async function adminUpdateCatalogImage(productId, imageId, payload) {
  const response = await adminApiFetch(
    `${BASE}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    jsonInit('PATCH', payload)
  )
  return parseResponse(response).then((data) => data.image)
}

export async function adminDeleteCatalogImage(productId, imageId) {
  const response = await adminApiFetch(
    `${BASE}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    { method: 'DELETE' }
  )
  return parseResponse(response)
}

export async function adminListCatalogVariants(productId) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(productId)}/variants`)
  return parseResponse(response).then((data) => data.variants || [])
}

export async function adminCreateCatalogVariant(productId, payload) {
  const response = await adminApiFetch(`${BASE}/products/${encodeURIComponent(productId)}/variants`, jsonInit('POST', payload))
  return parseResponse(response).then((data) => data.variant)
}

export async function adminUpdateCatalogVariant(productId, variantId, payload) {
  const response = await adminApiFetch(
    `${BASE}/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    jsonInit('PATCH', payload)
  )
  return parseResponse(response).then((data) => data.variant)
}

export async function adminDeleteCatalogVariant(productId, variantId) {
  const response = await adminApiFetch(
    `${BASE}/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    { method: 'DELETE' }
  )
  return parseResponse(response)
}
