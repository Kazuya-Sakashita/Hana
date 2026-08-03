-- Apply only after rolling the application back to the pre-ISSUE-151 revision.
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
REVOKE hana_child_owner FROM CURRENT_USER;
DROP ROLE hana_child_owner;

COMMIT;

