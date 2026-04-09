-- Thêm cột service vào bảng plans (đa dịch vụ)
-- Chạy trong Supabase SQL Editor

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS service VARCHAR DEFAULT 'netflix';

-- Các gói hiện có đều là Netflix
UPDATE plans
  SET service = 'netflix'
  WHERE service IS NULL OR service = '';

-- Kiểm tra
SELECT id, name, service, account_type, price FROM plans ORDER BY service, duration_days;
