-- Thêm cột account_type vào bảng plans
-- Chạy trong Supabase SQL Editor

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS account_type VARCHAR DEFAULT 'shared';

-- Cập nhật các gói hiện có thành 'shared' (dùng chung) nếu chưa có giá trị
UPDATE plans
  SET account_type = 'shared'
  WHERE account_type IS NULL OR account_type = '';

-- Kiểm tra kết quả
SELECT id, name, price, duration_days, account_type FROM plans ORDER BY account_type, duration_days;
