-- Only the verified NOVA developer account may read or manage submitted feedback.
revoke select, update on table public.nova_feedback from anon, authenticated;
grant select (ticket_code, feedback_type, description, include_diagnostics, diagnostics, status, created_at)
  on table public.nova_feedback to authenticated;
grant update (status) on table public.nova_feedback to authenticated;

create policy "NOVA developer can read feedback"
  on public.nova_feedback for select to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'egehanimat21@gmail.com');

create policy "NOVA developer can update feedback status"
  on public.nova_feedback for update to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'egehanimat21@gmail.com')
  with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'egehanimat21@gmail.com');
