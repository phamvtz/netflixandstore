-- =============================================================================
-- NETFLIX STORE — SQL cai dat cho nguoi mua source (database trong, khong du lieu that)
-- =============================================================================
-- Chay MOT LAN trong Supabase: SQL Editor (project moi hoac chua co cac bang nay).
--
-- Gom: bang + trigger + RLS + RPC (tuong duong gop cac file supabase/*.sql).
-- Seed: plans mau + settings placeholder (khong SDT / tk ngan hang that).
-- Khong tao auth.users: dang ky trong Supabase Auth, roi cap admin:
--   update public.profiles set role = 'admin' where email = 'ban@email.com';
--
-- Sau khi chay: doi vai giay; neu can, reload schema (Settings -> API).
-- =============================================================================

create extension if not exists "uuid-ossp";

-- =========================
-- PROFILES + trigger dang ky
-- =========================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'user',
  created_at timestamp default now()
);

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
  duration_days integer,
  service varchar default 'netflix',
  is_visible boolean not null default true,
  account_type varchar default 'shared',
  fulfillment_type varchar default 'manual'
);

-- Goi mau — nguoi mua chinh gia/ten trong Admin
insert into plans (id, name, price, duration_days, service, is_visible, account_type, fulfillment_type) values
('day',     'Goi 1 ngay',   15000, 1, 'netflix', true, 'shared', 'netflix'),
('month',   'Goi 1 thang',  50000,  30, 'netflix', true, 'shared', 'netflix'),
('quarter', 'Goi 3 thang', 140000,  90, 'netflix', true, 'shared', 'netflix'),
('half_year','Goi 6 thang',270000, 180, 'netflix', true, 'shared', 'netflix'),
('year',    'Goi 1 nam',   500000, 365, 'netflix', true, 'shared', 'netflix')
on conflict (id) do nothing;

-- =========================
-- SELLER (truoc subscriptions vi FK)
-- =========================
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
  custom_domain text,
  bank_name text,
  bank_account text,
  bank_owner text,
  momo_number text,
  momo_name text,
  vietqr_bank_bin text default '970422',
  gmail_user text,
  gmail_app_password text,
  telegram_bot_token text,
  telegram_chat_id text,
  reseller_guide text,
  constraint seller_stores_slug_lower check (slug = lower(slug)),
  constraint seller_stores_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$')
);

create unique index if not exists seller_stores_slug_key on seller_stores (slug);
create unique index if not exists seller_stores_one_per_owner on seller_stores (owner_id);
create unique index if not exists seller_stores_custom_domain_key
  on seller_stores (lower(trim(custom_domain)))
  where custom_domain is not null and trim(custom_domain) <> '';

comment on table seller_stores is 'Gian hang con (seller): GET /api/store/:slug khi is_active';
comment on column seller_stores.custom_domain is 'VD: shop.example.com — khong gom http(s)://';
comment on column seller_stores.vietqr_bank_bin is 'Ma BIN ngan hang 6 so cho VietQR (vd 970422 MB)';

create table if not exists seller_store_plan_prices (
  seller_store_id uuid not null references seller_stores(id) on delete cascade,
  plan_id text not null references plans(id) on delete cascade,
  price integer not null check (price > 0),
  primary key (seller_store_id, plan_id)
);

create index if not exists idx_seller_plan_prices_store on seller_store_plan_prices(seller_store_id);

create or replace function public.seller_plan_price_at_least_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare base_price int;
begin
  select p.price into base_price from public.plans p where p.id = new.plan_id;
  if base_price is null then
    raise exception 'plan_id khong ton tai';
  end if;
  if new.price < base_price then
    raise exception 'Gia ban % khong duoc thap hon gia goc cua hang me %', new.price, base_price;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seller_plan_price_check on seller_store_plan_prices;
create trigger trg_seller_plan_price_check
  before insert or update on seller_store_plan_prices
  for each row execute function public.seller_plan_price_at_least_base();

-- =========================
-- SUBSCRIPTIONS / PAYMENTS / RESOURCES
-- =========================
create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  plan text not null references plans(id),
  start_at timestamp,
  end_at timestamp,
  login_link text,
  status text default 'pending',
  created_at timestamp default now(),
  updated_at timestamptz default now(),
  notes text default null,
  seller_store_id uuid references seller_stores(id) on delete set null,
  reminder_sent boolean default false
);

create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  amount integer not null,
  plan text references plans(id),
  method text,
  transfer_content text,
  status text default 'pending',
  created_at timestamp default now(),
  seller_store_id uuid references seller_stores(id) on delete set null
);

create table if not exists resources (
  id uuid primary key default uuid_generate_v4(),
  type text,
  value text,
  status text default 'available',
  assigned_to uuid references subscriptions(id),
  created_at timestamp default now(),
  note text,
  max_slots int default 5,
  assigned_count int default 0,
  service varchar default 'netflix',
  account_type varchar default 'shared'
);

-- Cot bo sung neu DB cu thieu cot
alter table subscriptions add column if not exists updated_at timestamptz default now();
alter table subscriptions add column if not exists notes text default null;
alter table subscriptions add column if not exists seller_store_id uuid references seller_stores(id) on delete set null;
alter table subscriptions add column if not exists reminder_sent boolean default false;
alter table payments add column if not exists seller_store_id uuid references seller_stores(id) on delete set null;
alter table resources add column if not exists note text;
alter table resources add column if not exists max_slots int default 5;
alter table resources add column if not exists assigned_count int default 0;
alter table resources add column if not exists service varchar default 'netflix';
alter table resources add column if not exists account_type varchar default 'shared';
alter table plans add column if not exists service varchar default 'netflix';
alter table plans add column if not exists is_visible boolean not null default true;
alter table plans add column if not exists account_type varchar default 'shared';
alter table plans add column if not exists fulfillment_type varchar default 'manual';

update resources set max_slots = 5 where max_slots is null;
update resources set assigned_count = 0 where assigned_count is null;

-- =========================
-- SETTINGS — placeholder
-- =========================
create table if not exists settings (
  key text primary key,
  value text default '',
  updated_at timestamptz default now()
);

insert into settings (key, value) values
  ('site_name', 'My Store'),
  ('site_title', 'My Store — Thay tieu de SEO tai Admin'),
  ('meta_description', ''),
  ('meta_keywords', ''),
  ('hero_title', 'Dich vu'),
  ('hero_subtitle', 'Thay mo ta hero tai Admin'),
  ('bank_name', ''),
  ('bank_account', ''),
  ('bank_owner', ''),
  ('momo_number', ''),
  ('momo_name', ''),
  ('contact_telegram', ''),
  ('contact_zalo', ''),
  ('social_facebook', ''),
  ('social_youtube', ''),
  ('social_tiktok', ''),
  ('footer_text', ''),
  ('telegram_bot_token', ''),
  ('telegram_chat_id', ''),
  ('resend_api_key', ''),
  ('email_from', ''),
  ('catalog_config', ''),
  ('guides_config', '')
on conflict (key) do nothing;

-- =========================
-- INDEX
-- =========================
create index if not exists idx_sub_user on subscriptions(user_id);
create index if not exists idx_pay_user on payments(user_id);
create index if not exists idx_pay_sub on payments(subscription_id);
create index if not exists idx_subscriptions_seller_store on subscriptions(seller_store_id);
create index if not exists idx_payments_seller_store on payments(seller_store_id);
create index if not exists idx_payments_transfer_content on payments (upper(transfer_content));
create index if not exists idx_payments_status on payments (status) where status = 'pending';
create index if not exists idx_subscriptions_status_end on subscriptions (status, end_at) where status = 'active';
create index if not exists idx_resources_status on resources (status, assigned_count) where status = 'available';

-- =========================
-- RLS + is_admin()
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

alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table plans enable row level security;
alter table resources enable row level security;
alter table settings enable row level security;

-- Chan truy cap seller qua Supabase Data API (Express dung DATABASE_URL, bypass RLS)
alter table seller_stores enable row level security;
alter table seller_store_plan_prices enable row level security;
drop policy if exists "deny_api_seller_stores" on seller_stores;
create policy "deny_api_seller_stores" on seller_stores for all using (false);
drop policy if exists "deny_api_seller_plan_prices" on seller_store_plan_prices;
create policy "deny_api_seller_plan_prices" on seller_store_plan_prices for all using (false);

drop policy if exists "Anyone can read plans" on plans;
create policy "Anyone can read plans" on plans for select using (true);

drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);

drop policy if exists "Admin can view all profiles" on profiles;
create policy "Admin can view all profiles" on profiles for select using (public.is_admin());

drop policy if exists "Users can view own subscriptions" on subscriptions;
create policy "Users can view own subscriptions" on subscriptions for select using (auth.uid() = user_id);

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

drop policy if exists "Admin can view all subscriptions" on subscriptions;
create policy "Admin can view all subscriptions" on subscriptions for select using (public.is_admin());

drop policy if exists "Admin can update subscriptions" on subscriptions;
create policy "Admin can update subscriptions" on subscriptions for update using (public.is_admin());

drop policy if exists "Users can view own payments" on payments;
create policy "Users can view own payments" on payments for select using (auth.uid() = user_id);

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

drop policy if exists "Admin can view all payments" on payments;
create policy "Admin can view all payments" on payments for select using (public.is_admin());

drop policy if exists "Admin can update payments" on payments;
create policy "Admin can update payments" on payments for update using (public.is_admin());

drop policy if exists "Admin can manage resources" on resources;
create policy "Admin can manage resources" on resources for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users can view assigned resources" on resources;
create policy "Users can view assigned resources" on resources for select using (
  exists (select 1 from subscriptions where id = resources.assigned_to and user_id = auth.uid())
);

drop policy if exists "Admin can insert plans" on plans;
create policy "Admin can insert plans" on plans for insert with check (public.is_admin());

drop policy if exists "Admin can update plans" on plans;
create policy "Admin can update plans" on plans for update using (public.is_admin());

drop policy if exists "Admin can delete plans" on plans;
create policy "Admin can delete plans" on plans for delete using (public.is_admin());

drop policy if exists "Admin can update profiles" on profiles;
create policy "Admin can update profiles" on profiles for update using (public.is_admin());

drop policy if exists "Admin can delete profiles" on profiles;
create policy "Admin can delete profiles" on profiles for delete using (public.is_admin());

drop policy if exists "Anyone can read settings" on settings;
create policy "Anyone can read settings" on settings for select using (true);

drop policy if exists "Admin can insert settings" on settings;
create policy "Admin can insert settings" on settings for insert with check (public.is_admin());

drop policy if exists "Admin can update settings" on settings;
create policy "Admin can update settings" on settings for update using (public.is_admin());

-- =========================
-- RPC: thanh toan tu dong + het han + bao hanh
-- =========================
create or replace function auto_process_payment(
  p_transfer_content text,
  p_amount_paid      numeric
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay_id    uuid;
  v_sub_id    uuid;
  v_plan_id   text;
  v_plan_days integer;
  v_start_at  timestamptz;
  v_end_at    timestamptz;
begin
  select p.id, p.subscription_id, p.plan
  into   v_pay_id, v_sub_id, v_plan_id
  from   payments p
  where  upper(p.transfer_content) = upper(p_transfer_content)
    and  p.status   = 'pending'
    and  p.amount  <= p_amount_paid
  order  by p.created_at desc
  limit  1
  for update skip locked;

  if v_pay_id is null then
    return json_build_object(
      'success', false,
      'reason',  'Khong tim thay payment pending khop noi dung va so tien. transfer_content=' || p_transfer_content
    );
  end if;

  select duration_days into v_plan_days
  from   plans where id = v_plan_id limit 1;

  if v_plan_days is null then
    v_plan_days := 30;
  end if;

  v_start_at := now();
  v_end_at   := now() + (v_plan_days || ' days')::interval;

  update payments set status = 'success' where id = v_pay_id;

  update subscriptions
  set    status   = 'active',
         start_at = v_start_at,
         end_at   = v_end_at
  where  id = v_sub_id;

  return json_build_object(
    'success',         true,
    'subscription_id', v_sub_id,
    'plan',            v_plan_id,
    'duration_days',   v_plan_days,
    'start_at',        v_start_at,
    'end_at',          v_end_at
  );

exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;

create or replace function expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update subscriptions
  set    status     = 'expired',
         updated_at = now()
  where  status  = 'active'
    and  end_at  is not null
    and  end_at  < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function claim_warranty(p_sub_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub      record;
  v_resource record;
  v_new_count integer;
  v_new_status text;
  v_max_slots  integer;
begin
  select * into v_sub from subscriptions where id = p_sub_id limit 1;
  if not found then
    return json_build_object('success', false, 'message', 'Subscription khong ton tai');
  end if;
  if v_sub.status != 'active' then
    return json_build_object('success', false, 'message', 'Subscription khong o trang thai active');
  end if;

  select * into v_resource
  from   resources
  where  status = 'available'
    and  coalesce(assigned_count, 0) < coalesce(max_slots, 5)
    and  value not in (
      select login_link from subscriptions
      where  user_id    = v_sub.user_id
        and  login_link is not null
        and  status     = 'active'
        and  id         != p_sub_id
    )
  order  by assigned_count desc nulls last, created_at asc
  limit  1
  for update skip locked;

  if not found then
    return json_build_object('success', false, 'message', 'Khong con tai khoan du phong, vui long lien he admin');
  end if;

  v_max_slots  := coalesce(v_resource.max_slots, 5);
  v_new_count  := coalesce(v_resource.assigned_count, 0) + 1;
  v_new_status := case when v_new_count >= v_max_slots then 'full' else 'available' end;

  update resources
  set    assigned_count = v_new_count,
         status         = v_new_status,
         assigned_to    = p_sub_id
  where  id = v_resource.id;

  update subscriptions
  set    login_link  = v_resource.value,
         updated_at = now()
  where  id = p_sub_id;

  return json_build_object(
    'success',     true,
    'message',     'Da doi tai khoan moi thanh cong',
    'new_account', v_resource.value
  );

exception when others then
  return json_build_object('success', false, 'message', sqlerrm);
end;
$$;

grant execute on function public.claim_warranty(uuid) to authenticated;

notify pgrst, 'reload schema';
