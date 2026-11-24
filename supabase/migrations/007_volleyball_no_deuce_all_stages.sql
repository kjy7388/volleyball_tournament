-- 007: manual backup, read-only preflight, review and explicit approval first.
-- Function-only migration. No tournament/player/result/history writes or schema changes.
-- Never replay 001-006 on the live project. Execute this whole transaction once.
begin;
lock table public.tournaments,public.matches,public.match_sets in share row exclusive mode;
do $review$
declare definition text; scoring integer;
begin
 scoring:=public.get_volleyball_scoring_version();
 if scoring not in(4,7) or public.get_dodgeball_scoring_version()<>6 or public.get_roster_registration_version()<>5 or public.get_competition_format_version()<>4 or public.get_sports_schema_version()<>2 then raise exception '007_PREREQUISITE_VERSION_MISMATCH';end if;
 select prosrc into definition from pg_proc where oid=to_regprocedure('volleyball_private.score_result(jsonb,jsonb,boolean,text)') and not prosecdef and proconfig=array['search_path=""'];
 if definition is null or md5(btrim(regexp_replace(definition,'[[:space:]]+',' ','g'))) not in('29ceea7aaf631934154f2a8d9186fca3','f58c90d02fc13f074f274a83648b76b3') then raise exception '007_SCHEMA_DRIFT_REVIEW_REQUIRED: score_result';end if;
 select prosrc into definition from pg_proc where oid=to_regprocedure('public.get_volleyball_scoring_version()') and not prosecdef;
 if definition is null or md5(btrim(regexp_replace(definition,'[[:space:]]+',' ','g'))) not in('232446d0dab78d5ae67444d950824fde','e8a9bcbd60c8dde8ad770020e0619c3b') then raise exception '007_SCHEMA_DRIFT_REVIEW_REQUIRED: scoring version';end if;
end $review$;
create or replace function volleyball_private.score_result(sets jsonb,rules jsonb,strict boolean,stage text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare s jsonb; v jsonb; h numeric; a numeric; target numeric; hw int:=0; aw int:=0; i int:=0; gap boolean:=false; pending boolean:=false; deuce boolean:=false;
begin
 if stage not in('group','semifinal','final') or stage is null then raise exception 'INVALID_STAGE'; end if;
 if jsonb_typeof(sets) is distinct from 'array' or jsonb_array_length(sets)<>3 or jsonb_typeof(rules) is distinct from 'array' or jsonb_array_length(rules)<>3 then raise exception 'INVALID_SET_STRUCTURE'; end if;
 for v in select value from jsonb_array_elements(rules) loop
  if jsonb_typeof(v)<>'number' or v::text!~'^[0-9]+$' or v::numeric not between 2 and 999 then raise exception 'INVALID_RULES'; end if;
 end loop;
 for s in select value from jsonb_array_elements(sets) loop
  i:=i+1;h:=null;a:=null;target:=(rules->>(i-1))::numeric;
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'INVALID_SCORE'; end if;
  if coalesce(s->>'home','')<>'' then
   if jsonb_typeof(s->'home')<>'number' or s->>'home'!~'^[0-9]+$' or(s->>'home')::numeric>9007199254740991 then raise exception 'INVALID_SCORE'; end if;
   h:=(s->>'home')::numeric;
  end if;
  if coalesce(s->>'away','')<>'' then
   if jsonb_typeof(s->'away')<>'number' or s->>'away'!~'^[0-9]+$' or(s->>'away')::numeric>9007199254740991 then raise exception 'INVALID_SCORE'; end if;
   a:=(s->>'away')::numeric;
  end if;
  if h is null and a is null then gap:=true;continue; end if;
  if hw=2 or aw=2 then raise exception 'SCORE_AFTER_WIN'; end if;
  if gap or pending then raise exception 'SET_SEQUENCE'; end if;
  if not deuce and(h>target or a>target or(h=target and a=target)) then raise exception 'SCORE_OVER_TARGET'; end if;
  if deuce and h is not null and a is not null and greatest(h,a)>target and abs(h-a)>2 then raise exception 'SCORE_AFTER_SET_END'; end if;
  if h is null or a is null or greatest(h,a)<target or(deuce and abs(h-a)<2) then pending:=true;continue; end if;
  if h>a then hw:=hw+1;else aw:=aw+1;end if;
 end loop;
 if strict and(pending or(hw<>2 and aw<>2)) then raise exception 'INVALID_FINAL_SCORE'; end if;
 return jsonb_build_object('homeWins',hw,'awayWins',aw,'complete',not pending and(hw=2 or aw=2));
end $$;
-- Validate every stored volleyball record, including drafts. Do not infer,
-- clear, truncate, rescore or resynchronize any result or bracket.
do $compatibility$
declare d jsonb;m jsonb;r jsonb;
begin
 for d in select public.get_public_tournament(id) from public.tournaments where sport='volleyball' loop
  for m in select value from jsonb_array_elements(d->'matches') loop
   begin
    r:=volleyball_private.score_result(m->'sets',coalesce(nullif(m->'rulesSnapshot','null'::jsonb),d->'tournament'->'setRules'),m->>'status'='completed',m->>'stage');
    if m->>'status'='completed' and m->>'winnerTeamId' is distinct from(case when(r->>'homeWins')::int=2 then m->>'homeTeamId' else m->>'awayTeamId' end) then raise exception 'CONFIRMED_WINNER_MISMATCH';end if;
   exception when others then
    raise exception '007_INCOMPATIBLE_VOLLEYBALL_RECORD: match %, stage %, status %: %. No records changed; entire transaction must roll back.',m->>'id',m->>'stage',m->>'status',sqlerrm;
   end;
  end loop;
  begin
   perform volleyball_private.validate_snapshot(d);
  exception when others then
   raise exception '007_INCOMPATIBLE_VOLLEYBALL_SNAPSHOT: %. No records or brackets changed; entire transaction must roll back.',sqlerrm;
  end;
 end loop;
end $compatibility$;
create or replace function public.get_volleyball_scoring_version() returns integer
language sql immutable security invoker set search_path='' as $$ select 7 $$;
-- Preserve private scoring and the public read-only capability permissions.
revoke all on function volleyball_private.score_result(jsonb,jsonb,boolean,text) from public,anon,authenticated;
revoke all on function public.get_volleyball_scoring_version() from public,anon,authenticated;
grant execute on function public.get_volleyball_scoring_version() to anon,authenticated;
notify pgrst,'reload schema';
commit;
