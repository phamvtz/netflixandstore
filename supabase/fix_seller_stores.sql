-- ĐÃ GỘP vào fix_seller_tracking.sql — chỉ giữ file này nếu bạn tách bước cài đặt.
-- Khuyến nghị: chạy một lần supabase/fix_seller_tracking.sql

-- Web con (seller mini-store): một seller — một gian hàng, slug dùng trong URL #/s/{slug}
create extension if not exists "uuid-ossp";

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

-- Gán quyền seller: update profiles set role = ''seller'' where id = ''...'';
