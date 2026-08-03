-- ISSUE-151: children RLS tracer bullet.
-- Run as the existing non-superuser owner of public.children and public.profiles.
-- Apply only after the synthetic/staging preflight in ADR-0016.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = current_user
      AND rolcanlogin
      AND NOT rolsuper
      AND rolcreaterole
      AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'child_rls_preflight_schema_owner_role_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('children', 'profiles')
      AND owner.rolname = current_user
    GROUP BY owner.rolname
    HAVING count(*) = 2
  ) OR NOT has_schema_privilege(current_user, 'public', 'USAGE, CREATE') THEN
    RAISE EXCEPTION 'child_rls_preflight_schema_owner_required';
  END IF;

  IF NOT EXISTS (
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
    RAISE EXCEPTION 'child_rls_preflight_runtime_role_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member = (
      SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_runtime'
    )
      OR membership.roleid = (
        SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_runtime'
      )
  ) THEN
    RAISE EXCEPTION 'child_rls_preflight_runtime_membership_present';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.children AS child
    LEFT JOIN public.profiles AS profile ON profile.id = child.user_id
    WHERE profile.id IS NULL
  ) THEN
    RAISE EXCEPTION 'child_rls_preflight_orphan_owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'children'
      AND (relation.relrowsecurity OR relation.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'child_rls_preflight_already_enabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'children'
  ) THEN
    RAISE EXCEPTION 'child_rls_preflight_existing_policy';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'hana_child_owner') THEN
    RAISE EXCEPTION 'child_rls_preflight_role_already_exists';
  END IF;

  IF to_regprocedure('public.hana_current_user_id()') IS NOT NULL
    OR to_regprocedure('public.hana_child_access_status(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'child_rls_preflight_existing_function';
  END IF;
END
$$;

CREATE ROLE hana_child_owner
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOLOGIN
  NOREPLICATION
  NOBYPASSRLS;

GRANT hana_child_owner TO hana_child_runtime;
GRANT USAGE ON SCHEMA public TO hana_child_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.children TO hana_child_owner;

CREATE FUNCTION public.hana_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  raw_user_id text := current_setting('hana.current_user_id', true);
BEGIN
  IF raw_user_id IS NULL OR raw_user_id = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw_user_id::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.hana_current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hana_current_user_id() TO hana_child_owner;

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children FORCE ROW LEVEL SECURITY;

CREATE POLICY children_owner_scope
ON public.children
AS PERMISSIVE
FOR ALL
TO hana_child_owner
USING (user_id = public.hana_current_user_id())
WITH CHECK (user_id = public.hana_current_user_id());

CREATE FUNCTION public.hana_child_access_status(target_child_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.children AS child
      WHERE child.id = target_child_id
        AND child.deleted_at IS NULL
        AND child.user_id = public.hana_current_user_id()
    ) THEN 'owned'
    WHEN EXISTS (
      SELECT 1
      FROM public.children AS child
      WHERE child.id = target_child_id
        AND child.deleted_at IS NULL
    ) THEN 'foreign'
    ELSE 'missing'
  END
$$;

REVOKE ALL ON FUNCTION public.hana_child_access_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hana_child_access_status(uuid) TO hana_child_owner;

COMMIT;
