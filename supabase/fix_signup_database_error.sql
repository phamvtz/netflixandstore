-- Khắc phục đăng ký: Supabase Auth trả 500 + "Database error saving new user"
-- Chạy trong: Supabase Dashboard → SQL Editor → Run
--
-- Nguyên nhân: trigger handle_new_user() INSERT vào public.profiles nhưng không chạy
-- với quyền bypass RLS (thiếu SECURITY DEFINER), nên bị policy chặn.

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

-- Nếu báo lỗi cú pháp, thử thay dòng trên bằng:
-- for each row execute function public.handle_new_user();
