-- =============================================================================
-- Sửa lỗi "Thêm kho" / insert resources từ Admin
-- Chạy trong Supabase → SQL Editor nếu thêm tài khoản báo lỗi (thiếu cột hoặc RLS INSERT).
-- =============================================================================

-- 1) Cột mà frontend gửi khi thêm tài khoản (note, max_slots, assigned_count)
alter table public.resources add column if not exists note text;
alter table public.resources add column if not exists max_slots int default 5;
alter table public.resources add column if not exists assigned_count int default 0;

update public.resources set max_slots = 5 where max_slots is null;
update public.resources set assigned_count = 0 where assigned_count is null;

-- 2) Policy admin: INSERT cần WITH CHECK (không chỉ USING)
drop policy if exists "Admin can manage resources" on public.resources;
create policy "Admin can manage resources" on public.resources
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Nếu chưa có is_admin(), chạy trước supabase/fix_rls_infinite_recursion.sql
