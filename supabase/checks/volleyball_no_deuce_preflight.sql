-- READ ONLY, single JSON cell. Review/run manually as project owner before 003.
-- No Auth/admin rows or player names are included. Function bodies are verbatim.
with results as (
  select m.id,m.status,s.set_number,s.home_score,s.away_score,
    (coalesce(m.rules_snapshot,t.set_rules)->>(s.set_number-1))::integer as target
  from public.matches m join public.tournaments t on t.id=m.tournament_id
  join public.match_sets s on s.tournament_id=m.tournament_id and s.match_id=m.id
  where m.tournament_id='volleyball-cup'
)
select jsonb_build_object(
  'volleyball_state',(select jsonb_build_object('id',id,'revision',revision,'status',status,'set_rules',set_rules)
    from public.tournaments where id='volleyball-cup'),
  'score_functions',coalesce((select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'security_definer',p.prosecdef,'configuration',p.proconfig,
    'definition',pg_get_functiondef(p.oid),
    'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind='f' and ((n.nspname='volleyball_private' and p.proname in ('score_result','validate_snapshot'))
    or(n.nspname='public' and p.proname in ('save_tournament','get_volleyball_scoring_version')))),'[]'::jsonb),
  'obvious_score_conflicts',coalesce((select jsonb_agg(to_jsonb(r) order by r.id,r.set_number) from results r
    where r.home_score>r.target or r.away_score>r.target or(r.home_score=r.target and r.away_score=r.target)
      or(r.status='completed' and (r.home_score is not null or r.away_score is not null)
        and not coalesce((r.home_score=r.target and r.away_score<r.target)
          or(r.away_score=r.target and r.home_score<r.target),false))),'[]'::jsonb),
  'note','This is a preliminary read-only inspection, not a backup or a full sequence validation. 003 validates the entire volleyball snapshot in its transaction and aborts on any incompatible record.'
) as volleyball_no_deuce_preflight;
