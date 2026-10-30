-- NOVA AI — Unreal Engine 5.8 knowledge base
-- Run this once in Supabase Dashboard > SQL Editor.
-- Existing conversations and storage objects are intentionally untouched.

create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in ('official_docs', 'community', 'github', 'other')),
  base_url text not null,
  trust_level smallint not null default 3 check (trust_level between 1 and 5),
  license text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.knowledge_sources(id) on delete set null,
  external_id text,
  title text not null,
  canonical_url text not null,
  engine_version text,
  category text,
  topic text,
  content_hash text not null,
  source_updated_at timestamptz,
  last_ingested_at timestamptz not null default now(),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_url, content_hash)
);

create table if not exists public.knowledge_chunks (
  id bigserial primary key,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer,
  embedding extensions.vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.knowledge_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.knowledge_sources(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  documents_seen integer not null default 0,
  chunks_written integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_documents_status_version_idx
  on public.knowledge_documents(status, engine_version);
create index if not exists knowledge_documents_source_idx
  on public.knowledge_documents(source_id);
create index if not exists knowledge_chunks_document_idx
  on public.knowledge_chunks(document_id, chunk_index);

-- Cosine-distance index. For very small initial datasets PostgreSQL may use a
-- sequential scan; this is expected and correct.
create index if not exists knowledge_chunks_embedding_cosine_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_ingestion_jobs enable row level security;

-- Authenticated NOVA users can read published knowledge. No client-side writes.
drop policy if exists "Authenticated users can read knowledge sources" on public.knowledge_sources;
create policy "Authenticated users can read knowledge sources"
  on public.knowledge_sources for select to authenticated using (enabled = true);

drop policy if exists "Authenticated users can read published knowledge documents" on public.knowledge_documents;
create policy "Authenticated users can read published knowledge documents"
  on public.knowledge_documents for select to authenticated using (status = 'published');

drop policy if exists "Authenticated users can read published knowledge chunks" on public.knowledge_chunks;
create policy "Authenticated users can read published knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using (
    exists (
      select 1 from public.knowledge_documents d
      where d.id = knowledge_chunks.document_id and d.status = 'published'
    )
  );

-- Ingestion jobs are private to service_role; service_role bypasses RLS.
revoke all on public.knowledge_ingestion_jobs from anon, authenticated;
grant select on public.knowledge_sources, public.knowledge_documents, public.knowledge_chunks to authenticated;
grant all on public.knowledge_sources, public.knowledge_documents, public.knowledge_chunks, public.knowledge_ingestion_jobs to service_role;

create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 6,
  filter_engine_version text default '5.8'
)
returns table (
  chunk_id bigint,
  document_id uuid,
  title text,
  canonical_url text,
  source_type text,
  trust_level smallint,
  engine_version text,
  category text,
  topic text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    d.id,
    d.title,
    d.canonical_url,
    s.source_type,
    coalesce(s.trust_level, 3)::smallint,
    d.engine_version,
    d.category,
    d.topic,
    c.content,
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  left join public.knowledge_sources s on s.id = d.source_id
  where d.status = 'published'
    and (filter_engine_version is null or d.engine_version is null or d.engine_version = filter_engine_version)
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 6), 12));
$$;

revoke all on function public.match_knowledge_chunks(extensions.vector, integer, text) from public, anon;
grant execute on function public.match_knowledge_chunks(extensions.vector, integer, text) to authenticated;

comment on table public.knowledge_sources is 'Trusted source registry for NOVA Unreal Engine RAG.';
comment on table public.knowledge_documents is 'Versioned source documents ingested into NOVA knowledge base.';
comment on table public.knowledge_chunks is 'Text chunks with OpenAI text-embedding-3-small vectors (1536 dimensions).';
comment on function public.match_knowledge_chunks(extensions.vector, integer, text) is 'Authenticated cosine-similarity search over published knowledge chunks.';
