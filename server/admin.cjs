const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const CATEGORY_STATUSES = new Set(['active', 'inactive'])
const CATEGORY_TYPES = new Set(['product', 'service'])
const PRODUCT_STATUSES = new Set(['active', 'inactive', 'draft'])
const PRODUCT_FULFILLMENT_TYPES = new Set(['manual', 'stock', 'key'])
const VARIANT_STATUSES = new Set(['active', 'inactive', 'out_of_stock'])

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row?.[key] || 'unknown'
    acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
}

function sum(rows, getValue) {
  return rows.reduce((total, row) => total + Number(getValue(row) || 0), 0)
}

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function isPaid(row) {
  return row?.status === 'success'
}

function normalizeDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function normalizeDoc(doc) {
  if (!doc) return null
  const out = { ...doc }
  if (out.id == null && out._id != null) out.id = String(out._id)
  delete out._id
  return out
}

function normalizeDocs(docs) {
  return Array.isArray(docs) ? docs.map(normalizeDoc) : []
}

function createId() {
  return crypto.randomUUID()
}

function legacyIdFilter(id) {
  return { $or: [{ _id: id }, { id }] }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function slugify(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function httpError(status, message, details) {
  const err = new Error(message)
  err.status = status
  if (details) err.details = details
  return err
}

function sendOk(res, data = {}, status = 200, message = '') {
  res.status(status).json({
    success: true,
    ...(message ? { message } : {}),
    data
  })
}

function sendError(res, err) {
  const status = err.status || 500
  res.status(status).json({
    success: false,
    error: err.message || 'Internal server error',
    message: err.message || 'Internal server error',
    ...(err.details ? { details: err.details } : {})
  })
}

function paginationFromReq(req) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const limitRaw = Number.parseInt(req.query.limit || req.query.pageSize, 10) || 25
  const limit = Math.min(100, Math.max(1, limitRaw))
  return { page, limit, skip: (page - 1) * limit }
}

function paginationPayload(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit))
  }
}

function cleanString(value) {
  if (value == null) return ''
  return String(value).trim()
}

function optionalString(value) {
  const text = cleanString(value)
  return text ? text : null
}

function readNumber(value, field, { min = null, integer = false, defaultValue, required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw httpError(400, `${field} is required`)
    return defaultValue
  }
  const n = Number(value)
  if (!Number.isFinite(n)) throw httpError(400, `${field} must be a number`)
  if (integer && !Number.isInteger(n)) throw httpError(400, `${field} must be an integer`)
  if (min != null && n < min) throw httpError(400, `${field} must be greater than or equal to ${min}`)
  return n
}

function parseExplicitDayDuration(text) {
  const input = String(text || '').toLowerCase()
  const match = input.match(/(?:^|[^\d])(\d{1,4})\s*(?:d|day|days|ngày|ngay)(?=$|[^\p{L}\d])/iu)
  return match ? Number(match[1]) : null
}

function parsePeriodDuration(text) {
  const explicitDays = parseExplicitDayDuration(text)
  if (explicitDays) return explicitDays
  const input = String(text || '').toLowerCase()
  const year = input.match(/(?:^|[^\d])(\d{1,2})\s*(?:y|year|years|năm|nam)(?=$|[^\p{L}\d])/iu)
  if (year) return Number(year[1]) * 365
  const month = input.match(/(?:^|[^\d])(\d{1,3})\s*(?:m|month|months|tháng|thang)(?=$|[^\p{L}\d])/iu)
  if (month) return Number(month[1]) * 30
  return null
}

function resolveVariantDuration(product, variant = {}) {
  const stored = Number(variant.duration_days || product?.duration_days || 0)
  if (Number.isFinite(stored) && stored > 0) return stored
  return (
    parseExplicitDayDuration(variant.name || variant.label) ||
    parseExplicitDayDuration(product?.name) ||
    parsePeriodDuration(variant.name || variant.label) ||
    parsePeriodDuration(product?.name) ||
    30
  )
}

function readStatus(value, allowed, field, defaultValue) {
  const status = cleanString(value || defaultValue)
  if (!allowed.has(status)) {
    throw httpError(400, `${field} must be one of: ${[...allowed].join(', ')}`)
  }
  return status
}

