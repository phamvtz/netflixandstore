-- =============================================================================
-- Fix Admin "kho" (resources): missing columns + RLS INSERT + reload API schema
-- Run in Supabase -> SQL Editor
-- =============================================================================

-- 1) Columns the app sends on insert (service, account_type, note, max_slots, assigned_count)
alter table public.resources add column if not exists service varchar default 'netflix';
alter table public.resources add column if not exists account_type varchar default 'shared';
alter table public.resources add column if not exists note text;
alter table public.resources add column if not exists max_slots int default 5;
alter table public.resources add column if not exists assigned_count int default 0;

update public.resources set service = 'netflix' where service is null or trim(service) = '';
update public.resources set account_type = 'shared' where account_type is null or trim(account_type) = '';
update public.resources set max_slots = 5 where max_slots is null;
update public.resources set assigned_count = 0 where assigned_count is null;

-- 2) Admin policy: INSERT needs WITH CHECK (not only USING)
drop policy if exists "Admin can manage resources" on public.resources;
create policy "Admin can manage resources" on public.resources
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- If is_admin() is missing, run supabase/fix_rls_infinite_recursion.sql first

-- 3) PostgREST schema cache ("Could not find column ... in the schema cache")
notify pgrst, 'reload schema';
