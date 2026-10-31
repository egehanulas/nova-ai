-- NOVA AI: distinguish memories learned by NOVA from user-created notes.
-- Run once in Supabase SQL Editor after migration 003.

alter table public.nova_memories
  add column if not exists source text not null default 'user';

alter table public.nova_memories
  drop constraint if exists nova_memories_source_check;

alter table public.nova_memories
  add constraint nova_memories_source_check
  check (source in ('user', 'nova'));

create index if not exists nova_memories_user_category_idx
  on public.nova_memories (user_id, category);
