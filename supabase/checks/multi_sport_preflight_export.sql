-- READ ONLY: one SELECT statement, one row, one JSONB column (preflight_export).
-- Run manually as project owner in SQL Editor. This file does not apply migrations.
-- CSV export stores the entire report in one quoted cell. Use a CSV reader to
-- preserve escaped quotes/newlines, then parse that cell as JSON.
-- Retains every inspection category in multi_sport_preflight.sql, with additional
-- security metadata. Player identities/rosters and Auth/admin account rows are
-- deliberately excluded. The sanitized snapshot is NOT a restorable DB backup.
-- Function definitions/defaults/policy expressions are exported verbatim for
-- review; if custom SQL embeds personal information or secrets, those literals
-- can appear in the report. Review the exported report before sharing it.
with
checked_tables(table_schema, table_name) as (
  values
    ('public', 'tournaments'),
    ('public', 'teams'),
    ('public', 'players'),
    ('public', 'matches'),
    ('public', 'match_sets'),
    ('public', 'match_rounds'),
    ('public', 'tournament_admins'),
    ('volleyball_private', 'tournament_history')
),
checked_functions as (
  select p.*, n.nspname as function_schema
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and (
      (n.nspname = 'public' and p.proname in (
        'get_public_tournament', 'save_tournament',
        'is_tournament_admin', 'get_sports_schema_version'
      ))
      or (n.nspname = 'volleyball_private' and p.proname in (
        'validate_snapshot', 'group_rank', 'score_result',
        'round_result', 'check_result_sport'
      ))
      -- Include any additional SECURITY DEFINER functions in these app schemas.
      or (n.nspname in ('public', 'volleyball_private') and p.prosecdef)
    )
)
select jsonb_build_object(
  'export_format_version', 1,
  'generated_at_utc', to_char(
    statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ),
  'privacy', jsonb_build_object(
    'player_details_omitted', true,
    'auth_and_admin_account_rows_queried', false,
    'function_definitions_and_security_expressions', 'verbatim',
    'snapshot_is_restorable_backup', false
  ),

  -- Original SELECT 1: existing tournament state (no player/account records).
  'tournaments', (
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id), '[]'::jsonb)
    from (
      select id, name, schema_version, revision, status, updated_at,
        to_jsonb(t) ->> 'sport' as sport
      from public.tournaments t
    ) q
  ),

  -- Original SELECT 2: column structure, extended to the private history table.
  -- An optional table not yet installed (e.g. match_rounds before 002) is absent.
  'columns', (
    select coalesce(jsonb_agg(to_jsonb(q)
      order by q.table_schema, q.table_name, q.ordinal_position), '[]'::jsonb)
    from (
      select c.table_schema, c.table_name, c.column_name, c.ordinal_position,
        c.data_type, c.udt_schema, c.udt_name, c.is_nullable, c.column_default,
        c.is_identity, c.identity_generation
      from information_schema.columns c
      join checked_tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
    ) q
  ),

  -- Original SELECT 3: retains all constraints from tournaments/matches/teams,
  -- and also includes players, result tables, admin metadata and history.
  'constraints', (
    select coalesce(jsonb_agg(to_jsonb(q)
      order by q.table_schema, q.table_name, q.conname), '[]'::jsonb)
    from (
      select n.nspname as table_schema, c.relname as table_name,
        con.conname, con.contype, con.condeferrable, con.condeferred,
        con.convalidated, pg_get_constraintdef(con.oid) as definition
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join checked_tables t
        on t.table_schema = n.nspname and t.table_name = c.relname
    ) q
  ),

  -- Original SELECT 4: all public RLS policies, plus private-schema policies.
  'rls_policies', (
    select coalesce(jsonb_agg(to_jsonb(q)
      order by q.schemaname, q.tablename, q.policyname), '[]'::jsonb)
    from (
      select schemaname, tablename, policyname, permissive, roles,
        cmd, qual, with_check
      from pg_policies
      where schemaname in ('public', 'volleyball_private')
    ) q
  ),

  -- Original SELECT 5: the four public RPC grants, plus checked private and
  -- additional SECURITY DEFINER function grants visible to the inspecting owner.
  'routine_privileges', (
    select coalesce(jsonb_agg(to_jsonb(q)
      order by q.routine_schema, q.specific_name, q.grantee, q.grantor), '[]'::jsonb)
    from (
      select r.routine_schema, r.routine_name, r.specific_name,
        r.grantor, r.grantee, r.privilege_type, r.is_grantable
      from information_schema.routine_privileges r
      where exists (
        select 1 from checked_functions f
        where f.function_schema = r.routine_schema and f.proname = r.routine_name
      )
    ) q
  ),

  -- Original SELECT 6: definitions and security settings. Signatures distinguish
  -- overloaded functions. Effective EXECUTE and schema USAGE are separate:
  -- EXECUTE alone does not imply that a private-schema function is accessible.
  'functions', (
    select coalesce(jsonb_agg(to_jsonb(q)
      order by q.function_schema, q.proname, q.identity_arguments), '[]'::jsonb)
    from (
      select f.function_schema, f.proname,
        pg_get_function_identity_arguments(f.oid) as identity_arguments,
        pg_get_function_result(f.oid) as result_type,
        pg_get_userbyid(f.proowner) as owner_role,
        f.prosecdef as security_definer, f.proconfig,
        f.provolatile as volatility, f.proleakproof as leakproof,
        pg_get_functiondef(f.oid) as definition,
        has_function_privilege('anon', f.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', f.oid, 'EXECUTE') as authenticated_execute,
        has_schema_privilege('anon', f.pronamespace, 'USAGE') as anon_schema_usage,
        has_schema_privilege('authenticated', f.pronamespace, 'USAGE') as authenticated_schema_usage,
        -- Expand the actual/default ACL, including default PUBLIC EXECUTE.
        -- This supplements information_schema, whose rows depend on visibility.
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'grantor', pg_get_userbyid(a.grantor),
            'grantee', case when a.grantee = 0 then 'PUBLIC'
              else pg_get_userbyid(a.grantee) end,
            'privilege_type', a.privilege_type,
            'is_grantable', a.is_grantable
          ) order by a.grantee, a.grantor, a.privilege_type), '[]'::jsonb)
          from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
        ) as acl
      from checked_functions f
    ) q
  ),

  -- Original SELECT 7: RLS flags for both app schemas; no table contents read.
  'rls_tables', (
    select coalesce(jsonb_agg(to_jsonb(q)
      order by q.table_schema, q.relname), '[]'::jsonb)
    from (
      select n.nspname as table_schema, c.relname, c.relkind,
        c.relrowsecurity, c.relforcerowsecurity,
        c.relreplident as replica_identity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join checked_tables t
        on t.table_schema = n.nspname and t.table_name = c.relname
    ) q
  ),

  -- Supplement: effective public/private data privileges, without account rows.
  'table_privileges', (
    select coalesce(jsonb_agg(to_jsonb(q)
      order by q.table_schema, q.table_name, q.role_name), '[]'::jsonb)
    from (
      select n.nspname as table_schema, c.relname as table_name, r.role_name,
        has_schema_privilege(r.role_name, n.oid, 'USAGE') as schema_usage,
        has_table_privilege(r.role_name, c.oid, 'SELECT') as can_select,
        has_table_privilege(r.role_name, c.oid, 'INSERT') as can_insert,
        has_table_privilege(r.role_name, c.oid, 'UPDATE') as can_update,
        has_table_privilege(r.role_name, c.oid, 'DELETE') as can_delete
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join checked_tables t
        on t.table_schema = n.nspname and t.table_name = c.relname
      cross join (values ('anon'), ('authenticated')) r(role_name)
    ) q
  ),

  -- Original SELECT 8: retain every field from pg_publication_tables, plus the
  -- publication-level configuration. Empty arrays mean no matching publication.
  'realtime', jsonb_build_object(
    'publications', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.pubname), '[]'::jsonb)
      from pg_publication p where p.pubname = 'supabase_realtime'
    ),
    'tables', (
      select coalesce(jsonb_agg(to_jsonb(p)
        order by p.pubname, p.schemaname, p.tablename), '[]'::jsonb)
      from pg_publication_tables p where p.pubname = 'supabase_realtime'
    )
  ),

  -- Original SELECT 9: sanitized volleyball snapshot. Read base tables directly;
  -- do not execute an application RPC whose deployed definition is under review.
  -- Keep tournament settings, teams, fixtures and all volleyball set scores.
  -- Replace player arrays/identifiers/names with per-team and total counts.
  'volleyball_snapshot', (
    select jsonb_build_object(
      'schemaVersion', t.schema_version,
      'revision', t.revision,
      'isDemo', t.is_demo,
      'manualRankings', t.manual_rankings,
      'tournament', jsonb_build_object(
        'id', t.id,
        'sport', coalesce(to_jsonb(t) ->> 'sport', 'volleyball'),
        'name', t.name,
        'startDate', coalesce(t.start_date::text, ''),
        'endDate', coalesce(t.end_date::text, ''),
        'status', t.status,
        'setRules', t.set_rules,
        'locations', t.locations
      ),
      'playerCount', (select count(*) from public.players p where p.tournament_id = t.id),
      'teams', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'name', x.name, 'group', x.group_name,
          'playerCount', (select count(*) from public.players p
            where p.tournament_id = x.tournament_id and p.team_id = x.id)
        ) order by x.display_order), '[]'::jsonb)
        from public.teams x where x.tournament_id = t.id
      ),
      'matches', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'number', m.number, 'stage', m.stage, 'group', m.group_name,
          'homeTeamId', m.home_team_id, 'awayTeamId', m.away_team_id,
          'winnerTeamId', m.winner_team_id,
          'scheduledAt', coalesce(to_char(m.scheduled_at at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI'), ''),
          'exampleDate', m.example_date, 'location', m.location, 'status', m.status,
          'rulesSnapshot', m.rules_snapshot, 'confirmedAt', m.confirmed_at,
          'updatedAt', m.result_updated_at,
          'sets', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'home', coalesce(to_jsonb(s.home_score), '""'::jsonb),
              'away', coalesce(to_jsonb(s.away_score), '""'::jsonb)
            ) order by s.set_number), '[]'::jsonb)
            from public.match_sets s
            where s.tournament_id = m.tournament_id and s.match_id = m.id
          )
        ) order by m.number), '[]'::jsonb)
        from public.matches m where m.tournament_id = t.id
      )
    )
    from public.tournaments t where t.id = 'volleyball-cup'
  )
) as preflight_export;
