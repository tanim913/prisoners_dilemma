-- Prisoner's Dilemma online: profiles, matches, secret moves, chat, solo history.
-- Every table has RLS. Match writes go only through the security definer functions below,
-- so the server alone decides scores, reveals moves and knows when a match ends.

-- Profiles -----------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text check (char_length(avatar_url) <= 500),
  -- self-reported summary shown to other players; cosmetic only, never used for scoring
  fingerprint jsonb not null default '{}' check (pg_column_size(fingerprint) < 4000),
  coop_rate real check (coop_rate between 0 and 1),
  games_played int not null default 0 check (games_played >= 0),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, fingerprint, coop_rate, games_played) on public.profiles to authenticated;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), 'Player'), 40),
    left(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'), 500)
  );
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Matches ------------------------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  is_public boolean not null default false,
  player_a uuid references public.profiles(id) on delete set null,
  player_b uuid references public.profiles(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'done', 'abandoned')),
  round_min int not null check (round_min between 2 and 100),
  round_max int not null check (round_max between round_min and 100),
  current_round int not null default 1,
  score_a int not null default 0,
  score_b int not null default 0,
  abandoned_by text check (abandoned_by in ('a', 'b')),
  last_move_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.matches enable row level security;
create index matches_queue_idx on public.matches (last_move_at) where status = 'waiting' and is_public;
create index matches_player_a_idx on public.matches (player_a);
create index matches_player_b_idx on public.matches (player_b);

create policy matches_select on public.matches for select to authenticated
  using ((select auth.uid()) in (player_a, player_b));

revoke all on public.matches from anon, authenticated;
grant select on public.matches to authenticated;

-- The real length of each match. No grants and no policies: only the functions below read it.
create table public.match_secrets (
  match_id uuid primary key references public.matches(id) on delete cascade,
  total_rounds int not null check (total_rounds between 2 and 100)
);
alter table public.match_secrets enable row level security;
revoke all on public.match_secrets from anon, authenticated;

create table public.moves (
  match_id uuid not null references public.matches(id) on delete cascade,
  round int not null check (round >= 1),
  seat text not null check (seat in ('a', 'b')),
  move text not null check (move in ('C', 'D')),
  created_at timestamptz not null default now(),
  primary key (match_id, round, seat)
);
alter table public.moves enable row level security;

-- Your own moves always; the opponent's only once the round has resolved or the match is over.
create policy moves_select on public.moves for select to authenticated using (
  exists (
    select 1 from public.matches m
    where m.id = match_id
      and (
        (m.player_a = (select auth.uid()) and (seat = 'a' or round < m.current_round or m.status <> 'active'))
        or (m.player_b = (select auth.uid()) and (seat = 'b' or round < m.current_round or m.status <> 'active'))
      )
  )
);
revoke all on public.moves from anon, authenticated;
grant select on public.moves to authenticated;

create table public.messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  sender uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create index messages_match_idx on public.messages (match_id, id);
create index messages_sender_idx on public.messages (sender);

create policy messages_select on public.messages for select to authenticated using (
  exists (select 1 from public.matches m where m.id = match_id and (select auth.uid()) in (m.player_a, m.player_b))
);
create policy messages_insert on public.messages for insert to authenticated with check (
  sender = (select auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = match_id and m.status <> 'waiting' and (select auth.uid()) in (m.player_a, m.player_b)
  )
);
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (match_id, body) on public.messages to authenticated;

-- Solo games against the bots, kept for history and the fingerprint.
create table public.solo_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  strategy text not null check (strategy ~ '^[a-z0-9]{1,24}$'),
  my_moves text not null check (my_moves ~ '^[CD]{1,200}$'),
  their_moves text not null check (char_length(their_moves) = char_length(my_moves) and their_moves ~ '^[CD]+$'),
  created_at timestamptz not null default now()
);
alter table public.solo_games enable row level security;
create index solo_games_user_idx on public.solo_games (user_id, created_at);

create policy solo_select on public.solo_games for select to authenticated using ((select auth.uid()) = user_id);
create policy solo_insert on public.solo_games for insert to authenticated with check ((select auth.uid()) = user_id);
create policy solo_delete on public.solo_games for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.solo_games from anon, authenticated;
grant select, delete on public.solo_games to authenticated;
grant insert (strategy, my_moves, their_moves) on public.solo_games to authenticated;

-- Match functions ----------------------------------------------------------------------------------

-- Creates a waiting match and draws its secret length. Lengths: short 6-10, standard 10-16, long 20-30.
create function public.new_match(p_public boolean, p_length text) returns public.matches
language plpgsql security definer set search_path = '' as $$
declare
  v_min int; v_max int; v_code text; v_row public.matches;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  select r[1], r[2] into v_min, v_max from (select case p_length
    when 'short' then array[6, 10] when 'standard' then array[10, 16] when 'long' then array[20, 30] end as r) x;
  if v_min is null then raise exception 'unknown length'; end if;

  loop
    v_code := case when p_public then null else (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 6)) end;
    begin
      insert into public.matches (invite_code, is_public, player_a, round_min, round_max)
      values (v_code, p_public, (select auth.uid()), v_min, v_max) returning * into v_row;
      exit;
    exception when unique_violation then
      -- invite code collision, draw another
    end;
  end loop;

  insert into public.match_secrets values (v_row.id, v_min + floor(random() * (v_max - v_min + 1))::int);
  return v_row;
