-- READ ONLY. Run in SQL Editor as project owner before reviewing 002.
-- Compare definitions with 001/002. Unexpected schema drift: stop and review.
select id, name, schema_version, revision, status, updated_at from public.tournaments;
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema='public'
and table_name in ('tournaments','teams','players','matches','match_sets','match_rounds','tournament_admins')
order by table_name, ordinal_position;
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) definition
from pg_constraint where conrelid in ('public.tournaments'::regclass,'public.matches'::regclass,'public.teams'::regclass)
order by conrelid, conname;
select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='public' order by tablename, policyname;
select routine_name, grantee, privilege_type from information_schema.routine_privileges
where routine_schema='public' and routine_name in ('get_public_tournament','save_tournament','is_tournament_admin','get_sports_schema_version')
order by routine_name, grantee;
select p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('get_public_tournament','save_tournament','is_tournament_admin'))
or (n.nspname='volleyball_private' and p.proname in ('validate_snapshot','group_rank','score_result'));
select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','volleyball_private')
and c.relname in ('tournaments','teams','players','matches','match_sets','match_rounds','tournament_admins','tournament_history');
select * from pg_publication_tables where pubname='supabase_realtime';
-- Snapshot for comparison only. Export/download securely; this is not a full SQL backup.
select public.get_public_tournament('volleyball-cup') as volleyball_snapshot;
