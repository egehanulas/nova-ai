-- Ensure Supabase API roles can access NOVA memories while RLS
-- continues to restrict authenticated users to their own rows.
-- Run after 003_nova_memories.sql and 004_nova_memory_sources.sql.

grant select, insert, update, delete
  on table public.nova_memories
  to authenticated;

grant all
  on table public.nova_memories
  to service_role;
