-- Run only after rollback.sql, using the same postgres owner connection as the handoff.
BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND rolsuper
  ) THEN
    RAISE EXCEPTION 'child_rls_handoff_rollback_postgres_owner_required';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_owner') THEN
    RAISE EXCEPTION 'child_rls_handoff_rollback_issue_role_present';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'children'
      AND owner.rolname = 'hana_migrator'
      AND NOT relation.relrowsecurity
      AND NOT relation.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'child_rls_handoff_rollback_state_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS privilege
    JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'profiles'
      AND relation.relacl IS NOT NULL
      AND grantee.rolname = 'hana_migrator'
      AND privilege.privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'child_rls_handoff_rollback_profile_grant_missing';
  END IF;
END
$$;

ALTER TABLE public.children OWNER TO postgres;
REVOKE SELECT ON TABLE public.profiles FROM hana_migrator;

COMMIT;
