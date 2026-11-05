-- Move NOVA feedback developer access to the verified account requested by the project owner.
create or replace function public.is_nova_feedback_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as users
    where users.id = (select auth.uid())
      and lower(coalesce(users.email, '')) = 'egehan1907cl@gmail.com'
      and users.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_nova_feedback_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_nova_feedback_admin() to authenticated;
