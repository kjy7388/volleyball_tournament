-- Review in Supabase SQL Editor before running. No application data is seeded here.
-- Dedicated names; abort rather than repurpose an incompatible pre-existing table.
begin;
create schema if not exists volleyball_private;
revoke all on schema volleyball_private from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

create table if not exists public.tournaments (
  id text primary key check (id = 'volleyball-cup'),
  name text not null check (length(btrim(name)) between 1 and 80),
  start_date date, end_date date,
  status text not null check (status in ('upcoming','ongoing','completed')),
  set_rules jsonb not null,
  locations jsonb not null,
  manual_rankings jsonb not null default '{"A":[],"B":[]}',
  schema_version integer not null default 1 check (schema_version = 1),
  revision bigint not null default 0 check (revision >= 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (jsonb_typeof(set_rules) = 'array' and jsonb_array_length(set_rules) = 5),
  check (jsonb_typeof(locations) = 'object' and jsonb_typeof(manual_rankings) = 'object')
);
create table if not exists public.teams (
  id text not null, tournament_id text not null references public.tournaments(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 30),
  group_name text not null check (group_name in ('A','B')),
  group_slot smallint not null check (group_slot between 1 and 3),
  display_order smallint not null check (display_order between 1 and 6),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tournament_id,id),
  unique (tournament_id,name) deferrable initially deferred,
  unique (tournament_id,group_name,group_slot) deferrable initially deferred,
  unique (tournament_id,display_order) deferrable initially deferred
);
create table if not exists public.players (
  id text not null, tournament_id text not null, team_id text not null,
  name text not null check (length(btrim(name)) between 1 and 40),
  display_order integer not null check (display_order >= 1),
  created_at timestamptz not null default now(),
  primary key (tournament_id,id),
  foreign key (tournament_id,team_id) references public.teams(tournament_id,id) on delete restrict
);
create table if not exists public.matches (
  id text not null, tournament_id text not null references public.tournaments(id) on delete restrict,
  number smallint not null check (number between 1 and 9),
  stage text not null check (stage in ('group','semifinal','final')),
  group_name text check (group_name in ('A','B')),
  home_team_id text, away_team_id text, winner_team_id text,
  scheduled_at timestamptz, example_date text not null default '', location text not null default '',
  status text not null check (status in ('scheduled','live','completed')),
  rules_snapshot jsonb, confirmed_at timestamptz, result_updated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tournament_id,id), unique (tournament_id,number),
  foreign key (tournament_id,home_team_id) references public.teams(tournament_id,id) on delete restrict,
  foreign key (tournament_id,away_team_id) references public.teams(tournament_id,id) on delete restrict,
  foreign key (tournament_id,winner_team_id) references public.teams(tournament_id,id) on delete restrict,
  check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id),
  check ((stage = 'group' and group_name is not null) or (stage <> 'group' and group_name is null)),
  check ((status = 'completed' and winner_team_id is not null and confirmed_at is not null and home_team_id is not null and away_team_id is not null and winner_team_id in (home_team_id,away_team_id)) or (status <> 'completed' and winner_team_id is null and confirmed_at is null)),
  check (status = 'scheduled' or (home_team_id is not null and away_team_id is not null))
);
create unique index if not exists volleyball_unique_group_pair on public.matches(tournament_id,group_name,least(home_team_id,away_team_id),greatest(home_team_id,away_team_id)) where stage = 'group';
create table if not exists public.match_sets (
  id bigint generated always as identity primary key,
  tournament_id text not null, match_id text not null,
  set_number smallint not null check (set_number between 1 and 5),
  home_score integer check (home_score between 0 and 9999),
  away_score integer check (away_score between 0 and 9999),
  unique (tournament_id,match_id,set_number),
  foreign key (tournament_id,match_id) references public.matches(tournament_id,id) on delete restrict
);
create table if not exists public.tournament_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists volleyball_private.tournament_history (
  tournament_id text not null, revision bigint not null, payload jsonb not null,
  actor_id uuid, archived_at timestamptz not null default now(),
  primary key(tournament_id,revision)
);
alter table volleyball_private.tournament_history enable row level security;
create index if not exists volleyball_players_team on public.players(tournament_id,team_id);
create index if not exists volleyball_matches_stage on public.matches(tournament_id,stage,scheduled_at);

