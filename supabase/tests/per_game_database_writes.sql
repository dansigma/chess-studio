-- Compare each incremental write with a rebuild over all persisted positions.
begin;

insert into auth.users (id) values ('10101010-1010-1010-1010-101010101010');
set local role authenticated;
set local request.jwt.claim.sub = '10101010-1010-1010-1010-101010101010';

do $$
<<per_game_database_writes>>
declare
  database_id constant uuid := gen_random_uuid();
  first_id constant uuid := gen_random_uuid();
  second_id constant uuid := gen_random_uuid();
  legacy_local_id constant uuid := gen_random_uuid();
  step record;
  difference boolean;
begin
  insert into public.game_databases (id, user_id, name, kind)
    values (database_id, (select auth.uid()), 'Per-game writes', 'personal');

  for step in
    select * from (values
      (1, 'insert', first_id, '1. e4 1-0', '1-0', 'e2e4', null, 1),
      (2, 'insert', second_id, '1. e4 0-1', '0-1', 'e2e4', null, 2),
      (3, 'insert', second_id, '1. e4 0-1', '0-1', 'e2e4', null, 2),
      (4, 'update', legacy_local_id, '1. d4 1/2-1/2', '1/2-1/2', 'd2d4', '1. e4 0-1', 2),
      (5, 'delete', second_id, null, null, null, null, 1),
      (6, 'delete', first_id, null, null, null, null, 0)
    ) as steps(n, operation, game_id, pgn, result, move, previous_pgn, total)
    order by n
  loop
    perform public.write_database_game(
      database_id, step.game_id, step.operation,
      jsonb_build_object('white', 'White', 'black', 'Black', 'pgn', step.pgn, 'result', step.result),
      case when step.move is null then '[]'::jsonb else jsonb_build_array(
        jsonb_build_object('seq', 1, 'ply', 1, 'zkey', '9223372036854775807', 'next_uci', step.move),
        jsonb_build_object('seq', 2, 'ply', 2, 'zkey', '9223372036854775807', 'next_uci', step.move),
        jsonb_build_object('seq', 3, 'ply', 1000001, 'zkey', '42', 'next_uci', null)
      ) end,
      step.previous_pgn, array[first_id]
    );

    with rebuilt as (
      select p.zkey, p.next_uci,
        count(distinct g.id)::integer as games,
        (count(distinct g.id) filter (where g.result = '1-0'))::integer as white_wins,
        (count(distinct g.id) filter (where coalesce(g.result, '*') not in ('1-0', '0-1')))::integer as draws,
        (count(distinct g.id) filter (where g.result = '0-1'))::integer as black_wins
      from public.game_positions p join public.games g on g.id = p.game_id
      where g.database_id = per_game_database_writes.database_id and p.next_uci is not null
      group by p.zkey, p.next_uci
    ), actual as (
      select s.zkey, s.next_uci, s.games, s.white_wins, s.draws, s.black_wins
      from public.position_stats s where s.database_id = per_game_database_writes.database_id
    )
    select exists (
      (select * from rebuilt except select * from actual)
      union all
      (select * from actual except select * from rebuilt)
    ) into difference;
    if difference then
      raise exception 'Position stats differ from a rebuild at step %', step.n;
    end if;
    if (select game_count from public.game_databases where id = database_id) <> step.total
      or (select count(*) from public.games g where g.database_id = per_game_database_writes.database_id) <> step.total then
      raise exception 'Database game count differs at step %', step.n;
    end if;
  end loop;
end;
$$;

rollback;
