-- Harder play without changing the payoffs:
--   shaky hands: an invite can ask for 1 move in 20 to come out the other way;
--   reputation: the server keeps each player's cooperation rate against people, so nobody can forge it;
--   no more short matches.

alter table public.matches add column noise boolean not null default false;

-- Written only by submit_move. Not in the profiles update grant, so a player can't edit it.
alter table public.profiles
  add column trust real check (trust between 0 and 1),
  add column trust_rounds int not null default 0;

-- Which of your moves slipped. You can see your own slips; your opponent never can,
-- so to them a slip looks exactly like a choice.
create table public.slips (
  match_id uuid not null references public.matches(id) on delete cascade,
  round int not null,
  seat text not null check (seat in ('a', 'b')),
  primary key (match_id, round, seat)
);
alter table public.slips enable row level security;
create policy slips_select on public.slips for select to authenticated using (
  exists (
    select 1 from public.matches m
    where m.id = match_id
      and ((m.player_a = (select auth.uid()) and seat = 'a') or (m.player_b = (select auth.uid()) and seat = 'b'))
  )
);
revoke all on public.slips from anon, authenticated;
grant select on public.slips to authenticated;

-- Solo games mark a slipped move in lower case: 'c' means you cooperated, though you chose to defect.
alter table public.solo_games drop constraint solo_games_my_moves_check;
alter table public.solo_games add constraint solo_games_my_moves_check check (my_moves ~ '^[CDcd]{1,200}$');

drop function public.create_invite(text);
drop function public.new_match(boolean, text);

-- Creates a waiting match and draws its secret length. Lengths: standard 10-16, long 20-30.
create function public.new_match(p_public boolean, p_length text, p_noise boolean) returns public.matches
language plpgsql security definer set search_path = '' as $$
declare
  v_min int; v_max int; v_code text; v_row public.matches;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  select r[1], r[2] into v_min, v_max from (select case p_length
    when 'standard' then array[10, 16] when 'long' then array[20, 30] end as r) x;
  if v_min is null then raise exception 'unknown length'; end if;

  loop
    v_code := case when p_public then null else (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 6)) end;
    begin
      insert into public.matches (invite_code, is_public, player_a, round_min, round_max, noise)
      values (v_code, p_public, (select auth.uid()), v_min, v_max, coalesce(p_noise, false)) returning * into v_row;
      exit;
    exception when unique_violation then
      -- invite code collision, draw another
    end;
  end loop;

  insert into public.match_secrets values (v_row.id, v_min + floor(random() * (v_max - v_min + 1))::int);
  return v_row;
end $$;
revoke execute on function public.new_match(boolean, text, boolean) from public, anon, authenticated;

create function public.create_invite(p_length text default 'standard', p_noise boolean default false) returns public.matches
language sql security definer set search_path = '' as $$
  select public.new_match(false, p_length, p_noise);
$$;
revoke execute on function public.create_invite(text, boolean) from public, anon;
grant execute on function public.create_invite(text, boolean) to authenticated;

create or replace function public.join_queue() returns public.matches
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

  return public.new_match(true, 'standard', false);
end $$;

create or replace function public.submit_move(p_match uuid, p_move text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches; v_seat text; v_a text; v_b text; v_total int; v_slip boolean;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or (select auth.uid()) not in (m.player_a, m.player_b) then raise exception 'not your match'; end if;
  if m.status <> 'active' then raise exception 'match is not active'; end if;
  if p_move not in ('C', 'D') then raise exception 'bad move'; end if;

  v_seat := case when m.player_a = (select auth.uid()) then 'a' else 'b' end;
  v_slip := m.noise and random() < 0.05;

  begin
    insert into public.moves (match_id, round, seat, move)
    values (p_match, m.current_round, v_seat, case when v_slip then translate(p_move, 'CD', 'DC') else p_move end);
  exception when unique_violation then
    raise exception 'already moved this round';
  end;
  if v_slip then insert into public.slips values (p_match, m.current_round, v_seat); end if;

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

  if m.current_round >= v_total then
    perform public.refresh_trust(array[m.player_a, m.player_b]);
  end if;
end $$;

-- A player's cooperation rate over every move they've made against a person, as the other side saw it.
create function public.refresh_trust(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.profiles p set (trust, trust_rounds) = (
    select avg((mv.move = 'C')::int)::real, count(*)::int
    from public.moves mv join public.matches mm on mm.id = mv.match_id
    where (mm.player_a = p.id and mv.seat = 'a') or (mm.player_b = p.id and mv.seat = 'b')
  )
  where p.id = any(p_ids);
$$;
revoke execute on function public.refresh_trust(uuid[]) from public, anon, authenticated;

select public.refresh_trust(array(select id from public.profiles));
