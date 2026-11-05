create table public.nova_feedback (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('bug', 'feature', 'performance', 'general')),
  description text not null check (char_length(description) between 10 and 4000),
  include_diagnostics boolean not null default false,
  diagnostics jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'reviewing', 'fixed', 'closed')),
  created_at timestamptz not null default now()
);

create index nova_feedback_created_at_idx on public.nova_feedback (created_at desc);
create index nova_feedback_status_created_at_idx on public.nova_feedback (status, created_at desc);

alter table public.nova_feedback enable row level security;
grant insert on table public.nova_feedback to authenticated;

create policy "Signed-in users can submit their own NOVA feedback"
  on public.nova_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);
