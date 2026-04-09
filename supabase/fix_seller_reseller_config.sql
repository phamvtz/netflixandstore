-- Đại lý / web con: ngân hàng, MoMo, Gmail, Telegram, giá từng gói (≥ giá gốc), hướng dẫn
-- Chạy sau fix_seller_tracking.sql

alter table seller_stores add column if not exists bank_name text;
alter table seller_stores add column if not exists bank_account text;
alter table seller_stores add column if not exists bank_owner text;
alter table seller_stores add column if not exists momo_number text;
alter table seller_stores add column if not exists momo_name text;
alter table seller_stores add column if not exists vietqr_bank_bin text default '970422';
alter table seller_stores add column if not exists gmail_user text;
alter table seller_stores add column if not exists gmail_app_password text;
alter table seller_stores add column if not exists telegram_bot_token text;
alter table seller_stores add column if not exists telegram_chat_id text;
alter table seller_stores add column if not exists reseller_guide text;

comment on column seller_stores.vietqr_bank_bin is 'Mã BIN ngân hàng 6 số cho VietQR (vd 970422 MB)';

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
    raise exception 'plan_id không tồn tại';
  end if;
  if new.price < base_price then
    raise exception 'Giá bán % không được thấp hơn giá gốc cửa hàng mẹ %', new.price, base_price;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seller_plan_price_check on seller_store_plan_prices;
create trigger trg_seller_plan_price_check
  before insert or update on seller_store_plan_prices
  for each row execute function public.seller_plan_price_at_least_base();
