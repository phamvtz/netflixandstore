-- ============================================================
-- NETFLIX STORE — Supabase SQL Functions
-- Chạy file này trong: Supabase Dashboard → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. auto_process_payment
--    Gọi từ server.cjs khi SePay xác nhận giao dịch
--    Input : transfer_content TEXT, amount_paid INTEGER
--    Output: JSON { success, subscription_id, reason? }
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_process_payment(
  p_transfer_content TEXT,
  p_amount_paid      NUMERIC   -- dùng NUMERIC để nhận cả integer lẫn decimal từ server
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pay_id    UUID;
  v_sub_id    UUID;
  v_plan_id   TEXT;
  v_plan_days INTEGER;
  v_start_at  TIMESTAMPTZ;
  v_end_at    TIMESTAMPTZ;
BEGIN
  -- 1. Khóa payment row phù hợp (tránh race condition)
  SELECT p.id, p.subscription_id, p.plan
  INTO   v_pay_id, v_sub_id, v_plan_id
  FROM   payments p
  WHERE  UPPER(p.transfer_content) = UPPER(p_transfer_content)
    AND  p.status   = 'pending'
    AND  p.amount  <= p_amount_paid
  ORDER  BY p.created_at DESC
  LIMIT  1
  FOR UPDATE SKIP LOCKED;

  IF v_pay_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'reason',  'Không tìm thấy payment pending khớp nội dung và số tiền. transfer_content=' || p_transfer_content
    );
  END IF;

  -- 2. Lấy số ngày của plan
  SELECT duration_days INTO v_plan_days
  FROM   plans WHERE id = v_plan_id LIMIT 1;

  IF v_plan_days IS NULL THEN
    v_plan_days := 30; -- fallback mặc định 30 ngày nếu plan không tồn tại
  END IF;

  -- 3. Tính thời hạn
  v_start_at := NOW();
  v_end_at   := NOW() + (v_plan_days || ' days')::INTERVAL;

  -- 4. Cập nhật payment → success (KHÔNG dùng updated_at phòng cột không tồn tại)
  UPDATE payments SET status = 'success' WHERE id = v_pay_id;

  -- 5. Kích hoạt subscription
  UPDATE subscriptions
  SET    status   = 'active',
         start_at = v_start_at,
         end_at   = v_end_at
  WHERE  id = v_sub_id;

  RETURN json_build_object(
    'success',         true,
    'subscription_id', v_sub_id,
    'plan',            v_plan_id,
    'duration_days',   v_plan_days,
    'start_at',        v_start_at,
    'end_at',          v_end_at
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', SQLERRM);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 2. expire_subscriptions
--    Có thể gọi từ Supabase pg_cron HOẶC từ server.cjs
--    Tự động đổi status → 'expired' khi end_at đã qua
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE subscriptions
  SET    status     = 'expired',
         updated_at = NOW()
  WHERE  status  = 'active'
    AND  end_at  IS NOT NULL
    AND  end_at  < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 3. claim_warranty
--    Khi cookie die → đổi tài khoản mới từ resources pool
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_warranty(p_sub_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub      RECORD;
  v_resource RECORD;
  v_new_count INTEGER;
  v_new_status TEXT;
BEGIN
  -- Lấy subscription hiện tại
  SELECT * INTO v_sub FROM subscriptions WHERE id = p_sub_id LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Subscription không tồn tại');
  END IF;

  IF v_sub.status != 'active' THEN
    RETURN json_build_object('success', false, 'message', 'Subscription không ở trạng thái active');
  END IF;

  -- Tìm account available trong pool
  SELECT * INTO v_resource
  FROM   resources
  WHERE  status = 'available'
    AND  (assigned_count IS NULL OR assigned_count < 5)
  ORDER  BY assigned_count DESC NULLS LAST, created_at ASC
  LIMIT  1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Không còn tài khoản dự phòng, vui lòng liên hệ admin');
  END IF;

  -- Cập nhật resource
  v_new_count  := COALESCE(v_resource.assigned_count, 0) + 1;
  v_new_status := CASE WHEN v_new_count >= 5 THEN 'full' ELSE 'available' END;

  UPDATE resources
  SET    assigned_count = v_new_count,
         status         = v_new_status,
         assigned_to    = p_sub_id
  WHERE  id = v_resource.id;

  -- Cập nhật subscription với account mới
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


-- ────────────────────────────────────────────────────────────
-- 4. (TÙY CHỌN) Dùng pg_cron để tự động expire mỗi giờ
--    Chỉ bật nếu Supabase plan của bạn hỗ trợ pg_cron
--    Pro plan trở lên mới có
-- ────────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--   'expire-subscriptions',
--   '0 * * * *',               -- mỗi đầu giờ
--   $$ SELECT expire_subscriptions(); $$
-- );


-- ────────────────────────────────────────────────────────────
-- 5. Bảng settings — cài đặt website (SEO, ngân hàng, liên hệ)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cho phép admin đọc/ghi, user chỉ đọc
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_read_all"  ON settings;
DROP POLICY IF EXISTS "settings_write_admin" ON settings;
CREATE POLICY "settings_read_all"    ON settings FOR SELECT USING (true);
CREATE POLICY "settings_write_admin" ON settings FOR ALL    USING (true) WITH CHECK (true);

-- Seed giá trị mặc định (chỉ insert nếu chưa có)
INSERT INTO settings (key, value) VALUES
  ('site_name',          'Netflix Store')           ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('site_title',         'Netflix Store — Mua tài khoản Netflix giá rẻ, bảo hành tự động')
                                                    ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('meta_description',   'Mua tài khoản Netflix Premium chính hãng, giá rẻ, bảo hành tự động 24/7.')
                                                    ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('meta_keywords',      'netflix, tài khoản netflix, mua netflix, netflix giá rẻ')
                                                    ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('contact_telegram',   'https://t.me/yourusername') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('contact_zalo',       '0336636315')              ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('bank_name',          'MB Bank')                 ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('bank_account',       '321336')                  ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('bank_owner',         'PHAM VAN VIET')           ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('momo_number',        '0336636315')              ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('momo_name',          'PHAM VAN VIET')           ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('hero_title',         'Netflix Premium')         ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('hero_subtitle',      'Xem phim không giới hạn, chất lượng 4K Ultra HD')
                                                    ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('social_facebook',    '')                        ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('social_youtube',     '')                        ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('social_tiktok',      '')                        ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('footer_text',        '')                        ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 5b. Thêm cột max_slots vào resources (share account)
--    Mỗi acc có thể chia cho tối đa max_slots user
--    Chạy câu này nếu chưa có cột max_slots
-- ────────────────────────────────────────────────────────────
ALTER TABLE resources ADD COLUMN IF NOT EXISTS max_slots INT DEFAULT 5;
UPDATE resources SET max_slots = 5 WHERE max_slots IS NULL;

-- Cập nhật lại claim_warranty để dùng max_slots
CREATE OR REPLACE FUNCTION claim_warranty(p_sub_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub      RECORD;
  v_resource RECORD;
  v_new_count INTEGER;
  v_new_status TEXT;
  v_max_slots  INTEGER;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE id = p_sub_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Subscription không tồn tại');
  END IF;
  IF v_sub.status != 'active' THEN
    RETURN json_build_object('success', false, 'message', 'Subscription không ở trạng thái active');
  END IF;

  -- Tìm account còn slot trống, loại trừ acc user này đang dùng (tránh cấp trùng cho 1 người)
  SELECT * INTO v_resource
  FROM   resources
  WHERE  status = 'available'
    AND  COALESCE(assigned_count, 0) < COALESCE(max_slots, 5)
    AND  value NOT IN (
      SELECT login_link FROM subscriptions
      WHERE  user_id    = v_sub.user_id
        AND  login_link IS NOT NULL
        AND  status     = 'active'
        AND  id         != p_sub_id
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

-- Reload schema cache sau khi thêm cột
NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────
-- 6. Index để tăng tốc query
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_transfer_content
  ON payments (UPPER(transfer_content));

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_end
  ON subscriptions (status, end_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_resources_status
  ON resources (status, assigned_count) WHERE status = 'available';