-- No argument: only the JWT subject can be checked. Never expose the admin list.
create or replace function public.is_tournament_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.tournament_admins where user_id = auth.uid());
$$;
revoke all on function public.is_tournament_admin() from public, anon, authenticated;
grant execute on function public.is_tournament_admin() to authenticated;

do $policy$
declare table_name text;
begin
  foreach table_name in array array['tournaments','teams','players','matches','match_sets','tournament_admins'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    if table_name <> 'tournament_admins' then
      execute format('grant select on table public.%I to anon, authenticated', table_name);
      if not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=table_name and p.policyname='volleyball_public_read') then
        execute format('create policy volleyball_public_read on public.%I for select to anon, authenticated using (true)', table_name);
      end if;
    end if;
  end loop;
end $policy$;
-- There are deliberately no client table DML grants or admin-list policies.
-- All admin changes go through the checked, atomic save_tournament RPC below.

create or replace function public.get_public_tournament(p_id text default 'volleyball-cup') returns jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('schemaVersion',t.schema_version,'revision',t.revision,'isDemo',t.is_demo,'manualRankings',t.manual_rankings,
   'tournament',jsonb_build_object('id',t.id,'name',t.name,'startDate',coalesce(t.start_date::text,''),'endDate',coalesce(t.end_date::text,''),'status',t.status,'setRules',t.set_rules,'locations',t.locations),
   'teams',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'group',x.group_name,'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'teamId',p.team_id,'name',p.name) order by p.display_order) from public.players p where p.tournament_id=x.tournament_id and p.team_id=x.id),'[]'::jsonb)) order by x.display_order) from public.teams x where x.tournament_id=t.id),'[]'::jsonb),
   'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'number',m.number,'stage',m.stage,'group',m.group_name,'homeTeamId',m.home_team_id,'awayTeamId',m.away_team_id,'winnerTeamId',m.winner_team_id,'scheduledAt',coalesce(to_char(m.scheduled_at at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI'),''),'exampleDate',m.example_date,'location',m.location,'status',m.status,'rulesSnapshot',m.rules_snapshot,'confirmedAt',m.confirmed_at,'updatedAt',m.result_updated_at,'sets',coalesce((select jsonb_agg(jsonb_build_object('home',coalesce(to_jsonb(s.home_score),'""'::jsonb),'away',coalesce(to_jsonb(s.away_score),'""'::jsonb)) order by s.set_number) from public.match_sets s where s.tournament_id=m.tournament_id and s.match_id=m.id),'[]'::jsonb)) order by m.number) from public.matches m where m.tournament_id=t.id),'[]'::jsonb))
 from public.tournaments t where t.id=p_id;
$$;
revoke all on function public.get_public_tournament(text) from public, anon, authenticated;
grant execute on function public.get_public_tournament(text) to anon, authenticated;

