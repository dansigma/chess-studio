-- SIG-1083: regression test for the folder-cycle trigger.
--
-- Run with: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
--   -v ON_ERROR_STOP=1 -f supabase/tests/folder_cycles.sql
-- Everything is rolled back at the end, so the test is side-effect free.
-- Each negative case must raise; a missing raise fails the script loudly.

begin;

-- Minimal auth.users rows: user_folders.user_id references auth.users(id).
insert into auth.users (id)
values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- Three nested folders for user A: top -> mid -> leaf, plus one folder for B.
insert into public.user_folders (id, user_id, name, parent_id)
values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Top', null),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Mid', 'a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Leaf', 'a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Other', null),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Spare', null);

-- Case 1: moving the top folder under its grandchild raises folder_cycle.
do $$
begin
  update public.user_folders
    set parent_id = 'a0000000-0000-0000-0000-000000000003'
    where id = 'a0000000-0000-0000-0000-000000000001';
  raise exception 'case 1 failed: descendant move was accepted';
exception
  when raise_exception then
    if sqlerrm not like '%folder_cycle%' then
      raise;
    end if;
    raise notice 'case 1 ok: descendant move raised folder_cycle';
end;
$$;

-- Case 2: setting a parent to itself raises folder_cycle.
do $$
begin
  update public.user_folders
    set parent_id = 'a0000000-0000-0000-0000-000000000001'
    where id = 'a0000000-0000-0000-0000-000000000001';
  raise exception 'case 2 failed: self-parent was accepted';
exception
  when raise_exception then
    if sqlerrm not like '%folder_cycle%' then
      raise;
    end if;
    raise notice 'case 2 ok: self-parent raised folder_cycle';
end;
$$;

-- Case 3: a valid move succeeds.
update public.user_folders
  set parent_id = 'a0000000-0000-0000-0000-000000000004'
  where id = 'a0000000-0000-0000-0000-000000000002';

do $$
declare
  current_parent uuid;
begin
  select parent_id into current_parent
    from public.user_folders
    where id = 'a0000000-0000-0000-0000-000000000002';
  if current_parent is distinct from 'a0000000-0000-0000-0000-000000000004' then
    raise exception 'case 3 failed: valid move did not persist';
  end if;
  raise notice 'case 3 ok: valid move succeeded';
end;
$$;

-- Case 4: a parent owned by another user raises folder_parent_owner.
do $$
begin
  update public.user_folders
    set parent_id = 'b0000000-0000-0000-0000-000000000001'
    where id = 'a0000000-0000-0000-0000-000000000001';
  raise exception 'case 4 failed: cross-user parent was accepted';
exception
  when raise_exception then
    if sqlerrm not like '%folder_parent_owner%' then
      raise;
    end if;
    raise notice 'case 4 ok: cross-user parent raised folder_parent_owner';
end;
$$;

rollback;
