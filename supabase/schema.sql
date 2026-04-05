-- =========================
-- EXTENSIONS
-- =========================
create extension if not exists "uuid-ossp";

-- =========================
-- PROFILES (USER INFO)
-- =========================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'user', -- user, admin
  created_at timestamp default now()
);

-- Auto create profile khi user đăng ký
-- SECURITY DEFINER + search_path: bắt buộc trên Supabase khi RLS bật trên profiles,
-- nếu không INSERT trong trigger bị chặn → Auth API 500 "Database error saving new user".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================
-- PLANS
-- =========================
create table if not exists plans (
  id text primary key,
  name text,
  price integer,
  duration_days integer
);

insert into plans (id, name, price, duration_days) values
('day', 'Gói 1 Ngày', 15000, 1),
('month', 'Gói 1 Tháng', 50000, 30),
('quarter', 'Gói 3 Tháng', 140000, 90),
('half_year', 'Gói 6 Tháng', 270000, 180),
('year', 'Gói 1 Năm', 500000, 365)
on conflict (id) do nothing;

-- =========================
-- SUBSCRIPTIONS
-- =========================
create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  plan text not null references plans(id),
  start_at timestamp,
  end_at timestamp,
  login_link text,
  status text default 'pending', -- pending, active, expired, cancelled
  created_at timestamp default now()
);

-- claim_warranty / expire_subscriptions cần cột này (DB cũ thường thiếu)
alter table subscriptions add column if not exists updated_at timestamptz default now();
update subscriptions set updated_at = coalesce(updated_at, created_at, now());

-- =========================
-- PAYMENTS
-- =========================
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  amount integer not null,
  plan text references plans(id),
  method text, -- momo, bank
  transfer_content text,
  status text default 'pending', -- pending, success, fail
  created_at timestamp default now()
);

-- =========================
-- RESOURCES (Login links pool)
-- =========================
create table if not exists resources (
  id uuid primary key default uuid_generate_v4(),
  type text, -- login_link
  value text,
  status text default 'available', -- available, full, dead
  assigned_to uuid references subscriptions(id),
  created_at timestamp default now()
);

-- Cột bổ sung (app + claim_warranty cần — bảng cũ có thể thiếu)
alter table resources add column if not exists note text;
alter table resources add column if not exists max_slots int default 5;
alter table resources add column if not exists assigned_count int default 0;
update resources set max_slots = 5 where max_slots is null;
update resources set assigned_count = 0 where assigned_count is null;

-- =========================
-- SETTINGS (key-value, site / SEO / bank / integrations)
-- =========================
create table if not exists settings (
  key text primary key,
  value text default '',
  updated_at timestamptz default now()
);

-- =========================
-- INDEXES
-- =========================
create index if not exists idx_sub_user on subscriptions(user_id);
create index if not exists idx_pay_user on payments(user_id);
create index if not exists idx_pay_sub on payments(subscription_id);

-- =========================
-- RLS
-- =========================
alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table plans enable row level security;
alter table resources enable row level security;
alter table settings enable row level security;

-- =========================
-- is_admin() PHẢI đứng trước mọi policy gọi nó.
-- SECURITY DEFINER đọc profiles bỏ qua RLS → không bị "infinite recursion" như EXISTS (SELECT … FROM profiles) trong policy trên chính bảng profiles.
-- =========================
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

-- Plans: everyone can read
drop policy if exists "Anyone can read plans" on plans;
create policy "Anyone can read plans" on plans for select using (true);

-- Profiles (KHÔNG dùng subquery vào profiles trong policy trên profiles)
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);

drop policy if exists "Admin can view all profiles" on profiles;
create policy "Admin can view all profiles" on profiles for select using (public.is_admin());

-- Subscriptions
drop policy if exists "Users can view own subscriptions" on subscriptions;
create policy "Users can view own subscriptions" on subscriptions for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own subscriptions" on subscriptions;
create policy "Users can insert own subscriptions" on subscriptions for insert with check (auth.uid() = user_id);

drop policy if exists "Admin can view all subscriptions" on subscriptions;
create policy "Admin can view all subscriptions" on subscriptions for select using (public.is_admin());

drop policy if exists "Admin can update subscriptions" on subscriptions;
create policy "Admin can update subscriptions" on subscriptions for update using (public.is_admin());

-- Payments
drop policy if exists "Users can view own payments" on payments;
create policy "Users can view own payments" on payments for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own payments" on payments;
create policy "Users can insert own payments" on payments for insert with check (auth.uid() = user_id);

drop policy if exists "Admin can view all payments" on payments;
create policy "Admin can view all payments" on payments for select using (public.is_admin());

drop policy if exists "Admin can update payments" on payments;
create policy "Admin can update payments" on payments for update using (public.is_admin());

-- Resources
drop policy if exists "Admin can manage resources" on resources;
-- WITH CHECK bắt buộc cho INSERT (một số bản Postgres/Supabase không suy ra từ USING)
create policy "Admin can manage resources" on resources
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users can view assigned resources" on resources;
create policy "Users can view assigned resources" on resources for select using (
  exists (select 1 from subscriptions where id = resources.assigned_to and user_id = auth.uid())
);

-- =========================
-- Admin: quyền ghi plans + profiles (đã dùng is_admin)
-- =========================
drop policy if exists "Admin can insert plans" on plans;
create policy "Admin can insert plans" on plans for insert
  with check (public.is_admin());

drop policy if exists "Admin can update plans" on plans;
create policy "Admin can update plans" on plans for update
  using (public.is_admin());

drop policy if exists "Admin can delete plans" on plans;
create policy "Admin can delete plans" on plans for delete
  using (public.is_admin());

drop policy if exists "Admin can update profiles" on profiles;
create policy "Admin can update profiles" on profiles for update
  using (public.is_admin());

drop policy if exists "Admin can delete profiles" on profiles;
create policy "Admin can delete profiles" on profiles for delete
  using (public.is_admin());

-- Settings: site đọc công khai (SEO, footer, ngân hàng trên trang thanh toán); chỉ admin ghi
drop policy if exists "Anyone can read settings" on settings;
create policy "Anyone can read settings" on settings for select using (true);

drop policy if exists "Admin can insert settings" on settings;
create policy "Admin can insert settings" on settings for insert
  with check (public.is_admin());

drop policy if exists "Admin can update settings" on settings;
create policy "Admin can update settings" on settings for update
  using (public.is_admin());

