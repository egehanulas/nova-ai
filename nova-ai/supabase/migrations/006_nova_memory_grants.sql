-- Ensure NOVA memory access is limited to signed-in users and trusted server code.
-- RLS remains enabled and each user can only access rows where auth.uid() = user_id.
-- Run after 003_nova_memories.sql and 004_nova_memory_sources.sql.

-- Anonymous clients do not need direct access to private user memories.
revoke all
  on table public.nova_memories
  from anon;

-- Restrict every row policy to authenticated sessions; ownership checks remain intact.
alter policy "Users can add their own NOVA memories"
  on public.nova_memories to authenticated;
alter policy "Users can read their own NOVA memories"
  on public.nova_memories to authenticated;
alter policy "Users can update their own NOVA memories"
  on public.nova_memories to authenticated;
alter policy "Users can delete their own NOVA memories"
  on public.nova_memories to authenticated;

-- Browser clients use the publishable key plus the user's authenticated session.
grant select, insert, update, delete
  on table public.nova_memories
  to authenticated;

-- Trusted server-side routes use the service role and bypass RLS by design.
grant select, insert, update, delete
  on table public.nova_memories
  to service_role;