-- Same termination rules as src/utils/matchRules.js. Drafts can be incomplete,
-- but no score may occur after a team has won three valid sets.
create or replace function volleyball_private.score_result(sets jsonb,rules jsonb,strict boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare s jsonb; h integer; a integer; target integer; hw integer:=0; aw integer:=0; i integer:=0; gap boolean:=false; invalid boolean:=false; valid_set boolean;
begin
 if jsonb_typeof(sets) is distinct from 'array' or jsonb_array_length(sets)<>5 or jsonb_typeof(rules) is distinct from 'array' or jsonb_array_length(rules)<>5 then raise exception 'INVALID_SET_STRUCTURE'; end if;
 for s in select value from jsonb_array_elements(sets) loop
   i:=i+1; h:=null; a:=null;
   if s->>'home' is not null and s->>'home'<>'' then
     if jsonb_typeof(s->'home')<>'number' or s->>'home' !~ '^[0-9]+$' or (s->>'home')::numeric>9999 then raise exception 'INVALID_SCORE'; end if;
     h:=(s->>'home')::integer;
   end if;
   if s->>'away' is not null and s->>'away'<>'' then
     if jsonb_typeof(s->'away')<>'number' or s->>'away' !~ '^[0-9]+$' or (s->>'away')::numeric>9999 then raise exception 'INVALID_SCORE'; end if;
     a:=(s->>'away')::integer;
   end if;
   if h is null and a is null then gap:=true; continue; end if;
   if hw=3 or aw=3 then raise exception 'SCORE_AFTER_WIN'; end if;
   target:=(rules->>(i-1))::integer;
   valid_set:=h is not null and a is not null and h<>a and greatest(h,a)>=target and abs(h-a)>=2 and (greatest(h,a)=target or abs(h-a)=2);
   if gap or not valid_set then invalid:=true; end if;
   if valid_set then if h>a then hw:=hw+1; else aw:=aw+1; end if; end if;
 end loop;
 if strict and (invalid or (hw<>3 and aw<>3)) then raise exception 'INVALID_FINAL_SCORE'; end if;
 return jsonb_build_object('homeWins',hw,'awayWins',aw,'complete',not invalid and (hw=3 or aw=3));
end $$;

-- Primary metrics -> head-to-head among primary tied teams -> manual order only
-- inside remaining tied clusters. All six group matches must finish before seeding.
create or replace function volleyball_private.group_rank(d jsonb,g text) returns jsonb
language sql immutable set search_path = '' as $$
 with tm as (select value->>'id' id from jsonb_array_elements(d->'teams') where value->>'group'=g),
 gm as (select value m from jsonb_array_elements(d->'matches') where value->>'stage'='group' and value->>'group'=g and value->>'status'='completed'),
 contributions as (
   select tm.id,m,case when m->>'winnerTeamId'=tm.id then 1 else 0 end wins,
     case when m->>'homeTeamId'=tm.id then 1 else -1 end side
   from tm join gm on tm.id in (m->>'homeTeamId',m->>'awayTeamId')
 ), stats as (
   select tm.id,coalesce(sum(c.wins),0) wins,
     coalesce(sum(c.side*(select count(*) filter(where (s->>'home')::integer>(s->>'away')::integer)-count(*) filter(where (s->>'home')::integer<(s->>'away')::integer) from jsonb_array_elements(c.m->'sets') s where s->>'home'<>'' and s->>'away'<>'')),0) sd,
     coalesce(sum(c.side*(select sum((s->>'home')::integer-(s->>'away')::integer) from jsonb_array_elements(c.m->'sets') s where s->>'home'<>'' and s->>'away'<>'')),0) pd
   from tm left join contributions c on c.id=tm.id group by tm.id
 ), heads as (
   select a.*,(select count(*) from stats b join gm on m->>'winnerTeamId'=a.id and b.id in (m->>'homeTeamId',m->>'awayTeamId') where b.id<>a.id and (a.wins,a.sd,a.pd)=(b.wins,b.sd,b.pd)) hw,
     (select ordinality from jsonb_array_elements_text(d->'manualRankings'->g) with ordinality where value=a.id) manual
   from stats a
 ), ranked as (select *,count(*) over(partition by wins,sd,pd,hw) tied from heads)
 select jsonb_build_object('resolved',(select count(*) from gm)=3 and count(*)=3 and not coalesce(bool_or(tied>1 and manual is null),false),
 'ids',coalesce(jsonb_agg(id order by wins desc,sd desc,pd desc,hw desc,manual nulls last,id),'[]'::jsonb)) from ranked;
$$;

create or replace function volleyball_private.validate_snapshot(d jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare t jsonb:=d->'tournament'; x jsonb; m jsonb; s jsonb; r jsonb; g text; a jsonb; b jsonb; sf1 jsonb; sf2 jsonb; f jsonb; h text; w text; expected_status text;
begin
 if (d->>'schemaVersion')::integer is distinct from 1 or t->>'id' is distinct from 'volleyball-cup' or jsonb_typeof(d->'teams') is distinct from 'array' or jsonb_array_length(d->'teams')<>6 or jsonb_typeof(d->'matches') is distinct from 'array' or jsonb_array_length(d->'matches')<>9 then raise exception 'INVALID_SNAPSHOT'; end if;
 if length(btrim(t->>'name')) not between 1 and 80 or t->>'name' is null or jsonb_typeof(t->'locations') is distinct from 'object' or jsonb_typeof(d->'isDemo') is distinct from 'boolean' then raise exception 'INVALID_TOURNAMENT'; end if;
 if jsonb_typeof(t->'setRules') is distinct from 'array' or jsonb_array_length(t->'setRules')<>5 then raise exception 'INVALID_RULES'; end if;
 for x in select value from jsonb_array_elements(t->'setRules') loop
   if jsonb_typeof(x)<>'number' or x::text !~ '^[0-9]+$' or x::numeric not between 2 and 999 then raise exception 'INVALID_RULES'; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(d->'teams'))<>6 or (select count(distinct btrim(value->>'name')) from jsonb_array_elements(d->'teams'))<>6 then raise exception 'DUPLICATE_TEAM'; end if;
 foreach g in array array['A','B'] loop
   if (select count(*) from jsonb_array_elements(d->'teams') where value->>'group'=g)<>3 then raise exception 'GROUP_MUST_HAVE_THREE'; end if;
   if jsonb_typeof(d->'manualRankings'->g) is distinct from 'array' then raise exception 'INVALID_MANUAL_RANKING'; end if;
   if jsonb_array_length(d->'manualRankings'->g)<>0 and (jsonb_array_length(d->'manualRankings'->g)<>3 or (select count(distinct value) from jsonb_array_elements_text(d->'manualRankings'->g))<>3 or exists(select 1 from jsonb_array_elements_text(d->'manualRankings'->g) r where not exists(select 1 from jsonb_array_elements(d->'teams') tm where tm->>'id'=r.value and tm->>'group'=g))) then raise exception 'INVALID_MANUAL_RANKING'; end if;
 end loop;
 for x in select value from jsonb_array_elements(d->'teams') loop
   if length(x->>'id') not between 1 and 100 or x->>'id' is null or x->>'name' is null or length(btrim(x->>'name')) not between 1 and 30 or jsonb_typeof(x->'players') is distinct from 'array' or jsonb_array_length(x->'players')>100 then raise exception 'INVALID_TEAM'; end if;
   for s in select value from jsonb_array_elements(x->'players') loop
     if s->>'id' is null or length(s->>'id') not between 1 and 100 or s->>'teamId' is distinct from x->>'id' or s->>'name' is null or length(btrim(s->>'name')) not between 1 and 40 then raise exception 'INVALID_PLAYER'; end if;
   end loop;
 end loop;
 if (select count(*)<>count(distinct p->>'id') from jsonb_array_elements(d->'teams') tm cross join lateral jsonb_array_elements(tm->'players') p) then raise exception 'DUPLICATE_PLAYER'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(d->'matches'))<>9 then raise exception 'DUPLICATE_MATCH'; end if;
 for m in select value from jsonb_array_elements(d->'matches') loop
   if m->>'id' not in ('g-A-1','g-A-2','g-A-3','g-B-1','g-B-2','g-B-3','sf-1','sf-2','final') or m->>'id' is null or m->>'status' not in ('scheduled','live','completed') or m->>'status' is null then raise exception 'INVALID_MATCH'; end if;
   if (m->>'number')::integer is distinct from (case m->>'id' when 'g-A-1' then 1 when 'g-A-2' then 2 when 'g-A-3' then 3 when 'g-B-1' then 4 when 'g-B-2' then 5 when 'g-B-3' then 6 when 'sf-1' then 7 when 'sf-2' then 8 else 9 end) then raise exception 'INVALID_MATCH_NUMBER'; end if;
   if m->>'stage' is distinct from (case when m->>'id' like 'g-%' then 'group' when m->>'id' like 'sf-%' then 'semifinal' else 'final' end) then raise exception 'INVALID_STAGE'; end if;
   if m->>'stage'='group' then
     if m->>'group' is distinct from substring(m->>'id',3,1) or m->>'homeTeamId' is null or m->>'awayTeamId' is null or (select count(*) from jsonb_array_elements(d->'teams') tm where tm->>'group'=m->>'group' and tm->>'id' in (m->>'homeTeamId',m->>'awayTeamId'))<>2 then raise exception 'INVALID_GROUP_PAIR'; end if;
   elsif m->>'group' is not null then raise exception 'INVALID_GROUP'; end if;
   if m->>'homeTeamId' is not null and m->>'homeTeamId'=m->>'awayTeamId' then raise exception 'SAME_TEAM'; end if;
   if exists(select 1 from (values(m->>'homeTeamId'),(m->>'awayTeamId')) ids(id) where id is not null and not exists(select 1 from jsonb_array_elements(d->'teams') tm where tm->>'id'=ids.id)) then raise exception 'UNKNOWN_TEAM'; end if;
   if jsonb_typeof(m->'sets') is distinct from 'array' or jsonb_array_length(m->'sets')<>5 then raise exception 'INVALID_SETS'; end if;
   s:=coalesce(nullif(m->'rulesSnapshot','null'::jsonb),t->'setRules');
   if jsonb_typeof(s)<>'array' or jsonb_array_length(s)<>5 or exists(select 1 from jsonb_array_elements(s) v where jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' or v::numeric not between 2 and 999) then raise exception 'INVALID_RULE_SNAPSHOT'; end if;
   r:=volleyball_private.score_result(m->'sets',s,m->>'status'='completed');
   if m->>'status'='completed' then
     if m->>'winnerTeamId' is distinct from (case when (r->>'homeWins')::integer=3 then m->>'homeTeamId' else m->>'awayTeamId' end) or m->>'confirmedAt' is null then raise exception 'INVALID_WINNER'; end if;
   elsif m->>'winnerTeamId' is not null or m->>'confirmedAt' is not null then raise exception 'UNCONFIRMED_WINNER'; end if;
   if m->>'status'<>'scheduled' and (m->>'homeTeamId' is null or m->>'awayTeamId' is null or m->>'rulesSnapshot' is null) then raise exception 'UNASSIGNED_MATCH'; end if;
   if m->>'status'='scheduled' and exists(select 1 from jsonb_array_elements(m->'sets') q where coalesce(q->>'home','')<>'' or coalesce(q->>'away','')<>'') then raise exception 'SCHEDULED_WITH_SCORE'; end if;
   if coalesce(m->>'scheduledAt','')<>'' and (m->>'scheduledAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or (nullif(t->>'startDate','') is not null and left(m->>'scheduledAt',10)::date<(t->>'startDate')::date) or (nullif(t->>'endDate','') is not null and left(m->>'scheduledAt',10)::date>(t->>'endDate')::date)) then raise exception 'INVALID_SCHEDULE'; end if;
 end loop;
 if (select count(*) from (select q->>'group',least(q->>'homeTeamId',q->>'awayTeamId'),greatest(q->>'homeTeamId',q->>'awayTeamId') from jsonb_array_elements(d->'matches') q where q->>'stage'='group' group by 1,2,3) pairs)<>6 then raise exception 'DUPLICATE_GROUP_MATCH'; end if;
 a:=volleyball_private.group_rank(d,'A'); b:=volleyball_private.group_rank(d,'B');
 select value into sf1 from jsonb_array_elements(d->'matches') where value->>'id'='sf-1';
 select value into sf2 from jsonb_array_elements(d->'matches') where value->>'id'='sf-2';
 select value into f from jsonb_array_elements(d->'matches') where value->>'id'='final';
 if (a->>'resolved')::boolean and (b->>'resolved')::boolean then
   if sf1->>'homeTeamId' is distinct from a->'ids'->>0 or sf1->>'awayTeamId' is distinct from b->'ids'->>1 or sf2->>'homeTeamId' is distinct from b->'ids'->>0 or sf2->>'awayTeamId' is distinct from a->'ids'->>1 then raise exception 'INVALID_SEMIFINAL'; end if;
 elsif sf1->>'homeTeamId' is not null or sf1->>'awayTeamId' is not null or sf2->>'homeTeamId' is not null or sf2->>'awayTeamId' is not null then raise exception 'GROUPS_NOT_RESOLVED'; end if;
 if f->>'homeTeamId' is distinct from sf1->>'winnerTeamId' or f->>'awayTeamId' is distinct from sf2->>'winnerTeamId' then raise exception 'INVALID_FINAL'; end if;
 expected_status:=case when f->>'status'='completed' then 'completed' when exists(select 1 from jsonb_array_elements(d->'matches') q where q->>'status'<>'scheduled') then 'ongoing' else 'upcoming' end;
 if t->>'status' is distinct from expected_status then raise exception 'INVALID_TOURNAMENT_STATUS'; end if;
end $$;

create or replace function public.save_tournament(p_snapshot jsonb,p_expected_revision bigint,p_acknowledged_ids text[] default '{}',p_initialize boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tid text:='volleyball-cup'; previous jsonb; old_m jsonb; new_m jsonb; x jsonb; p jsonb; s jsonb; rev bigint; i integer; slot_a integer:=0; slot_b integer:=0; slot integer; result_changed boolean;
begin
 if not public.is_tournament_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if octet_length(p_snapshot::text)>2000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 perform pg_advisory_xact_lock(hashtext('volleyball-cup-save'));
 select revision into rev from public.tournaments where id=tid for update;
 if found then
   if p_initialize then raise exception 'ALREADY_EXISTS'; end if;
   if p_expected_revision is null or rev<>p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
   previous:=public.get_public_tournament(tid);
 else
   if not p_initialize or p_expected_revision is not null then raise exception 'INITIALIZATION_REQUIRED'; end if;
   rev:=0;
 end if;
 perform volleyball_private.validate_snapshot(p_snapshot);
 if previous is not null then
   if exists(select 1 from jsonb_array_elements(previous->'teams') o where not exists(select 1 from jsonb_array_elements(p_snapshot->'teams') n where n->>'id'=o->>'id')) then raise exception 'TEAM_IDS_IMMUTABLE'; end if;
   for old_m in select value from jsonb_array_elements(previous->'matches') loop
     select value into new_m from jsonb_array_elements(p_snapshot->'matches') where value->>'id'=old_m->>'id';
     result_changed:= (old_m->'sets',old_m->>'homeTeamId',old_m->>'awayTeamId',old_m->>'status',old_m->>'winnerTeamId') is distinct from (new_m->'sets',new_m->>'homeTeamId',new_m->>'awayTeamId',new_m->>'status',new_m->>'winnerTeamId');
     if result_changed and (old_m->>'status'='completed' or ((old_m->>'status'<>'scheduled') and (new_m->>'status'='scheduled' or old_m->>'homeTeamId' is distinct from new_m->>'homeTeamId' or old_m->>'awayTeamId' is distinct from new_m->>'awayTeamId'))) and not coalesce(old_m->>'id'=any(p_acknowledged_ids),false) then raise exception 'ACK_REQUIRED: %',old_m->>'id'; end if;
     if new_m->>'status'<>'scheduled' and old_m->>'rulesSnapshot' is not null and new_m->'rulesSnapshot' is distinct from old_m->'rulesSnapshot' and not coalesce(old_m->>'id'=any(p_acknowledged_ids),false) then raise exception 'RULE_SNAPSHOT_IMMUTABLE'; end if;
   end loop;
   insert into volleyball_private.tournament_history(tournament_id,revision,payload,actor_id) values(tid,rev,previous,auth.uid());
 end if;
 -- Keep FK identities. Only removed players and changed set values are deleted/upserted.
 insert into public.tournaments(id,name,status,set_rules,locations) values(tid,p_snapshot->'tournament'->>'name',p_snapshot->'tournament'->>'status',p_snapshot->'tournament'->'setRules',p_snapshot->'tournament'->'locations') on conflict(id) do nothing;
 i:=0;
 for x in select value from jsonb_array_elements(p_snapshot->'teams') loop
   i:=i+1; if x->>'group'='A' then slot_a:=slot_a+1; slot:=slot_a; else slot_b:=slot_b+1; slot:=slot_b; end if;
   insert into public.teams(id,tournament_id,name,group_name,group_slot,display_order) values(x->>'id',tid,btrim(x->>'name'),x->>'group',slot,i) on conflict(tournament_id,id) do update set name=excluded.name,group_name=excluded.group_name,group_slot=excluded.group_slot,display_order=excluded.display_order,updated_at=now();
   for p in select value || jsonb_build_object('_order',ordinality) from jsonb_array_elements(x->'players') with ordinality loop
     insert into public.players(id,tournament_id,team_id,name,display_order) values(p->>'id',tid,x->>'id',btrim(p->>'name'),(p->>'_order')::integer) on conflict(tournament_id,id) do update set team_id=excluded.team_id,name=excluded.name,display_order=excluded.display_order;
   end loop;
 end loop;
 delete from public.players existing where existing.tournament_id=tid and not exists(select 1 from jsonb_array_elements(p_snapshot->'teams') tm cross join lateral jsonb_array_elements(tm->'players') row_player where row_player->>'id'=existing.id);
 -- Clear participant pairs first within the transaction to permit a group redraw.
 update public.matches set home_team_id=null,away_team_id=null,winner_team_id=null,status='scheduled',confirmed_at=null where tournament_id=tid;
 for x in select value from jsonb_array_elements(p_snapshot->'matches') loop
   select value into old_m from jsonb_array_elements(coalesce(previous->'matches','[]'::jsonb)) where value->>'id'=x->>'id';
   result_changed:= old_m is null or (old_m->'sets',old_m->>'status',old_m->>'homeTeamId',old_m->>'awayTeamId',old_m->>'winnerTeamId') is distinct from (x->'sets',x->>'status',x->>'homeTeamId',x->>'awayTeamId',x->>'winnerTeamId');
   insert into public.matches(id,tournament_id,number,stage,group_name,home_team_id,away_team_id,winner_team_id,scheduled_at,example_date,location,status,rules_snapshot,confirmed_at,result_updated_at)
   values(x->>'id',tid,(x->>'number')::smallint,x->>'stage',x->>'group',x->>'homeTeamId',x->>'awayTeamId',x->>'winnerTeamId',case when coalesce(x->>'scheduledAt','')='' then null else ((x->>'scheduledAt')||'+09:00')::timestamptz end,coalesce(x->>'exampleDate',''),coalesce(x->>'location',''),x->>'status',nullif(x->'rulesSnapshot','null'::jsonb),case when x->>'status'='completed' then case when result_changed then now() else (old_m->>'confirmedAt')::timestamptz end else null end,case when x->>'status'='scheduled' then null when result_changed then now() else (old_m->>'updatedAt')::timestamptz end)
   on conflict(tournament_id,id) do update set number=excluded.number,stage=excluded.stage,group_name=excluded.group_name,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id,winner_team_id=excluded.winner_team_id,scheduled_at=excluded.scheduled_at,example_date=excluded.example_date,location=excluded.location,status=excluded.status,rules_snapshot=excluded.rules_snapshot,confirmed_at=excluded.confirmed_at,result_updated_at=excluded.result_updated_at,updated_at=now();
   i:=0;
   for s in select value from jsonb_array_elements(x->'sets') loop
     i:=i+1;
     insert into public.match_sets(tournament_id,match_id,set_number,home_score,away_score) values(tid,x->>'id',i,nullif(s->>'home','')::integer,nullif(s->>'away','')::integer)
     on conflict(tournament_id,match_id,set_number) do update set home_score=excluded.home_score,away_score=excluded.away_score;
   end loop;
 end loop;
 update public.tournaments set name=btrim(p_snapshot->'tournament'->>'name'),start_date=nullif(p_snapshot->'tournament'->>'startDate','')::date,end_date=nullif(p_snapshot->'tournament'->>'endDate','')::date,status=p_snapshot->'tournament'->>'status',set_rules=p_snapshot->'tournament'->'setRules',locations=p_snapshot->'tournament'->'locations',manual_rankings=p_snapshot->'manualRankings',is_demo=(p_snapshot->>'isDemo')::boolean,revision=rev+1,updated_at=now() where id=tid;
 return public.get_public_tournament(tid);
end $$;
revoke all on all functions in schema volleyball_private from public, anon, authenticated;
revoke all on all tables in schema volleyball_private from public, anon, authenticated;
revoke all on function public.save_tournament(jsonb,bigint,text[],boolean) from public, anon, authenticated;
grant execute on function public.save_tournament(jsonb,bigint,text[],boolean) to authenticated;

-- If Realtime is available, subscribe only to the final revision marker.
do $realtime$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tournaments') then
   alter publication supabase_realtime add table public.tournaments;
 end if;
end $realtime$;
notify pgrst, 'reload schema';
commit;
