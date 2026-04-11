-- Báo "không xem được" → admin xử lý thủ công (khác với Bảo hành tự động khi cookie die)
-- Chạy trong Supabase SQL Editor (hoặc psql).

create table if not exists public.viewer_reports (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'cannot_view',
  status text not null default 'open', -- open | resolved | rejected (rejected: admin tu choi, co admin_note cho khach)
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  admin_note text
);

create index if not exists idx_viewer_reports_status_created
  on public.viewer_reports (status, created_at desc);

alter table public.viewer_reports enable row level security;

drop policy if exists "Users insert own viewer reports" on public.viewer_reports;
create policy "Users insert own viewer reports"
  on public.viewer_reports for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Users select own viewer reports" on public.viewer_reports;
create policy "Users select own viewer reports"
  on public.viewer_reports for select
  using (auth.uid() = user_id);

drop policy if exists "Admin select viewer reports" on public.viewer_reports;
create policy "Admin select viewer reports"
  on public.viewer_reports for select
  using (public.is_admin());

drop policy if exists "Admin update viewer reports" on public.viewer_reports;
create policy "Admin update viewer reports"
  on public.viewer_reports for update
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
