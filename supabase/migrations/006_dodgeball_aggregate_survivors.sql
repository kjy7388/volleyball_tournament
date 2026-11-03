-- 006: review + full manual backup + explicit approval before remote use.
-- No 001-005 replay; no public data updates/deletes or inferred survivor counts.
-- A conflicting legacy result, ranking or downstream bracket aborts ALL changes.
begin;
lock table public.tournaments,public.matches,public.match_rounds,public.match_sets in share row exclusive mode;
do $review$
declare definition text;
begin
 if public.get_roster_registration_version()<>5 or public.get_competition_format_version()<>4 or public.get_volleyball_scoring_version()<>4 or public.get_sports_schema_version()<>2 then raise exception 'PREREQUISITES_001_TO_005_REQUIRED';end if;
 select prosrc into definition from pg_proc where oid=to_regprocedure('volleyball_private.round_result(jsonb,boolean)');
 if definition is null or md5(btrim(regexp_replace(definition,'[[:space:]]+',' ','g'))) not in('90d0d42ccde5f7c721ab46fc3c7a0d4b','3ebda66b6f44b6f5dc8d94ff29543860') then raise exception 'SCHEMA_DRIFT_REVIEW_REQUIRED: volleyball_private.round_result(jsonb,boolean)';end if;
 select prosrc into definition from pg_proc where oid=to_regprocedure('volleyball_private.group_rank(jsonb,text)');
 if definition is null or md5(btrim(regexp_replace(definition,'[[:space:]]+',' ','g'))) not in('b0e2f23f74342c3ddbd618d0b735db94','cf80378aadbe560923c19da27e149406') then raise exception 'SCHEMA_DRIFT_REVIEW_REQUIRED: volleyball_private.group_rank(jsonb,text)';end if;
 select prosrc into definition from pg_proc where oid=to_regprocedure('volleyball_private.validate_snapshot(jsonb)');
 if definition is null or md5(btrim(regexp_replace(definition,'[[:space:]]+',' ','g'))) not in('eaed191cf37ba396c0dbf7995485c92b','41f65a257c799684956589d4a4d3a7d0') then raise exception 'SCHEMA_DRIFT_REVIEW_REQUIRED: volleyball_private.validate_snapshot(jsonb)';end if;
 select prosrc into definition from pg_proc where oid=to_regprocedure('public.save_tournament(jsonb,bigint,text[],boolean)');
 if definition is null or md5(btrim(regexp_replace(definition,'[[:space:]]+',' ','g'))) not in('cd8e25680baaa1ac392545b699e3eeaf','1b785e9dfd59123006c240d2d5b7d283') then raise exception 'SCHEMA_DRIFT_REVIEW_REQUIRED: public.save_tournament(jsonb,bigint,text[],boolean)';end if;
end $review$;
-- Replace only the known old 0..10 constraints. Preserve unrelated checks.
do $bounds$
declare col text;c record;normalized text;
begin
 foreach col in array array['home_remaining','away_remaining'] loop
  for c in select conname,pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.match_rounds'::regclass and contype='c' and conkey=array[(select attnum from pg_attribute where attrelid='public.match_rounds'::regclass and attname=col)]::smallint[] loop
   if c.conname in('v6_home_remaining','v6_away_remaining') then continue;end if;
   normalized:=regexp_replace(c.def,'[[:space:]()]','','g');
   if normalized<>'CHECK'||col||'>=0AND'||col||'<=10' then raise exception 'SCHEMA_DRIFT_REVIEW_REQUIRED: %',c.conname;end if;
   execute format('alter table public.match_rounds drop constraint %I',c.conname);
  end loop;
 end loop;
end $bounds$;
alter table public.match_rounds alter column home_remaining type numeric,alter column away_remaining type numeric;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.match_rounds'::regclass and conname='v6_home_remaining')then
 alter table public.match_rounds add constraint v6_home_remaining check(home_remaining>=0 and home_remaining=trunc(home_remaining) and home_remaining<=9007199254740991);
 alter table public.match_rounds add constraint v6_away_remaining check(away_remaining>=0 and away_remaining=trunc(away_remaining) and away_remaining<=9007199254740991);
 end if;
