-- ============================================================
-- NETFLIX STORE — Supabase: hàm RPC + index bổ trợ
-- ============================================================
--
-- THỨ TỰ CHO KHÁCH TRIỂN KHAI (bắt buộc đọc):
--   1) Chạy schema nền trước — một trong hai:
--        • supabase/schema.sql  (repo mặc định)
--        • supabase/buyer_schema_empty.sql  (bản “full” gói bán)
--   2) Nếu dùng gian hàng đại lý: supabase/fix_seller_tracking.sql (và các fix_seller*.sql cần thiết)
--   3) Cuối cùng chạy FILE NÀY trong Supabase → SQL Editor (một lần, hoặc khi nâng cấp hàm)
--
-- File này KHÔNG tạo lại bảng profiles/plans/payments/… — tránh trùng và lệch RLS với schema.sql.
-- Chỉ: cột phụ (nếu thiếu), 3 hàm RPC, index, GRANT cho claim_warranty (gọi từ app khách).
--
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. Cột mà các hàm bên dưới cần (DB cũ / clone thường thiếu)
-- ────────────────────────────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE subscriptions
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS assigned_count INT DEFAULT 0;
ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS max_slots INT DEFAULT 5;
ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS note TEXT;

UPDATE resources SET max_slots = 5 WHERE max_slots IS NULL;
UPDATE resources SET assigned_count = 0 WHERE assigned_count IS NULL;


