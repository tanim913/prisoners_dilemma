-- Security test for the game schema. Run the whole file in ONE execute_sql call (or psql):
-- it rolls back, so nothing is kept. Any failed expectation raises; reaching the end means it passed.
begin;

create function pg_temp.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" from: %', p_msg, p_sql using errcode = 'P0099';
exception
  when sqlstate 'P0099' then raise;
  when others then
    if sqlerrm not ilike '%' || p_msg || '%' then
      raise exception 'expected "%" from: %, got "%"', p_msg, p_sql, sqlerrm;
    end if;
end $$;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000000' || p || '"}', true);
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.invalid', '{"full_name":"Ada"}'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.invalid', '{"name":"Bo"}'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.invalid', '{}');

do $$ begin
  if (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') <> 'Bo'
    then raise exception 'profile not created from Google name'; end if;
end $$;

-- anon sees nothing
set local role anon;
select pg_temp.expect_error('select * from public.matches', 'permission denied');
select pg_temp.expect_error('select * from public.profiles', 'permission denied');
select pg_temp.expect_error('select public.join_queue()', 'permission denied');
reset role;

-- 1. A makes an invite, C cannot see it, B joins it
set local role authenticated;
select pg_temp.as_user('a');
select set_config('test.match', (select (public.create_invite('standard')).id::text), true);
select set_config('test.code', (select invite_code from public.matches where id = current_setting('test.match')::uuid), true);
select pg_temp.as_user('c');
do $$ begin
  if exists (select 1 from public.matches) then raise exception 'outsider sees a match'; end if;
end $$;
select pg_temp.as_user('a');
select pg_temp.expect_error(format('select public.join_invite(%L)', current_setting('test.code')), 'invite not found');
select pg_temp.as_user('b');
select public.join_invite(lower(current_setting('test.code')));
select pg_temp.expect_error(format('select public.join_invite(%L)', current_setting('test.code')), 'invite not found');

-- 2. A moves first; B must not see that move, the secret length, or write moves directly
select pg_temp.as_user('a');
select public.submit_move(current_setting('test.match')::uuid, 'C');
select pg_temp.expect_error(format('select public.submit_move(%L, ''D'')', current_setting('test.match')), 'already moved');
do $$ begin
  if (select count(*) from public.moves) <> 1 then raise exception 'A should see own pending move'; end if;
end $$;
select pg_temp.as_user('b');
do $$ begin
  if exists (select 1 from public.moves) then raise exception 'B sees the open move of A'; end if;
end $$;
select pg_temp.expect_error('select * from public.match_secrets', 'permission denied');
select pg_temp.expect_error(format('insert into public.moves (match_id, round, seat, move) values (%L, 1, ''b'', ''C'')', current_setting('test.match')), 'permission denied');
select pg_temp.expect_error(format('update public.matches set score_b = 99 where id = %L', current_setting('test.match')), 'permission denied');
select pg_temp.expect_error(format('select public.submit_move(%L, ''X'')', current_setting('test.match')), 'bad move');

-- 3. B moves; the round resolves and both see it
select public.submit_move(current_setting('test.match')::uuid, 'D');
do $$ begin
  if (select count(*) from public.moves) <> 2 then raise exception 'B should see the resolved round'; end if;
  if (select (score_a, score_b, current_round) from public.matches) is distinct from (0, 5, 2)
    then raise exception 'wrong score after C vs D'; end if;
end $$;

-- 4. chat: participants only, no spoofed sender
select pg_temp.as_user('a');
insert into public.messages (match_id, body) values (current_setting('test.match')::uuid, 'Hello');
select pg_temp.expect_error(format('insert into public.messages (match_id, body) values (%L, ''   '')', current_setting('test.match')), 'check constraint');
select pg_temp.expect_error(format('insert into public.messages (match_id, sender, body) values (%L, ''00000000-0000-0000-0000-00000000000b'', ''fake'')', current_setting('test.match')), 'permission denied');
select pg_temp.as_user('b');
do $$ begin
  if (select count(*) from public.messages) <> 1 then raise exception 'B should read the chat'; end if;
end $$;
select pg_temp.as_user('c');
do $$ begin
  if exists (select 1 from public.messages) then raise exception 'outsider reads chat'; end if;
end $$;
select pg_temp.expect_error(format('insert into public.messages (match_id, body) values (%L, ''hi'')', current_setting('test.match')), 'row-level security');
select pg_temp.expect_error(format('select public.submit_move(%L, ''C'')', current_setting('test.match')), 'not your match');
select pg_temp.expect_error(format('select public.forfeit(%L)', current_setting('test.match')), 'not your match');

-- 5. play to the end; the hidden length falls inside the announced range
select pg_temp.as_user('a');
do $$
declare i int := 0;
begin
  while (select status from public.matches where id = current_setting('test.match')::uuid) is not distinct from 'active' loop
    perform pg_temp.as_user('a');
    perform public.submit_move(current_setting('test.match')::uuid, 'C');
    perform pg_temp.as_user('b');
    perform public.submit_move(current_setting('test.match')::uuid, 'C');
    i := i + 1;
    if i > 100 then raise exception 'match never ended'; end if;
  end loop;
  if i = 0 then raise exception 'loop did not run'; end if;
  if coalesce((select current_round - 1 from public.matches where id = current_setting('test.match')::uuid), 0) not between 10 and 16
    then raise exception 'length outside 10 to 16'; end if;
  if (select count(*) from public.moves) is distinct from 2 * (select current_round - 1 from public.matches)
    then raise exception 'finished match should show every move'; end if;
end $$;
select pg_temp.expect_error(format('select public.submit_move(%L, ''C'')', current_setting('test.match')), 'not active');

-- 5b. reputation is kept by the server: A cooperated every round, B defected once
do $$
declare n int := (select current_round - 1 from public.matches where id = current_setting('test.match')::uuid);
begin
  if (select (trust, trust_rounds) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') is distinct from (1::real, n)
    then raise exception 'trust for A is wrong'; end if;
  if (select abs(trust - (n - 1)::real / n) > 0.001 from public.profiles where id = '00000000-0000-0000-0000-00000000000b')
    then raise exception 'trust for B is wrong'; end if;
end $$;
select pg_temp.expect_error('update public.profiles set trust = 1', 'permission denied');
select pg_temp.expect_error('select public.refresh_trust(array[auth.uid()])', 'permission denied');

-- 5c. shaky hands: a slip is visible to the one who slipped, never to the opponent
select pg_temp.expect_error('select public.create_invite(''short'')', 'unknown length');
do $$ begin
  if not (select (public.create_invite('standard', true)).noise) then raise exception 'noise not set on invite'; end if;
end $$;
reset role;
insert into public.slips values (current_setting('test.match')::uuid, 1, 'a');
set local role authenticated;
select pg_temp.as_user('a');
do $$ begin
  if (select count(*) from public.slips) <> 1 then raise exception 'A should see own slip'; end if;
end $$;
select pg_temp.as_user('b');
do $$ begin
  if exists (select 1 from public.slips) then raise exception 'B sees the slip of A'; end if;
end $$;

-- 6. queue: a waiting player keeps one seat, the next player joins it, a third waits
select pg_temp.as_user('a');
select set_config('test.q', (select (public.join_queue()).id::text), true);
do $$ begin
  if (select (public.join_queue()).id) <> current_setting('test.q')::uuid then raise exception 'queue made a second seat'; end if;
  if (select status from public.matches where id = current_setting('test.q')::uuid) <> 'waiting' then raise exception 'should wait'; end if;
end $$;
select pg_temp.as_user('b');
do $$ begin
  if (select (public.join_queue()).id) <> current_setting('test.q')::uuid then raise exception 'B was not paired with A'; end if;
end $$;
select pg_temp.as_user('c');
do $$ begin
  if (select (public.join_queue()).status) <> 'waiting' then raise exception 'C should wait alone'; end if;
end $$;

-- 7. leaving: too soon to claim, a forfeit is recorded against the leaver
select pg_temp.as_user('a');
select public.submit_move(current_setting('test.q')::uuid, 'C');
select pg_temp.expect_error(format('select public.claim_abandoned(%L)', current_setting('test.q')), 'too soon');
select pg_temp.as_user('b');
select public.forfeit(current_setting('test.q')::uuid);
do $$ begin
  if (select (status, abandoned_by) from public.matches where id = current_setting('test.q')::uuid) is distinct from ('abandoned'::text, 'b'::text)
    then raise exception 'forfeit not recorded'; end if;
end $$;

-- 8. solo history is private; bad move strings are rejected
select pg_temp.as_user('a');
insert into public.solo_games (strategy, my_moves, their_moves) values ('tft', 'CCD', 'CDD');
select pg_temp.expect_error('insert into public.solo_games (strategy, my_moves, their_moves) values (''tft'', ''CCX'', ''CDD'')', 'check constraint');
select pg_temp.expect_error('insert into public.solo_games (user_id, strategy, my_moves, their_moves) values (''00000000-0000-0000-0000-00000000000b'', ''tft'', ''C'', ''C'')', 'permission denied');
select pg_temp.as_user('b');
do $$ begin
  if exists (select 1 from public.solo_games) then raise exception 'B sees solo games of A'; end if;
end $$;

-- 9. profiles: everyone reads, only the owner edits, and only some columns
do $$ begin
  if (select count(*) from public.profiles) < 3 then raise exception 'profiles should be readable'; end if;
  update public.profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000a';
  if (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'Ada'
    then raise exception 'B edited the profile of A'; end if;
end $$;
select pg_temp.expect_error('update public.profiles set avatar_url = ''x''', 'permission denied');

-- 10. deleting an account keeps the opponent's history
select pg_temp.as_user('b');
select public.delete_my_account();
reset role;
do $$ begin
  if (select count(*) from public.matches where id = current_setting('test.match')::uuid and player_b is null) <> 1
    then raise exception 'match history lost on account delete'; end if;
end $$;

rollback;
select 'all RLS checks passed' as result;
