-- =============================================================================
-- Sửa lỗi: infinite recursion detected in policy for relation "profiles"
-- Chạy TOÀN BỘ file này trong Supabase → SQL Editor → Run
--
-- Nguyên nhân: policy "Admin can view all profiles" dùng
--   EXISTS (SELECT 1 FROM profiles WHERE ...)
-- → mỗi lần đọc profiles lại kích hoạt RLS trên profiles → lặp vô hạn.
-- Cách xử lý: hàm is_admin() SECURITY DEFINER đọc profiles không qua RLS.
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admin can view all profiles" on profiles;
create policy "Admin can view all profiles" on profiles
  for select using (public.is_admin());

drop policy if exists "Admin can view all subscriptions" on subscriptions;
create policy "Admin can view all subscriptions" on subscriptions
  for select using (public.is_admin());

drop policy if exists "Admin can update subscriptions" on subscriptions;
create policy "Admin can update subscriptions" on subscriptions
  for update using (public.is_admin());

drop policy if exists "Admin can view all payments" on payments;
create policy "Admin can view all payments" on payments
  for select using (public.is_admin());

drop policy if exists "Admin can update payments" on payments;
create policy "Admin can update payments" on payments
  for update using (public.is_admin());

drop policy if exists "Admin can manage resources" on resources;
create policy "Admin can manage resources" on resources
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Nếu trước đó đã tạo (đúng rồi) thì chỉ recreate giống vậy:
drop policy if exists "Admin can update profiles" on profiles;
create policy "Admin can update profiles" on profiles
  for update using (public.is_admin());

drop policy if exists "Admin can delete profiles" on profiles;
create policy "Admin can delete profiles" on profiles
  for delete using (public.is_admin());

drop policy if exists "Admin can insert plans" on plans;
create policy "Admin can insert plans" on plans
  for insert with check (public.is_admin());

drop policy if exists "Admin can update plans" on plans;
create policy "Admin can update plans" on plans
  for update using (public.is_admin());

drop policy if exists "Admin can delete plans" on plans;
create policy "Admin can delete plans" on plans
  for delete using (public.is_admin());
