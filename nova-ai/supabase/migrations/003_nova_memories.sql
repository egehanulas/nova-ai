-- NOVA AI persistent user memory
-- Run this once in Supabase SQL Editor.

create table if not exists public.nova_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  category text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nova_memories_user_updated_idx
  on public.nova_memories (user_id, updated_at desc);

alter table public.nova_memories enable row level security;

drop policy if exists "Users can read their own NOVA memories" on public.nova_memories;
create policy "Users can read their own NOVA memories"
  on public.nova_memories for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own NOVA memories" on public.nova_memories;
create policy "Users can add their own NOVA memories"
  on public.nova_memories for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own NOVA memories" on public.nova_memories;
create policy "Users can update their own NOVA memories"
  on public.nova_memories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own NOVA memories" on public.nova_memories;
create policy "Users can delete their own NOVA memories"
  on public.nova_memories for delete
  using (auth.uid() = user_id);
