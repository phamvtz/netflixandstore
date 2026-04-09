-- Tên miền riêng cho gian hàng (DNS trỏ về cùng server + Caddy/Nginx)
alter table seller_stores add column if not exists custom_domain text;

comment on column seller_stores.custom_domain is 'VD: shop.example.com — không gồm http(s)://, lưu chữ thường, không www.';

-- Một tên miền chỉ gắn một gian hàng (NULL được phép nhiều dòng)
create unique index if not exists seller_stores_custom_domain_key
  on seller_stores (lower(trim(custom_domain)))
  where custom_domain is not null and trim(custom_domain) <> '';
