-- Run as the existing postgres owner before migration.sql on an existing database.
-- This is a separately approved ownership handoff, not part of Prisma migrate deploy.
BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND rolsuper
  ) THEN
    RAISE EXCEPTION 'child_rls_handoff_postgres_owner_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'hana_migrator'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND rolcreaterole
      AND NOT rolreplication
      AND rolbypassrls
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'hana_child_runtime'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolinherit
      AND NOT rolreplication
      AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'child_rls_handoff_separated_roles_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('children', 'profiles')
      AND owner.rolname = 'postgres'
    GROUP BY owner.rolname
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'child_rls_handoff_existing_owner_mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_owner') THEN
    RAISE EXCEPTION 'child_rls_handoff_owner_role_already_exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'children'
      AND (relation.relrowsecurity OR relation.relforcerowsecurity)
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = 'children'
  ) THEN
    RAISE EXCEPTION 'child_rls_handoff_existing_rls_state';
  END IF;

  IF has_table_privilege('hana_migrator', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'child_rls_handoff_profile_grant_already_exists';
  END IF;
END
$$;

GRANT SELECT ON TABLE public.profiles TO hana_migrator;
ALTER TABLE public.children OWNER TO hana_migrator;

COMMIT;
