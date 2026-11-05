revoke insert on table public.nova_feedback from authenticated;
grant insert (ticket_code, user_id, feedback_type, description, include_diagnostics, diagnostics)
  on table public.nova_feedback to authenticated;
