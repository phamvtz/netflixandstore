-- =============================================================================
-- Sửa lỗi bảo hành: column "updated_at" of relation "subscriptions" does not exist
-- RPC claim_warranty (và expire_subscriptions) có UPDATE subscriptions SET updated_at = NOW()
-- Chạy trong Supabase → SQL Editor
-- =============================================================================

alter table public.subscriptions
  add column if not exists updated_at timestamptz default now();

update public.subscriptions
set updated_at = coalesce(updated_at, created_at::timestamptz, now())
where updated_at is null;

notify pgrst, 'reload schema';
