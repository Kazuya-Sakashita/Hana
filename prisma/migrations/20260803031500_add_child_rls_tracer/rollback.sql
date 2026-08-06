-- Apply as the unchanged schema owner only under the ISSUE-180 recovery runbook.
-- A successful Prisma migration remains applied in _prisma_migrations after this SQL.
-- prisma migrate deploy will not reapply it; production rollback requires a new
-- compensating forward migration and separate human approval.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.hana_child_access_status(uuid) FROM hana_child_owner;
DROP FUNCTION public.hana_child_access_status(uuid);

DROP POLICY children_owner_scope ON public.children;
ALTER TABLE public.children NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.children DISABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.hana_current_user_id() FROM hana_child_owner;
DROP FUNCTION public.hana_current_user_id();

REVOKE ALL ON TABLE public.children FROM hana_child_owner;
REVOKE USAGE ON SCHEMA public FROM hana_child_owner;
REVOKE hana_child_owner FROM hana_child_runtime;
DROP ROLE hana_child_owner;

COMMIT;
