-- Verify the developer account against auth.users instead of assuming that email_confirmed_at is present in JWT claims.
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
      and lower(coalesce(users.email, '')) = 'egehanimat21@gmail.com'
      and users.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_nova_feedback_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_nova_feedback_admin() to authenticated;

drop policy if exists "NOVA developer can read feedback" on public.nova_feedback;
drop policy if exists "NOVA developer can update feedback status" on public.nova_feedback;

create policy "NOVA developer can read feedback"
  on public.nova_feedback for select to authenticated
  using (public.is_nova_feedback_admin());

create policy "NOVA developer can update feedback status"
  on public.nova_feedback for update to authenticated
  using (public.is_nova_feedback_admin())
  with check (public.is_nova_feedback_admin());
