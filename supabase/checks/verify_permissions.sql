-- Read-only audit. Run in SQL Editor AFTER reviewing/applying the migration.
-- Every public data table should show read=true, write=false for both roles.
select roles.role_name, tables.table_name,
 has_table_privilege(roles.role_name, 'public.'||tables.table_name, 'SELECT') as can_read,
 has_table_privilege(roles.role_name, 'public.'||tables.table_name, 'INSERT') as can_insert,
 has_table_privilege(roles.role_name, 'public.'||tables.table_name, 'UPDATE') as can_update,
 has_table_privilege(roles.role_name, 'public.'||tables.table_name, 'DELETE') as can_delete
from (values ('anon'),('authenticated')) roles(role_name)
cross join (values ('tournaments'),('teams'),('players'),('matches'),('match_sets'),('tournament_admins')) tables(table_name);
-- tournament_admins should have false for ALL four permissions.
select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('tournaments','teams','players','matches','match_sets','tournament_admins');
-- Public read RPC: anon=true/authenticated=true. Save and admin check: false/true.
select p.proname,p.prosecdef as security_definer,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('get_public_tournament','save_tournament','is_tournament_admin');
-- Private schema MUST NOT be client accessible.
select has_schema_privilege('anon','volleyball_private','USAGE') as anon_private_usage,
 has_schema_privilege('authenticated','volleyball_private','USAGE') as authenticated_private_usage;
