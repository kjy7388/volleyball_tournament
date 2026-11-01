-- Review and back up before manual application. Prerequisite: 001 + 002 installed.
-- No rows are updated/deleted, no RLS policies/auth/admins/targets are changed.
-- Incompatible old results abort the entire transaction; never truncate deuce
-- scores or silently reset matches. Do not replay 001/002 after this upgrade.
begin;
lock table public.tournaments, public.matches, public.match_sets in share row exclusive mode;

-- save_tournament -> validate_snapshot already calls this function. Keeping the
-- signature preserves atomic saves, revision checks, ACK and dodgeball routing.
create or replace function volleyball_private.score_result(sets jsonb, rules jsonb, strict boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare s jsonb; v jsonb; h integer; a integer; target integer;
  hw integer:=0; aw integer:=0; i integer:=0; gap boolean:=false; unfinished boolean:=false;
begin
  if jsonb_typeof(sets) is distinct from 'array' or jsonb_array_length(sets)<>5
    or jsonb_typeof(rules) is distinct from 'array' or jsonb_array_length(rules)<>5
  then raise exception 'INVALID_SET_STRUCTURE'; end if;
  for v in select value from jsonb_array_elements(rules) loop
    if jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' or v::numeric not between 2 and 999
    then raise exception 'INVALID_RULES'; end if;
  end loop;
  for s in select value from jsonb_array_elements(sets) loop
    i:=i+1; h:=null; a:=null; target:=(rules->>(i-1))::integer;
    if jsonb_typeof(s) is distinct from 'object' then raise exception 'INVALID_SCORE'; end if;
    if s->>'home' is not null and s->>'home'<>'' then
      if jsonb_typeof(s->'home')<>'number' or s->>'home' !~ '^[0-9]+$' or (s->>'home')::numeric>9999
      then raise exception 'INVALID_SCORE'; end if;
      h:=(s->>'home')::integer;
    end if;
    if s->>'away' is not null and s->>'away'<>'' then
      if jsonb_typeof(s->'away')<>'number' or s->>'away' !~ '^[0-9]+$' or (s->>'away')::numeric>9999
      then raise exception 'INVALID_SCORE'; end if;
      a:=(s->>'away')::integer;
    end if;
    if h is null and a is null then gap:=true; continue; end if;
    if hw=3 or aw=3 then raise exception 'SCORE_AFTER_WIN'; end if;
    if gap or unfinished then raise exception 'SET_SEQUENCE'; end if;
    if h>target or a>target or (h=target and a=target) then raise exception 'SCORE_OVER_TARGET'; end if;
    if h is null or a is null or (h<target and a<target) then unfinished:=true; continue; end if;
    if h=target and a<target then hw:=hw+1;
    elsif a=target and h<target then aw:=aw+1;
    else raise exception 'INVALID_FINAL_SCORE'; end if;
  end loop;
  if strict and (unfinished or (hw<>3 and aw<>3)) then raise exception 'INVALID_FINAL_SCORE'; end if;
  return jsonb_build_object('homeWins',hw,'awayWins',aw,'complete',not unfinished and (hw=3 or aw=3));
end $$;

-- Validate existing volleyball records with the new function before committing.
-- This also protects unfinished drafts with impossible scores/sequence gaps.
do $existing_records$
declare snapshot jsonb;
begin
  snapshot:=public.get_public_tournament('volleyball-cup');
  if snapshot is not null then
    begin
      perform volleyball_private.validate_snapshot(snapshot);
    exception when others then
      raise exception 'NO_DEUCE_EXISTING_RESULT_REVIEW_REQUIRED: existing volleyball records are incompatible (%). No records were converted or removed.', sqlerrm;
    end;
  end if;
end $existing_records$;

create or replace function public.get_volleyball_scoring_version() returns integer
language sql immutable security invoker set search_path='' as $$ select 3 $$;
revoke all on function public.get_volleyball_scoring_version() from public,anon,authenticated;
grant execute on function public.get_volleyball_scoring_version() to anon,authenticated;
revoke all on function volleyball_private.score_result(jsonb,jsonb,boolean) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
