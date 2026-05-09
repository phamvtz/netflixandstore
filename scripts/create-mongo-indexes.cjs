/**
 * scripts/create-mongo-indexes.cjs
 * Tạo tất cả MongoDB indexes cần thiết cho Netflix Store.
 * Chạy một lần khi setup hoặc sau khi thay đổi schema:
 *   node scripts/create-mongo-indexes.cjs
 */

'use strict'

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { MongoClient, ServerApiVersion } = require('mongodb')

async function createIndexes() {
  const uri = String(process.env.MONGODB_URI || '').trim()
  if (!uri) {
    console.error('[Indexes] ❌ MONGODB_URI chưa được cấu hình trong .env')
    process.exit(1)
  }

  const dbName = process.env.MONGODB_DB || 'netcredit'
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  })

  try {
    await client.connect()
    const db = client.db(dbName)
    console.log(`[Indexes] ✅ Kết nối MongoDB "${dbName}" thành công\n`)

    // ── payments ────────────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: payments')
    await db.collection('payments').createIndexes([
      // Tra cứu theo nội dung chuyển khoản (quan trọng nhất — dùng trong poll MBBank)
      { key: { transfer_content: 1 }, name: 'transfer_content_1' },
      // Lọc pending payments để khớp giao dịch
      { key: { status: 1, created_at: -1 }, name: 'status_created_at' },
      // Tra cứu đơn theo subscription
      { key: { subscription_id: 1 }, name: 'subscription_id_1' },
      // Thống kê revenue theo thời gian
      { key: { status: 1, amount: 1 }, name: 'status_amount' },
      // Seller store tracking
      { key: { seller_store_id: 1, status: 1 }, name: 'seller_store_status' },
      // Compound: tìm pending payment phù hợp (activatePayment)
      { key: { status: 1, amount: 1, transfer_content: 1 }, name: 'status_amount_content' }
    ])
    console.log('  ✅ payments: 6 indexes')

    // ── subscriptions ────────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: subscriptions')
    await db.collection('subscriptions').createIndexes([
      // Dashboard user
      { key: { user_id: 1, status: 1 }, name: 'user_id_status' },
      // Expiry job: tìm active sắp hết hạn
      { key: { status: 1, end_at: 1 }, name: 'status_end_at' },
      // Auto-cancel: pending quá 30 phút
      { key: { status: 1, created_at: 1 }, name: 'status_created_at' },
      // Expiry reminder: chưa gửi nhắc
      { key: { status: 1, end_at: 1, reminder_sent: 1 }, name: 'status_end_at_reminder' },
      // Tra cứu login_link (để check duplicate)
      { key: { user_id: 1, status: 1, login_link: 1 }, name: 'user_status_link' },
      // Lookup by id (field ứng dụng, không phải _id)
      { key: { id: 1 }, name: 'id_1', unique: false }
    ])
    console.log('  ✅ subscriptions: 6 indexes')

    // ── profiles ─────────────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: profiles')
    await db.collection('profiles').createIndexes([
      { key: { id: 1 }, name: 'id_1' },
      { key: { email: 1 }, name: 'email_1' },
      { key: { role: 1 }, name: 'role_1' }
    ])
    console.log('  ✅ profiles: 3 indexes')

    // ── resources (kho tài khoản) ────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: resources')
    await db.collection('resources').createIndexes([
      // Tìm tài khoản còn trống để gán (assignVerifiedAccount)
      { key: { status: 1, assigned_count: -1, created_at: 1 }, name: 'status_slots_created' },
      // Tìm theo value (login link / cookie)
      { key: { value: 1 }, name: 'value_1' },
      // Stock products
      { key: { account_type: 1, service: 1, status: 1 }, name: 'account_type_service_status' }
    ])
    console.log('  ✅ resources: 3 indexes')

    // ── viewer_reports ───────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: viewer_reports')
    await db.collection('viewer_reports').createIndexes([
      { key: { status: 1, created_at: -1 }, name: 'status_created_at' },
      { key: { user_id: 1, status: 1 }, name: 'user_id_status' },
      { key: { subscription_id: 1 }, name: 'subscription_id_1' }
    ])
    console.log('  ✅ viewer_reports: 3 indexes')

    // ── plans ────────────────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: plans')
    await db.collection('plans').createIndexes([
      { key: { id: 1 }, name: 'id_1' },
      { key: { is_visible: 1, price: 1 }, name: 'visible_price' }
    ])
    console.log('  ✅ plans: 2 indexes')

    console.log('[Indexes] Tạo indexes cho collection: product_categories')
    await db.collection('product_categories').createIndexes([
      { key: { id: 1 }, name: 'id_1' },
      { key: { slug: 1 }, name: 'slug_1', unique: true, sparse: true },
      { key: { status: 1, sortOrder: 1, name: 1 }, name: 'status_sort_name' }
    ])
    console.log('  ✅ product_categories: 3 indexes')

    console.log('[Indexes] Tạo indexes cho collection: products')
    await db.collection('products').createIndexes([
      { key: { id: 1 }, name: 'id_1' },
      { key: { slug: 1 }, name: 'slug_1', unique: true, sparse: true },
      { key: { sku: 1 }, name: 'sku_unique_string', unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
      { key: { categoryId: 1, status: 1 }, name: 'category_status' },
      { key: { updatedAt: -1 }, name: 'updated_at_desc' }
    ])
    console.log('  ✅ products: 5 indexes')

    console.log('[Indexes] Tạo indexes cho collection: product_details')
    await db.collection('product_details').createIndexes([
      { key: { id: 1 }, name: 'id_1' },
      { key: { productId: 1 }, name: 'product_id_1', unique: true }
    ])
    console.log('  ✅ product_details: 2 indexes')

    console.log('[Indexes] Tạo indexes cho collection: product_images')
    await db.collection('product_images').createIndexes([
      { key: { id: 1 }, name: 'id_1' },
      { key: { productId: 1, sortOrder: 1 }, name: 'product_sort' },
      { key: { productId: 1, isMain: 1 }, name: 'product_main' }
    ])
    console.log('  ✅ product_images: 3 indexes')

    console.log('[Indexes] Tạo indexes cho collection: product_variants')
    await db.collection('product_variants').createIndexes([
      { key: { id: 1 }, name: 'id_1' },
      { key: { productId: 1 }, name: 'product_id_1' },
      { key: { sku: 1 }, name: 'sku_unique_string', unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
      { key: { productId: 1, status: 1 }, name: 'product_status' }
    ])
    console.log('  ✅ product_variants: 4 indexes')

    // ── settings ─────────────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: settings')
    await db.collection('settings').createIndexes([
      { key: { key: 1 }, name: 'key_1', unique: true, sparse: true }
    ])
    console.log('  ✅ settings: 1 index')

    // ── seller_stores ────────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: seller_stores')
    await db.collection('seller_stores').createIndexes([
      { key: { owner_id: 1 }, name: 'owner_id_1', unique: true, sparse: true },
      { key: { slug: 1 }, name: 'slug_1', unique: true, sparse: true },
      { key: { custom_domain: 1 }, name: 'custom_domain_1', unique: true, sparse: true },
      { key: { is_active: 1 }, name: 'is_active_1' }
    ])
    console.log('  ✅ seller_stores: 4 indexes')

    // ── wallets ──────────────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: wallets')
    await db.collection('wallets').createIndexes([
      { key: { user_id: 1 }, name: 'user_id_1', unique: true, sparse: true }
    ])
    console.log('  ✅ wallets: 1 index')

    // ── wallet_transactions ──────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: wallet_transactions')
    await db.collection('wallet_transactions').createIndexes([
      { key: { user_id: 1 }, name: 'user_id_1' },
      { key: { user_id: 1, created_at: -1 }, name: 'user_id_created_at_1' },
      { key: { type: 1 }, name: 'type_1' }
    ])
    console.log('  ✅ wallet_transactions: 3 indexes')

    // ── wallet_topups ────────────────────────────────────────────────
    console.log('[Indexes] Tạo indexes cho collection: wallet_topups')
    await db.collection('wallet_topups').createIndexes([
      { key: { user_id: 1 }, name: 'user_id_1' },
      { key: { transfer_content: 1 }, name: 'transfer_content_1', unique: true, sparse: true },
      { key: { status: 1, amount: 1 }, name: 'status_amount_1' },
      { key: { created_at: -1 }, name: 'created_at_1' }
    ])
    console.log('  ✅ wallet_topups: 4 indexes')

    console.log('\n[Indexes] 🎉 Tất cả indexes đã được tạo thành công!')
  } catch (err) {
    console.error('[Indexes] ❌ Lỗi:', err.message)
    process.exit(1)
  } finally {
    await client.close()
  }
}

createIndexes()
