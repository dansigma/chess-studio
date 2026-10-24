-- SIG-1083: reject folder cycles in the database.
--
-- The client refuses to move a folder into itself or one of its descendants
-- (canMoveFolder in src/lib/user-files.ts), but the database accepted any
-- parent_id, so a modified client or a bug could create a cycle (A inside B
-- inside A) that makes folder listings recurse forever. This trigger enforces
-- the same rule at the trust boundary: a folder cannot be its own parent and
-- cannot be moved under one of its descendants. It also refuses parents owned
-- by another user, since folder trees are per-user.

create or replace function public.check_user_folder_no_cycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_owner uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception using
      errcode = 'raise_exception',
      message = 'folder_cycle';
  end if;

  select user_id into parent_owner
    from public.user_folders
    where id = new.parent_id;

  if parent_owner is distinct from new.user_id then
    raise exception using
      errcode = 'raise_exception',
      message = 'folder_parent_owner';
  end if;

  if exists (
    with recursive ancestors(id, depth) as (
      select parent_id, 1
        from public.user_folders
        where id = new.parent_id
      union all
      select f.parent_id, a.depth + 1
        from public.user_folders f
        join ancestors a on f.id = a.id
        where f.parent_id is not null
          and a.depth < 100
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception using
      errcode = 'raise_exception',
      message = 'folder_cycle';
  end if;

  return new;
end;
$$;

drop trigger if exists user_folders_no_cycle on public.user_folders;
create trigger user_folders_no_cycle
  before insert or update of parent_id on public.user_folders
  for each row execute function public.check_user_folder_no_cycle();
