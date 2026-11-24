-- READ ONLY: one row, one JSON cell, suitable for CSV export.
-- Run manually in SQL Editor as the owner before AND after 007.
-- No player names, emails, Auth user IDs or history payloads are exported.
with snapshots as (
 select t.id,public.get_public_tournament(t.id) data from public.tournaments t
), scores as (
 select m.id,m.stage,m.status,s.set_number,s.home_score,s.away_score,
 (coalesce(m.rules_snapshot,t.set_rules)->>(s.set_number-1))::numeric target
 from public.matches m join public.tournaments t on t.id=m.tournament_id
 join public.match_sets s on s.tournament_id=m.tournament_id and s.match_id=m.id
 where t.sport='volleyball'
), conflicts as (
 select *,case
  when home_score<0 or away_score<0 or home_score<>trunc(home_score) or away_score<>trunc(away_score) then 'INVALID_INTEGER_SCORE'
  when set_number>3 and(home_score is not null or away_score is not null) then 'EXTRA_SET'
  when home_score>target or away_score>target or(home_score=target and away_score=target) then 'SCORE_OVER_TARGET_OR_BOTH_AT_TARGET'
  when status='completed' and(home_score is not null or away_score is not null) and not coalesce((home_score=target and away_score<target)or(away_score=target and home_score<target),false) then 'INCOMPLETE_CONFIRMED_SET'
 end reason from scores
)
select jsonb_build_object(
 'versions',jsonb_build_object('volleyball',public.get_volleyball_scoring_version(),'dodgeball',public.get_dodgeball_scoring_version(),'roster',public.get_roster_registration_version(),'format',public.get_competition_format_version(),'sports',public.get_sports_schema_version()),
 'tournaments',coalesce((select jsonb_agg(jsonb_build_object(
  'id',s.id,'revision',s.data->'revision','status',s.data->'tournament'->'status','set_rules',s.data->'tournament'->'setRules',
  'snapshot_md5',md5(s.data::text),'team_count',jsonb_array_length(s.data->'teams'),
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','name',x->>'name','group',x->>'group','player_count',jsonb_array_length(x->'players'),'roster_md5',md5((x->'players')::text))order by x->>'id')from jsonb_array_elements(s.data->'teams') x),'[]'::jsonb),
  'matches',coalesce((select jsonb_agg((m-'rounds')||case when m?'rounds' then jsonb_build_object('rounds',m->'rounds')else '{}'::jsonb end order by(m->>'number')::int)from jsonb_array_elements(s.data->'matches')m),'[]'::jsonb),
  'manual_rankings',s.data->'manualRankings',
  'history_count',(select count(*) from volleyball_private.tournament_history h where h.tournament_id=s.id),
  'history_md5',(select md5(coalesce(jsonb_agg(to_jsonb(h)order by h.revision)::text,'[]'))from volleyball_private.tournament_history h where h.tournament_id=s.id)
 )order by s.id)from snapshots s),'[]'::jsonb),
 'completed_knockouts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'stage',stage,'status',status,'winner_team_id',winner_team_id,'confirmed_at',confirmed_at)order by number)from public.matches where tournament_id='volleyball-cup' and stage in('semifinal','final')and status='completed'),'[]'::jsonb),
 'deuce_scores',coalesce((select jsonb_agg(to_jsonb(s)order by s.id,s.set_number)from scores s where s.stage in('semifinal','final')and(s.home_score>s.target or s.away_score>s.target)),'[]'::jsonb),
 'obvious_score_conflicts',coalesce((select jsonb_agg(to_jsonb(c)order by c.id,c.set_number)from conflicts c where reason is not null),'[]'::jsonb),
 'functions',coalesce((select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'security_definer',p.prosecdef,'configuration',p.proconfig,'definition',pg_get_functiondef(p.oid),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'))order by n.nspname,p.proname,p.oid)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f'and((n.nspname='volleyball_private'and p.proname in('score_result','round_result','validate_snapshot','group_rank','check_result_sport'))or(n.nspname='public'and p.proname in('save_tournament','get_public_tournament','is_tournament_admin','get_volleyball_scoring_version','get_dodgeball_scoring_version','get_roster_registration_version','get_competition_format_version','get_sports_schema_version')))),'[]'::jsonb),
 'admin_count',(select count(*)from public.tournament_admins),
 'admin_membership_md5',(select md5(coalesce(jsonb_agg(to_jsonb(a)order by a.user_id)::text,'[]'))from public.tournament_admins a),
 'rls',coalesce((select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl)order by c.relname)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relname in('tournaments','teams','players','matches','match_sets','match_rounds','tournament_admins')),'[]'::jsonb),
 'policies',coalesce((select jsonb_agg(to_jsonb(p)order by p.tablename,p.policyname)from pg_policies p where p.schemaname='public'and p.tablename in('tournaments','teams','players','matches','match_sets','match_rounds','tournament_admins')),'[]'::jsonb),
 'constraints',coalesce((select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))order by c.conrelid,c.conname)from pg_constraint c where c.conrelid in('public.matches'::regclass,'public.match_sets'::regclass,'public.tournament_admins'::regclass)),'[]'::jsonb),
 'realtime',coalesce((select jsonb_agg(to_jsonb(p)order by p.pubname,p.schemaname,p.tablename)from pg_publication_tables p where p.schemaname='public'and p.tablename in('tournaments','teams','players','matches','match_sets','match_rounds')),'[]'::jsonb),
 'note','This SELECT is an inspection and fingerprint, not a restorable backup. Conflict listing is preliminary; 007 validates full score sequences, winners and the existing snapshot and rolls back on conflict. Review private function definitions and authorization; stop on any unexpected difference. Compare snapshots, rosters, states, revisions, history, RLS and grants before/after. Only score_result and volleyball version should change.'
) as volleyball_all_stages_preflight;