-- ────────────────────────────────────────────────────────────
-- 1. auto_process_payment
--    Gọi từ server.cjs (Node + DATABASE_URL) khi đã khớp CK (poll MBBank / webhook).
--    Input : transfer_content, amount_paid (NUMERIC)
--    Output: JSON { success, subscription_id, plan, duration_days, start_at, end_at } hoặc { success:false, reason }
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_process_payment(
  p_transfer_content TEXT,
  p_amount_paid      NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay_id    UUID;
  v_sub_id    UUID;
  v_plan_id   TEXT;
  v_plan_days INTEGER;
  v_start_at  TIMESTAMPTZ;
  v_end_at    TIMESTAMPTZ;
BEGIN
  SELECT p.id, p.subscription_id, p.plan
  INTO   v_pay_id, v_sub_id, v_plan_id
  FROM   payments p
  WHERE  UPPER(p.transfer_content) = UPPER(p_transfer_content)
    AND  p.status = 'pending'
    AND  p.amount <= p_amount_paid
  ORDER  BY p.created_at DESC
  LIMIT  1
  FOR UPDATE SKIP LOCKED;

  IF v_pay_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'reason',  'Không tìm thấy payment pending khớp nội dung và số tiền. transfer_content=' || p_transfer_content
    );
  END IF;

  SELECT duration_days INTO v_plan_days
  FROM   plans WHERE id = v_plan_id LIMIT 1;

  IF v_plan_days IS NULL THEN
    v_plan_days := 30;
  END IF;

  v_start_at := NOW();
  v_end_at   := NOW() + (v_plan_days || ' days')::INTERVAL;

  UPDATE payments SET status = 'success' WHERE id = v_pay_id;

  UPDATE subscriptions
  SET    status     = 'active',
         start_at   = v_start_at,
         end_at     = v_end_at,
         updated_at = NOW()
  WHERE  id = v_sub_id;

  RETURN json_build_object(
    'success',          true,
    'subscription_id',  v_sub_id,
    'plan',             v_plan_id,
    'duration_days',    v_plan_days,
    'start_at',         v_start_at,
    'end_at',           v_end_at
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', SQLERRM);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 2. expire_subscriptions
--    Gọi từ server.cjs (job định kỳ) hoặc pg_cron (tuỳ plan Supabase).
--    Returns: số dòng subscription chuyển sang expired
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE subscriptions
  SET    status     = 'expired',
         updated_at = NOW()
  WHERE  status = 'active'
    AND  end_at IS NOT NULL
    AND  end_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 3. claim_warranty
--    Gọi từ app (supabase.rpc) và server.cjs — đổi acc pool khi bảo hành.
--    Dùng max_slots + tránh cấp trùng login_link cho cùng user (nhiều sub active).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_warranty(p_sub_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub         RECORD;
  v_resource    RECORD;
  v_new_count   INTEGER;
  v_new_status  TEXT;
  v_max_slots   INTEGER;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE id = p_sub_id LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Subscription không tồn tại');
  END IF;

  IF v_sub.status <> 'active' THEN
    RETURN json_build_object('success', false, 'message', 'Subscription không ở trạng thái active');
  END IF;

  SELECT * INTO v_resource
  FROM   resources
  WHERE  status = 'available'
    AND  COALESCE(assigned_count, 0) < COALESCE(max_slots, 5)
    AND  value NOT IN (
      SELECT login_link FROM subscriptions
      WHERE  user_id = v_sub.user_id
        AND  login_link IS NOT NULL
        AND  status = 'active'
        AND  id <> p_sub_id
    )
  ORDER  BY assigned_count DESC NULLS LAST, created_at ASC
  LIMIT  1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Không còn tài khoản dự phòng, vui lòng liên hệ admin');
  END IF;

  v_max_slots  := COALESCE(v_resource.max_slots, 5);
  v_new_count  := COALESCE(v_resource.assigned_count, 0) + 1;
  v_new_status := CASE WHEN v_new_count >= v_max_slots THEN 'full' ELSE 'available' END;

  UPDATE resources
  SET    assigned_count = v_new_count,
         status         = v_new_status,
         assigned_to    = p_sub_id
  WHERE  id = v_resource.id;

  UPDATE subscriptions
  SET    login_link  = v_resource.value,
         updated_at  = NOW()
  WHERE  id = p_sub_id;

  RETURN json_build_object(
    'success',     true,
    'message',     'Đã đổi tài khoản mới thành công',
    'new_account', v_resource.value
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


-- Quyền gọi RPC từ client (JWT khách) — Dashboard “Bảo hành”
GRANT EXECUTE ON FUNCTION public.claim_warranty(UUID) TO authenticated;

-- Server dùng connection pool (role postgres / service) thường đã gọi được auto_process_payment;
-- Nếu bạn gọi RPC qua PostgREST bằng service_role, không cần grant thêm.


-- ────────────────────────────────────────────────────────────
-- 4. (Tuỳ chọn) pg_cron — Supabase Pro+
-- ────────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--   'expire-subscriptions',
--   '0 * * * *',
--   $$ SELECT public.expire_subscriptions(); $$
-- );


-- ────────────────────────────────────────────────────────────
-- 5. Seed settings (chỉ INSERT — RLS “ai đọc/ghi settings” nằm trong schema.sql)
--    Bỏ qua nếu đã có key. Khách chỉnh STK/MoMo trong Admin sau khi cài.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.settings (key, value) VALUES
  ('site_name',        'Netflix Store'),
  ('site_title',       'Netflix Store — Mua tài khoản Netflix giá rẻ'),
  ('meta_description', 'Mua tài khoản Netflix Premium, bảo hành tự động.'),
  ('meta_keywords',    'netflix, mua netflix'),
  ('bank_name',        'MB Bank'),
  ('bank_account',     ''),
  ('bank_owner',       ''),
  ('momo_number',      ''),
  ('momo_name',        ''),
  ('contact_telegram', ''),
  ('contact_zalo',     ''),
  ('hero_title',       'Netflix Premium'),
  ('hero_subtitle',    'Xem phim không giới hạn'),
  ('social_facebook',  ''),
  ('social_youtube',   ''),
  ('social_tiktok',    ''),
  ('footer_text',      '')
ON CONFLICT (key) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 6. Index (khớp query server + pending payment)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_transfer_content
  ON public.payments (UPPER(transfer_content));

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON public.payments (status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_end
  ON public.subscriptions (status, end_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_resources_status
  ON public.resources (status, assigned_count) WHERE status = 'available';


-- PostgREST / API schema cache
NOTIFY pgrst, 'reload schema';
