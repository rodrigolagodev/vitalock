-- ============================================================
-- Drop public.resolve_login_email: login is email + password only.
-- ============================================================
-- PROBLEM — 20260912120000 added resolve_login_email(text), a SECURITY
--   DEFINER function executable by anon, so the login form could turn a staff
--   username into its auth email before signing in. Anyone holding the public
--   anon key could therefore enumerate usernames and harvest staff emails.
--
-- FIX — both apps sign in with email + password again (supabase-js
--   signInWithPassword, no pre-auth lookup), so the function has no caller and
--   is dropped. identity.staff.username is KEPT (display handle in the user
--   menu and the admin Personal screens); only its column comment is updated.
--
-- ROLLBACK — re-run the resolve_login_email section of 20260912120000.
-- ============================================================

drop function if exists public.resolve_login_email(text);

comment on column identity.staff.username is
  'Staff display handle (user menu, Personal screens). Not a login identifier: login is email + password. Lowercase, 3-32 chars, [a-z0-9._-], globally unique.';

notify pgrst, 'reload schema';