function readProductFulfillment(value, defaultValue = 'manual') {
  const raw = cleanString(value)
  const status = !raw || raw === 'service' ? defaultValue : raw
  if (!PRODUCT_FULFILLMENT_TYPES.has(status)) {
    throw httpError(400, `fulfillment_type must be one of: ${[...PRODUCT_FULFILLMENT_TYPES].join(', ')}`)
  }
  return status
}

function readPlainObject(value, field, defaultValue = {}) {
  if (value == null) return defaultValue
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, `${field} must be an object`)
  }
  return value
}

function buildStats({ subscriptions, payments, profiles, accounts, catalogCategories = [], catalogProducts = [] }) {
  const startToday = todayStart()
  const startWeek = daysAgo(7)
  const startMonth = daysAgo(30)
  const paid = payments.filter(isPaid)
  const paidSince = (date) => paid.filter((row) => {
    const created = normalizeDate(row.created_at)
    return created && created >= date
  })
  const subSince = (date) => subscriptions.filter((row) => {
    const created = normalizeDate(row.created_at)
    return created && created >= date
  })

  const inventoryStatus = countBy(accounts, 'status')
  const netflixAvailable = accounts.filter((row) =>
    (row.service || 'netflix') === 'netflix' &&
    (row.account_type || 'shared') !== 'stock' &&
    !/^\[Lỗi TT\]/i.test(String(row.note || '')) &&
    row.status === 'available' &&
    Number(row.assigned_count || 0) < Number(row.max_slots || 5)
  ).length
  const stockAvailable = accounts.filter((row) =>
    row.account_type === 'stock' && (row.service || 'other') !== 'netflix' && row.status === 'available'
  ).length

  return {
    revenue: {
      today: sum(paidSince(startToday), (row) => row.amount),
      week: sum(paidSince(startWeek), (row) => row.amount),
      month: sum(paidSince(startMonth), (row) => row.amount),
      total: sum(paid, (row) => row.amount)
    },
    orders: {
      today: subSince(startToday).length,
      week: subSince(startWeek).length,
      total: subscriptions.length,
      ...countBy(subscriptions, 'status')
    },
    customers: profiles.length,
    inventory: {
      total: accounts.length,
      available: inventoryStatus.available || 0,
      full: inventoryStatus.full || 0,
      assigned: inventoryStatus.assigned || 0,
      dead: inventoryStatus.dead || 0,
      netflix_available: netflixAvailable,
      stock_available: stockAvailable
    },
    catalog: {
      categories: catalogCategories.length,
      products: catalogProducts.length,
      activeProducts: catalogProducts.filter((row) => row.status === 'active').length,
      draftProducts: catalogProducts.filter((row) => row.status === 'draft').length
    }
  }
}

