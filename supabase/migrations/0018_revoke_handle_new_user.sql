-- Security (Supabase advisor): handle_new_user() is a SECURITY DEFINER trigger
-- that fires on auth.users insert. It was also EXECUTE-able via the REST RPC
-- endpoint by anon/authenticated. The trigger still runs regardless of these
-- grants, so revoke public RPC access.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
