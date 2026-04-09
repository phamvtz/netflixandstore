-- Thêm cột notes vào bảng subscriptions
-- Dùng để lưu ghi chú admin khi xử lý đơn dịch vụ thủ công (non-Netflix)
-- Chạy trong Supabase SQL Editor

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Kiểm tra
SELECT id, plan, status, notes FROM subscriptions ORDER BY created_at DESC LIMIT 10;
