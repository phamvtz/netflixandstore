-- Thêm cột fulfillment_type vào plans
-- 'manual'  = Dịch vụ: admin xác nhận + xử lý tay (YouTube nâng cấp, Spotify...)
-- 'stock'   = Sản phẩm: có kho, khách mua → tự động giao từ kho
-- 'netflix' = giữ nguyên flow Netflix (mặc định hiện tại)
-- Chạy trong Supabase SQL Editor

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR DEFAULT 'manual';

-- Netflix plans → giữ riêng flow cũ
UPDATE plans SET fulfillment_type = 'netflix' WHERE service = 'netflix' OR service IS NULL;

-- Các plan khác mặc định là 'manual' (admin xác nhận tay)
UPDATE plans SET fulfillment_type = 'manual'
  WHERE service != 'netflix' AND service IS NOT NULL AND (fulfillment_type IS NULL OR fulfillment_type = '');

-- Kiểm tra
SELECT id, name, service, fulfillment_type, price FROM plans ORDER BY service, fulfillment_type;