end $$;
revoke execute on function public.new_match(boolean, text) from public, anon, authenticated;

create function public.create_invite(p_length text default 'standard') returns public.matches
language sql security definer set search_path = '' as $$
  select public.new_match(false, p_length);
$$;

create function public.join_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.matches set player_b = (select auth.uid()), status = 'active', last_move_at = now()
  where id = (
    select id from public.matches
    where invite_code = upper(btrim(p_code)) and status = 'waiting' and player_a <> (select auth.uid())
    for update
  ) and status = 'waiting'
  returning id into v_id;
  if v_id is null then raise exception 'invite not found or already used'; end if;
  return v_id;
end $$;

-- Pairs the caller with someone waiting, or puts them in the queue. Waiting players call this again
-- every ~10 seconds; that heartbeat keeps their seat, and seats silent for 25 seconds are skipped.
create function public.join_queue() returns public.matches
language plpgsql security definer set search_path = '' as $$
declare v_row public.matches;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;

  update public.matches set last_move_at = now()
  where player_a = (select auth.uid()) and status = 'waiting' and is_public
  returning * into v_row;
  if found then return v_row; end if;

  update public.matches set player_b = (select auth.uid()), status = 'active', last_move_at = now()
  where id = (
    select id from public.matches
    where status = 'waiting' and is_public and player_a <> (select auth.uid())
      and last_move_at > now() - interval '25 seconds'
    order by created_at
    for update skip locked
    limit 1
  )
  returning * into v_row;
  if found then return v_row; end if;

  return public.new_match(true, 'standard');
end $$;

create function public.submit_move(p_match uuid, p_move text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches; v_seat text; v_other text; v_a text; v_b text; v_total int;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or (select auth.uid()) not in (m.player_a, m.player_b) then raise exception 'not your match'; end if;
  if m.status <> 'active' then raise exception 'match is not active'; end if;
  if p_move not in ('C', 'D') then raise exception 'bad move'; end if;

  v_seat := case when m.player_a = (select auth.uid()) then 'a' else 'b' end;
  v_other := case v_seat when 'a' then 'b' else 'a' end;

  begin
    insert into public.moves (match_id, round, seat, move) values (p_match, m.current_round, v_seat, p_move);
  exception when unique_violation then
    raise exception 'already moved this round';
  end;

  select move into v_a from public.moves where match_id = p_match and round = m.current_round and seat = 'a';
  select move into v_b from public.moves where match_id = p_match and round = m.current_round and seat = 'b';

  if v_a is null or v_b is null then
    update public.matches set last_move_at = now() where id = p_match;
    return;
  end if;

  select total_rounds into v_total from public.match_secrets where match_id = p_match;
  update public.matches set
    score_a = score_a + case v_a || v_b when 'CC' then 3 when 'CD' then 0 when 'DC' then 5 else 1 end,
    score_b = score_b + case v_a || v_b when 'CC' then 3 when 'CD' then 5 when 'DC' then 0 else 1 end,
    current_round = current_round + 1,
    last_move_at = now(),
    status = case when m.current_round >= v_total then 'done' else 'active' end,
    finished_at = case when m.current_round >= v_total then now() end
  where id = p_match;
end $$;

-- Leave a match. A waiting match is simply removed; an active one is lost by the player who leaves.
create function public.forfeit(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or (select auth.uid()) not in (m.player_a, m.player_b) then raise exception 'not your match'; end if;
  if m.status = 'waiting' then
    delete from public.matches where id = p_match;
  elsif m.status = 'active' then
    update public.matches set status = 'abandoned', finished_at = now(),
      abandoned_by = case when m.player_a = (select auth.uid()) then 'a' else 'b' end
    where id = p_match;
  end if;
end $$;

-- After 3 minutes of silence from the opponent, a player who has already moved this round may end the match.
create function public.claim_abandoned(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_seat text;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or (select auth.uid()) not in (m.player_a, m.player_b) then raise exception 'not your match'; end if;
  if m.status <> 'active' then raise exception 'match is not active'; end if;
  if m.last_move_at > now() - interval '3 minutes' then raise exception 'too soon'; end if;
  v_seat := case when m.player_a = (select auth.uid()) then 'a' else 'b' end;
  if not exists (select 1 from public.moves where match_id = p_match and round = m.current_round and seat = v_seat) then
    raise exception 'make your move first';
  end if;
  update public.matches set status = 'abandoned', finished_at = now(),
    abandoned_by = case v_seat when 'a' then 'b' else 'a' end
  where id = p_match;
end $$;

create function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.create_invite(text), public.join_invite(text), public.join_queue(),
  public.submit_move(uuid, text), public.forfeit(uuid), public.claim_abandoned(uuid),
  public.delete_my_account() from public, anon;
grant execute on function public.create_invite(text), public.join_invite(text), public.join_queue(),
  public.submit_move(uuid, text), public.forfeit(uuid), public.claim_abandoned(uuid),
  public.delete_my_account() to authenticated;

-- Live updates for the match screen and chat. RLS still decides who receives each change.
alter publication supabase_realtime add table public.matches, public.messages;
