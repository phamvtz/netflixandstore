-- Thêm cột account_type vào bảng resources (kho tài khoản)
-- Chạy trong Supabase SQL Editor

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS account_type VARCHAR DEFAULT 'shared';

-- Cập nhật tài khoản hiện có thành 'shared'
UPDATE resources
  SET account_type = 'shared'
  WHERE account_type IS NULL OR account_type = '';

-- Kiểm tra kết quả
SELECT id, type, status, account_type, note FROM resources ORDER BY account_type, created_at DESC LIMIT 20;
