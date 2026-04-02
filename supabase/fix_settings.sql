-- Chạy một lần nếu thiếu bảng settings hoặc policy RLS.
create table if not exists settings (
  key text primary key,
  value text default '',
  updated_at timestamptz default now()
);

alter table settings enable row level security;

drop policy if exists "Anyone can read settings" on settings;
create policy "Anyone can read settings" on settings for select using (true);

drop policy if exists "Admin can insert settings" on settings;
create policy "Admin can insert settings" on settings for insert
  with check (public.is_admin());

drop policy if exists "Admin can update settings" on settings;
create policy "Admin can update settings" on settings for update
  using (public.is_admin());
