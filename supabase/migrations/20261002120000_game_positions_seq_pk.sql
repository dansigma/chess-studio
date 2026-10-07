alter table public.game_positions add column if not exists seq integer;

with numbered as (
  select game_id, ply, row_number() over (partition by game_id order by ply) as rn
  from public.game_positions
)
update public.game_positions gp
  set seq = n.rn
  from numbered n
  where gp.game_id = n.game_id and gp.ply = n.ply and gp.seq is null;

alter table public.game_positions alter column seq set not null;

alter table public.game_positions drop constraint if exists game_positions_pkey;
alter table public.game_positions add constraint game_positions_pkey primary key (game_id, seq);