function registerAdminRoutes(app, deps) {
  const {
    requireAdmin,
    connectMongo,
    collection,
    normalizeDocs: normalizeLegacyDocs,
    getAllSettings
  } = deps

  const uploadsRoot = path.join(__dirname, '..', 'uploads')
  const productUploadsDir = path.join(uploadsRoot, 'admin-products')
  app.use('/uploads', require('express').static(uploadsRoot))

  function col(name) {
    return collection(name)
  }

  async function ensureCategoryExists(categoryId) {
    const category = normalizeDoc(await col('product_categories').findOne(legacyIdFilter(categoryId)))
    if (!category) throw httpError(400, 'categoryId does not exist')
    return category
  }

  async function ensureProductExists(productId) {
    const product = normalizeDoc(await col('products').findOne(legacyIdFilter(productId)))
    if (!product) throw httpError(404, 'Product not found')
    return product
  }

  async function ensureSlugUnique(collectionName, slug, excludeId) {
    if (!slug) return
    const existing = normalizeDoc(await col(collectionName).findOne({ slug }))
    if (existing && existing.id !== excludeId) {
      throw httpError(409, 'slug already exists')
    }
  }

  async function ensureSkuUnique(sku, exclude = {}) {
    const value = optionalString(sku)
    if (!value) return
    const product = normalizeDoc(await col('products').findOne({ sku: value }))
    if (product && product.id !== exclude.productId) {
      throw httpError(409, 'sku already exists')
    }
    const variant = normalizeDoc(await col('product_variants').findOne({ sku: value }))
    if (variant && variant.id !== exclude.variantId) {
      throw httpError(409, 'sku already exists')
    }
  }

  async function categoryWithCount(category) {
    if (!category) return null
    const productCount = await col('products').countDocuments({ categoryId: category.id })
    return { ...category, productCount }
  }

  async function hydrateProducts(products, { includeRelations = false } = {}) {
    const categoryIds = [...new Set(products.map((row) => row.categoryId).filter(Boolean))]
    const productIds = products.map((row) => row.id)
    const [categories, mainImages] = await Promise.all([
      categoryIds.length
        ? normalizeDocs(await col('product_categories').find({ id: { $in: categoryIds } }).toArray())
        : [],
      productIds.length
        ? normalizeDocs(await col('product_images').find({ productId: { $in: productIds }, isMain: true }).toArray())
        : []
    ])
    const categoryMap = new Map(categories.map((row) => [row.id, row]))
    const mainImageMap = new Map(mainImages.map((row) => [row.productId, row]))
    if (!includeRelations) {
      return products.map((row) => ({
        ...row,
        category: categoryMap.get(row.categoryId) || null,
        mainImage: mainImageMap.get(row.id) || null
      }))
    }
    const [details, images, variants] = await Promise.all([
      normalizeDocs(await col('product_details').find({ productId: { $in: productIds } }).toArray()),
      normalizeDocs(await col('product_images').find({ productId: { $in: productIds } }).sort({ sortOrder: 1, createdAt: 1 }).toArray()),
      normalizeDocs(await col('product_variants').find({ productId: { $in: productIds } }).sort({ createdAt: -1 }).toArray())
    ])
    const detailMap = new Map(details.map((row) => [row.productId, row]))
    return products.map((row) => ({
      ...row,
      category: categoryMap.get(row.categoryId) || null,
      detail: detailMap.get(row.id) || null,
      images: images.filter((image) => image.productId === row.id),
      variants: variants
        .filter((variant) => variant.productId === row.id)
        .map((variant) => ({ ...variant, duration_days: resolveVariantDuration(row, variant) }))
    }))
  }

  function resolveImageUrl(body) {
    const directUrl = optionalString(body.imageUrl || body.image_url)
    if (directUrl) return directUrl

    const dataUrl = optionalString(body.imageDataUrl || body.image)
    if (!dataUrl) throw httpError(400, 'imageUrl or imageDataUrl is required')

    const match = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+/=]+)$/i)
    if (!match) throw httpError(400, 'imageDataUrl must be a base64 image data URL')

    const ext = match[1].toLowerCase().replace('jpeg', 'jpg')
    const buffer = Buffer.from(match[2], 'base64')
    if (!buffer.length) throw httpError(400, 'imageDataUrl is empty')
    if (buffer.length > 5 * 1024 * 1024) throw httpError(413, 'imageDataUrl must be 5MB or smaller')

    fs.mkdirSync(productUploadsDir, { recursive: true })
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`
    fs.writeFileSync(path.join(productUploadsDir, filename), buffer)
    return `/uploads/admin-products/${filename}`
  }

  async function listProductsForQuery(req, extraFilter = {}) {
    const { page, limit, skip } = paginationFromReq(req)
    const filter = { ...extraFilter }
    const search = cleanString(req.query.search)
    if (req.query.categoryId) filter.categoryId = cleanString(req.query.categoryId)
    if (req.query.status) filter.status = cleanString(req.query.status)
    if (search) {
      const re = new RegExp(escapeRegExp(search), 'i')
      filter.$or = [{ name: re }, { slug: re }, { sku: re }]
    }
    const [total, products] = await Promise.all([
      col('products').countDocuments(filter),
      col('products').find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).toArray()
    ])
    return {
      products: await hydrateProducts(normalizeDocs(products)),
      pagination: paginationPayload(page, limit, total)
    }
  }

  app.get('/api/admin/bootstrap', requireAdmin, async (_req, res) => {
    try {
      await connectMongo()
      const [
        subscriptions,
        payments,
        profiles,
        accounts,
        plans,
        viewerReports,
        settings,
        catalogCategories,
        catalogProducts
      ] = await Promise.all([
        collection('subscriptions').find({}).sort({ created_at: -1 }).limit(1000).toArray(),
        collection('payments').find({}).sort({ created_at: -1 }).limit(1000).toArray(),
        collection('profiles').find({}).sort({ created_at: -1 }).limit(1000).toArray(),
        collection('resources').find({}).sort({ created_at: -1 }).limit(1000).toArray(),
        collection('plans').find({}).sort({ duration_days: 1, price: 1 }).limit(1000).toArray(),
        collection('viewer_reports').find({ status: { $in: ['open', 'resolved', 'rejected'] } }).sort({ created_at: -1 }).limit(300).toArray(),
        getAllSettings(),
        collection('product_categories').find({}).sort({ sortOrder: 1, name: 1 }).limit(1000).toArray(),
        collection('products').find({}).sort({ updatedAt: -1 }).limit(1000).toArray()
      ])

      const normalized = {
        subscriptions: normalizeLegacyDocs(subscriptions),
        payments: normalizeLegacyDocs(payments),
        profiles: normalizeLegacyDocs(profiles),
        accounts: normalizeLegacyDocs(accounts),
        plans: normalizeLegacyDocs(plans),
        viewerReports: normalizeLegacyDocs(viewerReports),
        settings: settings || {},
        catalogCategories: normalizeDocs(catalogCategories),
        catalogProducts: normalizeDocs(catalogProducts)
      }

      res.json({
        ...normalized,
        stats: buildStats(normalized),
        loaded_at: new Date().toISOString()
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/admin/catalog/categories', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const { page, limit, skip } = paginationFromReq(req)
      const filter = {}
      const search = cleanString(req.query.search)
      if (req.query.status) filter.status = cleanString(req.query.status)
      if (search) {
        const re = new RegExp(escapeRegExp(search), 'i')
        filter.$or = [{ name: re }, { slug: re }, { description: re }]
      }
      const [total, rows] = await Promise.all([
        col('product_categories').countDocuments(filter),
        col('product_categories').find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit).toArray()
      ])
      const categories = await Promise.all(normalizeDocs(rows).map(categoryWithCount))
      sendOk(res, { categories, pagination: paginationPayload(page, limit, total) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/admin/catalog/categories/:id', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const category = await categoryWithCount(normalizeDoc(await col('product_categories').findOne(legacyIdFilter(req.params.id))))
      if (!category) throw httpError(404, 'Category not found')
      const productData = await listProductsForQuery(req, { categoryId: category.id })
      sendOk(res, { category, ...productData })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/admin/catalog/categories', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const name = cleanString(req.body?.name)
      if (!name) throw httpError(400, 'name is required')
      const slug = slugify(req.body?.slug || name)
      if (!slug) throw httpError(400, 'slug is invalid')
      await ensureSlugUnique('product_categories', slug)
      const status = readStatus(req.body?.status, CATEGORY_STATUSES, 'status', 'active')
      const sortOrder = readNumber(req.body?.sortOrder, 'sortOrder', { min: 0, integer: true, defaultValue: 0 })
      const now = new Date()
      const id = createId()
      const category = {
        _id: id,
        id,
        name,
        slug,
        type: readStatus(req.body?.type, CATEGORY_TYPES, 'type', 'product'),
        description: optionalString(req.body?.description),
        icon:  optionalString(req.body?.icon),
        color: optionalString(req.body?.color),
        status,
        sortOrder,
        createdAt: now,
        updatedAt: now
      }
      await col('product_categories').insertOne(category)
      sendOk(res, { category: { ...normalizeDoc(category), productCount: 0 } }, 201, 'Category created')
    } catch (err) {
      sendError(res, err)
    }
  })

  async function updateCategory(req, res) {
    try {
      await connectMongo()
      const current = normalizeDoc(await col('product_categories').findOne(legacyIdFilter(req.params.id)))
      if (!current) throw httpError(404, 'Category not found')
      const updates = {}
      if (req.body?.name != null) {
        updates.name = cleanString(req.body.name)
        if (!updates.name) throw httpError(400, 'name is required')
      }
      if (req.body?.slug != null || updates.name) {
        updates.slug = slugify(req.body?.slug || updates.name || current.name)
        if (!updates.slug) throw httpError(400, 'slug is invalid')
        await ensureSlugUnique('product_categories', updates.slug, current.id)
      }
      if (req.body?.description !== undefined) updates.description = optionalString(req.body.description)
      if (req.body?.type != null) updates.type = readStatus(req.body.type, CATEGORY_TYPES, 'type', current.type || 'product')
      if (req.body?.icon  !== undefined) updates.icon  = optionalString(req.body.icon)
      if (req.body?.color !== undefined) updates.color = optionalString(req.body.color)
      if (req.body?.status != null) updates.status = readStatus(req.body.status, CATEGORY_STATUSES, 'status', current.status)
      if (req.body?.sortOrder != null) {
        updates.sortOrder = readNumber(req.body.sortOrder, 'sortOrder', { min: 0, integer: true })
      }
      updates.updatedAt = new Date()
      const updated = normalizeDoc(await col('product_categories').findOneAndUpdate(
        legacyIdFilter(current.id),
        { $set: updates },
        { returnDocument: 'after' }
      ))
      sendOk(res, { category: await categoryWithCount(updated) }, 200, 'Category updated')
    } catch (err) {
      sendError(res, err)
    }
  }

  app.patch('/api/admin/catalog/categories/:id', requireAdmin, updateCategory)
  app.put('/api/admin/catalog/categories/:id', requireAdmin, updateCategory)

  app.delete('/api/admin/catalog/categories/:id', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const current = normalizeDoc(await col('product_categories').findOne(legacyIdFilter(req.params.id)))
      if (!current) throw httpError(404, 'Category not found')
      const products = normalizeDocs(await col('products').find({ categoryId: current.id }).toArray())
      const productIds = products.map((product) => product.id).filter(Boolean)
      const variants = productIds.length
        ? normalizeDocs(await col('product_variants').find({ productId: { $in: productIds } }).toArray())
        : []
      const variantIds = variants.map((variant) => variant.id).filter(Boolean)
      await Promise.all([
        productIds.length ? col('product_details').deleteMany({ productId: { $in: productIds } }) : Promise.resolve({ deletedCount: 0 }),
        productIds.length ? col('product_images').deleteMany({ productId: { $in: productIds } }) : Promise.resolve({ deletedCount: 0 }),
        productIds.length ? col('product_variants').deleteMany({ productId: { $in: productIds } }) : Promise.resolve({ deletedCount: 0 }),
        productIds.length ? col('products').deleteMany({ categoryId: current.id }) : Promise.resolve({ deletedCount: 0 }),
        productIds.length ? col('resources').deleteMany({
          resource_kind: 'product_stock',
          $or: [
            { variant_id: { $in: variantIds } },
            { plan_id: { $in: variantIds } },
            { product_id: { $in: productIds } }
          ]
        }) : Promise.resolve({ deletedCount: 0 })
      ])
      await col('product_categories').deleteOne(legacyIdFilter(current.id))
      sendOk(res, {
        deleted: true,
        deletedRelations: {
          products: productIds.length,
          variants: variantIds.length
        }
      }, 200, 'Category deleted')
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/admin/catalog/products', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      sendOk(res, await listProductsForQuery(req))
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/admin/catalog/products/:id', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.id)
      const [hydrated] = await hydrateProducts([product], { includeRelations: true })
      sendOk(res, { product: hydrated })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/admin/catalog/products', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const name = cleanString(req.body?.name)
      if (!name) throw httpError(400, 'name is required')
      const categoryId = cleanString(req.body?.categoryId)
      if (!categoryId) throw httpError(400, 'categoryId is required')
      const category = await ensureCategoryExists(categoryId)
      const price = readNumber(req.body?.price, 'price', { min: 0, defaultValue: 0 })
      const status = readStatus(req.body?.status, PRODUCT_STATUSES, 'status', 'active')
      const sku = optionalString(req.body?.sku)
      await ensureSkuUnique(sku)
      const slug = slugify(req.body?.slug || name)
      if (!slug) throw httpError(400, 'slug is invalid')
      await ensureSlugUnique('products', slug)
      const now = new Date()
      const id = createId()
      const product = {
        _id: id,
        id,
        categoryId,
        name,
        slug,
        sku,
        price,
        status,
        fulfillment_type: readProductFulfillment(
          req.body?.fulfillment_type,
          category.type === 'product' ? 'stock' : 'manual'
        ),
        createdAt: now,
        updatedAt: now
      }
      await col('products').insertOne(product)
      const [hydrated] = await hydrateProducts([normalizeDoc(product)])
      sendOk(res, { product: hydrated }, 201, 'Product created')
    } catch (err) {
      sendError(res, err)
    }
  })

  async function updateProduct(req, res) {
    try {
      await connectMongo()
      const current = await ensureProductExists(req.params.id)
      const updates = {}
      if (req.body?.name != null) {
        updates.name = cleanString(req.body.name)
        if (!updates.name) throw httpError(400, 'name is required')
      }
      if (req.body?.categoryId != null) {
        updates.categoryId = cleanString(req.body.categoryId)
        if (!updates.categoryId) throw httpError(400, 'categoryId is required')
        await ensureCategoryExists(updates.categoryId)
      }
      if (req.body?.slug != null || updates.name) {
        updates.slug = slugify(req.body?.slug || updates.name || current.name)
        if (!updates.slug) throw httpError(400, 'slug is invalid')
        await ensureSlugUnique('products', updates.slug, current.id)
      }
      if (req.body?.sku !== undefined) {
        updates.sku = optionalString(req.body.sku)
        await ensureSkuUnique(updates.sku, { productId: current.id })
      }
      if (req.body?.price != null) updates.price = readNumber(req.body.price, 'price', { min: 0 })
      if (req.body?.status != null) updates.status = readStatus(req.body.status, PRODUCT_STATUSES, 'status', current.status)
      if (req.body?.fulfillment_type !== undefined) {
        const categoryId = updates.categoryId || current.categoryId
        const category = categoryId ? normalizeDoc(await col('product_categories').findOne(legacyIdFilter(categoryId))) : null
        updates.fulfillment_type = readProductFulfillment(
          req.body.fulfillment_type,
          category?.type === 'product' ? 'stock' : 'manual'
        )
      }
      updates.updatedAt = new Date()
      const updated = normalizeDoc(await col('products').findOneAndUpdate(
        legacyIdFilter(current.id),
        { $set: updates },
        { returnDocument: 'after' }
      ))
      const [hydrated] = await hydrateProducts([updated])
      sendOk(res, { product: hydrated }, 200, 'Product updated')
    } catch (err) {
      sendError(res, err)
    }
  }

  app.patch('/api/admin/catalog/products/:id', requireAdmin, updateProduct)
  app.put('/api/admin/catalog/products/:id', requireAdmin, updateProduct)

  app.delete('/api/admin/catalog/products/:id', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.id)
      const [detailResult, imageResult, variantResult] = await Promise.all([
        col('product_details').deleteMany({ productId: product.id }),
        col('product_images').deleteMany({ productId: product.id }),
        col('product_variants').deleteMany({ productId: product.id })
      ])
      await col('products').deleteOne(legacyIdFilter(product.id))
      sendOk(res, {
        deleted: true,
        deletedRelations: {
          detail: detailResult.deletedCount || 0,
          images: imageResult.deletedCount || 0,
          variants: variantResult.deletedCount || 0
        }
      }, 200, 'Product deleted')
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/admin/catalog/products/:productId/detail', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      await ensureProductExists(req.params.productId)
      const detail = normalizeDoc(await col('product_details').findOne({ productId: req.params.productId }))
      sendOk(res, { detail })
    } catch (err) {
      sendError(res, err)
    }
  })

  async function upsertProductDetail(req, res) {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.productId)
      const current = normalizeDoc(await col('product_details').findOne({ productId: product.id }))
      const now = new Date()
      const replacement = req.method === 'PUT' || req.method === 'POST'
      const updates = {
        ...(replacement ? {
          shortDescription: '',
          longDescription: '',
          specifications: {},
          extraInfo: {}
        } : {}),
        updatedAt: now
      }
      if (req.body?.shortDescription !== undefined) updates.shortDescription = cleanString(req.body.shortDescription)
      if (req.body?.longDescription !== undefined) updates.longDescription = cleanString(req.body.longDescription)
      if (req.body?.specifications !== undefined) updates.specifications = readPlainObject(req.body.specifications, 'specifications')
      if (req.body?.extraInfo !== undefined) updates.extraInfo = readPlainObject(req.body.extraInfo, 'extraInfo')
      if (current) {
        await col('product_details').updateOne({ id: current.id, productId: product.id }, { $set: updates })
      } else {
        const id = createId()
        await col('product_details').insertOne({
          _id: id,
          id,
          productId: product.id,
          shortDescription: '',
          longDescription: '',
          specifications: {},
          extraInfo: {},
          createdAt: now,
          ...updates
        })
      }
      const detail = normalizeDoc(await col('product_details').findOne({ productId: product.id }))
      sendOk(res, { detail }, current ? 200 : 201, current ? 'Product detail updated' : 'Product detail created')
    } catch (err) {
      sendError(res, err)
    }
  }

  app.post('/api/admin/catalog/products/:productId/detail', requireAdmin, upsertProductDetail)
  app.patch('/api/admin/catalog/products/:productId/detail', requireAdmin, upsertProductDetail)
  app.put('/api/admin/catalog/products/:productId/detail', requireAdmin, upsertProductDetail)

  app.get('/api/admin/catalog/products/:productId/images', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      await ensureProductExists(req.params.productId)
      const images = normalizeDocs(await col('product_images').find({ productId: req.params.productId }).sort({ sortOrder: 1, createdAt: 1 }).toArray())
      sendOk(res, { images })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/admin/catalog/products/:productId/images', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.productId)
      const imageUrl = resolveImageUrl(req.body || {})
      const sortOrder = readNumber(req.body?.sortOrder, 'sortOrder', { min: 0, integer: true, defaultValue: 0 })
      const hasExistingMain = await col('product_images').countDocuments({ productId: product.id, isMain: true })
      const isMain = Boolean(req.body?.isMain) || hasExistingMain === 0
      if (isMain) await col('product_images').updateMany({ productId: product.id }, { $set: { isMain: false, updatedAt: new Date() } })
      const now = new Date()
      const id = createId()
      const image = {
        _id: id,
        id,
        productId: product.id,
        imageUrl,
        altText: optionalString(req.body?.altText),
        isMain,
        sortOrder,
        createdAt: now,
        updatedAt: now
      }
      await col('product_images').insertOne(image)
      sendOk(res, { image: normalizeDoc(image) }, 201, 'Product image created')
    } catch (err) {
      sendError(res, err)
    }
  })

  app.patch('/api/admin/catalog/products/:productId/images/:imageId', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.productId)
      const current = normalizeDoc(await col('product_images').findOne({ id: req.params.imageId, productId: product.id }))
      if (!current) throw httpError(404, 'Product image not found')
      const updates = { updatedAt: new Date() }
      if (req.body?.imageUrl != null || req.body?.image_url != null || req.body?.imageDataUrl != null || req.body?.image != null) {
        updates.imageUrl = resolveImageUrl(req.body)
      }
      if (req.body?.altText !== undefined) updates.altText = optionalString(req.body.altText)
      if (req.body?.sortOrder != null) updates.sortOrder = readNumber(req.body.sortOrder, 'sortOrder', { min: 0, integer: true })
      if (req.body?.isMain != null) {
        updates.isMain = Boolean(req.body.isMain)
        if (updates.isMain) {
          await col('product_images').updateMany(
            { productId: product.id, id: { $ne: current.id } },
            { $set: { isMain: false, updatedAt: new Date() } }
          )
        }
      }
      const image = normalizeDoc(await col('product_images').findOneAndUpdate(
        { id: current.id, productId: product.id },
        { $set: updates },
        { returnDocument: 'after' }
      ))
      sendOk(res, { image }, 200, 'Product image updated')
    } catch (err) {
      sendError(res, err)
    }
  })

  app.delete('/api/admin/catalog/products/:productId/images/:imageId', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.productId)
      const current = normalizeDoc(await col('product_images').findOne({ id: req.params.imageId, productId: product.id }))
      if (!current) throw httpError(404, 'Product image not found')
      await col('product_images').deleteOne({ id: current.id, productId: product.id })
      if (current.isMain) {
        const nextImage = normalizeDoc(await col('product_images').findOne({ productId: product.id }, { sort: { sortOrder: 1, createdAt: 1 } }))
        if (nextImage) {
          await col('product_images').updateOne({ id: nextImage.id }, { $set: { isMain: true, updatedAt: new Date() } })
        }
      }
      sendOk(res, { deleted: true }, 200, 'Product image deleted')
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/admin/catalog/products/:productId/variants', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.productId)
      const variants = normalizeDocs(await col('product_variants').find({ productId: product.id }).sort({ createdAt: -1 }).toArray())
        .map((variant) => ({ ...variant, duration_days: resolveVariantDuration(product, variant) }))
      sendOk(res, { variants })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/admin/catalog/products/:productId/variants', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.productId)
      const name = cleanString(req.body?.name)
      if (!name) throw httpError(400, 'name is required')
      const sku = optionalString(req.body?.sku)
      await ensureSkuUnique(sku)
      const price = readNumber(req.body?.price, 'price', { min: 0, defaultValue: 0 })
      const cost_price = readNumber(req.body?.cost_price ?? req.body?.import_price, 'cost_price', { min: 0, defaultValue: 0 })
      const duration_days = req.body?.duration_days == null || req.body?.duration_days === ''
        ? resolveVariantDuration(product, { name })
        : readNumber(req.body.duration_days, 'duration_days', { min: 1, integer: true })
      const stock = readNumber(req.body?.stock, 'stock', { min: 0, integer: true, defaultValue: 0 })
      const status = readStatus(req.body?.status, VARIANT_STATUSES, 'status', 'active')
      const now = new Date()
      const id = createId()
      const variant = {
        _id: id,
        id,
        productId: product.id,
        name,
        sku,
        price,
        cost_price,
        duration_days,
        stock,
        color: optionalString(req.body?.color),
        size: optionalString(req.body?.size),
        status,
        createdAt: now,
        updatedAt: now
      }
      await col('product_variants').insertOne(variant)
      sendOk(res, { variant: normalizeDoc(variant) }, 201, 'Product variant created')
    } catch (err) {
      sendError(res, err)
    }
  })

  app.patch('/api/admin/catalog/products/:productId/variants/:variantId', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.productId)
      const current = normalizeDoc(await col('product_variants').findOne({ id: req.params.variantId, productId: product.id }))
      if (!current) throw httpError(404, 'Product variant not found')
      const updates = { updatedAt: new Date() }
      if (req.body?.name != null) {
        updates.name = cleanString(req.body.name)
        if (!updates.name) throw httpError(400, 'name is required')
      }
      if (req.body?.sku !== undefined) {
        updates.sku = optionalString(req.body.sku)
        await ensureSkuUnique(updates.sku, { variantId: current.id })
      }
      if (req.body?.price != null) updates.price = readNumber(req.body.price, 'price', { min: 0 })
      if (req.body?.cost_price != null || req.body?.import_price != null) {
        updates.cost_price = readNumber(req.body.cost_price ?? req.body.import_price, 'cost_price', { min: 0 })
      }
      if (req.body?.duration_days != null) updates.duration_days = readNumber(req.body.duration_days, 'duration_days', { min: 1, integer: true })
      if (req.body?.stock != null) updates.stock = readNumber(req.body.stock, 'stock', { min: 0, integer: true })
      if (req.body?.color !== undefined) updates.color = optionalString(req.body.color)
      if (req.body?.size !== undefined) updates.size = optionalString(req.body.size)
      if (req.body?.status != null) updates.status = readStatus(req.body.status, VARIANT_STATUSES, 'status', current.status)
      const variant = normalizeDoc(await col('product_variants').findOneAndUpdate(
        { id: current.id, productId: product.id },
        { $set: updates },
        { returnDocument: 'after' }
      ))
      sendOk(res, { variant }, 200, 'Product variant updated')
    } catch (err) {
      sendError(res, err)
    }
  })

  app.delete('/api/admin/catalog/products/:productId/variants/:variantId', requireAdmin, async (req, res) => {
    try {
      await connectMongo()
      const product = await ensureProductExists(req.params.productId)
      const current = normalizeDoc(await col('product_variants').findOne({ id: req.params.variantId, productId: product.id }))
      if (!current) throw httpError(404, 'Product variant not found')
      await Promise.all([
        col('product_variants').deleteOne({ id: current.id, productId: product.id }),
        col('resources').deleteMany({
          resource_kind: 'product_stock',
          $or: [
            { variant_id: current.id },
            { plan_id: current.id }
          ]
        })
      ])
      sendOk(res, { deleted: true }, 200, 'Product variant deleted')
    } catch (err) {
      sendError(res, err)
    }
  })
}

module.exports = {
  buildStats,
  registerAdminRoutes
}
