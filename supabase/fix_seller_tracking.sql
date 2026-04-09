-- =============================================================================
-- Gian hàng (seller) + cột seller_store_id — CHẠY MỘT FILE NÀY (Supabase SQL Editor)
-- =============================================================================

create extension if not exists "uuid-ossp";

-- 1) Bảng seller_stores (nếu chưa có)
create table if not exists seller_stores (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  display_name text not null default '',
  tagline text default '',
  theme_primary text default '#E50914',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint seller_stores_slug_lower check (slug = lower(slug)),
  constraint seller_stores_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$')
);

create unique index if not exists seller_stores_slug_key on seller_stores (slug);
create unique index if not exists seller_stores_one_per_owner on seller_stores (owner_id);

comment on table seller_stores is 'Gian hàng con (seller): công khai qua GET /api/store/:slug khi is_active';

-- 2) Cột tracking trên subscriptions / payments
alter table subscriptions add column if not exists seller_store_id uuid references seller_stores(id) on delete set null;
alter table payments add column if not exists seller_store_id uuid references seller_stores(id) on delete set null;

create index if not exists idx_subscriptions_seller_store on subscriptions(seller_store_id);
create index if not exists idx_payments_seller_store on payments(seller_store_id);

-- 3) RLS: insert kèm seller_store_id chỉ khi gian hàng tồn tại và đang mở
drop policy if exists "Users can insert own subscriptions" on subscriptions;
create policy "Users can insert own subscriptions" on subscriptions for insert
with check (
  auth.uid() = user_id
  and (
    seller_store_id is null
    or exists (
      select 1 from seller_stores ss
      where ss.id = seller_store_id and ss.is_active = true
    )
  )
);

drop policy if exists "Users can insert own payments" on payments;
create policy "Users can insert own payments" on payments for insert
with check (
  auth.uid() = user_id
  and (
    seller_store_id is null
    or exists (
      select 1 from seller_stores ss
      where ss.id = seller_store_id and ss.is_active = true
    )
  )
);

-- Gán seller: update public.profiles set role = 'seller' where email = '...';

-- 4) Tên miền riêng (seller) — hoặc chạy riêng fix_seller_custom_domain.sql
alter table seller_stores add column if not exists custom_domain text;
comment on column seller_stores.custom_domain is 'VD: shop.example.com — không gồm http(s)://';
create unique index if not exists seller_stores_custom_domain_key
  on seller_stores (lower(trim(custom_domain)))
  where custom_domain is not null and trim(custom_domain) <> '';