end $$;
-- v4_survivor_outcome already permits a null winner on a tied set and a
-- recorded manual winner on a tie. The transaction-level snapshot guard now
-- restricts the latter to set 3; such a set remains a draw in ratio counts.
create or replace function volleyball_private.round_result(rounds jsonb,strict boolean) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r jsonb; h numeric; a numeric; w text; manual boolean; hw int:=0; aw int:=0;
 i int:=0; played int:=0; gap boolean:=false; pending boolean:=false;
 ht numeric:=0; atotal numeric:=0; bh numeric:=0; ba numeric:=0; winner text:=null; third boolean:=false;
begin
 if jsonb_typeof(rounds) is distinct from 'array' or jsonb_array_length(rounds)<>3 then raise exception 'INVALID_ROUNDS'; end if;
 for r in select value from jsonb_array_elements(rounds) loop
  i:=i+1;h:=null;a:=null;
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['winner','homeRemaining','awayRemaining','manualWinner']) or r-array['winner','homeRemaining','awayRemaining','manualWinner']<>'{}'::jsonb or jsonb_typeof(r->'manualWinner') is distinct from 'boolean' then raise exception 'INVALID_ROUND'; end if;
  w:=r->>'winner';manual:=(r->>'manualWinner')::boolean;
  if r->'homeRemaining'<>'null'::jsonb then
   if jsonb_typeof(r->'homeRemaining')<>'number' or r->>'homeRemaining'!~'^[0-9]+$' or(r->>'homeRemaining')::numeric>9007199254740991 then raise exception 'INVALID_SURVIVORS'; end if;h:=(r->>'homeRemaining')::numeric;
  end if;
  if r->'awayRemaining'<>'null'::jsonb then
   if jsonb_typeof(r->'awayRemaining')<>'number' or r->>'awayRemaining'!~'^[0-9]+$' or(r->>'awayRemaining')::numeric>9007199254740991 then raise exception 'INVALID_SURVIVORS'; end if;a:=(r->>'awayRemaining')::numeric;
  end if;
  if w is not null and w not in('home','away') then raise exception 'INVALID_ROUND_WINNER'; end if;
  if h is null and a is null and w is null and not manual then gap:=true;continue;end if;
  if gap or pending then raise exception 'ROUND_GAP'; end if;
  if i=3 and(played<>2 or bh<>ba) then raise exception 'THIRD_REQUIRES_TIED_TOTAL';end if;
  if h is null or a is null then
   if w is not null or manual then raise exception 'MISSING_SURVIVORS';end if;pending:=true;continue;
  end if;
  if h<>a then
   if manual or w is distinct from(case when h>a then 'home' else 'away' end)then raise exception 'SURVIVOR_WINNER_MISMATCH';end if;
  elsif i<3 then
   if w is not null or manual then raise exception 'DRAW_SET_CANNOT_HAVE_WINNER';end if;
  elsif (w is null and manual) or(w is not null and not manual)then raise exception 'MANUAL_MATCH_WINNER_REQUIRED';end if;
  played:=played+1;ht:=ht+h;atotal:=atotal+a;
  if h>a then hw:=hw+1;elsif a>h then aw:=aw+1;end if;
  if i<=2 then bh:=bh+h;ba:=ba+a;end if;
  if i=2 and bh<>ba then winner:=case when bh>ba then 'home' else 'away' end;end if;
  if i=3 then winner:=case when h=a then w when h>a then 'home' else 'away' end;end if;
 end loop;
 third:=played>=2 and bh=ba;
 if strict and(pending or winner is null)then raise exception 'INCOMPLETE_ROUNDS';end if;
 return jsonb_build_object('homeWins',hw,'awayWins',aw,'complete',not pending and winner is not null,
 'winnerSide',winner,'roundsPlayed',played,'needsThird',third,
 'baseHomeTotal',bh::text,'baseAwayTotal',ba::text,'homeTotal',ht::text,'awayTotal',atotal::text,
 'homeMatchPoints',case when winner is null then 0 when winner='home' then case when third then 2 else 3 end else case when third then 1 else 0 end end,
 'awayMatchPoints',case when winner is null then 0 when winner='away' then case when third then 2 else 3 end else case when third then 1 else 0 end end);
