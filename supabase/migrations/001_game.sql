-- Run once in the Supabase SQL editor. No service-role key is used by the app.
begin;
create table public.games (
 id uuid primary key default gen_random_uuid(), place text not null, area text not null,
 tag text not null default '', meeting text not null, starts_at timestamptz not null,
 team_capacity integer not null default 10 check(team_capacity between 1 and 10),
 winner text check(winner in ('Ruby','Sapphire')), ended_at timestamptz,
 check ((winner is null) = (ended_at is null))
);
create table public.memberships (
 game_id uuid references public.games on delete cascade, user_id uuid references auth.users on delete cascade,
 team text not null check(team in ('Ruby','Sapphire')), joined_at timestamptz not null default now(),
 primary key(game_id,user_id)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games on delete cascade,
 title text not null, description text not null, kind text not null, position integer not null,
 unique(game_id,position), unique(game_id,id)
);
create table public.completions (
 game_id uuid not null, task_id uuid not null, team text not null check(team in ('Ruby','Sapphire')),
 user_id uuid not null references auth.users, photo_path text not null unique,
 created_at timestamptz not null default now(), primary key(game_id,task_id,team),
 foreign key(game_id,task_id) references public.tasks(game_id,id) on delete cascade
);
create table public.messages (
 id bigint generated always as identity primary key, game_id uuid not null references public.games on delete cascade,
 team text not null check(team in ('Ruby','Sapphire')), user_id uuid not null references auth.users,
 name text not null, body text not null check(length(body) between 1 and 500), created_at timestamptz not null default now()
);
create index memberships_user on public.memberships(user_id);
create index messages_team on public.messages(game_id,team,id desc);
alter table public.games enable row level security;
alter table public.memberships enable row level security;
alter table public.tasks enable row level security;
alter table public.completions enable row level security;
alter table public.messages enable row level security;
-- All application reads/writes use narrow functions. Default table access is denied.
revoke all on public.games, public.memberships, public.tasks, public.completions, public.messages from anon, authenticated;

create function public.my_team(p_game uuid) returns text language sql stable security definer set search_path = '' as $$
 select team from public.memberships where game_id=p_game and user_id=auth.uid()
$$;

create function public.list_games() returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(row_to_json(g) order by g.starts_at),'[]'::jsonb) from (
 select g.*, (select count(*) from public.memberships m where m.game_id=g.id) as players,
 public.my_team(g.id) as team from public.games g
 ) g
$$;

