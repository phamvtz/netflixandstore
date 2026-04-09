-- Ẩn gói khỏi cửa hàng (vẫn giữ trong admin & DB)
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN plans.is_visible IS 'false = không hiển thị trên Dịch vụ / Bảng giá / thanh toán công khai';