end $$;
create or replace function volleyball_private.group_rank(d jsonb,g text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare tm jsonb;m jsonb;r jsonb;s jsonb;rows jsonb[]:='{}';x jsonb;y jsonb;tmp jsonb;sf int;sa int;pf numeric;pa numeric;rd numeric;pts int;wins int;hs int;aws int;side boolean;i int;j int;k int;last int;games int;unresolved boolean:=false;manual jsonb:=d->'manualRankings'->g;ids jsonb:='[]';hw text;
begin
 select count(*) into games from jsonb_array_elements(d->'matches')q where q->>'stage'='group' and q->>'group'=g and q->>'status'='completed';
 for tm in select value from jsonb_array_elements(d->'teams')where value->>'group'=g loop
  sf:=0;sa:=0;pf:=0;pa:=0;rd:=0;pts:=0;wins:=0;
  for m in select value from jsonb_array_elements(d->'matches')q where q->>'stage'='group' and q->>'group'=g and q->>'status'='completed' and tm->>'id' in(q->>'homeTeamId',q->>'awayTeamId') loop
   side:=m->>'homeTeamId'=tm->>'id';
   r:=case when d->'tournament'->>'id'='dodgeball-cup' then volleyball_private.round_result(m->'rounds',true) else volleyball_private.score_result(m->'sets',coalesce(nullif(m->'rulesSnapshot','null'),d->'tournament'->'setRules'),true,'group') end;
   hs:=(r->>'homeWins')::int;aws:=(r->>'awayWins')::int;
   sf:=sf+case when side then hs else aws end;sa:=sa+case when side then aws else hs end;
   if m->>'winnerTeamId'=tm->>'id' then wins:=wins+1;end if;
   if d->'tournament'->>'id'='dodgeball-cup' then
    pts:=pts+(r->>(case when side then 'homeMatchPoints' else 'awayMatchPoints' end))::int;
   elsif m->>'winnerTeamId'=tm->>'id' then pts:=pts+case when least(hs,aws)=0 then 3 else 2 end;elsif least(hs,aws)=1 then pts:=pts+1;end if;
   if d->'tournament'->>'id'='dodgeball-cup' then
    for s in select value from jsonb_array_elements(m->'rounds')where value->>'homeRemaining' is not null and value->>'awayRemaining' is not null loop
     rd:=rd+case when side then 1 else -1 end*((s->>'homeRemaining')::numeric-(s->>'awayRemaining')::numeric);
    end loop;
   else
    for s in select value from jsonb_array_elements(m->'sets')where coalesce(value->>'home','')<>'' and coalesce(value->>'away','')<>'' loop
     pf:=pf+case when side then(s->>'home')::numeric else(s->>'away')::numeric end;pa:=pa+case when side then(s->>'away')::numeric else(s->>'home')::numeric end;
    end loop;
   end if;
  end loop;
  rows:=array_append(rows,jsonb_build_object('id',tm->>'id','pts',pts,'wins',wins,'sf',sf,'sa',sa,'pf',pf,'pa',pa,'rd',rd));
 end loop;
 if coalesce(array_length(rows,1),0)<>3 then return jsonb_build_object('resolved',false,'ids','[]'::jsonb);end if;
 for i in 1..2 loop for j in i+1..3 loop
  if volleyball_private.metric_compare(rows[j],rows[i],d->'tournament'->>'sport')>0 then tmp:=rows[i];rows[i]:=rows[j];rows[j]:=tmp;end if;
 end loop;end loop;
 i:=1;
 while i<=3 loop
  last:=i;
  while last<3 and volleyball_private.metric_compare(rows[i],rows[last+1],d->'tournament'->>'sport')=0 loop last:=last+1;end loop;
  if last>i then
   hw:=null;
   if last=i+1 then select q->>'winnerTeamId' into hw from jsonb_array_elements(d->'matches')q where q->>'stage'='group' and q->>'status'='completed' and q->>'group'=g and q->>'homeTeamId' in(rows[i]->>'id',rows[last]->>'id') and q->>'awayTeamId' in(rows[i]->>'id',rows[last]->>'id');end if;
   if hw is not null then
    if hw=rows[last]->>'id' then tmp:=rows[i];rows[i]:=rows[last];rows[last]:=tmp;end if;
   elsif jsonb_array_length(manual)=3 then
    for j in i..last loop for k in j..last loop
     if (select ordinality from jsonb_array_elements_text(manual)with ordinality where value=rows[k]->>'id')<(select ordinality from jsonb_array_elements_text(manual)with ordinality where value=rows[j]->>'id')then tmp:=rows[j];rows[j]:=rows[k];rows[k]:=tmp;end if;
    end loop;end loop;
   else unresolved:=true;end if;
  end if;i:=last+1;
 end loop;
 foreach x in array rows loop ids:=ids||jsonb_build_array(x->>'id');end loop;
 return jsonb_build_object('resolved',games=3 and not unresolved,'ids',ids);
end $$;
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
     if m->>'winnerTeamId' is distinct from (case when (t->>'id'='dodgeball-cup' and r->>'winnerSide'='home') or (t->>'id'='volleyball-cup' and (r->>'homeWins')::integer=2) then m->>'homeTeamId' else m->>'awayTeamId' end) or m->>'confirmedAt' is null then raise exception 'INVALID_WINNER'; end if;
   elsif m->>'winnerTeamId' is not null or m->>'confirmedAt' is not null then raise exception 'UNCONFIRMED_WINNER'; end if;
   if m->>'status'<>'scheduled' and (m->>'homeTeamId' is null or m->>'awayTeamId' is null or (t->>'id'='volleyball-cup' and m->>'rulesSnapshot' is null)) then raise exception 'UNASSIGNED_MATCH'; end if;
   if t->>'id'='dodgeball-cup' and m->>'status'='scheduled' and exists(select 1 from jsonb_array_elements(m->'rounds') q where q->>'winner' is not null or q->>'homeRemaining' is not null or q->>'awayRemaining' is not null or (q->>'manualWinner')::boolean) then raise exception 'SCHEDULED_WITH_RESULT'; end if;
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
create or replace function public.save_tournament(p_snapshot jsonb,p_expected_revision bigint,p_acknowledged_ids text[] default '{}',p_initialize boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tid text:=p_snapshot->'tournament'->>'id'; previous jsonb; old_m jsonb; new_m jsonb; x jsonb; p jsonb; s jsonb; rev bigint; i integer; slot_a integer:=0; slot_b integer:=0; slot integer; result_changed boolean;
begin
 if not public.is_tournament_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if octet_length(p_snapshot::text)>2000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 if tid is null or tid not in ('volleyball-cup','dodgeball-cup') then raise exception 'INVALID_TOURNAMENT_ID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(tid||'-save',0));
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
     result_changed:= (coalesce(old_m->'rounds',old_m->'sets'),old_m->>'homeTeamId',old_m->>'awayTeamId',old_m->>'status',old_m->>'winnerTeamId') is distinct from (coalesce(new_m->'rounds',new_m->'sets'),new_m->>'homeTeamId',new_m->>'awayTeamId',new_m->>'status',new_m->>'winnerTeamId');
     if result_changed and (old_m->>'status'='completed' or ((old_m->>'status'<>'scheduled') and (new_m->>'status'='scheduled' or old_m->>'homeTeamId' is distinct from new_m->>'homeTeamId' or old_m->>'awayTeamId' is distinct from new_m->>'awayTeamId'))) and not coalesce(old_m->>'id'=any(p_acknowledged_ids),false) then raise exception 'ACK_REQUIRED: %',old_m->>'id'; end if;
     if new_m->>'status'<>'scheduled' and old_m->>'rulesSnapshot' is not null and new_m->'rulesSnapshot' is distinct from old_m->'rulesSnapshot' and not coalesce(old_m->>'id'=any(p_acknowledged_ids),false) then raise exception 'RULE_SNAPSHOT_IMMUTABLE'; end if;
   end loop;
   insert into volleyball_private.tournament_history(tournament_id,revision,payload,actor_id) values(tid,rev,previous,auth.uid());
 end if;
 -- Keep FK identities. Only removed players and changed set values are deleted/upserted.
 insert into public.tournaments(id,sport,name,status,set_rules,locations) values(tid,case when tid='dodgeball-cup' then 'dodgeball' else 'volleyball' end,p_snapshot->'tournament'->>'name',p_snapshot->'tournament'->>'status',p_snapshot->'tournament'->'setRules',p_snapshot->'tournament'->'locations') on conflict(id) do nothing;
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
   result_changed:= old_m is null or (coalesce(old_m->'rounds',old_m->'sets'),old_m->>'status',old_m->>'homeTeamId',old_m->>'awayTeamId',old_m->>'winnerTeamId') is distinct from (coalesce(x->'rounds',x->'sets'),x->>'status',x->>'homeTeamId',x->>'awayTeamId',x->>'winnerTeamId');
   insert into public.matches(id,tournament_id,number,stage,group_name,home_team_id,away_team_id,winner_team_id,scheduled_at,example_date,location,status,rules_snapshot,confirmed_at,result_updated_at)
   values(x->>'id',tid,(x->>'number')::smallint,x->>'stage',x->>'group',x->>'homeTeamId',x->>'awayTeamId',x->>'winnerTeamId',case when coalesce(x->>'scheduledAt','')='' then null else ((x->>'scheduledAt')||'+09:00')::timestamptz end,coalesce(x->>'exampleDate',''),coalesce(x->>'location',''),x->>'status',nullif(x->'rulesSnapshot','null'::jsonb),case when x->>'status'='completed' then case when result_changed then now() else (old_m->>'confirmedAt')::timestamptz end else null end,case when x->>'status'='scheduled' then null when result_changed then now() else (old_m->>'updatedAt')::timestamptz end)
   on conflict(tournament_id,id) do update set number=excluded.number,stage=excluded.stage,group_name=excluded.group_name,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id,winner_team_id=excluded.winner_team_id,scheduled_at=excluded.scheduled_at,example_date=excluded.example_date,location=excluded.location,status=excluded.status,rules_snapshot=excluded.rules_snapshot,confirmed_at=excluded.confirmed_at,result_updated_at=excluded.result_updated_at,updated_at=now();
   i:=0;
   if tid='volleyball-cup' then
   for s in select value from jsonb_array_elements(x->'sets') loop
     i:=i+1;
     insert into public.match_sets(tournament_id,match_id,set_number,home_score,away_score) values(tid,x->>'id',i,nullif(s->>'home','')::numeric,nullif(s->>'away','')::numeric)
     on conflict(tournament_id,match_id,set_number) do update set home_score=excluded.home_score,away_score=excluded.away_score;
   end loop;
   else
     for s in select value from jsonb_array_elements(x->'rounds') loop
       i:=i+1;
       insert into public.match_rounds(tournament_id,match_id,round_number,winner_side,home_remaining,away_remaining,manual_winner) values(tid,x->>'id',i,s->>'winner',(s->>'homeRemaining')::numeric,(s->>'awayRemaining')::numeric,(s->>'manualWinner')::boolean)
       on conflict(tournament_id,match_id,round_number) do update set winner_side=excluded.winner_side,home_remaining=excluded.home_remaining,away_remaining=excluded.away_remaining,manual_winner=excluded.manual_winner;
     end loop;
   end if;
 end loop;
 update public.tournaments set name=btrim(p_snapshot->'tournament'->>'name'),start_date=nullif(p_snapshot->'tournament'->>'startDate','')::date,end_date=nullif(p_snapshot->'tournament'->>'endDate','')::date,status=p_snapshot->'tournament'->>'status',set_rules=p_snapshot->'tournament'->'setRules',locations=p_snapshot->'tournament'->'locations',manual_rankings=p_snapshot->'manualRankings',is_demo=(p_snapshot->>'isDemo')::boolean,revision=rev+1,updated_at=now() where id=tid;
 return public.get_public_tournament(tid);
end $$;
do $compatibility$
declare snapshot jsonb;
begin
 for snapshot in select public.get_public_tournament(id) from public.tournaments where sport='dodgeball' loop
  begin
   perform volleyball_private.validate_snapshot(snapshot);
  exception when others then
   raise exception '006_INCOMPATIBLE_DODGEBALL_DATA: %. Back up and review legacy results, manual rankings and knockout pairings; no automatic conversion. Entire migration rolled back.',sqlerrm;
  end;
 end loop;
end $compatibility$;
-- Additional private recovery copy; no tournament revisions or public rows change.
insert into volleyball_private.rule_upgrade_backups(tournament_id,format_version,payload)
select id,6,public.get_public_tournament(id) from public.tournaments where sport='dodgeball' on conflict do nothing;
create or replace function public.get_dodgeball_scoring_version() returns integer
language sql immutable security invoker set search_path='' as $$ select 6 $$;
revoke all on all functions in schema volleyball_private from public,anon,authenticated;
revoke all on function public.save_tournament(jsonb,bigint,text[],boolean) from public,anon,authenticated;
grant execute on function public.save_tournament(jsonb,bigint,text[],boolean) to authenticated;
revoke all on function public.get_dodgeball_scoring_version() from public,anon,authenticated;
grant execute on function public.get_dodgeball_scoring_version() to anon,authenticated;
notify pgrst,'reload schema';
commit;