create function public.join_game(p_game uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.games; chosen text; r integer; s integer;
begin
 if auth.uid() is null then raise exception 'Sign in to join a game' using errcode='42501'; end if;
 select * into g from public.games where id=p_game for update;
 if not found then raise exception 'Game not found' using errcode='P0002'; end if;
 chosen := public.my_team(p_game);
 if chosen is not null then return jsonb_build_object('team',chosen); end if;
 if g.winner is not null or now()>=g.starts_at then raise exception 'Registration has closed' using errcode='P0001'; end if;
 select count(*) filter(where team='Ruby'), count(*) filter(where team='Sapphire') into r,s from public.memberships where game_id=p_game;
 if r+s >= g.team_capacity*2 then raise exception 'This game is full' using errcode='P0001'; end if;
 chosen := case when r<s then 'Ruby' when s<r then 'Sapphire' when random()<0.5 then 'Ruby' else 'Sapphire' end;
 insert into public.memberships(game_id,user_id,team) values(p_game,auth.uid(),chosen);
 return jsonb_build_object('team',chosen);
end $$;

create function public.game_state(p_game uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g public.games; t text; n integer; result jsonb;
begin
 t := public.my_team(p_game);
 if t is null then raise exception 'Join this game to see your team' using errcode='42501'; end if;
 select * into g from public.games where id=p_game;
 select count(*) into n from public.tasks where game_id=p_game;
 result := to_jsonb(g) || jsonb_build_object('team',t,'players',(select count(*) from public.memberships where game_id=p_game),
 'started',now()>=g.starts_at,'server_time',now(),'task_count',n,
 'tasks',case when now()>=g.starts_at then (select coalesce(jsonb_agg(to_jsonb(x) order by x.position),'[]'::jsonb) from public.tasks x where game_id=p_game) else '[]'::jsonb end,
 'completions',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.completions c where c.game_id=p_game and c.team=t),
 'scores',jsonb_build_object('Ruby',(select count(*) from public.completions where game_id=p_game and team='Ruby'), 'Sapphire',(select count(*) from public.completions where game_id=p_game and team='Sapphire')),
 'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) from (select * from public.messages where game_id=p_game and team=t order by id desc limit 100) m));
 return result;
end $$;

create function public.send_message(p_game uuid,p_body text) returns void language plpgsql security definer set search_path = '' as $$
declare t text; display_name text;
begin
 t:=public.my_team(p_game);
 if t is null then raise exception 'Join this game first' using errcode='42501'; end if;
 if length(trim(p_body)) not between 1 and 500 then raise exception 'Message must be 1–500 characters' using errcode='22023'; end if;
 -- Serialize sends by this player to enforce the per-player cooldown.
 perform 1 from public.memberships where game_id=p_game and user_id=auth.uid() for update;
 if exists(select 1 from public.messages where game_id=p_game and user_id=auth.uid() and created_at>clock_timestamp()-interval '1 second') then
 raise exception 'Please wait a moment before sending again' using errcode='P0001'; end if;
 select left(coalesce(nullif(raw_user_meta_data->>'name',''),'Player'),50) into display_name from auth.users where id=auth.uid();
 insert into public.messages(game_id,team,user_id,name,body) values(p_game,t,auth.uid(),display_name,trim(p_body));
end $$;

-- Storage names: user_id/game_id/task_id/random_uuid.jpg. No overwrite/delete access.
create function public.can_upload_photo(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.games g join public.memberships m on m.game_id=g.id
 join public.tasks t on t.game_id=g.id
 where m.user_id=auth.uid() and split_part(p_name,'/',1)=auth.uid()::text
 and split_part(p_name,'/',2)=g.id::text and split_part(p_name,'/',3)=t.id::text
 and array_length(string_to_array(p_name,'/'),1)=4 and split_part(p_name,'/',4)<>''
 and now()>=g.starts_at and g.winner is null
 and not exists(select 1 from public.completions c where c.game_id=g.id and c.task_id=t.id and c.team=m.team))
$$;
create function public.can_read_photo(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.completions c join public.memberships m on m.game_id=c.game_id and m.team=c.team
 where c.photo_path=p_name and m.user_id=auth.uid())
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('evidence','evidence',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='evidence' and public.can_upload_photo(name));
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='evidence' and public.can_read_photo(name));

create function public.complete_task(p_game uuid,p_task uuid,p_photo text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.games; t text; object_found boolean;
begin
 t:=public.my_team(p_game);
 if t is null then raise exception 'Join this game first' using errcode='42501'; end if;
 select * into g from public.games where id=p_game for update;
 if not exists(select 1 from public.tasks where game_id=p_game and id=p_task) then raise exception 'Task not found' using errcode='P0002'; end if;
 -- Safe retries, including after the final task has won the game.
 if exists(select 1 from public.completions where game_id=p_game and task_id=p_task and team=t) then return public.game_state(p_game); end if;
 if now()<g.starts_at then raise exception 'The game has not started' using errcode='P0001'; end if;
 if g.winner is not null then raise exception 'The game has ended' using errcode='P0001'; end if;
 if split_part(p_photo,'/',1)<>auth.uid()::text or split_part(p_photo,'/',2)<>p_game::text or split_part(p_photo,'/',3)<>p_task::text then
 raise exception 'Photo does not belong to this submission' using errcode='42501'; end if;
 select exists(select 1 from storage.objects where bucket_id='evidence' and name=p_photo) into object_found;
 if not object_found then raise exception 'Upload a photo before completing this task' using errcode='22023'; end if;
 insert into public.completions(game_id,task_id,team,user_id,photo_path) values(p_game,p_task,t,auth.uid(),p_photo);
 if not exists(select 1 from public.tasks x where x.game_id=p_game and not exists(select 1 from public.completions c where c.game_id=p_game and c.task_id=x.id and c.team=t)) then
 update public.games set winner=t,ended_at=clock_timestamp() where id=p_game;
 end if;
 return public.game_state(p_game);
end $$;

revoke all on function public.my_team(uuid),public.list_games(),public.join_game(uuid),public.game_state(uuid),public.send_message(uuid,text),public.can_upload_photo(text),public.can_read_photo(text),public.complete_task(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.list_games() to anon,authenticated;
grant execute on function public.join_game(uuid),public.game_state(uuid),public.send_message(uuid,text),public.can_upload_photo(text),public.can_read_photo(text),public.complete_task(uuid,uuid,text) to authenticated;
commit;
