-- Manual review + approval required. Prerequisite: 004 already installed.
-- No tournament/player/match rows, revisions, RLS policies or Auth records change.
begin;
lock table public.players in share row exclusive mode;
do $review$
declare definition text; trigger_function oid;
begin
 if public.get_competition_format_version()<>4 then raise exception 'FORMAT_004_REQUIRED'; end if;
 select prosrc into definition from pg_proc where oid=to_regprocedure('volleyball_private.validate_snapshot(jsonb)');
 if definition is null or md5(btrim(regexp_replace(definition,'[[:space:]]+',' ','g'))) not in ('c7734a3ffaefda73f13e2a7bf8689a5b','eaed191cf37ba396c0dbf7995485c92b') then raise exception 'SCHEMA_DRIFT_REVIEW_REQUIRED: validate_snapshot differs from reviewed 004/005'; end if;
 select tgfoid into trigger_function from pg_trigger where tgrelid='public.players'::regclass and tgname='roster_limit_10' and not tgisinternal;
 if trigger_function is not null and trigger_function is distinct from to_regprocedure('volleyball_private.check_roster_limit()')::oid then raise exception 'SCHEMA_DRIFT_REVIEW_REQUIRED: roster_limit_10'; end if;
end $review$;
drop trigger if exists roster_limit_10 on public.players;
-- No CASCADE: unexpected dependencies abort and roll back rather than disappear.
drop function if exists volleyball_private.check_roster_limit();
create or replace function volleyball_private.validate_snapshot(d jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare t jsonb:=d->'tournament'; x jsonb; m jsonb; s jsonb; r jsonb; g text; a jsonb; b jsonb; sf1 jsonb; sf2 jsonb; f jsonb; h text; w text; expected_status text;
begin
 if (d->>'schemaVersion')::integer is distinct from 2 or (t->>'id' is null or t->>'id' not in ('volleyball-cup','dodgeball-cup')) or jsonb_typeof(d->'teams') is distinct from 'array' or jsonb_array_length(d->'teams')<>6 or jsonb_typeof(d->'matches') is distinct from 'array' or jsonb_array_length(d->'matches')<>9 then raise exception 'INVALID_SNAPSHOT'; end if;
 if length(btrim(t->>'name')) not between 1 and 80 or t->>'name' is null or jsonb_typeof(t->'locations') is distinct from 'object' or jsonb_typeof(d->'isDemo') is distinct from 'boolean' then raise exception 'INVALID_TOURNAMENT'; end if;
 if coalesce(t->>'sport', 'volleyball') is distinct from (case when t->>'id'='dodgeball-cup' then 'dodgeball' else 'volleyball' end) then raise exception 'INVALID_SPORT'; end if;
 if t->>'id'='volleyball-cup' then
 if jsonb_typeof(t->'setRules') is distinct from 'array' or jsonb_array_length(t->'setRules')<>3 then raise exception 'INVALID_RULES'; end if;
 for x in select value from jsonb_array_elements(t->'setRules') loop
   if jsonb_typeof(x)<>'number' or x::text !~ '^[0-9]+$' or x::numeric not between 2 and 999 then raise exception 'INVALID_RULES'; end if;
 end loop;
 elsif t->'setRules' is distinct from 'null'::jsonb then raise exception 'DODGEBALL_HAS_POINT_RULES'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(d->'teams'))<>6 or (select count(distinct btrim(value->>'name')) from jsonb_array_elements(d->'teams'))<>6 then raise exception 'DUPLICATE_TEAM'; end if;
 foreach g in array array['A','B'] loop
   if (select count(*) from jsonb_array_elements(d->'teams') where value->>'group'=g)<>3 then raise exception 'GROUP_MUST_HAVE_THREE'; end if;
   if jsonb_typeof(d->'manualRankings'->g) is distinct from 'array' then raise exception 'INVALID_MANUAL_RANKING'; end if;
   if jsonb_array_length(d->'manualRankings'->g)<>0 and (jsonb_array_length(d->'manualRankings'->g)<>3 or (select count(distinct value) from jsonb_array_elements_text(d->'manualRankings'->g))<>3 or exists(select 1 from jsonb_array_elements_text(d->'manualRankings'->g) r where not exists(select 1 from jsonb_array_elements(d->'teams') tm where tm->>'id'=r.value and tm->>'group'=g))) then raise exception 'INVALID_MANUAL_RANKING'; end if;
 end loop;
 for x in select value from jsonb_array_elements(d->'teams') loop
   if length(x->>'id') not between 1 and 100 or x->>'id' is null or x->>'name' is null or length(btrim(x->>'name')) not between 1 and 30 or jsonb_typeof(x->'players') is distinct from 'array' then raise exception 'INVALID_TEAM'; end if;
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
   if t->>'id'='volleyball-cup' then
   if m ? 'rounds' then raise exception 'VOLLEYBALL_HAS_ROUNDS'; end if;
   if jsonb_typeof(m->'sets') is distinct from 'array' or jsonb_array_length(m->'sets')<>3 then raise exception 'INVALID_SETS'; end if;
   s:=coalesce(nullif(m->'rulesSnapshot','null'::jsonb),t->'setRules');
   if jsonb_typeof(s)<>'array' or jsonb_array_length(s)<>3 or exists(select 1 from jsonb_array_elements(s) v where jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' or v::numeric not between 2 and 999) then raise exception 'INVALID_RULE_SNAPSHOT'; end if;
   r:=volleyball_private.score_result(m->'sets',s,m->>'status'='completed',m->>'stage');
   else
     if m ? 'sets' or m->'rulesSnapshot' is not null and m->'rulesSnapshot'<>'null'::jsonb then raise exception 'DODGEBALL_HAS_POINT_SCORES'; end if;
     r:=volleyball_private.round_result(m->'rounds',m->>'status'='completed');
   end if;
   if m->>'status'='completed' then
     if m->>'winnerTeamId' is distinct from (case when (r->>'homeWins')::integer=2 then m->>'homeTeamId' else m->>'awayTeamId' end) or m->>'confirmedAt' is null then raise exception 'INVALID_WINNER'; end if;
   elsif m->>'winnerTeamId' is not null or m->>'confirmedAt' is not null then raise exception 'UNCONFIRMED_WINNER'; end if;
   if m->>'status'<>'scheduled' and (m->>'homeTeamId' is null or m->>'awayTeamId' is null or (t->>'id'='volleyball-cup' and m->>'rulesSnapshot' is null)) then raise exception 'UNASSIGNED_MATCH'; end if;
   if t->>'id'='dodgeball-cup' and m->>'status'='scheduled' and exists(select 1 from jsonb_array_elements(m->'rounds') q where q->>'winner' is not null) then raise exception 'SCHEDULED_WITH_RESULT'; end if;
   if t->>'id'='volleyball-cup' and m->>'status'='scheduled' and exists(select 1 from jsonb_array_elements(m->'sets') q where coalesce(q->>'home','')<>'' or coalesce(q->>'away','')<>'') then raise exception 'SCHEDULED_WITH_SCORE'; end if;
   if coalesce(m->>'scheduledAt','')<>'' and (m->>'scheduledAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or (nullif(t->>'startDate','') is not null and left(m->>'scheduledAt',10)::date<(t->>'startDate')::date) or (nullif(t->>'endDate','') is not null and left(m->>'scheduledAt',10)::date>(t->>'endDate')::date)) then raise exception 'INVALID_SCHEDULE'; end if;
 end loop;
 if (select count(*) from (select q->>'group',least(q->>'homeTeamId',q->>'awayTeamId'),greatest(q->>'homeTeamId',q->>'awayTeamId') from jsonb_array_elements(d->'matches') q where q->>'stage'='group' group by 1,2,3) pairs)<>6 then raise exception 'DUPLICATE_GROUP_MATCH'; end if;
 a:=volleyball_private.group_rank(d,'A'); b:=volleyball_private.group_rank(d,'B');
 -- A manual permutation may only reorder an automatically unresolved cluster.
 if (jsonb_array_length(d->'manualRankings'->'A')>0 and d->'manualRankings'->'A' is distinct from a->'ids')
 or (jsonb_array_length(d->'manualRankings'->'B')>0 and d->'manualRankings'->'B' is distinct from b->'ids') then raise exception 'MANUAL_OVERRIDES_METRICS'; end if;
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
revoke all on function volleyball_private.validate_snapshot(jsonb) from public,anon,authenticated;
create or replace function public.get_roster_registration_version() returns integer
language sql immutable security invoker set search_path='' as $$ select 5 $$;
revoke all on function public.get_roster_registration_version() from public,anon,authenticated;
grant execute on function public.get_roster_registration_version() to anon,authenticated;
notify pgrst,'reload schema';
commit;
