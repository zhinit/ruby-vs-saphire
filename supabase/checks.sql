-- Run in the SQL editor AFTER 001_game.sql. All fixtures roll back.
-- Exercises the real SQL functions using simulated JWT subject claims.
begin;
insert into auth.users(id,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','{"name":"Test One"}'),
 ('10000000-0000-0000-0000-000000000002','{"name":"Test Two"}'),
 ('10000000-0000-0000-0000-000000000003','{"name":"Test Three"}');
insert into public.games(id,place,area,meeting,starts_at,team_capacity) values
 ('20000000-0000-0000-0000-000000000001','Test park','Test area','Test fountain',now()+interval '1 hour',1);
insert into public.tasks(id,game_id,title,description,kind,position) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Test task','Test description','TEST',1);
do $$
declare g uuid:='20000000-0000-0000-0000-000000000001'; task uuid:='30000000-0000-0000-0000-000000000001'; a text; b text; photo text; s jsonb;
begin
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 a:=public.join_game(g)->>'team';
 assert public.join_game(g)->>'team'=a, 'A retry must retain the assigned team';
 assert (select count(*) from public.memberships where game_id=g)=1, 'No duplicate registration';
 s:=public.game_state(g);
 assert s->'tasks'='[]'::jsonb, 'Tasks must not leak before start';
 photo:='10000000-0000-0000-0000-000000000001/'||g||'/'||task||'/test.jpg';
 assert not public.can_upload_photo(photo), 'No uploads before start';
 begin
 perform public.complete_task(g,task,photo);
 raise exception 'FAIL: pre-start completion accepted';
 exception when sqlstate 'P0001' then
 if sqlerrm='FAIL: pre-start completion accepted' then raise; end if;
 end;
 perform public.send_message(g,'Hello team');
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
 b:=public.join_game(g)->>'team';
 assert a<>b, 'Teams must be balanced';
 assert public.game_state(g)->'messages'='[]'::jsonb, 'Rival chat must be private';
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
 begin
 perform public.join_game(g);
 raise exception 'FAIL: capacity exceeded';
 exception when sqlstate 'P0001' then
 if sqlerrm='FAIL: capacity exceeded' then raise; end if;
 end;
 begin
 perform public.game_state(g);
 raise exception 'FAIL: outsider accessed game';
 exception when insufficient_privilege then null;
 end;
 update public.games set starts_at=now()-interval '1 minute' where id=g;
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 assert public.can_upload_photo(photo), 'A member can upload during a live game';
 begin
 perform public.complete_task(g,task,photo);
 raise exception 'FAIL: missing evidence accepted';
 exception when invalid_parameter_value then null;
 end;
 insert into storage.objects(bucket_id,name) values('evidence',photo);
 s:=public.complete_task(g,task,photo);
 assert s->>'winner'=a, 'Finishing all tasks wins';
 assert public.complete_task(g,task,photo)->>'winner'=a, 'Winning submission is retry-safe';
 assert public.can_read_photo(photo), 'Own team can view evidence';
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
 assert not public.can_read_photo(photo), 'Other team cannot view private evidence';
 assert public.game_state(g)->>'winner'=a, 'Both teams see the same winner';
 begin
 perform public.complete_task(g,task,'10000000-0000-0000-0000-000000000002/'||g||'/'||task||'/other.jpg');
 raise exception 'FAIL: completion after game ended accepted';
 exception when sqlstate 'P0001' then
 if sqlerrm='FAIL: completion after game ended accepted' then raise; end if;
 end;
 assert not has_table_privilege('authenticated','public.tasks','SELECT'), 'Cannot bypass RPC to read locked tasks';
 assert not has_table_privilege('authenticated','public.memberships','INSERT'), 'Cannot choose own team via table insert';
 raise notice 'All game SQL checks passed';
end $$;
rollback;
