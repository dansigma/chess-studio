create table public.ask_master_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  position_key text not null,
  fen text not null,
  game_title text,
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array'),
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ask_master_conversations_user_position_idx
  on public.ask_master_conversations (user_id, position_key);
create index ask_master_conversations_user_updated_idx
  on public.ask_master_conversations (user_id, updated_at desc);

alter table public.ask_master_conversations enable row level security;

create policy "ask_master_conversations_select_own" on public.ask_master_conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "ask_master_conversations_insert_own" on public.ask_master_conversations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "ask_master_conversations_update_own" on public.ask_master_conversations
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "ask_master_conversations_delete_own" on public.ask_master_conversations
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.ask_master_conversations from public, anon, authenticated;
grant select, insert, update, delete on public.ask_master_conversations to authenticated;
-- The publishable-key schema probe selects id. RLS exposes no rows to anon.
grant select (id) on public.ask_master_conversations to anon;

-- Append both messages atomically under the caller's row policies.
create function public.save_ask_master_conversation_turn(
  p_id uuid, p_position_key text, p_fen text, p_game_title text,
  p_question text, p_answer text, p_model text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.ask_master_conversations as conversation
    (id, user_id, position_key, fen, game_title, messages, model)
  values
    (p_id, (select auth.uid()), p_position_key, p_fen, p_game_title,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('role', 'user', 'text', p_question),
        pg_catalog.jsonb_build_object('role', 'assistant', 'text', p_answer)
      ), p_model)
  on conflict (id) do update
    set messages = conversation.messages || excluded.messages,
        model = excluded.model,
        updated_at = pg_catalog.clock_timestamp()
    -- RLS already refuses another user's row; this keeps the intent explicit.
    where conversation.user_id = (select auth.uid());
$$;

revoke all on function public.save_ask_master_conversation_turn(uuid, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_ask_master_conversation_turn(uuid, text, text, text, text, text, text)
  to authenticated;
