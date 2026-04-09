-- Thêm cột service vào bảng resources (để tách kho Netflix / sản phẩm khác)
-- Chạy trong Supabase SQL Editor

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS service VARCHAR DEFAULT 'netflix';

-- Tất cả tài khoản hiện có đều là Netflix
UPDATE resources
  SET service = 'netflix'
  WHERE service IS NULL OR service = '';

-- Kiểm tra
SELECT id, type, status, service, account_type, note FROM resources ORDER BY service, created_at DESC LIMIT 20;
